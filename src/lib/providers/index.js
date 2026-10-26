// 统一调度层：读取各模态在「设置 → 模型配置」里填的 key，调用 OpenAI 兼容客户端。
// 这是开源版所有生成的唯一出口（替代原 dispatch-jobs 的调度机依赖）。
//
// 返回结构尽量兼容旧调用方：
//   generateImage → { resultUrl, allUrls, raw }
//   generateVideo → { resultUrl, raw }
//   generateTTS   → { resultUrl }
//   generateMusic → { resultUrl }
//   generateText  → 字符串

import { getModelConfig, isModalityConfigured } from './settings.js';
import { callChat, callImage, callMedia, callTTS } from './openai.js';

export { getModelConfig, saveModelConfig, getAllModelConfig, saveAllModelConfig, isModalityConfigured, MODALITIES, PROVIDER_PRESETS } from './settings.js';
export { callChat, callImage, callMedia, callTTS, deepFindUrl } from './openai.js';

export class ModelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModelError';
  }
}

function requireConfig(modality) {
  const c = getModelConfig(modality);
  if (!c.apiKey || !c.apiKey.trim()) {
    throw new ModelError(
      `未配置「${modality}」模型的 API Key。请在「设置 → 模型配置」中填写对应服务的 baseUrl / API Key / 模型名。`
    );
  }
  if (!c.model || !c.model.trim()) {
    throw new ModelError(`「${modality}」模型名未填写，请在「设置 → 模型配置」中指定 model。`);
  }
  return c;
}

/** 文本生成（兼容旧 DispatchGlmClient.chat 的 messages 入参） */
export async function generateText(messages, opts = {}) {
  const c = requireConfig('text');
  return callChat({
    baseUrl: c.baseUrl,
    apiKey: c.apiKey,
    model: c.model,
    messages,
    temperature: opts.temperature ?? 0.7,
    maxTokens: opts.maxTokens ?? 1200,
    signal: opts.signal,
  });
}

/**
 * 通用负向词：图片生成默认带上的质量兜底（糊、畸形、水印、构图残缺等常见问题）。
 * 调用方显式传了 negative 时以调用方为准。用户无需在设置里配置。
 */
export const DEFAULT_IMAGE_NEGATIVE = 'low quality, worst quality, blurry, lowres, jpeg artifacts, watermark, text, signature, logo, deformed, bad anatomy, bad proportions, extra limbs, extra fingers, missing fingers, cropped, out of frame';

/**
 * 图片生成。prompt 为最终提示词；size / n 为标准 OpenAI 兼容字段。
 *
 * 支持图生图（参考图）：传入 referenceImage / referenceImages 时，参考图以固定的
 * `image_url` 字段随请求发出（四视图即用主视图作参考）。字段名固定，不暴露给用户配置。
 *   - 纯文生图（不传参考图）：不发该字段；
 *   - 图生图：参考图随请求发出，由所选模型按参考图出图。
 * 负向词走固定字段 `negative_prompt`，内容默认取 DEFAULT_IMAGE_NEGATIVE（通用负向词），
 * 调用方显式传了 negative 时以调用方为准。是否提交由开关决定，见下。
 *
 * 负向词是否提交由「设置 → 图片模型 → 提交负向词」开关决定（默认开）。
 * 关掉后请求体里不再出现 negative_prompt —— 部分服务对未知字段做严格校验，
 * 带负向词会直接报错，此时关掉即可，无需改代码。
 *
 * 需要换接口路径时只改「设置 → 图片模型 → 接口路径」，其余无需代码改动。
 */
