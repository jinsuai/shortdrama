import React from 'react';

export function Script({ project, update, log }) {
  return (
    <div style={{ padding: 24, color: '#fff', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>剧本创作</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: 14 }}>输入故事梗概，AI 将生成完整剧本</p>
      </div>

      <textarea
        value={project.script || ''}
        onChange={(e) => update({ ...project, script: e.target.value })}
        placeholder="请输入故事梗概或剧本内容..."
        style={{
          width: '100%',
          height: 300,
          background: 'rgba(15,23,42,0.08)',
          border: '1px solid rgba(15,23,42,0.16)',
          borderRadius: 8,
          padding: 16,
          color: '#fff',
          fontSize: 14,
          lineHeight: 1.6,
          resize: 'vertical'
        }}
      />

      <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
        <button style={{
          padding: '10px 20px',
          background: '#7c3aed',
          border: 'none',
          borderRadius: 6,
          color: '#fff',
          cursor: 'pointer',
          fontWeight: 600
        }}>🤖 AI 生成剧本</button>
        <button style={{
          padding: '10px 20px',
          background: 'rgba(15,23,42,0.08)',
          border: '1px solid rgba(15,23,42,0.16)',
          borderRadius: 6,
          color: '#fff',
          cursor: 'pointer'
        }}>📤 导入剧本文件</button>
      </div>
    </div>
  );
}
