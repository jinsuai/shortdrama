import React, { useState } from 'react';
import { concatVideos } from '../../dispatch-jobs';

export function Assembly({ project, update, log }) {
  const [assembling, setAssembling] = useState(false);

  const handleConcat = async () => {
    const videos = (project.shots || []).map(s => s.videoUrl).filter(Boolean);
    if (videos.length === 0) {
      log('没有可组装的视频片段');
      return;
    }
    setAssembling(true);
    try {
      const result = await concatVideos(videos);
      update({ ...project, assembledVideo: result.video_url });
      log(`视频组装完成，共 ${videos.length} 个片段`);
    } catch (e) {
      log(`组装失败：${e.message}`);
    } finally {
      setAssembling(false);
    }
  };

  return (
    <div style={{ padding: 24, color: '#fff', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>视频组装</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: 14 }}>按时间顺序排列并拼接所有视频片段</p>
      </div>

      {/* Timeline */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
          {(project.shots || []).filter(s => s.videoUrl).map((shot, idx) => (
            <div key={idx} style={{ minWidth: 120, position: 'relative' }}>
              <video src={shot.videoUrl} style={{ width: 120, borderRadius: 8 }} />
              <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>
                #{idx + 1}
              </div>
              <div style={{ fontSize: 11, marginTop: 4, color: 'rgba(255,255,255,0.6)' }}>{shot.title || `片段 ${idx + 1}`}</div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleConcat}
        disabled={assembling || !(project.shots || []).some(s => s.videoUrl)}
        style={{
          padding: '12px 24px',
          background: assembling ? '#4b5563' : '#7c3aed',
          border: 'none',
          borderRadius: 8,
          color: '#fff',
          cursor: assembling || !(project.shots || []).some(s => s.videoUrl) ? 'not-allowed' : 'pointer',
          fontWeight: 600,
          fontSize: 14
        }}
      >
        {assembling ? '🎬 组装中...' : '✂️ 拼接视频'}
      </button>

      {project.assembledVideo && (
        <div style={{ marginTop: 24 }}>
          <div style={{ color: '#22c55e', marginBottom: 8 }}>✅ 组装完成</div>
          <video src={project.assembledVideo} controls style={{ width: '100%', maxWidth: 400, borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
