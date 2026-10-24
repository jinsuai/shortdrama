import React, { useState } from 'react';

export function Export({ project, update, log }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      // TODO: 实现导出逻辑
      log('导出功能开发中...');
    } catch (e) {
      log(`导出失败：${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ padding: 24, color: '#fff', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>导出成片</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: 14 }}>下载或分享您的作品</p>
      </div>

      {project.assembledVideo && (
        <div style={{ marginBottom: 24 }}>
          <video src={project.assembledVideo} controls style={{ width: '100%', maxWidth: 400, borderRadius: 12 }} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          onClick={handleExport}
          disabled={exporting || !project.assembledVideo}
          style={{
            padding: '14px 24px',
            background: exporting ? '#4b5563' : '#22c55e',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            cursor: exporting || !project.assembledVideo ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8
          }}
        >
          <span>📤</span> {exporting ? '导出中...' : '下载成片'}
        </button>

        <button style={{
          padding: '12px 24px',
          background: 'rgba(15,23,42,0.08)',
          border: '1px solid rgba(15,23,42,0.16)',
          borderRadius: 8,
          color: '#fff',
          cursor: 'pointer',
          fontWeight: 600
        }}>
          📋 复制分享链接
        </button>
      </div>

      <div style={{ marginTop: 24, padding: 16, background: 'rgba(15,23,42,0.048)', borderRadius: 8, border: '1px solid rgba(15,23,42,0.08)' }}>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
          💡 提示：成片将保存为 MP4 格式，分辨率根据项目设置自动选择
        </div>
      </div>
    </div>
  );
}
