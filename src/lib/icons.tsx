import React from 'react';

/**
 * 本地图标 shim —— 替代 lucide-react。
 *
 * 背景：node_modules/lucide-react 的图标文件在磁盘上物理损坏
 *（"文件或目录损坏且无法读取"），npm install / robocopy 均无法修复，
 * 导致 vite build 报 Could not resolve "./icons/*.js"。
 * 本文件用内联 SVG 提供项目实际用到的图标，零外部依赖，彻底绕过损坏包。
 *
 * 用法：<User size={16} />  与 lucide-react API 兼容（支持 size/color/className/style）。
 */

const Svg = ({ size = 24, color = 'currentColor', strokeWidth = 2, className, style, children, fill = 'none', ...rest }) => (
  React.createElement('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill,
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    style,
    ...rest,
  }, children)
);

// ── 通用 ──
export const Plus = (p) => <Svg {...p}><path d="M5 12h14" /><path d="M12 5v14" /></Svg>;
export const Trash2 = (p) => <Svg {...p}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6" /><path d="M14 11v6" /></Svg>;
export const Settings = (p) => <Svg {...p}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></Svg>;
export const Download = (p) => <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></Svg>;
export const Upload = (p) => <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></Svg>;
export const Move = (p) => <Svg {...p}><path d="M5 9l-3 3 3 3" /><path d="M9 5l3-3 3 3" /><path d="M19 9l3 3-3 3" /><path d="M9 19l3 3 3-3" /><path d="M2 12h20" /><path d="M12 2v20" /></Svg>;
export const Eye = (p) => <Svg {...p}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></Svg>;
export const ChevronDown = (p) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;
export const ChevronRight = (p) => <Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>;
export const Maximize = (p) => <Svg {...p}><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M16 3h3a2 2 0 0 1 2 2v3" /><path d="M21 16v3a2 2 0 0 1-2 2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /></Svg>;
export const ZoomIn = (p) => <Svg {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /><path d="M11 8v6" /><path d="M8 11h6" /></Svg>;
export const ZoomOut = (p) => <Svg {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /><path d="M8 11h6" /></Svg>;
export const CheckSquare = (p) => <Svg {...p}><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Svg>;

// ── 状态 ──
export const CheckCircle = (p) => <Svg {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></Svg>;
export const AlertCircle = (p) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></Svg>;
export const Loader = (p) => <Svg {...p}><path d="M12 2v4" /><path d="M12 18v4" /><path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" /><path d="M2 12h4" /><path d="M18 12h4" /><path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" /></Svg>;

// ── 媒体 ──
export const Play = (p) => <Svg {...p} fill="currentColor" strokeWidth={0}><path d="M5 3l14 9-14 9V3z" /></Svg>;
export const Image = (p) => <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></Svg>;
export const ImageIcon = Image;
export const Film = (p) => <Svg {...p}><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><path d="M7 2v20" /><path d="M17 2v20" /><path d="M2 12h20" /><path d="M2 7h5" /><path d="M2 17h5" /><path d="M17 17h5" /><path d="M17 7h5" /></Svg>;
export const Type = (p) => <Svg {...p}><path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" /></Svg>;

// ── 3D 导演台 ──
export const User = (p) => <Svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Svg>;
export const Box = (p) => <Svg {...p}><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></Svg>;
export const Camera = (p) => <Svg {...p}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></Svg>;
