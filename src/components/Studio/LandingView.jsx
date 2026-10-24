import React, { useState } from 'react';
import { Icon, glassCard } from './ui';

/**
 * 空工作区首屏 —— 复刻交互稿 空状态：
 * 文件夹图标 +「还没有项目」+ 两张创建卡（创建系列 / 创建独立项目）+ 从后端同步。
 * 注意：不自带 CloudBackground（WorkspaceView 已有，叠两层会出「双层底」）。
 * 创建项目或系列后，进入常规工作区（卡片网格视图）。
 */
function CreateCard({ icon, title, sub, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...glassCard(hover, 11),
        cursor: 'pointer',
        width: 252,
        padding: '26px 28px 24px',
        textAlign: 'left',
      }}
    >
      <Icon name={icon} size={22} color="#6d28d9" />
      <div style={{ fontSize: 15.5, fontWeight: 600, color: '#1f2937', marginTop: 16 }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: '#4b5563', marginTop: 5 }}>{sub}</div>
    </div>
  );
}

export function LandingView({ onNewProject, onNewSeries, onSync, syncing }) {
  return (
    <div style={{
      height: '100%',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px', textAlign: 'center',
    }}>
      <Icon name="folder" size={54} color="#565b66" />

      <div style={{ fontSize: 17.5, color: '#374151', marginTop: 22 }}>还没有项目</div>
      <div style={{ fontSize: 12.5, color: '#4b5563', marginTop: 8 }}>选择一种方式开始创作</div>

      <div style={{ display: 'flex', gap: 16, marginTop: 40 }}>
        <CreateCard
          icon="sliders"
          title="创建系列"
          sub="适合多集连续短剧"
          onClick={onNewSeries}
        />
        <CreateCard
          icon="file"
          title="创建独立项目"
          sub="适合单个短视频"
          onClick={onNewProject}
        />
      </div>

      <div
        onClick={onSync}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          marginTop: 26, padding: '8px 17px', borderRadius: 999,
          cursor: 'pointer', fontSize: 12, color: '#5b6678',
          background: 'rgba(15,23,42,0.08)', border: '1px solid rgba(15,23,42,0.16)',
        }}
      >
        <Icon name="refresh" size={13} color="#5b6678" />
        <span style={syncing ? { animation: 'lx-spin 1s linear infinite', display: 'inline-block' } : undefined}>
          {syncing ? '同步中…' : '从后端同步'}
        </span>
      </div>
    </div>
  );
}
