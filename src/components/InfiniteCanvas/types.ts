// 无限画布类型定义

export type NodeType = 'text' | 'image' | 'video' | 'generate' | 'output' | 'note' | 'shot';

export type GenerateType =
  | 'text-to-image'
  | 'image-to-image'
  | 'text-to-video'
  | 'image-to-video'
  | 'text-to-text';

export interface TextNodeData {
  text: string;
  label?: string;
}

export interface ImageNodeData {
  url: string;
  label?: string;
}

export interface VideoNodeData {
  url: string;
  label?: string;
}

/** 便签 / 注释节点：不参与生成，纯说明，也可作为提示词素材 */
export interface NoteNodeData {
  text: string;
  color?: string;
  label?: string;
}

/** 分镜节点：把项目里的分镜搬进画布，可视化整场戏的顺序 */
export interface ShotNodeData {
  shotIndex: number;
  title: string;
  description?: string;
  firstFramePrompt?: string;
  videoPrompt?: string;
  imageUrl?: string;
  videoUrl?: string;
  label?: string;
}

export interface GenerateNodeData {
  prompt?: string;
  generateType: GenerateType;
  model: string;
  params: {
    resolution?: string;
    duration?: number;
    ratio?: string;
    temperature?: number;
    style?: string;
    [key: string]: any;
  };
  status: 'idle' | 'running' | 'success' | 'error';
  result?: string;
  resultType?: 'text' | 'image' | 'video';
  error?: string;
}

export interface OutputNodeData {
  result?: string;
  resultType?: 'text' | 'image' | 'video';
}

export type CanvasNodeData =
  | TextNodeData
  | ImageNodeData
  | VideoNodeData
  | GenerateNodeData
  | OutputNodeData
  | NoteNodeData
  | ShotNodeData;

export interface WorkflowConfig {
  name: string;
  description?: string;
  autoSave: boolean;
}

/** 工作流文件版本，导入时据此做兼容处理 */
export const WORKFLOW_VERSION = 2;

export const GENERATE_TYPES = [
  { value: 'text-to-image', label: '文生图', icon: '🖼️' },
  { value: 'image-to-image', label: '图生图', icon: '🔄' },
  { value: 'text-to-video', label: '文生视频', icon: '🎬' },
  { value: 'image-to-video', label: '图生视频', icon: '🎥' },
  { value: 'text-to-text', label: '文本生成', icon: '📝' },
];

export const MODELS: Record<string, string[]> = {
  'text-to-image': ['qwen-image-3.0', 'flux-schnell', 'sdxl'],
  'image-to-image': ['qwen-image-3.0', 'flux-schnell'],
  'text-to-video': ['minimax-h3', 'wan2.6', 'seedance-2.0'],
  'image-to-video': ['minimax-h3', 'wan2.6-i2v'],
  'text-to-text': ['deepseek-v4-flash', 'qwen3.5-32b', 'glm-5'],
};

/**
 * 节点元数据单一来源：顶部「添加节点」菜单、左侧拖拽面板、Ctrl+K 命令面板、
 * MiniMap 配色、空态引导全部读它，避免三处各写一份、改一个漏两个。
 */
export interface NodeDef {
  type: NodeType;
  label: string;
  desc: string;
  icon: string;
  color: string;
  /** 命令面板搜索用的关键词 */
  keywords?: string;
}

export const NODE_DEFS: NodeDef[] = [
  { type: 'text', label: '文本节点', desc: '写提示词 / 旁白 / 台词', icon: '📝', color: '#4facfe', keywords: 'text prompt 提示词 文本 旁白' },
  { type: 'image', label: '图片节点', desc: '放一张参考图 / 关键帧', icon: '🖼️', color: '#f093fb', keywords: 'image 图片 参考图 首帧' },
  { type: 'video', label: '视频节点', desc: '放一段视频素材', icon: '🎬', color: '#667eea', keywords: 'video 视频 片段' },
  { type: 'generate', label: 'AI 生成节点', desc: '调用模型生成图 / 视频 / 文本', icon: '✨', color: '#fa709a', keywords: 'ai generate 生成 文生图 图生视频 模型' },
  { type: 'output', label: '输出节点', desc: '汇总上游的生成结果', icon: '📤', color: '#51cf66', keywords: 'output 输出 结果 预览' },
  { type: 'note', label: '便签 / 注释', desc: '给画布加说明，也可当提示词素材', icon: '🗒️', color: '#f59f00', keywords: 'note 便签 注释 备注 说明 sticky' },
  { type: 'shot', label: '分镜节点', desc: '项目里的一个分镜（首帧 / 提示词）', icon: '🎞️', color: '#a18cd1', keywords: 'shot 分镜 镜头 剧本 场次' },
];

export const nodeDef = (type: NodeType): NodeDef =>
  NODE_DEFS.find((d) => d.type === type) || NODE_DEFS[0];
