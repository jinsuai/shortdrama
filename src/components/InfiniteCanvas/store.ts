// @ts-nocheck
import { create } from 'zustand';
import {
  NodeType,
  GenerateType,
  GenerateNodeData,
  WorkflowConfig,
} from './types';
import type { Node, Edge } from '@xyflow/react';

const genId = () => Math.random().toString(36).substring(2, 10);

interface CanvasStore {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  workflow: WorkflowConfig;
  isRunning: boolean;

  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: any) => void;
  onEdgesChange: (changes: any) => void;
  onConnect: (connection: any) => void;

  addNode: (type: NodeType, position: { x: number; y: number }) => void;
  updateNodeData: (id: string, data: any) => void;
  removeNode: (id: string) => void;
  selectNode: (id: string | null) => void;

  runWorkflow: () => Promise<void>;
  runNode: (nodeId: string) => Promise<void>;
  clearCanvas: () => void;

  exportWorkflow: () => object;
  importWorkflow: (data: any) => void;
}

const initialNodes: Node[] = [
  {
    id: 'text-1',
    type: 'textNode',
    position: { x: 50, y: 200 },
    data: { text: '一个古风武侠场景，剑客在竹林中练剑', label: '输入文本' },
  },
  {
    id: 'gen-1',
    type: 'generateNode',
    position: { x: 350, y: 180 },
    data: {
      generateType: 'text-to-image',
      model: 'qwen-image-3.0',
      params: { resolution: '1024x1024', style: '古风' },
      status: 'idle',
    },
  },
  {
    id: 'out-1',
    type: 'outputNode',
    position: { x: 650, y: 200 },
    data: { resultType: 'image' },
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: 'text-1', target: 'gen-1', animated: true },
  { id: 'e2-3', source: 'gen-1', target: 'out-1', animated: true },
];

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,
  selectedNodeId: null,
  workflow: {
    name: '未命名工作流',
    autoSave: true,
  },
  isRunning: false,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  onNodesChange: (changes) => {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        const change = changes.find((c: any) => c.id === node.id);
        if (!change) return node;
        if (change.type === 'position' && change.position) {
          return { ...node, position: change.position };
        }
        if (change.type === 'select') {
          return { ...node, selected: change.selected };
        }
        return node;
      }),
    }));
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: state.edges.filter((edge) => {
        return !changes.some((c: any) => c.id === edge.id && c.type === 'remove');
      }),
    }));
  },

  onConnect: (connection) => {
    set((state) => ({
      edges: [
        ...state.edges,
        {
          id: `e-${genId()}`,
          source: connection.source,
          target: connection.target,
          animated: true,
        },
      ],
    }));
  },

  addNode: (type, position) => {
    const id = `${type}-${genId()}`;
    let nodeType = '';
    let data: any = {};

    switch (type) {
      case 'text':
        nodeType = 'textNode';
        data = { text: '', label: '文本输入' };
        break;
      case 'image':
        nodeType = 'imageNode';
        data = { url: '', label: '图片输入' };
        break;
      case 'video':
        nodeType = 'videoNode';
        data = { url: '', label: '视频输入' };
        break;
      case 'generate':
        nodeType = 'generateNode';
        data = {
          generateType: 'text-to-image' as GenerateType,
          model: 'qwen-image-3.0',
          params: { resolution: '1024x1024' },
          status: 'idle',
        };
        break;
      case 'output':
        nodeType = 'outputNode';
        data = { resultType: 'image' };
        break;
    }

    set((state) => ({
      nodes: [...state.nodes, { id, type: nodeType, position, data }],
      selectedNodeId: id,
    }));
  },

  updateNodeData: (id, updates) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...updates } } : n
      ),
    }));
  },

  removeNode: (id) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    }));
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  runWorkflow: async () => {
    set({ isRunning: true });
    const { nodes, edges } = get();

    // 拓扑排序，按依赖顺序执行
    const inDegree: Record<string, number> = {};
    nodes.forEach((n) => (inDegree[n.id] = 0));
    edges.forEach((e) => {
      if (inDegree[e.target] !== undefined) inDegree[e.target]++;
    });

    const queue = nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id);
    const executed = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (executed.has(nodeId)) continue;
      executed.add(nodeId);

      const node = nodes.find((n) => n.id === nodeId);
      if (node?.type === 'generateNode') {
        await get().runNode(nodeId);
      }

      edges
        .filter((e) => e.source === nodeId)
        .forEach((e) => {
          inDegree[e.target]--;
          if (inDegree[e.target] === 0) queue.push(e.target);
        });
    }

    set({ isRunning: false });
  },

  runNode: async (nodeId) => {
    const { nodes, updateNodeData } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== 'generateNode') return;

    updateNodeData(nodeId, { status: 'running' });

    // 模拟API调用（实际对接调度机API）
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const data = node.data as GenerateNodeData;
    const mockResults: Record<string, string> = {
      'text-to-image': 'https://picsum.photos/seed/' + genId() + '/512/512',
      'image-to-image': 'https://picsum.photos/seed/' + genId() + '/512/512',
      'text-to-video': 'mock-video-url.mp4',
      'image-to-video': 'mock-video-url.mp4',
      'text-to-text': '这是AI生成的文本结果示例...',
    };

    updateNodeData(nodeId, {
      status: 'success',
      result: mockResults[data.generateType] || 'done',
    });

    // 把结果传递给下游output节点
    const { edges } = get();
    const outputEdges = edges.filter((e) => e.source === nodeId);
    outputEdges.forEach((e) => {
      const targetNode = nodes.find((n) => n.id === e.target);
      if (targetNode?.type === 'outputNode') {
        updateNodeData(e.target, {
          result: mockResults[data.generateType],
          resultType: data.generateType.includes('image') ? 'image' : data.generateType.includes('video') ? 'video' : 'text',
        });
      }
    });
  },

  clearCanvas: () => set({ nodes: [], edges: [], selectedNodeId: null }),

  exportWorkflow: () => {
    const { nodes, edges, workflow } = get();
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      workflow,
      nodes,
      edges,
    };
  },

  importWorkflow: (data) => {
    if (data.nodes) set({ nodes: data.nodes });
    if (data.edges) set({ edges: data.edges });
    if (data.workflow) set({ workflow: data.workflow });
  },
}));
