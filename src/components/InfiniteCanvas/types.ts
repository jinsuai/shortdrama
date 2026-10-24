// 无限画布类型定义

export type NodeType = 'text' | 'image' | 'video' | 'generate' | 'output';

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

export interface GenerateNodeData {
  generateType: GenerateType;
  model: string;
  params: {
    resolution?: string;
    duration?: number;
    temperature?: number;
    style?: string;
    [key: string]: any;
  };
  status: 'idle' | 'running' | 'success' | 'error';
  result?: string;
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
  | OutputNodeData;

export interface WorkflowConfig {
  name: string;
  description?: string;
  autoSave: boolean;
}

export const GENERATE_TYPES = [
  { value: 'text-to-image', label: '文生图', icon: '🖼️' },
  { value: 'image-to-image', label: '图生图', icon: '🔄' },
  { value: 'text-to-video', label: '文生视频', icon: '🎬' },
  { value: 'image-to-video', label: '图生视频', icon: '🎥' },
  { value: 'text-to-text', label: '文本生成', icon: '📝' },
];

export const MODELS = {
  'text-to-image': ['qwen-image-3.0', 'flux-schnell', 'sdxl'],
  'image-to-image': ['qwen-image-3.0', 'flux-schnell'],
  'text-to-video': ['minimax-h3', 'wan2.6', 'seedance-2.0'],
  'image-to-video': ['minimax-h3', 'wan2.6-i2v'],
  'text-to-text': ['deepseek-v4-flash', 'qwen3.5-32b', 'glm-5'],
};
