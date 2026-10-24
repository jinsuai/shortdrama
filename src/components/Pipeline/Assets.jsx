import React, { useState } from 'react';
import { generateImage } from '../../dispatch-jobs.js';

export function Assets({ project, update, log }) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async (charId) => {
    setGenerating(true);
    try {
      // TODO: 调用 generateImage API
      log('角色图片生成中...');
    } catch (e) {
      log(`生成失败: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ padding: 24, color: '#fff', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>资产管理</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: 14 }}>管理角色和场景素材</p>
        </div>
        <button style={{
          padding: '10px 20px',
          background: '#7c3aed',
          border: 'none',
          borderRadius: 8,
          color: '#fff',
          cursor: 'pointer',
          fontWeight: 600
        }}>+ 新建角色</button>
      </div>

      {/* Characters List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(project.characters || []).map((char) => (
          <div key={char.id} style={{
            padding: 16,
            background: 'rgba(15,23,42,0.08)',
            borderRadius: 12,
            border: '1px solid rgba(15,23,42,0.16)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 80,
                height: 80,
                borderRadius: 8,
                background: 'rgba(109, 40, 217, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 32
              }}>
                {char.imageUrl ? <img src={char.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} /> : '👤'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{char.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{char.role}</div>
                <div style={{ color: 'rgba(15,23,42,0.35)', fontSize: 12, marginTop: 4 }}>{char.appearance}</div>
              </div>
              <button
                onClick={() => handleGenerate(char.id)}
                disabled={generating}
                style={{
                  padding: '8px 16px',
                  background: generating ? '#4b5563' : 'rgba(109, 40, 217, 0.2)',
                  border: '1px solid rgba(109, 40, 217, 0.5)',
                  borderRadius: 6,
                  color: '#fff',
                  cursor: generating ? 'not-allowed' : 'pointer'
                }}
              >
                {generating ? '生成中...' : '生成图片'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {(!project.characters || project.characters.length === 0) && (
        <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.4)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🖼️</div>
          <div>暂无角色素材，点击上方按钮创建第一个角色</div>
        </div>
      )}
    </div>
  );
}
