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
export async function runDispatchJob({ type, payload = {}, onProgress = () => {}, timeoutMs = 600000, signal } = {}) {
  if (type === 'video' || type === 'intro' || type === 'video_shots') {
    const out = await pGenerateVideo({ ...payload, onProgress, timeoutMs, signal });
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
