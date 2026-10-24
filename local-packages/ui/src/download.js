import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

/** 是否运行在 Tauri 桌面壳内 */
export function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** 选择下载/导出目录（仅桌面端可用） */
export async function pickDownloadDir() {
  if (!isTauri()) return { ok: false, err: "仅桌面端支持选择目录" };
  try {
    const sel = await open({ directory: true, multiple: false });
    if (!sel) return { ok: false, cancelled: true };
    return { ok: true, dir: sel };
  } catch (e) {
    return { ok: false, err: e?.message || String(e) };
  }
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const bytes = new Uint8Array(r.result);
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      resolve(btoa(bin));
    };
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
}

function strToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

/**
 * 保存文件：桌面端写入 DOWNLOAD_DIR（留空则用系统下载目录），Web 端走浏览器下载。
 * content: Blob 或字符串。
 */
export async function saveFile(filename, content) {
  const dir = localStorage.getItem("DOWNLOAD_DIR") || "";
  let b64;
  try {
    b64 = content instanceof Blob ? await blobToBase64(content) : strToBase64(String(content));
  } catch (e) {
    return { ok: false, err: "编码失败：" + (e?.message || e) };
  }

  if (isTauri()) {
    try {
      const saved = await invoke("save_file", { dir, filename, data: b64 });
      return { ok: true, path: saved };
    } catch (e) {
      return { ok: false, err: e?.message || String(e) };
    }
  }

  // Web 端降级：浏览器下载
  try {
    const blob = content instanceof Blob ? content : new Blob([content], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    return { ok: true, path: "浏览器下载目录" };
  } catch (e) {
    return { ok: false, err: e?.message || String(e) };
  }
}

/**
 * 桌面端：将本地录制的 webm 经内置 FFmpeg 转码为 MP4 并保存到下载目录 / 指定目录。
 * 仅在 Tauri 壳内可用；Web 端返回 null（调用方降级为直接保存 webm）。
 */
export async function exportIntroMp4(filename, blob) {
  if (!isTauri()) return null;
  let b64;
  try {
    b64 = await blobToBase64(blob);
  } catch (e) {
    throw new Error("编码失败：" + (e?.message || e));
  }
  const dir = localStorage.getItem("DOWNLOAD_DIR") || "";
  try {
    return await invoke("export_intro_mp4", { dir, filename, data: b64 });
  } catch (e) {
    throw new Error(e?.message || String(e));
  }
}

/** base64 字符串 → Blob（用于把合并/转码结果转成可预览/可保存的对象） */
export function b64ToBlob(b64, type = "application/octet-stream") {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
