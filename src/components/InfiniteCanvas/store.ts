// 无限画布状态引擎（Zustand）
//
// 相比初版修掉的核心问题：
//  1) runWorkflow 原先按「节点创建顺序」跑，完全无视连线；现在按拓扑序（Kahn）跑，
//     上游先出结果、下游才拿得到输入。
//  2) runNode 原先只收「直接上游」的 text/image/video，多节点串联时数据断流；
//     现在递归收集所有祖先，且把上游生成节点 / 输出节点 / 分镜节点的结果都算作输入。
//  3) 新增撤销重做、复制粘贴、自动布局、自动保存、便签 / 分镜节点、生成结果自动回流素材库。
//
// 模型调用统一走 src/lib/providers，继承「设置 → 模型配置」里的 baseUrl / Key / 模型 / 工作流。

import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';
import { generateText, generateImage, generateVideo } from '../../lib/providers/index.js';
import { WORKFLOW_VERSION } from './types';

let _seq = 1;
const genId = (p: string) => `${p}_${Date.now().toString(36)}_${_seq++}`;
const randPos = () => ({ x: 120 + Math.random() * 320, y: 120 + Math.random() * 240 });

const STORAGE_PREFIX = 'jinsu.canvas.';
const MAX_HISTORY = 40;
let _storageKey = STORAGE_PREFIX + 'default';
let _persistTimer: any = null;

type Snapshot = { nodes: any[]; edges: any[] };

function readSaved(): { nodes: any[]; edges: any[]; name: string } | null {
  try {
    const raw = localStorage.getItem(_storageKey);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d && Array.isArray(d.nodes)) {
      return {
        nodes: d.nodes,
        edges: Array.isArray(d.edges) ? d.edges : [],
        name: d.name || '未命名画布',
      };
    }
  } catch { /* 存档损坏就当空画布 */ }
  return null;
}

function writeSaved(nodes: any[], edges: any[], name: string) {
  try {
    localStorage.setItem(_storageKey, JSON.stringify({
      version: WORKFLOW_VERSION, name, nodes, edges, savedAt: Date.now(),
    }));
  } catch { /* 超出配额等，静默 */ }
}

const snapOf = (s: any): Snapshot => ({
  nodes: s.nodes.map((n: any) => ({ ...n, data: { ...(n.data || {}) } })),
  edges: s.edges.map((e: any) => ({ ...e })),
});

const NODE_KINDS: Record<string, string> = {
  text: 'textNode', image: 'imageNode', video: 'videoNode',
  generate: 'generateNode', output: 'outputNode', note: 'noteNode', shot: 'shotNode',
};
const ALLOWED_KINDS = new Set(Object.values(NODE_KINDS));

/** Kahn 拓扑排序：返回节点 id 的执行顺序；有环时把剩余节点追加在末尾，避免死循环 */
function topoOrder(nodes: any[], edges: any[]): string[] {
  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);
  const indeg = new Map(ids.map((id) => [id, 0]));
  const children = new Map<string, string[]>();
  edges.forEach((e) => {
    if (!idSet.has(e.source) || !idSet.has(e.target)) return;
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1);
    children.set(e.source, [...(children.get(e.source) || []), e.target]);
  });
  const queue = ids.filter((id) => (indeg.get(id) || 0) === 0);
  const order: string[] = [];
  const visited = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    order.push(id);
    (children.get(id) || []).forEach((t) => indeg.set(t, (indeg.get(t) || 0) - 1));
    ids.forEach((nid) => {
      if (!visited.has(nid) && (indeg.get(nid) || 0) <= 0 && !queue.includes(nid)) queue.push(nid);
    });
  }
  ids.forEach((id) => { if (!visited.has(id)) order.push(id); });
  return order;
}

