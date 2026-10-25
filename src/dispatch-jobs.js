// 开源版生成调度层（替代原「调度机」依赖）。
//
// 设计：本文件不再有任何后端 / 计费 / 登录概念。所有「生成」统一走 src/lib/providers，
// 用户自备模型 API Key。仅保留少量与旧调用方兼容的导出名，便于渐进迁移。
//
// 兼容导出：generateImage / img2imgImage / generateMusic / runDispatchJob /
//          concatVideos / extractTail / normalizeResultUrl / api / DispatchError

import {
  generateImage as pGenerateImage,
  generateVideo as pGenerateVideo,
  generateTTS as pGenerateTTS,
  generateMusic as pGenerateMusic,
} from './lib/providers/index.js';
import { concatVideos as ffmpegConcat } from './lib/ffmpeg.js';

export class DispatchError extends Error {
  constructor(message, { status, needRecharge } = {}) {
    super(message);
    this.status = status;
    this.needRecharge = needRecharge;
  }
}

/**
 * 通用 fetch 封装（无后端鉴权）。保留原名以便旧组件调用；
 * 传入完整 URL 或相对路径均可，默认 300s 超时。
 */
export async function api(path, opts = {}) {
  const { timeout = 300000, signal: externalSignal, ...fetchOpts } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  if (externalSignal) externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const res = await fetch(path, { ...fetchOpts, signal: controller.signal });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) throw new DispatchError(data.detail || data.message || `HTTP ${res.status}`, { status: res.status });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 把任意返回的相对 / localhost 地址规范为可访问地址（兼容历史逻辑，保留工具函数）。
 */
export function normalizeResultUrl(url) {
  if (!url || typeof url !== 'string') return url;
  try {
    const u = new URL(url);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '0.0.0.0') {
      // 浏览器无法访问 localhost 的 GPU 服务，原样返回交给上层处理
      return url;
    }
    return url;
  } catch {
    return url;
  }
}

/* ════════════ 图片 ════════════ */

export async function generateImage({ prompt, model = '', size = '1024x1024', n = 1, kind = '', negative = '', signal } = {}) {
  return pGenerateImage(prompt, { size, n, negative, signal });
}

export async function img2imgImage({ image_url, prompt, negative_prompt = '', seed = 0, signal } = {}) {
  // 图生图：开源版统一走「图片模型 + 首图参考」。OpenAI 兼容图片接口通常无图生图，
  // 这里把参考图作为 image_url 透传（支持图生的服务会用到），并保留提示词。
  return pGenerateImage(prompt, { negative: negative_prompt, signal });
}

/* ════════════ 视频 / 配音 / 音乐 ════════════ */

/**
 * 统一的「提交 GPU/模型 任务」。开源版把 type 映射到对应模态的直连生成。
 * 兼容旧 VideoGenBoard 的调用形态：runDispatchJob({ type, payload, onProgress, timeoutMs })
 */
/**
 * 把视频 UI（商业版 H3 调度机语义）的 payload 翻译为纯 OpenAI 兼容视频语义。
 * 目的：视频模型差异巨大（Agnes / Kling / Runway / Sora / 万相 / 清影…），但只有「创建路径、
 * 轮询路径、任务 id 字段名」不同，这些差异全交给「设置面板配置 + callMedia 通用提取」。
 * 语义层（模式 / 画幅 / 参考图 / 首帧）在此统一归一，做到「换个模型只改配置、不改代码」。
 */
function resolutionToRatio(resolution) {
  if (!resolution || typeof resolution !== 'string') return null;
  const m = resolution.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (!m) return null;
  const w = +m[1], h = +m[2];
  const r = w / h;
  const table = [[21 / 9, '21:9'], [16 / 9, '16:9'], [4 / 3, '4:3'], [1, '1:1'], [3 / 4, '3:4'], [9 / 16, '9:16']];
  let best = '16:9', diff = Infinity;
  for (const [v, name] of table) {
    const d = Math.abs(v - r);
    if (d < diff) { diff = d; best = name; }
  }
  return best;
}

