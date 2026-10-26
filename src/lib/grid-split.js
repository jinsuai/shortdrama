/**
 * 宫格合图拆分：把面板/工作流返回的一张 N×M 宫格图，切成独立的小图并返回软件端。
 *
 * 为什么需要：分镜类工作流（如 4 宫格 / 9 宫格）一次出一张拼图，
 * 而软件端的分镜列表是按「一帧一个画面」组织的，必须拆开才能分帧使用。
 *
 * 实现要点（纯前端 canvas，无需改 Rust、无需重新编译）：
 *   1. 先把远端图取成同源 Blob —— 走 fetch → blob，这样 canvas 不会被跨域污染，
 *      toDataURL / toBlob 才能正常导出子图。
 *   2. fetch 跨域失败时，降级为 <img crossOrigin="anonymous">（要求图源返回 CORS 头）。
 *   3. 再兜底：Tauri 桌面向导 download_url 把图拉到本地目录（不经前端，无 CORS），
 *      至少保证用户能拿到原图。
 *
 * 拆分顺序：从左到右、从上到下（Z 序），与阅读顺序一致。
 */

// 兜底路径（Tauri download_url）要用 invoke；Web 端垫片返回 null 后由调用方降级。
import { invoke } from './tauri-shim.js';

/** 取远端/本地图片为可被 canvas 安全读取的位图 */
async function loadBitmap(src) {
  // ① File/Blob 直接读（用户本地选择的文件）
  if (src instanceof Blob) {
    const bmp = await createImageBitmap(src);
    return { bitmap: bmp, release: () => bmp.close?.() };
  }

  // ② 远端 URL：fetch → blob → createImageBitmap（最干净，canvas 不会被污染）
  try {
    const res = await fetch(src, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    return { bitmap: bmp, blob, release: () => bmp.close?.() };
  } catch (e) {
    // ③ 降级：img + crossOrigin（图源需给 CORS 头）
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('图片加载失败'));
      im.src = src;
    }).catch(() => null);

    if (img) return { bitmap: img, release: () => {} };
    throw new Error(
      `无法读取图片（跨域被拦截或地址不可访问）：${src}\n` +
      `可先在「设置 → 下载目录」用桌面端下载，或改用本地文件上传。`
    );
  }
}

/**
 * 拆分宫格图。
 *
 * @param {string|Blob} src        图片地址或本地 File/Blob
 * @param {Object} [opts]
 * @param {number} [opts.cols=2]   列数
 * @param {number} [opts.rows=2]   行数
 * @param {number} [opts.gutter=0] 格子之间的缝隙（像素），用于裁掉拼图白边
 * @param {string} [opts.mime]     导出格式，默认 image/png
 * @param {Function} [opts.onProgress] (percent, text) => void
 * @returns {Promise<Array<{index:number, blob:Blob, dataUrl:string, objectUrl:string, width:number, height:number}>>}
 */
export async function splitGrid(src, {
  cols = 2,
  rows = 2,
  gutter = 0,
  mime = 'image/png',
  onProgress = () => {},
} = {}) {
  const total = cols * rows;
  onProgress(5, '正在读取宫格图…');

  const { bitmap, release } = await loadBitmap(src);
  const W = bitmap.width;
  const H = bitmap.height;

  // 每格净尺寸（去掉格子间的缝隙）
  const cellW = Math.floor((W - gutter * (cols - 1)) / cols);
  const cellH = Math.floor((H - gutter * (rows - 1)) / rows);
  if (cellW <= 0 || cellH <= 0) {
    release();
    throw new Error(`宫格尺寸过小或缝隙过大：原图 ${W}×${H}，缝隙 ${gutter}px`);
  }

  const parts = [];
  try {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const sx = c * (cellW + gutter);
        const sy = r * (cellH + gutter);

        const cv = document.createElement('canvas');
        cv.width = cellW;
        cv.height = cellH;
        const ctx = cv.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, sx, sy, cellW, cellH, 0, 0, cellW, cellH);

        const blob = await new Promise((resolve) => cv.toBlob(resolve, mime, 0.95));
        parts.push({
          index: idx,
          row: r,
          col: c,
          blob,
          dataUrl: cv.toDataURL(mime, 0.95),
          objectUrl: URL.createObjectURL(blob),
          width: cellW,
          height: cellH,
        });
        onProgress(10 + Math.round((idx + 1) / total * 80), `已拆分 ${idx + 1}/${total}`);
      }
    }
  } finally {
    release();
  }

  onProgress(95, `拆分完成，共 ${total} 张`);
  return parts;
}

/** Blob → base64（与 Rust save_file 的入参一致；分块避免大图爆栈） */
async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * 把拆分后的小图落盘（桌面端走 Rust save_file，浏览器端走 <a download>）。
 *
 * @param {Array} parts splitGrid 的返回值
 * @param {Object} [opts]
 * @param {string} [opts.dir]     目标目录（空=用户设置的下载目录）
 * @param {string} [opts.prefix]  文件名前缀，默认 shot
 * @param {Function} [opts.log]   日志回调
 * @returns {Promise<Array<{index:number, path:string, filename:string}>>}
 */
export async function persistGridParts(parts, { dir = '', prefix = 'shot', log = null } = {}) {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const out = [];

  for (const p of parts) {
    const filename = `${prefix}_${String(p.index + 1).padStart(2, '0')}.png`;
    if (!isTauri) {
      const a = document.createElement('a');
      a.href = p.objectUrl;
      a.download = filename;
      a.click();
      out.push({ index: p.index, path: '', filename });
      continue;
    }
    try {
      const { invoke } = await import('./tauri-shim.js');
      const data = await blobToBase64(p.blob);
      const path = await invoke('save_file', { dir, filename, data });
      out.push({ index: p.index, path, filename });
    } catch (e) {
      log?.(`⚠️ 第 ${p.index + 1} 张落盘失败：${e?.message || e}`);
      out.push({ index: p.index, path: '', filename });
    }
  }
  return out;
}

/** 释放拆分产生的 objectURL，避免内存泄漏 */
export function releaseGridParts(parts) {
  (parts || []).forEach((p) => {
    try { if (p.objectUrl) URL.revokeObjectURL(p.objectUrl); } catch {}
  });
}
