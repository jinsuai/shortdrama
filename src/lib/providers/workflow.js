// 工作流型 provider：对接「把 ComfyUI 工作流包装成异步 API」的服务（AutoDL.art、RunningHub、
// 自建 ComfyUI-on-API 等都属于这一类）。
//
// 与 OpenAI 兼容协议的区别：
//   OpenAI 兼容  → 一个 endpoint 吃 {model, prompt, ...}，字段名由协议定死；
//   工作流型     → 每条工作流有自己的字段集，且平台会用 input_rules 把「要什么」自描述出来。
//
// 因此这里的核心不是适配某一家，而是：
//   拉取工作流列表 → 读它的 input_rules → 按「字段类型 + 名称语义」把我们的标准素材映射过去
// 换平台、换工作流都不需要改代码；字段名一个都不写死。

import { authHeaders, resolveUrl, deepFindUrl } from './openai.js';

/**
 * 工作流平台的标准路径模板。{id} = 工作流 id，{task} = 任务 id。
 * AutoDL 实测可用；其它平台若路径不同，在设置「高级」里覆盖即可。
 */
export const DEFAULT_WORKFLOW_PATHS = {
  list: '/comfyui/workflows',
  detail: '/comfyui/workflows/{id}',
  submit: '/comfyui/comfyui_workflow/{id}',
  result: '/comfyui/comfyui_workflow/result/{task}',
  listMethod: 'POST',
};

/** 工作流元信息缓存：避免每次生成都去拉一次 input_rules */
const RULES_KEY = 'WORKFLOW_RULES';

function cacheKey(baseUrl, id) {
  return `${String(baseUrl || '').replace(/\/$/, '')}::${id}`;
}

export function readRulesCache(baseUrl, id) {
  try {
    const all = JSON.parse(localStorage.getItem(RULES_KEY) || '{}');
    return all[cacheKey(baseUrl, id)] || null;
  } catch {
    return null;
  }
}

export function writeRulesCache(baseUrl, id, rules, name) {
  try {
    const all = JSON.parse(localStorage.getItem(RULES_KEY) || '{}');
    all[cacheKey(baseUrl, id)] = { rules, name, at: Date.now() };
    localStorage.setItem(RULES_KEY, JSON.stringify(all));
  } catch { /* 存储不可用时忽略，退化成每次现拉 */ }
}

function wfHeaders(cfg) {
  return authHeaders(cfg?.apiKey, cfg?.authScheme);
}

function wfUrl(cfg, path, vars) {
  const p = String(path || '').replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(vars?.[k] ?? ''));
  return resolveUrl(cfg?.baseUrl, p, '');
}

async function readErr(res) {
  const t = await res.text().catch(() => '');
  let msg = t;
  try {
    const j = JSON.parse(t);
    msg = j?.error?.message || j?.message || j?.msg || t;
  } catch { /* 非 JSON，保留原文 */ }
  return String(msg || '').slice(0, 300);
}

/** 拉取该平台上的工作流列表（用于设置页点选，不让用户手填 id） */
export async function listWorkflows(cfg, { signal } = {}) {
  const paths = cfg?.workflowPaths || DEFAULT_WORKFLOW_PATHS;
  const url = wfUrl(cfg, paths.list);
  const init = { method: paths.listMethod || 'POST', headers: wfHeaders(cfg), signal };
  if ((paths.listMethod || 'POST').toUpperCase() === 'POST') {
    init.body = JSON.stringify({ page_size: 100, page_index: 1 });
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`拉取工作流列表失败 (${res.status})：${await readErr(res)}。请检查 Base URL 与 API Key（AutoDL 的 Token 需在「令牌管理」里选 ComfyUI 分组）。`);
  }
  const data = await res.json();
  const list = data?.data?.list || data?.data || [];
  return (Array.isArray(list) ? list : [])
    .map((w) => ({
      id: w?.uuid || w?.id || w?.workflow_id || '',
      name: w?.name || w?.title || w?.uuid || '(未命名)',
      desc: w?.description || '',
      price: w?.price ?? null,
    }))
    .filter((w) => w.id);
}

