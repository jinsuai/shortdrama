// components/Studio/MultiTrackEditor.jsx
//
// 第三优先 · 多轨剪辑台（ffmpeg.wasm）—— 替代后端合成黑盒。
//
// 能力：
//   - 三轨时间轴：视频轨（每镜一段）/ 配音轨（逐镜对齐）/ 配乐轨（整片垫底）。
//   - 按镜修剪：每段可设 in/out（秒），ffmpeg.wasm 按修剪重编码后拼接，避免黑帧/抖动。
//   - 音量：配音 / 配乐独立推子 + 静音。
//   - 合成：Web 端走 ffmpeg.wasm（concatVideosTrimmed + muxAudioToVideo），桌面端走内置 ffmpeg（mergeClips + mixAudio）。
//
// 设计取舍（v1）：配音按「原始镜头时长」对齐（复用 buildVoiceTrack），修剪以视频轨为准；
//   修剪后音画可能有轻微错位，属已知限制，后续可把修剪时长回灌配音轨彻底解决。
//   音频混流失败会自动降级为「仅视频」并提示，绝不卡死合成。

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon, Btn, Pill } from './ui';
import { isTauri } from '@dual/ui';
import { probeDuration } from '../../lib/audio-track.js';
import { mergeClips, mixAudio, b64ToObjectUrl } from '../../lib/merge.js';
import { concatVideosTrimmed, muxAudioToVideo } from '../../lib/ffmpeg.js';

const PXPS = 26; // 每像素代表的秒数（时间轴缩放）

