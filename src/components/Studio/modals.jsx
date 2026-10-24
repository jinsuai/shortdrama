import React, { useState, useRef, useEffect } from 'react';
import { T } from './i18n';
import { Icon, Btn, Pill, Modal, Field, Seg } from './ui';
import { splitGrid, releaseGridParts } from '../../lib/grid-split.js';
import { looksNonHuman, NEG_BASE, NEG_NON_HUMAN } from '../../lib/asset-anatomy.js';
import { ImageLightbox } from '../ImageLightbox.jsx';
import { generatePanelTTS } from '../../lib/media-workflows.js';
// 工作台两槽（主图/三视图）的提示词构造：与 steps1.jsx 的「派生造型直接出图」共用同一份
import { buildWorkbenchPrompt } from '../../lib/prompts.js';

/* ══════════ 1. 实体属性配置 ══════════ */
export function EntityModal({ entity, onClose, onSave }) {
  const [form, setForm] = useState({
    desc: entity?.appearance || entity?.desc || '',
    age: entity?.age || 25,
    gender: entity?.gender || '男',
    clothing: entity?.clothing || '',
    weight: entity?.weight || 4,
  });
  // 组件常驻挂载（entity=null 时仅隐藏），必须在切换实体时重置表单，
  // 否则上一个实体的编辑内容会残留、保存时污染下一个实体
  useEffect(() => {
    if (entity) {
      setForm({
        desc: entity.appearance || entity.desc || '',
        age: entity.age || 25,
        gender: entity.gender || '男',
        clothing: entity.clothing || '',
        weight: entity.weight || 4,
      });
    }
  }, [entity?.id, entity?.name]);
  if (!entity) return null;
  const isScene = entity.type === 'scene';

  return (
    <Modal
      open={!!entity}
      onClose={onClose}
      title={`${isScene ? '场景' : '角色'} · ${entity.name || entity.title}`}
      subtitle={T.entity.title}
      width={520}
      footer={
        <Btn variant="primary" onClick={() => { onSave?.({ ...entity, ...form }); onClose?.(); }}>
          <Icon name="check" size={13} />{T.entity.save}
        </Btn>
      }
    >
      <Field label={T.entity.visual} value={form.desc} onChange={(v) => setForm({ ...form, desc: v })} multiline rows={3} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label={T.entity.age} value={form.age} onChange={(v) => setForm({ ...form, age: v })} />
        <Field label={T.entity.gender} value={form.gender} onChange={(v) => setForm({ ...form, gender: v })} />
      </div>
      <Field label={T.entity.clothing} value={form.clothing} onChange={(v) => setForm({ ...form, clothing: v })} />

      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 11.5, color: '#5b6678', marginBottom: 7 }}>{T.entity.weight}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setForm({ ...form, weight: n })}
              style={{
                width: 42, height: 34, borderRadius: 7, cursor: 'pointer', fontSize: 13,
                fontFamily: 'inherit', fontWeight: 600, border: '1px solid',
                borderColor: form.weight === n ? '#8b5cf6' : 'rgba(15,23,42,0.192)',
                background: form.weight === n ? 'rgba(109,40,217,.25)' : 'rgba(15,23,42,0.048)',
                color: form.weight === n ? '#6d28d9' : '#5b6678',
              }}>{n}</button>
          ))}
        </div>
        <div style={{ fontSize: 10.5, color: '#4b5563', marginTop: 7 }}>{T.entity.weightHint}</div>
      </div>
    </Modal>
  );
}

/* ══════════ 2. 角色工作台（主图 / 三视图 两栏）══════════ */
// 提示词按资产类型区分（character/scene/prop）的逻辑抽到 lib/prompts.js 的 buildWorkbenchPrompt，
// 与「派生造型直接出图」共用同一份，避免漂移。
// 保留「主图 + 三视图」两个槽位：主图与三视图共同作为资产封面与后续分镜/视频的参考图。
// 头像特写已取消（不再生成，也不在 UI 暴露）。
const WB_SLOTS = [
  {
    key: 'master', label: T.workbench.master, desc: T.workbench.masterDesc, hasMotion: true,
    prompt: (n, d, a) => buildWorkbenchPrompt('master', n, d, a?.type),
  },
  {
    key: 'threeViews', label: T.workbench.threeViews, desc: T.workbench.threeViewsDesc, hasMotion: false,
    prompt: (n, d, a) => buildWorkbenchPrompt('threeViews', n, d, a?.type),
  },
];

