import { InfiniteCanvasInner } from './InfiniteCanvas';
import { CanvasBridgeContext, CanvasBridge } from './bridge';

export interface InfiniteCanvasProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: React.CSSProperties;
  onRunNode?: (nodeId: string, data: any) => void;
  onExport?: (data: object) => void;
  /** 主程序桥接：项目素材库（project.assets），用于「从素材库导入」 */
  assets?: any[];
  /** 主程序桥接：把画布生成结果写回项目素材库（走 project setter 自动存盘） */
  onSaveAsset?: (asset: any) => void;
}

/**
 * 无限画布组件
 * 
 * 功能：
 * - 节点式AI工作流编排（文本/图片/视频输入 → AI生成 → 输出）
 * - 支持文生图、图生图、文生视频、图生视频、文本生成
 * - 拖拽节点、连线、运行工作流
 * - 导入/导出工作流配置
 * - 与主程序打通：从项目素材库导入图/视频、生成结果存回素材库
 * 
 * 使用示例：
 * ```tsx
 * <InfiniteCanvas
 *   width="100%"
 *   height="600px"
 *   assets={project?.assets}
 *   onSaveAsset={(a) => update((p) => ({ ...p, assets: [a, ...(p.assets || [])] }))}
 *   onRunNode={(nodeId, data) => console.log('运行节点:', nodeId, data)}
 * />
 * ```
 */
export function InfiniteCanvas({
  width = '100%',
  height = '100%',
  className,
  style,
  onRunNode,
  onExport,
  assets,
  onSaveAsset,
}: InfiniteCanvasProps) {
  const bridge: CanvasBridge = { assets, onSaveAsset };
  return (
    <div
      className={className}
      style={{ width, height, position: 'relative', overflow: 'hidden', ...style }}
    >
      <CanvasBridgeContext.Provider value={bridge}>
        <InfiniteCanvasInner />
      </CanvasBridgeContext.Provider>
    </div>
  );
}

export { useCanvasStore } from './store';
export * from './types';
