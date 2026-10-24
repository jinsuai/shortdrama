import React, { useState } from 'react';
import { T, MIX_TRACKS, MODELS } from './i18n';
import { Icon, Btn, Pill, Empty, Slider, SectionTitle } from './ui';
import { generatePanelTTS, generatePanelMusic, generatePanelUpscale } from '../../lib/media-workflows.js';
import { mixAudio, b64ToObjectUrl, saveToLocal } from '../../lib/merge.js';
import { buildVoiceTrack, fetchBase64 } from '../../lib/audio-track.js';

const P = { padding: '18px 22px' };

/* ══════════════ 步骤 7：配音 ══════════════ */
export function VoiceStep({ project, update, log }) {
  const chars = project?.materials?.characters || [];
  const shots = project?.shots || [];
  const lines = shots.filter((s) => s.dialogue);
  const [busy, setBusy] = useState(false);

  /** 改角色音色描述，持久化到角色 */
  const updateVoiceDesc = (id, voiceDesc) => {
    const next = chars.map((c) => (c.id === id ? { ...c, voiceDesc } : c));
    update?.({ ...project, materials: { ...project?.materials, characters: next } });
  };

  /** 批量配音：Qwen3TTS，音色描述取自角色身上的 voice 设定 */
  const generateAll = async () => {
    if (busy) return;
    if (!lines.length) { log?.('暂无台词'); return; }
    setBusy(true);
    log?.(`开始生成全部音频（${lines.length} 条）`);
    const next = [...shots];
    let ok = 0;
    for (const s of lines) {
      try {
        const c = chars.find((x) => x.name === s.characters?.[0]);
        const { resultUrl } = await generatePanelTTS({
          text: s.dialogue,
          voiceDesc: c?.voiceDesc || c?.voice || '',
        });
        const idx = next.indexOf(s);
        next[idx] = { ...s, audioUrl: resultUrl };
        ok += 1;
        log?.(`配音完成 ${ok}/${lines.length}`);
      } catch (e) {
        log?.(`配音失败：${e?.message || e}`);
      }
    }
    update?.({ ...project, shots: next });
    log?.(`配音结束：成功 ${ok} / ${lines.length}`);
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* 左：选角室 */}
      <div style={{
        width: 300, flexShrink: 0, borderRight: '1px solid rgba(15,23,42,0.096)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ ...P, paddingTop: 14, paddingBottom: 10, borderBottom: '1px solid rgba(15,23,42,0.096)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="mic" size={16} color="#6d28d9" />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{T.voice.casting}</span>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {chars.length === 0
            ? <Empty icon="users" text="暂无角色" />
            : chars.map((c) => <CastCard key={c.id} char={c} onVoiceChange={updateVoiceDesc} />)}
        </div>
      </div>

      {/* 右：台词本 */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{
          ...P, paddingTop: 14, paddingBottom: 10, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', borderBottom: '1px solid rgba(15,23,42,0.096)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{T.voice.reader}</span>
          <Btn size="sm" variant="primary" disabled={busy || !lines.length} onClick={generateAll}>
            <Icon name="mic" size={12} />{busy ? '生成中…' : T.voice.generateAll}
          </Btn>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {lines.length === 0
            ? <Empty icon="file" text="暂无台词" hint="先在分镜中生成台词" />
            : lines.map((s, i) => (
              <div key={s.id || i} style={{
                display: 'flex', gap: 11, alignItems: 'flex-start', padding: 11,
                borderRadius: 9, marginBottom: 8, background: 'rgba(15,23,42,0.048)',
                border: '1px solid rgba(15,23,42,0.112)',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(109,40,217,.16)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 11, color: '#6d28d9', fontWeight: 600,
                }}>{(s.characters?.[0] || '角').slice(0, 1)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#6d28d9', marginBottom: 3 }}>
                    {s.characters?.[0] || '角色'}
                  </div>
                  <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6 }}>{s.dialogue}</div>
                  <div style={{ fontSize: 10, color: '#7c8798', marginTop: 4 }}>
                    {T.voice.frame(shots.indexOf(s) + 1)}
                  </div>
                </div>
                <button title="试听" style={{
                  width: 28, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: 'rgba(15,23,42,0.08)', color: '#4b5563', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}><Icon name="play" size={12} /></button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function CastCard({ char, onVoiceChange }) {
  const [speed, setSpeed] = useState(10);
  const [pitch, setPitch] = useState(10);
  const [vol, setVol] = useState(50);
  return (
    <div style={{
      padding: 12, borderRadius: 9, marginBottom: 9,
      background: 'rgba(15,23,42,0.048)', border: '1px solid rgba(15,23,42,0.112)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          background: char.imageUrl ? '#000' : 'rgba(109,40,217,.16)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          {char.imageUrl
            ? <img src={char.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Icon name="users" size={15} color="#6d28d9" />}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: '#1f2937', fontWeight: 500 }}>{char.name}</div>
          <div style={{ fontSize: 10.5, color: '#4b5563' }}>
            {char.gender || '男'}, {char.age || 25}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 10, color: '#4b5563', marginBottom: 4 }}>音色描述（配音时传给 TTS）</div>
      <textarea value={char.voiceDesc || ''} rows={2}
        onChange={(e) => onVoiceChange?.(char.id, e.target.value)}
        placeholder="例如：成熟男性，低沉磁性，中年，沉稳；或：年轻女性，清亮温柔，少女音"
        style={{
          width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 11.5, marginBottom: 9,
          background: 'rgba(15,23,42,0.048)', border: '1px solid rgba(15,23,42,0.16)',
          color: '#374151', fontFamily: 'inherit', outline: 'none', resize: 'vertical',
        }} />

      <SliderRow label={T.voice.speed} value={speed} min={5} max={20} onChange={setSpeed} suffix="" />
      <SliderRow label={T.voice.pitch} value={pitch} min={0} max={20} onChange={setPitch} />
      <SliderRow label={T.voice.volume} value={vol} min={0} max={100} onChange={setVol} />
    </div>
  );
}

function SliderRow({ label, value, min, max, onChange, suffix = '' }) {
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ fontSize: 10, color: '#4b5563', marginBottom: 2 }}>{label}</div>
      <Slider value={value} min={min} max={max} onChange={onChange} suffix={suffix} />
    </div>
  );
}

/** 配音上下文栏 */
export function VoiceContext({ project }) {
  const chars = project?.materials?.characters || [];
  const bound = chars.filter((c) => c.voice).length;
  return (
    <>
      <CtxHead label="AUDIO" />
      <CtxBlock title={T.voice.status}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: bound === chars.length ? '#22c55e' : '#1f2937' }}>
            {bound}/{chars.length}
          </span>
        </div>
        {bound < chars.length && (
          <div style={{ fontSize: 11, color: '#4b5563', marginTop: 6 }}>{T.voice.needVoices}</div>
        )}
      </CtxBlock>
    </>
  );
}

/* ══════════════ 步骤 8：混音 ══════════════ */
export function FinalMixStep({ project, update, log }) {
  const shots = project?.shots || [];
  const [levels, setLevels] = useState(
    Object.fromEntries(MIX_TRACKS.map((t) => [t.key, t.value]))
  );
  const [busy, setBusy] = useState(false);

  /** 执行混音：成片视频 + 配音整轨 + BGM → 混成带声成片，覆盖 assembledVideo */
  const doMix = async () => {
    if (busy) return;
    const src = project?.assembledVideo;
    if (!src) { log?.('还没有成片，请先在「合成」步骤合并片段'); return; }
    setBusy(true);
    try {
      log?.('构建配音整轨…');
      const voice = await buildVoiceTrack(shots, { onStep: (m) => log?.(m) });
      log?.('读取成片视频…');
      const videoB64 = await fetchBase64(src);
      let bgmB64 = '';
      if (project?.bgmUrl) {
        log?.('读取背景音乐…');
        bgmB64 = await fetchBase64(project.bgmUrl);
      }
      log?.('执行混音…');
      const voiceVol = (levels.dialogue ?? 100) / 100;
      const bgmVol = (levels.music ?? 50) / 100;
      const outB64 = await mixAudio(videoB64, voice?.base64 || '', bgmB64, voiceVol, bgmVol);
      const url = b64ToObjectUrl(outB64);
      update?.({ ...project, assembledVideo: url });
      log?.('混音完成，成片已更新为带声版本');
    } catch (e) {
      log?.(`混音失败：${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* 上排：预览 + 混音器 */}
      <div style={{ display: 'flex', gap: 16, padding: 18, borderBottom: '1px solid rgba(15,23,42,0.096)' }}>
        <div style={{
          flex: 1, aspectRatio: '16/9', maxHeight: 240, borderRadius: 9, flexShrink: 0,
          background: '#000', border: '1px solid rgba(15,23,42,0.128)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
        }}>
          {project?.assembledVideo
            ? <video src={project.assembledVideo} style={{ width: '100%', height: '100%', objectFit: 'contain' }} controls />
            : <span style={{ fontSize: 12, color: '#7c8798' }}>0:00 / {T.assembly.merged}</span>}
          <div style={{ position: 'absolute', bottom: 10, left: 12, fontSize: 11, color: '#5b6678' }}>
            0:00 / {T.mix.shot(1)}
          </div>
        </div>

        <div style={{
          width: 260, flexShrink: 0, padding: 14, borderRadius: 9,
          background: 'rgba(15,23,42,0.048)', border: '1px solid rgba(15,23,42,0.128)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
            <Icon name="sliders" size={14} color="#6d28d9" />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2937' }}>{T.mix.mixer}</span>
            <Pill tone="orange">Beta</Pill>
          </div>
          {MIX_TRACKS.map((t) => (
            <div key={t.key} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 10.5, color: '#5b6678' }}>{t.label}</span>
                <span style={{ fontSize: 10.5, color: '#4b5563' }}>{levels[t.key]}%</span>
              </div>
              <Slider value={levels[t.key]} min={0} max={100}
                onChange={(v) => setLevels({ ...levels, [t.key]: v })} />
            </div>
          ))}
          <Btn variant="primary" style={{ width: '100%', marginTop: 4 }} disabled={busy} onClick={doMix}>
            <Icon name="sliders" size={12} />{busy ? '混音中…' : '执行混音'}
          </Btn>
          {!project?.assembledVideo && (
            <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 8, lineHeight: 1.5 }}>
              需要先在「合成」步骤合并片段，生成本片视频。
            </div>
          )}
        </div>
      </div>

      {/* 下排：时间轴 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button style={{
            width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'rgba(109,40,217,.2)', color: '#6d28d9',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}><Icon name="play" size={13} /></button>
          <span style={{ fontSize: 11.5, color: '#5b6678' }}>0:00 / 1:45</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#4b5563' }}>{T.mix.zoom}</span>
            <button style={iconBtnStyle}><Icon name="refresh" size={12} /></button>
          </div>
        </div>

        {/* 轨道 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <TrackRow label={T.mix.video} tone="purple">
            {shots.slice(0, 21).map((s, i) => (
              <div key={s.id || i} style={{
                width: 62, aspectRatio: '16/9', borderRadius: 4, flexShrink: 0,
                background: 'rgba(109,40,217,.22)', border: '1px solid rgba(109,40,217,.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8.5, color: '#6d28d9', overflow: 'hidden',
              }}>
                {s.imageUrl
                  ? <img src={s.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : T.mix.shot(i + 1)}
              </div>
            ))}
          </TrackRow>
          <TrackRow label={T.mix.dialogue} tone="default" />
          <TrackRow label={T.mix.sfx} tone="default" />
          <TrackRow label={T.mix.bgm} tone="green">
            <div style={{
              width: 220, height: 26, borderRadius: 5, flexShrink: 0,
              background: 'rgba(34,197,94,.22)', border: '1px solid rgba(34,197,94,.35)',
              display: 'flex', alignItems: 'center', paddingLeft: 9,
              fontSize: 10, color: '#22c55e',
            }}>{T.mix.defaultBgm}</div>
          </TrackRow>
        </div>
      </div>
    </div>
  );
}

const iconBtnStyle = {
  width: 24, height: 24, borderRadius: 5, border: 'none', cursor: 'pointer',
  background: 'rgba(15,23,42,0.08)', color: '#4b5563',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
};

function TrackRow({ label, children, tone = 'default' }) {
  const bg = tone === 'purple' ? 'rgba(109,40,217,.08)'
    : tone === 'green' ? 'rgba(34,197,94,.06)' : 'rgba(15,23,42,0.032)';
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
      <div style={{
        width: 56, flexShrink: 0, fontSize: 10.5, color: '#4b5563', letterSpacing: '.04em',
      }}>{label}</div>
      <div style={{
        flex: 1, minHeight: 30, borderRadius: 6, padding: 5, background: bg,
        border: '1px solid rgba(15,23,42,0.08)', display: 'flex', gap: 4,
        overflowX: 'auto', alignItems: 'center',
      }}>{children}</div>
    </div>
  );
}

/** 混音上下文栏 */
export function MixContext({ project, update, log }) {
  const [busy, setBusy] = useState(false);
  const [tags, setTags] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [seconds, setSeconds] = useState(60);

  /** 生成 BGM（ACE-Step）。填了歌词＝带人声歌曲，不填＝纯音乐 */
  const makeBgm = async () => {
    if (busy) return;
    setBusy(true);
    log?.('正在生成背景音乐…');
    try {
      const { resultUrl, workflowId } = await generatePanelMusic({
        tags: tags || '纯音乐，情绪贴合剧情，电影感配乐，无 vocals',
        lyrics,
        seconds,
      });
      update?.({ ...project, bgmUrl: resultUrl });
      log?.(`背景音乐已生成（${workflowId}）${lyrics ? '· 带人声' : '· 纯音乐'}`);
    } catch (e) {
      log?.(`背景音乐生成失败：${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const taStyle = {
    width: '100%', background: 'rgba(15,23,42,0.06)', border: '1px solid rgba(15,23,42,0.144)',
    borderRadius: 5, padding: '6px 8px', color: '#5b6678', fontSize: 11,
    fontFamily: 'inherit', resize: 'vertical', outline: 'none', marginBottom: 8,
  };

  return (
    <>
      <CtxHead label="MIX" />
      <CtxBlock title={T.mix.inspector}>
        <div style={{ fontSize: 11.5, color: '#4b5563', lineHeight: 1.7 }}>{T.mix.inspectorHint}</div>
      </CtxBlock>

      <CtxBlock title="背景音乐">
        <div style={{ fontSize: 10.5, color: '#4b5563', marginBottom: 4 }}>曲风描述（tags）</div>
        <textarea rows={2} value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="例如：古风武侠，大气悲壮，弦乐+鼓，中速"
          style={taStyle} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10.5, color: '#4b5563' }}>歌词（留空＝纯音乐）</span>
          <span style={{ fontSize: 10, color: lyrics.trim() ? '#6d28d9' : '#7c8798' }}>
            {lyrics.trim() ? '带人声' : '无人声'}
          </span>
        </div>
        <textarea rows={5} value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          placeholder={'每行一句，可用 [verse] / [chorus] 标记段落\n例如：\n[verse]\n夜色落在旧城墙\n[chorus]\n风起时我在等你'}
          style={taStyle} />

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10.5, color: '#4b5563', marginBottom: 4 }}>时长 {seconds}s</div>
          <Slider value={seconds} min={15} max={240} onChange={setSeconds} suffix="s" />
        </div>

        <Btn size="sm" variant="primary" style={{ width: '100%' }} disabled={busy} onClick={makeBgm}>
          <Icon name="sparkle" size={12} />{busy ? '生成中…' : '生成背景音乐'}
        </Btn>
        {project?.bgmUrl && (
          <audio src={project.bgmUrl} controls style={{ width: '100%', marginTop: 8 }} />
        )}
      </CtxBlock>
    </>
  );
}

/* ══════════════ 步骤 9：导出 ══════════════ */
export function ExportStep({ project, update, log }) {
  const [res, setRes] = useState('1080p');
  const [fmt, setFmt] = useState('MP4');
  const [sub, setSub] = useState('burnIn');
  const [done, setDone] = useState(false);
  const [upscaling, setUpscaling] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [savedPath, setSavedPath] = useState('');

  /** 真实导出：把成片落盘到本地（默认下载目录）。4K 需先超分。 */
  const render = async () => {
    if (rendering) return;
    const src = project?.assembledVideo;
    if (!src) { log?.('还没有成片，请先完成「合成」与「混音」'); return; }
    if (res === '4K' && !project?.upscaled) {
      log?.('选择 4K 分辨率需先执行下方「AI 视频超分」'); return;
    }
    setRendering(true);
    log?.('开始导出成片…');
    try {
      const base = (project?.title || '短剧').replace(/[\\/:*?"<>|]/g, '_');
      const name = `${base}_${res}_${Date.now()}.mp4`;
      const path = await saveToLocal(src, name);
      setSavedPath(path);
      setDone(true);
      log?.(`导出完成：${path}`);
    } catch (e) {
      log?.(`导出失败：${e?.message || e}`);
    } finally {
      setRendering(false);
    }
  };

  /** AI 视频超分（FlashVSR 2x），结果写回成片 */
  const upscale = async () => {
    if (upscaling) return;
    const src = project?.assembledVideo;
    if (!src) { log?.('还没有成片，请先完成「合成」步骤'); return; }
    setUpscaling(true);
    log?.('正在进行视频超分…');
    try {
      const { resultUrl, workflowId } = await generatePanelUpscale({ videoUrl: src, scale: 2 });
      update?.({ ...project, assembledVideo: resultUrl, upscaled: true });
      log?.(`超分完成（${workflowId}）`);
    } catch (e) {
      log?.(`超分失败：${e?.message || e}`);
    } finally {
      setUpscaling(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 20, padding: 24, height: '100%', overflowY: 'auto' }}>
      {/* 参数面板 */}
      <div style={{
        width: 250, flexShrink: 0, padding: 16, borderRadius: 10, alignSelf: 'flex-start',
        background: 'rgba(15,23,42,0.048)', border: '1px solid rgba(15,23,42,0.128)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', marginBottom: 14 }}>
          {T.export.title}
        </div>
        <OptGroup label={T.export.resolution} options={['1080p', '4K']} value={res} onChange={setRes} />
        <OptGroup label={T.export.format} options={['MP4', 'MOV', 'GIF']} value={fmt} onChange={setFmt} />
        <OptGroup label={T.export.subtitles}
          options={[
            { key: 'burnIn', label: T.export.burnIn },
            { key: 'srt', label: T.export.srt },
            { key: 'none', label: T.export.none },
          ]} value={sub} onChange={setSub} />
        <Btn variant="primary" size="lg" onClick={render} disabled={rendering} style={{ width: '100%', marginTop: 6 }}>
          <Icon name="play" size={13} />{rendering ? '导出中…' : T.export.render}
        </Btn>
        <Btn size="lg" onClick={upscale} disabled={upscaling} style={{ width: '100%', marginTop: 8 }}>
          <Icon name="sparkle" size={13} />{upscaling ? '超分中…' : 'AI 视频超分 (2x)'}
        </Btn>
      </div>

      {/* 结果 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {done ? (
          <div style={{
            padding: 32, borderRadius: 12, textAlign: 'center',
            background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.3)',
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', margin: '0 auto 14px',
              background: 'rgba(34,197,94,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Icon name="check" size={26} color="#22c55e" strokeWidth={2.5} /></div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#22c55e', marginBottom: 7 }}>
              {T.export.complete}
            </div>
            <div style={{
              fontSize: 11.5, color: '#5b6678', marginBottom: 18, lineHeight: 1.6,
              padding: '8px 11px', borderRadius: 7, background: 'rgba(15,23,42,0.048)',
              border: '1px solid rgba(15,23,42,0.096)', wordBreak: 'break-all', textAlign: 'left',
            }}>
              {savedPath}
            </div>
            <Btn variant="success" size="lg" onClick={render} disabled={rendering}>
              <Icon name="refresh" size={14} />{rendering ? '导出中…' : '重新导出'}
            </Btn>
          </div>
        ) : (
          <div style={{
            padding: 40, borderRadius: 12, textAlign: 'center', color: '#7c8798',
            background: 'rgba(15,23,42,0.032)', border: '1px dashed rgba(15,23,42,0.16)',
          }}>
            <Icon name="download" size={34} color="#94a1b3" />
            <div style={{ fontSize: 12.5, marginTop: 12 }}>选择参数后点击「{T.export.render}」</div>
          </div>
        )}
      </div>
    </div>
  );
}

function OptGroup({ label, options, value, onChange }) {
  const opts = options.map((o) => (typeof o === 'string' ? { key: o, label: o } : o));
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10.5, color: '#4b5563', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {opts.map((o) => (
          <button key={o.key} onClick={() => onChange(o.key)}
            style={{
              padding: '5px 11px', borderRadius: 6, cursor: 'pointer', fontSize: 11.5,
              fontFamily: 'inherit', border: '1px solid',
              borderColor: value === o.key ? 'rgba(109,40,217,.5)' : 'rgba(15,23,42,0.16)',
              background: value === o.key ? 'rgba(109,40,217,.22)' : 'rgba(15,23,42,0.048)',
              color: value === o.key ? '#6d28d9' : '#5b6678',
              fontWeight: value === o.key ? 600 : 400,
            }}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

/** 导出上下文栏 */
export function ExportContext() {
  return (
    <>
      <CtxHead label="EXPORT" />
      <CtxBlock title={T.export.history}>
        <div style={{
          padding: '9px 11px', borderRadius: 7, background: 'rgba(15,23,42,0.048)',
          border: '1px solid rgba(15,23,42,0.112)', fontSize: 11.5,
        }}>
          <div style={{ color: '#374151' }}>Project_v1.mp4</div>
          <div style={{ color: '#7c8798', fontSize: 10, marginTop: 2 }}>2 小时前</div>
        </div>
      </CtxBlock>
    </>
  );
}

/* ══════════ 上下文栏小工具 ══════════ */
function CtxHead({ label }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <span style={{
        fontSize: 9.5, color: '#6d28d9', letterSpacing: '.1em', fontWeight: 600,
        background: 'rgba(109,40,217,.13)', padding: '3px 8px', borderRadius: 5,
      }}>CONTEXT / {label}</span>
    </div>
  );
}

function CtxBlock({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 10.5, color: '#4b5563', letterSpacing: '.05em', marginBottom: 6,
        paddingBottom: 5, borderBottom: '1px solid rgba(15,23,42,0.096)',
      }}>{title}</div>
      {children}
    </div>
  );
}
