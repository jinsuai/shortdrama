// OpenAI 兼容通用客户端：一套封装覆盖 文本 / 图片 / 视频 / 配音 / 音乐。
// 所有函数都从「调用方传入的 config」而非全局读取，便于测试与多账号。
//
// config 形状：{ baseUrl, apiKey, model, endpoint?, pollPath? }
//   - baseUrl：厂商兼容接口基地址（不含结尾 /），如 https://api.openai.com/v1
//   - apiKey：Bearer Token
//   - model：模型名
//   - endpoint：覆盖默认路径（视频/音乐等非标准模态用），可为相对路径或完整 URL
//   - pollPath：任务型接口（先返回 id 再轮询）的轮询路径，{id} 会被替换

const DEFAULT_BASE = 'https://api.openai.com/v1';

function resolveBase(baseUrl) {
  return (baseUrl && baseUrl.trim()) || DEFAULT_BASE;
}

export function resolveUrl(baseUrl, endpoint, defaultEndpoint) {
  const base = resolveBase(baseUrl).replace(/\/$/, '');
  const ep = (endpoint && endpoint.trim()) || defaultEndpoint || '';
  if (/^https?:\/\//i.test(ep)) return ep; // 完整 URL 直接用
  return base + (ep.startsWith('/') ? ep : '/' + ep);
}

/**
 * 鉴权头。默认 Bearer（OpenAI 及绝大多数兼容服务）；
 * authScheme='raw' 时原样发送 Token —— 例如 AutoDL 的 ComfyUI 工作流 API
 * 明确要求 `Authorization: <token>`，加 Bearer 反而 401。
 */
export function authHeaders(apiKey, authScheme = 'bearer') {
  const h = { 'Content-Type': 'application/json' };
  if (apiKey && apiKey.trim()) {
    const v = apiKey.trim();
    h['Authorization'] = String(authScheme).toLowerCase() === 'raw' ? v : 'Bearer ' + v;
  }
  return h;
}

/**
 * 把厂商返回的错误转成可读中文提示。
 * 重点覆盖高频配置错误：模型名不可用 / 鉴权失败 / 限流，而不是抛一坨原始 JSON。
 */
function formatApiError(label, status, rawText) {
  const text = String(rawText || '');
  let msg = '';
  let code = '';
  try {
    const j = JSON.parse(text);
    code = j?.error?.code || j?.code || '';
    msg = j?.error?.message || j?.message || '';
  } catch { /* 非 JSON，保留原文 */ }
  const probe = msg || text;
  if (code === 'model_not_found' || /model_not_found|不支持模型|模型不存在|model.*(not found|does not exist)|not supported/i.test(probe)) {
    return `${label}模型不可用：${msg || '当前 Key 不支持该模型'}。请在「设置 → 模型配置」改用该服务商提供的可用模型名。`;
  }
  // 🔴 顺序要紧：额度不足 / 未实名 常常也用 403 返回，若先走「鉴权失败」分支，
  //    用户会跑去反复检查 Key，而真正原因是没钱或没认证。所以这几类先判。
  if (code === 'insufficient_user_quota' || /insufficient_user_quota|余额|额度|预扣|quota.*(exceed|insufficient)|insufficient.*quota/i.test(probe)) {
    return `${label}额度不足 (${status})：${probe.slice(0, 200)}。请到服务商控制台充值或提升配额后重试（这不是 Key 写错）。`;
  }
  if (/实名|认证|certif|verif/i.test(probe)) {
    return `${label}受限 (${status})：${probe.slice(0, 200)}。通常需要完成服务商的实名/认证才能提高并发或频率（RPM）。`;
  }
  // 队列满：服务商侧并发池被占满，与本地配置无关，属于「等待即可恢复」的临时状态。
  if (code === 'video_queue_full' || /queue[_ ]?full|队列已满|队列满|系统繁忙|server is busy/i.test(probe)) {
    return `${label}队列已满 (${status})：${probe.slice(0, 200)}。这是服务商侧的并发/排队限制，不是本地配置错误；可稍后重试，或改用并发额度更高的服务。`;
  }
  if (status === 401 || status === 403) {
    return `${label}鉴权失败 (${status})：API Key 无效或无权限，请检查 Key 是否正确、是否属于当前分组。`;
  }
  if (status === 429) {
    return `${label}请求过于频繁 (429)：已触发限流，请降低并发或稍后重试。`;
  }
  return `${label}调用失败 (${status}): ${probe.slice(0, 400)}`;
}

/**
 * 提交阶段的「排队满/限流」属于临时状态，直接判失败会把整镜打成失败，
 * 用户看到的就是「一直是队列已满」。这里做指数退避重试，期间通过 onProgress
 * 回报 "retry" 事件，让 UI 能显示「等待上游空位」而不是静默卡住。
 *
 * 不重试的情况（重试也没用，只是浪费用户时间）：
 *   - 额度不足 / 未实名 / 无权限（403、401，或文案命中）
 *   - 参数错误（4xx 且非 429）
 */
const RETRYABLE_STATUS = (s) => s === 429 || s === 503 || s === 502 || s === 504;
const NON_RETRYABLE_TEXT = /实名|认证|额度|余额|quota|无权限|unauthorized|invalid_request|参数|不能为空|禁止字段|无效/i;

function parseErrBrief(rawText) {
  const t = String(rawText || '');
  try {
    const j = JSON.parse(t);
    return j?.error?.message || j?.message || t.slice(0, 200);
  } catch { return t.slice(0, 200); }
}

function sleepWithSignal(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('已取消'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener?.('abort', () => {
      clearTimeout(t);
      reject(new Error('已取消'));
    }, { once: true });
  });
}