/** 拉取某条工作流的入参规范（input_rules） */
export async function fetchWorkflowRules(cfg, id, { signal } = {}) {
  const paths = cfg?.workflowPaths || DEFAULT_WORKFLOW_PATHS;
  const res = await fetch(wfUrl(cfg, paths.detail, { id }), {
    method: 'GET', headers: wfHeaders(cfg), signal,
  });
  if (!res.ok) {
    throw new Error(`读取工作流参数失败 (${res.status})：${await readErr(res)}`);
  }
  const data = await res.json();
  const d = data?.data || data;
  const meta = {
    id,
    name: d?.name || id,
    rules: d?.input_rules || {},
  };
  writeRulesCache(cfg?.baseUrl, id, meta.rules, meta.name);
  return meta;
}

/** 优先读缓存，没有再联网拉一次 */
export async function getWorkflowRules(cfg, id, { signal } = {}) {
  const cached = readRulesCache(cfg?.baseUrl, id);
  if (cached?.rules && Object.keys(cached.rules).length) {
    return { id, name: cached.name || id, rules: cached.rules };
  }
  return fetchWorkflowRules(cfg, id, { signal });
}

// ---------------------------------------------------------------------------
// 字段分类：把工作流的每个字段认成「我们这边的哪一类素材」
// 只靠两样东西：平台给的 type（image/audio/video/prompt/enum/integer…）+ 字段名关键词。
// 认不出来的进 other，绝不瞎填 —— 让服务端用自己的默认值。
// ---------------------------------------------------------------------------

function classify(name, rule) {
  const n = String(name || '').toLowerCase();
  const t = String(rule?.type || '').toLowerCase();
  if (t === 'image') {
    if (/(first|start|begin|首帧|起始)/.test(n)) return 'first_frame';
    if (/(last|end|tail|尾帧|结束)/.test(n)) return 'last_frame';
    return 'images';
  }
  if (t === 'audio') return 'audios';
  if (t === 'video') return 'videos';
  if (t === 'prompt') return 'prompt';
  if (t === 'enum' && /(resolution|ratio|size|aspect|尺寸|分辨率|画幅)/.test(n)) return 'ratio';
  if (t === 'integer' || t === 'number') {
    if (/(duration|seconds|length|时长|秒)/.test(n)) return 'seconds';
    return 'number';
  }
  if (t === 'string') {
    if (/(negative|负向)/.test(n)) return 'negative';
    if (/(prompt|text|caption|description|positive|提示|文案|台词|内容)/.test(n)) return 'prompt';
    return 'string';
  }
  if (t === 'boolean') return 'boolean';
  return 'other';
}

/** 字段类型 → 人话（给设置页显示「这个工作流需要什么」，不暴露字段名） */
const TYPE_LABEL = {
  prompt: '提示词', image: '参考图', audio: '参考音频', video: '参考视频',
  integer: '数值', number: '数值', string: '文本', enum: '选项', boolean: '开关',
};
function humanLabel(name, rule) {
  const k = classify(name, rule);
  if (k === 'first_frame') return '首帧图';
  if (k === 'last_frame') return '尾帧图';
  if (k === 'seconds') return '时长';
  if (k === 'ratio') return '分辨率';
  return TYPE_LABEL[String(rule?.type || '').toLowerCase()] || '参数';
}

/** 给 UI 用：这条工作流需要哪些东西（只说类型，不说字段名） */
export function describeRules(rules) {
  const items = Object.entries(rules || {}).map(([name, rule]) => ({
    name,
    type: String(rule?.type || 'string'),
    required: !!rule?.required,
    label: humanLabel(name, rule),
    default: rule?.default,
    options: Array.isArray(rule?.options) ? rule.options.map((o) => o?.label || o?.value || o) : null,
  }));
  const summary = [];
  const byLabel = {};
  items.forEach((it) => { byLabel[it.label] = (byLabel[it.label] || 0) + 1; });
  Object.entries(byLabel).forEach(([label, n]) => {
    const req = items.some((it) => it.label === label && it.required);
    summary.push({ label, count: n, required: req });
  });
  return { items, summary };
}

/** 数值字段按 min/max 夹紧，类型要求整数就取整 */
function fitNumber(v, rule) {
  let n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (String(rule?.type).toLowerCase() === 'integer') n = Math.round(n);
  if (rule?.min != null) n = Math.max(Number(rule.min), n);
  if (rule?.max != null) n = Math.min(Number(rule.max), n);
  return n;
}

