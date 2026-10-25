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

function resolveUrl(baseUrl, endpoint, defaultEndpoint) {
  const base = resolveBase(baseUrl).replace(/\/$/, '');
  const ep = (endpoint && endpoint.trim()) || defaultEndpoint || '';
  if (/^https?:\/\//i.test(ep)) return ep; // 完整 URL 直接用
  return base + (ep.startsWith('/') ? ep : '/' + ep);
}

function authHeaders(apiKey) {
  const h = { 'Content-Type': 'application/json' };
  if (apiKey && apiKey.trim()) h['Authorization'] = 'Bearer ' + apiKey.trim();
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
  if (status === 401 || status === 403) {
    return `${label}鉴权失败 (${status})：API Key 无效或无权限，请检查 Key 是否正确、是否属于当前分组。`;
  }
  if (status === 429) {
    return `${label}请求过于频繁 (429)：已触发限流，请降低并发或稍后重试。`;
  }
  return `${label}调用失败 (${status}): ${probe.slice(0, 400)}`;
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
export async function callChat({ baseUrl, apiKey, model, messages, temperature = 0.7, maxTokens = 1200, signal } = {}) {
  const url = resolveUrl(baseUrl, '/chat/completions', '/chat/completions');
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
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
export async function callImage({ baseUrl, apiKey, model, prompt, size = '1024x1024', n = 1, extra = {}, signal } = {}) {
  const url = resolveUrl(baseUrl, '/images/generations', '/images/generations');
  const body = { model, prompt, size, n, ...extra };
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(formatApiError('图片模型', res.status, t));
  }
  const data = await res.json();
  const items = data?.data || [];
  return items
    .map((it) => it?.url || (it?.b64_json ? `data:image/png;base64,${it.b64_json}` : ''))
    .filter(Boolean);
}

/** 视频 / 音乐等媒体生成：支持「立即返回地址」与「任务型轮询」两种形态 */
export async function callMedia({ baseUrl, apiKey, model, endpoint, pollPath = '', payload = {}, timeoutMs = 600000, onProgress, signal } = {}) {
  const url = resolveUrl(baseUrl, endpoint, '/video/generations');
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ model, ...payload }),
    signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(formatApiError('媒体模型', res.status, t));
  }
  const data = await res.json();

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
      const pr = await fetch(pollUrl, { headers: authHeaders(apiKey), signal });
      if (!pr.ok) continue;
      const pd = await pr.json();
      const status = pd?.status || pd?.task_status || '';
      onProgress?.(status, pd);
      if (/succeeded|completed|success/i.test(status)) {
        return { resultUrl: deepFindUrl(pd), raw: pd };
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
export async function callTTS({ baseUrl, apiKey, model, input, voice = 'default', extra = {}, signal } = {}) {
  const url = resolveUrl(baseUrl, '/audio/speech', '/audio/speech');
  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ model, input, voice, ...extra }),
    signal,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(formatApiError('配音模型', res.status, t));
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
