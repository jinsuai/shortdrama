import React from "react";
import { VIDEO_SIZE_PRESETS, DEFAULT_VIDEO_SIZE } from "../utils.js";

// 视频分辨率选择器：绑定 project.videoSize（预设 key），修改即写回 project。
// 所有视频生成入口（分场、分镜、3D 导演台）共用，避免硬编码尺寸导致 Wan 16 倍数报错。
export function VideoSizePicker({ project, update }) {
  const key = (project && project.videoSize) || DEFAULT_VIDEO_SIZE;
  const onChange = (e) => {
    if (update) update({ videoSize: e.target.value });
  };
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-secondary, #8b95a7)" }}>
      视频分辨率
      <select
        value={key}
        onChange={onChange}
        style={{ fontSize: 12, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border, #243044)", background: "var(--input-bg, #f4f7fa)", color: "var(--text, #334155)", cursor: "pointer" }}
      >
        {VIDEO_SIZE_PRESETS.map((p) => (
          <option key={p.key} value={p.key}>{p.label}</option>
        ))}
      </select>
    </label>
  );
}
