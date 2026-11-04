import React from 'react';
import { T } from './i18n';
import { Icon } from './ui';
import { BrandMark, CloudBackground } from './StudioShell';

/**
 * 项目内四列布局（复刻交互稿）：
 * 40px 极窄栏（折叠全局导航）| 190px 九步流水线栏 | 主工作区 | 260px 上下文栏
 * 步骤无锁，可自由跳转（参考实现源码确认无 disabled/locked 逻辑）。
 */

const NARROW = [
  { key: 'workspace', icon: 'folder', title: '工作区' },
  { key: 'library', icon: 'library', title: '主体库' },
  { key: 'settings', icon: 'settings', title: '设置' },
];

export function ProjectLayout({
  projectTitle,
  project,        // 用于计算九步完成态与整体制作进度
  currentStep,
  onStepChange,
  onBack,
  onNav,
  context,        // 上下文栏内容（随步骤变化）
  actions,        // 面包屑右侧的操作按钮（如「一键全自动」）
  children,       // 主工作区内容
}) {
  // 每步完成态只读 project 里已存在的字段，缺失一律按「未完成」，不会误报。
  // 字段名与 steps1/2/3、MultiTrackEditor、Director3D 实际读写保持一致。
  const scriptText = typeof project?.script === 'string'
    ? project.script
    : (project?.script?.text || '');
  const mats = project?.materials || {};
  const shots = project?.shots || [];
  const hasAny = (arr) => Array.isArray(arr) && arr.length > 0;
  const stepDone = {
    script: scriptText.trim().length > 0,
    art: !!(project?.artDirection?.preset || project?.artDirection?.name || project?.artDirection?.positive),
    assets: hasAny(mats.characters) || hasAny(mats.scenes) || hasAny(mats.props),
    storyboard: shots.length > 0,
    motion: shots.some((s) => s?.videoUrl),
    assembly: !!project?.assembledVideo || (shots.length > 0 && shots.every((s) => s?.videoUrl)),
    editor: !!project?.assembledVideo,
    director: !!project?.director3d?.firstFrame || hasAny(project?.director3d?.frames),
    voice: shots.some((s) => s?.audioUrl) || (mats.characters || []).some((c) => c?.voiceAudio),
    mix: !!project?.bgmUrl,
    export: !!project?.upscaled,
  };
  const doneCount = T.steps.filter((s) => stepDone[s.id]).length;
  const totalSteps = T.steps.length;
  const pct = Math.round((doneCount / totalSteps) * 100);

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: '#f6f8fc', color: '#374151',
      fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
    }}>

      {/* ① 40px 极窄栏 —— 折叠全局导航 */}
      <div style={{
        width: 40, flexShrink: 0, background: 'rgba(10,10,13,.78)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderRight: '1px solid rgba(15,23,42,0.096)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12, gap: 4,
      }}>
        <div style={{ marginBottom: 10 }}>
          <BrandMark size={26} />
        </div>
        {NARROW.map((n) => (
          <button key={n.key} title={n.title} onClick={() => onNav?.(n.key)}
            style={{
              width: 30, height: 30, border: 'none', borderRadius: 7, background: 'transparent',
              color: '#4b5563', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15,23,42,0.112)'; e.currentTarget.style.color = '#6d28d9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#4b5563'; }}>
            <Icon name={n.icon} size={15} />
          </button>
        ))}

      </div>

      {/* ② 190px 九步流水线栏 */}
      <div style={{
        width: 190, flexShrink: 0,
        background: 'rgba(255,255,255,.72)',
        backdropFilter: 'blur(16px) saturate(140%)', WebkitBackdropFilter: 'blur(16px) saturate(140%)',
        borderRight: '1px solid rgba(15,23,42,0.096)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* 面包屑（标题占一行做省略，操作按钮单独一行，避免 190px 栏挤成竖排） */}
        <div style={{
          padding: '10px 10px 8px', borderBottom: '1px solid rgba(15,23,42,0.096)',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, fontSize: 11.5, color: '#5b6678' }}>
            <button onClick={onBack} title="返回" style={{
              background: 'none', border: 'none', color: '#6d28d9', cursor: 'pointer',
              padding: 0, fontSize: 11.5, fontFamily: 'inherit', flexShrink: 0,
            }}>{T.brand}</button>
            <span style={{ color: '#7c8798', flexShrink: 0 }}>›</span>
            <span style={{
              color: '#374151', minWidth: 0, flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }} title={projectTitle || '(未命名)'}>{projectTitle || '(未命名)'}</span>
          </div>
          {actions && <div style={{ display: 'flex', alignItems: 'center' }}>{actions}</div>}
        </div>

        {/* 制作进度：完成数 / 总步数 + 进度条（对标 Reveric 工作台的进度可视化） */}
        <div style={{ padding: '9px 10px', borderBottom: '1px solid rgba(15,23,42,0.096)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 10.5, color: '#6b7280', marginBottom: 6,
          }}>
            <span>制作进度</span>
            <b style={{ color: '#6d28d9', fontSize: 11 }}>{doneCount} / {totalSteps} 步</b>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'rgba(15,23,42,.08)', overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`, height: '100%', borderRadius: 3,
              background: 'linear-gradient(90deg,#8b5cf6,#0891b2)', transition: 'width .3s',
            }} />
          </div>
        </div>

        {/* 步骤列表：✓ 已完成 · ● 当前 · ○ 未开始 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
          <div style={{
            fontSize: 9.5, color: '#94a3b8', letterSpacing: '.08em', fontWeight: 700,
            padding: '4px 8px 6px',
          }}>流水线</div>
          {T.steps.map((s) => {
            const active = s.id === currentStep;
            const done = !!stepDone[s.id];
            return (
              <button key={s.id} onClick={() => onStepChange?.(s.id)}
                title={`${s.n} ${s.label}${done ? '（已完成）' : ''}`}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 8px', border: 'none', borderRadius: 7, textAlign: 'left',
                  background: active ? 'rgba(109,40,217,.15)' : 'transparent',
                  color: active ? '#6d28d9' : '#5b6678', cursor: 'pointer',
                  fontFamily: 'inherit', marginBottom: 1, position: 'relative', transition: 'all .15s',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(15,23,42,0.064)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                {active && (
                  <span style={{
                    position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                    width: 2, height: 18, background: '#8b5cf6', borderRadius: 1,
                  }} />
                )}
                <span style={{
                  fontSize: 10.5, color: active ? '#6d28d9' : '#7c8798', fontWeight: 600,
                  width: 24, flexShrink: 0,
                }}>
                  {s.n}
                </span>
                <span style={{
                  flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: active ? 600 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{s.label}</span>
                {s.beta && (
                  <span style={{
                    fontSize: 8.5, padding: '0 4px', lineHeight: '13px', borderRadius: 4, flexShrink: 0,
                    background: 'rgba(245,158,11,.16)', color: '#b45309',
                  }}>Beta</span>
                )}
                {/* 状态标记宽度固定，避免挤压标题省略号 */}
                <span style={{
                  width: 12, flexShrink: 0, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {done
                    ? <Icon name="check" size={12} color={active ? '#6d28d9' : '#16a34a'} />
                    : <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: active ? '#8b5cf6' : 'rgba(15,23,42,.18)',
                      }} />}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ padding: '10px 12px', fontSize: 10, color: '#33363d' }}>
          {T.brandFull}
          <div>{T.nav.version}</div>
        </div>
      </div>

      {/* ③ 主工作区（网格背景透出于内容之下） */}
      <div style={{
        flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', background: '#f6f8fc',
      }}>
        <CloudBackground strong={false} />
        <div style={{
          position: 'relative', zIndex: 1, flex: 1, minHeight: 0,
          display: 'flex', flexDirection: 'column',
        }}>
          {children}
        </div>
      </div>

      {/* ④ 260px 上下文栏 */}
      <div style={{
        width: 260, flexShrink: 0,
        background: 'rgba(255,255,255,.72)',
        backdropFilter: 'blur(16px) saturate(140%)', WebkitBackdropFilter: 'blur(16px) saturate(140%)',
        borderLeft: '1px solid rgba(15,23,42,0.096)',
        overflowY: 'auto', padding: 14,
      }}>
        {context}
      </div>
    </div>
  );
}

/** 上下文栏通用区块 */
export function CtxBlock({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 10.5, color: '#4b5563', letterSpacing: '.06em', marginBottom: 7,
        paddingBottom: 5, borderBottom: '1px solid rgba(15,23,42,0.096)',
      }}>{title}</div>
      {children}
    </div>
  );
}

/** 上下文栏：统计格子 */
export function CtxStat({ label, value }) {
  return (
    <div style={{
      background: 'rgba(15,23,42,0.048)', border: '1px solid rgba(15,23,42,0.112)',
      borderRadius: 7, padding: '7px 9px',
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#4b5563', marginTop: 1 }}>{label}</div>
    </div>
  );
}
