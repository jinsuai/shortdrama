import React from 'react';

export function Voice({ project, update, log }) {
  return (
    <div style={{ padding: 24, color: '#fff', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>配音</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: 14 }}>为每个镜头添加 AI 配音</p>
      </div>

      {/* Shot List with Audio */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(project.shots || []).map((shot, idx) => (
          <div key={idx} style={{
            padding: 16,
            background: 'rgba(15,23,42,0.08)',
            borderRadius: 12,
            border: '1px solid rgba(15,23,42,0.16)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{shot.title || `镜头 ${idx + 1}`}</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4 }}>{shot.dialogue || '暂无台词'}</div>
              </div>
              <button style={{
                padding: '8px 16px',
                background: shot.ttsUrl ? 'rgba(34,197,94,0.2)' : 'rgba(124,58,237,0.2)',
                border: '1px solid',
                borderColor: shot.ttsUrl ? 'rgba(34,197,94,0.5)' : 'rgba(124,58,237,0.5)',
                borderRadius: 6,
                color: '#fff',
                cursor: 'pointer'
              }}>
                {shot.ttsUrl ? '✓ 已配音' : '🎙️ 生成配音'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