/** 宽口径深找媒体地址，兼容 url / video_url / output_url / result_url / data[].url 等 */
export function deepFindUrl(obj, depth = 0) {
  if (!obj || depth > 6) return '';
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'number') return String(obj);
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const hit = deepFindUrl(v, depth + 1);
      if (hit) return hit;
    }
    return '';
  }
  if (typeof obj === 'object') {
    for (const k of ['url', 'video_url', 'output_url', 'result_url', 'file', 'download_url']) {
      if (obj[k] && typeof obj[k] === 'string' && obj[k].startsWith('http')) return obj[k];
    }
    for (const v of Object.values(obj)) {
      const hit = deepFindUrl(v, depth + 1);
      if (hit) return hit;
    }
  }
  return '';
}

/** 文本对话：返回助手回复文本 */
export async function callChat({ baseUrl, apiKey, model, messages, temperature = 0.7, maxTokens = 1200, signal, authScheme, extra = null } = {}) {
  const url = resolveUrl(baseUrl, '/chat/completions', '/chat/completions');
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(apiKey, authScheme),
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, ...(extra && typeof extra === 'object' ? extra : {}) }),
    signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(formatApiError('文本模型', res.status, t));
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

/** 图片生成：返回图片地址数组（url 或 data: 内联） */
export async function callImage({
  baseUrl, apiKey, model, prompt, size = '1024x1024', n = 1, extra = {},
  endpoint, signal, authScheme, sendModel = true,
} = {}) {
  // endpoint 允许覆盖默认路径：图生图模型常不在 /images/generations 上（如 /images/edits 或厂商自定义）。
  // 留空则回落到默认 /images/generations。
  const url = resolveUrl(baseUrl, endpoint, '/images/generations');
  // 工作流型 / 非标准服务可能根本不接受 model 字段（传了反而 400），故可关闭。
  const body = { ...(sendModel && model ? { model } : {}), prompt, size, n, ...extra };
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(apiKey, authScheme),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(formatApiError('图片模型', res.status, t));
  }
  const data = await res.json();
  const items = data?.data || [];
  const urls = items
    .map((it) => it?.url || (it?.b64_json ? `data:image/png;base64,${it.b64_json}` : ''))
    .filter(Boolean);
  // 有些服务不返回 data[]，而是把地址放在别的层级（工作流型常见），兜一层深找。
  if (!urls.length) {
    const hit = deepFindUrl(data);
    if (hit) return [hit];
  }
  return urls;
}

