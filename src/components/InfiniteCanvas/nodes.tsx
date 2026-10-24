// @ts-nocheck
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Trash2, Play, Image as ImageIcon, Film, Type, Settings, Loader, CheckCircle, AlertCircle } from '../../lib/icons';
import { useCanvasStore } from './store';
import { GENERATE_TYPES, MODELS, GenerateNodeData } from './types';

const nodeStyle: React.CSSProperties = {
  background: '#e6ecf8',
  border: '1px solid #dbe3f2',
  borderRadius: '8px',
  minWidth: '200px',
  color: '#fff',
  fontSize: '12px',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '6px 10px',
  background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  fontWeight: 600,
  fontSize: '12px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const bodyStyle: React.CSSProperties = {
  padding: '10px',
};

// 文本输入节点
export function TextNode({ id, data, selected }: NodeProps) {
  const { updateNodeData, removeNode } = useCanvasStore();
  return (
    <div style={{ ...nodeStyle, borderColor: selected ? '#4facfe' : '#dbe3f2' }}>
      <Handle type="source" position={Position.Right} />
      <div style={headerStyle}>
        <Type size={12} /> 文本输入
        <button
          onClick={() => removeNode(id)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div style={bodyStyle}>
        <textarea
          value={data.text || ''}
          onChange={(e) => updateNodeData(id, { text: e.target.value })}
          placeholder="输入文本内容..."
          style={{
            width: '100%',
            minHeight: '60px',
            background: '#f5f7fb',
            border: '1px solid #dde4f0',
            borderRadius: '4px',
            padding: '6px',
            color: '#fff',
            fontSize: '11px',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </div>
    </div>
  );
}

// 图片输入节点
export function ImageNode({ id, data, selected }: NodeProps) {
  const { updateNodeData, removeNode } = useCanvasStore();
  return (
    <div style={{ ...nodeStyle, borderColor: selected ? '#4facfe' : '#dbe3f2' }}>
      <Handle type="source" position={Position.Right} />
      <div style={{ ...headerStyle, background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
        <ImageIcon size={12} /> 图片输入
        <button
          onClick={() => removeNode(id)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div style={bodyStyle}>
        <input
          type="text"
          value={data.url || ''}
          onChange={(e) => updateNodeData(id, { url: e.target.value })}
          placeholder="图片URL..."
          style={{
            width: '100%',
            background: '#f5f7fb',
            border: '1px solid #dde4f0',
            borderRadius: '4px',
            padding: '6px',
            color: '#fff',
            fontSize: '11px',
            marginBottom: '8px',
          }}
        />
        {data.url && (
          <img
            src={data.url}
            alt="preview"
            style={{ width: '100%', borderRadius: '4px', maxHeight: '100px', objectFit: 'cover' }}
          />
        )}
      </div>
    </div>
  );
}

// 视频输入节点
export function VideoNode({ id, data, selected }: NodeProps) {
  const { updateNodeData, removeNode } = useCanvasStore();
  return (
    <div style={{ ...nodeStyle, borderColor: selected ? '#4facfe' : '#dbe3f2' }}>
      <Handle type="source" position={Position.Right} />
      <div style={{ ...headerStyle, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <Film size={12} /> 视频输入
        <button
          onClick={() => removeNode(id)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div style={bodyStyle}>
        <input
          type="text"
          value={data.url || ''}
          onChange={(e) => updateNodeData(id, { url: e.target.value })}
          placeholder="视频URL..."
          style={{
            width: '100%',
            background: '#f5f7fb',
            border: '1px solid #dde4f0',
            borderRadius: '4px',
            padding: '6px',
            color: '#fff',
            fontSize: '11px',
          }}
        />
      </div>
    </div>
  );
}

// AI生成节点
export function GenerateNode({ id, data, selected }: NodeProps) {
  const { updateNodeData, removeNode, runNode, isRunning } = useCanvasStore();
  const genData = data as GenerateNodeData;

  const statusColors: Record<string, string> = {
    idle: '#888',
    running: '#ffd700',
    success: '#51cf66',
    error: '#f5576c',
  };

  return (
    <div style={{ ...nodeStyle, borderColor: selected ? '#4facfe' : '#dbe3f2', minWidth: '240px' }}>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div style={{ ...headerStyle, background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', color: '#333' }}>
        <Settings size={12} /> AI 生成
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {genData.status === 'running' && <Loader size={12} className="spin" />}
          {genData.status === 'success' && <CheckCircle size={12} color="#51cf66" />}
          {genData.status === 'error' && <AlertCircle size={12} color="#f5576c" />}
          <button
            onClick={() => removeNode(id)}
            style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer', padding: 0, marginLeft: '4px' }}
          >
            <Trash2 size={12} />
          </button>
        </span>
      </div>
      <div style={bodyStyle}>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>生成类型</div>
          <select
            value={genData.generateType}
            onChange={(e) => {
              const type = e.target.value as any;
              updateNodeData(id, {
                generateType: type,
                model: MODELS[type]?.[0] || '',
                status: 'idle',
              });
            }}
            style={{
              width: '100%',
              background: '#f5f7fb',
              border: '1px solid #dde4f0',
              borderRadius: '4px',
              padding: '4px',
              color: '#fff',
              fontSize: '11px',
            }}
          >
            {GENERATE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>模型</div>
          <select
            value={genData.model}
            onChange={(e) => updateNodeData(id, { model: e.target.value, status: 'idle' })}
            style={{
              width: '100%',
              background: '#f5f7fb',
              border: '1px solid #dde4f0',
              borderRadius: '4px',
              padding: '4px',
              color: '#fff',
              fontSize: '11px',
            }}
          >
            {(MODELS[genData.generateType] || []).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '2px' }}>分辨率/参数</div>
          <input
            type="text"
            value={genData.params?.resolution || ''}
            onChange={(e) => updateNodeData(id, { params: { ...genData.params, resolution: e.target.value }, status: 'idle' })}
            placeholder="如: 1024x1024"
            style={{
              width: '100%',
              background: '#f5f7fb',
              border: '1px solid #dde4f0',
              borderRadius: '4px',
              padding: '4px',
              color: '#fff',
              fontSize: '11px',
            }}
          />
        </div>
        <button
          onClick={() => runNode(id)}
          disabled={isRunning || genData.status === 'running'}
          style={{
            width: '100%',
            padding: '6px',
            background: genData.status === 'running' ? '#333' : 'linear-gradient(135deg, #4facfe, #00f2fe)',
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            cursor: genData.status === 'running' ? 'not-allowed' : 'pointer',
            fontSize: '11px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
          }}
        >
          <Play size={12} />
          {genData.status === 'running' ? '生成中...' : '运行此节点'}
        </button>
      </div>
    </div>
  );
}

// 输出节点
export function OutputNode({ id, data, selected }: NodeProps) {
  const { removeNode } = useCanvasStore();
  return (
    <div style={{ ...nodeStyle, borderColor: selected ? '#51cf66' : '#dbe3f2' }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ ...headerStyle, background: 'linear-gradient(135deg, #51cf66 0%, #94d82d 100%)' }}>
        输出结果
        <button
          onClick={() => removeNode(id)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div style={bodyStyle}>
        {data.result ? (
          data.resultType === 'image' ? (
            <img src={data.result} alt="result" style={{ width: '100%', borderRadius: '4px' }} />
          ) : data.resultType === 'video' ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
              <Film size={24} style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: '10px' }}>视频已生成</div>
              <div style={{ fontSize: '9px', wordBreak: 'break-all', marginTop: '4px' }}>{data.result}</div>
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: '#ccc', maxHeight: '100px', overflow: 'auto' }}>
              {data.result}
            </div>
          )
        ) : (
          <div style={{ textAlign: 'center', padding: '20px', color: '#555', fontSize: '11px' }}>
            等待上游节点运行...
          </div>
        )}
      </div>
    </div>
  );
}

export const nodeTypes = {
  textNode: TextNode,
  imageNode: ImageNode,
  videoNode: VideoNode,
  generateNode: GenerateNode,
  outputNode: OutputNode,
};
