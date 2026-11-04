import { create } from 'zustand';
import {
  Character,
  Prop,
  CameraShot,
  SceneConfig,
  DEFAULT_SCENE,
  Vector3,
  CharacterTemplateType,
  SceneTemplateType,
  SCENE_TEMPLATES,
  CAMERA_DEFAULT_DURATION,
} from './types';

const genId = () => Math.random().toString(36).substring(2, 10);

interface DirectorStore {
  // 状态
  characters: Character[];
  props: Prop[];
  cameras: CameraShot[];
  activeCameraId: string | null;
  selectedCharacterId: string | null;
  selectedPropId: string | null;
  scene: SceneConfig;
  showGrid: boolean;
  showGizmos: boolean;

  // 时间轴预演（镜头按 cameras 数组顺序依次切镜）
  playing: boolean;
  loop: boolean;
  /** 秒；只给进度条用，由画布低频回写，避免每帧触发整块面板重渲染 */
  playhead: number;
  /** 预演当前切到的机位 id */
  previewCameraId: string | null;
  /** seek 时递增，通知画布把内部时钟同步到 playhead */
  seekNonce: number;

  // 角色操作
  addCharacter: (name?: string, template?: CharacterTemplateType) => void;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
  removeCharacter: (id: string) => void;
  selectCharacter: (id: string | null) => void;
  // 场景模板
  applySceneTemplate: (template: SceneTemplateType) => void;

  // 道具操作
  addProp: (type: Prop['type']) => void;
  updateProp: (id: string, updates: Partial<Prop>) => void;
  removeProp: (id: string) => void;
  selectProp: (id: string | null) => void;

  // 机位操作
  addCamera: (position: Vector3, target: Vector3) => void;
  updateCamera: (id: string, updates: Partial<CameraShot>) => void;
  removeCamera: (id: string) => void;
  setActiveCamera: (id: string | null) => void;
  moveCamera: (id: string, dir: -1 | 1) => void;

  // 时间轴预演操作
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setLoop: (loop: boolean) => void;
  /** 画布回写进度（低频） */
  reportProgress: (seconds: number, cameraId: string | null) => void;
  /** 一键按剧本/分镜生成机位（AI 布机位写回用）；元素为宽松的镜头草稿 */
  replaceCameras: (shots: any[]) => void;

  // 场景操作
  updateScene: (updates: Partial<SceneConfig>) => void;
  toggleGrid: () => void;
  toggleGizmos: () => void;

  // 导出
  exportScene: () => object;
  exportCameraReference: (cameraId: string) => object;

  // 从项目存档回灌（project.director3d），再次进入导演台时恢复上次的布景/机位
  loadScene: (data: any) => void;
}

