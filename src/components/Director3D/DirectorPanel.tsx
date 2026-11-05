import { useState } from 'react';
import { generateText } from '../../lib/providers/index.js';
import { saveBlob } from '../../utils.js';
import {
  User,
  Box,
  Camera,
  Settings,
  Plus,
  Trash2,
  Move,
  Eye,
  Download,
  ChevronDown,
  ChevronRight,
} from '../../lib/icons';
import { useDirectorStore } from './store';
import { ASPECT_RATIOS, CAMERA_MOVEMENTS, CAMERA_MOVEMENT_HINTS, CAMERA_DEFAULT_DURATION, CHARACTER_TEMPLATES, CHARACTER_POSES, SCENE_TEMPLATES, type CharacterPose } from './types';

function PanelHeader({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: any;
  title: string;
  count?: number;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ borderBottom: '1px solid #dde4f0', marginBottom: '8px' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 12px',
          cursor: 'pointer',
          background: '#e6ecf8',
        }}
      >
        {open ? (
          <ChevronDown size={14} style={{ marginRight: 6 }} />
        ) : (
          <ChevronRight size={14} style={{ marginRight: 6 }} />
        )}
        <Icon size={14} style={{ marginRight: 6, color: '#4facfe' }} />
        <span style={{ fontSize: '13px', fontWeight: 600, flex: 1 }}>
          {title}
        </span>
        {count !== undefined && (
          <span
            style={{
              fontSize: '11px',
              background: '#dbe3f2',
              padding: '1px 6px',
              borderRadius: '8px',
            }}
          >
            {count}
          </span>
        )}
      </div>
      {open && <div style={{ padding: '8px 12px' }}>{children}</div>}
    </div>
  );
}

