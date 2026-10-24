/**
 * 配音轨合成：把每个镜头的 TTS 音频按「镜头时长」对齐，拼成一条整片音轨。
 *
 * 为什么需要它：mix_audio 只接受**一条**配音音轨，而配音是按镜头逐条生成的。
 * 这里用 Web Audio 的 OfflineAudioContext 离线渲染出一条对齐时间线的 WAV，
 * 纯前端完成，不需要改 Rust、也不需要面板。
 *
 * 渲染采样率刻意取 22050Hz 单声道：人声够用，且 2 分钟成片只有约 5MB，
 * base64 后约 7MB，能通过 Tauri IPC 传给 ffmpeg。
 */

const RENDER_SR = 22050;
const FALLBACK_SHOT_SEC = 5;

/** 读取一段媒体（video/audio）的时长（秒）；失败返回 0 */
export function probeDuration(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(0);
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.muted = true;
    const done = (d) => resolve(Number.isFinite(d) && d > 0 ? d : 0);
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => resolve(0);
    el.src = url;
  });
}

/** 任意 URL → base64（视频/音频统一走这里） */
export async function fetchBase64(url) {
  const r = await fetch(url);
  const blob = await r.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

function audioBufferToWavBase64(buffer) {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length;
  const sr = buffer.sampleRate;
  const blockAlign = numCh * 2;
  const dataSize = len * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  const str = (off, s) => { for (let i = 0; i < s.length; i += 1) view.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);            // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, dataSize, true);

  const chans = [];
  for (let c = 0; c < numCh; c += 1) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i += 1) {
    for (let c = 0; c < numCh; c += 1) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }

  const bytes = new Uint8Array(ab);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

/**
 * 构建整片配音轨。
 * @param {Array<{videoUrl?:string, audioUrl?:string, dialogue?:string}>} shots
 * @param {{onStep?:Function}} [opts]
 * @returns {Promise<string|null>} WAV base64；没有任何可用配音时返回 null
 */
export async function buildVoiceTrack(shots, { onStep = () => {} } = {}) {
  const list = shots || [];
  const hasAudio = list.some((s) => s.audioUrl);
  if (!hasAudio) return null;

  onStep('解析配音…');
  const decodeCtx = new OfflineAudioContext(1, 1, RENDER_SR);
  const decoded = [];
  for (let i = 0; i < list.length; i += 1) {
    if (!list[i].audioUrl) { decoded.push(null); continue; }
    try {
      const ab = await (await fetch(list[i].audioUrl)).arrayBuffer();
      decoded.push(await decodeCtx.decodeAudioData(ab));
    } catch (e) {
      console.warn('[audio-track] 配音解码失败，跳过该段:', e);
      decoded.push(null);
    }
  }
  if (!decoded.some(Boolean)) return null;

  onStep('对齐镜头时长…');
  const durations = await Promise.all(
    list.map(async (s) => (await probeDuration(s.videoUrl)) || FALLBACK_SHOT_SEC)
  );

  const offsets = [];
  let acc = 0;
  for (let i = 0; i < list.length; i += 1) { offsets.push(acc); acc += durations[i]; }
  const tail = Math.max(...decoded.map((d, i) => (d ? offsets[i] + d.duration : 0)));
  const total = Math.max(acc, tail, 1);
  const frames = Math.ceil(total * RENDER_SR);

  onStep('渲染音轨…');
  const render = new OfflineAudioContext(1, frames, RENDER_SR);
  let used = 0;
  decoded.forEach((ab, i) => {
    if (!ab) return;
    const src = render.createBufferSource();
    src.buffer = ab;
    src.connect(render.destination);
    src.start(offsets[i]);
    used += 1;
  });
  const out = await render.startRendering();
  return { base64: audioBufferToWavBase64(out), segments: used, seconds: total };
}
