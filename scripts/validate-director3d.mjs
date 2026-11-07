// 从真实源码抽函数 → esbuild 打包 → Node 断言。
// 目的：证明「镜头之间」的转场窗口在数学上确实是连续的，而不是靠眼睛看。
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = process.cwd();
const outdir = path.join(root, 'tmp', '_validate_build');
fs.mkdirSync(outdir, { recursive: true });

const entry = (f) => path.join(root, 'src', 'components', 'Director3D', f);
await build({
  entryPoints: [entry('transitions.ts'), entry('cameraPose.ts'), entry('characterPose.ts'), entry('store.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir,
  external: ['three', 'zustand', 'react'],
  logLevel: 'silent',
});

const load = (name) => import(pathToFileURL(path.join(outdir, name + '.js')).href);
const T = await load('transitions');
const C = await load('cameraPose');
const CP = await load('characterPose');
const S = await load('store');
const THREE = await import('three');

let pass = 0;
let fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error('  FAIL: ' + msg); } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const shot = (id, duration, extra = {}) => ({
  id, name: id,
  position: { x: 7, y: 4.2, z: 9 }, target: { x: 1.5, y: 1.1, z: 0 },
  fov: 45, aspect: '16:9', movement: 'static', movementSpeed: 0.6,
  duration, ...extra,
});

// 与 store 里的示例机位一致：5s / 4s / 6s，第一镜推镜
const list = [
  shot('A', 5, { movement: 'push' }),
  shot('B', 4, { position: { x: 3.9, y: 1.9, z: 2.8 }, target: { x: 0, y: 1.4, z: 0 }, fov: 35 }),
  shot('C', 6, { position: { x: -4.5, y: 2.8, z: 6 }, target: { x: 1.5, y: 1.2, z: 0 } }),
];

console.log('── A. 时间轴 / 窗口边界 ──');
ok(T.totalDurationOf(list) === 15, '总时长 15s');
ok(T.durOfShot({ duration: 0 }) === 4, '非法时长回退到默认 4s');
ok(T.frameAt([], 1) === null, '空镜头列表返回 null');

let f = T.frameAt(list, 2);
ok(f.slots.length === 1 && f.slots[0].index === 0, '镜内：单槽、第 0 镜');
ok(near(f.slots[0].localT, 2) && near(f.slots[0].progress, 0.4), '镜内 localT/progress');
ok(f.boundary === -1 && f.transitioning === false, '镜内不在转场');

f = T.frameAt(list, 7);
ok(f.slots.length === 1 && f.slots[0].index === 1, '第二镜：单槽、第 1 镜');
ok(near(f.slots[0].localT, 2), '第二镜 localT = 7 - 5');

f = T.frameAt(list, 99);
ok(f.slots.length === 1 && f.slots[0].index === 2 && near(f.slots[0].localT, 6), '超出总时长钳到最后一镜末尾');

const b1 = 5;
const w = Math.min(T.TRANSITION_HALF, 5 * 0.45, 4 * 0.45);
ok(near(w, 0.32), '窗口半长 0.32s');

f = T.frameAt(list, b1 - w - 0.001);
ok(f.slots.length === 1 && f.slots[0].index === 0, '窗口前 1ms：仍是单镜（无转场）');
f = T.frameAt(list, b1 - w);
ok(f.slots.length === 2 && near(f.blend, 0), '窗口起点：双槽但 blend=0（与正常播放一致）');
ok(near(f.slots[0].localT, 5 - w), '窗口起点出镜 localT 与正常播放相同');
ok(near(f.slots[1].localT, 0), '窗口起点入镜 localT=0');
f = T.frameAt(list, b1);
ok(f.slots.length === 2 && f.boundary === b1 && near(f.blend, 0.5), '切镜点：blend=0.5');
ok(near(f.slots[0].localT, 5) && near(f.slots[1].localT, 0), '切镜点：出镜停在终态、入镜停在初态');
f = T.frameAt(list, b1 + w);
ok(f.slots.length === 2 && near(f.blend, 1), '窗口终点：blend=1（与正常播放一致）');
ok(near(f.slots[1].localT, w), '窗口终点入镜 localT 与正常播放相同');
f = T.frameAt(list, b1 + w + 0.001);
ok(f.slots.length === 1 && f.slots[0].index === 1, '窗口后 1ms：回到单镜');

console.log('── B. 窗口不重叠 / 短镜头保护 ──');
const shortList = [shot('S1', 0.5), shot('S2', 0.5), shot('S3', 0.5)];
const ws = Math.min(T.TRANSITION_HALF, 0.5 * 0.45, 0.5 * 0.45);
ok(near(ws, 0.225), '短镜头窗口按 45% 时长收缩到 0.225s');
ok((0.5 + ws) < (1.0 - ws), '相邻窗口之间留有间隙，不重叠');
let ambiguous = 0;
for (let t = 0; t <= 1.5; t += 0.005) {
  const g = T.frameAt(shortList, t);
  if (g.slots.length === 2 && g.slots[1].index - g.slots[0].index !== 1) ambiguous++;
}
ok(ambiguous === 0, '任意时刻双槽都恰好是相邻两镜');
ok(T.frameAt(shortList, 0.5).boundary === 0.5, '第一个短镜头切点在 0.5');
ok(T.frameAt(shortList, 1.0).boundary === 1.0, '第二个短镜头切点在 1.0');

const one = [shot('only', 3)];
for (let t = 0; t <= 3; t += 0.05) {
  if (T.frameAt(one, t).slots.length !== 1) { fail++; console.error('  FAIL: 单镜不应有转场'); break; }
}
pass++;

console.log('── C. 模式 / 遮挡 / 角度 ──');
ok(T.effectiveBlend(0.3, 'cut') === 0 && T.effectiveBlend(0.7, 'cut') === 1, 'cut 模式量化成硬切');
ok(near(T.effectiveBlend(0.37, 'dissolve'), 0.37) && near(T.effectiveBlend(0.37, 'move'), 0.37), 'dissolve/move 保留连续 blend');
ok(near(T.fadeOf(0), 0) && near(T.fadeOf(1), 0) && near(T.fadeOf(0.5), 1), '遮挡两端 0、切镜点峰值 1');
ok(T.fadeOf(0.25) > 0 && T.fadeOf(0.25) < 1, '遮挡在窗口内平滑升降');
ok(near(T.lerpAngle(3.0, -3.0, 0.5), Math.PI, 1e-6), '朝向插值走最短弧（不绕整圈）');
ok(near(T.lerpAngle(0.2, 0.4, 0.5), 0.3), '普通角度线性插值');

console.log('── D. 相机位姿（真实 three 校验）──');
const staticShot = shot('Q', 4, { position: { x: 2, y: 3, z: 8 }, target: { x: 0, y: 1, z: 0 }, fov: 50 });
const pose = C.cameraPose(staticShot, 2, 4);
const real = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
real.position.copy(pose.position);
real.up.set(0, 1, 0);
real.lookAt(new THREE.Vector3(0, 1, 0));
ok(pose.quaternion.angleTo(real.quaternion) < 1e-6, 'poseScratch.lookAt 与真实相机 lookAt 四元数一致');
ok(near(pose.fov, 50), '位姿带 fov');

const pA = C.cameraPose(list[0], 5, 5);   // 第一镜推到位
const pB = C.cameraPose(list[1], 0, 4);   // 第二镜起点
ok(C.lerpPose(pA, pB, 0).position.distanceTo(pA.position) < 1e-9, 'lerpPose(e=0) == 出镜');
ok(C.lerpPose(pA, pB, 1).position.distanceTo(pB.position) < 1e-9, 'lerpPose(e=1) == 入镜');
ok(C.lerpPose(pA, pB, 1).quaternion.angleTo(pB.quaternion) < 1e-6, 'lerpPose(e=1) 朝向 == 入镜');
ok(near(C.lerpPose(pA, pB, 0.5).fov, 40), 'lerpPose 焦距线性插值 45→35');
const mid = C.lerpPose(pA, pB, 0.5);
ok(near(mid.position.distanceTo(pA.position), mid.position.distanceTo(pB.position), 1e-6), 'e=0.5 位置在中点');

const applied = new THREE.PerspectiveCamera();
C.applyPose(applied, pB);
ok(applied.position.distanceTo(pB.position) < 1e-9 && applied.fov === 35, 'applyPose 写入位置与 fov');

console.log('── E. 核心：切镜点不再有位置跳变 ──');
const renderPos = (t, mode) => {
  const g = T.frameAt(list, t);
  const blend = T.effectiveBlend(g.blend, mode);
  const a = C.cameraPose(g.slots[0].cam, g.slots[0].localT, g.slots[0].duration);
  return (g.slots.length > 1
    ? C.lerpPose(a, C.cameraPose(g.slots[1].cam, g.slots[1].localT, g.slots[1].duration), blend)
    : a).position;
};
const maxJump = (mode) => {
  let max = 0, prev = null;
  for (let t = 4.0; t <= 6.0; t += 0.002) {
    const p = renderPos(t, mode);
    if (prev) max = Math.max(max, p.distanceTo(prev));
    prev = p;
  }
  return max;
};
const jumpDissolve = maxJump('dissolve');
const jumpMove = maxJump('move');
const jumpCut = maxJump('cut');
console.log(`  单步(2ms)最大相机位移  dissolve=${jumpDissolve.toFixed(4)}  move=${jumpMove.toFixed(4)}  cut=${jumpCut.toFixed(4)}`);
ok(jumpCut > 0.5, '硬切模式在边界存在明显跳变（对照组）');
ok(jumpDissolve < jumpCut / 20, '溶解模式把跳变摊平到 1/20 以下');
ok(jumpMove < jumpCut / 20, '运镜过渡模式同样摊平跳变');
ok(near(jumpDissolve, jumpMove, 1e-9), '两种平滑模式的相机轨迹一致（差别只在遮挡层）');

console.log('── F. 白模走位：切镜点不瞬移 ──');
const luna = {
  id: 'l1', name: 'Luna', color: '#fff', scale: 1,
  position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
};
// 故意让第 2 镜的起点离第 1 镜终点很远（最坏情况），检验融合是否仍连续
const charShots = [
  shot('A', 5, { motions: [{ name: 'Luna', from: { x: 0, y: 0, z: 4 }, to: { x: 0, y: 0, z: -2 }, easing: 'easeOut' }] }),
  shot('B', 4, { motions: [{ name: 'Luna', from: { x: 3, y: 0, z: 5 }, to: { x: 3, y: 0, z: 0 }, easing: 'linear' }] }),
  shot('C', 6),
];
const renderChar = (t, mode) => {
  const g = T.frameAt(charShots, t);
  const blend = T.effectiveBlend(g.blend, mode);
  const a = CP.characterPoseAt(luna, g.slots[0].cam, g.slots[0]);
  return g.slots.length > 1
    ? CP.lerpCharPose(a, CP.characterPoseAt(luna, g.slots[1].cam, g.slots[1]), blend)
    : a;
};
const cdist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
const maxCharJump = (mode) => {
  let max = 0, prev = null;
  for (let t = 4.0; t <= 6.0; t += 0.002) {
    const p = renderChar(t, mode);
    if (prev) max = Math.max(max, cdist(p, prev));
    prev = p;
  }
  return max;
};
const cjDissolve = maxCharJump('dissolve');
const cjCut = maxCharJump('cut');
console.log(`  单步(2ms)最大白模位移  dissolve=${cjDissolve.toFixed(4)}  cut=${cjCut.toFixed(4)}`);
ok(cjCut > 1, '硬切时白模在边界明显瞬移（对照组）');
ok(cjDissolve < cjCut / 20, '溶解把白模瞬移摊平到 1/20 以下');
const atStart = renderChar(b1 - w, 'dissolve');
const pureOut = CP.characterPoseAt(luna, charShots[0], { localT: 5 - w, duration: 5, progress: (5 - w) / 5 });
ok(cdist(atStart, pureOut) < 1e-9, '窗口起点白模姿态 == 出镜正常播放姿态');
const atEnd = renderChar(b1 + w, 'dissolve');
const pureIn = CP.characterPoseAt(luna, charShots[1], { localT: w, duration: 4, progress: w / 4 });
ok(cdist(atEnd, pureIn) < 1e-9, '窗口终点白模姿态 == 入镜正常播放姿态');
const noMotion = CP.characterPoseAt(luna, charShots[2], { localT: 3, duration: 6, progress: 0.5 });
ok(noMotion.x === 0 && noMotion.z === 0 && noMotion.yaw === 0, '无动作镜头回退到静态站位');
const pA2 = CP.characterPoseAt(luna, charShots[0], { localT: 5, duration: 5, progress: 1 });
const pB2 = CP.characterPoseAt(luna, charShots[1], { localT: 0, duration: 4, progress: 0 });
ok(cdist(CP.lerpCharPose(pA2, pB2, 0), pA2) < 1e-9, 'lerpCharPose(e=0) == 出镜');
ok(cdist(CP.lerpCharPose(pA2, pB2, 1), pB2) < 1e-9, 'lerpCharPose(e=1) == 入镜');
ok(Math.abs(CP.lerpCharPose({ ...pA2, yaw: 3.0 }, { ...pB2, yaw: -3.0 }, 0.5).yaw - Math.PI) < 1e-6,
  '朝向融合走最短弧');

console.log('── G. store：转场模式持久化 ──');
const st = S.useDirectorStore;
ok(st.getState().transitionMode === 'dissolve', '默认溶解');
st.getState().setTransitionMode('move');
ok(st.getState().transitionMode === 'move', 'setTransitionMode(move)');
st.getState().setTransitionMode('bogus');
ok(st.getState().transitionMode === 'dissolve', '非法值回退 dissolve');
st.getState().setTransitionMode('cut');
const exported = st.getState().exportScene();
ok(exported.version === '1.2' && exported.transitionMode === 'cut', 'exportScene 带 version 1.2 + transitionMode');
st.getState().loadScene({ transitionMode: 'move' });
ok(st.getState().transitionMode === 'move', 'loadScene 恢复 move');
st.getState().loadScene({ transitionMode: 'nope' });
ok(st.getState().transitionMode === 'dissolve', 'loadScene 坏数据回退 dissolve');

fs.rmSync(outdir, { recursive: true, force: true });
console.log(`\n${fail === 0 ? 'ALL_PASS' : 'HAS_FAIL'} · pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
