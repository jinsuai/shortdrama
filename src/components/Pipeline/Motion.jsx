import React from 'react';

export function Motion({ project, update, log }) {
  return (
    <div style={{ padding: 24, color: '#fff', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>动态生成</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: 14 }}>图生视频，让分镜动起���</p>
      </div>

      {/* Video Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {(project.shots || [])
          .filter(s => s.videoUrl)
          .map((shot, idx) => (
            <div key={idx} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
              <video
                src={shot.videoUrl}
                controls
                style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover' }}
              />
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '8px 12px',
                background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                fontSize: 12
              }}>
                {shot.title || `片段 ${idx + 1}`}
              </div>
            </div>
          ))}
      </div>

      {!(project.shots || []).some(s => s.videoUrl) && (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.4)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎥</div>
          <div>暂无视频片段，请先完成分镜制作</div>
        </div>
      )}
    </div>
  );
}
