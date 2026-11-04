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
  VIDEO_MODE_ALIAS,
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
/** 把 UI 的 resolution 档位字符串（如 "1080p竖" / "768p横(1280*720)"）解析为 aspect_ratio 标准名 */
function resolutionToRatio(resolution) {
  if (!resolution || typeof resolution !== 'string') return null;
  // 优先按像素数字解析（老格式如 "1920x1080"）
  const m = resolution.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (m) {
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
  // 档位字符串：如 "1080p竖" / "768p横(1280*720)" / "1080p(1:1)"
  const s = resolution.toLowerCase();
  if (/竖|portrait|vertical/.test(s)) return '9:16';
  if (/横|landscape|horizontal/.test(s)) return '16:9';
  if (/方|square|1:1/.test(s)) return '1:1';
  return null;
}

/**
 * 把 UI 的 resolution 档位字符串（如 "1080p竖" / "768p横(1280*720)" / "720p(1:1)"）解析为
 * 真实像素尺寸字符串（如 "1080x1920" / "1280x720" / "720x720"）。
 *
 * 🔴 为什么要有这层：直连 OpenAI 兼容视频 API 时，模型默认只认 aspect_ratio（画幅），
 *    不认「1080P/768P」这种档位；若不把像素数补上，选了 1080P 实际喂的是模型自身的默认
 *    分辨率（常是 768P 级别）—— 这正是「选 1080P 喂 768P」的 bug 残留。这里把档位翻译成
 *    真实像素，让直连路径也吃到用户选的分辨率。
 *
 * 约定：p 数字 = 短边（较小维度），长边 = 短边 × 16/9 并取整到偶数（视频编码器要求偶尺寸）。
 *   1080p竖 → 1080×1920   1080p横 → 1920×1080   1080p(1:1) → 1080×1080
 *   768p竖  → 768×1366    720p横  → 1280×720     480p竖     → 480×854
 * 已是 "WxH" / "W*H" 像素格式的透传（不再二次计算）。解析不出档位返回 null（交回模型默认 / c.size）。
 */
function resolutionToSize(resolution) {
  if (!resolution || typeof resolution !== 'string') return null;
  const s = resolution.trim();
  // 已是像素格式：归一化成 "WxH"
  const px = s.match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
  if (px) {
    const w = +px[1], h = +px[2];
    const even = (n) => (n % 2 === 0 ? n : n + 1);
    return `${even(w)}x${even(h)}`;
  }
  // 档位格式：提取 "数字p"（480p / 576p / 720p / 768p / 1080p…）
  const pm = s.toLowerCase().match(/(\d+)\s*p\b/);
  if (!pm) return null;
  const shortEdge = +pm[1];
  if (!shortEdge) return null;
  const even = (n) => (n % 2 === 0 ? n : n + 1);
  if (/竖|portrait|vertical/.test(s)) {
    const h = even(Math.round(shortEdge * 16 / 9));
    return `${shortEdge}x${h}`;          // 竖屏：宽=短边，高=长边
  }
  if (/方|square|1:1/.test(s)) {
    return `${shortEdge}x${shortEdge}`;
  }
  // 横屏（含未显式标方向，兜底按 16:9 横屏）
  const w = even(Math.round(shortEdge * 16 / 9));
  return `${w}x${shortEdge}`;
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

// 模式别名表 VIDEO_MODE_ALIAS 已从 ./lib/providers/index.js 导入（通用层单一真相来源）。
// generateVideo 内部也会做一次归一化，此处翻译只为让适配层产出的 payload 本身即标准语义。

function normalizeVideoPayload(p = {}) {
  const mode = VIDEO_MODE_ALIAS[p.mode] || p.mode || 'text';
  const seconds = p.duration != null ? String(p.duration) : '5';
  const aspect = p.ratio || resolutionToRatio(p.resolution) || '16:9';
  const out = { prompt: p.prompt, mode, seconds, aspect_ratio: aspect };
  // 尺寸：显式 p.size 优先（调用方已算好）；否则从 resolution 档位推导真实像素。
  // 直连 OpenAI 兼容视频 API 时这一档位→像素的映射是关键 —— 否则选 1080P 只会给画幅、
  // 不会给像素，模型退回自身默认（常 768P 级），造成「选 1080P 喂 768P」。
  // 厂商若不支持 size 字段，在「设置 → 模型配置」留空 c.size 即可不发送（此处推导值会被 c.size 覆盖）。
  if (p.size) out.size = p.size;
  else {
    const sz = resolutionToSize(p.resolution);
    if (sz) out.size = sz;
  }
  // 🔴 原始档位字符串一并保留：工作流型服务的分辨率是枚举（768p竖 / 1080p竖…），
  //    只看 size 认不出枚举选项，必须把「1080p竖」这条原始档位带给 provider 去挑选项。
  if (p.resolution) out.quality = p.resolution;
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
    const chosen = type === 'video_shots' ? (payload.shots?.[0] || payload) : payload;
    // 长视频路径里 resolution 常挂在顶层 payload 而非 shots[0]，这里兜底合并，
    // 避免子对象缺 resolution 导致档位→像素映射失效（选 1080P 落空）。
    const merged = { ...chosen, resolution: chosen.resolution ?? payload.resolution };
    const norm = normalizeVideoPayload(merged);
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