/**
 * 在枚举选项里挑一个跟我们要的画幅匹配的（9:16 竖屏 / 16:9 横屏 / 1:1 方屏）。
 *
 * 🔴 两个坑，都是实测出来的：
 *   ① 同类选项常按「低档→高档」排列（480p竖、768p竖、960p竖），只按方向取第一个
 *      会一路挑到最低画质 —— 所以默认值也符合画幅时优先用默认值。
 *   ② 不能写成「不是竖屏就当横屏」：1:1 方屏会被误判成横屏。必须竖/横各自显式识别，
 *      方屏优先找带「方/square/1:1」的选项，找不到就当作没指定方向，用平台默认值。
 */
function pickEnumOption(rule, ratio) {
  const opts = Array.isArray(rule?.options) ? rule.options : [];
  if (!opts.length) return rule?.default ?? null;
  const labels = opts.map((o) => o?.label ?? o?.value ?? o);
  const want = String(ratio || '');
  const isPortrait = /9:16|竖|portrait|vertical/i.test(want);
  const isLandscape = /16:9|横|landscape|horizontal/i.test(want);
  const isSquare = /1:1|方|square/i.test(want);
  const fits = (l) => {
    const s = String(l || '');
    if (isSquare) return /方|square|1:1/i.test(s);          // 方屏：只认方屏选项
    if (isPortrait) return /竖|portrait|vertical/i.test(s);
    if (isLandscape) return /横|landscape|horizontal/i.test(s);
    return true;                                             // 没指定方向 → 都算匹配，交给默认值
  };
  const def = rule?.default;
  // 方屏：平台没有方屏选项时不要硬套横屏，退回平台默认（通常就是竖屏）
  if (isSquare && !labels.some(fits) && def != null) return def;
  const matching = labels.filter(fits);
  if (!matching.length) return def ?? null;
  if (def != null && matching.some((l) => String(l) === String(def))) return def;

  // 默认值不符合画幅时（如默认 768p竖、我们要横屏），按默认所在的**档位**挑同档，
  // 而不是取第一个匹配项 —— 否则横屏会一路掉到 480p 这种最低画质。
  const dm = /^(\d+p|\d+\*\d+)/.exec(String(def || ''));
  if (dm) {
    const t = dm[1];
    const rev = t.includes('*') ? t.split('*').reverse().join('*') : t;
    const hit = matching.find((l) => {
      const s = String(l);
      return s.startsWith(t) || s.startsWith(rev);
    });
    if (hit) return hit;
  }
  // 彻底认不出档位时取中间档，比取最低档稳妥
  return matching[Math.floor(matching.length / 2)] ?? def ?? null;
}

/**
 * 把我们的标准素材映射到这条工作流的字段上。
 * std 形状（与 generateVideo / generateImage / generateTTS 的入参对齐）：
 *   { prompt, negative, images[], audios[], first_frame, last_frame, seconds, ratio, text }
 * 返回 { payload, missing, used }：missing 是「工作流必填但我们没有的素材」，
 * 交给上层翻译成人话报错，而不是硬着头皮发一个必然失败的请求。
 */