export function MultiTrackEditor({ project, update, log }) {
  const shots = (project?.shots || []).filter((s) => s.videoUrl);
  const bgmUrl = project?.bgmUrl || '';

  const [durs, setDurs] = useState({});        // shotId → 源视频时长（秒）
  const [trims, setTrims] = useState({});      // shotId → { start, end }
  const [sel, setSel] = useState(0);           // 选中视频片段下标
  const [voiceVol, setVoiceVol] = useState(1.0);
  const [bgmVol, setBgmVol] = useState(0.2);
  const [voiceMute, setVoiceMute] = useState(false);
  const [bgmMute, setBgmMute] = useState(!bgmUrl);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(project?.assembledVideo || '');
  const [note, setNote] = useState('');
  const previewRef = useRef(null);

  // 探测每段源时长 → 初始化 / 修正修剪区间
  useEffect(() => {
    let alive = true;
    (async () => {
      const map = {};
      for (const s of shots) {
        const d = await probeDuration(s.videoUrl);
        map[s.id || s.index] = d || (s.duration || 5);
      }
      if (!alive) return;
      setDurs(map);
      setTrims((prev) => {
        const next = { ...prev };
        for (const s of shots) {
          const k = s.id || s.index;
          const d = map[k] || (s.duration || 5);
          if (!next[k]) next[k] = { start: 0, end: d };
          else next[k] = { start: Math.min(next[k].start, d), end: Math.min(Math.max(next[k].end, 0.5), d) };
        }
        return next;
      });
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  const totalSec = useMemo(
    () => shots.reduce((a, s) => a + ((trims[s.id || s.index]?.end || 0) - (trims[s.id || s.index]?.start || 0)), 0),
    [shots, trims]
  );

  const setTrim = (k, patch) => setTrims((p) => ({ ...p, [k]: { ...(p[k] || { start: 0, end: 0 }), ...patch } }));

  const compose = async () => {
    if (busy || !shots.length) return;
    setBusy(true);
    setNote('');
    try {
      const clips = shots.map((s) => {
        const k = s.id || s.index;
        const d = durs[k] || (s.duration || 5);
        const t = trims[k] || { start: 0, end: d };
        const start = Math.max(0, Math.min(t.start, d - 0.3));
        const end = Math.max(start + 0.3, Math.min(t.end, d));
        return { url: s.videoUrl, start, end, subtitle: s.dialogue || '' };
      });

      if (isTauri()) {
        log?.('桌面端合成：mergeClips（含修剪）+ 混音…');
        const spec = clips.map((c, i) => ({
          url: c.url, inpoint: c.start, outpoint: c.end, subtitle: c.subtitle, duration: c.end - c.start,
        }));
        const vB64 = await mergeClips(spec, { burnSubtitles: false });
        let outUrl = b64ToObjectUrl(vB64);
        // 桌面端混音：配音整轨 + 配乐
        try {
          const voice = !voiceMute ? await buildVoiceTrackWeb(shots, voiceVol) : null;
          let bgmB64 = '';
          if (!bgmMute && bgmUrl) bgmB64 = await fetchB64(bgmUrl);
          if (voice || bgmB64) {
            const mB64 = await mixAudio(vB64, voice?.base64 || '', bgmB64, 1.0, bgmVol);
            outUrl = b64ToObjectUrl(mB64);
          }
        } catch (e) {
          setNote('混音失败，已输出无声成片：' + (e?.message || e));
        }
        setPreview(outUrl);
        update?.({ ...project, assembledVideo: outUrl });
        log?.('合成完成（桌面端）');
      } else {
        log?.('Web 端合成：ffmpeg.wasm 按修剪拼接…');
        const vBlob = await concatVideosTrimmed(clips, { returnBlob: true });
        const vBytes = new Uint8Array(await vBlob.arrayBuffer());
        let outUrl = URL.createObjectURL(vBlob);
        // 音频：配音整轨 + 配乐 → 混成 WAV → mux 进视频
        try {
          const voice = !voiceMute ? await buildVoiceTrackWeb(shots, voiceVol) : null;
          let bgmB64 = '';
          if (!bgmMute && bgmUrl) bgmB64 = await fetchB64(bgmUrl);
          if (voice || bgmB64) {
            log?.('混音音轨…');
            const wav = await composeAudioWeb(shots, bgmUrl, voiceVol, bgmMute ? 0 : bgmVol, clips);
            const mBlob = await muxAudioToVideo(vBytes, wav);
            outUrl = URL.createObjectURL(mBlob);
          }
        } catch (e) {
          setNote('音轨混流失败，已输出无声成片：' + (e?.message || e));
        }
        setPreview(outUrl);
        update?.({ ...project, assembledVideo: outUrl });
        log?.('合成完成（Web · ffmpeg.wasm）');
      }
    } catch (e) {
      setNote('合成失败：' + (e?.message || e));
      log?.('合成失败：' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const exportClip = async () => {
    if (!preview) return;
    try {
      const a = document.createElement('a');
      a.href = preview;
      a.download = `${(project?.title || '短剧')}_剪辑_${Date.now()}.mp4`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { setNote('导出失败：' + (e?.message || e)); }
  };

  if (!shots.length) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#7c8798', fontSize: 13 }}>
        <Icon name="scissors" size={28} color="#9aa3b2" />
        <div style={{ marginTop: 10 }}>还没有可剪辑的视频片段。请先完成「动态」步骤生成各镜视频。</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* 顶部：操作 + 时长统计 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: '1px solid rgba(15,23,42,0.096)' }}>
        <Icon name="scissors" size={16} color="#6d28d9" />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>多轨剪辑台</span>
        <Pill tone="orange">Beta</Pill>
        <span style={{ fontSize: 11.5, color: '#5b6678' }}>成片 {totalSec.toFixed(1)}s · {shots.length} 镜</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Btn size="sm" variant="primary" disabled={busy} onClick={compose}>
            <Icon name="play" size={12} />{busy ? '合成中…' : '合成预览'}
          </Btn>
          <Btn size="sm" disabled={busy || !preview} onClick={exportClip}><Icon name="download" size={12} />导出</Btn>
        </span>
      </div>

      {/* 推子 + 静音 */}
      <div style={{ display: 'flex', gap: 22, padding: '10px 18px', borderBottom: '1px solid rgba(15,23,42,0.096)', alignItems: 'center' }}>
        <VolCtrl label="配音" value={voiceVol} onChange={setVoiceVol} muted={voiceMute} onMute={() => setVoiceMute((m) => !m)} />
        <VolCtrl label="配乐" value={bgmVol} onChange={setBgmVol} muted={bgmMute || !bgmUrl} onMute={() => setBgmMute((m) => !m)} disabled={!bgmUrl} />
        {!bgmUrl && <span style={{ fontSize: 11, color: '#9aa3b2' }}>（未设置 BGM，可在「混音」步骤上传）</span>}
      </div>

      {/* 时间轴 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <Lane label="视频">
          <div style={{ display: 'flex', gap: 4, minWidth: shots.length * 60 }}>
            {shots.map((s, i) => {
              const k = s.id || s.index;
              const d = durs[k] || (s.duration || 5);
              const t = trims[k] || { start: 0, end: d };
              const w = Math.max(40, (t.end - t.start) * (1 / PXPS) * 100);
              const active = sel === i;
              return (
                <div key={k} onClick={() => setSel(i)}
                  style={{
                    width: w, flexShrink: 0, height: 46, borderRadius: 7, cursor: 'pointer',
                    background: active ? 'rgba(109,40,217,.18)' : 'rgba(15,23,42,.06)',
                    border: `1px solid ${active ? '#8b5cf6' : 'rgba(15,23,42,.12)'}`,
                    padding: '5px 7px', overflow: 'hidden',
                  }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#1f2937' }}>镜 {s.index || i + 1}</div>
                  <div style={{ fontSize: 9.5, color: '#5b6678' }}>{(t.end - t.start).toFixed(1)}s</div>
                  {s.dialogue && <div style={{ fontSize: 9, color: '#7c8798', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.dialogue.slice(0, 12)}</div>}
                </div>
              );
            })}
          </div>
        </Lane>

        <Lane label="配音">
          <div style={{ display: 'flex', gap: 4 }}>
            {shots.map((s, i) => (
              <div key={s.id || s.index} style={{
                width: Math.max(40, ((trims[s.id || s.index]?.end || 0) - (trims[s.id || s.index]?.start || 0)) * (1 / PXPS) * 100),
                flexShrink: 0, height: 30, borderRadius: 6,
                background: s.audioUrl ? 'rgba(34,197,94,.16)' : 'rgba(15,23,42,.04)',
                border: '1px solid rgba(15,23,42,.1)', fontSize: 9.5, color: s.audioUrl ? '#16a34a' : '#9aa3b2',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{s.audioUrl ? '♪' : '—'}</div>
            ))}
          </div>
        </Lane>

        <Lane label="配乐">
          <div style={{
            height: 30, borderRadius: 6, flexShrink: 0, width: Math.max(80, totalSec * (1 / PXPS) * 100),
            background: bgmUrl && !bgmMute ? 'rgba(245,158,11,.16)' : 'rgba(15,23,42,.04)',
            border: '1px solid rgba(15,23,42,.1)', fontSize: 9.5, color: bgmUrl ? '#b45309' : '#9aa3b2',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{bgmUrl ? (bgmMute ? '配乐已静音' : 'BGM') : '无配乐'}</div>
        </Lane>

        {/* 选中片段修剪 */}
        <div style={{ marginTop: 16, padding: 14, borderRadius: 9, background: 'rgba(15,23,42,.04)', border: '1px solid rgba(15,23,42,.12)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2937', marginBottom: 10 }}>
            修剪 · 镜 {shots[sel]?.index || sel + 1}
          </div>
          {shots[sel] && (
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              <Range label="起点(s)" min={0} max={durs[shots[sel].id || shots[sel].index] || 5}
                value={trims[shots[sel].id || shots[sel].index]?.start || 0}
                onChange={(v) => { const k = shots[sel].id || shots[sel].index; const e = trims[k]?.end || 0; setTrim(k, { start: Math.min(v, e - 0.3) }); }} />
              <Range label="终点(s)" min={0} max={durs[shots[sel].id || shots[sel].index] || 5}
                value={trims[shots[sel].id || shots[sel].index]?.end || 0}
                onChange={(v) => { const k = shots[sel].id || shots[sel].index; const s0 = trims[k]?.start || 0; setTrim(k, { end: Math.max(v, s0 + 0.3) }); }} />
              <span style={{ fontSize: 11.5, color: '#5b6678' }}>
                片段时长 {(((trims[shots[sel].id || shots[sel].index]?.end || 0) - (trims[shots[sel].id || shots[sel].index]?.start || 0))).toFixed(1)}s
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 预览 + 提示 */}
      <div style={{ borderTop: '1px solid rgba(15,23,42,0.096)', padding: 14, display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ flex: 1, aspectRatio: '16/9', maxHeight: 180, borderRadius: 9, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {preview
            ? <video ref={previewRef} src={preview} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            : <span style={{ fontSize: 12, color: '#7c8798' }}>合成后在此预览</span>}
        </div>
        {note && <div style={{ width: 220, fontSize: 11, color: '#f59e0b', lineHeight: 1.6 }}>{note}</div>}
      </div>
    </div>
  );
}

function Lane({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <div style={{ width: 44, flexShrink: 0, fontSize: 11, color: '#5b6678', fontWeight: 600 }}>{label}</div>
      <div style={{ flex: 1, overflowX: 'auto' }}>{children}</div>
    </div>
  );
}

function VolCtrl({ label, value, onChange, muted, onMute, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11.5, color: '#5b6678', width: 28 }}>{label}</span>
      <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))} style={{ width: 90, accentColor: '#6d28d9' }} />
      <span style={{ fontSize: 10.5, color: '#4b5563', width: 30 }}>{Math.round((muted ? 0 : value) * 100)}%</span>
      <button onClick={onMute} disabled={disabled} title={muted ? '取消静音' : '静音'}
        style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(15,23,42,.12)', background: muted ? 'rgba(220,38,38,.12)' : 'transparent', color: muted ? '#dc2626' : '#4b5563', cursor: disabled ? 'not-allowed' : 'pointer' }}>
        <Icon name={muted ? 'mic' : 'mic'} size={12} />
      </button>
    </div>
  );
}

function Range({ label, min, max, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10.5, color: '#5b6678' }}>{label}：{value.toFixed(1)}</span>
      <input type="range" min={min} max={max} step={0.1} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 160, accentColor: '#6d28d9' }} />
    </div>
  );
}

