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
 * 图片生成。prompt 为最终提示词；size / n 为标准 OpenAI 兼容字段。
 *
 * 支持图生图（参考图）：当传入 referenceImage / referenceImages 时，会把参考图放进
 * 「图片」模态配置的参考图字段名（imageField，默认 image_url）。各厂商字段名不一
 * （image_url / image / init_image …），在「设置 → 模型配置 → 图片」里改 imageField 即可，无需改代码。
 *   - 纯文生图（不传参考图）：只发 model/prompt/size/n，兼容对未知字段严格校验的服务；
 *   - 图生图：参考图随请求发出，由所选模型按参考图出图（四视图即走这条）。
 * 负向词同理走可配置的 negativeField（默认 negative_prompt），仅当提供时发送。
 *
 * 接口路径（endpoint）、参考图字段名、负向词字段名全部可在设置里覆盖，
 * 因此「换个支持图生图的模型只改配置、不改代码」。
 */
export async function generateImage(prompt, opts = {}) {
  const c = requireConfig('image');
  const extra = {};
  // 参考图（图生图）：取调用方传入的参考图，按可配置字段名发送。
  const refs = (Array.isArray(opts.referenceImages) ? opts.referenceImages : [])
    .filter(Boolean).slice(0, 3);
  const single = opts.referenceImage || refs[0] || '';
  const imageField = (c.imageField && c.imageField.trim()) || 'image_url';
  if (refs.length > 1) extra[imageField] = refs;
  else if (single) extra[imageField] = single;
  // 负向词：仅当提供时发送，字段名可配置（默认 negative_prompt）
  const neg = opts.negative || '';
  if (neg.trim()) {
    const negField = (c.negativeField && c.negativeField.trim()) || 'negative_prompt';
    extra[negField] = neg;
  }
  const urls = await callImage({
    baseUrl: c.baseUrl,
    apiKey: c.apiKey,
    model: c.model,
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
export async function generateVideo({ prompt, seconds, duration, aspect_ratio, ratio, size, mode, first_frame, last_frame, image, images, audios, n, engine, onProgress, signal, timeoutMs } = {}) {
  const c = requireConfig('video');
  const payload = { prompt };
  const sec = seconds ?? duration;
  if (sec != null) payload.seconds = String(sec);
  payload.aspect_ratio = aspect_ratio ?? ratio ?? '16:9';
  if (size) payload.size = size;
  if (c.size) payload.size = c.size;                        // 尺寸随厂商配置，不写死
  // 模式：设置里显式选的优先（调用方传的多半是代码写死的默认值，不代表用户意图）
  const rawMode = c.videoMode || mode;
  payload.mode = VIDEO_MODE_ALIAS[rawMode] || rawMode || 'text';   // 旧语义(i2v/s2v/t2v)统一翻译成通用语义

  // 🔴 媒体素材「有什么就发什么」，三类互不顶替、互不裁剪：
  //   first_frame / last_frame —— 只来自首/尾帧入参（旧别名 image 同属首帧语义，不代表参考图）
  //   images                   —— 只来自参考图入参，不会因为没首帧就被拿去当首帧
  //   audios                   —— 只来自参考音频入参
  // 没有的字段直接不发（不补空值、不做兜底），数量的上限也交给厂商自行校验。
  const ff = first_frame ?? image;
  if (ff) payload.first_frame = ff;
  if (last_frame) payload.last_frame = last_frame;
  const imgs = (Array.isArray(images) ? images : []).filter(Boolean);
  if (imgs.length) payload.images = imgs;
  const aus = (Array.isArray(audios) ? audios : []).filter(Boolean);
  if (aus.length) payload.audios = aus;
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
