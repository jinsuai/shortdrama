import { useCallback, useRef, useState } from 'react';
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
import {
  Play,
  Plus,
  Trash2,
  Download,
  Upload,
  Type,
  Image as ImageIcon,
  Film,
  Settings,
  CheckSquare,
  ZoomIn,
  ZoomOut,
  Maximize,
} from '../../lib/icons';
import { useCanvasStore } from './store';
import { nodeTypes } from './nodes';
import { NodeType } from './types';
import { useCanvasBridge } from './bridge';

function CanvasContent() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    runWorkflow,
    isRunning,
    clearCanvas,
    exportWorkflow,
    importWorkflow,
  } = useCanvasStore();

  const { assets, projectTitle } = useCanvasBridge();
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [assetGroup, setAssetGroup] = useState<string>('全部');

  const assetList = assets || [];
  const assetGroups = Array.from(new Set(assetList.map((a: any) => a?.group || '素材')));
  const activeGroup = assetGroup !== '全部' && assetGroups.includes(assetGroup) ? assetGroup : '全部';
  const shownAssets = activeGroup === '全部'
    ? assetList
    : assetList.filter((a: any) => (a?.group || '素材') === activeGroup);

  // 从项目素材库导入：把图/视频生成为对应节点（位置按序号错开，避免叠在一起）
  const importAssetAsNode = (asset: any, index = 0) => {
    const isVideo =
      asset?.type === 'video' ||
      /\.(mp4|webm|mov|m3u8|mkv)(\?|#|$)/i.test(asset?.url || asset?.imageUrl || '');
    const url = asset?.url || asset?.imageUrl || '';
    if (!url) return;
    const col = index % 4;
    const row = Math.floor(index / 4);
    addNode(isVideo ? 'video' : 'image', { x: 80 + col * 320, y: 80 + row * 340 }, {
      url,
      label: asset?.title || (isVideo ? '视频' : '图片'),
    });
    setShowAssetPicker(false);
  };

  // 从本地文件导入图/视频为节点（素材库为空时的兜底路径）
  const handleImportLocal = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file, i) => {
      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video/');
      addNode(isVideo ? 'video' : 'image', { x: 80 + (i % 4) * 320, y: 80 + Math.floor(i / 4) * 340 }, {
        url,
        label: file.name,
      });
    });
    setShowAssetPicker(false);
    if (mediaInputRef.current) mediaInputRef.current.value = '';
  };

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('nodeType') as NodeType;
      if (type) {
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        addNode(type, position);
      }
    },
    [screenToFlowPosition, addNode]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  const handleAddNode = (type: NodeType) => {
    addNode(type, { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 });
    setShowAddMenu(false);
  };

  const handleExport = () => {
    const data = exportWorkflow();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    void saveBlob('workflow.json', blob);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          importWorkflow(data);
        } catch (err) {
          alert('导入失败：文件格式错误');
        }
      };
      reader.readAsText(file);
    }
  };

  const addNodeItems = [
    { type: 'text' as NodeType, label: '文本节点', icon: Type, color: '#4facfe' },
    { type: 'image' as NodeType, label: '图片节点', icon: ImageIcon, color: '#f093fb' },
    { type: 'video' as NodeType, label: '视频节点', icon: Film, color: '#667eea' },
    { type: 'generate' as NodeType, label: 'AI生成节点', icon: Settings, color: '#fa709a' },
    { type: 'output' as NodeType, label: '输出节点', icon: CheckSquare, color: '#51cf66' },
  ];

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#f6f8fc' }}>
      {/* 顶部工具栏 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '48px',
          background: 'rgba(255,255,255, 0.95)',
          borderBottom: '1px solid #dde4f0',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: '8px',
          zIndex: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '14px', color: '#fff', marginRight: '16px' }}>
          🎨 无限画布
        </div>

        {/* 添加节点按钮 */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            style={{
              padding: '6px 12px',
              background: 'linear-gradient(135deg, #4facfe, #00f2fe)',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Plus size={14} /> 添加节点
          </button>
          {showAddMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '4px',
                background: '#e6ecf8',
                border: '1px solid #dde4f0',
                borderRadius: '8px',
                padding: '4px',
                minWidth: '160px',
                zIndex: 100,
              }}
            >
              {addNodeItems.map((item) => (
                <button
                  key={item.type}
                  onClick={() => handleAddNode(item.type)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: 'none',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#dbe3f2')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <item.icon size={14} color={item.color} />
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* 从素材库导入：按钮始终可点，素材为空时在面板里给出说明 + 本地导入兜底 */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowAssetPicker(!showAssetPicker)}
            style={{
              padding: '6px 12px',
              background: 'linear-gradient(135deg, #a18cd1, #fbc2eb)',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title={
              assetList.length
                ? `从项目素材导入（${assetList.length} 项）`
                : '项目暂无素材，可在面板内改为从本地导入'
            }
          >
            <Download size={14} style={{ transform: 'rotate(180deg)' }} /> 从素材库导入
            <span
              style={{
                background: 'rgba(255,255,255,.28)',
                borderRadius: '8px',
                padding: '0 5px',
                fontSize: '10px',
                lineHeight: '14px',
              }}
            >
              {assetList.length}
            </span>
          </button>
          {showAssetPicker && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '6px',
                width: '340px',
                background: '#fff',
                border: '1px solid #dde4f0',
                borderRadius: '10px',
                boxShadow: '0 12px 32px rgba(28,44,80,.14)',
                zIndex: 100,
                overflow: 'hidden',
              }}
            >
              {/* 头部：来源 + 本地导入兜底 */}
              <div
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid #eef2fb',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#2b3a5b' }}>项目素材</div>
                <div style={{ fontSize: '11px', color: '#8a94ab' }}>
                  {projectTitle ? `${projectTitle} · ` : ''}
                  {assetList.length} 项
                </div>
                <div style={{ flex: 1 }} />
                <button
                  onClick={() => mediaInputRef.current?.click()}
                  style={{
                    padding: '3px 8px',
                    background: '#eef2fb',
                    border: '1px solid #dde4f0',
                    borderRadius: '5px',
                    color: '#3d4d6b',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  本地导入
                </button>
              </div>

              {assetList.length === 0 ? (
                <div style={{ padding: '22px 18px', textAlign: 'center' }}>
                  <div style={{ fontSize: '26px' }}>🗂</div>
                  <div style={{ fontSize: '12px', color: '#2b3a5b', fontWeight: 600, marginTop: '6px' }}>
                    这个项目里还没有图 / 视频素材
                  </div>
                  <div style={{ fontSize: '11px', color: '#8a94ab', marginTop: '4px', lineHeight: 1.7 }}>
                    素材来自「资产」里生成的角色 / 场景 / 道具图，
                    <br />
                    以及「分镜」里生成的首帧图与视频。
                  </div>
                  <button
                    onClick={() => mediaInputRef.current?.click()}
                    style={{
                      marginTop: '12px',
                      padding: '6px 14px',
                      background: 'linear-gradient(135deg, #a18cd1, #fbc2eb)',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    从本地选择图片 / 视频
                  </button>
                </div>
              ) : (
                <>
                  {/* 分组筛选 */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '4px',
                      padding: '8px 10px',
                      flexWrap: 'wrap',
                      borderBottom: '1px solid #f3f6fc',
                    }}
                  >
                    {['全部', ...assetGroups].map((g) => {
                      const on = activeGroup === g;
                      const count = g === '全部' ? assetList.length : assetList.filter((a: any) => (a?.group || '素材') === g).length;
                      return (
                        <button
                          key={g}
                          onClick={() => setAssetGroup(g)}
                          style={{
                            padding: '2px 8px',
                            borderRadius: '10px',
                            border: '1px solid ' + (on ? '#a18cd1' : '#e3e9f5'),
                            background: on ? '#f3eefc' : '#fff',
                            color: on ? '#6b46c1' : '#7a86a1',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          {g} {count}
                        </button>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      maxHeight: '320px',
                      overflowY: 'auto',
                      padding: '8px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                    }}
                  >
                    {shownAssets.map((a: any, i: number) => {
                      const url = a?.url || a?.imageUrl || '';
                      const title = a?.title || ('素材 ' + (i + 1));
                      const isVideo = a?.type === 'video' || /\.(mp4|webm|mov|m3u8|mkv)(\?|#|$)/i.test(url);
                      return (
                        <button
                          key={a?.id || i}
                          onClick={() => importAssetAsNode(a, i)}
                          style={{
                            background: 'none',
                            border: '1px solid #dde4f0',
                            borderRadius: '6px',
                            padding: '4px',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                          title={title}
                        >
                          <div
                            style={{
                              width: '100%',
                              height: '70px',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              background: '#000',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              position: 'relative',
                            }}
                          >
                            {url ? (
                              isVideo ? (
                                <>
                                  <video src={url} muted preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  <Film size={18} color="#fff" style={{ position: 'absolute', left: 6, bottom: 6 }} />
                                </>
                              ) : (
                                <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              )
                            ) : (
                              <ImageIcon size={28} color="#aaa" />
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: '10px',
                              color: '#555',
                              marginTop: '4px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {isVideo ? '🎬 ' : '🖼 '}
                            {title}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div
                    style={{
                      padding: '6px 12px',
                      borderTop: '1px solid #f3f6fc',
                      fontSize: '10px',
                      color: '#8a94ab',
                    }}
                  >
                    点击任意素材即在画布生成对应节点
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* 运行按钮 */}
        <button
          onClick={runWorkflow}
          disabled={isRunning}
          style={{
            padding: '6px 16px',
            background: isRunning ? '#333' : 'linear-gradient(135deg, #51cf66, #94d82d)',
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <Play size={14} />
          {isRunning ? '运行中...' : '运行全部'}
        </button>

        <button
          onClick={handleExport}
          style={{ padding: '6px', background: '#dbe3f2', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}
          title="导出工作流"
        >
          <Download size={14} />
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ padding: '6px', background: '#dbe3f2', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}
          title="导入工作流"
        >
          <Upload size={14} />
        </button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
        <input
          ref={mediaInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleImportLocal}
          style={{ display: 'none' }}
        />

        <button
          onClick={() => {
            if (confirm('确定清空画布吗？')) clearCanvas();
          }}
          style={{ padding: '6px', background: '#dbe3f2', border: 'none', borderRadius: '6px', color: '#f5576c', cursor: 'pointer' }}
          title="清空画布"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* 左侧节点面板（可拖拽） */}
      <div
        style={{
          position: 'absolute',
          top: '60px',
          left: '12px',
          width: '140px',
          background: 'rgba(255,255,255, 0.9)',
          border: '1px solid #dde4f0',
          borderRadius: '8px',
          padding: '8px',
          zIndex: 5,
        }}
      >
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px', fontWeight: 600 }}>
          拖拽节点到画布
        </div>
        {addNodeItems.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('nodeType', item.type)}
            style={{
              padding: '8px',
              background: '#e6ecf8',
              border: `1px solid ${item.color}33`,
              borderRadius: '6px',
              marginBottom: '6px',
              cursor: 'grab',
              fontSize: '11px',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <item.icon size={12} color={item.color} />
            {item.label}
          </div>
        ))}
      </div>

      {/* 画布 */}
      <div style={{ position: 'absolute', top: '48px', left: 0, right: 0, bottom: 0 }}>
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
          colorMode="dark"
          defaultEdgeOptions={{ animated: true, style: { stroke: '#4facfe', strokeWidth: 2 } }}
        >
          <Background color="#dbe3f2" gap={20} size={1} />
          <Controls
            style={{ background: '#e6ecf8', border: '1px solid #dde4f0', borderRadius: '8px' }}
            showInteractive={false}
          >
            <button onClick={() => zoomIn()} style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}>
              <ZoomIn size={14} />
            </button>
            <button onClick={() => zoomOut()} style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}>
              <ZoomOut size={14} />
            </button>
            <button onClick={() => fitView()} style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}>
              <Maximize size={14} />
            </button>
          </Controls>
          <MiniMap
            style={{ background: '#e6ecf8', border: '1px solid #dde4f0', borderRadius: '8px' }}
            nodeColor={(node) => {
              if (node.type === 'textNode') return '#4facfe';
              if (node.type === 'imageNode') return '#f093fb';
              if (node.type === 'videoNode') return '#667eea';
              if (node.type === 'generateNode') return '#fa709a';
              if (node.type === 'outputNode') return '#51cf66';
              return '#888';
            }}
            maskColor="rgba(0,0,0,0.7)"
          />
        </ReactFlow>
      </div>

      {/* 底部状态栏 */}
      <div
        style={{
          position: 'absolute',
          bottom: '8px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.7)',
          padding: '4px 12px',
          borderRadius: '4px',
          fontSize: '11px',
          color: '#888',
          zIndex: 5,
        }}
      >
        节点: {nodes.length} · 连线: {edges.length} · 拖拽左侧节点到画布 · 可从项目素材库导入图/视频 · 生成结果可存回素材库
      </div>
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
