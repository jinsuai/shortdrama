// @ts-nocheck
// 无限画布节点渲染。
// 初版是从深色主题硬改浅色但没改文字色：节点正文 / 输入框 / 下拉全是 #fff 白字压在
// #f5f7fb 浅底上，几乎不可读。这里统一成「白卡片 + 深色文字 + 彩色左边条」，
// 并给所有可编辑控件加 nodrag，避免在输入框里选字时把整个节点拖走。
import { useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Trash2, Play, CheckSquare } from '../../lib/icons';
import { useCanvasStore } from './store';
import { useCanvasBridge } from './bridge';
import { GENERATE_TYPES, MODELS, nodeDef } from './types';

const CARD: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #dbe3f2',
  borderRadius: 10,
  color: '#1f2937',
  fontSize: 12,
  overflow: 'hidden',
  boxShadow: '0 4px 14px rgba(28,44,80,.08)',
  minWidth: 210,
};
const BODY: React.CSSProperties = { padding: 10 };
const LABEL: React.CSSProperties = { fontSize: 10, color: '#6b7280', fontWeight: 600, marginBottom: 4, display: 'block' };
const FIELD: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: '#fff',
  border: '1px solid #dde4f0', borderRadius: 6, padding: '6px 8px',
  color: '#1f2937', fontSize: 11, fontFamily: 'inherit',
};
const ICONBTN: React.CSSProperties = {
  background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer',
  padding: 2, display: 'inline-flex', alignItems: 'center', fontSize: 12, lineHeight: 1,
};
const PRIMARY_BTN: React.CSSProperties = {
  width: '100%', padding: '7px', border: 'none', borderRadius: 6,
  background: 'linear-gradient(135deg,#4facfe,#0284c7)', color: '#fff',
  cursor: 'pointer', fontSize: 11, fontWeight: 700, marginTop: 8,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
};
const PLACEHOLDER: React.CSSProperties = {
  marginTop: 8, height: 76, borderRadius: 6, border: '1px dashed #dbe3f2',
  background: '#f8fafc', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 4,
  color: '#94a3b8', fontSize: 10, textAlign: 'center',
};
const ERROR: React.CSSProperties = {
  marginTop: 8, padding: '6px 8px', borderRadius: 6, background: '#fff1f2',
  border: '1px solid #fecdd3', color: '#be123c', fontSize: 10, lineHeight: 1.5,
  wordBreak: 'break-all',
};

