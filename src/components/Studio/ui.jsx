import React from 'react';

/**
 * 悬浮玻璃卡样式（工作区 / 主体库 / 上下文列表统一使用）
 * 半透明渐变 + 背景模糊 + 落影，hover 上浮，背景网格可隐约透出。
 */
export function glassCard(hover, radius = 12) {
  return {
    background: hover
      ? 'linear-gradient(155deg, rgba(15,23,42,0.184) 0%, rgba(15,23,42,0.088) 45%, rgba(109,40,217,.10) 100%)'
      : 'linear-gradient(155deg, rgba(15,23,42,0.136) 0%, rgba(15,23,42,0.067) 45%, rgba(109,40,217,.06) 100%)',
    border: `1px solid ${hover ? 'rgba(109,40,217,.48)' : 'rgba(15,23,42,0.176)'}`,
    // 模糊刻意压小：保证背景网格能"隐约透出"，而不是被完全糊掉
    backdropFilter: 'blur(4px) saturate(140%)',
    WebkitBackdropFilter: 'blur(4px) saturate(140%)',
    borderRadius: radius,
    boxShadow: hover
      ? '0 22px 46px -16px rgba(0,0,0,.9), inset 0 1px 0 rgba(15,23,42,0.16)'
      : '0 14px 34px -18px rgba(0,0,0,.85), inset 0 1px 0 rgba(15,23,42,0.112)',
    transform: hover ? 'translateY(-3px)' : 'none',
    transition: 'all .2s cubic-bezier(.4,0,.2,1)',
  };
}

/** SVG 图标（Studio 线性风格，stroke） */
const PATHS = {
  file: 'M14 3v5h5M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
  palette: 'M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-1.5a2 2 0 0 0-1.4 3.4A2 2 0 0 1 12 21zM7.5 10.5h.01M12 7.5h.01M16.5 10.5h.01',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM22 21v-2a4 4 0 0 0-3-3.87',
  film: 'M4 4h16v16H4zM4 9h16M4 15h16M9 4v16M15 4v16',
  play: 'M6 4l14 8-14 8z',
  layers: 'M12 2l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  plus: 'M12 5v14M5 12h14',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M19 12l-7 7-7-7',
  refresh: 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  library: 'M4 21V8l8-5 8 5v13M9 21v-6h6v6',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
  check: 'M20 6L9 17l-5-5',
  close: 'M18 6L6 18M6 6l12 12',
  chevronRight: 'm9 18 6-6-6-6',
  chevronDown: 'm6 9 6 6 6-6',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.5-2',
  zoom: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35M11 8v6M8 11h6',
  sparkle: 'M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  image: 'M4 4h16v16H4zM8.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  alert: 'M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  arrowLeft: 'm12 19-7-7 7-7M19 12H5',
  edit: 'M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
};

export function Icon({ name, size = 16, color = 'currentColor', strokeWidth = 1.8, fill = 'none' }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

/** 按钮 */
export function Btn({ children, onClick, variant = 'ghost', size = 'md', disabled, title, style = {} }) {
  const pad = size === 'lg' ? '11px 20px' : size === 'sm' ? '5px 10px' : '7px 14px';
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: pad, borderRadius: 7, fontSize: size === 'sm' ? 11.5 : 12.5,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    transition: 'all .15s', fontFamily: 'inherit', border: '1px solid transparent',
  };
  const variants = {
    primary: {
      border: 'none', color: '#fff', fontWeight: 600,
      background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
      boxShadow: '0 2px 12px rgba(109,40,217,.35)',
    },
    ghost: {
      background: 'rgba(15,23,42,0.048)', border: '1px solid rgba(15,23,42,0.16)', color: '#4b5563',
    },
    outline: {
      background: 'transparent', border: '1px solid rgba(109,40,217,.5)', color: '#6d28d9',
    },
    success: { border: 'none', color: '#fff', fontWeight: 600, background: '#22c55e' },
    warn: { border: 'none', color: '#fff', fontWeight: 600, background: '#f59e0b' },
  };
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.filter = 'brightness(1.15)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}>
      {children}
    </button>
  );
}

