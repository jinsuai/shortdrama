import React, { useState } from 'react';
import { CloudBackground } from './StudioShell';
import { T } from './i18n';
import { Icon, Btn, Pill, glassCard } from './ui';
import { LandingView } from './LandingView';

/**
 * 工作区 —— 打开软件的第一屏。
 * 复刻交互稿：顶栏 4 按钮（新建系列 / 新建项目 / 同步 / 导入文件），
 * 列表为「系列卡 + 独立项目卡」混合，同步用图标旋转 + 提示。
 * 交互：整张卡片可点击打开（系列→详情；项目→九步流水线）；
 * 视觉：半透明玻璃卡 + 悬浮投影，背景网格隐约透出。
 */

const glass = (hover) => glassCard(hover);

export function WorkspaceView({
  projects = [],
  series = [],
  onNewSeries,
  onNewProject,
  onOpenProject,
  onOpenSeries,
  onImport,
  onSync,
  onDeleteProject,
  onDeleteSeries,
}) {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    await onSync?.();
    setSyncing(false);
  };

  // 独立项目（未归属任何系列）才出现在工作区；系列下的剧集只在系列详情里展示
  const standalone = projects.filter((p) => !p.seriesId);
  const total = standalone.length + series.length;

  // 每个系列的剧集（项目），用于卡内预览条与统计
  const episodesOf = (sId) => projects.filter((p) => p.seriesId === sId);

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      <CloudBackground />

      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* 顶栏（空状态时隐藏，复刻交互稿 空首页） */}
        {total > 0 && (
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 28px 16px',
        }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#1f2937', letterSpacing: '-.01em' }}>
            {T.workspace.title(total)}
          </h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={onNewSeries}><Icon name="layers" size={14} />{T.workspace.newSeries}</Btn>
            <Btn onClick={onNewProject}><Icon name="plus" size={14} />{T.workspace.newProject}</Btn>
            <Btn onClick={handleSync} disabled={syncing}>
              <Icon name="refresh" size={14} />
              <span style={syncing ? { animation: 'lx-spin 1s linear infinite', display: 'inline-block' } : undefined}>
                {syncing ? T.workspace.syncing : T.workspace.sync}
              </span>
            </Btn>
            <Btn onClick={onImport}><Icon name="upload" size={14} />{T.workspace.import}</Btn>
          </div>
        </header>
        )}

        {/* 网格 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 28px 32px' }}>
          {total === 0 ? (
            <LandingView
              onNewProject={onNewProject}
              onNewSeries={onNewSeries}
              onSync={handleSync}
              syncing={syncing}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(288px, 1fr))', gap: 14 }}>
              {/* 系列卡 */}
              {series.map((s) => (
                <SeriesCard key={s.id} series={s} episodes={episodesOf(s.id)} onOpen={() => onOpenSeries?.(s.id)}
                  onDelete={() => onDeleteSeries?.(s.id)} />
              ))}
              {/* 独立项目卡 */}
              {standalone.map((p) => (
                <ProjectCard key={p.id} p={p}
                  onOpen={() => onOpenProject?.(p.id)} onDelete={() => onDeleteProject?.(p.id)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes lx-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// 项目卡（可在工作区与系列详情复用）
export function ProjectCard({ p, onOpen, onDelete }) {
  const [hover, setHover] = useState(false);
  const mats = p.materials || {};
  const stats = [
    { k: T.workspace.characters, v: (mats.characters || []).length },
    { k: T.workspace.scenes, v: (mats.scenes || []).length },
    { k: T.workspace.shots, v: (p.shots || []).length },
  ];
  const dateText = p.updatedAt
    ? new Date(p.updatedAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : T.workspace.noDate;

  return (
    <div onClick={onOpen}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      title={T.workspace.openProject}
      style={{
        position: 'relative', cursor: 'pointer', padding: '15px 16px 12px',
        display: 'flex', flexDirection: 'column', gap: 9, borderRadius: 12,
        ...glass(hover),
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{
          fontSize: 14.5, fontWeight: 600, color: '#1f2937', flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{p.title || '(未命名)'}</div>
        <button onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
          title="删除" style={{
            background: 'none', border: 'none', color: '#7c8798', cursor: 'pointer', padding: 2, flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#7c8798'; }}>
          <Icon name="trash" size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#4b5563' }}>
        <Icon name="calendar" size={12} color="#4b5563" />{dateText}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {stats.map((s) => (
          <span key={s.k} style={{
            fontSize: 10.5, color: '#5b6678', background: 'rgba(15,23,42,0.08)',
            border: '1px solid rgba(15,23,42,0.112)', borderRadius: 5, padding: '2px 7px',
          }}>{s.k} {s.v}</span>
        ))}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 2, paddingTop: 9, borderTop: '1px solid rgba(15,23,42,0.096)',
      }}>
        <Pill>{T.workspace.statusTodo}</Pill>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 12, fontWeight: 600,
          color: hover ? '#6d28d9' : '#8b5cf6', transition: 'color .15s',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z" /></svg>
          {T.workspace.openProject}
        </span>
      </div>
    </div>
  );
}

// 系列卡：整卡点击打开系列详情；删除按钮 stopPropagation
function SeriesCard({ series, episodes = [], onOpen, onDelete }) {
  const [hover, setHover] = useState(false);

  // 聚合该系列下所有剧集的角色 / 场景数
  const charCount = episodes.reduce((acc, ep) => acc + ((ep.materials?.characters || []).length), 0);
  const sceneCount = episodes.reduce((acc, ep) => acc + ((ep.materials?.scenes || []).length), 0);

  return (
    <div onClick={onOpen}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      title={T.seriesView.title(series.title || '')}
      style={{
        cursor: 'pointer', padding: '15px 16px 12px',
        display: 'flex', flexDirection: 'column', gap: 9, borderRadius: 12,
        ...glass(hover),
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14.5, fontWeight: 600, color: '#1f2937',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{series.title || '(未命名)'}</div>
          {series.description && (
            <div style={{
              fontSize: 11, color: '#4b5563', marginTop: 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{series.description}</div>
          )}
        </div>
        <button onClick={(e) => { e.stopPropagation(); onDelete?.(series.id); }}
          title="删除"
          style={{ background: 'none', border: 'none', color: '#7c8798', cursor: 'pointer', padding: 2 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#7c8798'; }}>
          <Icon name="trash" size={14} />
        </button>
      </div>

      {/* 统计 */}
      <div style={{ display: 'flex', gap: 14, fontSize: 10.5, color: '#4b5563' }}>
        <span>{T.seriesView.episodes} <b style={{ color: '#1f2937' }}>{episodes.length}</b></span>
        <span>{T.seriesView.characters} <b style={{ color: '#1f2937' }}>{charCount}</b></span>
        <span>{T.seriesView.scenes} <b style={{ color: '#1f2937' }}>{sceneCount}</b></span>
      </div>

      {/* 剧集预览条 */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingTop: 2 }}>
        {episodes.length === 0 && (
          <div style={{
            fontSize: 10.5, color: '#7c8798', padding: '6px 2px',
          }}>{T.seriesView.empty}</div>
        )}
        {episodes.slice(0, 6).map((ep) => (
          <div key={ep.id} title={ep.title} style={{
            width: 46, aspectRatio: '16/9', borderRadius: 4, flexShrink: 0,
            background: 'rgba(109,40,217,.18)', border: '1px solid rgba(109,40,217,.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8.5, color: '#6d28d9', overflow: 'hidden',
          }}>
            {(ep.thumbnail || ep.cover)
              ? <img src={ep.thumbnail || ep.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (ep.title || '').slice(0, 3)}
          </div>
        ))}
      </div>
    </div>
  );
}
