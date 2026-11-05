// 白模预演导演台类型定义
// 约定：不加载任何外部 3D 模型（GLB/GLTF/OBJ），人物与道具统一程序化素模。

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** 白模支持的姿态（靠素模几何表达，不依赖外部模型文件） */
export type CharacterPose = 'stand' | 'sit' | 'squat' | 'walk';

export const CHARACTER_POSES: { value: CharacterPose; label: string; hint: string }[] = [
  { value: 'stand', label: '站立', hint: '默认站姿，适合对话、全景' },
  { value: 'sit', label: '坐姿', hint: '坐于素模座椅，适合室内谈话、餐桌戏' },
  { value: 'squat', label: '蹲姿', hint: '俯身下蹲，适合低机位、捡拾动作' },
  { value: 'walk', label: '行走', hint: '迈步造型，适合跟拍、入场镜头' },
];

export interface Character {
  id: string;
  name: string;
  position: Vector3;
  rotation: Vector3; // 朝向
  scale: number;
  color: string;
  lookAtTarget?: string; // 注视目标角色ID
  template?: CharacterTemplateType; // 人物模板
  outfit?: string; // 上衣/服装颜色
  hairColor?: string; // 发色
  skinColor?: string; // 肤色（可选，默认暖肤色）
  pantsColor?: string; // 下装颜色（可选，默认由服装色派生）
  gender?: 'male' | 'female'; // 性别
  /** 姿态：站立 / 坐姿 / 蹲姿 / 行走 */
  pose?: CharacterPose;
}

export type CharacterTemplateType = 'male_standard' | 'female_standard' | 'male_athletic' | 'female_elegant' | 'child';

export const CHARACTER_TEMPLATES: { value: CharacterTemplateType; label: string; gender: 'male' | 'female'; desc: string }[] = [
  { value: 'male_standard', label: '标准男性', gender: 'male', desc: '普通成年男性体型' },
  { value: 'female_standard', label: '标准女性', gender: 'female', desc: '普通成年女性体型' },
  { value: 'male_athletic', label: '健壮男性', gender: 'male', desc: '肌肉发达的男性' },
  { value: 'female_elegant', label: '优雅女性', gender: 'female', desc: '纤细优雅的女性' },
  { value: 'child', label: '儿童', gender: 'male', desc: '儿童体型' },
];

/** 复合布景件的一个体素部件（相对布景件原点） */
export interface PropPart {
  shape: 'box' | 'sphere' | 'cylinder' | 'plane';
  /** 局部尺寸；对应单位几何体的缩放（box=1³、sphere 半径0.5、cylinder 半径0.5高1、plane=2²） */
  size: Vector3;
  /** 相对布景件原点的偏移 */
  offset?: Vector3;
  rotation?: Vector3;
  color?: string;
}

export interface Prop {
  id: string;
  name: string;
  type: 'box' | 'sphere' | 'cylinder' | 'plane';
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
  color: string;
  /** 复合布景件（如沙发=座+靠背+扶手）。parts 存在时覆盖单体渲染，仍不加载任何外部模型 */
  parts?: PropPart[];
  /** 标记来自哪个场景模板，便于整体替换/清除 */
  setPieceId?: string;
}

export interface CameraShot {
  id: string;
  name: string;
  position: Vector3;
  target: Vector3; // 注视点
  fov: number; // 焦距
  aspect: string; // 画幅 16:9 / 9:16 / 1:1 / 2.35:1
  movement: 'static' | 'push' | 'pull' | 'pan' | 'tilt' | 'track' | 'orbit';
  movementSpeed: number;
  /** 时间轴上该镜头的时长（秒）。镜头按 cameras 数组顺序依次切镜。 */
  duration: number;
  thumbnail?: string;
}

/** 新建机位的默认时长（秒） */
export const CAMERA_DEFAULT_DURATION = 4;

/** 运镜轨迹的中文说明，面板里直接展示，避免用户以为下拉框只是摆设 */
export const CAMERA_MOVEMENT_HINTS: Record<CameraShot['movement'], string> = {
  static: '固定机位，不做运动',
  push: '沿视线缓缓推近主体',
  pull: '沿视线缓缓拉远',
  pan: '水平横移（摇镜）',
  tilt: '垂直升降（俯仰）',
  track: '与主体同向平移跟拍',
  orbit: '环绕主体旋转',
};

export interface SceneConfig {
  background: string;
  groundColor: string;
  fogEnabled: boolean;
  fogColor: string;
  fogDensity: number;
  ambientLightIntensity: number;
  directionalLightIntensity: number;
  directionalLightPosition: Vector3;
}

export interface Director3DState {
  characters: Character[];
  props: Prop[];
  cameras: CameraShot[];
  activeCameraId: string | null;
  selectedCharacterId: string | null;
  selectedPropId: string | null;
  scene: SceneConfig;
  showGrid: boolean;
  showGizmos: boolean;
}

