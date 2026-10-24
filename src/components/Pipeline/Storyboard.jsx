import React from 'react';

export function Storyboard({ project, update, log }) {
  return (
    <div style={{ padding: 24, color: '#fff', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>分镜制作</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: 14 }}>根据剧本生成分镜脚本和参考图</p>
      </div>

      {/* Shot List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(project.shots || []).map((shot, idx) => (
          <div key={shot.id || idx} style={{
            padding: 16,
            background: 'rgba(15,23,42,0.08)',
            borderRadius: 12,
            border: '1px solid rgba(15,23,42,0.16)',
            display: 'flex',
            gap: 16,
            alignItems: 'center'
          }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 8,
              background: shot.videoUrl ? 'rgba(34,197,94,0.2)' : 'rgba(124,58,237,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              flexShrink: 0
            }}>
              {shot.videoUrl ? '✓' : '🎬'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{shot.title || `镜头 ${idx + 1}`}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{shot.sceneDesc || '暂无描述'}</div>
            </div>
            {shot.videoUrl && (
              <video src={shot.videoUrl} style={{ width: 160, borderRadius: 8 }} />
            )}
          </div>
        ))}
      </div>

      {(!project.shots || project.shots.length === 0) && (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.4)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <div>暂无分镜，请先生成剧本</div>
        </div>
      )}
    </div>
  );
}
