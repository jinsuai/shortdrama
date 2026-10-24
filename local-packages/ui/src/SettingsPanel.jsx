import React, { useState } from "react";

// 设置面板：配置 Agnes API Key（浏览器端存 localStorage，Node 端读 env/配置文件）。
// 两个项目共用。注意：桌面端建议 key 存本地安全区，不要落明文文件。
export function SettingsPanel() {
  const [key, setKey] = useState(localStorage.getItem("AGNES_API_KEY") || "");

  const save = () => {
    localStorage.setItem("AGNES_API_KEY", key.trim());
    alert("已保存 Agnes API Key 到本地（localStorage）。");
  };

  return (
    <div style={styles.wrap}>
      <h3 style={styles.h}>设置 · Agnes API</h3>
      <label style={styles.label}>API Key</label>
      <input style={styles.input} type="password" value={key}
        placeholder="粘贴你的 Agnes API Key" onChange={(e) => setKey(e.target.value)} />
      <button style={styles.btn} onClick={save}>保存</button>
      <p style={styles.hint}>Key 保存在本地，不会上传。后端生产环境请用环境变量 AGNES_API_KEY。</p>
    </div>
  );
}

const styles = {
  wrap: { maxWidth: 420 },
  h: { fontSize: 15, margin: "0 0 12px" },
  label: { display: "block", fontSize: 13, marginBottom: 6 },
  input: { width: "100%", padding: 8, border: "1px solid #d0d0cc", borderRadius: 6, fontSize: 13, boxSizing: "border-box" },
  btn: { marginTop: 10, padding: "6px 14px", border: "none", borderRadius: 6, background: "#3a7", color: "#fff", cursor: "pointer", fontSize: 13 },
  hint: { fontSize: 12, color: "#999", marginTop: 10 },
};