/** 胶囊标签 */
export function Pill({ children, tone = 'default', style = {} }) {
  const tones = {
    default: { bg: 'rgba(15,23,42,0.08)', color: '#5b6678' },
    purple: { bg: 'rgba(109,40,217,.18)', color: '#6d28d9' },
    green: { bg: 'rgba(34,197,94,.16)', color: '#22c55e' },
    orange: { bg: 'rgba(245,158,11,.16)', color: '#f59e0b' },
    red: { bg: 'rgba(239,68,68,.16)', color: '#f87171' },
  };
  const t = tones[tone] || tones.default;
  return (
    <span style={{
      fontSize: 10.5, padding: '2px 7px', borderRadius: 5,
      background: t.bg, color: t.color, whiteSpace: 'nowrap', ...style,
    }}>{children}</span>
  );
}

/** 分段按钮组 */
export function Seg({ options = [], value, onChange, size = 'sm' }) {
  return (
    <div style={{ display: 'inline-flex', gap: 4, background: 'rgba(15,23,42,0.048)', padding: 3, borderRadius: 7 }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button key={o.key} onClick={() => onChange?.(o.key)}
            style={{
              padding: size === 'sm' ? '4px 10px' : '6px 14px', border: 'none', borderRadius: 5,
              fontSize: size === 'sm' ? 11.5 : 12.5, cursor: 'pointer', whiteSpace: 'nowrap',
              background: active ? 'rgba(109,40,217,.28)' : 'transparent',
              color: active ? '#6d28d9' : '#5b6678',
              fontWeight: active ? 600 : 400, fontFamily: 'inherit', transition: 'all .15s',
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 滑块 */
export function Slider({ value, min = 0, max = 100, step = 1, onChange, suffix = '' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input type="range" value={value} min={min} max={max} step={step}
        onChange={(e) => onChange?.(Number(e.target.value))}
        style={{ flex: 1, accentColor: '#8b5cf6', height: 3 }} />
      <span style={{ fontSize: 11.5, color: '#5b6678', minWidth: 42, textAlign: 'right' }}>
        {value}{suffix}
      </span>
    </div>
  );
}

/** 通用弹窗 */
export function Modal({ open, onClose, title, subtitle, children, width = 640, footer }) {
  // Esc 关闭
  React.useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      backdropFilter: 'blur(4px)',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width, maxWidth: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        background: '#ffffff', border: '1px solid rgba(15,23,42,0.16)', borderRadius: 12,
        boxShadow: '0 24px 72px rgba(0,0,0,.7)', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '16px 18px', borderBottom: '1px solid rgba(15,23,42,0.128)',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1f2937' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11.5, color: '#4b5563', marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 4,
          }}><Icon name="close" size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>{children}</div>
        {footer && (
          <div style={{
            padding: '12px 18px', borderTop: '1px solid rgba(15,23,42,0.128)',
            display: 'flex', justifyContent: 'flex-end', gap: 8,
          }}>{footer}</div>
        )}
      </div>
    </div>
  );
}

/** 输入框。action 渲染在标题行右侧（如「✨ 从剧本提取」这类行内按钮） */
export function Field({ label, value, onChange, placeholder, multiline, rows = 3, hint, action }) {
  const s = {
    width: '100%', background: 'rgba(15,23,42,0.064)', border: '1px solid rgba(15,23,42,0.16)',
    borderRadius: 7, padding: '8px 10px', color: '#374151', fontSize: 12.5,
    fontFamily: 'inherit', outline: 'none', resize: multiline ? 'vertical' : 'none',
    lineHeight: 1.6,
  };
  return (
    <div style={{ marginBottom: 14 }}>
      {(label || action) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, marginBottom: 5, minHeight: 18,
        }}>
          <div style={{ fontSize: 11.5, color: '#5b6678' }}>{label}</div>
          {action}
        </div>
      )}
      {multiline
        ? <textarea value={value || ''} onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder} rows={rows} style={s} />
        : <input value={value || ''} onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder} style={s} />}
      {hint && <div style={{ fontSize: 10.5, color: '#4b5563', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

/** 空状态 */
export function Empty({ icon = 'image', text, hint }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '48px 20px', color: '#7c8798', gap: 10, textAlign: 'center',
    }}>
      <Icon name={icon} size={36} color="#94a1b3" />
      <div style={{ fontSize: 13 }}>{text}</div>
      {hint && <div style={{ fontSize: 11.5, color: '#94a1b3' }}>{hint}</div>}
    </div>
  );
}

/** 区块标题 */
export function SectionTitle({ children, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#5b6678', letterSpacing: '.04em' }}>
        {children}
      </div>
      {right}
    </div>
  );
}
