import React, { useState, useRef, useMemo, useEffect } from 'react';
import { convertFileSrc } from '../../lib/tauri-shim.js';
import { T, RATIOS, RESOLUTIONS, SHOT_TYPES, defaultModelKey, defaultRatio, defaultPolishEngine, videoWf, videoModelOptions, videoModelLabel } from './i18n';
import { Icon, Btn, Pill, Seg, Empty, Slider, Modal } from './ui';
import { generatePanelVideo, generatePanelTTS } from '../../lib/media-workflows.js';
import { extractTail } from '../../dispatch-jobs.js';
import { persistGridParts, releaseGridParts } from '../../lib/grid-split.js';
import { mergeClips, b64ToObjectUrl, saveToLocal } from '../../lib/merge.js';
import { DispatchGlmClient } from '@dual/glm-client';
import { analyzeStoryboard, generateKeyframeShot, DEFAULT_SHOT_COUNT } from '../../lib/storyboard.js';
import { videoPolishSystemPrompt, refineVideoPromptU00 } from '../../lib/prompts.js';
import { GridSplitModal } from './modals';
import { characterFourView } from '../../utils.js';

const P = { padding: '18px 22px' };

/* ══════════════ 步骤 4：分镜 ══════════════ */
export function StoryboardStep({ project, update, log }) {
  const shots = project?.shots || [];
  const chars = project?.materials?.characters || [];
  // 选中的分镜存在 project 上，右侧详情栏才能同步（同一个 project 数据源）
  const sel = project?.storyboardSel ?? null;
  const setSel = (v) => update?.({ storyboardSel: v });
  const [analyzing, setAnalyzing] = useState(false);      // 「生成分镜」= LLM 分析剧本
  const [genIdx, setGenIdx] = useState(-1);               // 正在生图的分镜下标
  const [scriptOpen, setScriptOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [genUrl, setGenUrl] = useState('');               // 手动拆分用的宫格图

  /** 宫格拆分结果写入分镜帧：逐帧覆盖，帧数不足则追加 */
  const applyGridParts = async (parts) => {
    try {
      const next = [...shots];
      parts.forEach((p, i) => {
        const patch = { imageUrl: p.objectUrl };
        if (next[i]) next[i] = { ...next[i], ...patch };
        else next.push({ id: `shot-${Date.now()}-${i}`, sceneDesc: `分镜 ${i + 1}`, ...patch });
      });
      update({ shots: next });
      log?.(`已写入 ${parts.length} 帧分镜画面`);

      // 落盘：让用户拿到 4 张独立图片文件
      const saved = await persistGridParts(parts, { log });
      const ok = saved.filter((s) => s.path).length;
      const withPath = next.map((s, i) => (saved[i]?.path ? { ...s, imagePath: saved[i].path } : s));
      if (ok) update({ shots: withPath });
      log?.(ok ? `已导出 ${ok} 张独立图片到下载目录` : '图片未落盘（仅本次会话可见）');
    } finally {
      releaseGridParts(parts);
    }
  };

  /** ① 生成分镜：LLM 分析整篇剧本 → 每个分镜的动作 / 台词 / 运镜 / 首帧提示词 */
  const doAnalyze = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    try {
      const list = await analyzeStoryboard({
        script: project?.script,
        style: project?.artDirection?.style || '',
        characters: chars,
        scenes: project?.materials?.scenes || [],
        count: DEFAULT_SHOT_COUNT,
        onLog: log,
      });
      update?.({ shots: list, storyboardSel: 0 });
      log?.(`已生成 ${list.length} 个分镜（含首帧提示词），可逐个点「生成首帧图」`);
    } catch (e) {
      log?.(`生成分镜失败：${e?.message || e}`);
    } finally {
      setAnalyzing(false);
    }
  };

  /** ② 逐个生成：第 i 个分镜的首帧图（静止起始，预览与视频 i2v 首帧共用一张） */
  const genOne = async (i, refsOverride) => {
    if (genIdx >= 0) return;
    const shot = shots[i]; if (!shot) return;
    setGenIdx(i);
    try {
      // 🔴 只生成首帧图：不再单独生成「分镜图」。这张图既作预览，也作视频首帧
      const { resultUrl, workflowId, refs } = await generateKeyframeShot({
        shot,
        refs: refsOverride || shot.refs || [],
        characters: project?.materials?.characters || [],
        scenes: project?.materials?.scenes || [],
        props: project?.materials?.props || [],
        onLog: log,
      });
      update?.({
        shots: shots.map((s, k) => (k === i ? { ...s, imageUrl: resultUrl, refs } : s)),
      });
      log?.(`第 ${i + 1} 个分镜首帧已生成（${workflowId}）`);
    } catch (e) {
      log?.(`第 ${i + 1} 个分镜首帧生成失败：${e?.message || e}`);
    } finally {
      setGenIdx(-1);
    }
  };

  /** 分镜帧编辑：移动/复制/下载/删除/新增 */
  const patchShots = (next) => update?.({ ...project, shots: next });
  const moveShot = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= shots.length) return;
    const next = [...shots]; [next[i], next[j]] = [next[j], next[i]]; patchShots(next);
  };
  const duplicateShot = (i) => {
    const next = [...shots]; next.splice(i + 1, 0, { ...shots[i], id: `shot-${Date.now()}` }); patchShots(next);
  };
  const deleteShot = (i) => patchShots(shots.filter((_, k) => k !== i));
  const downloadShot = async (i) => {
    const s = shots[i]; if (!s?.imageUrl) { log?.('该帧无图，无法下载'); return; }
    try { const p = await saveToLocal(s.imageUrl, `frame_${i + 1}_${Date.now()}.png`); log?.(`已保存：${p}`); }
    catch (e) { log?.(`保存失败：${e?.message || e}`); }
  };
  const insertShot = () => patchShots([...shots, { id: `shot-${Date.now()}`, sceneDesc: '新分镜' }]);
  const onFrameAction = (i, action) => {
    if (action === 'arrowUp') moveShot(i, -1);
    else if (action === 'arrowDown') moveShot(i, 1);
    else if (action === 'copy') duplicateShot(i);
    else if (action === 'download') downloadShot(i);
    else if (action === 'trash') deleteShot(i);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        ...P, paddingTop: 14, paddingBottom: 12, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: '1px solid rgba(15,23,42,0.096)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="film" size={16} color="#6d28d9" />
          <span style={{ fontSize: 14.5, fontWeight: 600, color: '#1f2937' }}>{T.storyboard.title}</span>
          <Btn size="sm" onClick={() => setScriptOpen(true)}>{T.storyboard.viewScript}</Btn>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Btn size="sm" variant="primary" onClick={doAnalyze} disabled={analyzing}>
            <Icon name="sparkle" size={12} />{analyzing ? '分析剧本中…' : T.storyboard.generate}
          </Btn>
          <Btn size="sm" onClick={() => setGridOpen(true)} title="导入一张宫格图，手动切分后写入分镜">
            <Icon name="grid" size={12} />宫格拆分
          </Btn>
          <span style={{ fontSize: 11.5, color: '#4b5563' }}>{T.storyboard.frames(shots.length)}</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <button onClick={insertShot} style={{
          width: '100%', padding: '9px', marginBottom: 12, borderRadius: 8, cursor: 'pointer',
          background: 'rgba(15,23,42,0.048)', border: '1px dashed rgba(15,23,42,0.24)',
          color: '#5b6678', fontSize: 12, fontFamily: 'inherit',
        }}><Icon name="plus" size={13} /> {T.storyboard.insert}</button>

        {shots.length === 0
          ? <Empty icon="film" text={T.storyboard.empty} />
          : shots.map((s, i) => (
            <FrameRow key={s.id || i} shot={s} idx={i} index={i + 1} active={sel === i}
              generating={genIdx === i}
              onClick={() => setSel(sel === i ? null : i)}
              onAction={onFrameAction} onGenerate={genOne} />
          ))}
      </div>

      <GridSplitModal open={gridOpen} onClose={() => setGridOpen(false)}
        onApply={applyGridParts} log={log}
        initialSrc={genUrl}
        initialSpec="3x3" />

      <Modal open={scriptOpen} onClose={() => setScriptOpen(false)}
        title="剧本原文" subtitle="Storyboard · Script" width={760}
        footer={<Btn onClick={() => setScriptOpen(false)}>关闭</Btn>}>
        <pre style={{
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
          fontSize: 12.5, lineHeight: 1.8, color: '#4b5563', fontFamily: 'inherit',
          maxHeight: '60vh', overflowY: 'auto',
        }}>{project?.script || '（剧本为空，请先在第 1 步「剧本」里输入内容）'}</pre>
      </Modal>
    </div>
  );
}