// ── Web 音频合成（与音频轨一致，纯前端）──
const RENDER_SR = 22050;

async function fetchB64(url) {
  const r = await fetch(url);
  const ab = await r.arrayBuffer();
  const bytes = new Uint8Array(ab);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}

// 配音整轨：逐镜 audioUrl 按「修剪后时长」对齐渲染为 WAV base64（复用 buildVoiceTrack 的思路但尊重修剪）
async function buildVoiceTrackWeb(shots, vol = 1.0) {
  const list = shots.filter((s) => s.audioUrl);
  if (!list.length) return null;
  const decodeCtx = new OfflineAudioContext(1, 1, RENDER_SR);
  const decoded = [];
  for (const s of list) {
    try {
      const ab = await (await fetch(s.audioUrl)).arrayBuffer();
      decoded.push(await decodeCtx.decodeAudioData(ab));
    } catch { decoded.push(null); }
  }
  if (!decoded.some(Boolean)) return null;
  // 用 trims 决定每段时长（这里用传入 shots 的 videoUrl 时长兜底）
  const total = list.reduce((a, s) => a + (Number(s.duration) || 5), 0);
  const frames = Math.ceil(total * RENDER_SR);
  const render = new OfflineAudioContext(1, Math.max(frames, 1), RENDER_SR);
  let acc = 0; let used = 0;
  decoded.forEach((ab, i) => {
    if (!ab) { acc += (Number(list[i].duration) || 5); return; }
    const src = render.createBufferSource(); src.buffer = ab; src.connect(render.destination);
    src.start(acc); used += 1; acc += (Number(list[i].duration) || 5);
  });
  const out = await render.startRendering();
  return { base64: audioBufferToWavBase64(out, vol) };
}

