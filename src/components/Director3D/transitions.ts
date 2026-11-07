// 镜头间转场：把「单镜头硬切」改成「切镜点前后的双镜融合窗口」。
//
// 旧行为：shotAt(t) 只返回一个镜头，t 一越过切镜点，相机与白模瞬间跳到下一镜 → 硬切。
// 新行为：在每个切镜点 b 前后各借一小段时间（TRANSITION_HALF）做过渡窗口，
//   窗口内同时按「各自的镜内时间」求值出镜 N 与入镜 N+1，再用 smoothstep(blend) 融合。
//   关键性质：窗口起点 blend=0（与出镜的正常播放完全一致）、窗口终点 blend=1
//   （与入镜的正常播放完全一致），且两端导数也为 0 —— 因此进出窗口都不会二次跳变。
//   时间轴总长度不变，转场只是从相邻两镜各借走一点时间，不额外加帧。
//
// 纯函数、不依赖 three / react，便于离线断言验证。
import { CameraShot, CAMERA_DEFAULT_DURATION } from './types';

export type TransitionMode = 'dissolve' | 'move' | 'cut';

export const TRANSITION_MODES: { value: TransitionMode; label: string; hint: string }[] = [
  { value: 'dissolve', label: '溶解（淡入淡出）', hint: '切镜点前后融合机位与走位，并压一层环境色遮挡' },
  { value: 'move', label: '运镜过渡（不遮挡）', hint: '只融合机位与走位，画面不遮挡，像一次连续推轨' },
  { value: 'cut', label: '硬切（无过渡）', hint: '保留传统的瞬间切镜，用于对比或回退' },
];

/** 切镜点前/后各借用的秒数（窗口总长 = 2 × 此值）。 */
export const TRANSITION_HALF = 0.32;

export const durOfShot = (c: CameraShot): number =>
  Number.isFinite(c?.duration) && c.duration > 0 ? c.duration : CAMERA_DEFAULT_DURATION;

export const totalDurationOf = (list: CameraShot[]): number =>
  list.reduce((a, c) => a + durOfShot(c), 0);

export interface ShotSlot {
  /** 在 cameras 数组里的下标 */
  index: number;
  cam: CameraShot;
  /** 该镜内已过秒数，已 clamp 到 [0, duration]（转场时会停在端点） */
  localT: number;
  duration: number;
  /** localT / duration，0~1 */
  progress: number;
}

export interface FrameState {
  /** 1 个 = 正常单镜；2 个 = [出镜, 入镜]，正在转场 */
  slots: ShotSlot[];
  /** 0 → 纯出镜；1 → 纯入镜（smoothstep 后的融合系数） */
  blend: number;
  transitioning: boolean;
  /** 本次转场的切镜点（绝对秒），无则 -1 */
  boundary: number;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** smoothstep：blend'(0)=blend'(1)=0，窗口边缘速度连续 */
const smoothstep = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

function makeSlot(
  list: CameraShot[],
  starts: number[],
  durations: number[],
  index: number,
  t: number,
): ShotSlot {
  const duration = durations[index];
  const localT = clamp(t - starts[index], 0, duration);
  return {
    index,
    cam: list[index],
    localT,
    duration,
    progress: duration > 0 ? clamp(localT / duration, 0, 1) : 0,
  };
}

/**
 * 求 t 秒时的画面由哪（几）个镜头组成。
 * 返回的 slots 按「出镜 → 入镜」排序；blend 是融合系数。
 */
export function frameAt(list: CameraShot[], t: number): FrameState | null {
  const n = list.length;
  if (!n) return null;

  const durations = list.map(durOfShot);
  const starts: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    starts.push(acc);
    acc += durations[i];
  }
  const total = acc;
  const tt = clamp(t, 0, total);

  // 1) 主镜：正常播放时该显示的那个镜头
  let primary = n - 1;
  for (let i = 0; i < n; i++) {
    if (tt < starts[i] + durations[i] || i === n - 1) {
      primary = i;
      break;
    }
  }

  // 2) 只检查与主镜相邻的两个切镜点。边界 j 位于 shot[j] 与 shot[j+1] 之间。
  //    每侧窗口不得超过相邻两镜时长的 45%，保证：
  //      a) 相邻转场窗口永不重叠；b) 短镜头不会被整段吞掉。
  for (const j of [primary - 1, primary]) {
    if (j < 0 || j >= n - 1) continue;
    const b = starts[j + 1];
    const w = Math.min(TRANSITION_HALF, durations[j] * 0.45, durations[j + 1] * 0.45);
    if (w <= 0) continue;
    if (tt < b - w || tt > b + w) continue;
    const blend = smoothstep((tt - (b - w)) / (2 * w));
    return {
      slots: [
        makeSlot(list, starts, durations, j, tt),
        makeSlot(list, starts, durations, j + 1, tt),
      ],
      blend,
      transitioning: true,
      boundary: b,
    };
  }

  return {
    slots: [makeSlot(list, starts, durations, primary, tt)],
    blend: 0,
    transitioning: false,
    boundary: -1,
  };
}

/** 溶解遮挡的不透明度：窗口两端 0、切镜点处 1（正好把切换藏起来）。 */
export const fadeOf = (blend: number): number => Math.sin(Math.PI * clamp(blend, 0, 1));

/** 按转场模式把连续 blend 量化：cut 模式下退回硬切。 */
export const effectiveBlend = (blend: number, mode: TransitionMode): number =>
  mode === 'cut' ? (blend < 0.5 ? 0 : 1) : blend;

/** 角度插值走最短弧，避免 179°→-179° 时白模原地转一整圈 */
export const lerpAngle = (a: number, b: number, e: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * e;
};