function FrameRow({ shot, idx, index, active, generating, onClick, onAction, onGenerate }) {
  const [hover, setHover] = useState(false);
  const iconBtn = {
    width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer',
    background: 'transparent', color: '#4b5563',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  };

  return (
    <div onClick={onClick} style={{
      display: 'flex', gap: 13, padding: 12, borderRadius: 10, marginBottom: 9, cursor: 'pointer',
      background: active ? 'rgba(109,40,217,.09)' : 'rgba(15,23,42,0.048)',
      border: `1px solid ${active ? 'rgba(109,40,217,.4)' : 'rgba(15,23,42,0.112)'}`,
      transition: 'all .15s',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: 'rgba(109,40,217,.2)', color: '#6d28d9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700,
      }}>{index}</div>

      {/* 画面：未生成时悬停出「生成画面」，已生成时悬停出「重新生成」 */}
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{
          position: 'relative', width: 168, aspectRatio: '16/9', borderRadius: 7, flexShrink: 0,
          overflow: 'hidden', background: 'rgba(15,23,42,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        {shot.imageUrl
          ? <img src={shot.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 10.5, color: '#7c8798' }}>{T.storyboard.noImage}</span>}

        {(generating || hover) && (
          <button
            onClick={(e) => { e.stopPropagation(); if (!generating) onGenerate?.(idx); }}
            disabled={generating}
            style={{
              position: 'absolute', left: 6, right: 6, bottom: 6, padding: '5px 0',
              borderRadius: 6, border: 'none', cursor: generating ? 'wait' : 'pointer',
              background: generating ? 'rgba(109,40,217,.85)' : 'rgba(109,40,217,.92)',
              color: '#fff', fontSize: 10.5, fontWeight: 600, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}>
            <Icon name="sparkle" size={11} />
            {generating ? '生成中…' : (shot.imageUrl ? '重新生成' : '生成画面')}
          </button>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          <Pill tone="purple">{T.storyboard.action}</Pill>
          <span style={{ fontSize: 11, color: '#6d28d9' }}>{shot.cameraMove || '静止'}</span>
        </div>
        <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, marginBottom: 7 }}>
          {shot.sceneDesc || shot.title || '—'}
        </div>
        {shot.dialogue && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <Pill>{T.storyboard.dialogue}</Pill>
            <span style={{ fontSize: 11.5, color: '#5b6678', lineHeight: 1.5 }}>{shot.dialogue}</span>
          </div>
        )}

        {/* 底部操作行：左 排序，右 复制/下载/删除（与设计稿一致） */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 'auto', paddingTop: 6 }}>
          {[['arrowUp', '上移'], ['arrowDown', '下移']].map(([ic, t]) => (
            <button key={ic} title={t}
              onClick={(e) => { e.stopPropagation(); onAction?.(idx, ic); }}
              style={iconBtn}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#6d28d9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#4b5563'; }}>
              <Icon name={ic} size={13} />
            </button>
          ))}
          <div style={{ flex: 1 }} />
          {[['copy', '复制'], ['download', '下载'], ['trash', '删除']].map(([ic, t]) => (
            <button key={ic} title={t}
              onClick={(e) => { e.stopPropagation(); onAction?.(idx, ic); }}
              style={iconBtn}
              onMouseEnter={(e) => { e.currentTarget.style.color = ic === 'trash' ? '#ef4444' : '#6d28d9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#4b5563'; }}>
              <Icon name={ic} size={13} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 软件内可选图片（角色图 / 场景图 / 道具图 / 首帧图 / 素材图）——参考图槽位从这里选。
 * opts.view=true 时，角色参考图优先用四视图而非主图(imageUrl)，
 *   用于动态演绎角色驱动（r2v）：四视图是正/侧/背/特写参考，比单张主图更利于人物一致性。
 * （分镜步骤的 RefSlots 走默认，仍用主图，避免图生图编辑被四视图干扰。）
 * 🔴 四视图字段名历史分裂（fourView / threeViewsUrl / fourViews），统一走 characterFourView，
 *    否则在角色管理生成的四视图这里读不到。
 */
function collectLibImages(project, opts = {}) {
  const preferView = !!opts.view;
  const list = [];
  (project?.materials?.characters || []).forEach((c, i) => {
    const tv = characterFourView(c);
    const mv = c.imageUrl;
    if (!tv && !mv) return;
    const useView = preferView && tv;
    list.push({
      key: `char-${c.id || i}`,
      url: useView ? tv : (mv || tv),
      label: `角色 · ${useView ? '三视图 · ' : ''}${c.name || i + 1}`,
    });
  });
  // 🔴 场景图 / 道具图：用户已在资产步骤生成，必须纳入分镜参考图候选（之前漏了，导致只能选人物图）
  (project?.materials?.scenes || []).forEach((s, i) => {
    if (s.imageUrl) list.push({ key: `scene-${s.id || i}`, url: s.imageUrl, label: `场景 · ${s.name || i + 1}` });
  });
  (project?.materials?.props || []).forEach((p, i) => {
    if (p.imageUrl) list.push({ key: `prop-${p.id || i}`, url: p.imageUrl, label: `道具 · ${p.name || i + 1}` });
  });
  (project?.shots || []).forEach((s, i) => {
    if (s.imageUrl) list.push({ key: `shot-${s.id || i}`, url: s.imageUrl, label: `分镜 ${i + 1} 画面` });
  });
  (project?.assets || []).forEach((a, i) => {
    const u = a?.url || a?.imageUrl;
    if (u) list.push({ key: `asset-${a?.id || i}`, url: u, label: a?.name || `资产 · ${i + 1}` });
  });
  return list;
}

/** 选本地图片文件 → dataURL */
function pickLocalFile(cb) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = () => {
    const f = input.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => cb(r.result);
    r.readAsDataURL(f);
  };
  input.click();
}

/** 参考图槽位：最多 3 张，优先软件内选，其次上传本地 */
function RefSlots({ project, refs = [], max = 3, onChange }) {
  const [open, setOpen] = useState(-1);
  const lib = collectLibImages(project);
  const slots = Array.from({ length: max }, (_, i) => refs[i] || null);
  const put = (i, url) => {
    const n = slots.slice(); n[i] = url; onChange(n.filter(Boolean)); setOpen(-1);
  };
  const clear = (i) => {
    const n = slots.slice(); n[i] = null; onChange(n.filter(Boolean));
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
      {slots.map((r, i) => (
        <div key={i} style={{ position: 'relative' }}>
          <div onClick={() => setOpen(open === i ? -1 : i)} style={{
            aspectRatio: '1', borderRadius: 7, overflow: 'hidden', cursor: 'pointer',
            background: 'rgba(15,23,42,0.048)',
            border: `1px solid ${r ? 'rgba(109,40,217,.45)' : 'rgba(15,23,42,0.192)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {r
              ? <img src={r} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 10, color: '#4b5563' }}>{i === 0 ? '+ 主参考' : `+ 参考${i + 1}`}</span>}
          </div>

          {r && (
            <button onClick={(e) => { e.stopPropagation(); clear(i); }} title="清除"
              style={{
                position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%',
                border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1,
                background: 'rgba(0,0,0,.7)', color: '#fff',
              }}>×</button>
          )}

          {open === i && (
            <div style={{
              position: 'absolute', zIndex: 40, top: '100%', left: 0, marginTop: 4, width: 186,
              padding: 6, borderRadius: 7, maxHeight: 210, overflowY: 'auto',
              background: '#1f1f23', border: '1px solid rgba(15,23,42,0.24)',
              boxShadow: '0 8px 24px rgba(0,0,0,.5)',
            }}>
              {lib.length === 0
                ? <div style={{ fontSize: 10.5, color: '#4b5563', padding: 4 }}>软件内暂无图片</div>
                : lib.map((img, k) => (
                  <div key={k} onClick={() => put(i, img.url)} style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: 5, borderRadius: 5,
                    cursor: 'pointer', fontSize: 10.5, color: '#5b6678',
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(109,40,217,.12)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <img src={img.url} alt="" style={{ width: 26, height: 26, borderRadius: 4, objectFit: 'cover' }} />
                    <span>{img.label}</span>
                  </div>
                ))}
              <div onClick={() => { setOpen(-1); pickLocalFile((d) => put(i, d)); }} style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: 5, borderRadius: 5,
                cursor: 'pointer', fontSize: 10.5, color: '#6d28d9',
                borderTop: '1px solid rgba(15,23,42,0.128)', marginTop: 4,
              }}>
                <Icon name="upload" size={12} />上传本地图片
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** 分镜上下文栏：选中分镜的详情编辑 + 逐个生图 */
export function StoryboardContext({ project, update, log }) {
  const shots = project?.shots || [];
  const sel = project?.storyboardSel ?? null;
  const shot = sel != null ? shots[sel] : null;
  const [busy, setBusy] = useState(false);

  const patchShot = (patch) => {
    if (sel == null) return;
    update?.({ shots: shots.map((s, i) => (i === sel ? { ...s, ...patch } : s)) });
  };

  const gen = async () => {
    if (busy || !shot) return;
    setBusy(true);
    try {
      // 🔴 只生成首帧图（不再单独生成分镜图）：预览与视频首帧共用这一张
      const { resultUrl, workflowId, refs } = await generateKeyframeShot({
        shot,
        refs: shot.refs || [],
        ratio: shot.ratio || defaultRatio('shot'),
        characters: project?.materials?.characters || [],
        scenes: project?.materials?.scenes || [],
        props: project?.materials?.props || [],
        onLog: log,
      });
      patchShot({ imageUrl: resultUrl, refs });
      log?.(`第 ${sel + 1} 个分镜首帧已生成（${workflowId}）`);
    } catch (e) {
      log?.(`生成失败：${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  if (!shot) {
    return (
      <>
        <CtxHead label="STORYBOARD" />
        <div style={{ fontSize: 11.5, color: '#4b5563', lineHeight: 1.7 }}>{T.storyboard.selectHint}</div>
        <div style={{ fontSize: 10.5, color: '#7c8798', marginTop: 10, lineHeight: 1.6 }}>💡 {T.storyboard.tip}</div>
      </>
    );
  }

  const ta = {
    width: '100%', background: 'rgba(15,23,42,0.064)', border: '1px solid rgba(15,23,42,0.144)',
    borderRadius: 6, padding: '7px 8px', color: '#374151', fontSize: 11.5, lineHeight: 1.6,
    fontFamily: 'inherit', resize: 'vertical', outline: 'none',
  };
  const label = { fontSize: 10.5, color: '#4b5563', marginBottom: 4, marginTop: 10 };

  return (
    <>
      <CtxHead label="STORYBOARD" />
      <CtxBlock title={`分镜 ${sel + 1} 详情`}>
        <div style={label}>动作（ACTION）</div>
        <textarea rows={3} value={shot.sceneDesc || ''} style={ta}
          onChange={(e) => patchShot({ sceneDesc: e.target.value })} />

        <div style={label}>台词（DIALOGUE）</div>
        <textarea rows={2} value={shot.dialogue || ''} style={ta}
          onChange={(e) => patchShot({ dialogue: e.target.value })} />

        <div style={label}>景别与运镜</div>
        <input value={shot.cameraMove || ''} style={ta}
          onChange={(e) => patchShot({ cameraMove: e.target.value })} />

        <div style={label}>首帧提示词（图生图 · 即视频第 0 秒，静止起始）</div>
        <textarea rows={6} value={shot.firstFramePrompt || ''} style={ta}
          onChange={(e) => patchShot({ firstFramePrompt: e.target.value })} />

        <div style={label}>视频运动提示词（动态过程：时长 / 运镜 / 动作 / 特效）</div>
        <textarea rows={5} value={shot.videoPrompt || ''} style={ta}
          onChange={(e) => patchShot({ videoPrompt: e.target.value })} />

        <div style={label}>参考图（必须选，最多 3 张；优先软件内选）</div>
        <RefSlots project={project} refs={shot.refs || []} onChange={(r) => patchShot({ refs: r })} />
        <div style={{ fontSize: 10, color: '#7c8798', marginTop: 6, lineHeight: 1.6 }}>
          只用你选的参考图生成，不使用任何默认图；1 张走单图编辑，2 张走双图，3 张走三图
        </div>

        <div style={label}>画幅比例</div>
        <Seg options={RATIOS.map((r) => ({ key: r, label: r }))}
          value={shot.ratio || defaultRatio('shot')}
          onChange={(v) => patchShot({ ratio: v })} />

        <Btn variant="primary" onClick={gen} disabled={busy} style={{ width: '100%', marginTop: 12 }}>
          <Icon name="sparkle" size={12} />
          {busy ? '生成中…' : (shot.imageUrl ? '重新生成首帧图' : '生成首帧图')}
        </Btn>

        {shot.imageUrl && (
          <img src={shot.imageUrl} alt="" style={{
            width: '100%', marginTop: 10, borderRadius: 7, border: '1px solid rgba(15,23,42,0.16)',
          }} />
        )}
      </CtxBlock>
    </>
  );
}

/* ══════════════ 步骤 5：动态演绎 ══════════════ */
// 驱动模式语义（与交互设计稿一致）：
//   i2v = 首帧驱动 → 首帧/尾帧图控制画面起止
//   r2v = 角色驱动 → 角色参考图驱动人物外貌
/* ══════════════ 步骤 5：动态演绎 ══════════════ */
// 2026-10-22 重写：取消 i2v / r2v 互斥切换，改成一张「全选填」的素材表单。
//   首帧 / 尾帧 / 参考图(≤9) / 驱动音频 都是选填，一次提交；
//   没填的槽位由 buildVideoValues 用占位素材兜底（不能传空串，ComfyUI 会找不到文件）。
//   目标分镜可多选 → 串行批量生成，各自回写到对应分镜。
export function MotionStep({ project, update, log }) {
  // ⚠️ 必须先声明 shots / lib，再放进 useState 的初值里（否则 TDZ）
  const shots = project?.shots || [];
  const lib = collectLibImages(project, { view: true });
  const m = project?.motion || {};

  const [firstUrl, setFirstUrl] = useState(m.firstUrl || '');      // 首帧（选填）
  const [lastUrl, setLastUrl] = useState(m.lastUrl || '');         // 尾帧（选填）
  const [refUrls, setRefUrls] = useState(m.refUrls || []);         // 参考图（选填，≤9）
  const [audioMode, setAudioMode] = useState(m.audioMode || 'auto'); // auto | asset | none
  const [audioUrl, setAudioUrl] = useState(m.audioUrl || '');      // audioMode=asset 时指定
  const [targets, setTargets] = useState(m.targets || []);         // 目标分镜（多选批量）
  const [prompt, setPrompt] = useState(m.prompt || '');
  const [polishOn, setPolishOn] = useState(m.polish !== false);
  const [polishEngine, setPolishEngine] = useState(m.polishEngine || defaultPolishEngine());
  const [polishing, setPolishing] = useState(false);
  const [clearAfter, setClearAfter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  const engine = m.engine || defaultModelKey('video');
  const ratio = m.ratio || defaultRatio('video');
  const duration = m.duration || 5;
  const negative = m.negative || '';
  const wf = videoWf(engine, 'i2v');

  /** 本页参数写回 project.motion（切步骤 / 刷新不丢） */
  const save = (patch) => update?.({ motion: { ...m, ...patch } });

  const shotPrompt = (i) => {
    const sh = shots[i];
    // 🔴 视频运动提示词 ≠ 首帧描述：videoPrompt 专写动态过程（时长/运镜/动作/特效），首帧描述只用于生成首帧图
    return sh
      ? String(sh.videoPrompt || sh.sceneDesc || '').trim()
      : '';
  };
  const autoRef = useRef(m.prompt || '');

  /** 图片候选 = 首帧图 + 素材库（角色三视图 / 场景 / 道具 / 资产） */
  const imgCandidates = useMemo(() => {
    const fromShots = shots
      .map((sh, i) => ({ url: sh.imageUrl, label: `首帧 ${i + 1}` }))
      .filter((x) => x.url);
    return fromShots.concat(lib.map((x) => ({ url: x.url, label: x.label })));
  }, [shots, lib]);

  /** 素材库里的音频（配音步骤生成的会带 type:'audio'） */
  const audioAssets = useMemo(
    () => (project?.assets || []).filter((a) => {
      if (a?.type === 'audio') return true;
      return /\.(mp3|wav|flac|m4a|ogg|aac)(\?|$)/i.test(String(a?.url || ''));
    }),
    [project?.assets],
  );

  /** 取某一镜的驱动音频：auto 模式下优先复用已生成配音，没有就按台词现场合成 */
  const resolveAudio = async (idx) => {
    if (audioMode === 'none') return '';
    if (audioMode === 'asset') return audioUrl || '';
    const sh = shots[idx] || {};
    const existing = pickDubbedAudio(project, sh, idx);
    if (existing) {
      log?.(`第 ${idx + 1} 镜：复用已生成配音`);
      return existing;
    }
    const text = shotDialogueText(sh);
    if (!text) {
      log?.(`第 ${idx + 1} 镜：没有台词，不带驱动音频`);
      return '';
    }
    log?.(`第 ${idx + 1} 镜：正在合成配音…`);
    const { resultUrl } = await generatePanelTTS({ text });
    return resultUrl || '';
  };

  /** 生成单个分镜并回写到该镜 */
  const genOne = async (idx, k, total, onProgress) => {
    const sh = shots[idx] || {};
    setProgress(T.motion.batchRunning(k + 1, total));
    log?.(`正在生成第 ${idx + 1} 镜 · ${wf}`);

    // 素材兜底（用户规则）：
    //   首帧：填了用填的 → 本镜首帧图 → 上一分镜视频尾帧（跨镜衔接）
    //   尾帧：填了用填的 → 下一分镜首帧图 → 本镜首帧图（最后一镜兜底）
    let first = firstUrl || sh.imageUrl || '';
    if (!first && idx > 0) {
      const prev = shots[idx - 1] || {};
      const prevVideo = prev.videoRemoteUrl || prev.videoUrl || '';
      if (prevVideo) {
        try {
          log?.(`第 ${idx + 1} 镜无本镜首帧，正在提取上一镜视频尾帧…`);
          const { frame_url } = await extractTail(prevVideo);
          if (frame_url) {
            first = frame_url;
            log?.(`第 ${idx + 1} 镜已用上一镜视频尾帧作为首帧`);
          }
        } catch (e) {
          log?.(`第 ${idx + 1} 镜提取上一镜尾帧失败，按无首帧继续：${e?.message || e}`);
        }
      }
    }
    const last = lastUrl || shots[idx + 1]?.imageUrl || sh.imageUrl || '';

    // 🔴 本页提示词框非空时会覆盖分镜自己的 videoPrompt —— 用户看到的是分镜里的词、
    // 提交的却是这里的一条，是「提示词对不上」最常见的成因，所以保留原值以便日志里说清来源。
    const basePrompt = String(prompt || '').trim() || shotPrompt(idx);
    const overridesShot = !!String(prompt || '').trim() && !!shotPrompt(idx)
      && basePrompt !== shotPrompt(idx);
    let finalPrompt = basePrompt;

    // 提示词润色（失败按原词继续）
    if (polishOn && finalPrompt) {
      setPolishing(true);
      try {
        if (polishEngine === 'u00') {
          const polished = String(
            await refineVideoPromptU00({
              shot: sh,
              mode: 'i2v',
              duration,
              camera: sh.cameraMove || '',
              style: project?.materials?.style || project?.style || '',
              referenceImages: [first, last].concat(refUrls),
            }),
          ).trim();
          if (polished) finalPrompt = polished;
        } else {
          const camera = sh.cameraMove || '';
          const userInput = [
            `视频时长：${duration} 秒`,
            camera ? `分镜标注的景别与运镜：${camera}` : '',
            `原始提示词：${finalPrompt}`,
          ].filter(Boolean).join('\n');
          const client = new DispatchGlmClient();
          const polished = String(
            await client.chat(videoPolishSystemPrompt('i2v').replace('{{user_input}}', userInput),
              { llmType: 'prompt_refine', maxTokens: 900, temperature: 0.7 }),
          ).trim();
          if (polished) finalPrompt = polished;
        }
      } catch (pe) {
        log?.(`第 ${idx + 1} 镜润色失败，按原提示词生成：${pe?.message || pe}`);
      } finally {
        setPolishing(false);
      }
    }

    // 把「这一镜到底提交了什么」写进日志：用户能直接跟分镜里显示的提示词对上，
    // 不用猜是本页覆盖、还是润色改写、还是分镜本身为空。
    {
      const polished = finalPrompt !== basePrompt;
      const src = !basePrompt ? '（空）'
        : overridesShot ? '本页提示词框（已覆盖该分镜原文）'
        : '分镜视频运动提示词';
      log?.(`第 ${idx + 1} 镜提示词来源：${src}${polished ? ' → 已润色改写' : ''}`);
      const shown = finalPrompt.length > 240 ? `${finalPrompt.slice(0, 240)}…` : finalPrompt;
      log?.(`第 ${idx + 1} 镜提交提示词：${shown || '（空）'}`);
    }

    const audio = await resolveAudio(idx);

    const { resultUrl } = await generatePanelVideo({
      engine, mode: m.videoMode || '', prompt: finalPrompt, negative,
      images: refUrls, firstFrame: first, lastFrame: last,
      duration, ratio, audio,
      // 上游排队/限流的重试进度回传，让队列条目显示「等待上游空位」而不是干等
      onProgress,
    });

    // 🔴 播放修复：把成片拉回本地用 asset:// 播放（远程 URL 关机/签名过期就播不了）
    let playUrl = resultUrl;
    let videoPath = '';
    try {
      if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
        videoPath = await saveToLocal(resultUrl, `shot_${idx + 1}_${Date.now()}.mp4`);
        playUrl = convertFileSrc(videoPath);
      }
    } catch (pe) {
      log?.(`第 ${idx + 1} 镜本地缓存失败，改用远程地址：${pe?.message || pe}`);
    }

    // 🔴 用函数式 update 读最新 project，保证变体是追加而不是被压成单条
    update?.((p) => {
      const curShots = p?.shots || [];
      const cur = curShots[idx] || {};
      const variants = [
        ...(cur.variants || []),
        { url: playUrl, remoteUrl: resultUrl, at: Date.now(), engine, mode: 'unified' },
      ];
      const nextShots = curShots.map((sx, i) => (i === idx
        ? { ...sx, videoUrl: playUrl, videoRemoteUrl: resultUrl, videoPath, variants }
        : sx));
      return {
        ...p,
        shots: nextShots,
        videos: [...(p?.videos || []),
          { url: playUrl, remoteUrl: resultUrl, path: videoPath, engine, mode: 'unified', wf, at: Date.now() }],
      };
    });
    log?.(`第 ${idx + 1} 个分镜视频已生成（${videoModelLabel()} · ${duration}s）`);
    return playUrl;
  };

  /**
   * 维护「生成队列」：每镜一条任务写进 project.motion.jobs，右侧「队列」页据此实时渲染。
   * 🔴 之前这里完全没有任务数据 —— 队列页是一句写死的「暂无任务」，
   *    用户点「加入生成队列」后看不到任何反馈，表现就是"提交了没反应"。
   * 用函数式 update 读最新 project，避免闭包拿到旧快照。
   */
  const patchJobs = (fn) => update?.((p) => {
    const cur = p?.motion || {};
    const curJobs = Array.isArray(cur.jobs) ? cur.jobs : [];
    // 只保留最近 30 条，避免 project 存档无限膨胀
    return { ...p, motion: { ...cur, jobs: fn(curJobs).slice(-30) } };
  });

  const submit = async () => {
    if (busy) return;
    if (!shots.length) {
      // 没有任何分镜时，原来只往底部日志写一行，界面看起来像"点了没反应"——
      // 现在同步显示在按钮上方的进度条位置，确保用户一定能看到为什么没开始。
      setProgress('还没有分镜：请先到「分镜」步骤生成分镜，再回来生成视频');
      log?.(T.motion.noShotYet);
      return;
    }
    // 没勾目标分镜 → 默认只生成第 1 镜（明确告诉用户，避免"点了没反应/生成错镜"的困惑）
    let list = targets.slice().sort((x, y) => x - y).filter((i) => i >= 0 && i < shots.length);
    if (!list.length) {
      log?.('未勾选目标分镜，默认只生成第 1 镜');
      list = [0];
    }

    // ① 先把任务登记进队列（queued）—— 点完立刻能在右侧「队列」看到，不再是死按钮
    const stamp = Date.now();
    const jobIds = list.map((_, k) => `vjob-${stamp}-${k}`);
    patchJobs((jobs) => [
      ...jobs,
      ...list.map((si, k) => ({
        id: jobIds[k], shotIndex: si, status: 'queued', progress: '排队中',
        url: '', error: '', at: stamp,
      })),
    ]);

    setBusy(true);
    let ok = 0;
    try {
      for (let k = 0; k < list.length; k++) {
        const jobId = jobIds[k];
        // ② 开跑：状态 running（队列页显示"第 N 镜 · 生成中 k/总数"）
        patchJobs((jobs) => jobs.map((j) => (j.id === jobId
          ? { ...j, status: 'running', progress: `生成中 ${k + 1}/${list.length}`, startedAt: Date.now() }
          : j)));
        // 上游进度回传：排队满/限流时把「等待空位（重试 n/m）」写进队列条目，
        // 免得用户只看到「生成中」却不知为何半天没结果。
        const onProgress = (status, extra) => {
          let text = '';
          if (status === 'retry') {
            text = `上游排队中，等待空位（重试 ${extra?.attempt || 1}/${extra?.max || 5}）`;
            log?.(`第 ${list[k] + 1} 镜：${text}，${Math.round((extra?.waitMs || 0) / 1000)} 秒后重试`);
          } else if (typeof extra === 'string' && extra) {
            text = extra;                 // generatePanelVideo 收尾传的 '完成'
          } else if (/queued|pending/i.test(String(status))) {
            text = '上游排队中…';
          } else if (/in_progress|processing|running/i.test(String(status))) {
            text = '上游生成中…';
          }
          if (text) {
            patchJobs((jobs) => jobs.map((j) => (j.id === jobId ? { ...j, progress: text } : j)));
          }
        };
        try {
          const url = await genOne(list[k], k, list.length, onProgress);
          ok += 1;
          patchJobs((jobs) => jobs.map((j) => (j.id === jobId
            ? { ...j, status: 'done', progress: '已完成', url: url || '', endedAt: Date.now() }
            : j)));
        } catch (e) {
          const msg = e?.message || String(e);
          log?.(`第 ${list[k] + 1} 镜失败：${msg}`);
          // ③ 失败也留在队列里，把原因写清楚，便于用户对照设置排查
          patchJobs((jobs) => jobs.map((j) => (j.id === jobId
            ? { ...j, status: 'error', progress: '失败', error: msg, endedAt: Date.now() }
            : j)));
        }
      }
      log?.(T.motion.batchDone(ok));
      if (clearAfter) { setPrompt(''); autoRef.current = ''; }
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const setFirst = (u) => { setFirstUrl(u); save({ firstUrl: u }); };
  const setLast = (u) => { setLastUrl(u); save({ lastUrl: u }); };
  const toggleRef = (u) => {
    const next = refUrls.includes(u) ? refUrls.filter((x) => x !== u) : [...refUrls, u].slice(0, 9);
    setRefUrls(next);
    save({ refUrls: next });
  };
  const setAMode = (v) => { setAudioMode(v); save({ audioMode: v }); };
  const setAUrl = (u) => { setAudioUrl(u); save({ audioUrl: u }); };
  const toggleTarget = (i) => {
    const next = targets.includes(i) ? targets.filter((x) => x !== i) : [...targets, i];
    setTargets(next);
    save({ targets: next });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 22px 15px', borderBottom: '1px solid rgba(15,23,42,0.096)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 5 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#1f2937', letterSpacing: '.01em' }}>
            {T.motion.title}
          </span>
          <span style={{ fontSize: 11.5, color: '#4b5563' }}>Motion</span>
        </div>
        <div style={{ fontSize: 11.5, color: '#4b5563' }}>{T.motion.materialsSub}</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 26px' }}>
        <ImageSlot
          label={T.motion.firstFrameOpt} sub={T.motion.firstFrameOptSub}
          value={firstUrl} onChange={setFirst} candidates={imgCandidates}
          onUpload={() => pickLocalFile(setFirst)} />

        <ImageSlot
          label={T.motion.lastFrameOpt} sub={T.motion.lastFrameOptSub}
          value={lastUrl} onChange={setLast} candidates={imgCandidates}
          onUpload={() => pickLocalFile(setLast)} />

        <RefGrid
          lib={lib} urls={refUrls} onToggle={toggleRef}
          onUpload={() => pickLocalFile((u) => u && toggleRef(u))}
          onClear={() => { setRefUrls([]); save({ refUrls: [] }); }} />

        <AudioBlock
          mode={audioMode} onMode={setAMode} url={audioUrl} onUrl={setAUrl}
          assets={audioAssets} />

        <TargetShots
          shots={shots} targets={targets} onToggle={toggleTarget}
          onAll={() => { const all = shots.map((_, i) => i); setTargets(all); save({ targets: all }); }}
          onNone={() => { setTargets([]); save({ targets: [] }); }} />

        {/* 提示词 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#374151' }}>{T.motion.prompt}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ opacity: polishOn ? 1 : 0.4, pointerEvents: polishOn ? 'auto' : 'none' }}>
              <Seg
                options={[
                  { key: 'u00', label: T.motion.polishU00 },
                  { key: 'llm', label: T.motion.polishLlm },
                ]}
                value={polishEngine}
                onChange={(v) => {
                  setPolishEngine(v);
                  save({ polishEngine: v });
                  try {
                    const st = JSON.parse(localStorage.getItem('APP_SETTINGS') || '{}');
                    st.defaultPrompts = { ...(st.defaultPrompts || {}), polishEngine: v };
                    localStorage.setItem('APP_SETTINGS', JSON.stringify(st));
                  } catch {}
                }}
              />
            </div>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
              color: polishOn ? '#6d28d9' : '#4b5563', cursor: 'pointer', userSelect: 'none',
            }}>
              <input type="checkbox" checked={polishOn} onChange={(e) => setPolishOn(e.target.checked)}
                style={{ accentColor: '#8b5cf6' }} />
              {T.motion.polish}
            </label>
          </div>
        </div>
        <textarea value={prompt} onChange={(e) => { setPrompt(e.target.value); save({ prompt: e.target.value }); }}
          placeholder={T.motion.promptPh}
          style={{
            width: '100%', minHeight: 76, background: 'rgba(15,23,42,0.064)',
            border: '1px solid rgba(15,23,42,0.144)', borderRadius: 8, padding: 11,
            color: '#374151', fontSize: 12.5, lineHeight: 1.6, resize: 'vertical',
            fontFamily: 'inherit', outline: 'none', marginBottom: 4,
          }} />
        {/* 🔴 提示词对不上，多半出在这里：本框非空会覆盖各分镜自己的视频运动提示词，
            润色开启又会再改写一遍。与其事后靠日志排查，不如在填的时候就说明白。 */}
        <div style={{ fontSize: 10.5, lineHeight: 1.6, color: '#5b6678', marginBottom: 14 }}>
          {String(prompt || '').trim()
            ? <>⚠ 本框有内容，将<b>覆盖</b>各分镜自己的视频运动提示词{/* 未勾选目标分镜时提交逻辑默认只跑第 1 镜，这里要跟它一致 */
              (targets.length || 1) > 1 ? `（当前 ${targets.length} 个分镜会共用这一条）` : ''}；清空本框才会用分镜原文。 </>
            : <>留空时使用各分镜自己的「视频运动提示词」。 </>}
          {polishOn && <>「{T.motion.polish}」已开启，提交给模型的是<b>润色改写后</b>的提示词。</>}
        </div>

        {!!progress && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10,
            fontSize: 11.5, color: '#6d28d9',
          }}>
            <Icon name="clock" size={13} />{progress}
          </div>
        )}

        <SubmitBar value={clearAfter} busy={busy} onChange={setClearAfter} onAdd={submit} />
      </div>
    </div>
  );
}

/** 该镜已生成的配音（来自 project.dubbingData，配音步骤合成的会写进去） */
function pickDubbedAudio(project, shot, shotIndex) {
  const dd = project?.dubbingData || {};
  if (!dd || !Object.keys(dd).length) return '';
  const key = shot?.id || `idx${shotIndex}`;
  const cnt = (shot?.dialogues && shot.dialogues.length) || (shot?.dialogue ? 1 : 0);
  for (let i = 0; i < cnt; i++) {
    const hit = dd[`dlg_${key}_${i}`]?.audioUrl || dd[`dlg_${shotIndex}_${i}`]?.audioUrl;
    if (hit) return hit;
  }
  return '';
}

/** 分镜台词文本（dialogues 数组 或 单条 dialogue 字符串） */
function shotDialogueText(shot) {
  const arr = shot?.dialogues;
  if (Array.isArray(arr) && arr.length) {
    return arr.map((d) => String(d?.text || d?.content || '').trim()).filter(Boolean).join(' ');
  }
  return String(shot?.dialogue || '').trim();
}

const linkBtn = {
  padding: 0, background: 'none', border: 'none', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 11.5, color: '#5b6678',
};

function slotBox(active) {
  return {
    width: 96, height: 54, flex: '0 0 auto', borderRadius: 7, overflow: 'hidden',
    position: 'relative', background: 'rgba(15,23,42,0.035)', cursor: 'pointer',
    border: `1px solid ${active ? 'rgba(109,40,217,.75)' : 'rgba(15,23,42,0.208)'}`,
    boxShadow: active ? '0 0 0 2px rgba(109,40,217,.22)' : 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'border-color .15s',
  };
}

/** 单图槽位（首帧 / 尾帧）：当前选中 + 横向候选缩略图 + 上传 + 清除 */
function ImageSlot({ label, sub, value, onChange, candidates = [], onUpload }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{label}</span>
          <span style={{ fontSize: 11, color: '#4b5563' }}>{sub}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onUpload} style={linkBtn}>{T.motion.upload}</button>
          {!!value && (
            <button onClick={() => onChange('')} style={linkBtn}>{T.motion.clearSel}</button>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        <div style={slotBox(!!value)} title={value ? '已指定，点击清除' : '未指定'}>
          {value
            ? <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 10.5, color: '#7c8798' }}>未指定</span>}
        </div>
        {candidates.map((c, i) => (
          <div key={`${c.url}-${i}`} style={slotBox(value === c.url)} title={c.label}
            onClick={() => onChange(value === c.url ? '' : c.url)}
            onMouseEnter={(e) => { if (value !== c.url) e.currentTarget.style.borderColor = 'rgba(109,40,217,.5)'; }}
            onMouseLeave={(e) => { if (value !== c.url) e.currentTarget.style.borderColor = 'rgba(15,23,42,0.208)'; }}>
            <img src={c.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 参考图多选（≤9） */
function RefGrid({ lib = [], urls = [], onToggle, onUpload, onClear }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{T.motion.refImgs}</span>
          <span style={{ fontSize: 11, color: '#4b5563' }}>{T.motion.refImgsSub}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: '#4b5563' }}>{T.motion.selCount(urls.length)}</span>
          <button onClick={onUpload} style={linkBtn}>{T.motion.upload}</button>
          {urls.length > 0 && <button onClick={onClear} style={linkBtn}>{T.motion.clearSel}</button>}
        </div>
      </div>
      {lib.length === 0 ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '9px 11px',
          background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.28)',
          borderRadius: 8, fontSize: 11.5, color: '#f59e0b',
        }}>
          <Icon name="alert" size={14} color="#f59e0b" />{T.motion.noCharWarn}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px 14px' }}>
          {lib.slice(0, 12).map((it) => {
            const active = urls.includes(it.url);
            return (
              <div key={it.key}>
                <div style={{
                  fontSize: 10.5, color: active ? '#6d28d9' : '#4b5563', marginBottom: 6,
                  letterSpacing: '.02em', fontFamily: 'Consolas,Monaco,monospace',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{it.label}</div>
                <div style={{
                  aspectRatio: '16/9', borderRadius: 9, overflow: 'hidden', position: 'relative',
                  background: 'rgba(15,23,42,0.035)', cursor: 'pointer',
                  border: `1px solid ${active ? 'rgba(109,40,217,.75)' : 'rgba(15,23,42,0.208)'}`,
                  boxShadow: active ? '0 0 0 2px rgba(109,40,217,.22)' : 'none',
                  transition: 'border-color .15s',
                }}
                  onClick={() => onToggle?.(it.url)}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = 'rgba(109,40,217,.5)'; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = 'rgba(15,23,42,0.208)'; }}>
                  <img src={it.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {active && (
                    <div style={{
                      position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: '50%',
                      background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon name="check" size={12} color="#fff" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 驱动音频：自动（有配音用配音 / 没有就合成）| 指定（素材库挑）| 无 */
function AudioBlock({ mode, onMode, url, onUrl, assets = [] }) {
  const hint = mode === 'auto' ? T.motion.audioAutoSub
    : mode === 'asset' ? T.motion.audioAssetSub : T.motion.audioNoneSub;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{T.motion.audioSrc}</span>
        <span style={{ fontSize: 11, color: '#4b5563' }}>{hint}</span>
      </div>
      <Seg
        options={[
          { key: 'auto', label: T.motion.audioAuto },
          { key: 'asset', label: T.motion.audioAsset },
          { key: 'none', label: T.motion.audioNone },
        ]}
        value={mode} onChange={onMode} />
      {mode === 'asset' && (
        <div style={{ marginTop: 10 }}>
          {assets.length === 0 ? (
            <div style={{ fontSize: 11.5, color: '#4b5563' }}>
              素材库里还没有音频，可先用「配音」步骤生成，或把模式改回「自动」。
            </div>
          ) : (
            assets.slice(0, 8).map((a, i) => {
              const active = url === a.url;
              return (
                <div key={a.id || i} onClick={() => onUrl?.(active ? '' : a.url)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px',
                    marginBottom: 6, borderRadius: 7, cursor: 'pointer',
                    background: active ? 'rgba(109,40,217,.12)' : 'rgba(15,23,42,0.048)',
                    border: `1px solid ${active ? 'rgba(109,40,217,.55)' : 'rgba(15,23,42,0.144)'}`,
                  }}>
                  <Icon name="mic" size={13} color={active ? '#6d28d9' : '#4b5563'} />
                  <span style={{
                    flex: 1, fontSize: 11.5, color: active ? '#374151' : '#5b6678',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{a.title || a.name || `音频 ${i + 1}`}</span>
                  {active && <Icon name="check" size={13} color="#6d28d9" />}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/** 目标分镜多选（批量排队） */
function TargetShots({ shots = [], targets = [], onToggle, onAll, onNone }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{T.motion.targetShots}</span>
          <span style={{ fontSize: 11, color: '#4b5563' }}>{T.motion.targetShotsSub}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: '#4b5563' }}>{T.motion.selCount(targets.length)}</span>
          <button onClick={onAll} style={linkBtn}>全选</button>
          <button onClick={onNone} style={linkBtn}>{T.motion.clearSel}</button>
        </div>
      </div>
      {shots.length === 0 ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '9px 11px',
          background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.28)',
          borderRadius: 8, fontSize: 11.5, color: '#f59e0b',
        }}>
          <Icon name="alert" size={14} color="#f59e0b" />{T.motion.noShotYet}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px 14px' }}>
          {shots.map((sh, i) => {
            const active = targets.includes(i);
            return (
              <div key={sh.id || i}>
                <div style={{
                  fontSize: 10.5, color: active ? '#6d28d9' : '#4b5563', marginBottom: 6,
                  letterSpacing: '.02em', fontFamily: 'Consolas,Monaco,monospace',
                }}>{`分镜 ${i + 1}`}</div>
                <div style={{
                  aspectRatio: '16/9', borderRadius: 9, overflow: 'hidden', position: 'relative',
                  background: 'rgba(15,23,42,0.035)', cursor: 'pointer',
                  border: `1px solid ${active ? 'rgba(109,40,217,.75)' : 'rgba(15,23,42,0.208)'}`,
                  boxShadow: active ? '0 0 0 2px rgba(109,40,217,.22)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'border-color .15s',
                }}
                  onClick={() => onToggle?.(i)}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = 'rgba(109,40,217,.5)'; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = 'rgba(15,23,42,0.208)'; }}>
                  {sh.imageUrl
                    ? <img src={sh.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 10.5, color: '#7c8798' }}>无画面</span>}
                  {active && (
                    <div style={{
                      position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: '50%',
                      background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon name="check" size={12} color="#fff" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 区块头：标题（中 + 英文小字） + 右侧「分镜」实心按钮 +「上传」文字按钮 */
function FrameSectionHead({ title, sub, onStoryboard, onUpload }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{title}</span>
        <span style={{ fontSize: 11, color: '#4b5563' }}>（{sub}）</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <Btn size="sm" variant="primary" onClick={onStoryboard}>
          <Icon name="film" size={12} />{T.motion.storyboard}
        </Btn>
        <button onClick={onUpload}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: 0, background: 'none',
            border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, color: '#5b6678',
            transition: 'color .15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#374151'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#5b6678'; }}>
          <Icon name="upload" size={13} />{T.motion.upload}
        </button>
      </div>
    </div>
  );
}

/** 3×9 图片槽位网格：编号在图卡上方（等宽字体），与设计稿一致；支持点选 */
function FrameGrid({ items = [], emptyText, selected = -1, onSelect }) {
  const slots = Array.from({ length: 9 }, (_, i) => items[i] || null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px 14px', marginBottom: 24 }}>
      {slots.map((s, i) => {
        const active = !!s && i === selected;
        return (
          <div key={s?.id || `slot-${i}`}>
            <div style={{
              fontSize: 10.5, color: active ? '#6d28d9' : '#4b5563', marginBottom: 6, letterSpacing: '.02em',
              fontFamily: 'Consolas,Monaco,monospace',
            }}>
              {s?.label || `#${String(i + 1).padStart(2, '0')}`}
            </div>
            <div style={{
              aspectRatio: '16/9', borderRadius: 9, overflow: 'hidden', position: 'relative',
              background: 'rgba(15,23,42,0.035)', cursor: s ? 'pointer' : 'default',
              border: `1px solid ${active ? 'rgba(109,40,217,.75)' : 'rgba(15,23,42,0.208)'}`,
              boxShadow: active ? '0 0 0 2px rgba(109,40,217,.22)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'border-color .15s',
            }}
              onClick={() => s && onSelect?.(i)}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = 'rgba(109,40,217,.5)'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = 'rgba(15,23,42,0.208)'; }}>
              {s?.imageUrl
                ? <img src={s.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 10.5, color: '#7c8798' }}>{emptyText}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 底部：全宽渐变「加入生成队列」+ 居中「提交后清空内容」 */
function SubmitBar({ value, onChange, onAdd, busy }) {
  return (
    <div>
      <button onClick={onAdd} disabled={!!busy}
        style={{
          width: '100%', padding: '13px 16px', border: 'none', borderRadius: 10,
          cursor: busy ? 'progress' : 'pointer',
          fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          background: busy ? 'rgba(99,102,241,.45)' : 'linear-gradient(135deg, #6366f1, #7c3aed)',
          boxShadow: '0 6px 20px -10px rgba(99,102,241,.55)', transition: 'filter .15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.12)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}>
        <Icon name="plus" size={16} />{busy ? T.motion.generating : T.motion.queueAdd}
      </button>
      <label style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        marginTop: 11, fontSize: 11.5, color: '#5b6678', cursor: 'pointer',
      }}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange?.(e.target.checked)}
          style={{ accentColor: '#8b5cf6' }} />
        {T.motion.clearAfter}
      </label>
    </div>
  );
}

/** 动态演绎上下文栏（运动参数 / 队列） */
export function MotionContext({ project, update }) {
  const [tab, setTab] = useState('params');
  // 参数落在 project.motion 上，与正文「加入生成队列」共享
  const saved = project?.motion || {};
  // 视频任务队列（submit 写入 project.motion.jobs），队列页据此渲染真实进度
  const jobs = Array.isArray(saved.jobs) ? saved.jobs : [];
  const [jobFilter, setJobFilter] = useState('all');
  // 进行中（排队 + 生成中）数量：标签上直接显示角标，并在有新任务时自动切到队列页，
  // 避免用户点了「加入生成队列」却待在「运动参数」页看不出任何变化。
  const pending = jobs.filter((j) => j.status === 'running' || j.status === 'queued').length;
  const prevPending = useRef(0);
  useEffect(() => {
    if (pending > 0 && prevPending.current === 0) setTab('queue');
    prevPending.current = pending;
  }, [pending]);
  const engine = saved.engine || defaultModelKey('video');
  const ratio = saved.ratio || defaultRatio('video');
  const dur = saved.duration || 5;
  const negative = saved.negative || '';
  // 🔴 镜头类型之前是本地 state 纯摆设：不落 project.motion、提交时也没用。现在持久化并参与润色
  const [shotType, setShotType] = useState(saved.shotType || 'single');
  const [res, setRes] = useState('720p');
  const [batch, setBatch] = useState('1x');
  // 视频模型卡片：显示「设置 → 视频模型」里实配的模型名，不再写死厂商/工作流
  const videoOptions = useMemo(() => videoModelOptions(), []);

  const put = (patch) => update?.({ ...project, motion: { ...saved, ...patch } });

  return (
    <>
      {/* 标签页：运动参数 / 队列 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {[['params', T.motion.params, 'sliders'], ['queue', T.motion.queue, 'layers']].map(([k, label, ic]) => {
          const active = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '7px 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5,
                borderRadius: 7, transition: 'all .15s',
                background: active ? 'rgba(15,23,42,0.112)' : 'transparent',
                border: `1px solid ${active ? 'rgba(15,23,42,0.208)' : 'transparent'}`,
                color: active ? '#1f2937' : '#4b5563', fontWeight: active ? 600 : 400,
              }}>
              <Icon name={ic} size={13} />{label}
              {k === 'queue' && pending > 0 && (
                <span style={{
                  minWidth: 15, height: 15, padding: '0 4px', borderRadius: 999,
                  background: '#6366f1', color: '#fff', fontSize: 9.5, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1,
                }}>{pending}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'params' ? (
        <>
          <CtxBlock title={T.motion.basic}>
            <div style={{ fontSize: 10.5, color: '#4b5563', marginBottom: 8 }}>
              {T.motion.model}（Model）
            </div>
            <ModelCards value={engine} onChange={(v) => put({ engine: v })} options={videoOptions} />

            <div style={{ marginTop: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, color: '#4b5563', marginBottom: 4 }}>
                {T.motion.duration} {dur}s
              </div>
              <Slider value={dur} min={2} max={15} onChange={(v) => put({ duration: v })} suffix="s" />
            </div>
            <div style={{ marginBottom: 6, fontSize: 10.5, color: '#4b5563' }}>{T.motion.shotType}</div>
            <Seg options={SHOT_TYPES} value={shotType} onChange={(v) => { setShotType(v); put({ shotType: v }); }} />
            {shotType === 'multi' && (
              <div style={{ fontSize: 10, color: '#4b5563', marginTop: 5, lineHeight: 1.5 }}>{T.motion.multiDesc}</div>
            )}
          </CtxBlock>

          <CtxBlock title={T.motion.quality}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, color: '#4b5563', marginBottom: 4 }}>{T.motion.ratio}</div>
              <Seg options={RATIOS.map((r) => ({ key: r, label: r }))} value={ratio}
                onChange={(v) => put({ ratio: v })} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, color: '#4b5563', marginBottom: 4 }}>{T.motion.resolution}</div>
              <Seg options={RESOLUTIONS.map((r) => ({ key: r, label: r }))} value={res} onChange={setRes} />
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: '#4b5563', marginBottom: 4 }}>{T.motion.batch}</div>
              <Seg options={['1x', '2x', '4x'].map((b) => ({ key: b, label: b }))} value={batch} onChange={setBatch} />
            </div>
          </CtxBlock>

          <CtxBlock title={T.motion.creative}>
            {/* 2026-10-22：音频模式已移到左侧「驱动素材」区（自动 / 指定 / 无），这里只做提示 */}
            <div style={{
              marginBottom: 10, padding: '7px 9px', borderRadius: 6, lineHeight: 1.5,
              background: 'rgba(109,40,217,.08)', border: '1px solid rgba(109,40,217,.22)',
              fontSize: 10.5, color: '#6d28d9',
            }}>
              驱动音频在左侧「驱动素材」区设置（自动 / 指定 / 无）
            </div>
            <div style={{ fontSize: 10.5, color: '#4b5563', marginBottom: 4 }}>{T.motion.negative}</div>
            <textarea rows={2} value={negative} onChange={(e) => put({ negative: e.target.value })}
              style={{
              width: '100%', background: 'rgba(15,23,42,0.06)', border: '1px solid rgba(15,23,42,0.144)',
              borderRadius: 5, padding: '6px 8px', color: '#5b6678', fontSize: 11,
              fontFamily: 'inherit', resize: 'vertical', outline: 'none',
            }} />
          </CtxBlock>

          <CtxBlock title={T.motion.advanced}>
            <div style={{ fontSize: 10.5, color: '#4b5563', marginBottom: 4 }}>{T.motion.seed}</div>
            <input placeholder="随机" style={{
              width: '100%', background: 'rgba(15,23,42,0.06)', border: '1px solid rgba(15,23,42,0.144)',
              borderRadius: 5, padding: '6px 8px', color: '#5b6678', fontSize: 11,
              fontFamily: 'inherit', outline: 'none',
            }} />
          </CtxBlock>
        </>
      ) : (
        <CtxBlock title={`${T.motion.queueTitle} · ${
          jobs.length
            ? `${jobs.filter((j) => j.status === 'running' || j.status === 'queued').length} 进行中 / ${jobs.length} 总计`
            : T.motion.gpuIdle
        }`}>
          <Seg options={[
            { key: 'all', label: T.motion.filterAll },
            { key: 'run', label: T.motion.filterRunning },
            { key: 'done', label: T.motion.filterDone },
          ]} value={jobFilter} onChange={setJobFilter} />
          {(() => {
            const shown = jobs.filter((j) => (
              jobFilter === 'all' ? true
                : jobFilter === 'run' ? (j.status === 'running' || j.status === 'queued')
                  : (j.status === 'done' || j.status === 'error')
            ));
            const list = shown.slice().reverse();   // 最新的在上
            if (!list.length) {
              return (
                <div style={{ marginTop: 12, fontSize: 11.5, color: '#7c8798', textAlign: 'center', padding: '20px 0' }}>
                  暂无任务
                </div>
              );
            }
            return (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {list.map((j) => {
                  const tone = j.status === 'done' ? '#16a34a'
                    : j.status === 'error' ? '#dc2626'
                      : j.status === 'running' ? '#6d28d9' : '#94a3b8';
                  return (
                    <div key={j.id} style={{
                      padding: '7px 9px', borderRadius: 7,
                      background: 'rgba(15,23,42,0.044)', border: '1px solid rgba(15,23,42,0.11)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: tone, flexShrink: 0 }} />
                        <span style={{ fontSize: 11.5, color: '#374151', fontWeight: 600 }}>
                          第 {(Number.isFinite(j.shotIndex) ? j.shotIndex : 0) + 1} 镜
                        </span>
                        <span style={{ fontSize: 10.5, color: tone, marginLeft: 'auto' }}>
                          {j.progress || j.status}
                        </span>
                      </div>
                      {j.error && (
                        <div style={{ fontSize: 10, color: '#dc2626', marginTop: 4, lineHeight: 1.5, wordBreak: 'break-all' }}>
                          {j.error}
                        </div>
                      )}
                      {j.url && (
                        <video src={j.url} muted playsInline
                          style={{ width: '100%', height: 64, objectFit: 'cover', borderRadius: 5, marginTop: 6, background: '#000' }} />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CtxBlock>
      )}
    </>
  );
}

/** 模型卡片列表（标题 + 描述，选中项紫框 + 圆点），替代原下拉 */
function ModelCards({ value, onChange, options = [] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button key={o.key} onClick={() => onChange?.(o.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
              padding: '11px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
              background: active ? 'rgba(109,40,217,.13)' : 'rgba(15,23,42,0.048)',
              border: `1px solid ${active ? 'rgba(109,40,217,.55)' : 'rgba(15,23,42,0.144)'}`,
              transition: 'all .15s',
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: active ? '#1f2937' : '#4b5563' }}>
                {o.label}
              </div>
              <div style={{ fontSize: 10.5, color: '#4b5563', marginTop: 3, lineHeight: 1.45 }}>{o.desc}</div>
            </div>
            {active && (
              <span style={{
                width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: '#8b5cf6',
                boxShadow: '0 0 0 3px rgba(109,40,217,.25)',
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ══════════════ 步骤 6：装配 ══════════════ */
export function AssemblyStep({ project, update, log }) {
  const shots = project?.shots || [];
  const ready = shots.filter((s) => s.videoUrl).length;
  const [busy, setBusy] = useState(false);

  /** 合并所有镜头视频为整片（带逐段字幕烧录）。结果写回 project.assembledVideo */
  const doMerge = async () => {
    if (busy) return;
    const clips = shots
      .filter((s) => s.videoUrl)
      .map((s) => ({ url: s.videoUrl, subtitle: s.dialogue || '', duration: 0, transition: 'none' }));
    if (!clips.length) { log?.('暂无可合并的视频片段，请先在「动态演绎」生成镜头'); return; }
    setBusy(true);
    log?.(`开始合并 ${clips.length} 个片段…`);
    try {
      const b64 = await mergeClips(clips, { burnSubtitles: true });
      const url = b64ToObjectUrl(b64);
      update?.({ ...project, assembledVideo: url });
      log?.('合并完成，已生成整片预览');
    } catch (e) {
      log?.(`合并失败：${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  /** 把合并后的成片落盘到本地 */
  const doDownload = async () => {
    const src = project?.assembledVideo;
    if (!src) { log?.('还没有成片，请先合并'); return; }
    const name = `${(project?.title || '短剧').replace(/[\\/:*?"<>|]/g, '_')}_${Date.now()}.mp4`;
    setBusy(true);
    log?.('正在保存到本地…');
    try {
      const path = await saveToLocal(src, name);
      log?.(`成片已保存：${path}`);
    } catch (e) {
      log?.(`保存失败：${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        ...P, paddingTop: 14, paddingBottom: 12, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: '1px solid rgba(15,23,42,0.096)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="layers" size={16} color="#6d28d9" />
          <span style={{ fontSize: 14.5, fontWeight: 600, color: '#1f2937' }}>{T.assembly.title}</span>
        </div>
        <span style={{ fontSize: 11.5, color: '#4b5563' }}>{T.assembly.ready(ready, shots.length)}</span>
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', padding: 16,
        backgroundImage: 'linear-gradient(rgba(15,23,42,0.038) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.038) 1px, transparent 1px)',
        backgroundSize: '30px 30px',
      }}>
        {shots.length === 0
          ? <Empty icon="film" text={T.storyboard.empty} />
          : shots.map((s, i) => {
            const rowSel = project?.assemblySel === i;
            const vCount = (s.variants?.length) || (s.videoUrl ? 1 : 0);
            return (
              <div key={s.id || i} onClick={() => update?.({ assemblySel: i })} style={{
                position: 'relative', display: 'flex', gap: 12, padding: '19px 12px 11px', borderRadius: 9, marginBottom: 9,
                background: rowSel ? 'rgba(109,40,217,.09)' : 'rgba(15,23,42,0.048)',
                border: `1px solid ${rowSel ? 'rgba(109,40,217,.45)' : 'rgba(15,23,42,0.112)'}`,
                alignItems: 'center', cursor: 'pointer', transition: 'all .15s',
              }}>
                <span style={{
                  position: 'absolute', top: 5, left: 9, fontSize: 9.5, fontWeight: 700, color: '#4b5563',
                }}>#{i + 1}</span>
                <div style={{
                  width: 118, aspectRatio: '16/9', borderRadius: 6, flexShrink: 0, overflow: 'hidden',
                  background: 'rgba(15,23,42,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                }}>
                  {s.videoUrl
                    ? <video src={s.videoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : null}
                  <div style={{ position: 'absolute', bottom: 5, left: 5 }}>
                    <Pill tone={s.videoUrl ? 'orange' : 'red'}>
                      {s.videoUrl ? T.assembly.selectVideo : T.assembly.noVideos}
                    </Pill>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, color: '#5b6678', lineHeight: 1.6, marginBottom: 5 }}>
                    {s.sceneDesc || s.title || T.storyboard.noPrompt}
                  </div>
                  {s.dialogue && (
                    <div style={{ fontSize: 11, color: '#4b5563', fontStyle: 'italic' }}>"{s.dialogue}"</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: rowSel ? '#6d28d9' : '#7c8798', marginTop: 6 }}>
                    <Icon name="clock" size={10} color={rowSel ? '#6d28d9' : '#7c8798'} />
                    <Icon name="grid" size={10} color={rowSel ? '#6d28d9' : '#7c8798'} />
                    {T.assembly.variants(vCount)}
                  </div>
                </div>
              </div>
            );
          })}

        <div style={{ display: 'flex', justifyContent: 'center', margin: '18px 0' }}>
          <Btn variant="outline" onClick={doMerge} disabled={busy}>
            <Icon name="layers" size={13} />{busy ? '合并中…' : T.assembly.merge}
          </Btn>
        </div>

        {project?.assembledVideo && (
          <div style={{
            display: 'flex', gap: 16, padding: 16, borderRadius: 10,
            background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.28)',
          }}>
            <video src={project.assembledVideo} style={{ width: 260, borderRadius: 7 }} controls />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                <Icon name="check" size={15} color="#22c55e" />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: '#22c55e' }}>{T.assembly.merged}</span>
              </div>
              <div style={{ fontSize: 11.5, color: '#5b6678', marginBottom: 12, lineHeight: 1.6 }}>
                {T.assembly.mergedDesc}
              </div>
              <div>
                <Btn variant="ghost" onClick={doDownload} disabled={busy}
                  style={{ background: '#374151', color: '#111827', fontWeight: 600, border: 'none' }}>
                  <Icon name="download" size={13} />{T.assembly.download}
                </Btn>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 装配上下文栏：变体面板（对齐 Studio Step 6 ——
 *  在时间轴选中某一镜后，这里列出该镜的所有视频变体（动态演绎每次生成都会入列），
 *  点「选择视频」把该变体设为最终分镜；合并时用各镜最终选中的那条。 */
export function AssemblyContext({ project, update, log }) {
  const shots = project?.shots || [];
  const sel = project?.assemblySel ?? null;
  const shot = sel != null ? shots[sel] : null;

  const pick = (url) => {
    if (sel == null || !url) return;
    update?.({ shots: shots.map((s, i) => (i === sel ? { ...s, videoUrl: url } : s)) });
    log?.(`第 ${sel + 1} 镜已切换为所选变体`);
  };

  if (!shot) {
    return (
      <>
        <CtxHead label="ASSEMBLY" />
        <CtxBlock title={T.assembly.variantsTitle}>
          <div style={{ fontSize: 11.5, color: '#4b5563', lineHeight: 1.7 }}>{T.assembly.variantsHint}</div>
        </CtxBlock>
      </>
    );
  }

  const variants = (shot.variants?.length
    ? shot.variants
    : (shot.videoUrl ? [{ url: shot.videoUrl, at: 0 }] : []));

  return (
    <>
      <CtxHead label="ASSEMBLY" />
      <CtxBlock title={`分镜 ${sel + 1} · ${T.assembly.variantsTitle}（${variants.length}）`}>
        {variants.length === 0 ? (
          <div style={{ fontSize: 11.5, color: '#4b5563', lineHeight: 1.7 }}>
            这一镜还没有视频，请回「动态演绎」为本镜生成。
          </div>
        ) : variants.map((v, k) => {
          const active = v.url === shot.videoUrl;
          return (
            <div key={k} style={{
              marginBottom: 10, borderRadius: 8, overflow: 'hidden',
              border: `1px solid ${active ? 'rgba(109,40,217,.55)' : 'rgba(15,23,42,0.144)'}`,
              background: 'rgba(15,23,42,0.048)',
            }}>
              <video src={v.url} controls preload="metadata"
                style={{ width: '100%', display: 'block', background: '#000' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px' }}>
                <span style={{ fontSize: 10.5, color: active ? '#6d28d9' : '#4b5563' }}>
                  变体 {k + 1}{active ? ' · 当前使用' : ''}
                </span>
                {!active && (
                  <Btn size="sm" variant="primary" onClick={() => pick(v.url)}>
                    <Icon name="check" size={11} />{T.assembly.selectVideo}
                  </Btn>
                )}
              </div>
            </div>
          );
        })}
        {!variants.length && shot.dialogue && (
          <div style={{ fontSize: 10.5, color: '#7c8798', fontStyle: 'italic' }}>"{shot.dialogue}"</div>
        )}
        <div style={{ fontSize: 10, color: '#7c8798', marginTop: 8, lineHeight: 1.6 }}>
          💡 每次在「动态演绎」生成本镜都会新增一条变体；选好后点「合并成片」即用各镜选中的那条拼接。
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
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
        <span style={{ width: 3, height: 12, borderRadius: 2, background: '#8b5cf6', flexShrink: 0 }} />
        <span style={{
          fontSize: 10.5, color: '#5b6678', letterSpacing: '.08em', fontWeight: 600,
        }}>{title}</span>
      </div>
      {children}
    </div>
  );
}
