// 相机位姿：抽成「纯数据 + 可插值」，是消除镜头间硬切的关键。
// 单独成模块（只依赖 three / types），便于离线从真实源码抽出来做断言验证。
import * as THREE from 'three';
import type { CameraShot } from './types';

export type CameraPose = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  fov: number;
};

// 只用来算 lookAt 四元数，不参与渲染
const poseScratch = new THREE.PerspectiveCamera();

/**
 * 算出某机位在 localT 秒时的相机位姿（含运镜轨迹偏移）。
 * 以前是直接 camera.lookAt() 一把梭，只能得到一个镜头的结果；
 * 现在返回纯数据，转场窗口能同时求出出镜/入镜两个位姿再插值。
 */
export function cameraPose(cam: CameraShot, localT: number, duration: number): CameraPose {
  const P = new THREE.Vector3(cam.position.x, cam.position.y, cam.position.z);
  const T = new THREE.Vector3(cam.target.x, cam.target.y, cam.target.z);
  const dir = new THREE.Vector3().subVectors(T, P);
  const dist = dir.length() || 1;
  dir.normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(dir, up).normalize();
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);

  const speed = cam.movementSpeed || 1;
  const prog = duration > 0 ? Math.min(1, Math.max(0, localT / duration)) : 0;
  // 位移幅度封顶在视线距离的一半，避免推镜穿过主体
  const amp = Math.min(dist * 0.5, prog * speed * dist * 0.55);
  const pos = P.clone();
  const look = T.clone();

  switch (cam.movement) {
    case 'push':
      pos.addScaledVector(dir, amp);
      break;
    case 'pull':
      pos.addScaledVector(dir, -amp);
      break;
    case 'pan':
      pos.addScaledVector(right, amp);
      break;
    case 'tilt':
      pos.addScaledVector(up, Math.sin(prog * Math.PI) * dist * 0.16);
      break;
    case 'track':
      pos.addScaledVector(right, amp);
      look.addScaledVector(right, amp);
      break;
    case 'orbit': {
      const angle = prog * speed * Math.PI * 0.85;
      const off = P.clone().sub(T).applyAxisAngle(up, angle);
      pos.copy(T).add(off);
      break;
    }
    default:
      break; // static
  }

  // PerspectiveCamera.lookAt 与真实相机同一套约定（-z 指向 target）
  poseScratch.position.copy(pos);
  poseScratch.up.set(0, 1, 0);
  poseScratch.lookAt(look);
  return {
    position: pos.clone(),
    quaternion: poseScratch.quaternion.clone(),
    fov: cam.fov,
  };
}

/** 两镜位姿插值：位置线性、朝向球面插值(slerp)、焦距线性 */
export function lerpPose(a: CameraPose, b: CameraPose, e: number): CameraPose {
  return {
    position: a.position.clone().lerp(b.position, e),
    quaternion: a.quaternion.clone().slerp(b.quaternion, e),
    fov: a.fov + (b.fov - a.fov) * e,
  };
}

export function applyPose(camera: THREE.PerspectiveCamera, pose: CameraPose) {
  camera.position.copy(pose.position);
  camera.quaternion.copy(pose.quaternion);
  if (camera.fov !== pose.fov) {
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
  }
}