export function WorkbenchModal({ asset, onClose, onGenerate, onSaveAsset, generating = null }) {
  const [variant, setVariant] = useState({ master: 1, threeViews: 1 });
  const [mode, setMode] = useState({ master: 'static' });
  const [neg, setNeg] = useState(() => (
    looksNonHuman(asset?.name, asset?.appearance || asset?.desc)
      ? NEG_BASE + NEG_NON_HUMAN
      : NEG_BASE
  ));
  const [applyStyle, setApplyStyle] = useState(true);
  const [lightbox, setLightbox] = useState(null);
  // 真音色样本（进视频用）：本地 dataURL 临时态 + 切角色时回填
  const [voiceData, setVoiceData] = useState(asset?.voiceAudio || '');
  const [voiceName, setVoiceName] = useState(asset?.voiceName || '');
  const [voiceDescLocal, setVoiceDescLocal] = useState(asset?.voiceDesc || '');
  const [ttsText, setTtsText] = useState('');
  const [genState, setGenState] = useState('idle');
  useEffect(() => {
    setVoiceData(asset?.voiceAudio || '');
    setVoiceName(asset?.voiceName || '');
    setVoiceDescLocal(asset?.voiceDesc || '');
    setTtsText(asset?.voiceDesc ? '' : `你好，我是${asset?.name || ''}。`);
    setGenState('idle');
  }, [asset]);

  // 用 TTS 合成一段人声样本（Qwen3TTS），存为角色真音色样本（进视频 ref_audio 用）
  const handleGenVoice = async () => {
    if (genState === 'busy') return;
    setGenState('busy');
    try {
      const vd = voiceDescLocal || asset?.voiceDesc || '';
      const txt = (ttsText || '').trim() || `你好，我是${asset?.name || '角色'}。`;
      const { resultUrl } = await generatePanelTTS({ text: txt, voiceDesc: vd });
      if (!resultUrl) throw new Error('TTS 未返回音频地址');
      setVoiceData(resultUrl);
      setVoiceName('TTS样本');
      onSaveAsset?.({ id: asset.id, voiceAudio: resultUrl, voiceName: 'TTS样本', voiceAudioKind: 'url', voiceDesc: vd });
    } catch (e) {
      console.warn('[真音色样本] TTS 生成失败：', e?.message || e);
      setGenState('idle');
    }
  };
  if (!asset) return null;

  const desc = asset.appearance || asset.desc || '';
  const name = asset.name || asset.title || '';

  return (
    <Modal
      open={!!asset}
      onClose={onClose}
      title={T.workbench.title(name)}
      subtitle={`💡 ${T.workbench.tip}`}
      width={1120}
    >
      {asset.type === 'character' && (
        <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: 'rgba(109,40,217,.06)', border: '1px solid rgba(109,40,217,.22)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2937' }}>🎙 真音色样本（进视频用）</div>
            <span style={{ fontSize: 10, color: '#4b5563' }}>可上传音频，或用 TTS 生成</span>
          </div>

          {/* 当前样本展示 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            {voiceData ? (
              <>
                <span style={{ fontSize: 11, color: '#6d28d9', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🎵 {voiceName || '音色样本'}</span>
                <audio controls src={voiceData} style={{ height: 30, maxWidth: 220 }} />
                <button
                  onClick={() => { setVoiceData(''); setVoiceName(''); onSaveAsset?.({ id: asset.id, voiceAudio: '', voiceName: '', voiceAudioKind: '' }); }}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(15,23,42,0.224)', background: 'transparent', color: '#5b6678', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
                >移除</button>
              </>
            ) : (
              <span style={{ fontSize: 11, color: '#4b5563' }}>尚未配置样本</span>
            )}
          </div>

          {/* 入口一：上传本地音频 */}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(109,40,217,.5)', color: '#6d28d9', fontSize: 11.5, cursor: 'pointer', background: 'rgba(109,40,217,.12)' }}>
            <Icon name="upload" size={13} /> 上传音频（≤12MB）
            <input type="file" accept="audio/*" style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                if (f.size > 12 * 1024 * 1024) { console.warn('[音色] 文件过大（>12MB），请压缩后再上传'); return; }
                const reader = new FileReader();
                reader.onload = () => {
                  const dataUrl = reader.result;
                  setVoiceData(dataUrl);
                  setVoiceName(f.name);
                  onSaveAsset?.({ id: asset.id, voiceAudio: dataUrl, voiceName: f.name, voiceAudioKind: 'data' });
                };
                reader.readAsDataURL(f);
                e.target.value = '';
              }} />
          </label>

          {/* 入口二：用 TTS 合成人声样本（Qwen3TTS） */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed rgba(15,23,42,0.192)' }}>
            <div style={{ fontSize: 11, color: '#5b6678', marginBottom: 6 }}>或用 TTS 生成（按下方音色描述，合成一段人声样本进视频）</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={voiceDescLocal}
                onChange={(e) => { setVoiceDescLocal(e.target.value); onSaveAsset?.({ id: asset.id, voiceDesc: e.target.value }); }}
                placeholder="音色描述，如：成熟男性，低沉磁性，中年"
                style={{ flex: 1, minWidth: 170, padding: '5px 9px', borderRadius: 6, fontSize: 11.5, background: 'rgba(15,23,42,0.048)', border: '1px solid rgba(15,23,42,0.16)', color: '#374151', fontFamily: 'inherit', outline: 'none' }}
              />
              <input
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                placeholder="样本台词（可留空用默认）"
                style={{ flex: 1, minWidth: 150, padding: '5px 9px', borderRadius: 6, fontSize: 11.5, background: 'rgba(15,23,42,0.048)', border: '1px solid rgba(15,23,42,0.16)', color: '#374151', fontFamily: 'inherit', outline: 'none' }}
              />
              <button
                onClick={handleGenVoice}
                disabled={genState === 'busy'}
                style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(109,40,217,.5)', background: genState === 'busy' ? 'rgba(109,40,217,.08)' : 'rgba(109,40,217,.16)', color: genState === 'busy' ? '#4b5563' : '#6d28d9', fontSize: 11.5, cursor: genState === 'busy' ? 'default' : 'pointer', fontFamily: 'inherit' }}
              >{genState === 'busy' ? '生成中…' : '✨ 生成样本'}</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {WB_SLOTS.map((s) => (
          <div key={s.key} style={{
            padding: 12, borderRadius: 10, background: 'rgba(15,23,42,0.048)',
            border: '1px solid rgba(15,23,42,0.128)',
          }}>
            {/* 标题 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1f2937' }}>{s.label}</div>
              {s.hasMotion && (
                <Seg
                  options={[{ key: 'static', label: T.workbench.static }, { key: 'motion', label: T.workbench.motion }]}
                  value={mode[s.key]} onChange={(v) => setMode({ ...mode, [s.key]: v })}
                />
              )}
            </div>
            <div style={{ fontSize: 10.5, color: '#4b5563', marginBottom: 9, lineHeight: 1.5 }}>{s.desc}</div>

            {/* 图 */}
            <div
              onClick={() => { const u = asset[`${s.key}Url`]; if (u) setLightbox(u); }}
              style={{
                aspectRatio: '3/4', borderRadius: 8, marginBottom: 9, cursor: 'zoom-in',
                background: 'rgba(15,23,42,0.08)', border: '1px solid rgba(15,23,42,0.128)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              }}>
              {asset[`${s.key}Url`]
                ? <img src={asset[`${s.key}Url`]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 10.5, color: '#7c8798' }}>{T.workbench.zoom}</span>}
            </div>

            {/* 版本 */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 9 }}>
              {[1, 2, 3, 4].map((n) => (
                <button key={n} onClick={() => setVariant({ ...variant, [s.key]: n })}
                  style={{
                    flex: 1, padding: '4px 0', borderRadius: 5, cursor: 'pointer', fontSize: 10.5,
                    fontFamily: 'inherit', border: '1px solid',
                    borderColor: variant[s.key] === n ? 'rgba(109,40,217,.5)' : 'rgba(15,23,42,0.16)',
                    background: variant[s.key] === n ? 'rgba(109,40,217,.2)' : 'transparent',
                    color: variant[s.key] === n ? '#6d28d9' : '#4b5563',
                  }}>x{n}</button>
              ))}
            </div>

            <Btn size="sm" variant="primary" style={{ width: '100%', marginBottom: 10 }}
              disabled={generating === s.key}
              onClick={() => onGenerate?.(asset, s.key, s.prompt(name, desc, asset), neg)}>
              <Icon name="sparkle" size={12} />
              {generating === s.key ? T.workbench.generating : T.workbench.generate}
            </Btn>

            {/* Prompt */}
            <div style={{ fontSize: 9.5, color: '#4b5563', letterSpacing: '.06em', marginBottom: 4 }}>
              {T.workbench.prompt}
            </div>
            <textarea value={s.prompt(name, desc, asset)} readOnly
              style={{
                width: '100%', height: 88, background: 'rgba(15,23,42,0.06)', borderRadius: 6,
                border: '1px solid rgba(15,23,42,0.128)', padding: '7px 8px',
                color: '#8b93a5', fontSize: 10, lineHeight: 1.5, resize: 'none',
                fontFamily: 'Consolas,Monaco,monospace', outline: 'none',
              }} />
          </div>
        ))}
      </div>

      {/* 底部 */}
      <div style={{
        marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(15,23,42,0.128)',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
      }}>
        <div>
          <div style={{ fontSize: 10.5, color: '#4b5563', marginBottom: 5 }}>{T.workbench.negativePrompt}</div>
          <textarea value={neg} onChange={(e) => setNeg(e.target.value)} rows={3}
            style={{
              width: '100%', background: 'rgba(15,23,42,0.06)', borderRadius: 6,
              border: '1px solid rgba(15,23,42,0.128)', padding: '7px 8px',
              color: '#5b6678', fontSize: 10.5, lineHeight: 1.55, resize: 'vertical',
              fontFamily: 'Consolas,Monaco,monospace', outline: 'none',
            }} />
        </div>
        <div>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5,
            color: '#5b6678', cursor: 'pointer', marginBottom: 9,
          }}>
            <input type="checkbox" checked={applyStyle} onChange={(e) => setApplyStyle(e.target.checked)}
              style={{ accentColor: '#8b5cf6' }} />
            {T.workbench.applyStyle}
          </label>
          <div style={{ fontSize: 10, color: '#4b5563', marginBottom: 4, letterSpacing: '.05em' }}>
            {T.workbench.styleAppend}
          </div>
          <div style={{
            background: 'rgba(109,40,217,.08)', border: '1px solid rgba(109,40,217,.2)',
            borderRadius: 6, padding: '7px 9px', fontSize: 10.5, color: '#6d28d9', lineHeight: 1.55,
          }}>
            traditional chinese ink wash, soft brush strokes, monochromatic palette…
          </div>
        </div>
      </div>
      {lightbox && <ImageLightbox src={lightbox} alt={name} onClose={() => setLightbox(null)} />}
    </Modal>
  );
}