export async function generateImage(prompt, opts = {}) {
  const c = requireConfig('image');
  const extra = {};
  // 参考图（图生图）：字段名不写死 —— 各厂商不同（image_url / image / init_image / reference_image…），
  // 由「设置 → 图片模型 → 参考图字段名」配置，留空默认 image_url（最常见的 OpenAI 兼容写法）。
  // 值格式同样配置化：默认「单图发字符串、多图发数组」；部分服务（如声明 string[] 的 image 字段）
  // 可勾选「参考图按数组发送」，强制单图也用 [url]。
  const refField = (c.imageField || '').trim() || 'image_url';
  const asArray = c.imageFieldArray === true || c.imageFieldArray === 'true';
  const refs = (Array.isArray(opts.referenceImages) ? opts.referenceImages : [])
    .filter(Boolean).slice(0, 3);
  const single = opts.referenceImage || refs[0] || '';
  const refList = refs.length ? refs : (single ? [single] : []);
  if (refList.length) extra[refField] = (asArray || refList.length > 1) ? refList : refList[0];
  // 负向词：字段名固定 negative_prompt，内容默认取内置通用负向词（调用方传了以调用方为准）。
  // 仅当设置里开启「提交负向词」时才发送 —— 默认开启，未配置该开关的老配置同样开启。
  if (c.sendNegative !== false && c.sendNegative !== 'false') {
    extra.negative_prompt = (opts.negative || '').trim() || DEFAULT_IMAGE_NEGATIVE;
  }
  const urls = await callImage({
    baseUrl: c.baseUrl,
    apiKey: c.apiKey,
    model: c.model,
    endpoint: c.endpoint,   // 图片接口路径可配（如 /images/edits 或厂商自定义），留空走默认
    prompt,
    size: opts.size || '1024x1024',
    n: opts.n || 1,
    extra,
    signal: opts.signal,
  });
  if (!urls.length) throw new ModelError('图片模型未返回任何图片');
  return { resultUrl: urls[0], allUrls: urls, raw: { data: urls.map((u) => ({ url: u })) } };
}

/**
 * 旧 H3 语义 → 通用语义的模式别名表（单一真相来源，供 generateVideo 与 dispatch-jobs 共用）。
 * 🔴 必须放在通用层而不是适配层：调用方有两条路径——runDispatchJob（走 normalizeVideoPayload）
 *    和 generatePanelVideo（直接调 generateVideo，不经过适配层）。若只在适配层翻译，
 *    第二条路径会把 'i2v' 原样发出去，而通用视频接口认的是 text|keyframe|reference 之类标准取值。
 * 仅当命中已知别名时替换，其余值原样透传（避免误伤以 i2v 为合法取值的厂商）。
 */
export const VIDEO_MODE_ALIAS = { t2v: 'text', i2v: 'keyframe', s2v: 'reference' };

/**
 * 视频生成（纯 OpenAI 兼容语义，不绑定任何厂商，可对接 Agnes / Kling / Runway / Sora / 万相 / 清影…）。
 * 入参为标准视频参数：
 *   prompt, seconds(字符串"4"-"12"), aspect_ratio, size, mode(text|keyframe|reference),
 *   first_frame(首帧图生视频), images[](参考图), audios[](参考音频), n, engine
 * 同时兼容旧别名 duration / ratio / image，避免老调用方回归。
 * 各家差异（创建路径 / 轮询路径 / 任务 id 字段名）一律交给「设置面板配置 + callMedia 通用提取」，
 * 不在此处写任何厂商特例 —— 因此换个模型只改配置，不改代码。
 */
