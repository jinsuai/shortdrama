// 无限画布状态管理（Zustand）。
// 原仓库提交时漏了本文件，导致 InfiniteCanvas / nodes 全部 import 失败、画布无法编译。
// 这里补全：节点/连线状态 + 增删改 + 导入导出 + runNode/runWorkflow 真正调用模型层。
//
// 模型调用统一走 src/lib/providers（OpenAI 兼容 + ComfyUI 工作流），
// 自动继承「设置 → 模型配置」里的 baseUrl/API Key/模型名/工作流，
// 因此画布生成的体验与九步流水线完全一致（零配置接模型、字段自愈等）。

import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import { generateText, generateImage, generateVideo } from '../../lib/providers/index.js';

let _seq = 1;
const genId = (p: string) => `${p}_${Date.now().toString(36)}_${_seq++}`;
const randPos = () => ({ x: 120 + Math.random() * 320, y: 120 + Math.random() * 240 });

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  name: '未命名画布',
  nodes: [],
  edges: [],
  isRunning: false,
  _abort: null,

  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
  onConnect: (conn) =>
    set({
      edges: addEdge(
        { ...conn, animated: true, style: { stroke: '#4facfe', strokeWidth: 2 } },
        get().edges
      ),
    }),

  addNode: (type, position) => {
    const id = genId(type);
    const base = { id, position: position || randPos(), data: {} as any };
    let node: any;
    if (type === 'text') node = { ...base, type: 'textNode', data: { text: '', label: '文本' } };
    else if (type === 'image') node = { ...base, type: 'imageNode', data: { url: '', label: '图片' } };
    else if (type === 'video') node = { ...base, type: 'videoNode', data: { url: '', label: '视频' } };
    else if (type === 'generate')
      node = {
        ...base,
        type: 'generateNode',
        data: { prompt: '', generateType: 'text-to-image', model: '', params: { resolution: '1024x1024' }, status: 'idle' },
      };
    else if (type === 'output') node = { ...base, type: 'outputNode', data: { result: '', resultType: undefined } };
    set({ nodes: [...get().nodes, node] });
  },

  removeNode: (id) =>
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
    }),

  updateNodeData: (id, patch) =>
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
    }),

  clearCanvas: () => set({ nodes: [], edges: [], name: '未命名画布' }),

  exportWorkflow: () => ({ name: get().name, nodes: get().nodes, edges: get().edges }),

  importWorkflow: (data) => {
    if (data && Array.isArray(data.nodes)) {
      set({
        nodes: data.nodes,
        edges: Array.isArray(data.edges) ? data.edges : [],
        name: data.name || '导入画布',
      });
    }
  },

  // 收集某节点的直接上游（入边 source）节点数据，供 runNode 拼装输入
  _upstreamOf: (id) => {
    const { edges, nodes } = get();
    const srcIds = edges.filter((e) => e.target === id).map((e) => e.source);
    return nodes.filter((n) => srcIds.includes(n.id));
  },

  runNode: async (id) => {
    const node: any = get().nodes.find((n) => n.id === id);
    if (!node || node.type !== 'generateNode') return;
    const data = node.data;
    get().updateNodeData(id, { status: 'running', error: undefined });
    try {
      const up = get()._upstreamOf(id);
      const textUp = up.filter((n: any) => n.type === 'textNode').map((n: any) => n.data.text || '').join('\n');
      const imgUp = up.filter((n: any) => n.type === 'imageNode').map((n: any) => n.data.url).filter(Boolean);
      const vidUp = up.filter((n: any) => n.type === 'videoNode').map((n: any) => n.data.url).filter(Boolean);
      const prompt = (data.prompt || textUp || '').trim();
      const type = data.generateType;
      let resultUrl = '';
      let resultType: 'text' | 'image' | 'video' | undefined;

      if (type === 'text-to-image') {
        const r = await generateImage(prompt, { referenceImage: imgUp[0] || '', size: data.params?.resolution || '1024x1024' });
        resultUrl = r.resultUrl; resultType = 'image';
      } else if (type === 'image-to-image') {
        const r = await generateImage(prompt, { referenceImage: imgUp[0] || vidUp[0] || '', size: data.params?.resolution || '1024x1024' });
        resultUrl = r.resultUrl; resultType = 'image';
      } else if (type === 'text-to-video') {
        const r = await generateVideo({ prompt, seconds: data.params?.duration || '5', aspect_ratio: data.params?.ratio || '9:16', mode: 'text' });
        resultUrl = r.resultUrl; resultType = 'video';
      } else if (type === 'image-to-video') {
        const r = await generateVideo({ prompt, first_frame: imgUp[0] || vidUp[0] || '', seconds: data.params?.duration || '5', aspect_ratio: data.params?.ratio || '9:16', mode: 'keyframe' });
        resultUrl = r.resultUrl; resultType = 'video';
      } else if (type === 'text-to-text') {
        const r: any = await generateText([{ role: 'user', content: prompt || '你好' }]);
        resultUrl = typeof r === 'string' ? r : String(r); resultType = 'text';
      } else {
        throw new Error('未知的生成类型：' + type);
      }

      get().updateNodeData(id, { status: 'success', result: resultUrl, resultType });
      // 把结果推给下游 output 节点
      const outEdges = get().edges.filter((e) => e.source === id);
      for (const e of outEdges) get().updateNodeData(e.target, { result: resultUrl, resultType });
    } catch (err: any) {
      get().updateNodeData(id, { status: 'error', error: err?.message || String(err) });
    }
  },

  runWorkflow: async () => {
    if (get().isRunning) return;
    const gens = get().nodes.filter((n) => n.type === 'generateNode');
    set({ isRunning: true });
    const ctrl = new AbortController();
    set({ _abort: ctrl });
    try {
      for (const g of gens) await get().runNode(g.id);
    } finally {
      set({ isRunning: false, _abort: null });
    }
  },
}));

export interface CanvasStore {
  name: string;
  nodes: any[];
  edges: any[];
  isRunning: boolean;
  _abort: any;
  onNodesChange: (c: any) => void;
  onEdgesChange: (c: any) => void;
  onConnect: (c: any) => void;
  addNode: (type: any, position?: any) => void;
  removeNode: (id: string) => void;
  updateNodeData: (id: string, patch: any) => void;
  clearCanvas: () => void;
  exportWorkflow: () => any;
  importWorkflow: (data: any) => void;
  _upstreamOf: (id: string) => any[];
  runNode: (id: string) => Promise<void>;
  runWorkflow: () => Promise<void>;
}
