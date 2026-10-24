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
  currentStep,
  onStepChange,
  onBack,
  onNav,
  context,        // 上下文栏内容（随步骤变化）
  children,       // 主工作区内容
}) {
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
        {/* 面包屑 */}
        <div style={{
          padding: '12px 12px 10px', borderBottom: '1px solid rgba(15,23,42,0.096)',
          fontSize: 11.5, color: '#5b6678', display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <button onClick={onBack} title="返回" style={{
            background: 'none', border: 'none', color: '#6d28d9', cursor: 'pointer',
            padding: 0, fontSize: 11.5, fontFamily: 'inherit',
          }}>{T.brand}</button>
          <span style={{ color: '#7c8798' }}>›</span>
          <span style={{
            color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{projectTitle || '(未命名)'}</span>
        </div>

        {/* 步骤列表 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
          {T.steps.map((s) => {
            const active = s.id === currentStep;
            return (
              <button key={s.id} onClick={() => onStepChange?.(s.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                  padding: '8px 9px', border: 'none', borderRadius: 7, textAlign: 'left',
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
                <span style={{ fontSize: 11, color: active ? '#6d28d9' : '#7c8798', fontWeight: 600, width: 14 }}>
                  {s.n}
                </span>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: active ? 600 : 400 }}>{s.label}</span>
                {s.beta && (
                  <span style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: 4,
                    background: 'rgba(245,158,11,.16)', color: '#f59e0b',
                  }}>Beta</span>
                )}
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
