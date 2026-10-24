import React from 'react';
import { T } from './i18n';

/** 品牌 Logo 方块（紫蓝渐变 + 烬字） */
export function BrandMark({ size = 30 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.27, flexShrink: 0,
      background: 'linear-gradient(135deg, #7c3aed 0%, #7c5cf6 45%, #2563eb 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 2px 12px rgba(109,40,217,.45)',
    }}>
      <span style={{
        color: '#fff', fontSize: size * 0.5, fontWeight: 700, lineHeight: 1,
        fontFamily: '"Noto Sans SC", "Microsoft YaHei", sans-serif',
      }}>烬</span>
    </div>
  );
}

const MENU = [
  { key: 'workspace', label: '工作区', icon: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { key: 'library', label: '主体库', icon: 'M4 21V8l8-5 8 5v13M9 21v-6h6v6' },
  { key: 'settings', label: '设置', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' },
  { key: 'restart', label: '重启服务', icon: 'M21 12a9 9 0 1 1-9-9M21 3v6h-6' },
];

const Icon = ({ d, size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

/**
 * 3D 云朵背景（浅色天空 + 三层视差云团）
 * 远层：小、淡、慢、最模糊；近层：大、浓、快、较清晰。
 * 横向漂移 + 上下浮动分离到两层容器，避免 transform 动画互相覆盖。
 */
const CLOUD_CSS = `
@keyframes cloudDrift { from { transform: translate3d(0,0,0); } to { transform: translate3d(-50%,0,0); } }
@keyframes cloudFloat { 0%,100% { transform: translate3d(0,0,0); } 50% { transform: translate3d(0,-12px,0); } }
`;

// [left%, top%, 直径px]
const CLOUD_LAYERS = [
  { // 远层
    dur: 130, blur: 32, opacity: 0.5, top: '1%', height: '46%',
    puffs: [[4, 52, 160], [17, 38, 120], [31, 58, 200], [47, 44, 140],
            [61, 56, 180], [75, 40, 130], [89, 54, 190]],
  },
  { // 中层
    dur: 82, blur: 20, opacity: 0.7, top: '8%', height: '56%',
    puffs: [[7, 60, 230], [24, 42, 180], [41, 62, 270], [57, 46, 210],
            [71, 60, 250], [87, 44, 190]],
  },
  { // 近层
    dur: 52, blur: 12, opacity: 0.9, top: '20%', height: '64%',
    puffs: [[2, 66, 330], [21, 50, 270], [39, 70, 370], [59, 52, 310], [77, 68, 350]],
  },
];

function CloudPuffs({ puffs }) {
  return (
    <>
      {puffs.map((p, i) => [0, 100].map((off) => (
        <div key={`${i}-${off}`} style={{
          position: 'absolute',
          left: `calc(${p[0]}% + ${off}%)`,
          top: `${p[1]}%`,
          width: p[2], height: p[2] * 0.62, borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.82) 46%, rgba(255,255,255,0) 100%)',
        }} />
      )))}
    </>
  );
}

export function CloudBackground({ strong = true }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0,
      background: strong
        ? 'linear-gradient(180deg, #dbeafe 0%, #e8f1fb 38%, #f4f8fd 72%, #fbfcfe 100%)'
        : 'linear-gradient(180deg, #e8f1fb 0%, #f2f7fc 50%, #fbfcfe 100%)',
    }}>
      <style>{CLOUD_CSS}</style>
      {CLOUD_LAYERS.map((L, i) => (
        <div key={i} style={{
          position: 'absolute', top: L.top, left: 0, width: '200%', height: L.height,
          opacity: L.opacity, filter: `blur(${L.blur}px)`,
          animation: `cloudDrift ${L.dur}s linear infinite`,
          willChange: 'transform',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            animation: `cloudFloat ${Math.round(L.dur / 3)}s ease-in-out infinite`,
          }}>
            <CloudPuffs puffs={L.puffs} />
          </div>
        </div>
      ))}
      {/* 底部柔光：避免近层云压住正文内容 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(255,255,255,0) 42%, rgba(255,255,255,0.62) 100%)',
      }} />
    </div>
  );
}

export function StudioShell({ view, onViewChange, onRestart, children }) {
  const [hover, setHover] = React.useState(null);

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: '#f6f8fc', color: '#374151',
      fontFamily: '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
    }}>
      {/* ── 左侧全局导航 ── */}
      <aside style={{
        width: 168, flexShrink: 0,
        background: 'rgba(255,255,255,.72)',
        backdropFilter: 'blur(18px) saturate(140%)',
        WebkitBackdropFilter: 'blur(18px) saturate(140%)',
        borderRight: '1px solid rgba(15,23,42,0.096)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{ padding: '18px 14px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <BrandMark size={32} />
            <div style={{ lineHeight: 1.2, minWidth: 0 }}>
              <div style={{
                fontSize: 14, fontWeight: 700, letterSpacing: '-.01em',
                color: '#1f2937', whiteSpace: 'nowrap',
              }}>{T.brand}</div>
              <div style={{
                fontSize: 10, color: '#4b5563', letterSpacing: '.06em', whiteSpace: 'nowrap',
              }}>{T.brandSub}</div>
            </div>
          </div>
          <div style={{
            fontSize: 8.5, color: '#3f4451', letterSpacing: '.06em', marginTop: 10, whiteSpace: 'nowrap',
          }}>{T.slogan}</div>
        </div>

        {/* 菜单 */}
        <nav style={{ flex: 1, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {MENU.map((m) => {
            const active = view === m.key;
            const isHover = hover === m.key;
            return (
              <button
                key={m.key}
                onMouseEnter={() => setHover(m.key)}
                onMouseLeave={() => setHover(null)}
                onClick={() => (m.key === 'restart' ? onRestart?.() : onViewChange(m.key))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '9px 10px', border: 'none', borderRadius: 7,
                  background: active ? 'rgba(109,40,217,0.14)' : isHover ? 'rgba(15,23,42,0.064)' : 'transparent',
                  color: active ? '#6d28d9' : '#5b6678',
                  cursor: 'pointer', fontSize: 13, textAlign: 'left',
                  fontWeight: active ? 600 : 400, transition: 'all 0.15s',
                }}
              >
                <Icon d={m.icon} size={15} />
                {m.label}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: '0 16px 8px', fontSize: 10, color: '#33363d' }}>v0.1.0</div>
      </aside>

      {/* ── 主内容区 ── */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  );
}
