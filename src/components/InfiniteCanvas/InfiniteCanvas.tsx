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

  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);

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
        节点: {nodes.length} · 连线: {edges.length} · 拖拽左侧节点到画布 · 连接节点后点击"运行全部"
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