function Vector3Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: { x: number; y: number; z: number };
  onChange: (v: { x: number; y: number; z: number }) => void;
}) {
  return (
    <div style={{ marginBottom: '6px' }}>
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: '4px' }}>
        {(['x', 'y', 'z'] as const).map((axis) => (
          <div key={axis} style={{ flex: 1 }}>
            <input
              type="number"
              step={0.1}
              value={value[axis]}
              onChange={(e) =>
                onChange({ ...value, [axis]: parseFloat(e.target.value) || 0 })
              }
              style={{
                width: '100%',
                background: '#f5f7fb',
                border: '1px solid #dde4f0',
                borderRadius: '4px',
                padding: '3px 4px',
                color: '#1f2937',
                fontSize: '11px',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}


// 导演台只做「白模空间预演」：人物与道具都是程序化素模，不加载任何外部 3D 模型，
// 也不需要 3D 重建服务。预演看的是构图、遮挡、视线与机位关系。

/**
 * 时间轴预演条。独立组件、独立订阅：进度每 0.12s 回写时只重渲染这一小块，
 * 不会把整块 1000 行面板拖进每帧刷新。
 */
function TimelineBar() {
  const cameras = useDirectorStore((s) => s.cameras);
  const playing = useDirectorStore((s) => s.playing);
  const loop = useDirectorStore((s) => s.loop);
  const playhead = useDirectorStore((s) => s.playhead);
  const previewCameraId = useDirectorStore((s) => s.previewCameraId);
  const activeCameraId = useDirectorStore((s) => s.activeCameraId);
  const play = useDirectorStore((s) => s.play);
  const pause = useDirectorStore((s) => s.pause);
  const stop = useDirectorStore((s) => s.stop);
  const seek = useDirectorStore((s) => s.seek);
  const setLoop = useDirectorStore((s) => s.setLoop);
  const setActiveCamera = useDirectorStore((s) => s.setActiveCamera);

  const dur = (c: any) => (Number.isFinite(c?.duration) && c.duration > 0 ? c.duration : CAMERA_DEFAULT_DURATION);
  const total = cameras.reduce((a, c) => a + dur(c), 0);
  const currentId = playing ? previewCameraId : activeCameraId;
  const btn: React.CSSProperties = {
    flex: 1, padding: '5px 4px', background: '#dbe3f2', border: 'none', borderRadius: 4,
    color: '#1f2937', cursor: 'pointer', fontSize: 11,
  };

  let acc = 0;
  return (
    <div style={{ marginTop: 10, padding: 8, background: '#f5f7fb', borderRadius: 6, border: '1px solid #dde4f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#1f2937' }}>⏱ 时间轴预演</span>
        <span style={{ fontSize: 10, color: '#7c8798' }}>
          {playhead.toFixed(1)}s / {total.toFixed(1)}s
        </span>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        <button style={{ ...btn, background: playing ? '#f59e0b' : '#4facfe', color: '#fff' }}
          onClick={() => (playing ? pause() : play())} disabled={cameras.length === 0}>
          {playing ? '⏸ 暂停' : '▶ 播放'}
        </button>
        <button style={btn} onClick={stop}>⏹ 停止</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#4b5563', cursor: 'pointer' }}>
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> 循环
        </label>
      </div>
      {/* 分段条：每段一个镜头，点击跳到该镜头起点 */}
      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: '#dbe3f2', marginBottom: 6 }}>
        {cameras.map((c, i) => {
          const start = acc;
          acc += dur(c);
          return (
            <div
              key={c.id}
              title={`${c.name} · ${dur(c).toFixed(1)}s · ${CAMERA_MOVEMENTS.find((m) => m.value === c.movement)?.label || '固定'}`}
              onClick={() => { stop(); setActiveCamera(c.id); seek(start); }}
              style={{
                flex: dur(c),
                background: currentId === c.id ? '#f59e0b' : i % 2 ? '#93a7c4' : '#b7c6dc',
                borderRight: '1px solid #fff',
                cursor: 'pointer',
              }}
            />
          );
        })}
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(total, 0.1)}
        step={0.1}
        value={Math.min(playhead, total || 0)}
        onChange={(e) => seek(Number(e.target.value))}
        style={{ width: '100%' }}
      />
      <div style={{ fontSize: 10, color: '#7c8798', marginTop: 4 }}>
        {currentId
          ? `当前镜头：${cameras.find((c) => c.id === currentId)?.name || '—'}`
          : '点机位或播放，即可从该机位视角检查构图'}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 分镜 → 白模站位 / 机位 的确定性推导（纯前端，不依赖模型 API）
// ─────────────────────────────────────────────────────────────

const shotNamesOf = (sh: any): string[] =>
  (Array.isArray(sh?.characters) ? sh.characters : [])
    .map((n: any) => String(typeof n === 'string' ? n : n?.name || n?.character || '').trim())
    .filter(Boolean);

const inferPose = (text: string): CharacterPose => {
  if (/坐|落座|椅|沙发|餐桌|床沿|端坐/.test(text)) return 'sit';
  if (/蹲|跪|俯身|弯腰|捡拾|伏低/.test(text)) return 'squat';
  if (/走|跑|奔|冲|迈步|入场|离开|追|赶/.test(text)) return 'walk';
  return 'stand';
};

const sceneSizeOf = (t: string) =>
  /远景/.test(t) ? { dist: 9, fov: 55, y: 2.4 }
    : /全景/.test(t) ? { dist: 6.5, fov: 50, y: 2.0 }
    : /近景/.test(t) ? { dist: 2.4, fov: 40, y: 1.6 }
    : /特写/.test(t) ? { dist: 1.6, fov: 35, y: 1.5 }
    : { dist: 4, fov: 45, y: 1.7 };

const moveOf = (t: string) =>
  /推/.test(t) ? 'push' : /拉/.test(t) ? 'pull' : /摇/.test(t) ? 'pan'
    : /升降|俯仰/.test(t) ? 'tilt' : /移|跟/.test(t) ? 'track'
    : /环绕|旋转/.test(t) ? 'orbit' : 'static';

/** 给定一组出场人名，算出相对站位：双人面对 / 多人弧线 / 单人原点 */
const computeLayout = (cast: string[]) =>
  cast.map((name, i) => {
    let position = { x: 0, y: 0, z: 0 };
    let rotation = { x: 0, y: 0, z: 0 };
    if (cast.length === 2) {
      position = i === 0 ? { x: -1.1, y: 0, z: 0 } : { x: 1.1, y: 0, z: 0 };
      rotation = { x: 0, y: i === 0 ? Math.PI / 2 : -Math.PI / 2, z: 0 };
    } else if (cast.length > 2) {
      const a = (i / (cast.length - 1) - 0.5) * Math.PI * 0.9;
      const r = 2.2;
      position = { x: Math.sin(a) * r, y: 0, z: -Math.cos(a) * r + 0.6 };
      rotation = { x: 0, y: -a, z: 0 };
    }
    return { name, position, rotation };
  });

/** 从分镜文本推断场景模板（地点关键词）；命中即套用命名布景件 */
const detectSceneTemplate = (shots: any[]): string | null => {
  // 分镜里真正含地点信息的是 imagePrompt / firstFramePrompt / videoPrompt（sceneDesc 存的其实是动作），
  // 所以这里把画面相关的文本字段全扫一遍，命中率比只扫 title/sceneDesc 高得多。
  const allText = shots
    .map((s) => [
      s?.title, s?.sceneDesc, s?.description, s?.action, s?.promptCn,
      s?.imagePrompt, s?.firstFramePrompt, s?.videoPrompt,
      s?.sceneType, s?.shotType, s?.lensType,
      Array.isArray(s?.characters) ? s.characters.join(' ') : s?.characters,
    ].filter(Boolean).join(' '))
    .join(' ');
  return /医院|病房|病床|输液|诊所|急诊|手术室|护士站|门诊/.test(allText) ? 'hospital'
    : /酒吧|夜店|吧台|酒馆|KTV|清吧|夜总会/.test(allText) ? 'bar'
    : /森林|树林|树丛|野外|丛林|山林|竹林|草地|山顶|郊外/.test(allText) ? 'forest'
    // 注意：这里不能再放裸「厅」——否则"客厅/餐厅"会被误判成宫殿。
    : /宫殿|皇宫|朝堂|龙椅|侯府|王府|府邸|大殿|殿堂|正殿|御书房|厅堂|正厅/.test(allText) ? 'palace'
    : /办公室|办公桌|工位|会议室|写字楼|公司|职场|工区/.test(allText) ? 'office'
    : /卧室|床上|床头|卧房|寝室|酒店房间|民宿房间/.test(allText) ? 'bedroom'
    : /客厅|沙发|茶几|起居室|沙发区/.test(allText) ? 'livingroom'
    : /街道|马路|街边|巷|街头|路边|天桥|广场|停车场|人行道/.test(allText) ? 'street'
    : /拱门|花门|婚礼|婚典|结婚|典礼|仪式|庭院|院子|花园|回廊|门廊|凯旋门|校门|教堂|红毯/.test(allText) ? 'arch'
    : null;
};

export function DirectorPanel({
  project,
  update,
  log,
  onExportFrames,
  onExportFrame,
}: {
  project?: any;
  update?: (key: string, value: any) => void;
  log?: (message: string) => void;
  /** 按时间轴逐镜导出构图参考图（由 index.tsx 提供，需要画布） */
  onExportFrames?: () => void;
  /** 只导出当前选中机位的一张构图 */
  onExportFrame?: (cameraId: string) => void;
}) {
  const [selectedSceneTemplate, setSelectedSceneTemplate] = useState<string>('empty');
  const [aiPlacing, setAiPlacing] = useState(false);
  const [showImportCharModal, setShowImportCharModal] = useState(false);
  const {
    characters,
    props,
    cameras,
    activeCameraId,
    selectedCharacterId,
    selectedPropId,
    scene,
    showGrid,
    addCharacter,
    updateCharacter,
    removeCharacter,
    selectCharacter,
    addProp,
    updateProp,
    removeProp,
    selectProp,
    addCamera,
    updateCamera,
    removeCamera,
    setActiveCamera,
    moveCamera,
    replaceCameras,
    applyStoryboardLayout,
    appendShotToStage,
    updateScene,
    applySceneTemplate,
    switchSceneTemplate,
    toggleGrid,
    exportScene,
    exportCameraReference,
  } = useDirectorStore();

  const selectedChar = characters.find((c) => c.id === selectedCharacterId);
  const selectedPropItem = props.find((p) => p.id === selectedPropId);
  const activeCamera = cameras.find((c) => c.id === activeCameraId);
  const shotsList = (Array.isArray(project?.shots) ? project.shots : []).filter(Boolean).slice(0, 48);

  /** 新增机位：对着第一个角色自动取一个可看的构图位，而不是硬编码 [8,6,8] */
  const handleAddCameraFromView = () => {
    const c = characters[0];
    const tx = c?.position?.x ?? 0;
    const tz = c?.position?.z ?? 0;
    const n = cameras.length;
    addCamera({ x: tx + 2.6 + n * 0.5, y: 1.9, z: tz + 4.5 }, { x: tx, y: 1.25, z: tz });
  };

  /** AI 按剧本/分镜自动布机位：复用「设置 → 文本模型」，开源版无后端 */
  const handleAiPlace = async () => {
    setAiPlacing(true);
    log?.('正在让 AI 按剧本布置机位…');
    try {
      const shots = Array.isArray(project?.shots) ? project.shots : [];
      const script = String(project?.script || '').slice(0, 4000);
      const shotText = shots.slice(0, 12).map((s: any, i: number) =>
        `分镜${i + 1}：${s.title || ''} ${s.action || s.description || s.promptCn || s.firstFramePrompt || ''}`
      ).join('\n');
      const material = [script && `【剧本】\n${script}`, shotText && `【分镜】\n${shotText}`]
        .filter(Boolean).join('\n\n') || '两人对话，情绪克制，室内。';
      const content = await generateText(
        [
          {
            role: 'system',
            content: '你是影视分镜导演。只输出 JSON 数组，不要解释、不要 markdown 围栏。坐标单位米：人物站在原点附近、身高约 1.8 米，相机 y 在 1.2~3 之间，z 为离主体距离。',
          },
          {
            role: 'user',
            content: `为下面这场戏设计 3~6 个镜头，覆盖全景/中景/特写/正反打，并安排合理运镜。\n每个元素格式：\n{"name":"镜头名","position":{"x":0,"y":1.6,"z":5},"target":{"x":0,"y":1.2,"z":0},"fov":50,"aspect":"9:16","movement":"static|push|pull|pan|tilt|track|orbit","movementSpeed":1,"duration":4}\n\n${material}`,
          },
        ],
        { maxTokens: 1800, temperature: 0.6 },
      );
      const raw = String(content || '[]')
        .replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
      const bracket = raw.match(/\[[\s\S]*\]/);
      const arr = JSON.parse(bracket ? bracket[0] : raw || '[]');
      if (!Array.isArray(arr) || arr.length === 0) throw new Error('模型未返回有效机位列表');
      replaceCameras(arr);
      log?.(`AI 已布置 ${arr.length} 个机位 · 点「▶ 播放」按时间轴预演，或导出构图参考图`);
    } catch (e: any) {
      log?.(`AI 布机位失败：${e?.message || e}（请先在「设置 → 模型配置」配置文本模型）`);
    } finally {
      setAiPlacing(false);
    }
  };

  /**
   * 一键全导入（搭骨架）：整体替换人物站位（含姿态）与机位，并按关键词套用场景布景。
   * 适合从空白开始一次性铺出整场戏的预演骨架，之后逐镜微调。
   */
  const handleImportStoryboard = () => {
    const shots = shotsList.slice(0, 24);
    if (shots.length === 0) {
      log?.('项目里还没有分镜，请先在「03 分镜」拆分剧本');
      alert('项目里还没有分镜，请先在「03 分镜」拆分剧本，再回来一键摆位。');
      return;
    }

    // 出场人物名：保持首次出现顺序、去重
    const cast: string[] = [];
    for (const sh of shots) {
      for (const n of shotNamesOf(sh)) if (!cast.includes(n)) cast.push(n);
    }
    if (cast.length === 0) cast.push('主角');

    const lib: any[] = project?.materials?.characters || project?.characters || project?.outline?.characters || [];

    const layoutChars = cast.map((name) => {
      const info = lib.find((c: any) => c?.name === name) || {};
      const female = info.gender === '女' || info.gender === 'female' || /女/.test(String(info.role || ''));
      // 姿态取该角色第一次出场的画面关键词
      const sh = shots.find((s: any) => shotNamesOf(s).includes(name));
      const pose = inferPose([sh?.title, sh?.sceneDesc, sh?.description, sh?.action, sh?.dialogue, sh?.promptCn].filter(Boolean).join(' '));
      const L = computeLayout(cast).find((l) => l.name === name)!;
      return {
        name,
        position: L.position,
        rotation: L.rotation,
        scale: 1,
        color: female ? '#e8a0bf' : '#4a90d9',
        template: female ? 'female_standard' : 'male_standard',
        gender: female ? 'female' : 'male',
        outfit: female ? '#c0392b' : '#cbd5e4',
        hairColor: '#2d1810',
        pose,
      };
    });

    const cameraDrafts = shots.map((sh: any, i: number) => {
      const size = sceneSizeOf(String(sh?.sceneType || ''));
      const inShot = shotNamesOf(sh).map((n) => layoutChars.find((c) => c.name === n)).filter(Boolean) as any[];
      const pts = inShot.length ? inShot : [layoutChars[0]];
      const tx = pts.reduce((a, c) => a + c.position.x, 0) / pts.length;
      const tz = pts.reduce((a, c) => a + c.position.z, 0) / pts.length;
      // 机位角度逐镜交错，避免所有机位叠在同一个位置
      const ang = (i % 2 === 0 ? 0.28 : -0.36) + (i % 3) * 0.09;
      return {
        name: `${String(i + 1).padStart(2, '0')} ${String(sh?.title || sh?.sceneType || '分镜').slice(0, 18)}`,
        position: { x: tx + Math.sin(ang) * size.dist, y: size.y, z: tz + Math.cos(ang) * size.dist },
        target: { x: tx, y: 1.2, z: tz },
        fov: size.fov,
        aspect: '9:16',
        movement: moveOf(String(sh?.cameraMove || '')),
        movementSpeed: 1,
        duration: Math.min(10, Math.max(2, Number(sh?.duration) || 4)),
      };
    });

    applyStoryboardLayout({ characters: layoutChars, cameras: cameraDrafts });

    // 场景氛围：从分镜文本里找地点关键词；整本都识别不到地点时用中性「通用」兜底，避免空舞台
    const detected = detectSceneTemplate(shots);
    const tpl = detected || 'generic';
    const usedFallback = !detected;
    setSelectedSceneTemplate(tpl);
    applySceneTemplate(tpl as any);
    log?.(`已导入 ${shots.length} 个分镜：摆好 ${layoutChars.length} 个白模人物（含姿态），生成 ${cameraDrafts.length} 个机位，并套用「${usedFallback ? '通用（未识别到地点）' : SCENE_TEMPLATES.find((t) => t.value === tpl)?.label}」场景。接下来可直接在画布拖动人物/机位微调`);
  };

  /**
   * 逐镜追加：只新增该镜出场、且尚不存在于画布的人物（按名去重、复用已有站位），
   * 并追加这镜一个机位。不打翻已有的布景与站位，更符合「一镜一镜精修」的实际工作流。
   */
  const handleAppendShot = (shotIndex: number) => {
    const sh = shotsList[shotIndex];
    if (!sh) return;
    const names = shotNamesOf(sh);
    const castNames = names.length ? names : ['主角'];
    const lib: any[] = project?.materials?.characters || project?.characters || project?.outline?.characters || [];

    const shotText = [sh?.title, sh?.sceneDesc, sh?.description, sh?.action, sh?.dialogue, sh?.promptCn].filter(Boolean).join(' ');
    const pose = inferPose(shotText);

    const layout = computeLayout(castNames);
    const newChars: any[] = [];
    const posOf: Record<string, { x: number; y: number; z: number }> = {};
    for (const name of castNames) {
      const ex = characters.find((c) => c.name === name);
      if (ex) { posOf[name] = ex.position; continue; }
      const L = layout.find((l) => l.name === name)!;
      const info = lib.find((c: any) => c?.name === name) || {};
      const female = info.gender === '女' || info.gender === 'female' || /女/.test(String(info.role || ''));
      newChars.push({
        name,
        position: L.position,
        rotation: L.rotation,
        scale: 1,
        color: female ? '#e8a0bf' : '#4a90d9',
        template: female ? 'female_standard' : 'male_standard',
        gender: female ? 'female' : 'male',
        outfit: female ? '#c0392b' : '#cbd5e4',
        hairColor: '#2d1810',
        pose,
      });
      posOf[name] = L.position;
    }

    const pts = castNames.map((n) => posOf[n]).filter(Boolean);
    const tx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const tz = pts.reduce((a, p) => a + p.z, 0) / pts.length;
    const size = sceneSizeOf(String(sh?.sceneType || ''));
    const ang = (shotIndex % 2 === 0 ? 0.28 : -0.36) + (shotIndex % 3) * 0.09;
    const camera = {
      name: `${String(shotIndex + 1).padStart(2, '0')} ${String(sh?.title || sh?.sceneType || '分镜').slice(0, 18)}`,
      position: { x: tx + Math.sin(ang) * size.dist, y: size.y, z: tz + Math.cos(ang) * size.dist },
      target: { x: tx, y: 1.2, z: tz },
      fov: size.fov,
      aspect: '9:16',
      movement: moveOf(String(sh?.cameraMove || '')),
      movementSpeed: 1,
      duration: Math.min(10, Math.max(2, Number(sh?.duration) || 4)),
    };

    appendShotToStage({ newCharacters: newChars, camera });

    // 自动搭建 / 切换场景：检测本镜地点关键词，与当前场景不同就自动换景。
    // 识别不到地点时：画布还空 → 用中性「通用」兜底（保证不是空舞台）；已有布景 → 保持不动。
    // 无论哪种都只替换命名布景件，保留人物站位、机位与用户自定义道具。
    const detected = detectSceneTemplate([sh]);
    const currentTpl = props.find((p) => p.setPieceId)?.setPieceId || 'empty';
    const tpl = detected || (currentTpl === 'empty' ? 'generic' : null);
    const usedFallback = !detected && tpl === 'generic';
    const sceneChanged = !!tpl && tpl !== currentTpl;
    if (sceneChanged) {
      setSelectedSceneTemplate(tpl as string);
      switchSceneTemplate(tpl as any);
    }
    const sceneNote = sceneChanged
      ? '，并' + (usedFallback ? '（未识别到地点）套用中性「通用」布景' : '自动套用「' + SCENE_TEMPLATES.find((t) => t.value === tpl)?.label + '」场景')
      : '';
    log?.(`已追加第 ${shotIndex + 1} 镜：${newChars.length ? '新增 ' + newChars.map((c) => c.name).join('、') + '，' : ''}生成 1 个机位${sceneNote}。继续逐镜追加或拖动微调`);
  };

  return (
    <div
      style={{
        width: '280px',
        height: '100%',
        background: '#eff3fa',
        borderRight: '1px solid #dde4f0',
        overflowY: 'auto',
        color: '#1f2937',
      }}
    >
      {/* 顶部标题 */}
      <div
        style={{
          padding: '12px',
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          fontWeight: 700,
          fontSize: '14px',
          color: '#fff',
        }}
      >
        🎬 白模导演台 · 分镜预演
      </div>

      {/* 从分镜导入：一键搭骨架（整体替换）+ 逐镜追加 */}
      <div style={{ padding: '10px 12px', background: '#f5f7fb', borderBottom: '1px solid #dde4f0' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#1f2937', marginBottom: '6px' }}>
          📥 从分镜导入预演
        </div>
        <button
          onClick={handleImportStoryboard}
          style={{ width: '100%', padding: '8px', background: 'linear-gradient(135deg, #0ea5e9, #6D28D9)', border: 'none', borderRadius: '5px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}
        >
          一键全导入（重置并搭骨架）
        </button>
        <div style={{ fontSize: '10px', color: '#7c8798', marginBottom: '6px', lineHeight: 1.5 }}>
          逐镜追加更贴近实际工作流：下面每条分镜点「＋ 追加此镜」，只把该镜人物（复用同名）与机位加进当前预演，<b>不打翻已有布景</b>。
        </div>
        {shotsList.length === 0 ? (
          <div style={{ fontSize: '10px', color: '#f5576c' }}>项目里还没有分镜，请先在「03 分镜」拆剧本。</div>
        ) : (
          <div style={{ maxHeight: 210, overflowY: 'auto', border: '1px solid #dde4f0', borderRadius: 4, background: '#fff' }}>
            {shotsList.map((sh: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px', borderBottom: i < shotsList.length - 1 ? '1px solid #eef1f6' : 'none' }}>
                <span style={{ fontSize: 11, color: '#94a3b8', width: 18, textAlign: 'right' }}>{i + 1}</span>
                <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1f2937' }}>
                  {String(sh?.title || sh?.sceneType || '分镜').slice(0, 12)}
                  <span style={{ color: '#9aa3b2' }}>· {shotNamesOf(sh).join('/') || '—'}</span>
                </span>
                <button
                  onClick={() => handleAppendShot(i)}
                  title="把这一镜追加进当前预演"
                  style={{ background: 'linear-gradient(135deg,#10b981,#0ea5e9)', border: 'none', borderRadius: 4, color: '#fff', fontSize: 10, padding: '3px 6px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >＋ 追加此镜</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 角色管理 */}
      <PanelHeader icon={User} title="角色" count={characters.length}>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
          <button
            onClick={() => addCharacter()}
            style={{
              flex: 1,
              padding: '6px',
              background: '#dbe3f2',
              border: 'none',
              borderRadius: '4px',
              color: '#1f2937',
              cursor: 'pointer',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            <Plus size={12} /> 添加
          </button>
          <button
            onClick={() => {
              const projectChars = project?.materials?.characters || project?.characters || project?.outline?.characters || [];
              if (projectChars.length === 0) {
                log?.('项目中没有角色，请先在人物管理中添加角色');
                alert('项目中没有角色，请先在人物管理中添加角色');
                return;
              }
              setShowImportCharModal(true);
            }}
            style={{
              flex: 1,
              padding: '6px',
              background: 'linear-gradient(135deg, #6D28D9, #0891B2)',
              border: 'none',
              borderRadius: '4px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            📥 导入角色
          </button>
        </div>
        {characters.map((c) => (
          <div
            key={c.id}
            onClick={() => selectCharacter(c.id)}
            style={{
              padding: '6px 8px',
              background:
                selectedCharacterId === c.id ? '#DBE3F2' : '#e6ecf8',
              borderRadius: '4px',
              marginBottom: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: c.color,
              }}
            />
            <span style={{ fontSize: '12px', flex: 1 }}>{c.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeCharacter(c.id);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#f5576c',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {selectedChar && (
          <div
            style={{
              marginTop: '8px',
              padding: '8px',
              background: '#f5f7fb',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#4facfe', marginBottom: '6px' }}>
              编辑：{selectedChar.name}
            </div>
            <input
              type="text"
              value={selectedChar.name}
              onChange={(e) =>
                updateCharacter(selectedChar.id, { name: e.target.value })
              }
              style={{
                width: '100%',
                background: '#f5f7fb',
                border: '1px solid #dde4f0',
                borderRadius: '4px',
                padding: '4px',
                color: '#1f2937',
                fontSize: '11px',
                marginBottom: '6px',
              }}
            />
            <Vector3Input
              label="位置"
              value={selectedChar.position}
              onChange={(v) => updateCharacter(selectedChar.id, { position: v })}
            />
            <Vector3Input
              label="旋转"
              value={selectedChar.rotation}
              onChange={(v) => updateCharacter(selectedChar.id, { rotation: v })}
            />
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
                缩放: {selectedChar.scale.toFixed(1)}
              </div>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={selectedChar.scale}
                onChange={(e) =>
                  updateCharacter(selectedChar.id, {
                    scale: parseFloat(e.target.value),
                  })
                }
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
                人物模板
              </div>
              <select
                value={selectedChar.template || 'male_standard'}
                onChange={(e) => {
                  const tpl = CHARACTER_TEMPLATES.find(t => t.value === e.target.value);
                  // 根据模板设置所有相关属性，让人物有明显区别
                  const templateConfig: any = {
                    male_standard: { scale: 1.0, color: '#4a90d9', outfit: '#cbd5e4', hairColor: '#2d1810' },
                    female_standard: { scale: 0.92, color: '#e8a0bf', outfit: '#c0392b', hairColor: '#4a2c1a' },
                    male_athletic: { scale: 1.1, color: '#d4a574', outfit: '#e6ecf8', hairColor: '#f0f1f4' },
                    female_elegant: { scale: 0.88, color: '#f5c6d6', outfit: '#8e44ad', hairColor: '#f0f1f4' },
                    child: { scale: 0.65, color: '#ffd93d', outfit: '#6bcb77', hairColor: '#4a2c1a' },
                  };
                  const config = templateConfig[e.target.value] || templateConfig.male_standard;
                  updateCharacter(selectedChar.id, { 
                    template: e.target.value as any, 
                    gender: tpl?.gender || 'male',
                    scale: config.scale,
                    color: config.color,
                    outfit: config.outfit,
                    hairColor: config.hairColor,
                  });
                }}
                style={{ width: '100%', background: '#f5f7fb', border: '1px solid #dde4f0', borderRadius: '4px', padding: '4px', color: '#1f2937', fontSize: '11px' }}
              >
                {CHARACTER_TEMPLATES.map(t => (
                  <option key={t.value} value={t.value}>{t.label} - {t.desc}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>姿态</div>
              <select
                value={selectedChar.pose || 'stand'}
                onChange={(e) => updateCharacter(selectedChar.id, { pose: e.target.value as CharacterPose })}
                style={{ width: '100%', background: '#f5f7fb', border: '1px solid #dde4f0', borderRadius: '4px', padding: '4px', color: '#1f2937', fontSize: '11px' }}
              >
                {CHARACTER_POSES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <div style={{ fontSize: 10, color: '#7c8798', marginTop: 3 }}>
                {CHARACTER_POSES.find((p) => p.value === (selectedChar.pose || 'stand'))?.hint}
              </div>
            </div>
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
                服装颜色
              </div>
              <input
                type="color"
                value={selectedChar.outfit || selectedChar.color}
                onChange={(e) => updateCharacter(selectedChar.id, { outfit: e.target.value })}
                style={{ width: '100%', height: '24px', border: 'none', borderRadius: '4px' }}
              />
            </div>
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
                发色
              </div>
              <input
                type="color"
                value={selectedChar.hairColor || '#2d1810'}
                onChange={(e) => updateCharacter(selectedChar.id, { hairColor: e.target.value })}
                style={{ width: '100%', height: '24px', border: 'none', borderRadius: '4px' }}
              />
            </div>
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
                颜色（备用）
              </div>
              <input
                type="color"
                value={selectedChar.color}
                onChange={(e) => updateCharacter(selectedChar.id, { color: e.target.value })}
                style={{ width: '100%', height: '24px', border: 'none', borderRadius: '4px' }}
              />
            </div>
          </div>
        )}
      </PanelHeader>

      {/* 道具管理 */}
      <PanelHeader icon={Box} title="道具" count={props.length}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '8px' }}>
          {(['box', 'sphere', 'cylinder', 'plane'] as const).map((type) => (
            <button
              key={type}
              onClick={() => addProp(type)}
              style={{
                padding: '5px',
                background: '#dbe3f2',
                border: 'none',
                borderRadius: '4px',
                color: '#1f2937',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              + {type}
            </button>
          ))}
        </div>
        {props.map((p) => (
          <div
            key={p.id}
            onClick={() => selectProp(p.id)}
            style={{
              padding: '6px 8px',
              background: selectedPropId === p.id ? '#DBE3F2' : '#e6ecf8',
              borderRadius: '4px',
              marginBottom: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Box size={12} color={p.color} />
            <span style={{ fontSize: '12px', flex: 1 }}>{p.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeProp(p.id);
              }}
              style={{ background: 'none', border: 'none', color: '#f5576c', cursor: 'pointer', padding: 0 }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {selectedPropItem && (
          <div style={{ marginTop: '8px', padding: '8px', background: '#f5f7fb', borderRadius: '4px' }}>
            <Vector3Input
              label="位置"
              value={selectedPropItem.position}
              onChange={(v) => updateProp(selectedPropItem.id, { position: v })}
            />
            <Vector3Input
              label="缩放"
              value={selectedPropItem.scale}
              onChange={(v) => updateProp(selectedPropItem.id, { scale: v })}
            />
          </div>
        )}
      </PanelHeader>

      {/* 机位管理 */}
      <PanelHeader icon={Camera} title="机位" count={cameras.length}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <button
            onClick={handleAddCameraFromView}
            style={{ flex: 1, padding: '6px 4px', background: '#dbe3f2', border: 'none', borderRadius: 4, color: '#1f2937', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            <Camera size={12} /> 新增机位
          </button>
          <button
            onClick={handleAiPlace}
            disabled={aiPlacing}
            style={{ flex: 1, padding: '6px 4px', background: aiPlacing ? '#94a3b8' : 'linear-gradient(135deg,#8b5cf6,#6d28d9)', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', fontSize: 11 }}
          >
            {aiPlacing ? '布置中…' : '🤖 AI 布机位'}
          </button>
        </div>
        <button
          onClick={() => onExportFrames?.()}
          disabled={cameras.length === 0}
          style={{ width: '100%', padding: '6px', marginBottom: 8, background: 'linear-gradient(135deg,#f59e0b,#d97706)', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
        >
          📸 导出全部构图参考图（按时间轴逐镜）
        </button>
        <div style={{ fontSize: 10, color: '#7c8798', marginBottom: 6, lineHeight: 1.5 }}>
          镜头按列表顺序切镜 · 点机位即从该机位视角看构图
        </div>
        {cameras.map((cam, i) => (
          <div
            key={cam.id}
            onClick={() => setActiveCamera(cam.id)}
            style={{
              padding: '6px 8px',
              background: activeCameraId === cam.id ? '#dbe3f2' : '#e6ecf8',
              borderRadius: '4px',
              marginBottom: '4px',
              cursor: 'pointer',
              border: activeCameraId === cam.id ? '1px solid #f59e0b' : '1px solid transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: 10, color: '#94a3b8', width: 14 }}>{i + 1}</span>
              <Camera size={12} color={activeCameraId === cam.id ? '#b45309' : '#888'} />
              <span style={{ fontSize: '12px', flex: 1 }}>{cam.name}</span>
              <button
                title="上移（提前切镜）"
                onClick={(e) => { e.stopPropagation(); moveCamera(cam.id, -1); }}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0 2px', fontSize: 11 }}
              >↑</button>
              <button
                title="下移（推后切镜）"
                onClick={(e) => { e.stopPropagation(); moveCamera(cam.id, 1); }}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0 2px', fontSize: 11 }}
              >↓</button>
              <button
                title="删除"
                onClick={(e) => { e.stopPropagation(); removeCamera(cam.id); }}
                style={{ background: 'none', border: 'none', color: '#f5576c', cursor: 'pointer', padding: 0 }}
              >
                <Trash2 size={12} />
              </button>
            </div>
            <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
              {cam.aspect} · {CAMERA_MOVEMENTS.find((m) => m.value === cam.movement)?.label} · {Number(cam.duration) || 4}s
            </div>
          </div>
        ))}
        {activeCamera && (
          <div style={{ marginTop: '8px', padding: '8px', background: '#f5f7fb', borderRadius: '4px' }}>
            <div style={{ fontSize: '11px', color: '#b45309', marginBottom: '6px' }}>
              编辑机位：{activeCamera.name}
            </div>
            <input
              type="text"
              value={activeCamera.name}
              onChange={(e) => updateCamera(activeCamera.id, { name: e.target.value })}
              style={{ width: '100%', background: '#f5f7fb', border: '1px solid #dde4f0', borderRadius: '4px', padding: '4px', color: '#1f2937', fontSize: '11px', marginBottom: '6px' }}
            />
            <Vector3Input
              label="机位位置"
              value={activeCamera.position}
              onChange={(v) => updateCamera(activeCamera.id, { position: v })}
            />
            <Vector3Input
              label="注视点"
              value={activeCamera.target}
              onChange={(v) => updateCamera(activeCamera.id, { target: v })}
            />
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>镜头时长（秒）</div>
              <input
                type="number"
                min="0.5"
                max="30"
                step="0.5"
                value={activeCamera.duration ?? 4}
                onChange={(e) => updateCamera(activeCamera.id, { duration: Math.min(30, Math.max(0.5, Number(e.target.value) || 4)) })}
                style={{ width: '100%', background: '#f5f7fb', border: '1px solid #dde4f0', borderRadius: '4px', padding: '4px', color: '#1f2937', fontSize: '11px' }}
              />
            </div>
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>画幅</div>
              <select
                value={activeCamera.aspect}
                onChange={(e) => updateCamera(activeCamera.id, { aspect: e.target.value })}
                style={{ width: '100%', background: '#f5f7fb', border: '1px solid #dde4f0', borderRadius: '4px', padding: '4px', color: '#1f2937', fontSize: '11px' }}
              >
                {ASPECT_RATIOS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>运镜方式（播放时真实运动）</div>
              <select
                value={activeCamera.movement}
                onChange={(e) => updateCamera(activeCamera.id, { movement: e.target.value as any })}
                style={{ width: '100%', background: '#f5f7fb', border: '1px solid #dde4f0', borderRadius: '4px', padding: '4px', color: '#1f2937', fontSize: '11px' }}
              >
                {CAMERA_MOVEMENTS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <div style={{ fontSize: 10, color: '#7c8798', marginTop: 3 }}>
                {CAMERA_MOVEMENT_HINTS[activeCamera.movement] || ''}
              </div>
            </div>
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>运镜速度</div>
              <input
                type="range"
                min="0.2"
                max="3"
                step="0.1"
                value={activeCamera.movementSpeed ?? 1}
                onChange={(e) => updateCamera(activeCamera.id, { movementSpeed: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
                焦距: {activeCamera.fov}°
              </div>
              <input
                type="range"
                min="20"
                max="100"
                value={activeCamera.fov}
                onChange={(e) => updateCamera(activeCamera.id, { fov: parseInt(e.target.value) })}
                style={{ width: '100%' }}
              />
            </div>
            <button
              onClick={() => onExportFrame?.(activeCamera.id)}
              style={{ width: '100%', padding: '6px', background: 'linear-gradient(135deg, #4facfe, #00f2fe)', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontSize: '11px', marginTop: '4px' }}
            >
              📸 导出此机位构图参考图
            </button>
          </div>
        )}
        <TimelineBar />
      </PanelHeader>

      {/* 场景设置 */}
      <PanelHeader icon={Settings} title="场景设置">
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '11px', color: '#4facfe', marginBottom: '4px', fontWeight: 600 }}>
            🏛️ 场景模板
          </div>
          <select
            value={selectedSceneTemplate}
            onChange={(e) => {
              setSelectedSceneTemplate(e.target.value);
              switchSceneTemplate(e.target.value as any);
            }}
            style={{ width: '100%', background: '#f5f7fb', border: '1px solid #dde4f0', borderRadius: '4px', padding: '5px', color: '#1f2937', fontSize: '11px' }}
          >
            {SCENE_TEMPLATES.map(t => (
              <option key={t.value} value={t.value}>{t.label} - {t.desc}</option>
            ))}
          </select>
          <div style={{ fontSize: '9px', color: '#555', marginTop: '4px' }}>
            一键切换场景灯光氛围
          </div>
        </div>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>背景色</div>
          <input
            type="color"
            value={scene.background}
            onChange={(e) => updateScene({ background: e.target.value })}
            style={{ width: '100%', height: '24px', border: 'none', borderRadius: '4px' }}
          />
        </div>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>地面色</div>
          <input
            type="color"
            value={scene.groundColor}
            onChange={(e) => updateScene({ groundColor: e.target.value })}
            style={{ width: '100%', height: '24px', border: 'none', borderRadius: '4px' }}
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginBottom: '6px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showGrid} onChange={toggleGrid} />
          显示网格
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginBottom: '6px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={scene.fogEnabled}
            onChange={(e) => updateScene({ fogEnabled: e.target.checked })}
          />
          场景雾效
        </label>
        <button
          onClick={() => {
            const data = exportScene();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            void saveBlob('director-scene.json', blob, { log });
          }}
          style={{ width: '100%', padding: '6px', background: '#dbe3f2', border: 'none', borderRadius: '4px', color: '#1f2937', cursor: 'pointer', fontSize: '12px', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
        >
          <Download size={12} /> 导出场景配置
        </button>
      </PanelHeader>

      {/* 导入角色模态框 */}
      {showImportCharModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 9999,
        }} onClick={() => setShowImportCharModal(false)}>
          <div style={{
            background: '#e6ecf8', borderRadius: '8px', padding: '16px',
            width: '400px', maxHeight: '80vh', overflow: 'auto',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, color: '#1f2937', fontSize: '16px' }}>选择要导入的角色</h3>
              <button onClick={() => setShowImportCharModal(false)} style={{ background: 'none', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '12px' }}>
              点击角色即可导入（一个一个导入）
            </div>
            {(project?.materials?.characters || project?.characters || project?.outline?.characters || []).map((pc: any, index: number) => {
              const exists = characters.find((c: any) => c.name === pc.name);
              return (
                <div
                  key={index}
                  onClick={() => {
                    if (exists) {
                      alert(`角色「${pc.name}」已存在，无需重复导入`);
                      return;
                    }
                    const template = pc.gender === '女' ? 'female_standard' : 'male_standard';
                    addCharacter(pc.name, template as any);
                    log?.(`导入角色：${pc.name}`);
                    alert(`成功导入角色：${pc.name}`);
                  }}
                  style={{
                    padding: '10px', marginBottom: '8px', borderRadius: '4px',
                    background: exists ? '#dde4f0' : '#dbe3f2',
                    cursor: exists ? 'not-allowed' : 'pointer',
                    border: '1px solid #3a3a5a',
                    opacity: exists ? 0.5 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {pc.imageUrl || pc.avatar || pc.image ? (
                      <img src={pc.imageUrl || pc.avatar || pc.image} alt={pc.name} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#7c8ba0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '16px' }}>
                        {pc.name?.charAt(0) || '?'}
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#1f2937', fontSize: '14px', fontWeight: 600 }}>{pc.name}</div>
                      <div style={{ color: '#888', fontSize: '11px' }}>{pc.gender || '未知'} · {pc.role || pc.personality || '无描述'}</div>
                      {exists && <div style={{ color: '#f59e0b', fontSize: '10px', marginTop: '2px' }}>已导入</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