/** 收集 payload 中 ref_image_0 / ref_image_1 … 这类带序号的参考资源，按序返回数组 */
function collectIndexed(p, prefix) {
  const arr = [];
  let i = 0;
  while (p[`${prefix}${i}`] != null) { arr.push(p[`${prefix}${i}`]); i++; }
  if (!arr.length) {
    Object.keys(p).filter((k) => k.startsWith(prefix)).sort().forEach((k) => {
      if (typeof p[k] === 'string') arr.push(p[k]);
    });
  }
  return arr;
}

// H3 模式 → OpenAI/Agnes 通用模式：文生视频 / 图生视频(首尾帧) / 参考图(角色场景)视频
const VIDEO_MODE_ALIAS = { t2v: 'text', i2v: 'keyframe', s2v: 'reference' };

function normalizeVideoPayload(p = {}) {
  const mode = VIDEO_MODE_ALIAS[p.mode] || p.mode || 'text';
  const seconds = p.duration != null ? String(p.duration) : '5';
  const aspect = p.ratio || resolutionToRatio(p.resolution) || '16:9';
  const out = { prompt: p.prompt, mode, seconds, aspect_ratio: aspect };
  if (p.size) out.size = p.size;                            // 尺寸随厂商（Agnes 720P / Sora 720p …），由设置面板按厂商填
  if (p.first_frame) out.first_frame = p.first_frame;       // 图生视频首帧
  if (p.last_frame) out.last_frame = p.last_frame;          // 图生视频尾帧
  const images = Array.isArray(p.images) ? p.images : collectIndexed(p, 'ref_image_');
  if (images.length) out.images = images;                   // 参考图（角色/场景）
  const audios = Array.isArray(p.audios) ? p.audios : collectIndexed(p, 'ref_audio_');
  if (audios.length) out.audios = audios;                   // 参考音频
  return out;
}

export async function runDispatchJob({ type, payload = {}, onProgress = () => {}, timeoutMs = 600000, signal } = {}) {
  if (type === 'video' || type === 'intro' || type === 'video_shots') {
    // 批量 shots（旧 H3 长视频专属）不在通用视频模型能力内，降级为取首段单生成。
    const norm = normalizeVideoPayload(type === 'video_shots' ? (payload.shots?.[0] || payload) : payload);
    const out = await pGenerateVideo({ ...norm, onProgress, timeoutMs, signal });
    return { result_url: out.resultUrl, ...out };
  }
  if (type === 'tts') {
    const out = await pGenerateTTS({ ...payload, signal });
    return { result_url: out.resultUrl, ...out };
  }
  if (type === 'music') {
    const out = await pGenerateMusic({ ...payload, onProgress, signal });
    return { result_url: out.resultUrl, ...out };
  }
  throw new DispatchError(`不支持的任务类型：${type}`, { status: 400 });
}

/* ════════════ 本地视频处理（替代原服务端 concat / extract_tail）════════════ */

/**
 * 合并多个视频 URL 为一个 MP4（本地 ffmpeg.wasm，无需服务端）。
 * 返回 { video_url, segments }，兼容旧调用方。
 */
export async function concatVideos(videoUrls, opts = {}) {
  const blob = await ffmpegConcat(videoUrls, { returnBlob: true, ...opts });
  const objectUrl = URL.createObjectURL(blob);
  return { video_url: objectUrl, segments: videoUrls.length };
}

/**
 * 提取视频最后一帧，作为下一段图生视频的首帧（本地实现：video + canvas）。
 * 返回 { frame_url }（dataURL），兼容旧调用方。
 */
export async function extractTail(videoUrl) {
  if (!videoUrl || typeof videoUrl !== 'string') throw new DispatchError('缺少视频地址', { status: 400 });
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';
    video.src = videoUrl;
    const cleanup = () => { try { video.removeAttribute('src'); video.load(); } catch (_) {} };
    video.addEventListener('loadedmetadata', () => {
      const t = Math.max(0, (video.duration || 1) - 0.1);
      try { video.currentTime = t; } catch (_) {}
    });
    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 512;
        canvas.height = video.videoHeight || 512;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        cleanup();
        resolve({ frame_url: dataUrl });
      } catch (e) {
        cleanup();
        reject(new DispatchError('尾帧提取失败：' + (e?.message || e), { status: 500 }));
      }
    });
    video.addEventListener('error', () => {
      cleanup();
      reject(new DispatchError('视频加载失败（可能跨域或地址不可达）', { status: 500 }));
    });
  });
}

export { DispatchError as default };