export const useCanvasStore = create<CanvasStore>((set, get) => {
  const persistSoon = () => {
    if (typeof window === 'undefined') return;
    clearTimeout(_persistTimer);
    _persistTimer = setTimeout(() => {
      const s = get();
      writeSaved(s.nodes, s.edges, s.name);
    }, 250);
  };

  /** 结构性变更统一入口：压入历史快照 + 持久化 */
  const commit = (patch: (s: any) => any) => {
    const s = get();
    set({
      past: [...s.past.slice(-(MAX_HISTORY - 1)), snapOf(s)],
      future: [],
      ...patch(s),
    });
    persistSoon();
  };

  return {
    name: '未命名画布',
    nodes: [],
    edges: [],
    isRunning: false,
    _abort: null,
    past: [],
    future: [],
    savedAt: null,
    runProgress: null,
    lastMessage: '',
    _resultSink: null,
    _shotSink: null,

    onNodesChange: (changes) => {
      const s = get();
      const patch: any = { nodes: applyNodeChanges(changes, s.nodes) };
      // 键盘 Delete / Backspace 触发的删除也要能撤销
      if (changes.some((c: any) => c.type === 'remove')) {
        patch.past = [...s.past.slice(-(MAX_HISTORY - 1)), snapOf(s)];
        patch.future = [];
      }
      set(patch);
      persistSoon();
    },

    onEdgesChange: (changes) => {
      const s = get();
      const patch: any = { edges: applyEdgeChanges(changes, s.edges) };
      if (changes.some((c: any) => c.type === 'remove')) {
        patch.past = [...s.past.slice(-(MAX_HISTORY - 1)), snapOf(s)];
        patch.future = [];
      }
      set(patch);
      persistSoon();
    },

    onConnect: (conn) => commit((s) => ({
      edges: addEdge(
        { ...conn, animated: true, style: { stroke: '#4facfe', strokeWidth: 2 } },
        s.edges
      ),
    })),

    addNode: (type, position, initialData) => {
      const id = genId(type);
      const base: any = { id, position: position || randPos(), data: {} };
      let node: any;
      switch (type) {
        case 'text': node = { ...base, type: 'textNode', data: { text: '', label: '文本' } }; break;
        case 'image': node = { ...base, type: 'imageNode', data: { url: '', label: '图片' } }; break;
        case 'video': node = { ...base, type: 'videoNode', data: { url: '', label: '视频' } }; break;
        case 'generate': node = {
          ...base, type: 'generateNode',
          data: { prompt: '', generateType: 'text-to-image', model: '', params: { resolution: '1024x1024' }, status: 'idle' },
        }; break;
        case 'output': node = { ...base, type: 'outputNode', data: { result: '', resultType: undefined } }; break;
        case 'note': node = { ...base, type: 'noteNode', data: { text: '在这里写备注…', label: '便签', color: '#fff7d6' } }; break;
        case 'shot': node = {
          ...base, type: 'shotNode',
          data: { shotIndex: 0, title: '分镜', firstFramePrompt: '', imageUrl: '' },
        }; break;
        default: node = { ...base, type: 'textNode', data: { text: '', label: '文本' } };
      }
      if (initialData && typeof initialData === 'object') node.data = { ...node.data, ...initialData };
      commit((s) => ({ nodes: [...s.nodes, node] }));
      return id;
    },

    removeNode: (id) => commit((s) => ({
      nodes: s.nodes.filter((n: any) => n.id !== id),
      edges: s.edges.filter((e: any) => e.source !== id && e.target !== id),
    })),

    deleteNodes: (ids) => {
      const kill = new Set(ids);
      if (!kill.size) return;
      commit((s) => ({
        nodes: s.nodes.filter((n: any) => !kill.has(n.id)),
        edges: s.edges.filter((e: any) => !kill.has(e.source) && !kill.has(e.target)),
      }));
    },

    duplicateNodes: (ids) => {
      const s = get();
      const picks = s.nodes.filter((n: any) => ids.includes(n.id));
      if (!picks.length) return [];
      const idMap = new Map<string, string>();
      const clones = picks.map((n: any) => {
        const nid = genId(n.type?.replace('Node', '') || 'node');
        idMap.set(n.id, nid);
        return {
          ...n, id: nid, selected: true,
          position: { x: n.position.x + 36, y: n.position.y + 36 },
          data: { ...(n.data || {}) },
        };
      });
      const innerEdges = s.edges
        .filter((e: any) => idMap.has(e.source) && idMap.has(e.target))
        .map((e: any) => ({
          ...e, id: genId('e'),
          source: idMap.get(e.source)!, target: idMap.get(e.target)!,
        }));
      commit((st) => ({
        nodes: [...st.nodes.map((n: any) => ({ ...n, selected: false })), ...clones],
        edges: [...st.edges, ...innerEdges],
      }));
      return clones.map((c) => c.id);
    },

    updateNodeData: (id, patch) => {
      set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) });
      persistSoon();
    },

    setName: (name) => { set({ name }); persistSoon(); },

    undo: () => {
      const s = get();
      if (!s.past.length) return;
      const prev = s.past[s.past.length - 1];
      set({
        nodes: prev.nodes, edges: prev.edges,
        past: s.past.slice(0, -1),
        future: [...s.future, snapOf(s)],
        lastMessage: '已撤销',
      });
      persistSoon();
    },

    redo: () => {
      const s = get();
      if (!s.future.length) return;
      const next = s.future[s.future.length - 1];
      set({
        nodes: next.nodes, edges: next.edges,
        future: s.future.slice(0, -1),
        past: [...s.past, snapOf(s)],
        lastMessage: '已重做',
      });
      persistSoon();
    },

    /** DAG 分层自动布局：按依赖深度分列，同层依次排开 */
    autoLayout: () => {
      const s = get();
      if (!s.nodes.length) return;
      const byId = new Map(s.nodes.map((n: any) => [n.id, n]));
      const indeg = new Map(s.nodes.map((n: any) => [n.id, 0]));
      const children = new Map<string, string[]>();
      s.edges.forEach((e: any) => {
        if (!byId.has(e.source) || !byId.has(e.target)) return;
        indeg.set(e.target, (indeg.get(e.target) || 0) + 1);
        children.set(e.source, [...(children.get(e.source) || []), e.target]);
      });
      const layers: string[][] = [];
      const visited = new Set<string>();
      let frontier = s.nodes.filter((n: any) => (indeg.get(n.id) || 0) === 0).map((n: any) => n.id);
      while (frontier.length) {
        layers.push(frontier);
        frontier.forEach((id) => visited.add(id));
        frontier.forEach((id) => (children.get(id) || []).forEach((t) => indeg.set(t, (indeg.get(t) || 0) - 1)));
        const next: string[] = [];
        s.nodes.forEach((n: any) => {
          if (!visited.has(n.id) && (indeg.get(n.id) || 0) <= 0 && !next.includes(n.id)) next.push(n.id);
        });
        frontier = next;
      }
      s.nodes.forEach((n: any) => {
        if (!visited.has(n.id)) {
          if (!layers.length) layers.push([]);
          layers[layers.length - 1].push(n.id);
        }
      });
      const pos = new Map<string, { x: number; y: number }>();
      layers.forEach((layer, li) => layer.forEach((id, ri) => pos.set(id, { x: 80 + li * 320, y: 80 + ri * 250 })));
      commit((st) => ({ nodes: st.nodes.map((n: any) => pos.has(n.id) ? { ...n, position: pos.get(n.id)! } : n) }));
    },

    /** 从项目分镜一键重建节点画布：每个分镜一个节点，按镜头顺序串成一条线 */
    buildFromShots: (shots) => {
      if (!Array.isArray(shots) || !shots.length) return 0;
      const nodes: any[] = [];
      const edges: any[] = [];
      shots.forEach((s: any, i: number) => {
        const id = genId('shot');
        nodes.push({
          id, type: 'shotNode',
          position: { x: 70 + i * 310, y: 110 + (i % 2) * 44 },
          data: {
            shotIndex: i,
            title: s?.title || `分镜 ${i + 1}`,
            description: s?.description || s?.content || '',
            firstFramePrompt: s?.firstFramePrompt || '',
            videoPrompt: s?.videoPrompt || '',
            imageUrl: s?.imageUrl || '',
            videoUrl: s?.videoUrl || '',
          },
        });
        if (i > 0) edges.push({
          id: genId('e'), source: nodes[i - 1].id, target: id,
          animated: true, style: { stroke: '#a18cd1', strokeWidth: 2 },
        });
      });
      commit(() => ({ nodes, edges, name: '分镜画布' }));
      return nodes.length;
    },

    clearCanvas: () => commit(() => ({ nodes: [], edges: [], name: '未命名画布' })),

    exportWorkflow: () => ({
      version: WORKFLOW_VERSION,
      name: get().name,
      nodes: get().nodes,
      edges: get().edges,
      exportedAt: new Date().toISOString(),
    }),

    /** 导入做严格白名单 + 字段兜底，坏 JSON 或旧格式不会把画布搞崩 */
    importWorkflow: (data) => {
      if (!data || !Array.isArray(data.nodes)) return false;
      const nodes = data.nodes
        .filter((n: any) => n && typeof n.id === 'string' && ALLOWED_KINDS.has(n.type))
        .map((n: any) => ({
          ...n,
          selected: false,
          position: n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y)
            ? n.position : randPos(),
          data: n.data && typeof n.data === 'object' ? n.data : {},
        }));
      const ids = new Set(nodes.map((n: any) => n.id));
      const edges = (Array.isArray(data.edges) ? data.edges : [])
        .filter((e: any) => e && ids.has(e.source) && ids.has(e.target))
        .map((e: any) => ({
          ...e, id: e.id || genId('e'), animated: true,
          style: { stroke: '#4facfe', strokeWidth: 2 },
        }));
      commit(() => ({ nodes, edges, name: data.name || '导入画布' }));
      set({ lastMessage: `已导入 ${nodes.length} 个节点` });
      return true;
    },

    setStorageKey: (title) => {
      const key = STORAGE_PREFIX + (title || 'default');
      if (key === _storageKey) return;
      _storageKey = key;
      const saved = readSaved();
      set(saved
        ? { nodes: saved.nodes, edges: saved.edges, name: saved.name, past: [], future: [], savedAt: Date.now() }
        : { nodes: [], edges: [], name: '未命名画布', past: [], future: [], savedAt: null });
    },

    saveNow: () => {
      const s = get();
      writeSaved(s.nodes, s.edges, s.name);
      set({ savedAt: Date.now(), lastMessage: '画布已保存' });
    },

    setResultSink: (fn) => set({ _resultSink: fn }),
    setShotSink: (fn) => set({ _shotSink: fn }),
    setMessage: (m) => set({ lastMessage: m }),

    /** 分镜节点：用该分镜的首帧提示词生成图片，并写回项目 shots[i].imageUrl */
    runShotFrame: async (id) => {
      const n: any = get().nodes.find((x) => x.id === id);
      if (!n || n.type !== 'shotNode') return;
      const d: any = n.data || {};
      get().updateNodeData(id, { status: 'running', error: undefined });
      try {
        const prompt = (d.firstFramePrompt || d.description || d.title || '').trim();
        const r = await generateImage(prompt, { size: '1024x1024' });
        get().updateNodeData(id, { imageUrl: r.resultUrl, status: 'success' });
        const sink = get()._shotSink;
        if (sink) sink(d.shotIndex, { imageUrl: r.resultUrl });
      } catch (err: any) {
        get().updateNodeData(id, { status: 'error', error: err?.message || String(err) });
      }
    },

    /** 递归收集某节点的所有祖先（不只是直接上游） */
    _ancestorsOf: (id) => {
      const { edges, nodes } = get();
      const byId = new Map(nodes.map((n: any) => [n.id, n]));
      const seen = new Set<string>();
      const out: any[] = [];
      const queue = edges.filter((e: any) => e.target === id).map((e: any) => e.source);
      while (queue.length) {
        const cur = queue.shift()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        const n = byId.get(cur);
        if (n) out.push(n);
        edges.filter((e: any) => e.target === cur).forEach((e: any) => queue.push(e.source));
      }
      return out;
    },

    runNode: async (id) => {
      const node: any = get().nodes.find((n) => n.id === id);
      if (!node || node.type !== 'generateNode') return;
      const data = { ...node.data };
      get().updateNodeData(id, { status: 'running', error: undefined });
      try {
        const up = get()._ancestorsOf(id);
        const textParts: string[] = [];
        const images: string[] = [];
        const videos: string[] = [];
        up.forEach((n: any) => {
          const d: any = n.data || {};
          if (n.type === 'textNode' || n.type === 'noteNode') {
            if (d.text) textParts.push(d.text);
          } else if (n.type === 'shotNode') {
            const p = d.firstFramePrompt || d.videoPrompt || d.description;
            if (p) textParts.push(p);
            if (d.imageUrl) images.push(d.imageUrl);
            if (d.videoUrl) videos.push(d.videoUrl);
          } else if (n.type === 'imageNode') {
            if (d.url) images.push(d.url);
          } else if (n.type === 'videoNode') {
            if (d.url) videos.push(d.url);
          } else if (n.type === 'generateNode' || n.type === 'outputNode') {
            if (d.result) {
              if (d.resultType === 'image') images.push(d.result);
              else if (d.resultType === 'video') videos.push(d.result);
              else textParts.push(d.result);
            }
          }
        });
        const prompt = (data.prompt || textParts.join('\n') || '').trim();
        const type = data.generateType;
        let resultUrl = '';
        let resultType: 'text' | 'image' | 'video' | undefined;

        if (type === 'text-to-image' || type === 'image-to-image') {
          const r = await generateImage(prompt, {
            referenceImage: images[0] || videos[0] || '',
            size: data.params?.resolution || '1024x1024',
          });
          resultUrl = r.resultUrl; resultType = 'image';
        } else if (type === 'text-to-video' || type === 'image-to-video') {
          const r = await generateVideo({
            prompt,
            first_frame: images[0] || videos[0] || '',
            seconds: data.params?.duration || '5',
            aspect_ratio: data.params?.ratio || '9:16',
            mode: type === 'image-to-video' ? 'keyframe' : 'text',
          });
          resultUrl = r.resultUrl; resultType = 'video';
        } else if (type === 'text-to-text') {
          const r: any = await generateText([{ role: 'user', content: prompt || '你好' }]);
          resultUrl = typeof r === 'string' ? r : String(r); resultType = 'text';
        } else {
          throw new Error('未知的生成类型：' + type);
        }

        get().updateNodeData(id, { status: 'success', result: resultUrl, resultType });
        // 结果推给所有直接下游的输出节点
        get().edges.filter((e: any) => e.source === id).forEach((e: any) => {
          get().updateNodeData(e.target, { result: resultUrl, resultType });
        });
        // 自动回流主程序素材库（走 project setter → 自动存盘），不用手点「存入素材库」
        const sink = get()._resultSink;
        if (sink && resultUrl && resultType !== 'text') {
          try {
            sink({
              id: 'a_canvas_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
              type: resultType,
              title: `画布生成·${type}·${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
              url: resultUrl, status: 'ready',
              tags: ['画布生成', type], favorite: false, createdAt: Date.now(),
            });
          } catch { /* 回流失败不影响生成结果 */ }
        }
      } catch (err: any) {
        get().updateNodeData(id, { status: 'error', error: err?.message || String(err) });
      }
    },

    runWorkflow: async () => {
      if (get().isRunning) return;
      const gens = topoOrder(get().nodes, get().edges)
        .filter((id) => get().nodes.find((n: any) => n.id === id)?.type === 'generateNode');
      if (!gens.length) { set({ lastMessage: '画布里还没有 AI 生成节点' }); return; }
      const ctrl = new AbortController();
      set({ isRunning: true, _abort: ctrl, runProgress: { done: 0, total: gens.length, label: '' } });
      try {
        for (let i = 0; i < gens.length; i++) {
          if (ctrl.signal.aborted) break;
          const n: any = get().nodes.find((x: any) => x.id === gens[i]);
          set({ runProgress: { done: i, total: gens.length, label: n?.data?.label || n?.data?.generateType || `节点 ${i + 1}` } });
          await get().runNode(gens[i]);
        }
        set({ runProgress: { done: gens.length, total: gens.length, label: '完成' }, lastMessage: `已运行 ${gens.length} 个生成节点` });
      } finally {
        set({ isRunning: false, _abort: null });
      }
    },

    cancelRun: () => {
      const c = get()._abort;
      if (c) { c.abort(); set({ lastMessage: '已停止运行' }); }
    },
  };
});

export interface CanvasStore {
  name: string;
  nodes: any[];
  edges: any[];
  isRunning: boolean;
  _abort: any;
  past: Snapshot[];
  future: Snapshot[];
  savedAt: number | null;
  runProgress: { done: number; total: number; label: string } | null;
  lastMessage: string;
  _resultSink: ((asset: any) => void) | null;
  _shotSink: ((index: number, patch: any) => void) | null;
  onNodesChange: (c: any) => void;
  onEdgesChange: (c: any) => void;
  onConnect: (c: any) => void;
  addNode: (type: any, position?: any, initialData?: any) => string;
  removeNode: (id: string) => void;
  deleteNodes: (ids: string[]) => void;
  duplicateNodes: (ids: string[]) => string[];
  updateNodeData: (id: string, patch: any) => void;
  setName: (name: string) => void;
  undo: () => void;
  redo: () => void;
  autoLayout: () => void;
  buildFromShots: (shots: any[]) => number;
  clearCanvas: () => void;
  exportWorkflow: () => any;
  importWorkflow: (data: any) => boolean;
  setStorageKey: (title?: string) => void;
  saveNow: () => void;
  setResultSink: (fn: ((asset: any) => void) | null) => void;
  setShotSink: (fn: ((index: number, patch: any) => void) | null) => void;
  setMessage: (m: string) => void;
  runShotFrame: (id: string) => Promise<void>;
  _ancestorsOf: (id: string) => any[];
  runNode: (id: string) => Promise<void>;
  runWorkflow: () => Promise<void>;
  cancelRun: () => void;
}
