import React from "react";

export function UserManual({ onClose }) {
  const sections = [
    {
      title: "1. 项目与首页",
      lines: [
        "首页可新建空白项目、从模板（甜宠/复仇/婆媳/逆袭/玄幻）新建，或打开已有项目。",
        "项目支持置顶、标签、归档、克隆、移入回收站；误删可从回收站恢复。",
        "建议定期使用「文件 → 导出工程 JSON / 工程包」备份本地数据。",
      ],
    },
    {
      title: "2. 分场剧本",
      lines: [
        "在「分场剧本」填写一句话梗概，点「① 生成分集分场」让 AI 拆成多集多场。",
        "也可「导入小说/故事」或「导入剧本」，再用 AI 转成短剧分集分镜。",
        "选中一集后，点「🤖 AI 细化本分镜」自动补全景别、运镜、灯光、情绪、台词和生图/生视频提示词。",
      ],
    },
    {
      title: "3. 分镜图与视频",
      lines: [
        "每个分场可单独「生成分镜图」（Agnes 生图）和「生成视频」（异步队列，约 1-3 分钟）。",
        "生成失败的镜头可在首页「最近失败」或左侧任务队列里重试。",
      ],
    },
    {
      title: "4. 视频剪辑（轨道）",
      lines: [
        "切换到「视频剪辑」，已生成的视频会自动进入视频轨道。",
        "用鼠标拖动片段可调整前后位置；播放头（红线）点哪里就从哪里预览。",
        "点「✂ 在播放头分割」可把当前片段从播放头处切开。",
        "可「导入音频」到音频轨，「从台词生成字幕」/「导入字幕」到字幕轨。",
        "选中视频片段后可在下方输入要烧录的字幕，并选择淡入淡出转场。",
        "调好后点「导出 MP4」合并成片并下载。",
      ],
    },
    {
      title: "5. 无限画布与 3D 导演台",
      lines: [
        "「无限画布」可自由排布分镜、人设、台词节点，连线形成镜头顺序。",
        "「3D 导演台」可摆场景、灯光、角色人偶、摄影机，截取机位图并回传画布。",
      ],
    },
    {
      title: "6. 配音",
      lines: [
        "「配音」页可输入台词，用 Web Speech API 本地离线朗读，或上传音频素材。",
        "素材库的音频/配音可一键「用于配音」或「用于剪辑」。",
      ],
    },
    {
      title: "7. 快捷键 / 注意",
      lines: [
        "数据保存在本地 IndexedDB，清理浏览器缓存会丢失，请务必定期导出备份。",
        "云端生图/生视频/云端 TTS 需联网并保证余额充足。",
        "顶部「帮助 → 关于 烬序 · 影墟」可查看环境检测与依赖说明。",
      ],
    },
  ];

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>📖 烬序 · 影墟 · 使用说明</h2>
          <button style={xBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ maxHeight: "70vh", overflowY: "auto", paddingRight: 6 }}>
          {sections.map((sec) => (
            <div key={sec.title} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent, #6D28D9)", marginBottom: 6 }}>{sec.title}</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--text-secondary, #9aa6d4)", lineHeight: 1.8 }}>
                {sec.lines.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 };
const modal = { width: "min(720px, 92vw)", maxHeight: "86vh", overflowY: "auto", background: "var(--bg, #f7f9fc)", border: "1px solid var(--border, rgba(15,23,42,0.192))", borderRadius: "var(--radius, 12px)", padding: 20, color: "var(--text, #334155)" };
const xBtn = { border: "none", background: "transparent", color: "var(--text-muted, #5d6779)", fontSize: 16, cursor: "pointer" };
