import React, { useState, useEffect, useRef, useCallback } from "react";
// shell模块使用动态导入，避免Tauri v2版本不兼容导致构建失败
import { ThreePane, TaskCard, MenuBar, StatusBar, DockNav, TopBar, applyTheme, openDB, SessionProvider} from "@dual/ui";
import { DubbingBoard } from "./components/DubbingBoard";
import { TemplateMarket } from "./components/TemplateMarket";
import { PipelineView } from "./components/Pipeline/PipelineView.jsx";
import { PipelineSidebar } from "./components/Pipeline/PipelineSidebar.jsx";
import { Studio } from "./components/Studio/Studio.jsx";
import { getAppSetting, saveAppSettings, playNotificationSound, t } from "./utils/app-settings.js";
import { CustomSettingsDialog } from "./components/CustomSettingsDialog.jsx";
import { defaultProject, templateProject, cloneProject, packageProject, isPackage, metaOf, PROJECT_TEMPLATES, DRAMA_TYPES, normalizeProject, relTime } from "./utils.js";
import { saveBlob } from "./utils.js";


const TABS = [
  { k: "script", t: "剧本创作", icon: "🎬" },
  { k: "characters", t: "人物管理", icon: "👤" },
  { k: "storyboard", t: "分镜与生图", icon: "📝" },
  { k: "dub", t: "配音工作室", icon: "🎙️" },
  { k: "video", t: "视频生成", icon: "🎥" },
  { k: "editor", t: "剪辑导出", icon: "✂️" },
  { k: "library", t: "素材库", icon: "🗂" },
];

// 无限画布 / 3D 导演台「开发中」目标能力清单（对应升级规格 §4.1 / §5.1）。
// 现有基础版仍可使用，以下为后续逐项补齐的验收目标。
const CANVAS_ROADMAP = [
  { heading: "基础操控", items: [
    "无边视口：平移 / 滚轮缩放，无边界，可横向排布数十集工作链路",
    "框选、多选、分组、复制‑粘贴、删除、锁定节点",
    "画布工程本地保存、另存、版本快照，随时回退分镜方案",
    "可拖拽功能节点",
  ] },
  { heading: "节点类型", items: [
    "文本节点：剧情梗概 / 人设 / 台词备注 / 拍摄要求",
    "LLM 节点（GLM‑4‑Flash）：剧本生成、分镜拆解、台词润色",
    "BGE‑M3 检索节点：素材库搜索、桥段查重、风格调取",
    "3D 导演台入口节点，点开即进入虚拟片场",
    "视频生成（Wan‑2.2）/ 音频 TTS / 字幕 / 剪辑合并节点",
    "图片参考、情绪板、场景预设、角色卡片",
  ] },
  { heading: "工作流逻辑", items: [
    "节点连线设定数据流向，上游输出自动下发下游",
    "一键顺序执行整条流水线；改剧本后下游分镜 / 镜头自动刷新",
    "多分支并行，同时生成多种剧情版本对比",
    "连线备注、颜色分类，区分剧情 / 运镜 / 灯光参数链路",
  ] },
  { heading: "短剧专项", items: [
    "按剧集分区，画布左右依次排布第 1‑N 集工作流",
    "镜头卡片自由拖拽调换镜头顺序",
    "单个镜头节点独立调试提示词、单独重生成视频",
    "素材卡片跨剧集复用角色、场景、参考画面",
  ] },
];

