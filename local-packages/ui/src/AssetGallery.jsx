import React from "react";

// 资产画廊：展示生成/上传的图片、视频缩略图。B 项目（短剧）核心组件，A 也可用。
export function AssetGallery({ items }) {
  if (!items || items.length === 0) {
    return <div style={styles.empty}>暂无资产。生成图片或视频后将显示在这里。</div>;
  }
  return (
    <div style={styles.grid}>
      {items.map((it) => (
        <div key={it.id} style={styles.card}>
          {it.type === "video" ? (
            <video src={it.url} style={styles.thumb} controls />
          ) : (
            <img src={it.url} style={styles.thumb} alt={it.title} />
          )}
          <div style={styles.title}>{it.title}</div>
          <div style={styles.meta}>{it.type} · {it.status}</div>
        </div>
      ))}
    </div>
  );
}

const styles = {
  empty: { color: "#888", fontSize: 13, padding: 16 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 12 },
  card: { border: "1px solid #3f4650", borderRadius: 8, overflow: "hidden", background: "#fff" },
  thumb: { width: "100%", height: 120, objectFit: "cover", display: "block", background: "#eee" },
  title: { padding: "6px 8px 0", fontSize: 13, fontWeight: 500 },
  meta: { padding: "0 8px 8px", fontSize: 11, color: "#999" },
};
