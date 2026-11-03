// ffmpeg.wasm 懒加载（运行时从 esm.sh CDN 动态 import，不进打包体积）。
// 仅当用户点击「合并导出」时才加载；加载失败则调用方降级为顺序播放预览。

let ffInstance = null;
let loading = null;

// 加载失败时清空 loading，便于下次重试（而不是一直缓存失败态）。
async function loadFFmpeg({ timeoutMs = 20000 } = {}) {
  if (ffInstance) return ffInstance;
  if (loading) return loading;
  loading = (async () => {
    // 离线探测：浏览器明确离线时直接抛出清晰错误，避免静默失败。
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      loading = null;
      throw new Error("当前处于离线状态，无法下载 ffmpeg 内核。请联网后重试，或改用「顺序成片预览」逐段观看。");
    }
    let mod, coreMod;
    const withTimeout = (p, msg) =>
      Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), timeoutMs))]);
    try {
      mod = await withTimeout(import("https://esm.sh/@ffmpeg/ffmpeg@0.12.10"), "ffmpeg 模块下载超时");
      coreMod = await withTimeout(import("https://esm.sh/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js"), "ffmpeg 内核下载超时");
    } catch (e) {
      loading = null;
      throw new Error("无法加载 ffmpeg（网络受限或 CDN 不可达）：" + e.message);
    }
    const FFmpeg = mod.FFmpeg || mod.default;
    const ff = new FFmpeg();
    const coreURL = "https://esm.sh/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js";
    const wasmURL = "https://esm.sh/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm";
    try {
      await ff.load({ coreURL, wasmURL, ...(coreMod && coreMod.default ? {} : {}) });
    } catch (e) {
      loading = null;
      throw new Error("ffmpeg 内核初始化失败：" + e.message);
    }
    ffInstance = ff;
    return ff;
  })();
  return loading;
}

// 把多个视频 URL 合并为一个 MP4。
// urls: string[]；burnSubtitles: 是否烧录分场字幕（需重编码，较慢）；
// returnBlob: true 时返回 Blob（用于 saveFile 落盘），否则返回 objectURL。
export async function concatVideos(urls, { burnSubtitles = false, labels = [], returnBlob = false } = {}) {
  if (!urls || !urls.length) throw new Error("没有可合并的视频片段。");
  const ff = await loadFFmpeg();

  const names = [];
  for (let i = 0; i < urls.length; i++) {
    const name = `in${i}.mp4`;
    let buf;
    try {
      buf = await (await fetch(urls[i])).arrayBuffer();
    } catch (e) {
      throw new Error(`视频获取失败：${urls[i]}（可能跨域或离线）`);
    }
    await ff.writeFile(name, new Uint8Array(buf));
    names.push(name);
  }

  // 无论是否烧字幕，都先构造 concat 列表文件，避免引用未创建的 list.txt 导致崩溃。
  const list = names.map((n) => `file '${n}'`).join("\n");
  await ff.writeFile("list.txt", new TextEncoder().encode(list));

  if (burnSubtitles && labels.length) {
    // 生成 SRT（按片段均分，简单字幕）
    let srt = "";
    const dur = 5; // 每段 5s 占位
    const f = (s) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")},000`;
    labels.forEach((lb, i) => {
      const start = i * dur, end = (i + 1) * dur;
      srt += `${i + 1}\n${f(start)} --> ${f(end)}\n${lb}\n\n`;
    });
    await ff.writeFile("sub.srt", new TextEncoder().encode(srt));
    await ff.exec(["-f", "concat", "-safe", "0", "-i", "list.txt", "-vf", "subtitles=sub.srt", "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", "out.mp4"]);
  } else {
    // 无字幕 / 无需重编码：流拷贝，快且稳定。
    await ff.exec(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "out.mp4"]);
  }

  const data = await ff.readFile("out.mp4");
  const blob = new Blob([data], { type: "video/mp4" });
  if (returnBlob) return blob;
  return URL.createObjectURL(blob);
}

// 探测 ffmpeg 是否可加载（用于 UI 提前提示离线）。
export async function probeFFmpeg() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    await loadFFmpeg();
    return true;
  } catch {
    return false;
  }
}

/** base64 → Uint8Array（音视频通用） */
export function b64ToBytes(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * 带「按镜修剪」的视频拼接（多轨剪辑台核心能力）。
 * clips: [{ url, start, end }]，start/end 为秒；start/end 缺省或 0 表示取整段。
 * 每段先按 in/out 重编码（veryfast）保证帧对齐，再 concat 拷贝，避免拼接抖动/黑帧。
 * returnBlob: true 时返回 Blob（用于落盘/转码），否则返回 objectURL。
 */
export async function concatVideosTrimmed(clips, { returnBlob = false } = {}) {
  if (!clips || !clips.length) throw new Error("没有可合并的视频片段。");
  const ff = await loadFFmpeg();
  const segNames = [];
  for (let i = 0; i < clips.length; i += 1) {
    const c = clips[i];
    let buf;
    try {
      buf = await (await fetch(c.url)).arrayBuffer();
    } catch (e) {
      throw new Error(`视频获取失败：${c.url}（可能跨域或离线）`);
    }
    const inName = `in${i}.mp4`;
    await ff.writeFile(inName, new Uint8Array(buf));
    const start = Number(c.start) || 0;
    const end = Number(c.end) || 0;
    const seg = `seg${i}.mp4`;
    const args = [];
    if (start > 0) args.push("-ss", String(start));
    if (end > 0) args.push("-to", String(end));
    args.push("-i", inName, "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", seg);
    await ff.exec(args);
    segNames.push(seg);
  }
  const list = segNames.map((n) => `file '${n}'`).join("\n");
  await ff.writeFile("list.txt", new TextEncoder().encode(list));
  await ff.exec(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "out.mp4"]);
  const data = await ff.readFile("out.mp4");
  const blob = new Blob([data], { type: "video/mp4" });
  if (returnBlob) return blob;
  return URL.createObjectURL(blob);
}

/**
 * 把音轨混进视频（视频流拷贝、音频重编码 aac）。
 * videoBytes: Uint8Array（拼接后的无声视频）；audioB64: WAV base64（可空 → 仅视频）。
 * returnBlob: true 时返回 Blob，否则 objectURL。
 */
export async function muxAudioToVideo(videoBytes, audioB64, { returnBlob = false } = {}) {
  const ff = await loadFFmpeg();
  await ff.writeFile("v.mp4", new Uint8Array(videoBytes));
  if (audioB64) await ff.writeFile("a.wav", b64ToBytes(audioB64));
  const args = ["-i", "v.mp4"];
  if (audioB64) args.push("-i", "a.wav");
  args.push("-c:v", "copy");
  if (audioB64) args.push("-c:a", "aac", "-shortest");
  args.push("out.mp4");
  await ff.exec(args);
  const data = await ff.readFile("out.mp4");
  const blob = new Blob([data], { type: "video/mp4" });
  if (returnBlob) return blob;
  return URL.createObjectURL(blob);
}

export { loadFFmpeg };
