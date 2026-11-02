// 画布与主程序之间的数据桥（避免 InfiniteCanvas ↔ nodes 循环依赖）。
// Studio 在挂载画布时通过 Provider 注入：
//   - assets：当前项目的素材库（project.assets，图/视频生成结果）
//   - onSaveAsset：把画布生成结果写回项目素材库的回调（走 project setter 自动存盘）
import { createContext, useContext } from 'react';

export interface CanvasBridge {
  assets?: any[];
  onSaveAsset?: (asset: any) => void;
}

export const CanvasBridgeContext = createContext<CanvasBridge>({});

export function useCanvasBridge(): CanvasBridge {
  return useContext(CanvasBridgeContext);
}
