import React from "react";

// 异步任务卡片：显示生成任务状态（B 项目图生视频必备，因为视频是异步的）。
export function TaskCard({ task }) {
  const pct = task.progress ?? 0;
  return (
    <div style={styles.card}>
      <div style={styles.row}>
        <span style={styles.label}>{task.label}</span>
        <span style={styles.status}>{task.status}</span>
      </div>
      <div style={styles.barBg}>
        <div style={{ ...styles.bar, width: pct + "%" }} />
      </div>
      {task.url && (
        task.type === "video" ? (
          <video src={task.url} style={styles.preview} controls />
        ) : (
          <img src={task.url} style={styles.preview} alt={task.label} />
        )
      )}
    </div>
  );
}

const styles = {
  card: { border: "1px solid #3f4650", borderRadius: 8, padding: 10, marginBottom: 10, background: "#fff" },
  row: { display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 },
  label: { fontWeight: 500 },
  status: { color: "#3a7", fontSize: 12 },
  barBg: { height: 6, background: "#eee", borderRadius: 3, overflow: "hidden" },
  bar: { height: "100%", background: "#3a7", transition: "width .3s" },
  preview: { width: "100%", marginTop: 8, borderRadius: 6, maxHeight: 160, objectFit: "cover" },
};
