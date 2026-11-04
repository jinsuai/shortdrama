import React, { useState } from 'react';
import { CloudBackground } from './StudioShell';
import { T } from './i18n';
import { Icon, Btn, Pill, Seg, glassCard } from './ui';
import { LandingView } from './LandingView';

/**
 * 工作区 —— 打开软件的第一屏。
 * 对标 Reveric 的工作台：把「只有一排按钮 + 一列卡片」升级为
 * 概览仪表盘（统计条）+ 搜索/排序/类型筛选 + 带封面与进度的项目卡。
 * 只改展示层，不碰项目数据模型与生成逻辑。
 */

const glass = (hover) => glassCard(hover);

/** 相对时间：比原来的完整时间戳更适合卡片扫读 */
const fmtRelative = (ts) => {
  if (!ts) return T.workspace.noDate;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return T.workspace.noDate;
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day} 天前`;
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

/** 项目进度：按已有首帧 / 视频的分镜占比估算 */
const progressOf = (p) => {
  const shots = p?.shots || [];
  if (!shots.length) return 0;
  const done = shots.filter((s) => s?.imageUrl || s?.videoUrl).length;
  return Math.round((done / shots.length) * 100);
};

/** 封面优先级：项目封面 > 缩略图 > 第一张分镜首帧 > 角色主图 */
const coverOf = (p) =>
  p?.cover || p?.thumbnail ||
  (p?.shots || []).find((s) => s?.imageUrl)?.imageUrl ||
  p?.masterUrl || '';

const statusOf = (progress) =>
  progress >= 100 ? { text: '已完成', tone: 'green' } :
  progress > 0 ? { text: '进行中', tone: 'purple' } :
  { text: T.workspace.statusTodo, tone: 'default' };

function StatCard({ label, value, icon, tone = '#6d28d9' }) {
  return (
    <div style={{ ...glass(false), padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
      <div style={{
        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
        background: `${tone}1f`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={icon} size={16} color={tone} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: '#1f2937', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 2, whiteSpace: 'nowrap' }}>{label}</div>
      </div>
    </div>
  );
}

function Cover({ url, seed, label, kind }) {
  return (
    <div style={{
      position: 'relative', height: 92, borderRadius: 8, overflow: 'hidden', marginBottom: 10,
      background: url ? '#0f172a' : 'linear-gradient(135deg,#ede9fe 0%,#dbeafe 55%,#e0f2fe 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid rgba(15,23,42,0.08)',
    }}>
      {url
        ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontSize: 30, fontWeight: 800, color: 'rgba(109,40,217,.42)' }}>{seed || '烬'}</span>}
      <span style={{
        position: 'absolute', top: 6, left: 6, fontSize: 9.5, fontWeight: 700,
        padding: '2px 7px', borderRadius: 5, color: '#fff',
        background: kind === 'series' ? 'rgba(8,145,178,.88)' : 'rgba(109,40,217,.88)',
      }}>{label}</span>
    </div>
  );
}

function Progress({ value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 3, background: 'rgba(15,23,42,.09)', overflow: 'hidden' }}>
        <div style={{
          width: `${value}%`, height: '100%', borderRadius: 3,
          background: 'linear-gradient(90deg,#8b5cf6,#6366f1)', transition: 'width .3s',
        }} />
      </div>
      <span style={{ fontSize: 10, color: '#6b7280', minWidth: 28, textAlign: 'right' }}>{value}%</span>
    </div>
  );
}

function DelBtn({ onClick }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick?.(); }} title="删除"
      style={{ background: 'none', border: 'none', color: '#7c8798', cursor: 'pointer', padding: 2, flexShrink: 0 }}
      onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = '#7c8798'; }}>
      <Icon name="trash" size={14} />
    </button>
  );
}

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
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');   // recent | name
  const [filter, setFilter] = useState('all');  // all | series | project

  const handleSync = async () => {
    setSyncing(true);
    await onSync?.();
    setSyncing(false);
  };

  // 独立项目（未归属任何系列）才出现在工作区；系列下的剧集只在系列详情里展示
  const standalone = projects.filter((p) => !p.seriesId);
  const total = standalone.length + series.length;
  const episodesOf = (sId) => projects.filter((p) => p.seriesId === sId);

  // 概览统计：项目 / 系列 / 分镜 / 素材（角色+场景+道具）
  const shotCount = projects.reduce((n, p) => n + (p.shots || []).length, 0);
  const assetCount = projects.reduce((n, p) => {
    const m = p.materials || {};
    return n + (m.characters || []).length + (m.scenes || []).length + (m.props || []).length;
  }, 0);

  const q = query.trim().toLowerCase();
  const match = (t) => !q || String(t || '').toLowerCase().includes(q);
  const shownSeries = (filter === 'project' ? [] : series)
    .filter((s) => match(s.title) || match(s.description));
  const shownProjects = (filter === 'series' ? [] : standalone)
    .filter((p) => match(p.title));
  const ts = (p) => new Date(p?.updatedAt || 0).getTime() || 0;
  const byName = (a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN');
  if (sort === 'name') {
    shownSeries.sort(byName);
    shownProjects.sort(byName);
  } else {
    shownProjects.sort((a, b) => ts(b) - ts(a));
  }
  const shownTotal = shownSeries.length + shownProjects.length;

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      <CloudBackground />

      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {total > 0 && (
          <>
            {/* 顶栏：主操作突出，副操作弱化 */}
            <header style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              padding: '20px 28px 14px', flexWrap: 'wrap',
            }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1f2937', letterSpacing: '-.01em' }}>
                  {T.workspace.title(total)}
                </h1>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                  九步流水线 · 从剧本到成片，项目与系列一目了然
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Btn variant="primary" onClick={onNewProject}><Icon name="plus" size={14} />{T.workspace.newProject}</Btn>
                <Btn onClick={onNewSeries}><Icon name="layers" size={14} />{T.workspace.newSeries}</Btn>
                <Btn onClick={handleSync} disabled={syncing}>
                  <Icon name="refresh" size={14} />
                  <span style={syncing ? { animation: 'lx-spin 1s linear infinite', display: 'inline-block' } : undefined}>
                    {syncing ? T.workspace.syncing : T.workspace.sync}
                  </span>
                </Btn>
                <Btn onClick={onImport}><Icon name="upload" size={14} />{T.workspace.import}</Btn>
              </div>
            </header>

            {/* 概览统计条 */}
            <div style={{
              padding: '0 28px 12px', display: 'grid', gap: 12,
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            }}>
              <StatCard label="独立项目" value={standalone.length} icon="folder" tone="#6d28d9" />
              <StatCard label="系列" value={series.length} icon="layers" tone="#0891b2" />
              <StatCard label="分镜总数" value={shotCount} icon="film" tone="#d97706" />
              <StatCard label="素材总数" value={assetCount} icon="image" tone="#16a34a" />
            </div>

            {/* 搜索 / 筛选 / 排序 */}
            <div style={{
              padding: '0 28px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300 }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
                  <Icon name="search" size={13} color="#94a3b8" />
                </span>
                <input
                  value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索项目或系列…"
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '7px 10px 7px 30px',
                    borderRadius: 7, border: '1px solid rgba(15,23,42,0.16)',
                    background: 'rgba(255,255,255,.78)', color: '#374151',
                    fontSize: 12, fontFamily: 'inherit', outline: 'none',
                  }} />
              </div>
              <Seg
                options={[{ key: 'all', label: '全部' }, { key: 'series', label: '系列' }, { key: 'project', label: '项目' }]}
                value={filter} onChange={setFilter} />
              <Seg
                options={[{ key: 'recent', label: '最近编辑' }, { key: 'name', label: '名称' }]}
                value={sort} onChange={setSort} />
              <span style={{ fontSize: 10.5, color: '#94a3b8', marginLeft: 'auto' }}>
                显示 {shownTotal} / {total} 项
              </span>
            </div>
          </>
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
          ) : shownTotal === 0 ? (
            <div style={{
              padding: '54px 20px', textAlign: 'center', color: '#7c8798',
              ...glass(false), borderRadius: 12,
            }}>
              <Icon name="search" size={30} color="#94a3b8" />
              <div style={{ fontSize: 13, marginTop: 10 }}>没有匹配「{query}」的项目或系列</div>
              <div style={{ fontSize: 11, marginTop: 5 }}>换个关键词，或把类型筛选切回「全部」</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(288px, 1fr))', gap: 14 }}>
              {shownSeries.map((s) => (
                <SeriesCard key={s.id} series={s} episodes={episodesOf(s.id)} onOpen={() => onOpenSeries?.(s.id)}
                  onDelete={() => onDeleteSeries?.(s.id)} />
              ))}
              {shownProjects.map((p) => (
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
  const progress = progressOf(p);
  const st = statusOf(progress);

  return (
    <div onClick={onOpen}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      title={T.workspace.openProject}
      style={{
        position: 'relative', cursor: 'pointer', padding: '12px 14px 12px',
        display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 12,
        ...glass(hover),
      }}>
      <Cover url={coverOf(p)} seed={(p.title || '烬').slice(0, 1)} label="项目" kind="project" />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{
          fontSize: 14.5, fontWeight: 600, color: '#1f2937', flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{p.title || '(未命名)'}</div>
        <DelBtn onClick={onDelete} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#4b5563' }}>
        <Icon name="clock" size={12} color="#4b5563" />{fmtRelative(p.updatedAt)}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {stats.map((s) => (
          <span key={s.k} style={{
            fontSize: 10.5, color: '#5b6678', background: 'rgba(15,23,42,0.08)',
            border: '1px solid rgba(15,23,42,0.112)', borderRadius: 5, padding: '2px 7px',
          }}>{s.k} {s.v}</span>
        ))}
      </div>

      <Progress value={progress} />

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 2, paddingTop: 9, borderTop: '1px solid rgba(15,23,42,0.096)',
      }}>
        <Pill tone={st.tone}>{st.text}</Pill>
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

  const charCount = episodes.reduce((acc, ep) => acc + ((ep.materials?.characters || []).length), 0);
  const sceneCount = episodes.reduce((acc, ep) => acc + ((ep.materials?.scenes || []).length), 0);
  const seriesCover = (episodes.find((ep) => coverOf(ep)) ? coverOf(episodes.find((ep) => coverOf(ep))) : '');
  const progress = episodes.length
    ? Math.round(episodes.reduce((n, ep) => n + progressOf(ep), 0) / episodes.length)
    : 0;
  const st = statusOf(progress);

  return (
    <div onClick={onOpen}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      title={T.seriesView.title(series.title || '')}
      style={{
        cursor: 'pointer', padding: '12px 14px 12px',
        display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 12,
        ...glass(hover),
      }}>
      <Cover url={seriesCover} seed={(series.title || '系').slice(0, 1)} label="系列" kind="series" />

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
        <DelBtn onClick={onDelete} />
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
          <div style={{ fontSize: 10.5, color: '#7c8798', padding: '6px 2px' }}>{T.seriesView.empty}</div>
        )}
        {episodes.slice(0, 6).map((ep) => (
          <div key={ep.id} title={ep.title} style={{
            width: 46, aspectRatio: '16/9', borderRadius: 4, flexShrink: 0,
            background: 'rgba(8,145,178,.18)', border: '1px solid rgba(8,145,178,.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8.5, color: '#0e7490', overflow: 'hidden',
          }}>
            {(ep.thumbnail || ep.cover)
              ? <img src={ep.thumbnail || ep.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (ep.title || '').slice(0, 3)}
          </div>
        ))}
      </div>

      <Progress value={progress} />

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 2, paddingTop: 9, borderTop: '1px solid rgba(15,23,42,0.096)',
      }}>
        <Pill tone={st.tone}>{st.text}</Pill>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: hover ? '#0e7490' : '#0891b2' }}>
          查看系列 →
        </span>
      </div>
    </div>
  );
}
