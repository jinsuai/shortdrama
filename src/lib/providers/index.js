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

/** 图片生成。prompt 为最终提示词；negative 仅对支持负向词的引擎有效（作为 extra 透传） */
export async function generateImage(prompt, opts = {}) {
  const c = requireConfig('image');
  const extra = {};
  if (opts.negative) extra.negative_prompt = opts.negative;
  // 参考图透传：各厂商字段名不一，这里统一放进 image_url（单张传字符串、多张传数组）。
  // 是否真正生效取决于用户在「设置 → 模型配置 → 图片」所选的模型；
  // 纯文生图接口会忽略该字段，退回按提示词出图。
  const refs = (Array.isArray(opts.referenceImages) ? opts.referenceImages : [])
    .filter(Boolean).slice(0, 3);
  const single = opts.referenceImage || refs[0] || '';
  if (refs.length > 1) extra.image_url = refs;
  else if (single) extra.image_url = single;
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
 * 视频生成（纯 OpenAI 兼容语义，不绑定任何厂商，可对接 Agnes / Kling / Runway / Sora / 万相 / 清影…）。
 * 入参为标准视频参数：
 *   prompt, seconds(字符串"4"-"12"), aspect_ratio, size, mode(text|keyframe|reference),
 *   first_frame(首帧图生视频), images[](参考图), audios[](参考音频), n, engine
 * 同时兼容旧别名 duration / ratio / image，避免老调用方回归。
 * 各家差异（创建路径 / 轮询路径 / 任务 id 字段名）一律交给「设置面板配置 + callMedia 通用提取」，
 * 不在此处写任何厂商特例 —— 因此换个模型只改配置，不改代码。
 */
export async function generateVideo({ prompt, seconds, duration, aspect_ratio, ratio, size, mode, first_frame, image, images, audios, n, engine, onProgress, signal, timeoutMs } = {}) {
  const c = requireConfig('video');
  const payload = { prompt };
  const sec = seconds ?? duration;
  if (sec != null) payload.seconds = String(sec);
  payload.aspect_ratio = aspect_ratio ?? ratio ?? '16:9';
  if (size) payload.size = size;
  payload.mode = mode || 'text';
  if (c.size) payload.size = c.size;                        // 尺寸随厂商配置，不写死（Agnes 720P / Sora 720p …）
  const ff = first_frame ?? image;
  if (ff) payload.first_frame = ff;
  if (images && images.length) payload.images = images;
  if (audios && audios.length) payload.audios = audios;
  if (n) payload.n = n;
  if (engine) payload.engine = engine;
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
