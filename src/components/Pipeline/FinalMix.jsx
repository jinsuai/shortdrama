import React from 'react';

export function FinalMix({ project, update, log }) {
  return (
    <div style={{ padding: 24, color: '#fff', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>混音</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: 14 }}>调整音频轨道、添加背景音乐和音效</p>
      </div>

      {/* Audio Tracks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{
          padding: 16,
          background: 'rgba(15,23,42,0.08)',
          borderRadius: 12,
          border: '1px solid rgba(15,23,42,0.16)'
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>🎵 配音轨道</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>共 {project.shots?.filter(s => s.ttsUrl).length} 条配音</div>
        </div>
        <div style={{
          padding: 16,
          background: 'rgba(15,23,42,0.08)',
          borderRadius: 12,
          border: '1px solid rgba(15,23,42,0.16)'
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>🎶 背景音乐</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>待添加</div>
        </div>
        <div style={{
          padding: 16,
          background: 'rgba(15,23,42,0.08)',
          borderRadius: 12,
          border: '1px solid rgba(15,23,42,0.16)'
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>🔊 音效</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>待添加</div>
        </div>
      </div>
    </div>
  );
}
