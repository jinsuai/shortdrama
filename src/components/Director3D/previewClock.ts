// 预演共享时钟：CameraRig 每帧写入，CharacterMesh 每帧读取。
// 用可变对象而不是 zustand state，是为了让白模动画跑到 60fps 而不触发 React 重渲染
// （store.playhead 只按 ~8fps 低频回写，拿它驱动动画会一卡一卡）。
// 暂停时 CameraRig 会把 t 同步到 store.playhead，所以拖进度条也能定格到对应动作姿态。
export const previewClock = {
  /** 全局时间轴秒 */
  t: 0,
  /** 当前镜内已过秒数 */
  localT: 0,
  /** 当前镜时长 */
  duration: 0,
  /** localT / duration，0~1 */
  progress: 0,
  /** 当前镜头在 cameras 数组里的下标；-1 = 不在任何镜头 */
  shotIndex: -1,
  playing: false,
};

export const resetPreviewClock = () => {
  previewClock.t = 0;
  previewClock.localT = 0;
  previewClock.duration = 0;
  previewClock.progress = 0;
  previewClock.shotIndex = -1;
  previewClock.playing = false;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 动作缓动：easeOut 对应「临近门口脚步放缓」 */
export const easeMotion = (p: number, kind: string | undefined): number => {
  const x = clamp01(p);
  if (kind === 'linear') return x;
  if (kind === 'easeOut') return 1 - Math.pow(1 - x, 2.2);
  // easeInOut（默认）：起步稳、中间匀速、到位缓
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
};
