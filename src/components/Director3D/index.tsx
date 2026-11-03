import { useRef, useState, useEffect } from 'react';
import { DirectorCanvas } from './DirectorCanvas';
import { DirectorPanel } from './DirectorPanel';
import { useDirectorStore } from './store';

export interface Director3DProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: React.CSSProperties;
  onExport?: (data: object) => void;
  onCameraReference?: (cameraId: string, data: object) => void;
  onRenderFrame?: (imageDataUrl: string) => void;
  project?: any;
  update?: (key: string, value: any) => void;
  log?: (message: string) => void;
}

/**
 * 3D导演台组件
 *
 * 功能：
 * - 3D虚拟场景搭建（角色、道具）
 * - 多机位管理（位置、焦距、画幅、运镜）
 * - 渲染首帧参考图（对接图生视频API）
 * - 导出机位参考图（对接生图/生视频API）
 */
export function Director3D({
  width = '100%',
  height = '100%',
  className,
  style,
  onExport,
  onCameraReference,
  onRenderFrame,
  project,
  update,
  log,
}: Director3DProps) {
  const { exportScene, exportCameraReference, activeCameraId } = useDirectorStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleExport = () => {
    const data = exportScene();
    onExport?.(data);
  };

  const handleCameraRef = () => {
    if (activeCameraId) {
      const data = exportCameraReference(activeCameraId);
      onCameraReference?.(activeCameraId, data);
    }
  };

  const handleRenderFrame = () => {
    if (!canvasRef.current) {
      log?.('画布未就绪，无法渲染');
      return;
    }
    try {
      // 从WebGL画布截取当前帧
      const dataUrl = canvasRef.current.toDataURL('image/png');
      if (dataUrl && dataUrl.length > 100) {
        log?.('首帧渲染成功，正在跳转到视频生成...');
        onRenderFrame?.(dataUrl);
      } else {
        log?.('渲染失败，画布为空');
      }
    } catch (e: any) {
      log?.(`渲染失败: ${e.message}`);
    }
  };

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        width,
        height,
        background: '#f6f8fc',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* 左侧控制面板 */}
      <DirectorPanel project={project} update={update} log={log} />

      {/* 右侧3D画布 */}
      <div style={{ flex: 1, position: 'relative' }}>
        <DirectorCanvas canvasRef={canvasRef} />

        {/* 顶部工具栏 */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            right: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background: 'rgba(0,0,0,0.7)',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#fff',
              pointerEvents: 'auto',
            }}
          >
            🖱️ 左键旋转 · 右键平移 · 滚轮缩放 · 点击选中物体
          </div>
          <div style={{ display: 'flex', gap: '8px', pointerEvents: 'auto' }}>
            <button
              onClick={handleRenderFrame}
              style={{
                padding: '6px 12px',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              🎬 渲染首帧并生成视频
            </button>
            <button
              onClick={handleCameraRef}
              style={{
                padding: '6px 12px',
                background: 'linear-gradient(135deg, #4facfe, #00f2fe)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              📸 生成机位参考图
            </button>
            <button
              onClick={handleExport}
              style={{
                padding: '6px 12px',
                background: 'rgba(15,23,42,0.16)',
                border: '1px solid rgba(15,23,42,0.32)',
                borderRadius: '6px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              💾 保存场景
            </button>
          </div>
        </div>

        {/* 底部状态栏 */}
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            background: 'rgba(0,0,0,0.7)',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '11px',
            color: '#888',
          }}
        >
          角色: {useDirectorStore.getState().characters.length} · 道具: {useDirectorStore.getState().props.length} · 机位: {useDirectorStore.getState().cameras.length}
        </div>
      </div>
    </div>
  );
}

export { useDirectorStore } from './store';
export * from './types';