export function mapInputs(rules, std = {}, extra = {}) {
  const entries = Object.entries(rules || {});
  const buckets = {};
  entries.forEach(([name, rule]) => {
    const k = classify(name, rule);
    (buckets[k] = buckets[k] || []).push(name);
  });

  const payload = {};
  const used = [];
  const filled = new Set();
  const imgQueue = [...(std.images || []), ...(std.referenceImages || [])].filter(Boolean);
  const audQueue = [...(std.audios || [])].filter(Boolean);
  const vidQueue = [...(std.videos || [])].filter(Boolean);
  const text = std.prompt ?? std.text ?? '';

  const put = (name, value, rule) => {
    if (value === undefined || value === null || value === '') return false;
    payload[name] = value;
    filled.add(name);
    used.push({ name, label: humanLabel(name, rule), value });
    return true;
  };

  // 提示词：优先 type=prompt 的字段，其次语义像提示词的 string
  const promptField = (buckets.prompt || [])[0];
  if (promptField) put(promptField, text, rules[promptField]);

  // 负向词：只有工作流确实有这个字段才发（没有就不发，避免未知字段报错）
  (buckets.negative || []).forEach((n) => { if (std.negative) put(n, std.negative, rules[n]); });

  // 首/尾帧：有专门的字段就填专门字段，没有就退回参考图队列
  (buckets.first_frame || []).forEach((n, i) => {
    const v = i === 0 ? (std.first_frame || imgQueue.shift()) : imgQueue.shift();
    put(n, v, rules[n]);
  });
  (buckets.last_frame || []).forEach((n, i) => {
    const v = i === 0 ? (std.last_frame || imgQueue.shift()) : imgQueue.shift();
    put(n, v, rules[n]);
  });

  // 参考图 / 音频 / 视频：按顺序填进对应的槽位
  (buckets.images || []).forEach((n) => put(n, imgQueue.shift(), rules[n]));
  (buckets.audios || []).forEach((n) => put(n, audQueue.shift(), rules[n]));
  (buckets.videos || []).forEach((n) => put(n, vidQueue.shift(), rules[n]));

  // 时长：按 min/max 夹紧
  (buckets.seconds || []).forEach((n) => {
    const v = fitNumber(std.seconds ?? std.duration, rules[n]);
    put(n, v, rules[n]);
  });

  // 分辨率：枚举里挑跟画幅匹配的
  (buckets.ratio || []).forEach((n) => {
    const v = pickEnumOption(rules[n], std.ratio ?? std.aspect_ratio);
    put(n, v, rules[n]);
  });

  // 用户在设置里手写的「附加参数」优先，覆盖自动映射
  Object.entries(extra || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    payload[k] = v;
    filled.add(k);
  });

  // 必填但还没填上的字段：若平台本身给了默认值（枚举/数值/文本之类），直接沿用。
  // 例如 indextts2 的 emo_control_method 是必填枚举，默认「与音色参考音频相同」——
  // 这种用默认值即可，不该报缺失拦住用户。
  // 🔴 媒体类字段例外：它们的 default 通常是平台占位图/空白音频，
  //    拿占位图顶上去会跑出一张空白图，宁可明确报「缺参考图」。
  const MEDIA_KINDS = ['images', 'audios', 'videos', 'first_frame', 'last_frame'];
  entries.forEach(([name, rule]) => {
    if (!rule?.required || filled.has(name)) return;
    if (MEDIA_KINDS.includes(classify(name, rule))) return;
    const d = rule?.default;
    if (d == null || d === '' || /^(none|null)$/i.test(String(d))) return;
    payload[name] = d;
    filled.add(name);
  });

  // 必填且确实无解的字段 → 报给上层，由上层翻译成人话
  const missing = entries
    .filter(([name, rule]) => rule?.required && !filled.has(name))
    .map(([name, rule]) => ({ name, label: humanLabel(name, rule) }));

  return { payload, missing, used };
}

// ---------------------------------------------------------------------------
// 提交 + 轮询
// ---------------------------------------------------------------------------

const WANT_EXT = {
  video: /\.(mp4|webm|mov|avi)(\?|$)/i,
  image: /\.(png|jpe?g|webp|gif)(\?|$)/i,
  tts: /\.(wav|mp3|ogg|m4a|flac)(\?|$)/i,
  music: /\.(wav|mp3|ogg|m4a|flac)(\?|$)/i,
};

/** 从 results 里挑正式产物：优先 output_type=output，其次按后缀匹配模态 */
function pickResult(data, modality) {
  const list = data?.results || data?.data?.results || [];
  const ext = WANT_EXT[modality];
  const score = (r) => {
    const url = String(r?.url || '');
    if (!url) return -1;
    let s = 0;
    if (!r?.output_type || r.output_type === 'output') s += 4;
    if (ext && ext.test(url)) s += 2;
    const t = String(r?.type || '').toLowerCase();
    if (modality === 'video' && t === 'video') s += 1;
    if ((modality === 'tts' || modality === 'music') && t === 'audio') s += 1;
    if (modality === 'image' && t === 'image') s += 1;
    return s;
  };
  let best = null;
  let bs = -1;
  for (const r of list) {
    const s = score(r);
    if (s > bs) { bs = s; best = r; }
  }
  if (best?.url) return best.url;
  // 结构不标准时兜一层深找（response 里只有 url 的情况很常见）
  return deepFindUrl(data) || '';
}