/** 视频 / 音乐等媒体生成：支持「立即返回地址」与「任务型轮询」两种形态 */
export async function callMedia({
  baseUrl, apiKey, model, endpoint, pollPath = '', payload = {},
  timeoutMs = 600000, onProgress, signal,
  retries = 5, retryBaseMs = 8000, authScheme, sendModel = true,
} = {}) {
  const url = resolveUrl(baseUrl, endpoint, '/video/generations');
  const body = JSON.stringify({ ...(sendModel && model ? { model } : {}), ...payload });

  // 提交（含排队满/限流的退避重试）
  let data = null;
  let attempt = 0;
  for (;;) {
    const res = await fetch(url, { method: 'POST', headers: authHeaders(apiKey, authScheme), body, signal });
    if (res.ok) {
      data = await res.json();
      break;
    }
    const t = await res.text().catch(() => '');
    const retryable = RETRYABLE_STATUS(res.status) && !NON_RETRYABLE_TEXT.test(parseErrBrief(t));
    if (retryable && attempt < retries) {
      const wait = Math.min(retryBaseMs * (2 ** attempt), 60000);
      attempt += 1;
      // UI 侧据此把队列条目显示成「等待上游空位（重试 n/m）」，而不是一直"生成中"
      onProgress?.('retry', {
        attempt, max: retries, waitMs: wait, status: res.status, reason: parseErrBrief(t),
      });
      await sleepWithSignal(wait, signal);
      continue;
    }
    throw new Error(formatApiError('媒体模型', res.status, t));
  }

  // 形态一：直接给了地址
  const direct = deepFindUrl(data);
  if (direct) return { resultUrl: direct, raw: data };

  // 形态二：任务型（返回 id，需要轮询）
  // 任务 id 字段名各家不一：Agnes 用 video_id，OpenAI/Kling/Runway 用 id / task_id / taskId。
  // 全部兼容，避免「换个模型就改一次代码」。
  const taskId = data?.video_id || data?.id || data?.task_id || data?.taskId;
  if (taskId && pollPath) {
    const base = resolveBase(baseUrl).replace(/\/$/, '');
    const ep = pollPath.replace('{id}', encodeURIComponent(taskId));
    const pollUrl = /^https?:\/\//i.test(ep) ? ep : base + (ep.startsWith('/') ? ep : '/' + ep);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));
      if (signal?.aborted) throw new Error('已取消');
      const pr = await fetch(pollUrl, { headers: authHeaders(apiKey, authScheme), signal });
      if (!pr.ok) continue;
      const pd = await pr.json();
      const status = pd?.status || pd?.task_status || '';
      onProgress?.(status, pd);
      if (/succeeded|completed|success/i.test(status)) {
        // 工作流型服务（AutoDL 等）常在 results 里混着预览/中间产物，
        // 优先挑 output_type=output 的正式结果，挑不到再退回深找。
        const formal = (pd?.results || pd?.data?.results || [])
          .find((r) => !r?.output_type || r.output_type === 'output');
        const picked = formal?.url || deepFindUrl(pd);
        if (picked) return { resultUrl: picked, raw: pd };
      }
      if (/failed|canceled|error/i.test(status)) {
        throw new Error(`媒体生成失败: ${pd?.message || pd?.error || status}`);
      }
    }
    throw new Error('媒体生成轮询超时');
  }
  throw new Error('媒体模型未返回可识别的结果地址（请检查 endpoint / pollPath 配置）');
}

/** 配音（OpenAI 兼容 TTS）：返回音频 blob URL */
export async function callTTS({ baseUrl, apiKey, model, input, voice = 'default', extra = {}, signal, authScheme, sendModel = true } = {}) {
  const url = resolveUrl(baseUrl, '/audio/speech', '/audio/speech');
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(apiKey, authScheme),
    body: JSON.stringify({ ...(sendModel && model ? { model } : {}), input, voice, ...extra }),
    signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(formatApiError('配音模型', res.status, t));
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
