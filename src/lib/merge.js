// 统一视频合并：桌面端走内置 ffmpeg.exe（离线可用、无需 CDN），
// Web 端降级走 ffmpeg.wasm（需联网加载内核）。两个分支都返回合并后 MP4 的 base64 字符串，
// 调用方统一用 b64ToBlob 转成 Blob 做预览或落盘，避免“两条 ffmpeg 路径”行为不一致。

import { invoke } from "./tauri-shim.js";
import { isTauri, blobToBase64 } from "@dual/ui";
import { concatVideos } from "./ffmpeg.js";

async function urlToBase64(url) {
  const r = await fetch(url);
  const blob = await r.blob();
  return await blobToBase64(blob);
}

/**
 * base64 → Blob（分块构造，避免大文件爆栈）。
 * merge / mix 系列命令统一返回 base64，界面层需要转成可播放地址时用这个。
 */
export function b64ToBlob(b64, mime = 'video/mp4') {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  const CHUNK = 0x8000;
  for (let i = 0; i < len; i += CHUNK) {
    const end = Math.min(i + CHUNK, len);
    const sub = bin.slice(i, end);
    for (let j = 0; j < sub.length; j += 1) bytes[i + j] = sub.charCodeAt(j);
  }
  return new Blob([bytes], { type: mime });
}

/** base64 → 可直接塞进 <video src> 的 blob: 地址 */
export function b64ToObjectUrl(b64, mime = 'video/mp4') {
  return URL.createObjectURL(b64ToBlob(b64, mime));
}

/**
 * 合并多段视频为单个 MP4。
 * @param {string[]} urls 各视频地址（blob: 或 http(s):）
 * @param {{burnSubtitles?: boolean, labels?: string[]}} [opts]
 * @returns {Promise<string>} 合并后 MP4 的 base64
 */
export async function mergeVideos(urls, { burnSubtitles = false, labels = [] } = {}) {
  if (!urls || !urls.length) throw new Error("没有可合并的视频片段。");

  if (isTauri()) {
    const inputs = [];
    for (const u of urls) {
      try {
        inputs.push(await urlToBase64(u));
      } catch (e) {
        throw new Error(`视频获取失败：${u}（可能离线或跨域）`);
      }
    }
    return await invoke("merge_videos", { inputs, burnSubtitles, labels });
  }

  // Web 端：ffmpeg.wasm 合并，返回 Blob 后统一转 base64。
  const blob = await concatVideos(urls, { burnSubtitles, labels, returnBlob: true });
  return await blobToBase64(blob);
}

/**
 * 增强合并：支持分割(inpoint/outpoint)、转场(transition)、逐段字幕(subtitle)。
 * @param {Array<{url:string,inpoint:number,outpoint:number,subtitle:string,duration:number,transition:string}>} clips
 * @param {{burnSubtitles?: boolean}} [opts]
 * @returns {Promise<string>} 合并后 MP4 的 base64
 */
export async function mergeClips(clips, { burnSubtitles = true } = {}) {
  if (!clips || !clips.length) throw new Error("没有可合并的视频片段。");

  if (isTauri()) {
    const inputs = [];
    for (const c of clips) {
      try {
        inputs.push(await urlToBase64(c.url));
      } catch (e) {
        throw new Error(`视频获取失败：${c.url}（可能离线或跨域）`);
      }
    }
    const spec = clips.map((c, i) => ({
      data: inputs[i],
      inpoint: c.inpoint || 0,
      outpoint: c.outpoint || 0,
      subtitle: c.subtitle || "",
      duration: c.duration || 0,
      transition: c.transition || "none",
    }));
    return await invoke("merge_clips", { clips: spec, burnSubtitles });
  }

  // Web 端：退化为顺序拼接 + 字幕烧录（不支撑分割/转场）。
  return await mergeVideos(clips.map((c) => c.url), { burnSubtitles, labels: clips.map((c) => c.subtitle || "") });
}

/**
 * 混音：将配音 + BGM 混合到视频音频轨。
 * - voiceVolume: 配音音量（1.0 = 原声，0.3 = 降低）
 * - bgmVolume: BGM 音量（0.2 通常合适）
 * - 使用 ffmpeg apad + amix，画面不重编码（-c:v copy）
 * @param {string} videoBase64 - 视频 base64
 * @param {string} voiceBase64 - 配音 base64（含音频）
 * @param {string} bgmBase64 - BGM base64（可空）
 * @param {number} voiceVolume - 配音音量 0-2
 * @param {number} bgmVolume - BGM 音量 0-1
 * @returns {Promise<string>} 混合后的视频 base64
 */