export async function submitWorkflow(cfg, id, payload, { signal } = {}) {
  const paths = cfg?.workflowPaths || DEFAULT_WORKFLOW_PATHS;
  const res = await fetch(wfUrl(cfg, paths.submit, { id }), {
    method: 'POST',
    headers: wfHeaders(cfg),
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    throw new Error(`工作流提交失败 (${res.status})：${await readErr(res)}`);
  }
  const data = await res.json();
  const d = data?.data || data;
  const task = d?.task_id || d?.id || d?.taskId || data?.task_id || data?.id;
  if (!task) throw new Error(`工作流提交未返回任务 id：${JSON.stringify(data).slice(0, 300)}`);
  return { task, raw: data, status: d?.status || '' };
}

export async function pollWorkflow(cfg, task, { timeoutMs = 600000, onProgress, signal, intervalMs = 4000 } = {}) {
  const paths = cfg?.workflowPaths || DEFAULT_WORKFLOW_PATHS;
  const url = wfUrl(cfg, paths.result, { task });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    if (signal?.aborted) throw new Error('已取消');
    const res = await fetch(url, { method: 'GET', headers: wfHeaders(cfg), signal });
    if (!res.ok) continue;                       // 轮询偶发失败不致命，下一轮再试
    const data = await res.json();
    const d = data?.data || data;
    const status = String(d?.status || '').toUpperCase();
    onProgress?.(status, d);
    if (/SUCCESS|SUCCEEDED|COMPLETED|DONE/.test(status)) {
      return { raw: d, status };
    }
    if (/FAILED|FAILURE|ERROR|CANCELED|CANCELLED/.test(status)) {
      throw new Error(`工作流执行失败：${d?.message || d?.error || d?.msg || status}`);
    }
  }
  throw new Error('工作流轮询超时，任务未在预期时间内完成');
}

/**
 * 一键跑完：读规则 → 映射素材 → 提交 → 轮询 → 拿结果地址。
 * modality 用于挑选正确的产物（视频/音频/图片）。
 */
export async function runWorkflow({
  cfg, modality = 'video', std = {}, extra = {}, onProgress, signal, timeoutMs = 600000,
} = {}) {
  const id = String(cfg?.workflowId || '').trim();
  if (!id) {
    throw new Error('未选择工作流。请在「设置 → 模型配置」里点「选择工作流」挑一条。');
  }
  const meta = await getWorkflowRules(cfg, id, { signal });
  const { payload, missing } = mapInputs(meta.rules, std, extra);
  if (missing.length) {
    const need = missing.map((x) => x.label).join('、');
    throw new Error(
      `工作流「${meta.name}」还需要：${need}。当前这次提交没有提供，请先准备好对应素材，或换一条要求更少的工作流。`
    );
  }
  onProgress?.('submit', { workflow: meta.name, payload });
  const { task } = await submitWorkflow(cfg, id, payload, { signal });
  onProgress?.('QUEUED', { task });
  const done = await pollWorkflow(cfg, task, { timeoutMs, onProgress, signal });
  const url = pickResult(done.raw, modality);
  if (!url) throw new Error('工作流已完成，但返回里找不到可用的结果地址');
  return { resultUrl: url, raw: done.raw, workflow: meta.name, payload };
}

/**
 * 结果地址落本机：这类平台的结果 URL 有效期很短（过期就播不了），
 * 开源版又没有 Tauri 本地落盘，所以拿到就转成本机 blob 地址。
 * 失败（跨域 / 体积过大）时静默退回原地址，不阻断主流程。
 */
export async function materializeUrl(url, { maxBytes = 120 * 1024 * 1024 } = {}) {
  try {
    if (!/^https?:/i.test(url)) return url;
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return url;
    const len = Number(res.headers.get('content-length') || 0);
    if (len && len > maxBytes) return url;
    const blob = await res.blob();
    if (blob.size > maxBytes) return url;
    return URL.createObjectURL(blob);
  } catch {
    return url;
  }
}