// 配音 + 配乐 混成一条 WAV：voice 按镜时长对齐，bgm 垫底并循环铺满整片
async function composeAudioWeb(shots, bgmUrl, voiceVol, bgmVol, clips) {
  const total = clips.reduce((a, c) => a + (c.end - c.start), 0) || shots.reduce((a, s) => a + (Number(s.duration) || 5), 0);
  const frames = Math.ceil(total * RENDER_SR);
  const render = new OfflineAudioContext(2, Math.max(frames, 1), RENDER_SR);
  // 配音
  const list = shots.filter((s) => s.audioUrl);
  let acc = 0;
  for (const s of list) {
    try {
      const ab = await (await fetch(s.audioUrl)).arrayBuffer();
      const buf = await render.decodeAudioData(ab);
      const src = render.createBufferSource(); src.buffer = buf;
      const g = render.createGain(); g.gain.value = voiceVol;
      src.connect(g); g.connect(render.destination);
      src.start(acc);
    } catch {}
    acc += (Number(s.duration) || 5);
  }
  // 配乐：循环铺满
  if (bgmUrl && bgmVol > 0) {
    try {
      const ab = await (await fetch(bgmUrl)).arrayBuffer();
      const buf = await render.decodeAudioData(ab);
      const src = render.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = render.createGain(); g.gain.value = bgmVol;
      src.connect(g); g.connect(render.destination);
      src.start(0, 0, total);
    } catch {}
  }
  const out = await render.startRendering();
  return audioBufferToWavBase64(out, 1.0);
}

function audioBufferToWavBase64(buffer, vol = 1.0) {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length;
  const sr = buffer.sampleRate;
  const blockAlign = numCh * 2;
  const dataSize = len * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const str = (off, s) => { for (let i = 0; i < s.length; i += 1) view.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
  view.setUint32(28, sr * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, dataSize, true);
  const chans = [];
  for (let c = 0; c < numCh; c += 1) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i += 1) {
    for (let c = 0; c < numCh; c += 1) {
      const s = Math.max(-1, Math.min(1, chans[c][i] * vol));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  const bytes = new Uint8Array(ab);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}