export const useDirectorStore = create<DirectorStore>((set, get) => ({
  characters: [
    {
      id: 'char-1',
      name: '主角',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: 1,
      color: '#4facfe',
      template: 'male_standard',
      gender: 'male',
      outfit: '#2563eb',
      hairColor: '#2d1810',
    },
    {
      id: 'char-2',
      name: '反派',
      position: { x: 3, y: 0, z: 0 },
      rotation: { x: 0, y: Math.PI, z: 0 },
      scale: 1,
      color: '#f5576c',
      template: 'female_elegant',
      gender: 'female',
      outfit: '#ef4444',
      hairColor: '#f0f1f4',
    },
  ],
  props: [],
  // 开箱即用的示例机位：进来就能直接播放时间轴预演 / 导出构图，
  // 不用先手动布机位（用户点「新增机位」「AI 布机位」或导入存档时会整体替换）。
  cameras: [
    {
      id: 'cam-1', name: '01 全景·双人建立',
      position: { x: 7, y: 4.2, z: 9 }, target: { x: 1.5, y: 1.1, z: 0 },
      fov: 45, aspect: '16:9', movement: 'push', movementSpeed: 0.6, duration: 5,
    },
    {
      id: 'cam-2', name: '02 过肩·主角特写',
      position: { x: 3.9, y: 1.9, z: 2.8 }, target: { x: 0, y: 1.4, z: 0 },
      fov: 35, aspect: '16:9', movement: 'static', movementSpeed: 0.5, duration: 4,
    },
    {
      id: 'cam-3', name: '03 环绕·宽银幕收尾',
      position: { x: -4.5, y: 2.8, z: 6 }, target: { x: 1.5, y: 1.2, z: 0 },
      fov: 50, aspect: '2.35:1', movement: 'orbit', movementSpeed: 0.8, duration: 6,
    },
  ],
  activeCameraId: null,
  selectedCharacterId: null,
  selectedPropId: null,
  scene: DEFAULT_SCENE,
  showGrid: true,
  showGizmos: true,

  playing: false,
  loop: true,
  playhead: 0,
  previewCameraId: null,
  seekNonce: 0,

  addCharacter: (name, template = 'male_standard') => {
    const id = genId();
    const count = get().characters.length;
    const gender = template.includes('female') ? 'female' : 'male';

    // 根据模板设置不同的属性，让人物有明显区别
    const templateConfig = {
      male_standard: { scale: 1.0, color: '#4a90d9', outfit: '#cbd5e4', hairColor: '#2d1810', bodyType: 'standard' },
      female_standard: { scale: 0.92, color: '#e8a0bf', outfit: '#c0392b', hairColor: '#4a2c1a', bodyType: 'standard' },
      male_athletic: { scale: 1.1, color: '#d4a574', outfit: '#e6ecf8', hairColor: '#f0f1f4', bodyType: 'athletic' },
      female_elegant: { scale: 0.88, color: '#f5c6d6', outfit: '#8e44ad', hairColor: '#f0f1f4', bodyType: 'elegant' },
      child: { scale: 0.65, color: '#ffd93d', outfit: '#6bcb77', hairColor: '#4a2c1a', bodyType: 'child' },
    };
    const config = templateConfig[template] || templateConfig.male_standard;

    set((s) => ({
      characters: [
        ...s.characters,
        {
          id,
          name: name || `角色${count + 1}`,
          position: { x: count * 2, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: config.scale,
          color: config.color,
          template,
          gender,
          outfit: config.outfit,
          hairColor: config.hairColor,
          bodyType: config.bodyType,
        },
      ],
    }));
  },

  updateCharacter: (id, updates) =>
    set((s) => ({
      characters: s.characters.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),

  removeCharacter: (id) =>
    set((s) => ({
      characters: s.characters.filter((c) => c.id !== id),
      selectedCharacterId:
        s.selectedCharacterId === id ? null : s.selectedCharacterId,
    })),

  selectCharacter: (id) => set({ selectedCharacterId: id, selectedPropId: null }),

  addProp: (type) => {
    const id = genId();
    const count = get().props.length;
    const colors: Record<string, string> = {
      box: '#a8edea',
      sphere: '#fed6e3',
      cylinder: '#d299c2',
      plane: '#fef9d7',
    };
    set((s) => ({
      props: [
        ...s.props,
        {
          id,
          name: `道具${count + 1}`,
          type,
          position: { x: -2 + count * 1.5, y: type === 'plane' ? 0 : 0.5, z: 2 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          color: colors[type] || '#ccc',
        },
      ],
    }));
  },

  updateProp: (id, updates) =>
    set((s) => ({
      props: s.props.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),

  removeProp: (id) =>
    set((s) => ({
      props: s.props.filter((p) => p.id !== id),
      selectedPropId: s.selectedPropId === id ? null : s.selectedPropId,
    })),

  selectProp: (id) => set({ selectedPropId: id, selectedCharacterId: null }),

  addCamera: (position, target) => {
    const id = genId();
    const count = get().cameras.length;
    set((s) => ({
      cameras: [
        ...s.cameras,
        {
          id,
          name: `镜头${count + 1}`,
          position: { ...position },
          target: { ...target },
          fov: 50,
          aspect: '16:9',
          movement: 'static',
          movementSpeed: 1,
          duration: CAMERA_DEFAULT_DURATION,
        },
      ],
      activeCameraId: id,
    }));
  },

  updateCamera: (id, updates) =>
    set((s) => ({
      cameras: s.cameras.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),

  removeCamera: (id) =>
    set((s) => ({
      cameras: s.cameras.filter((c) => c.id !== id),
      activeCameraId: s.activeCameraId === id ? null : s.activeCameraId,
    })),

  setActiveCamera: (id) => set({ activeCameraId: id }),

  updateScene: (updates) =>
    set((s) => ({ scene: { ...s.scene, ...updates } })),
  applySceneTemplate: (template) => {
    const tpl = SCENE_TEMPLATES.find(t => t.value === template);
    if (!tpl) return;

    // 根据场景模板生成对应的道具（3D物体）
    const sceneProps = {
      bedroom: [
        { type: 'box' as const, name: '床', position: { x: 0, y: 0.3, z: 0 }, scale: { x: 2, y: 0.6, z: 3 }, color: '#8b4513' },
        { type: 'box' as const, name: '床头柜', position: { x: -1.5, y: 0.25, z: -1 }, scale: { x: 0.5, y: 0.5, z: 0.5 }, color: '#654321' },
        { type: 'box' as const, name: '衣柜', position: { x: 2, y: 1, z: -2 }, scale: { x: 1.5, y: 2, z: 0.6 }, color: '#5d4037' },
        { type: 'cylinder' as const, name: '台灯', position: { x: -1.5, y: 0.6, z: -1 }, scale: { x: 0.15, y: 0.4, z: 0.15 }, color: '#ffd700' },
      ],
      livingroom: [
        { type: 'box' as const, name: '沙发', position: { x: 0, y: 0.4, z: 0 }, scale: { x: 3, y: 0.8, z: 1 }, color: '#7c8ba0' },
        { type: 'box' as const, name: '茶几', position: { x: 0, y: 0.2, z: 1.5 }, scale: { x: 1.2, y: 0.4, z: 0.6 }, color: '#8b4513' },
        { type: 'box' as const, name: '电视柜', position: { x: 0, y: 0.3, z: -2.5 }, scale: { x: 2, y: 0.6, z: 0.4 }, color: '#cbd5e3' },
        { type: 'box' as const, name: '电视', position: { x: 0, y: 1, z: -2.7 }, scale: { x: 1.5, y: 0.9, z: 0.1 }, color: '#f0f1f4' },
      ],
      office: [
        { type: 'box' as const, name: '办公桌', position: { x: 0, y: 0.4, z: 0 }, scale: { x: 1.6, y: 0.8, z: 0.8 }, color: '#5d4037' },
        { type: 'box' as const, name: '办公椅', position: { x: 0, y: 0.5, z: 1.2 }, scale: { x: 0.6, y: 1, z: 0.6 }, color: '#cbd5e3' },
        { type: 'box' as const, name: '文件柜', position: { x: -2, y: 0.9, z: -1 }, scale: { x: 0.8, y: 1.8, z: 0.4 }, color: '#718096' },
        { type: 'cylinder' as const, name: '电脑显示器', position: { x: 0, y: 1, z: -0.3 }, scale: { x: 0.4, y: 0.6, z: 0.05 }, color: '#f0f1f4' },
      ],
      street: [
        { type: 'box' as const, name: '建筑1', position: { x: -4, y: 3, z: 0 }, scale: { x: 2, y: 6, z: 3 }, color: '#7c8ba0' },
        { type: 'box' as const, name: '建筑2', position: { x: 4, y: 4, z: -2 }, scale: { x: 2.5, y: 8, z: 3 }, color: '#cbd5e3' },
        { type: 'cylinder' as const, name: '路灯', position: { x: -2, y: 1.5, z: 2 }, scale: { x: 0.1, y: 3, z: 0.1 }, color: '#7c8ba0' },
        { type: 'sphere' as const, name: '路灯灯泡', position: { x: -2, y: 3.2, z: 2 }, scale: { x: 0.2, y: 0.2, z: 0.2 }, color: '#ffd700' },
      ],
      palace: [
        { type: 'box' as const, name: '龙椅', position: { x: 0, y: 0.8, z: -2 }, scale: { x: 1.5, y: 1.6, z: 0.8 }, color: '#daa520' },
        { type: 'cylinder' as const, name: '柱子1', position: { x: -3, y: 2, z: -1 }, scale: { x: 0.3, y: 4, z: 0.3 }, color: '#8b0000' },
        { type: 'cylinder' as const, name: '柱子2', position: { x: 3, y: 2, z: -1 }, scale: { x: 0.3, y: 4, z: 0.3 }, color: '#8b0000' },
        { type: 'box' as const, name: '台阶', position: { x: 0, y: 0.15, z: -1 }, scale: { x: 4, y: 0.3, z: 1.5 }, color: '#8b4513' },
      ],
      forest: [
        { type: 'cylinder' as const, name: '树干1', position: { x: -2, y: 1, z: 0 }, scale: { x: 0.3, y: 2, z: 0.3 }, color: '#5d4037' },
        { type: 'sphere' as const, name: '树冠1', position: { x: -2, y: 2.5, z: 0 }, scale: { x: 1.2, y: 1.2, z: 1.2 }, color: '#228b22' },
        { type: 'cylinder' as const, name: '树干2', position: { x: 2, y: 1.2, z: -1 }, scale: { x: 0.4, y: 2.4, z: 0.4 }, color: '#5d4037' },
        { type: 'sphere' as const, name: '树冠2', position: { x: 2, y: 3, z: -1 }, scale: { x: 1.5, y: 1.5, z: 1.5 }, color: '#2e8b57' },
        { type: 'cylinder' as const, name: '树干3', position: { x: 0, y: 0.8, z: 2 }, scale: { x: 0.25, y: 1.6, z: 0.25 }, color: '#5d4037' },
        { type: 'sphere' as const, name: '树冠3', position: { x: 0, y: 2, z: 2 }, scale: { x: 1, y: 1, z: 1 }, color: '#3cb371' },
      ],
      bar: [
        { type: 'box' as const, name: '吧台', position: { x: 0, y: 0.6, z: -1 }, scale: { x: 4, y: 1.2, z: 0.6 }, color: '#2d1b2e' },
        { type: 'cylinder' as const, name: '吧椅1', position: { x: -1, y: 0.5, z: 0.5 }, scale: { x: 0.3, y: 1, z: 0.3 }, color: '#4a1942' },
        { type: 'cylinder' as const, name: '吧椅2', position: { x: 1, y: 0.5, z: 0.5 }, scale: { x: 0.3, y: 1, z: 0.3 }, color: '#4a1942' },
        { type: 'sphere' as const, name: '霓虹灯1', position: { x: -2, y: 2, z: -2 }, scale: { x: 0.3, y: 0.3, z: 0.3 }, color: '#ff00ff' },
        { type: 'sphere' as const, name: '霓虹灯2', position: { x: 2, y: 2, z: -2 }, scale: { x: 0.3, y: 0.3, z: 0.3 }, color: '#00ffff' },
      ],
      hospital: [
        { type: 'box' as const, name: '病床', position: { x: 0, y: 0.4, z: 0 }, scale: { x: 1.2, y: 0.8, z: 2.5 }, color: '#111827' },
        { type: 'box' as const, name: '床头柜', position: { x: -1, y: 0.3, z: -0.5 }, scale: { x: 0.4, y: 0.6, z: 0.4 }, color: '#4b5563' },
        { type: 'cylinder' as const, name: '输液架', position: { x: 1, y: 1, z: 0 }, scale: { x: 0.05, y: 2, z: 0.05 }, color: '#5b6678' },
        { type: 'box' as const, name: '输液瓶', position: { x: 1, y: 2, z: 0 }, scale: { x: 0.15, y: 0.25, z: 0.15 }, color: '#e0f2fe' },
      ],
      empty: [],
    };

    const propsToAdd = sceneProps[template] || [];
    const newProps = propsToAdd.map((p, i) => ({
      id: genId(),
      name: p.name,
      type: p.type,
      position: p.position,
      rotation: { x: 0, y: 0, z: 0 },
      scale: p.scale,
      color: p.color,
    }));

    set((s) => ({
      scene: {
        ...s.scene,
        background: tpl.background,
        groundColor: tpl.groundColor,
        fogEnabled: tpl.fogEnabled,
        fogColor: tpl.fogColor,
        fogDensity: tpl.fogDensity,
        ambientLightIntensity: tpl.ambientLight,
        directionalLightIntensity: tpl.directionalLight,
      },
      props: newProps,
    }));
  },

  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleGizmos: () => set((s) => ({ showGizmos: !s.showGizmos })),

  // ── 时间轴预演 ──────────────────────────────────────────────
  moveCamera: (id, dir) =>
    set((s) => {
      const i = s.cameras.findIndex((c) => c.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.cameras.length) return s;
      const next = [...s.cameras];
      [next[i], next[j]] = [next[j], next[i]];
      return { cameras: next };
    }),

  play: () =>
    set((s) => ({
      playing: s.cameras.length > 0,
      playhead: 0,
      previewCameraId: s.cameras[0]?.id ?? null,
      seekNonce: s.seekNonce + 1,
    })),
  pause: () => set({ playing: false }),
  stop: () =>
    set((s) => ({
      playing: false,
      playhead: 0,
      previewCameraId: null,
      seekNonce: s.seekNonce + 1,
    })),
  seek: (seconds) =>
    set((s) => ({ playhead: Math.max(0, seconds), seekNonce: s.seekNonce + 1 })),
  setLoop: (loop) => set({ loop }),
  reportProgress: (seconds, cameraId) =>
    set({ playhead: seconds, previewCameraId: cameraId }),

  /** AI 布机位写回：只接受认识的值，坏数据一律回退到安全默认，绝不让画布炸掉 */
  replaceCameras: (shots) => {
    const allowed = ['static', 'push', 'pull', 'pan', 'tilt', 'track', 'orbit'];
    const num = (v: any, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const vec = (v: any, d: Vector3): Vector3 =>
      v && typeof v === 'object' && ['x', 'y', 'z'].every((k) => typeof v[k] === 'number' && Number.isFinite(v[k]))
        ? { x: v.x, y: v.y, z: v.z }
        : d;
    const list = (Array.isArray(shots) ? shots : []).slice(0, 24).map((raw: any, i: number) => ({
      id: genId(),
      name: String(raw?.name || `镜头${i + 1}`).slice(0, 40),
      position: vec(raw?.position, { x: 0, y: 1.6, z: 5 }),
      target: vec(raw?.target, { x: 0, y: 1, z: 0 }),
      fov: Math.min(100, Math.max(20, num(raw?.fov, 50))),
      aspect: typeof raw?.aspect === 'string' ? raw.aspect : '9:16',
      movement: (allowed.includes(raw?.movement) ? raw.movement : 'static') as CameraShot['movement'],
      movementSpeed: Math.min(4, Math.max(0.2, num(raw?.movementSpeed, 1))),
      duration: Math.min(30, Math.max(0.5, num(raw?.duration, CAMERA_DEFAULT_DURATION))),
    }));
    set((s) => ({
      cameras: list,
      activeCameraId: null,
      previewCameraId: null,
      playing: false,
      playhead: 0,
      seekNonce: s.seekNonce + 1,
    }));
  },

  exportScene: () => {
    const { characters, props, cameras, scene, loop, showGrid, showGizmos } = get();
    return {
      version: '1.1',
      exportedAt: new Date().toISOString(),
      characters,
      props,
      cameras,
      scene,
      loop,
      showGrid,
      showGizmos,
    };
  },

  /** 用项目里存过的布景回灌本地 store（只覆盖认识的字段，坏数据不炸画布） */
  loadScene: (data) => {
    if (!data || typeof data !== 'object') return;
    // 旧存档（version 1.0）的机位没有 duration / movementSpeed，补默认值，
    // 否则时间轴总时长会变 NaN，预演直接失效。
    const cameras = Array.isArray(data.cameras)
      ? data.cameras.map((c: any) => ({
          ...c,
          duration: typeof c?.duration === 'number' && Number.isFinite(c.duration) ? c.duration : CAMERA_DEFAULT_DURATION,
          movementSpeed: typeof c?.movementSpeed === 'number' && Number.isFinite(c.movementSpeed) ? c.movementSpeed : 1,
          movement: c?.movement || 'static',
        }))
      : get().cameras;
    set((s) => ({
      characters: Array.isArray(data.characters) ? data.characters : s.characters,
      props: Array.isArray(data.props) ? data.props : s.props,
      cameras,
      scene: data.scene && typeof data.scene === 'object' ? { ...s.scene, ...data.scene } : s.scene,
      showGrid: typeof data.showGrid === 'boolean' ? data.showGrid : s.showGrid,
      showGizmos: typeof data.showGizmos === 'boolean' ? data.showGizmos : s.showGizmos,
      loop: typeof data.loop === 'boolean' ? data.loop : s.loop,
      playing: false,
      playhead: 0,
      previewCameraId: null,
      activeCameraId: cameras.some?.((c: any) => c.id === data.activeCameraId)
        ? data.activeCameraId
        : null,
      selectedCharacterId: null,
      selectedPropId: null,
    }));
  },

  exportCameraReference: (cameraId) => {
    const camera = get().cameras.find((c) => c.id === cameraId);
    const { characters, props, scene } = get();
    if (!camera) return {};
    return {
      camera,
      characters: characters.map((c) => ({
        name: c.name,
        position: c.position,
        rotation: c.rotation,
        color: c.color,
      })),
      props,
      scene: {
        background: scene.background,
        fog: scene.fogEnabled,
      },
      prompt: `镜头：${camera.name}，画幅：${camera.aspect}，运镜：${camera.movement}。场景包含${characters.length}个角色：${characters.map((c) => c.name).join('、')}。`,
    };
  },
}));
