// 3D导演台类型定义

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Character {
  id: string;
  name: string;
  position: Vector3;
  rotation: Vector3; // 朝向
  scale: number;
  color: string;
  lookAtTarget?: string; // 注视目标角色ID
  template?: CharacterTemplateType; // 人物模板
  outfit?: string; // 服装颜色
  hairColor?: string; // 发色
  gender?: 'male' | 'female'; // 性别
  modelUrl?: string; // 自定义3D模型（GLB/GLTF）
  modelType?: 'procedural' | 'custom' | 'ai-generated'; // 模型类型
  fourViews?: { front?: string; left?: string; back?: string; right?: string }; // 四视图
}

export type CharacterTemplateType = 'male_standard' | 'female_standard' | 'male_athletic' | 'female_elegant' | 'child';

export const CHARACTER_TEMPLATES: { value: CharacterTemplateType; label: string; gender: 'male' | 'female'; desc: string }[] = [
  { value: 'male_standard', label: '标准男性', gender: 'male', desc: '普通成年男性体型' },
  { value: 'female_standard', label: '标准女性', gender: 'female', desc: '普通成年女性体型' },
  { value: 'male_athletic', label: '健壮男性', gender: 'male', desc: '肌肉发达的男性' },
  { value: 'female_elegant', label: '优雅女性', gender: 'female', desc: '纤细优雅的女性' },
  { value: 'child', label: '儿童', gender: 'male', desc: '儿童体型' },
];

export interface Prop {
  id: string;
  name: string;
  type: 'box' | 'sphere' | 'cylinder' | 'plane' | 'model';
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
  color: string;
  modelUrl?: string; // 自定义3D模型
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
  thumbnail?: string;
}

export interface SceneConfig {
  background: string;
  groundColor: string;
  fogEnabled: boolean;
  fogColor: string;
  fogDensity: number;
  ambientLightIntensity: number;
  directionalLightIntensity: number;
  directionalLightPosition: Vector3;
  environmentModelUrl?: string; // 自定义场景3D模型
  showEnvironmentModel?: boolean; // 是否显示场景模型
  selectedEpisodeId?: string; // 当前选中的集ID
  scenePrompt?: string; // 场景提示词
  sceneImageUrl?: string; // 场景概念图URL
  sceneModelUrl?: string; // 3D场景模型URL
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

export type SceneTemplateType = 'empty' | 'bedroom' | 'livingroom' | 'office' | 'street' | 'palace' | 'forest' | 'bar' | 'hospital';

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
  { value: 'bedroom', label: '卧室', desc: '温馨的卧室场景', background: '#DDE4F0', groundColor: '#8b7355', wallColor: '#d4c5a9', ambientLight: 0.7, directionalLight: 0.8, fogEnabled: false, fogColor: '#DDE4F0', fogDensity: 0 },
  { value: 'livingroom', label: '客厅', desc: '现代客厅场景', background: '#DDE4F0', groundColor: '#a0826d', wallColor: '#e8ddd0', ambientLight: 0.75, directionalLight: 0.9, fogEnabled: false, fogColor: '#DDE4F0', fogDensity: 0 },
  { value: 'office', label: '办公室', desc: '现代办公场景', background: '#DDE4F0', groundColor: '#4b5563', wallColor: '#4b5563', ambientLight: 0.8, directionalLight: 1.0, fogEnabled: false, fogColor: '#DDE4F0', fogDensity: 0 },
  { value: 'street', label: '街道', desc: '城市街道场景', background: '#E2E9F7', groundColor: '#94a1b3', wallColor: '#7c8798', ambientLight: 0.5, directionalLight: 0.7, fogEnabled: true, fogColor: '#E2E9F7', fogDensity: 0.03 },
  { value: 'palace', label: '宫殿', desc: '古代宫殿场景', background: '#2a1f1a', groundColor: '#8b4513', wallColor: '#daa520', ambientLight: 0.65, directionalLight: 1.1, fogEnabled: true, fogColor: '#2a1f1a', fogDensity: 0.015 },
  { value: 'forest', label: '森林', desc: '户外森林场景', background: '#1a2e1a', groundColor: '#2d5016', wallColor: '#3d6b22', ambientLight: 0.4, directionalLight: 0.6, fogEnabled: true, fogColor: '#1a2e1a', fogDensity: 0.04 },
  { value: 'bar', label: '酒吧', desc: '夜店酒吧场景', background: '#1a0a1a', groundColor: '#2d1b2e', wallColor: '#4a1942', ambientLight: 0.3, directionalLight: 0.5, fogEnabled: true, fogColor: '#1a0a1a', fogDensity: 0.05 },
  { value: 'hospital', label: '医院', desc: '医院病房场景', background: '#334155', groundColor: '#4b5563', wallColor: '#111827', ambientLight: 0.9, directionalLight: 1.0, fogEnabled: false, fogColor: '#334155', fogDensity: 0 },
];
