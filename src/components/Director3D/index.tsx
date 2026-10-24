import { useRef, useState, useEffect } from 'react';
import { DirectorCanvas } from './DirectorCanvas';
import { DirectorPanel } from './DirectorPanel';
import { useDirectorStore } from './store';

// VIP权限校验组件
function VipGate({ onUnlock }: { onUnlock?: () => void }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      background: 'linear-gradient(135deg, #f6f8fc 0%, #e6ecf8 100%)',
      color: '#fff',
      padding: 40,
      textAlign: 'center'
    }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>🎬</div>
      <h2 style={{ fontSize: 28, margin: '0 0 12px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        3D导演台
      </h2>
      <p style={{ fontSize: 16, color: '#999', margin: '0 0 8px', maxWidth: 500, lineHeight: 1.6 }}>
        专业级3D虚拟场景搭建，多机位管理，渲染首帧参考图
      </p>
      <p style={{ fontSize: 14, color: '#666', margin: '0 0 24px' }}>
        角色/道具/场景搭建 · 多机位运镜 · 首帧渲染 · 对接图生视频
      </p>
      <div style={{
        background: 'rgba(245, 158, 11, 0.1)',
        border: '1px solid rgba(245, 158, 11, 0.3)',
        borderRadius: 12,
        padding: '16px 24px',
        marginBottom: 24
      }}>
        <div style={{ fontSize: 14, color: '#f59e0b', fontWeight: 600 }}>🔒 VIP专属功能</div>
        <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>订阅会员后即可使用3D导演台全部功能</div>
      </div>
      <button
        onClick={onUnlock}
        style={{
          padding: '12px 32px',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          border: 'none',
          borderRadius: 8,
          color: '#fff',
          cursor: 'pointer',
          fontSize: 16,
          fontWeight: 600
        }}
      >
        立即开通 VIP
      </button>
    </div>
  );
}

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

  // VIP权限校验
  const [isVip, setIsVip] = useState(() => {
    return localStorage.getItem("USER_VIP_STATUS") === "true";
  });

  const handleUnlockVip = () => {
    // 触发父组件打开充值/会员页面
    if (window.onOpenMembership) {
      window.onOpenMembership();
    } else {
      alert("请在设置中开通VIP会员后使用3D导演台");
    }
  };

  // 如果不是VIP，显示VIP权限提示
  if (!isVip) {
    return (
      <div style={{ width, height, ...style }}>
        <VipGate onUnlock={handleUnlockVip} />
      </div>
    );
  }

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
