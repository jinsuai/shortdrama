// 白模走位：把「某人物在某镜某时刻的姿态」抽成纯函数，
// 转场窗口就能对出镜终态 / 入镜初态各求一次再融合，白模不会瞬移。
// 单独成模块（只依赖纯函数），便于离线从真实源码抽出来做断言验证。
import { easeMotion } from './previewClock';
import { lerpAngle } from './transitions';
import type { CameraShot, Character } from './types';

export type CharPose = {
  x: number; y: number; z: number;
  yaw: number; roll: number; scale: number;
};

export type PoseSlot = { localT: number; duration: number; progress: number };

/** 求某白模在「某镜的某时刻」的姿态。
 *  动作绑在镜头上（逐镜追加会复用同名角色，按镜隔离才不会只动第一镜）。 */
export function characterPoseAt(
  c: Character,
  cam: CameraShot | undefined,
  slot: PoseSlot,
): CharPose {
  const motion = cam?.motions?.find((m) => m.name === c.name);
  if (!motion) {
    return {
      x: c.position.x, y: c.position.y, z: c.position.z,
      yaw: c.rotation.y, roll: c.rotation.z, scale: c.scale,
    };
  }

  const from = motion.from || c.position;
  const to = motion.to;
  const s = Math.min(1, Math.max(0, motion.start ?? 0));
  const e = Math.min(1, Math.max(0, motion.end ?? 1));
  const span = Math.max(1e-3, e - s);
  // easeOut = 临近门口脚步放缓；easeInOut = 起步稳、到位缓
  const raw = easeMotion((slot.progress - s) / span, motion.easing);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const moving = raw > 0.001 && raw < 0.999;
  const cadence = motion.cadence ?? 1.8;
  const bob = motion.bob ?? 0.035;

  // 步伐起伏：只在行进中，用镜内时间驱动，60fps 平滑，不依赖 8fps 的 playhead
  let y = from.y + (to.y - from.y) * raw;
  if (moving && cadence > 0 && bob > 0) {
    y += Math.abs(Math.sin(slot.localT * cadence * Math.PI * 2)) * bob;
  }

  // 朝向运动方向（HumanoidBody 默认朝 +z，故 yaw = atan2(dx, dz)）
  let yaw = c.rotation.y;
  if (motion.face === 'path' && Math.abs(dx) + Math.abs(dz) > 1e-4) {
    yaw = Math.atan2(dx, dz);
  } else if (typeof motion.face === 'number') {
    yaw = motion.face;
  }
  const sway = moving && cadence > 0
    ? Math.sin(slot.localT * cadence * Math.PI * 2) * 0.025
    : 0;

  return {
    x: from.x + dx * raw,
    y,
    z: from.z + dz * raw,
    yaw,
    roll: c.rotation.z + sway,
    scale: c.scale,
  };
}

/** 转场融合：出镜终态 → 入镜初态，位置/朝向/缩放一起插值（朝向走最短弧） */
export function lerpCharPose(a: CharPose, b: CharPose, e: number): CharPose {
  return {
    x: a.x + (b.x - a.x) * e,
    y: a.y + (b.y - a.y) * e,
    z: a.z + (b.z - a.z) * e,
    yaw: lerpAngle(a.yaw, b.yaw, e),
    roll: a.roll + (b.roll - a.roll) * e,
    scale: a.scale + (b.scale - a.scale) * e,
  };
}