/* ══════════ 3. 新建系列 ══════════ */
export function CreateSeriesModal({ open, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  return (
    <Modal open={open} onClose={onClose} title={T.dialog.createSeries} width={480}
      footer={
        <>
          <Btn onClick={onClose}>{T.dialog.cancel}</Btn>
          <Btn variant="primary" disabled={!title.trim()}
            onClick={() => { onCreate?.({ title: title.trim(), description: desc.trim() }); onClose?.(); }}>
            {T.dialog.create}
          </Btn>
        </>
      }>
      <Field label={T.dialog.seriesTitle} value={title} onChange={setTitle} placeholder={T.dialog.seriesTitlePh} />
      <Field label={T.dialog.seriesDesc} value={desc} onChange={setDesc}
        placeholder={T.dialog.seriesDescPh} multiline rows={3} />
    </Modal>
  );
}

/* ══════════ 4. 新建项目（可粘贴原文）═════════ */
export function CreateProjectModal({ open, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  return (
    <Modal open={open} onClose={onClose} title={T.dialog.createProject} width={560}
      footer={
        <>
          <Btn onClick={onClose}>{T.dialog.cancel}</Btn>
          <Btn variant="primary" disabled={!title.trim()}
            onClick={() => { onCreate?.({ title: title.trim(), text }); onClose?.(); }}>
            {T.dialog.create}
          </Btn>
        </>
      }>
      <Field label={T.dialog.projectTitle} value={title} onChange={setTitle} placeholder={T.dialog.projectTitlePh} />
      <Field label={T.dialog.projectText} value={text} onChange={setText}
        placeholder={T.dialog.projectTextPh} multiline rows={8} />
    </Modal>
  );
}

/* ══════════ 5. 导入文件（.txt/.md/.docx）═════════ */
export function ImportFileModal({ open, onClose, onImport }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');

  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (ext !== 'txt' && ext !== 'md' && ext !== 'docx') { setErr(T.dialog.importErr); setFile(null); return; }
    setErr(''); setFile(f);
    setTitle(f.name.replace(/\.(txt|md|docx)$/, ''));
  };

  return (
    <Modal open={open} onClose={onClose} title={T.dialog.importFile} width={520}
      footer={
        <>
          <Btn onClick={onClose}>{T.dialog.cancel}</Btn>
          <Btn variant="primary" disabled={!file || !title.trim()}
            onClick={() => { onImport?.({ file, title: title.trim() }); onClose?.(); }}>
            {T.dialog.create}
          </Btn>
        </>
      }>
      <div style={{
        padding: '20px', borderRadius: 9, textAlign: 'center', cursor: 'pointer', marginBottom: 14,
        background: 'rgba(15,23,42,0.048)', border: '1px dashed rgba(15,23,42,0.288)',
      }}
        onClick={() => document.getElementById('studio-import-input')?.click()}>
        <Icon name="upload" size={26} color="#4b5563" />
        <div style={{ fontSize: 12, color: '#5b6678', marginTop: 9 }}>
          {file ? file.name : '点击选择文件'}
        </div>
        <div style={{ fontSize: 10.5, color: '#7c8798', marginTop: 4 }}>{T.dialog.importTip}</div>
        <input id="studio-import-input" type="file" accept=".txt,.md,.docx" hidden onChange={pick} />
      </div>
      {err && (
        <div style={{
          padding: '8px 11px', borderRadius: 7, marginBottom: 12, fontSize: 11.5, color: '#f87171',
          background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.28)',
        }}>{err}</div>
      )}
      <Field label={T.dialog.projectTitle} value={title} onChange={setTitle} placeholder={T.dialog.projectTitlePh} />
    </Modal>
  );
}