export const DEFAULT_SCENE: SceneConfig = {
  background: '#e6ecf8',
  groundColor: '#E6ECF8',
  fogEnabled: true,
  fogColor: '#e6ecf8',
  fogDensity: 0.02,
  ambientLightIntensity: 0.6,
  directionalLightIntensity: 1.2,
  directionalLightPosition: { x: 5, y: 10, z: 5 },
};

export const ASPECT_RATIOS = [
  { label: '横屏 16:9', value: '16:9', width: 1920, height: 1080 },
  { label: '竖屏 9:16', value: '9:16', width: 1080, height: 1920 },
  { label: '方形 1:1', value: '1:1', width: 1080, height: 1080 },
  { label: '电影 2.35:1', value: '2.35:1', width: 1920, height: 817 },
];

export const CAMERA_MOVEMENTS = [
  { label: '固定', value: 'static' },
  { label: '推镜', value: 'push' },
  { label: '拉镜', value: 'pull' },
  { label: '摇镜', value: 'pan' },
  { label: '俯仰', value: 'tilt' },
  { label: '跟拍', value: 'track' },
  { label: '环绕', value: 'orbit' },
];

export type SceneTemplateType = 'empty' | 'generic' | 'arch' | 'bedroom' | 'livingroom' | 'office' | 'street' | 'palace' | 'forest' | 'bar' | 'hospital';

export interface SceneTemplate {
  value: SceneTemplateType;
  label: string;
  desc: string;
  background: string;
  groundColor: string;
  wallColor?: string;
  ambientLight: number;
  directionalLight: number;
  fogEnabled: boolean;
  fogColor: string;
  fogDensity: number;
}

export const SCENE_TEMPLATES: SceneTemplate[] = [
  { value: 'empty', label: '空场景', desc: '纯色背景，自由搭建', background: '#e6ecf8', groundColor: '#E6ECF8', ambientLight: 0.6, directionalLight: 1.2, fogEnabled: true, fogColor: '#e6ecf8', fogDensity: 0.02 },
  { value: 'generic', label: '通用', desc: '中性室内布景（未识别地点时默认）', background: '#E4E9F4', groundColor: '#b8b3a8', wallColor: '#dbe2ec', ambientLight: 0.7, directionalLight: 0.9, fogEnabled: false, fogColor: '#E4E9F4', fogDensity: 0 },
  { value: 'arch', label: '拱门庭院', desc: '婚礼/过门/仪式：拱门+三级台阶+红毯', background: '#EDE9E0', groundColor: '#cdbfa6', wallColor: '#e8e0d2', ambientLight: 0.72, directionalLight: 0.95, fogEnabled: false, fogColor: '#EDE9E0', fogDensity: 0 },
  { value: 'bedroom', label: '卧室', desc: '温馨的卧室场景', background: '#DDE4F0', groundColor: '#8b7355', wallColor: '#d4c5a9', ambientLight: 0.7, directionalLight: 0.8, fogEnabled: false, fogColor: '#DDE4F0', fogDensity: 0 },
  { value: 'livingroom', label: '客厅', desc: '现代客厅场景', background: '#DDE4F0', groundColor: '#a0826d', wallColor: '#e8ddd0', ambientLight: 0.75, directionalLight: 0.9, fogEnabled: false, fogColor: '#DDE4F0', fogDensity: 0 },
  { value: 'office', label: '办公室', desc: '现代办公场景', background: '#DDE4F0', groundColor: '#4b5563', wallColor: '#4b5563', ambientLight: 0.8, directionalLight: 1.0, fogEnabled: false, fogColor: '#DDE4F0', fogDensity: 0 },
  { value: 'street', label: '街道', desc: '城市街道场景', background: '#E2E9F7', groundColor: '#94a1b3', wallColor: '#7c8798', ambientLight: 0.5, directionalLight: 0.7, fogEnabled: true, fogColor: '#E2E9F7', fogDensity: 0.03 },
  { value: 'palace', label: '宫殿', desc: '古代宫殿场景', background: '#2a1f1a', groundColor: '#8b4513', wallColor: '#daa520', ambientLight: 0.65, directionalLight: 1.1, fogEnabled: true, fogColor: '#2a1f1a', fogDensity: 0.015 },
  { value: 'forest', label: '森林', desc: '户外森林场景', background: '#1a2e1a', groundColor: '#2d5016', wallColor: '#3d6b22', ambientLight: 0.4, directionalLight: 0.6, fogEnabled: true, fogColor: '#1a2e1a', fogDensity: 0.04 },
  { value: 'bar', label: '酒吧', desc: '夜店酒吧场景', background: '#1a0a1a', groundColor: '#2d1b2e', wallColor: '#4a1942', ambientLight: 0.3, directionalLight: 0.5, fogEnabled: true, fogColor: '#1a0a1a', fogDensity: 0.05 },
  { value: 'hospital', label: '医院', desc: '医院病房场景', background: '#334155', groundColor: '#4b5563', wallColor: '#111827', ambientLight: 0.9, directionalLight: 1.0, fogEnabled: false, fogColor: '#334155', fogDensity: 0 },
];
