import { InfiniteCanvasInner } from './InfiniteCanvas';

export interface InfiniteCanvasProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: React.CSSProperties;
  onRunNode?: (nodeId: string, data: any) => void;
  onExport?: (data: object) => void;
}

/**
 * 无限画布组件
 * 
 * 功能：
 * - 节点式AI工作流编排（文本/图片/视频输入 → AI生成 → 输出）
 * - 支持文生图、图生图、文生视频、图生视频、文本生成
 * - 拖拽节点、连线、运行工作流
 * - 导入/导出工作流配置
 * 
 * 使用示例：
 * ```tsx
 * <InfiniteCanvas
 *   width="100%"
 *   height="600px"
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
}: InfiniteCanvasProps) {
  return (
    <div
      className={className}
      style={{ width, height, position: 'relative', overflow: 'hidden', ...style }}
    >
      <InfiniteCanvasInner />
    </div>
  );
}

export { useCanvasStore } from './store';
export * from './types';