export async function mixAudio(videoBase64, voiceBase64, bgmBase64, voiceVolume = 1.0, bgmVolume = 0.2) {
  if (isTauri()) {
    return await invoke("mix_audio", {
      video: videoBase64,
      voice: voiceBase64 || "",
      bgm: bgmBase64 || "",
      voiceVolume,
      bgmVolume,
    });
  }
  throw new Error("Web 端暂不支持混音，请使用桌面端");
}

/**
 * 导出转码：让导出页的「分辨率 / 格式 / 字幕」三项参数真正生效。
 * - resolution: 480p / 720p / 1080p / 4K / source（source＝保持原分辨率）
 * - format:     MP4 / MOV / GIF
 * - subtitle:   burnIn（烧进画面）/ srt（不烧录，单独产出外挂 .srt）/ none
 * - srtText:    SRT 文本，用 buildSrt() 从镜头台词生成
 * @returns {Promise<{video: string, srt: string, ext: string}>} 均为 base64
 */
export async function transcodeVideo(url, { resolution = "1080p", format = "MP4", subtitle = "none", srtText = "" } = {}) {
  if (!isTauri()) throw new Error("导出转码仅支持桌面端（需要内置 ffmpeg）");
  const b64 = await urlToBase64(url);
  return await invoke("transcode_video", { video: b64, resolution, format, subtitle, srt_text: srtText || "" });
}

/**
 * 把 base64 直接落盘（转码结果已经是 base64，不必再转回 blob 绕一圈）。
 * @returns {Promise<string>} 落盘绝对路径
 */
export async function saveBase64(b64, filename, dir = "") {
  if (!isTauri()) throw new Error("落盘仅支持桌面端");
  return await invoke("save_file", { dir, filename, data: b64 });
}

/**
 * 把远端素材拉回本地，返回可持久显示的 asset:// 地址。
 *
 * 背景：面板返回的是 GPU 实例上的临时地址，实例关机 / 签名过期后就变裂图；
 * 视频早就做了本地缓存，图片一直没做。落盘后本地文件永远可显示。
 *
 * ⚠️ 调用方务必同时保留原远程地址（如存到 imageRemoteUrl）——
 *    后续要把它再喂给远端工作流（首帧图、超分）时，本地 asset:// 地址远端下载不到。
 *
 * @param {string} url 远端地址
 * @param {string} filename 落盘文件名（含扩展名）
 * @returns {Promise<{url: string, path: string}>} 失败时回退原地址，path 为空串
 */
export async function cacheLocal(url, filename) {
  if (!url) return { url: "", path: "" };
  if (!isTauri()) return { url, path: "" };
  try {
    const path = await saveToLocal(url, filename);
    return { url: convertFileSrc(path), path };
  } catch (e) {
    console.warn("[cacheLocal] 本地缓存失败，回退远程地址:", e?.message || e);
    return { url, path: "" };
  }
}

function srtTime(sec) {
  const t = Math.max(0, sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}

/**
 * 按镜头台词生成 SRT 字幕文本。
 * 时间轴用镜头时长累加推算（与成片拼接顺序一致）；镜头没写 duration 时按 5 秒兜底。
 * @param {Array<{dialogue?: string, duration?: number}>} shots
 */
export function buildSrt(shots, { hideSpeaker = true } = {}) {
  const list = shots || [];
  if (!list.length) return "";
  let acc = 0;
  let idx = 0;
  const blocks = [];
  for (const s of list) {
    const dur = Number(s.duration) || 5;
    let text = (s.dialogue || "").trim();
    // 自动隐藏角色名：台词若是「角色名：内容」格式，只保留内容（对齐 infinite-creation 的 SRT 处理）
    if (hideSpeaker) text = text.replace(/^[\u4e00-\u9fa5A-Za-z0-9_·•\-]+[：:]\s*/, '').trim();
    if (text) {
      idx += 1;
      blocks.push(`${idx}\n${srtTime(acc)} --> ${srtTime(acc + dur)}\n${text}\n`);
    }
    acc += dur;
  }
  return blocks.join("\n");
}

/**
 * 把任意可访问的视频/音频 URL（blob: 或 http(s):）保存到本地。
 * - 桌面端：fetch 取 bytes → base64 → invoke save_file 写盘（dir 空则用默认下载目录）。
 * - 返回最终落盘的绝对路径字符串。
 * @param {string} url blob: 或 http(s): 地址
 * @param {string} filename 文件名（含扩展名）
 * @param {string} [dir] 目标目录，空则用默认下载目录
 */
export async function saveToLocal(url, filename, dir = "") {
  if (isTauri()) {
    const r = await fetch(url);
    const blob = await r.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    const b64 = btoa(bin);
    return await invoke("save_file", { dir, filename, data: b64 });
  }
  // Web 端：触发浏览器下载
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return filename;
}