export async function generateVideo({ prompt, seconds, duration, aspect_ratio, ratio, size, mode, first_frame, last_frame, image, images, audios, negative, n, engine, onProgress, signal, timeoutMs } = {}) {
  const c = requireConfig('video');
  const payload = { prompt };
  const sec = seconds ?? duration;
  if (sec != null) payload.seconds = String(sec);
  payload.aspect_ratio = aspect_ratio ?? ratio ?? '16:9';
  if (size) payload.size = size;
  if (c.size) payload.size = c.size;                        // 尺寸随厂商配置，不写死
  // 负向词开关（与图片一致：默认开，但只发送你填写的负向词，不自动补内置通用词——
  // 避免不支持该字段的服务直接 400）。字段名可配置（negativeField）。
  if (c.videoSendNegative !== false && c.videoSendNegative !== 'false') {
    const negText = String(negative || '').trim();
    if (negText) payload[c.negativeField || 'negative_prompt'] = negText;
  }
  // —— 素材收集（先算清有哪些素材，再按模式分桶，杜绝互斥字段误发）——
  const ff = first_frame ?? image;
  const hasFirstLast = !!(ff || last_frame);
  const imgs = (Array.isArray(images) ? images : []).filter(Boolean);
  const aus = (Array.isArray(audios) ? audios : []).filter(Boolean);
  const hasRefMedia = imgs.length > 0 || aus.length > 0;

  // —— 解析生成模式：显式优先，否则按素材自动推断 ——
  // 行业通用三模式语义：text(纯文生) / keyframe(首尾帧) / reference(参考图·音频)。
  // 显式值可为标准名或旧别名(i2v→keyframe / s2v→reference / t2v→text)；
  // 未显式指定时按本次提交自动判定（有首/尾帧→keyframe，有参考图/音频→reference，都没有→text）。
  const rawMode = c.videoMode || mode;
  const explicit = VIDEO_MODE_ALIAS[rawMode] || (['text', 'keyframe', 'reference'].includes(rawMode) ? rawMode : '');
  const stdMode = explicit || (hasFirstLast ? 'keyframe' : (hasRefMedia ? 'reference' : 'text'));
  payload.mode = stdMode;

    // —— 按标准三模式分桶发送对应素材，互斥字段绝不发 ——
    // 视频生成的通用抽象（Kling / Runway / 通义 / Agnes 等主流服务均遵循），非为某家写死：
    //   text      → 纯文生，不发明任何媒体字段；
    //   keyframe  → 只发首/尾帧，不发明参考图/音频；
    //   reference → 只发参考图/音频，不发明首/尾帧。
    if (stdMode === 'keyframe') {
      if (ff) payload.first_frame = ff;
      if (last_frame) payload.last_frame = last_frame;
    } else if (stdMode === 'reference') {
      if (imgs.length) payload.images = imgs;
      if (aus.length) payload.audios = aus;
    }
    // text 模式不发明任何媒体字段（上方未赋值，天然满足）
  if (n) payload.n = n;
  // engine 属于厂商自定义字段：默认不发送（调用方传的 'h3' 是商业版渠道遗留，
  // 对直连用户自有模型的开源版没有意义）；若所用服务确实需要，在设置里填「附加字段 engine」。
  if (c.engine) payload.engine = c.engine;
  const out = await callMedia({
    baseUrl: c.baseUrl,
    apiKey: c.apiKey,
    model: c.model,
    endpoint: c.endpoint,
    pollPath: c.pollPath,
    payload,
    timeoutMs: timeoutMs || 600000,
    onProgress,
    signal,
  });
  if (!out.resultUrl) throw new ModelError('视频模型未返回视频地址');
  return { resultUrl: out.resultUrl, raw: out.raw };
}

/** 配音。input 为台词文本 */
export async function generateTTS({ text, voice = 'default', language, signal } = {}) {
  const c = requireConfig('tts');
  const extra = {};
  if (language) extra.language = language;
  const url = await callTTS({
    baseUrl: c.baseUrl,
    apiKey: c.apiKey,
    model: c.model,
    input: text,
    voice,
    extra,
    signal,
  });
  return { resultUrl: url };
}

/** 音乐生成。tags / lyrics 透传 */
export async function generateMusic({ tags, lyrics, seconds, bpm, language, onProgress, signal } = {}) {
  const c = requireConfig('music');
  const payload = {};
  if (tags) payload.tags = tags;
  if (lyrics) payload.lyrics = lyrics;
  if (seconds) payload.duration_seconds = seconds;
  if (bpm) payload.bpm = bpm;
  if (language) payload.language = language;
  const out = await callMedia({
    baseUrl: c.baseUrl,
    apiKey: c.apiKey,
    model: c.model,
    endpoint: c.endpoint,
    pollPath: c.pollPath,
    payload,
    timeoutMs: 600000,
    onProgress,
    signal,
  });
  if (!out.resultUrl) throw new ModelError('音乐模型未返回音频地址');
  return { resultUrl: out.resultUrl, raw: out.raw };
}

export const providersReady = isModalityConfigured;