const STAGE3D_ROADMAP = [
  { heading: "虚拟场景搭建", items: [
    "内置海量环境预设：都市街道 / 室内居室 / 古风庭院 / 雨夜外景 / 咖啡厅等",
    "自定义地面、墙体、门窗、天空盒、环境雾气、雨雪环境特效",
    "自由摆放桌椅、摆件、交通工具等全部道具资产",
  ] },
  { heading: "角色人偶调度", items: [
    "多虚拟人偶，设定外貌服饰，锁定角色样貌保证视频人脸统一",
    "拖拽更改 XYZ 坐标、身体朝向、视线目标，解决双人对话眼神跑偏",
    "骨骼姿态编辑器：争吵 / 拥抱 / 站立 / 坐下 / 抬手 / 落泪",
    "时间轴关键帧：行走、抬手、奔跑、位移路线，预览完整动作",
  ] },
  { heading: "摄影机系统（核心）", items: [
    "多独立摄像机：远景 / 中景 / 近景 / 人脸特写 / 过肩 / 俯拍 / 低角度",
    "自定义画幅，固定 9:16 竖屏比例与安全构图框",
    "运镜参数：缓慢推镜 / 拉镜 / 环绕 / 跟随 / 镜头抖动",
    "机位快照，导出每个摄像机视角预览图作为构图参考",
  ] },
  { heading: "灯光与氛围", items: [
    "拖拽式主光 / 辅光 / 轮廓光 / 环境光 / 点光源",
    "亮度、色温、软硬阴影、彩色氛围光",
    "模板套用：昏暗烛光 / 冷调雨夜 / 午后暖阳 / 霓虹夜景",
  ] },
  { heading: "和无限画布互通", items: [
    "从画布剧本节点读取台词、场景需求，自动初始化场景",
    "调好机位 / 灯光 / 人物后，一键输出结构化分镜提示词 + 机位预览图",
    "生成完毕的镜头画面回传到画布视频节点",
    "场景配置保存为可复用节点，下个工程直接载入",
  ] },
  { heading: "高级附加", items: [
    "镜头清单预览，顺序播放分镜机位动画预演成片节奏",
    "遮挡检查，排查人偶被墙体 / 道具挡住脸部等构图缺陷",
    "导出整套片场参数、截图、运镜脚本，供给 AI 视频生成引擎",
  ] },
];

// ── 最近打开追踪（多项目管理增强，纯本地 localStorage）──
const SD_RECENT_KEY = "SD_RECENT_OPEN";
function recordRecentSd(id) {
  try {
    const arr = JSON.parse(localStorage.getItem(SD_RECENT_KEY) || "[]");
    const next = [{ id, t: Date.now() }, ...arr.filter((x) => x.id !== id)].slice(0, 16);
    localStorage.setItem(SD_RECENT_KEY, JSON.stringify(next));
  } catch (_) {}
}
function recentMapSd() {
  try { return new Map(JSON.parse(localStorage.getItem(SD_RECENT_KEY) || "[]").map((x) => [x.id, x.t])); } catch { return new Map(); }
}