/* ══════════ 6. 宫格拆分（分镜用）══════════ */
const GRID_SPECS = [
  { key: '2x2', cols: 2, rows: 2 },
  { key: '3x3', cols: 3, rows: 3 },
  { key: '5x5', cols: 5, rows: 5 },
  { key: '4x1', cols: 4, rows: 1 },
  { key: '1x4', cols: 1, rows: 4 },
];

/**
 * 把一张宫格合图拆成独立小图，拆完可直接写入分镜帧。
 * onApply(parts) —— parts 所有权转交调用方，由调用方负责 releaseGridParts。
 */
export function GridSplitModal({ open, onClose, onApply, log, initialSrc = '', initialSpec = '' }) {
  const [url, setUrl] = useState('');
  const [file, setFile] = useState(null);
  const [spec, setSpec] = useState('2x2');
  const [gutter, setGutter] = useState(0);
  const [busy, setBusy] = useState(false);
  const [parts, setParts] = useState([]);
  const [err, setErr] = useState('');
  const owned = useRef(false); // 是否已把 parts 交给调用方

  const cur = GRID_SPECS.find((s) => s.key === spec) || GRID_SPECS[0];

  // 打开时若调用方传了预填值（生成宫格后自动带入），写入对应输入
  useEffect(() => {
    if (open && initialSrc) { setUrl(initialSrc); setFile(null); }
    if (open && initialSpec) { setSpec(initialSpec); setParts([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSrc, initialSpec]);

  const doSplit = async () => {
    setErr('');
    const src = file || url.trim();
    if (!src) { setErr('请填写宫格图片地址，或选择本地图片文件'); return; }
    setBusy(true);
    try {
      if (!owned.current && parts.length) releaseGridParts(parts);
      owned.current = false;
      const out = await splitGrid(src, { cols: cur.cols, rows: cur.rows, gutter: Number(gutter) || 0 });
      setParts(out);
      log?.(`宫格拆分完成：${out.length} 张（${cur.cols}×${cur.rows}）`);
    } catch (e) {
      setErr((e && e.message) || String(e));
      setParts([]);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (!owned.current) releaseGridParts(parts);
    setParts([]); setUrl(''); setFile(null); setErr('');
    onClose?.();
  };

  const apply = () => {
    if (!parts.length) return;
    owned.current = true;           // 所有权转交，close 时不释放
    onApply?.(parts);
    setParts([]); setUrl(''); setFile(null); setErr('');
    onClose?.();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="宫格拆分"
      subtitle="把分镜工作流返回的 N 宫格合图，拆成独立帧写入分镜"
      width={760}
      footer={
        <>
          <Btn onClick={close}>取消</Btn>
          <Btn variant="primary" disabled={!parts.length} onClick={apply}>
            <Icon name="check" size={13} />写入分镜（{parts.length}）
          </Btn>
        </>
      }
    >
      <Field label="宫格图片地址" value={url} onChange={(v) => { setUrl(v); setFile(null); }}
        placeholder="粘贴面板返回的合图 URL" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 14px' }}>
        <Btn size="sm" onClick={() => document.getElementById('studio-grid-input')?.click()}>
          <Icon name="upload" size={12} />选择本地图片
        </Btn>
        <span style={{ fontSize: 11.5, color: '#4b5563' }}>
          {file ? file.name : '或直接用本地文件（不受跨域限制）'}
        </span>
        <input id="studio-grid-input" type="file" accept="image/*" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setUrl(''); } }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11.5, color: '#5b6678', marginBottom: 6 }}>宫格规格</div>
          <Seg options={GRID_SPECS.map((s) => ({ key: s.key, label: s.key }))} value={spec}
            onChange={(v) => { setSpec(v); setParts([]); }} />
        </div>
        <div style={{ width: 130 }}>
          <div style={{ fontSize: 11.5, color: '#5b6678', marginBottom: 6 }}>格子缝隙(px)</div>
          <input value={gutter} onChange={(e) => setGutter(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="0"
            style={{
              width: '100%', padding: '7px 9px', borderRadius: 7, fontSize: 12,
              background: 'rgba(15,23,42,0.064)', border: '1px solid rgba(15,23,42,0.16)',
              color: '#374151', fontFamily: 'inherit', outline: 'none',
            }} />
        </div>
        <div style={{ paddingTop: 20 }}>
          <Btn size="sm" variant="primary" disabled={busy} onClick={doSplit}>
            <Icon name="sparkle" size={12} />{busy ? '拆分中…' : '开始拆分'}
          </Btn>
        </div>
      </div>

      {err && (
        <div style={{
          padding: '8px 11px', borderRadius: 7, marginBottom: 12, fontSize: 11.5, color: '#f87171',
          background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.28)', whiteSpace: 'pre-wrap',
        }}>{err}</div>
      )}

      {parts.length > 0 && (
        <>
          <div style={{ fontSize: 11.5, color: '#5b6678', marginBottom: 8 }}>
            拆分结果（左→右、上→下，共 {parts.length} 张，单张 {parts[0].width}×{parts[0].height}）
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: `repeat(${cur.cols}, 1fr)`, gap: 10,
            maxHeight: 320, overflowY: 'auto', padding: 4,
          }}>
            {parts.map((p) => (
              <div key={p.index}>
                <div style={{
                  fontSize: 10.5, color: '#4b5563', marginBottom: 5,
                  fontFamily: 'Consolas,Monaco,monospace',
                }}>#{String(p.index + 1).padStart(2, '0')}</div>
                <div style={{
                  borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(15,23,42,0.192)',
                  background: 'rgba(15,23,42,0.07)',
                }}>
                  <img src={p.objectUrl} alt="" style={{ width: '100%', display: 'block' }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