function Chip({ children, bg, color = '#fff' }: any) {
  return (
    <span style={{
      background: bg, color, borderRadius: 10, padding: '1px 7px',
      fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

/** 所有节点共用外壳：彩色左边条 + 标题 + 复制/删除 + 连接点 */
function NodeShell({ id, type, selected, children, badge, target = true, source = true, width }: any) {
  const def = nodeDef(type);
  const { removeNode, duplicateNodes } = useCanvasStore();
  const handleStyle = { background: def.color, width: 9, height: 9, border: '2px solid #fff' };
  return (
    <div style={{
      ...CARD, minWidth: width || 210,
      borderColor: selected ? def.color : '#dbe3f2',
      boxShadow: selected
        ? `0 0 0 2px ${def.color}66, 0 10px 24px rgba(28,44,80,.16)`
        : CARD.boxShadow,
    }}>
      {target && <Handle type="target" position={Position.Left} style={handleStyle} />}
      {source && <Handle type="source" position={Position.Right} style={handleStyle} />}
      <div style={{
        padding: '8px 10px', background: '#fbfcfe', borderBottom: '1px solid #eef2f8',
        borderLeft: `4px solid ${def.color}`, display: 'flex', alignItems: 'center', gap: 6,
        fontWeight: 700, fontSize: 12, color: '#1f2937',
      }}>
        <span style={{ fontSize: 13 }}>{def.icon}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def.label}</span>
        {badge}
        <button title="复制节点 (Ctrl+D)" onClick={(e) => { e.stopPropagation(); duplicateNodes([id]); }} style={ICONBTN}>⧉</button>
        <button title="删除节点" onClick={(e) => { e.stopPropagation(); removeNode(id); }} style={ICONBTN}><Trash2 size={12} /></button>
      </div>
      <div style={BODY}>{children}</div>
    </div>
  );
}

/** 生成结果直接显示在节点上，不用再拖一个输出节点才看得见 */
function ResultPreview({ result, resultType }: any) {
  if (!result) return null;
  if (resultType === 'image') {
    return <img src={result} alt="生成结果" style={{ width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 6, border: '1px solid #eef2f8', marginTop: 8, display: 'block' }} />;
  }
  if (resultType === 'video') {
    return <video src={result} controls style={{ width: '100%', maxHeight: 150, borderRadius: 6, marginTop: 8, display: 'block', background: '#000' }} />;
  }
  return (
    <div style={{ marginTop: 8, padding: 8, background: '#f8fafc', border: '1px solid #eef2f8', borderRadius: 6, fontSize: 11, color: '#334155', whiteSpace: 'pre-wrap', maxHeight: 110, overflow: 'auto' }}>
      {result}
    </div>
  );
}

export function TextNode({ id, data, selected }: NodeProps) {
  const { updateNodeData } = useCanvasStore();
  return (
    <NodeShell id={id} type="text" selected={selected} target={false}>
      <label style={LABEL}>文本内容 · 可作为下游提示词</label>
      <textarea
        className="nodrag nowheel"
        value={data.text || ''}
        onChange={(e) => updateNodeData(id, { text: e.target.value })}
        placeholder="输入提示词 / 旁白 / 台词…"
        style={{ ...FIELD, minHeight: 76, resize: 'vertical' }}
      />
    </NodeShell>
  );
}

export function ImageNode({ id, data, selected }: NodeProps) {
  const { updateNodeData } = useCanvasStore();
  return (
    <NodeShell id={id} type="image" selected={selected} target={false}>
      <label style={LABEL}>图片 URL</label>
      <input
        className="nodrag" value={data.url || ''}
        onChange={(e) => updateNodeData(id, { url: e.target.value })}
        placeholder="粘贴图片 URL…" style={FIELD}
      />
      {data.url
        ? <img src={data.url} alt="preview" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 6, border: '1px solid #eef2f8', marginTop: 8, display: 'block' }} />
        : <div style={PLACEHOLDER}><span style={{ fontSize: 20 }}>🖼️</span>暂无图片</div>}
    </NodeShell>
  );
}

export function VideoNode({ id, data, selected }: NodeProps) {
  const { updateNodeData } = useCanvasStore();
  return (
    <NodeShell id={id} type="video" selected={selected} target={false}>
      <label style={LABEL}>视频 URL</label>
      <input
        className="nodrag" value={data.url || ''}
        onChange={(e) => updateNodeData(id, { url: e.target.value })}
        placeholder="粘贴视频 URL…" style={FIELD}
      />
      {data.url
        ? <video src={data.url} controls muted style={{ width: '100%', maxHeight: 120, borderRadius: 6, marginTop: 8, display: 'block', background: '#000' }} />
        : <div style={PLACEHOLDER}><span style={{ fontSize: 20 }}>🎬</span>暂无视频</div>}
    </NodeShell>
  );
}

export function GenerateNode({ id, data, selected }: NodeProps) {
  const { updateNodeData, runNode, isRunning } = useCanvasStore();
  const { onSaveAsset } = useCanvasBridge();
  const [saved, setSaved] = useState(false);
  const d: any = data;

  const handleSave = () => {
    if (!onSaveAsset || !d.result) return;
    onSaveAsset({
      id: 'a_canvas_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      type: d.resultType || 'image',
      title: `画布生成·${d.generateType}·${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
      url: d.result, status: 'ready',
      tags: ['画布生成', d.generateType], favorite: false, createdAt: Date.now(),
    });
    setSaved(true);
  };

  const statusBadge =
    d.status === 'running' ? <Chip bg="#fef3c7" color="#92400e">⏳ 生成中</Chip> :
    d.status === 'success' ? <Chip bg="#dcfce7" color="#166534">✅ 完成</Chip> :
    d.status === 'error' ? <Chip bg="#ffe4e6" color="#be123c">❌ 失败</Chip> : null;

  return (
    <NodeShell id={id} type="generate" selected={selected} width={248} badge={statusBadge}>
      <label style={LABEL}>提示词{!d.prompt ? ' · 留空则自动取上游文本' : ''}</label>
      <textarea
        className="nodrag nowheel"
        value={d.prompt || ''}
        onChange={(e) => updateNodeData(id, { prompt: e.target.value, status: 'idle' })}
        placeholder="输入提示词，或连线从文本 / 便签 / 分镜节点自动取…"
        style={{ ...FIELD, minHeight: 58, resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <div style={{ flex: 1.2 }}>
          <label style={LABEL}>生成类型</label>
          <select
            className="nodrag" value={d.generateType}
            onChange={(e) => {
              const t = e.target.value;
              updateNodeData(id, { generateType: t, model: MODELS[t]?.[0] || '', status: 'idle' });
            }}
            style={FIELD}
          >
            {GENERATE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={LABEL}>模型</label>
          <select
            className="nodrag" value={d.model || ''}
            onChange={(e) => updateNodeData(id, { model: e.target.value, status: 'idle' })}
            style={FIELD}
          >
            <option value="">默认模型</option>
            {(MODELS[d.generateType] || []).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <label style={{ ...LABEL, marginTop: 8 }}>分辨率 / 参数</label>
      <input
        className="nodrag" value={d.params?.resolution || ''}
        onChange={(e) => updateNodeData(id, { params: { ...d.params, resolution: e.target.value }, status: 'idle' })}
        placeholder="如 1024x1024" style={FIELD}
      />
      <button
        className="nodrag"
        onClick={() => runNode(id)}
        disabled={isRunning || d.status === 'running'}
        style={{ ...PRIMARY_BTN, opacity: (isRunning || d.status === 'running') ? 0.65 : 1, cursor: (isRunning || d.status === 'running') ? 'not-allowed' : 'pointer' }}
      >
        <Play size={12} /> {d.status === 'running' ? '生成中…' : '运行此节点'}
      </button>
      {d.status === 'error' && <div style={ERROR}>{d.error || '生成失败'}</div>}
      <ResultPreview result={d.result} resultType={d.resultType} />
      {d.status === 'success' && d.result && d.resultType !== 'text' && (
        <button
          className="nodrag" onClick={handleSave} disabled={!onSaveAsset || saved}
          style={{ ...PRIMARY_BTN, background: saved ? '#2f9e44' : 'linear-gradient(135deg,#f59f00,#f08c00)', opacity: !onSaveAsset || saved ? 0.7 : 1 }}
        >
          <CheckSquare size={12} /> {saved ? '已存入素材库 ✓' : '存入素材库'}
        </button>
      )}
    </NodeShell>
  );
}

export function OutputNode({ id, data, selected }: NodeProps) {
  return (
    <NodeShell id={id} type="output" selected={selected} source={false}>
      {data.result
        ? <ResultPreview result={data.result} resultType={data.resultType} />
        : <div style={PLACEHOLDER}><span style={{ fontSize: 20 }}>📤</span>等待上游节点运行…</div>}
    </NodeShell>
  );
}

const NOTE_COLORS = ['#fff7d6', '#e8f4ff', '#f0ffe8', '#ffe8f0'];

export function NoteNode({ id, data, selected }: NodeProps) {
  const { updateNodeData, removeNode } = useCanvasStore();
  const bg = data.color || NOTE_COLORS[0];
  return (
    <div style={{
      ...CARD, background: bg, minWidth: 190,
      borderColor: selected ? '#f59f00' : '#e8d99a',
      boxShadow: selected ? '0 0 0 2px #f59f0066, 0 10px 24px rgba(28,44,80,.16)' : CARD.boxShadow,
    }}>
      <Handle type="source" position={Position.Right} style={{ background: '#f59f00', width: 9, height: 9, border: '2px solid #fff' }} />
      <div style={{
        padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 5,
        borderBottom: '1px dashed rgba(0,0,0,.12)', fontSize: 11, fontWeight: 700, color: '#7c5c10',
      }}>
        🗒️ 便签
        <div style={{ flex: 1 }} />
        {NOTE_COLORS.map((c) => (
          <button key={c} title="换便签颜色" onClick={(e) => { e.stopPropagation(); updateNodeData(id, { color: c }); }}
            style={{ width: 11, height: 11, borderRadius: '50%', border: '1px solid rgba(0,0,0,.15)', background: c, cursor: 'pointer', padding: 0 }} />
        ))}
        <button title="删除便签" onClick={(e) => { e.stopPropagation(); removeNode(id); }} style={{ ...ICONBTN, marginLeft: 3 }}><Trash2 size={12} /></button>
      </div>
      <textarea
        className="nodrag nowheel"
        value={data.text || ''}
        onChange={(e) => updateNodeData(id, { text: e.target.value })}
        placeholder="写点备注…"
        style={{ ...FIELD, background: 'transparent', border: 'none', minHeight: 70, resize: 'vertical', padding: '8px 10px' }}
      />
    </div>
  );
}

export function ShotNode({ id, data, selected }: NodeProps) {
  const { runShotFrame } = useCanvasStore();
  const d: any = data;
  return (
    <NodeShell
      id={id} type="shot" selected={selected} width={230}
      badge={<Chip bg="#ede9fe" color="#6d28d9">#{Number(d.shotIndex || 0) + 1}</Chip>}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: '#1f2937', marginBottom: 6 }}>
        {d.title || `分镜 ${Number(d.shotIndex || 0) + 1}`}
      </div>
      {d.imageUrl
        ? <img src={d.imageUrl} alt="首帧" style={{ width: '100%', maxHeight: 110, objectFit: 'cover', borderRadius: 6, border: '1px solid #eef2f8', display: 'block' }} />
        : d.videoUrl
          ? <video src={d.videoUrl} muted style={{ width: '100%', maxHeight: 110, borderRadius: 6, display: 'block', background: '#000' }} />
          : <div style={{ ...PLACEHOLDER, height: 66, marginTop: 0 }}><span style={{ fontSize: 18 }}>🎞️</span>暂无首帧</div>}
      {d.description && <div style={{ fontSize: 10, color: '#64748b', marginTop: 6, maxHeight: 38, overflow: 'hidden', lineHeight: 1.5 }}>{d.description}</div>}
      {d.firstFramePrompt && (
        <div style={{ fontSize: 10, color: '#7c3aed', marginTop: 4, maxHeight: 32, overflow: 'hidden', lineHeight: 1.5 }}>
          提示词：{String(d.firstFramePrompt).slice(0, 80)}
        </div>
      )}
      {d.status === 'error' && <div style={ERROR}>{d.error || '生成失败'}</div>}
      <button
        className="nodrag" onClick={() => runShotFrame(id)} disabled={d.status === 'running'}
        style={{ ...PRIMARY_BTN, background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)', opacity: d.status === 'running' ? 0.65 : 1 }}
      >
        <Play size={12} /> {d.status === 'running' ? '⏳ 生成中…' : '✨ 生成首帧并写回分镜'}
      </button>
    </NodeShell>
  );
}

export const nodeTypes = {
  textNode: TextNode,
  imageNode: ImageNode,
  videoNode: VideoNode,
  generateNode: GenerateNode,
  outputNode: OutputNode,
  noteNode: NoteNode,
  shotNode: ShotNode,
};