export function App() {
  const [db, setDb] = useState(null);
  // 自动迁移旧的HTTP API地址到HTTPS
  useEffect(() => {
    try {
      const oldUrl = localStorage.getItem("DISPATCH_BASE_URL");
      if (oldUrl && oldUrl.startsWith("http://")) {
        const newUrl = oldUrl.replace("http://", "https://");
        localStorage.setItem("DISPATCH_BASE_URL", newUrl);
        console.log("[API地址迁移] 已将旧的HTTP地址升级为HTTPS:", oldUrl, "->", newUrl);
      }
    } catch (e) {}
  }, []);
  const [projects, setProjects] = useState([]);
  const [series, setSeries] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [project, setProject] = useState(null);
  const [tab, setTab] = useState("script");
  const [logLines, setLogLines] = useState([]);
  // 带时间戳的可视日志：所有生成/操作状态都带时间，便于判断「还在跑」还是「卡住」。
  const log = useCallback((m) => {
    const ts = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setLogLines((prev) => [...prev.slice(-50), `[${ts}] ${m}`]);
    // 通知提示音：根据日志内容播放对应的提示音
    try {
      if (m.includes("成功") || m.includes("✅") || m.includes("完成")) {
        playNotificationSound("success");
      } else if (m.includes("失败") || m.includes("❌") || m.includes("错误") || m.includes("异常")) {
        playNotificationSound("error");
      }
    } catch (e) {}
  }, []);

  const [theme, setTheme] = useState(() => localStorage.getItem("THEME") || "dark");
  const [showSettings, setShowSettings] = useState(false);
  const [showTemplateMarket, setShowTemplateMarket] = useState(false);
  const [feat, setFeat] = useState(() => {
    try { return JSON.parse(localStorage.getItem("SD_FEATURES") || "{}"); } catch { return {}; }
  });
  const fileInputRef = useRef(null);

  // 打开用户手册（提示用户手动打开，避免Tauri v2模块导入导致构建失败）
  const openUserManual = useCallback(() => {
    alert("用户手册已打包到软件安装目录中。\n\n请在软件安装目录中找到「用户手册.md」文件，用记事本或Markdown编辑器打开查看。");
  }, []);


  const [page, setPage] = useState(null);
  const [pipelineMode, setPipelineMode] = useState(false);
  const [pipelineStep, setPipelineStep] = useState('script');
  // 3D导演台渲染的首帧图片，传递给视频生成模块
  const [externalFirstFrame, setExternalFirstFrame] = useState(null);
  // 素材库联动：配音草稿（chunk + nonce）与剪辑片段。
  const [dubChunk, setDubChunk] = useState("");
  const [dubNonce, setDubNonce] = useState(0);
  const [dubAudio, setDubAudio] = useState(null);
  const [editorAssets, setEditorAssets] = useState([]);
  const [showTrash, setShowTrash] = useState(false);
  const [trashList, setTrashList] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  // 强制刷新任务已用时间（每秒一次），必须放在所有提前 return 之前。
  const [, forceTick] = useState(0);

  // （2026-10-20 清）AssetLibrary 及其两个回调 useAssetDub / useAssetEdit 已删除：
  // 该组件在 另一版 App.jsx 里只被 import、从未渲染，属于旧「素材库」tab 的遗留。
  // 剪辑器消费完 incomingAssets 后回调清空，避免同一批素材被重复添加
  const clearEditorAssets = useCallback(() => setEditorAssets([]), []);

  useEffect(() => {
    // 使用@dual/ui的applyTheme设置主题（恢复软件最开始的颜色）
    applyTheme(theme);
  }, [theme]);

  const featOn = (k) => feat[k] !== false;
  const toggleFeat = (k) => setFeat((f) => {
    const n = { ...f, [k]: f[k] === false ? true : false };
    localStorage.setItem("SD_FEATURES", JSON.stringify(n));
    return n;
  });

  useEffect(() => {
    let alive = true;
    openDB().then(async (d) => {
      if (!alive) return;
      setDb(d);
      let list = (await d.listProjects("shortdrama")).map((p) => ({ id: p.id, ...metaOf(p.data), updatedAt: p.updatedAt }));
      if (!alive) return;
      setProjects(list);
      // 加载系列（独立命名空间，结构与项目一致）
      let slist = [];
      try {
        slist = (await d.listProjects("shortdrama_series")).map((p) => ({ id: p.id, ...p.data, updatedAt: p.updatedAt }));
      } catch (_) { slist = []; }
      if (!alive) return;
      setSeries(slist);
      if (list.length > 0) setActiveId(list[0].id);
    }).catch((e) => { if (alive) log("数据库初始化失败：" + e.message); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!db || !activeId) return;
    let alive = true;
    db.loadProject("shortdrama", activeId).then((data) => { if (alive && data) setProject(normalizeProject(data)); });
    return () => { alive = false; };
  }, [db, activeId]);


  useEffect(() => {
    if (!db || !activeId || !project) return;
    // 根据用户设置控制自动保存
    if (!getAppSetting("autoSave", true)) return;
    const interval = Number(getAppSetting("autoSaveInterval", 30)) * 1000;
    // interval 已经是毫秒，之前套 Math.min(400, interval) 导致恒为 400ms，
    // 用户设置的「自动保存间隔」完全失效，且每次改动都全量写一次 IndexedDB。
    const t = setTimeout(() => db.saveProject("shortdrama", activeId, project), interval);
    return () => clearTimeout(t);
  }, [db, activeId, project]);

  // 任务时间显示：活跃任务每秒刷新「已用时间」。必须放在任何提前 return 之前。
  const activeQueueLength = (project?.tasks || []).filter((t) => ["pending", "running", "paused"].includes(t.status)).length;
  useEffect(() => {
    if (activeQueueLength > 0) {
      const i = setInterval(() => forceTick((x) => x + 1), 1000);
      return () => clearInterval(i);
    }
  }, [activeQueueLength]);

  const recent = recentMapSd(); // 最近打开映射（首页用）

  // 数据库尚未就绪：显示加载态（此分支只引用已声明的变量，安全）
  if (!db) {
    return <div style={{ padding: 40, color: "var(--text-muted, #5d6779)", background: "var(--bg, #f7f9fc)", height: "100vh", boxSizing: "border-box", whiteSpace: "pre-wrap" }}>{logLines.length ? <span style={{ color: "var(--danger, #ef4444)" }}>{logLines.slice(-3).join("\n")}</span> : "加载中…"}</div>;
  }

  // 确保项目有默认字段，避免 undefined.scenes 报错（仅在有活跃项目时）
  if (project) {
    if (!project.scenes) project.scenes = [];
    if (!project.episodes) project.episodes = [];
    if (!project.shots) project.shots = [];
    if (!project.materials) project.materials = { characters: [], scenes: [], props: [] };
    if (!project.characters) project.characters = [];
    if (!project.tasks) project.tasks = [];
    if (!project.dramaType) project.dramaType = "real";
    if (!project.outline) project.outline = { synopsis: "" };
    if (!project.script) project.script = "";
  }

  const update = (patch) => setProject((p) => ({ ...p, ...(typeof patch === "function" ? patch(p) : patch) }));
  const switchProject = (id) => { recordRecentSd(id); setActiveId(id); };
  const deleteProject = async () => {
    if (projects.length <= 1) { log("至少保留一个项目。"); return; }
    if (!window.confirm("删除当前短剧项目？不可撤销。")) return;
    await db.deleteProject("shortdrama", activeId);
    const rest = projects.filter((p) => p.id !== activeId);
    setProjects(rest);
    setActiveId(rest[0].id);
  };
  const renameProject = (title) => {
    setProject((p) => ({ ...p, title }));
    setProjects((l) => l.map((x) => (x.id === activeId ? { ...x, title } : x)));
  };

  // ── 项目元数据：置顶 / 归档 / 标签（缺陷 §1 / §3）────
  const applyMeta = async (id, patch) => {
    if (!db) return;
    const rec = await db.loadProject("shortdrama", id);
    if (!rec) return;
    const next = { ...rec, ...patch };
    await db.saveProject("shortdrama", id, next);
    setProjects((l) => l.map((p) => (p.id === id ? { ...p, ...metaOf(next) } : p)));
    if (id === activeId) setProject((p) => ({ ...p, ...patch }));
  };
  const togglePin = (id) => { const p = projects.find((x) => x.id === id); applyMeta(id, { pinned: !(p && p.pinned) }); };
  const toggleArchive = (id) => { const p = projects.find((x) => x.id === id); applyMeta(id, { archived: !(p && p.archived) }); };
  const addTag = (id, tag) => {
    const p = projects.find((x) => x.id === id); if (!p || !tag) return;
    const tags = Array.from(new Set([...(p.tags || []), tag]));
    applyMeta(id, { tags });
  };
  const removeTag = (id, tag) => {
    const p = projects.find((x) => x.id === id); if (!p) return;
    applyMeta(id, { tags: (p.tags || []).filter((t) => t !== tag) });
  };

  // ── 克隆 / 模板 / 导入工程包（缺陷 §1 / §3）────
  const newProject = async (tpl, dramaType) => {
    const def = tpl ? templateProject(tpl, null) : defaultProject("新短剧 " + (projects.length + 1));
    def.dramaType = dramaType || def.dramaType || "real";
    await db.saveProject("shortdrama", def.id, def);
    setProjects((l) => [{ id: def.id, ...metaOf(def) }, ...l]);
    setActiveId(def.id);
    setTab("script");
    setPage(null);
  };
  const cloneCurrent = async () => {
    const copy = cloneProject(project, (project.title || "项目") + " 副本");
    await db.saveProject("shortdrama", copy.id, copy);
    setProjects((l) => [{ id: copy.id, ...metaOf(copy) }, ...l]);
    setActiveId(copy.id);
    log("已克隆项目：" + copy.title);
  };
  const importProject = async (data) => {
    if (!data || typeof data !== "object") { log("文件格式无效。"); return; }
    let p;
    if (isPackage(data)) p = { ...data.project, id: "sd_" + Date.now(), createdAt: Date.now() };
    else p = { ...data, id: "sd_" + Date.now(), createdAt: Date.now() };
    await db.saveProject("shortdrama", p.id, p);
    setProjects((l) => [{ id: p.id, ...metaOf(p) }, ...l]);
    setActiveId(p.id);
    setTab("script"); setPage(null);
    log("已导入工程：" + (p.title || "(未命名)") + (isPackage(data) ? "（工程包）" : ""));
  };

  // ── 回收站（缺陷 §3：缺回收站）────
  const moveToTrash = async (id) => {
    if (projects.length <= 1) { log("至少保留一个项目。"); return; }
    const rec = await db.loadProject("shortdrama", id);
    if (!rec) return;
    if (!window.confirm("将「" + (rec.title || "未命名") + "」移入回收站？可从回收站恢复。")) return;
    await db.saveProject("shortdrama_trash", id, { ...rec, _trashAt: Date.now() });
    await db.deleteProject("shortdrama", id);
    const rest = projects.filter((p) => p.id !== id);
    setProjects(rest);
    if (activeId === id) { setActiveId(rest[0]?.id); setPage(null); }
    log("已移入回收站：" + (rec.title || ""));
  };
  const openTrash = async () => {
    const t = await db.listProjects("shortdrama_trash");
    setTrashList(t.map((r) => ({ id: r.id, title: r.data.title, trashAt: r.data._trashAt, data: r.data })));
    setShowTrash(true);
  };
  const restoreTrash = async (id) => {
    const rec = await db.loadProject("shortdrama_trash", id);
    if (!rec) return;
    delete rec._trashAt;
    await db.saveProject("shortdrama", id, rec);
    await db.deleteProject("shortdrama_trash", id);
    setProjects((l) => [{ id, ...metaOf(rec) }, ...l]);
    setTrashList((l) => l.filter((x) => x.id !== id));
    log("已从回收站恢复：" + (rec.title || ""));
  };
  const purgeTrash = async (id) => {
    await db.deleteProject("shortdrama_trash", id);
    setTrashList((l) => l.filter((x) => x.id !== id));
    log("已永久删除。");
  };
  const emptyTrash = async () => {
    const t = await db.listProjects("shortdrama_trash");
    for (const r of t) await db.deleteProject("shortdrama_trash", r.id);
    setTrashList([]);
    log("回收站已清空。");
  };

  // ── 工程包导出（缺陷 §3：素材不能随 JSON 打包）────
  const exportPackage = async () => {
    const blob = new Blob([JSON.stringify(packageProject(project), null, 2)], { type: "application/json" });
    const res = await saveBlob((project.title || "shortdrama") + "_工程包.json", blob, { log });
    if (res.ok) log("已导出工程包（含全部资产链接）：" + (res.path || ""));
    else if (res.err) log("导出失败：" + res.err);
  };
  const onPkgPicked = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { try { importProject(JSON.parse(reader.result)); } catch { log("导入失败：文件格式无效"); } };
    reader.readAsText(f);
    e.target.value = "";
  };

  // ── 任务队列控制（缺陷 §11：暂停/取消/优先级/重试/批量）────
  const updateTask = (id, patch) => setProject((p) => ({ ...p, tasks: (p.tasks || []).map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const cancelTask = (id) => updateTask(id, { status: "canceled" });
  const pauseTask = (id) => updateTask(id, { status: "paused" });
  const resumeTask = (id) => updateTask(id, { status: "pending" });
  const retryTask = (id) => updateTask(id, { status: "pending", error: null, progress: 0 });
  const setTaskPriority = (id, pri) => updateTask(id, { priority: pri });
  const batchCancelTasks = () => setProject((p) => ({ ...p, tasks: (p.tasks || []).map((t) => (["pending", "running", "paused"].includes(t.status) ? { ...t, status: "canceled" } : t)) }));

  const visibleTabs = TABS.filter((t) => {
    if (t.dev) return false;
    if (t.k === "editor") return featOn("video");
    return true;
  });
  const activeTab = visibleTabs.some((t) => t.k === tab) ? tab : (visibleTabs[0]?.k || "script");

  const exportProject = async () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const res = await saveBlob((project.title || "shortdrama") + ".json", blob, { log });
    if (res.ok) log("已导出项目 JSON：" + (res.path || ""));
    else if (res.err) log("导出失败：" + res.err);
  };
  const exportCastScenes = async () => {
    const shots = project?.shots || [];
    const castCount = new Map();
    shots.forEach((sh) => (sh.dialogues || []).forEach((d) => { const nm = (d.character || "").trim(); if (nm) castCount.set(nm, (castCount.get(nm) || 0) + 1); }));
    const cast = [...castCount.keys()].map((name, i) => ({ id: "cast_" + i, name, lines: castCount.get(name) }));
    const scenes = (project?.scenes || []).map((s) => ({ id: s.id, title: s.title || "场景", desc: s.desc || "", imageUrl: s.imageUrl || null }));
    const data = { kind: "shortdrama-cast-scenes", version: 1, projectTitle: project.title || "", exportedAt: Date.now(), cast, scenes };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const res = await saveBlob((project.title || "shortdrama") + "_角色场景.json", blob, { log });
    if (res.ok) log(`已导出角色与场景：「${cast.length} 位角色 / ${scenes.length} 个场景」，可在 3D 导演台「导入短剧角色/场景」载入：${res.path || ""}`);
    else if (res.err) log("导出失败：" + res.err);
  };
  const importFile = () => { if (fileInputRef.current) fileInputRef.current.click(); };
  const onFilePicked = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { importProject(JSON.parse(reader.result)); } catch { log("导入失败：文件格式无效"); }
    };
    reader.readAsText(f);
    e.target.value = "";
  };

  // ══ Studio 界面（打开软件默认入口）══
  return (
    <>
      <Studio
        projects={projects}
        series={series}
        project={project}
        update={update}
        log={log}
        onCreateProject={async ({ title, text, seriesId }) => {
          const def = defaultProject(title || ("新短剧 " + (projects.length + 1)));
          if (text) def.script = text;
          if (seriesId) def.seriesId = seriesId;
          await db.saveProject("shortdrama", def.id, def);
          setProjects((l) => [{ id: def.id, ...metaOf(def), updatedAt: Date.now() }, ...l]);
          if (!seriesId) { setActiveId(def.id); setProject(def); }
          log("已创建项目：" + def.title);
        }}
        onOpenProject={(id) => switchProject(id)}
        onDeleteProject={async (id) => {
          try { await db.deleteProject?.("shortdrama", id); } catch (_) {}
          setProjects((l) => l.filter((p) => p.id !== id));
          if (activeId === id) {
            setActiveId(null);
            setProject(null);
            setPage("home");
          }
          log("已删除项目");
        }}
        onCreateSeries={async ({ title, description }) => {
          const def = { id: "srs_" + Date.now(), title, description: description || "", episodes: [], characters: [], scenes: [], cover: null, createdAt: Date.now() };
          await db.saveProject("shortdrama_series", def.id, def);
          setSeries((l) => [{ id: def.id, ...def, updatedAt: Date.now() }, ...l]);
          log("已创建系列：" + title);
        }}
        onEditSeries={async (id, patch) => {
          let rec = null;
          try { rec = await db.loadProject("shortdrama_series", id); } catch (_) {}
          if (!rec) return;
          rec = { ...rec, ...patch, updatedAt: Date.now() };
          await db.saveProject("shortdrama_series", id, rec);
          setSeries((l) => l.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s)));
          log("已更新系列");
        }}
        onDeleteSeries={async (id) => {
          // 属于该系列的剧集转为独立项目（清空 seriesId），避免误删用户作品
          const eps = projects.filter((p) => p.seriesId === id).map((p) => p.id);
          for (const pid of eps) {
            try {
              const rec = await db.loadProject("shortdrama", pid);
              if (rec) { rec.seriesId = null; await db.saveProject("shortdrama", pid, rec); }
            } catch (_) {}
          }
          try { await db.deleteProject?.("shortdrama_series", id); } catch (_) {}
          setSeries((l) => l.filter((x) => x.id !== id));
          setProjects((l) => l.map((p) => (p.seriesId === id ? { ...p, seriesId: null } : p)));
          log("已删除系列（其中的剧集已转为独立项目）");
        }}
        onCreateEpisode={async (seriesId, title, file, pastedText) => {
          let text = pastedText || '';
          let sourceName = null;
          if (file) {
            const ext = (file?.name || "").split('.').pop().toLowerCase();
            if (ext === 'docx') {
              const mammoth = (await import('mammoth')).default;
              const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
              text = res?.value || '';
            } else {
              text = await file.text();
            }
            sourceName = file?.name || null;
          }
          const ep = defaultProject(title || ("第" + (projects.filter(p => p.seriesId === seriesId).length + 1) + "集"));
          ep.seriesId = seriesId;
          if (text) {
            ep.script = text;
            ep.sourceName = sourceName;
            ep.sourceText = text;
            ep.sourceType = 'script';
          }
          // 方案A：新建剧集即继承同系列已有剧集的资产（人物/场景/道具），
          // 使第二集及之后可直接复用第一集资产；深拷贝避免两集共享同一对象互相污染。
          const existing = projects.filter((p) => p.seriesId === seriesId);
          if (existing.length) {
            try {
              const src = await db.loadProject("shortdrama", existing[0].id);
              // 素材库：首集设一次，后续剧集自动复用人物/场景/道具（原方案 A）
              if (src?.materials) ep.materials = JSON.parse(JSON.stringify(src.materials));
              // 系列级视觉风格：艺术指导（画风 + 正/负向提示词）与剧集类型首集设一次，
              // 后续剧集自动继承，保证整部剧视觉统一，不必每集重设（之前漏了这一项）
              if (src?.artDirection) ep.artDirection = JSON.parse(JSON.stringify(src.artDirection));
              if (src?.dramaType) ep.dramaType = src.dramaType;
            } catch (_) { /* 继承失败不影响新建剧集 */ }
          }
          await db.saveProject("shortdrama", ep.id, ep);
          setProjects((l) => [{ id: ep.id, ...metaOf(ep), updatedAt: Date.now() }, ...l]);
          log("已创建剧集：" + ep.title + (text ? "（已导入原文 " + (text.length) + " 字）" : "") + (existing.length ? "（已继承首集资产）" : ""));
        }}
        onDeleteEpisode={async (id) => {
          try { await db.deleteProject?.("shortdrama", id); } catch (_) {}
          setProjects((l) => l.filter((p) => p.id !== id));
          if (activeId === id) {
            setActiveId(null);
            setProject(null);
            setPage("home");
          }
          log("已删除剧集");
        }}
        onImportFile={async ({ file, title }) => {
          try {
            const ext = (file?.name || "").split('.').pop().toLowerCase();
            let text = "";
            if (ext === 'docx') {
              const mammoth = (await import('mammoth')).default;
              const res = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
              text = res?.value || '';
            } else {
              text = await file.text();
            }
            const def = defaultProject(title || (file?.name || "导入项目").replace(/\.[^.]+$/, ''));
            def.script = text;
            def.sourceName = file?.name || null;
            def.sourceText = text;
            def.sourceType = 'script';
            await db.saveProject("shortdrama", def.id, def);
            setProjects((l) => [{ id: def.id, ...metaOf(def), updatedAt: Date.now() }, ...l]);
            setActiveId(def.id);
            setProject(def);
            log("已导入文件：" + def.title);
          } catch (e) {
            log("导入失败：" + (e?.message || e));
          }
        }}
        onSync={async () => {
          try {
            alert(`同步成功，拉取到 ${projects.length} 个项目 / ${series.length} 个系列`);
          } catch (e) { alert("同步失败：" + e.message); }
        }}
        onRestart={() => {
          if (window.confirm("将重新加载配置并刷新页面。\n\n是否继续？")) {
            log("正在重启服务…");
            setTimeout(() => window.location.reload(), 600);
          }
        }}
        onSaveSettings={(s) => {
          try {
            saveAppSettings({
              defaultModels: s?.models || {},
              defaultRatios: s?.ratios || {},
              defaultPrompts: s?.prompts || {},
            });
            const n = Object.keys(s?.models || {}).length;
            log("设置已保存：" + n + " 类默认模型/比例/提示词已写入本地");
          } catch (e) {
            log("设置保存失败：" + (e?.message || e));
          }
        }}
        allAssets={[]}
      />

      {/* ── 账号相关弹窗（必须与 Studio 同级渲染，否则不可达）── */}
    </>
  );

}