import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { saveBlob } from '../../utils.js';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Play, Plus, Trash2, Download, Upload } from '../../lib/icons';
import { useCanvasStore } from './store';
import { nodeTypes } from './nodes';
import { NODE_DEFS, MODELS, NodeType, nodeDef } from './types';
import { useCanvasBridge } from './bridge';

const TB = (bg = '#fff', fg = '#334155', disabled = false): React.CSSProperties => ({
  padding: '5px 9px', background: bg, border: '1px solid #dde4f0', borderRadius: 6,
  color: fg, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600,
  display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
  opacity: disabled ? 0.45 : 1, lineHeight: 1.4,
});
const GRAD = (a: string, b: string): React.CSSProperties => ({ ...TB('#fff'), background: `linear-gradient(135deg,${a},${b})`, color: '#fff', border: 'none' });

function CanvasContent() {
  const {
    nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode,
    runWorkflow, cancelRun, isRunning, runProgress,
    clearCanvas, exportWorkflow, importWorkflow,
    undo, redo, past, future, autoLayout, buildFromShots,
    saveNow, setStorageKey, setResultSink, setShotSink,
    duplicateNodes, deleteNodes, name, lastMessage, setMessage, savedAt,
  } = useCanvasStore();

  const { assets, projectTitle, onSaveAsset, shots, onUpdateShot } = useCanvasBridge();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [assetGroup, setAssetGroup] = useState<string>('全部');
  const [showCommand, setShowCommand] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandIndex, setCommandIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  // 节点库默认收起：展开态宽 152px 会盖住 fitView 后靠左的节点标题。
  // 工具栏已有「添加节点」下拉覆盖点击添加，拖拽是进阶用法，点开即用。
  const [showNodePanel, setShowNodePanel] = useState(false);

  // 用 ref 转接回调，避免 Studio 每次 render 传来的内联函数导致
  // 「setResultSink → store 更新 → 重渲染 → 新函数 → 再 setResultSink」死循环
  const saveRef = useRef(onSaveAsset);
  saveRef.current = onSaveAsset;
  const shotRef = useRef(onUpdateShot);
  shotRef.current = onUpdateShot;

  useEffect(() => { setStorageKey(projectTitle); }, [projectTitle]);
  useEffect(() => { setResultSink((a) => saveRef.current?.(a)); }, []);
  useEffect(() => { setShotSink((i, p) => shotRef.current?.(i, p)); }, []);

  const assetList = assets || [];
  const assetGroups = Array.from(new Set(assetList.map((a: any) => a?.group || '素材')));
  const activeGroup = assetGroup !== '全部' && assetGroups.includes(assetGroup) ? assetGroup : '全部';
  const shownAssets = activeGroup === '全部'
    ? assetList
    : assetList.filter((a: any) => (a?.group || '素材') === activeGroup);

  const filteredDefs = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    if (!q) return NODE_DEFS;
    return NODE_DEFS.filter((d) =>
      `${d.label} ${d.desc} ${d.keywords || ''} ${d.type}`.toLowerCase().includes(q));
  }, [commandQuery]);

  // ── 快捷键 ──────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'k') { e.preventDefault(); setShowCommand((v) => !v); return; }
      if (mod && k === 's') { e.preventDefault(); saveNow(); return; }
      if (e.key === 'Escape') {
        setShowCommand(false); setShowAddMenu(false); setShowAssetPicker(false); setShowHelp(false);
        return;
      }
      if (typing) return;
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); redo(); return; }
      if (mod && k === 'd') {
        e.preventDefault();
        const ids = nodes.filter((n: any) => n.selected).map((n: any) => n.id);
        if (ids.length) { duplicateNodes(ids); setMessage(`已复制 ${ids.length} 个节点`); }
        return;
      }
      if (mod && k === 'a') {
        e.preventDefault();
        useCanvasStore.setState({ nodes: nodes.map((n: any) => ({ ...n, selected: true })) });
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const ids = nodes.filter((n: any) => n.selected).map((n: any) => n.id);
        if (ids.length) { e.preventDefault(); deleteNodes(ids); setMessage(`已删除 ${ids.length} 个节点`); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nodes, saveNow, undo, redo, duplicateNodes, deleteNodes, setMessage]);

  const notify = (m: string) => setMessage(m);

  const fitSoon = () => window.setTimeout(() => { try { fitView({ padding: 0.2, duration: 450 }); } catch { /* 画布未就绪 */ } }, 90);

  const handleAddNode = (type: NodeType, pos?: { x: number; y: number }) => {
    addNode(type, pos);
    setShowAddMenu(false);
    notify(`已添加「${nodeDef(type).label}」`);
  };

  const addFromCommand = (type: NodeType) => {
    addNode(type);
    setShowCommand(false);
    setCommandQuery('');
    setCommandIndex(0);
    notify(`已添加「${nodeDef(type).label}」`);
  };

  const handleBuildFromShots = () => {
    if (!Array.isArray(shots) || !shots.length) {
      notify('当前项目还没有分镜，请先在「03 分镜」生成');
      return;
    }
    if (nodes.length && !window.confirm(`将用 ${shots.length} 个分镜重建画布，当前 ${nodes.length} 个节点会被替换。继续？`)) return;
    const n = buildFromShots(shots);
    notify(`已按 ${n} 个分镜重建画布，点节点上的按钮可直接生成首帧并写回分镜`);
    fitSoon();
  };

  const handleAutoLayout = () => { autoLayout(); notify('已按连线依赖自动布局'); fitSoon(); };

  // 从项目素材 / 分镜提示词导入
  const importAssetAsNode = (asset: any, index = 0) => {
    const pos = { x: 80 + (index % 4) * 320, y: 80 + Math.floor(index / 4) * 340 };
    if (asset?.type === 'prompt') {
      const ptext = (asset?.promptText || '').trim();
      if (!ptext) return;
      const isVideoPrompt = asset?.promptKind === 'video';
      const generateType = isVideoPrompt ? 'text-to-video' : 'text-to-image';
      addNode('generate', pos, {
        prompt: ptext, generateType,
        model: MODELS[generateType]?.[0] || '',
        params: isVideoPrompt ? { ratio: '9:16', duration: 5 } : { resolution: '1024x1024' },
        label: asset?.title || (isVideoPrompt ? '视频提示词' : '首帧提示词'),
      });
      setShowAssetPicker(false);
      notify(`已导入「${asset?.title || '提示词'}」为生成节点`);
      return;
    }
    const isVideo = asset?.type === 'video' || /\.(mp4|webm|mov|m3u8|mkv)(\?|#|$)/i.test(asset?.url || asset?.imageUrl || '');
    const url = asset?.url || asset?.imageUrl || '';
    if (!url) return;
    addNode(isVideo ? 'video' : 'image', pos, { url, label: asset?.title || (isVideo ? '视频' : '图片') });
    setShowAssetPicker(false);
    notify(`已导入「${asset?.title || '素材'}」`);
  };

  const handleImportLocal = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach((file, i) => {
      const url = URL.createObjectURL(file);
      addNode(file.type.startsWith('video/') ? 'video' : 'image',
        { x: 80 + (i % 4) * 320, y: 80 + Math.floor(i / 4) * 340 },
        { url, label: file.name });
    });
    setShowAssetPicker(false);
    if (mediaInputRef.current) mediaInputRef.current.value = '';
    notify('已从本地导入素材');
  };

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('nodeType') as NodeType;
    if (type) {
      addNode(type, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
      notify(`已添加「${nodeDef(type).label}」`);
    }
  }, [screenToFlowPosition, addNode]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);

  const handleExport = () => {
    const data = exportWorkflow();
    saveBlob(`${name || 'workflow'}.json`, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    notify('工作流已导出为 JSON');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const ok = importWorkflow(JSON.parse(ev.target?.result as string));
        notify(ok ? '工作流已导入' : '导入失败：文件里没有有效节点');
      } catch { notify('导入失败：JSON 格式错误'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const miniMapColor = (node: any) => nodeDef(
    ({ textNode: 'text', imageNode: 'image', videoNode: 'video', generateNode: 'generate', outputNode: 'output', noteNode: 'note', shotNode: 'shot' } as any)[node.type] || 'text'
  ).color;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#f6f8fc', fontFamily: 'inherit' }}>
      {/* 顶部工具栏 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 50,
        background: 'rgba(255,255,255,.96)', borderBottom: '1px solid #dde4f0',
        display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6, zIndex: 10,
        boxShadow: '0 1px 6px rgba(28,44,80,.05)', overflowX: 'auto',
      }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: '#1f2937', marginRight: 4, whiteSpace: 'nowrap' }}>🎨 无限画布</div>
        <div style={{ fontSize: 10, color: '#94a3b8', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>
          {name}
        </div>

        <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />

        {/* 添加节点 */}
        <div style={{ position: 'relative' }}>
          <button style={GRAD('#4facfe', '#0284c7')} onClick={() => setShowAddMenu(!showAddMenu)}>
            <Plus size={12} /> 添加节点
          </button>
          {showAddMenu && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 6, width: 220,
              background: '#fff', border: '1px solid #dde4f0', borderRadius: 10, padding: 5,
              boxShadow: '0 12px 32px rgba(28,44,80,.16)', zIndex: 100,
            }}>
              {NODE_DEFS.map((d) => (
                <button key={d.type} onClick={() => handleAddNode(d.type)} style={{
                  width: '100%', padding: '7px 8px', background: 'none', border: 'none',
                  borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontSize: 15 }}>{d.icon}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#1f2937' }}>{d.label}</span>
                    <span style={{ display: 'block', fontSize: 10, color: '#94a3b8' }}>{d.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button title="撤销 (Ctrl+Z)" style={TB()} disabled={!past.length} onClick={undo}>↶ 撤销</button>
        <button title="重做 (Ctrl+Shift+Z)" style={TB()} disabled={!future.length} onClick={redo}>↷ 重做</button>
        <button title="按连线依赖自动排布" style={TB()} onClick={handleAutoLayout}>✧ 自动布局</button>
        <button title="把项目分镜一键搬进画布" style={TB('#f5f3ff', '#6d28d9')} onClick={handleBuildFromShots}>🎞️ 从分镜生成</button>

        {/* 素材库导入 */}
        <div style={{ position: 'relative' }}>
          <button style={TB('#fdf4ff', '#a21caf')} onClick={() => setShowAssetPicker(!showAssetPicker)}
            title={assetList.length ? `从项目素材 / 分镜提示词导入（${assetList.length} 项）` : '项目暂无素材，可在面板内本地导入'}>
            <Download size={12} style={{ transform: 'rotate(180deg)' }} /> 素材库
            <span style={{ background: 'rgba(139,92,246,.14)', borderRadius: 8, padding: '0 5px', fontSize: 10 }}>{assetList.length}</span>
          </button>
          {showAssetPicker && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 340,
              background: '#fff', border: '1px solid #dde4f0', borderRadius: 10,
              boxShadow: '0 12px 32px rgba(28,44,80,.16)', zIndex: 100, overflow: 'hidden',
            }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #eef2fb', display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1f2937' }}>项目素材</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{projectTitle ? `${projectTitle} · ` : ''}{assetList.length} 项</div>
                <div style={{ flex: 1 }} />
                <button style={TB()} onClick={() => mediaInputRef.current?.click()}>本地导入</button>
              </div>
              {assetList.length === 0 ? (
                <div style={{ padding: '22px 18px', textAlign: 'center' }}>
                  <div style={{ fontSize: 26 }}>🗂️</div>
                  <div style={{ fontSize: 12, color: '#1f2937', fontWeight: 700, marginTop: 6 }}>项目里还没有图 / 视频素材</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, lineHeight: 1.7 }}>
                    素材来自「资产」里生成的角色 / 场景 / 道具图，<br />以及「分镜」里的首帧图与视频。
                  </div>
                  <button style={{ ...GRAD('#a18cd1', '#fbc2eb'), marginTop: 12, display: 'inline-flex' }} onClick={() => mediaInputRef.current?.click()}>
                    从本地选择图片 / 视频
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 4, padding: '8px 10px', flexWrap: 'wrap', borderBottom: '1px solid #f3f6fc' }}>
                    {['全部', ...assetGroups].map((g) => {
                      const on = activeGroup === g;
                      const count = g === '全部' ? assetList.length : assetList.filter((a: any) => (a?.group || '素材') === g).length;
                      return (
                        <button key={g} onClick={() => setAssetGroup(g)} style={{
                          padding: '2px 8px', borderRadius: 10,
                          border: '1px solid ' + (on ? '#a18cd1' : '#e3e9f5'),
                          background: on ? '#f3eefc' : '#fff', color: on ? '#6b46c1' : '#64748b',
                          fontSize: 10, cursor: 'pointer',
                        }}>{g} {count}</button>
                      );
                    })}
                  </div>
                  <div style={{ maxHeight: 300, overflowY: 'auto', padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {shownAssets.map((a: any, i: number) => {
                      const url = a?.url || a?.imageUrl || '';
                      const title = a?.title || `素材 ${i + 1}`;
                      const isPrompt = a?.type === 'prompt';
                      const isVideo = !isPrompt && (a?.type === 'video' || /\.(mp4|webm|mov|m3u8|mkv)(\?|#|$)/i.test(url));
                      return (
                        <button key={a?.id || i} onClick={() => importAssetAsNode(a, i)} title={title}
                          style={{ background: 'none', border: '1px solid #dde4f0', borderRadius: 6, padding: 4, cursor: 'pointer', textAlign: 'left' }}>
                          <div style={{ width: '100%', height: 66, borderRadius: 4, overflow: 'hidden', background: isPrompt ? '#fff7e0' : '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {isPrompt
                              ? <div style={{ fontSize: 10, color: '#78350f', padding: 6, lineHeight: 1.4, maxHeight: 60, overflow: 'hidden', alignSelf: 'flex-start' }}>
                                  {a?.promptKind === 'video' ? '🎬 ' : '📝 '}{(a?.promptText || '').slice(0, 58)}
                                </div>
                              : url
                                ? isVideo
                                  ? <video src={url} muted preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  : <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <span style={{ color: '#94a3b8', fontSize: 20 }}>🖼️</span>}
                          </div>
                          <div style={{ fontSize: 10, color: '#475569', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {isPrompt ? '✏️ ' : isVideo ? '🎬 ' : '🖼️ '}{title}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ padding: '6px 12px', borderTop: '1px solid #f3f6fc', fontSize: 10, color: '#94a3b8' }}>点击任意素材即在画布生成对应节点</div>
                </>
              )}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <button title="命令面板 (Ctrl+K)" style={TB()} onClick={() => setShowCommand(true)}>⌘K</button>
        <button title="快捷键说明" style={TB()} onClick={() => setShowHelp(true)}>❔</button>
        {isRunning
          ? <button style={GRAD('#ef4444', '#b91c1c')} onClick={cancelRun}>⏹ 停止 {runProgress ? `(${runProgress.done}/${runProgress.total})` : ''}</button>
          : <button style={GRAD('#51cf66', '#16a34a')} onClick={runWorkflow}><Play size={12} /> 运行全部</button>}
        <button title="保存到浏览器 (Ctrl+S)" style={TB()} onClick={() => { saveNow(); notify('画布已保存'); }}>💾</button>
        <button title="导出工作流 JSON" style={TB()} onClick={handleExport}><Download size={12} /></button>
        <button title="导入工作流 JSON" style={TB()} onClick={() => fileInputRef.current?.click()}><Upload size={12} /></button>
        <button title="清空画布" style={{ ...TB(), color: '#ef4444' }} onClick={() => { if (window.confirm('确定清空画布吗？')) { clearCanvas(); notify('画布已清空'); } }}><Trash2 size={12} /></button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
        <input ref={mediaInputRef} type="file" accept="image/*,video/*" multiple onChange={handleImportLocal} style={{ display: 'none' }} />
      </div>

      {/* 左侧节点库：可折叠，默认收起以免遮挡靠左的节点；展开后可拖拽到画布 */}
      {showNodePanel ? (
        <div style={{
          position: 'absolute', top: 62, left: 12, width: 152,
          background: 'rgba(255,255,255,.97)', border: '1px solid #dde4f0', borderRadius: 10,
          padding: 8, zIndex: 5, boxShadow: '0 8px 22px rgba(28,44,80,.14)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, flex: 1 }}>拖拽或点击添加节点</div>
            <button onClick={() => setShowNodePanel(false)} title="收起节点库"
              style={{ ...TB(), padding: '1px 6px', fontSize: 12 }}>«</button>
          </div>
          {NODE_DEFS.map((d) => (
            <div key={d.type} draggable
              onDragStart={(e) => e.dataTransfer.setData('nodeType', d.type)}
              onClick={() => handleAddNode(d.type)}
              title={d.desc}
              style={{
                padding: '7px 8px', background: '#fff', border: '1px solid #e6ecf8',
                borderLeft: `3px solid ${d.color}`, borderRadius: 6, marginBottom: 5,
                cursor: 'grab', fontSize: 11, color: '#334155', display: 'flex', alignItems: 'center', gap: 6,
              }}>
              <span style={{ fontSize: 13 }}>{d.icon}</span>{d.label}
            </div>
          ))}
          <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 6, lineHeight: 1.5 }}>Shift 拖拽框选 · Ctrl+K 快速添加</div>
        </div>
      ) : (
        <button onClick={() => setShowNodePanel(true)} title="展开节点库（可拖拽到画布）"
          style={{
            position: 'absolute', top: 62, left: 12, width: 34, zIndex: 5,
            background: 'rgba(255,255,255,.97)', border: '1px solid #dde4f0', borderRadius: 8,
            padding: '9px 6px', boxShadow: '0 4px 14px rgba(28,44,80,.10)', cursor: 'pointer',
            color: '#475569', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
          <span style={{ fontSize: 14, lineHeight: 1 }}>☰</span>
          <span style={{ writingMode: 'vertical-rl' as any, letterSpacing: 2, fontSize: 10, fontWeight: 700 }}>节点库</span>
        </button>
      )}

      {/* 画布 */}
      <div style={{ position: 'absolute', top: 50, left: 0, right: 0, bottom: 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          nodeTypes={nodeTypes}
          fitView
          colorMode="light"
          minZoom={0.2}
          maxZoom={2.5}
          defaultEdgeOptions={{ animated: true, style: { stroke: '#4facfe', strokeWidth: 2 } }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant="dots" gap={20} size={1} color="#cbd5e1" />
          <Controls showInteractive={false} style={{ background: '#fff', border: '1px solid #dde4f0', borderRadius: 8, boxShadow: '0 4px 14px rgba(28,44,80,.08)' }} />
          <MiniMap
            pannable zoomable
            style={{ background: '#fff', border: '1px solid #dde4f0', borderRadius: 8 }}
            nodeColor={miniMapColor}
            maskColor="rgba(15,23,42,.10)"
          />
        </ReactFlow>

        {/* 空画布引导 */}
        {nodes.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 4 }}>
            <div style={{
              pointerEvents: 'auto', background: '#fff', border: '1px solid #dde4f0', borderRadius: 14,
              padding: '26px 30px', textAlign: 'center', boxShadow: '0 16px 44px rgba(28,44,80,.14)', maxWidth: 380,
            }}>
              <div style={{ fontSize: 34 }}>🎨</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#1f2937', marginTop: 8 }}>画布还是空的</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, lineHeight: 1.7 }}>
                拖左侧节点到画布，或按 Ctrl+K 搜索添加。<br />也可以直接把项目分镜搬进来，按镜头顺序可视化整场戏。
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                <button style={GRAD('#4facfe', '#0284c7')} onClick={() => setShowCommand(true)}>➕ 添加第一个节点</button>
                <button style={TB('#f5f3ff', '#6d28d9')} onClick={handleBuildFromShots}>🎞️ 从项目分镜生成</button>
                <button style={TB()} onClick={() => fileInputRef.current?.click()}>📥 导入工作流</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      <div style={{
        position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(15,23,42,.86)', padding: '5px 12px', borderRadius: 20,
        fontSize: 10.5, color: '#e2e8f0', zIndex: 5, display: 'flex', alignItems: 'center', gap: 10,
        maxWidth: '92%', whiteSpace: 'nowrap', overflow: 'hidden',
      }}>
        <span>节点 <b style={{ color: '#7dd3fc' }}>{nodes.length}</b> · 连线 <b style={{ color: '#7dd3fc' }}>{edges.length}</b></span>
        {isRunning && runProgress && <span style={{ color: '#fde68a' }}>▶ {runProgress.done}/{runProgress.total} {runProgress.label}</span>}
        {savedAt && <span style={{ color: '#94a3b8' }}>已自动保存</span>}
        {lastMessage && <span style={{ color: '#86efac', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis' }}>{lastMessage}</span>}
        <span style={{ color: '#64748b' }}>Ctrl+K 添加节点 · ❔ 快捷键</span>
      </div>

      {/* 命令面板 */}
      {showCommand && (
        <div onClick={() => setShowCommand(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.28)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 90 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: '90%', background: '#fff', borderRadius: 12, boxShadow: '0 24px 64px rgba(15,23,42,.28)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #eef2f8' }}>
              <input
                autoFocus value={commandQuery}
                onChange={(e) => { setCommandQuery(e.target.value); setCommandIndex(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setCommandIndex((i) => Math.min(filteredDefs.length - 1, i + 1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setCommandIndex((i) => Math.max(0, i - 1)); }
                  else if (e.key === 'Enter') { e.preventDefault(); if (filteredDefs[commandIndex]) addFromCommand(filteredDefs[commandIndex].type); }
                  else if (e.key === 'Escape') setShowCommand(false);
                }}
                placeholder="搜索节点类型，回车添加…"
                style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', fontSize: 14, color: '#1f2937', padding: '4px 2px' }}
              />
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto', padding: 6 }}>
              {filteredDefs.length === 0 && <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>没有匹配的节点类型</div>}
              {filteredDefs.map((d, i) => (
                <button key={d.type} onClick={() => addFromCommand(d.type)}
                  onMouseEnter={() => setCommandIndex(i)}
                  style={{
                    width: '100%', padding: '9px 10px', border: 'none', borderRadius: 8, cursor: 'pointer',
                    background: i === commandIndex ? '#eff6ff' : 'transparent',
                    display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  }}>
                  <span style={{ fontSize: 18 }}>{d.icon}</span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#1f2937' }}>{d.label}</span>
                    <span style={{ display: 'block', fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{d.desc}</span>
                  </span>
                  {i === commandIndex && <kbd style={{ fontSize: 10, color: '#94a3b8', border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 5px' }}>↵</kbd>}
                </button>
              ))}
            </div>
            <div style={{ padding: '7px 12px', borderTop: '1px solid #eef2f8', fontSize: 10, color: '#94a3b8' }}>↑↓ 选择 · ↵ 添加 · Esc 关闭</div>
          </div>
        </div>
      )}

      {/* 快捷键说明 */}
      {showHelp && (
        <div onClick={() => setShowHelp(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.28)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 380, background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 24px 64px rgba(15,23,42,.28)' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1f2937', marginBottom: 12 }}>⌨️ 画布快捷键</div>
            {[
              ['Ctrl / ⌘ + K', '打开命令面板，搜索添加节点'],
              ['Ctrl / ⌘ + Z', '撤销'],
              ['Ctrl / ⌘ + Shift + Z', '重做'],
              ['Ctrl / ⌘ + D', '复制选中节点'],
              ['Ctrl / ⌘ + A', '全选节点'],
              ['Ctrl / ⌘ + S', '保存画布'],
              ['Delete / Backspace', '删除选中节点'],
              ['Shift + 拖拽', '框选多个节点'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', borderBottom: '1px solid #f1f5f9', fontSize: 11 }}>
                <kbd style={{ color: '#1f2937', fontWeight: 700 }}>{k}</kbd>
                <span style={{ color: '#64748b' }}>{v}</span>
              </div>
            ))}
            <button style={{ ...GRAD('#4facfe', '#0284c7'), marginTop: 14, width: '100%', justifyContent: 'center' }} onClick={() => setShowHelp(false)}>知道了</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function InfiniteCanvasInner() {
  return (
    <ReactFlowProvider>
      <CanvasContent />
    </ReactFlowProvider>
  );
}
