import { useRef, useEffect, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
  Html,
  ContactShadows,
} from '@react-three/drei';
import * as THREE from 'three';
import { useDirectorStore } from './store';
import { Character, Prop, CameraShot } from './types';
import { previewClock, previewFrame } from './previewClock';
import {
  durOfShot,
  totalDurationOf,
  frameAt,
  fadeOf,
  effectiveBlend,
  type FrameState,
} from './transitions';
import { cameraPose, lerpPose, applyPose } from './cameraPose';
import { characterPoseAt, lerpCharPose } from './characterPose';

// ─────────────────────────────────────────────────────────────
// 白模约定（用户 2026-11-04 明确）：不加载任何外部 3D 模型（GLB/GLTF），
// 人物与道具统一素模材质。预演看的是构图、遮挡、视线与机位关系，
// 白模比彩色渲染更清楚，也没有资源加载失败的可能。
// ─────────────────────────────────────────────────────────────

const CLAY = '#e6eaf1';
const CLAY_DARK = '#cdd5e2';
const CLAY_GROUND = '#f1f4f9';

/** 颜色提亮(amt>0)/压暗(amt<0)，用于从背景色派生渐变天空 */
function shade(hex: string, amt: number): string {
  try {
    const c = new THREE.Color(hex);
    c.lerp(new THREE.Color(amt >= 0 ? '#ffffff' : '#000000'), Math.abs(amt));
    return '#' + c.getHexString();
  } catch {
    return hex;
  }
}

const Mat = (color = CLAY, roughness = 0.86) => (
  <meshStandardMaterial color={color} roughness={roughness} metalness={0} />
);

// 镜头时长与转场窗口统一由 transitions.ts 提供（纯函数，离线可测）
const durOf = durOfShot;
const totalDuration = totalDurationOf;

function shotStartOf(list: CameraShot[], id: string | null): number {
  let acc = 0;
  for (const c of list) {
    if (c.id === id) return acc;
    acc += durOf(c);
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────
// 渐变天空（自绘 shader，零外部资源，截图也能带上干净背景）
// ─────────────────────────────────────────────────────────────

function GradientSky({ base }: { base: string }) {
  const top = shade(base, 0.45);
  const bottom = shade(base, -0.12);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uTop: { value: new THREE.Color(top) },
          uBottom: { value: new THREE.Color(bottom) },
        },
        vertexShader: `varying vec3 vPos;
          void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 uTop; uniform vec3 uBottom; varying vec3 vPos;
          void main() {
            float h = normalize(vPos).y;
            float t = smoothstep(-0.35, 0.72, h);
            gl_FragColor = vec4(mix(uBottom, uTop, t), 1.0);
          }`,
      }),
    [top, bottom],
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh scale={60} material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[1, 32, 20]} />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────
// 白模人形：只保留头/颈/躯干/四肢的比例与体积。
// 不画五官、不上肤色/发色/服装色；用一个小鼻梁标记面朝方向，
// 方便判断「正反打」里人物的视线关系。
// ─────────────────────────────────────────────────────────────

/** 头/颈/鼻梁：四种姿态复用，鼻梁标记面朝方向（+z） */
function ClayHead({ y, z = 0, r }: { y: number; z?: number; r: number }) {
  return (
    <>
      <mesh position={[0, y - 0.145, z]} castShadow>
        <cylinderGeometry args={[0.048, 0.055, 0.12, 12]} />
        {Mat(CLAY_DARK)}
      </mesh>
      <mesh position={[0, y, z]} scale={[1, 1.14, 0.94]} castShadow>
        <sphereGeometry args={[r, 24, 20]} />
        {Mat()}
      </mesh>
      <mesh position={[0, y - 0.02, z + r * 0.93]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.022, 0.06, 8]} />
        {Mat(CLAY_DARK)}
      </mesh>
    </>
  );
}

// 姿态 stand / sit / squat / walk 全部靠素模几何表达，不加载任何外部模型文件。
function HumanoidBody({ character }: { character: Character }) {
  const tpl = character.template || 'male_standard';
  const isFemale = character.gender === 'female' || tpl.includes('female');
  const athletic = tpl === 'male_athletic';
  const elegant = tpl === 'female_elegant';
  const child = tpl === 'child';

  const shoulder = athletic ? 0.46 : elegant ? 0.31 : child ? 0.27 : 0.38;
  const hip = isFemale ? 0.3 : 0.27;
  const headR = child ? 0.15 : 0.125;
  const pose = character.pose || 'stand';

  // ── 坐姿：坐于素模座椅，大腿水平前伸、小腿垂直落地，重心降到 0.55 米 ──
  if (pose === 'sit') {
    return (
      <group>
        {/* 素模座椅：座面 + 靠背 + 四腿 */}
        <mesh position={[0, 0.46, -0.04]} castShadow receiveShadow>
          <boxGeometry args={[0.52, 0.06, 0.46]} />
          {Mat(CLAY_DARK)}
        </mesh>
        <mesh position={[0, 0.75, -0.26]} castShadow>
          <boxGeometry args={[0.52, 0.52, 0.06]} />
          {Mat(CLAY_DARK)}
        </mesh>
        {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
          <mesh key={`chairleg-${sx}-${sz}`} position={[sx * 0.21, 0.22, -0.04 + sz * 0.17]} castShadow>
            <cylinderGeometry args={[0.028, 0.028, 0.44, 8]} />
            {Mat(CLAY_DARK)}
          </mesh>
        )))}
        {/* 骨盆 */}
        <mesh position={[0, 0.55, -0.02]} scale={[hip * 1.12, 0.18, 0.17]} castShadow>
          <sphereGeometry args={[1, 16, 12]} />
          {Mat()}
        </mesh>
        {[-1, 1].map((s) => (
          <group key={`sit-leg-${s}`}>
            {/* 大腿：capsule 默认沿 y，转 90° 后水平朝 +z */}
            <mesh position={[s * 0.11, 0.53, 0.16]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <capsuleGeometry args={[0.095, 0.34, 6, 12]} />
              {Mat()}
            </mesh>
            <mesh position={[s * 0.11, 0.3, 0.38]} castShadow>
              <capsuleGeometry args={[0.075, 0.32, 6, 12]} />
              {Mat()}
            </mesh>
            <mesh position={[s * 0.11, 0.055, 0.44]} castShadow>
              <boxGeometry args={[0.14, 0.11, 0.27]} />
              {Mat(CLAY_DARK)}
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.9, -0.02]} castShadow>
          <cylinderGeometry args={[shoulder * 0.78, hip * 0.88, 0.52, 18]} />
          {Mat()}
        </mesh>
        <mesh position={[0, 1.12, -0.02]} scale={[shoulder, 0.11, 0.17]} castShadow>
          <sphereGeometry args={[1, 16, 12]} />
          {Mat()}
        </mesh>
        {/* 手臂自然垂放到大腿上 */}
        {[-1, 1].map((s) => (
          <group key={`sit-arm-${s}`}>
            <mesh position={[s * (shoulder + 0.055), 0.92, 0.02]} rotation={[0.35, 0, s * 0.12]} castShadow>
              <capsuleGeometry args={[0.055, 0.28, 6, 12]} />
              {Mat()}
            </mesh>
            <mesh position={[s * (shoulder + 0.085), 0.7, 0.16]} rotation={[0.9, 0, s * 0.08]} castShadow>
              <capsuleGeometry args={[0.048, 0.24, 6, 12]} />
              {Mat(CLAY_DARK)}
            </mesh>
            <mesh position={[s * (shoulder + 0.095), 0.57, 0.29]} castShadow>
              <sphereGeometry args={[0.052, 12, 10]} />
              {Mat()}
            </mesh>
          </group>
        ))}
        <ClayHead y={1.34} z={-0.02} r={headR} />
      </group>
    );
  }

  // ── 蹲姿：屈膝、躯干前倾、双臂撑膝，头顶降到约 1.3 米 ──
  if (pose === 'squat') {
    return (
      <group>
        <mesh position={[0, 0.56, -0.06]} scale={[hip * 1.12, 0.18, 0.17]} castShadow>
          <sphereGeometry args={[1, 16, 12]} />
          {Mat()}
        </mesh>
        {[-1, 1].map((s) => (
          <group key={`squat-leg-${s}`}>
            {/* 大腿斜向前上，膝盖顶到 z≈0.36 */}
            <mesh position={[s * 0.14, 0.62, 0.13]} rotation={[1.15, 0, 0]} castShadow>
              <capsuleGeometry args={[0.095, 0.34, 6, 12]} />
              {Mat()}
            </mesh>
            <mesh position={[s * 0.14, 0.34, 0.36]} rotation={[-0.22, 0, 0]} castShadow>
              <capsuleGeometry args={[0.075, 0.32, 6, 12]} />
              {Mat()}
            </mesh>
            <mesh position={[s * 0.14, 0.055, 0.42]} castShadow>
              <boxGeometry args={[0.14, 0.11, 0.27]} />
              {Mat(CLAY_DARK)}
            </mesh>
          </group>
        ))}
        {/* 躯干前倾 */}
        <mesh position={[0, 0.86, 0.02]} rotation={[0.28, 0, 0]} castShadow>
          <cylinderGeometry args={[shoulder * 0.78, hip * 0.88, 0.52, 18]} />
          {Mat()}
        </mesh>
        <mesh position={[0, 1.1, 0.1]} scale={[shoulder, 0.11, 0.17]} castShadow>
          <sphereGeometry args={[1, 16, 12]} />
          {Mat()}
        </mesh>
        {/* 手臂前伸撑膝 */}
        {[-1, 1].map((s) => (
          <group key={`squat-arm-${s}`}>
            <mesh position={[s * (shoulder + 0.055), 0.94, 0.12]} rotation={[0.7, 0, s * 0.12]} castShadow>
              <capsuleGeometry args={[0.055, 0.28, 6, 12]} />
              {Mat()}
            </mesh>
            <mesh position={[s * (shoulder + 0.085), 0.74, 0.3]} rotation={[1.1, 0, s * 0.08]} castShadow>
              <capsuleGeometry args={[0.048, 0.24, 6, 12]} />
              {Mat(CLAY_DARK)}
            </mesh>
            <mesh position={[s * (shoulder + 0.095), 0.63, 0.42]} castShadow>
              <sphereGeometry args={[0.052, 12, 10]} />
              {Mat()}
            </mesh>
          </group>
        ))}
        <ClayHead y={1.32} z={0.13} r={headR} />
      </group>
    );
  }

  // ── 行走：双腿绕髋前后摆、双臂反向摆，上半身与站姿一致 ──
  if (pose === 'walk') {
    return (
      <group>
        {[-1, 1].map((s) => {
          const swing = s < 0 ? 0.42 : -0.38;
          return (
            <group key={`walk-leg-${s}`} position={[s * 0.11, 0.95, 0]} rotation={[swing, 0, 0]}>
              <mesh position={[0, -0.64, 0]} castShadow>
                <capsuleGeometry args={[0.075, 0.32, 6, 12]} />
                {Mat()}
              </mesh>
              <mesh position={[0, -0.25, 0]} castShadow>
                <capsuleGeometry args={[0.095, 0.32, 6, 12]} />
                {Mat()}
              </mesh>
              <mesh position={[0, -0.895, 0.055]} castShadow>
                <boxGeometry args={[0.14, 0.11, 0.27]} />
                {Mat(CLAY_DARK)}
              </mesh>
            </group>
          );
        })}
        <mesh position={[0, 0.95, 0]} scale={[hip * 1.12, 0.18, 0.17]} castShadow>
          <sphereGeometry args={[1, 16, 12]} />
          {Mat()}
        </mesh>
        <mesh position={[0, 1.26, 0]} castShadow>
          <cylinderGeometry args={[shoulder * 0.78, hip * 0.88, 0.52, 18]} />
          {Mat()}
        </mesh>
        <mesh position={[0, 1.48, 0]} scale={[shoulder, 0.11, 0.17]} castShadow>
          <sphereGeometry args={[1, 16, 12]} />
          {Mat()}
        </mesh>
        {/* 手臂与腿反向前后摆 */}
        {[-1, 1].map((s) => {
          const fwd = s < 0 ? -1 : 1;
          return (
            <group key={`walk-arm-${s}`}>
              <mesh position={[s * (shoulder + 0.055), 1.28, fwd * 0.1]} rotation={[fwd * 0.3, 0, s * 0.12]} castShadow>
                <capsuleGeometry args={[0.055, 0.28, 6, 12]} />
                {Mat()}
              </mesh>
              <mesh position={[s * (shoulder + 0.085), 1.02, fwd * 0.16]} rotation={[fwd * 0.3, 0, s * 0.08]} castShadow>
                <capsuleGeometry args={[0.048, 0.24, 6, 12]} />
                {Mat(CLAY_DARK)}
              </mesh>
              <mesh position={[s * (shoulder + 0.095), 0.86, fwd * 0.2]} castShadow>
                <sphereGeometry args={[0.052, 12, 10]} />
                {Mat()}
              </mesh>
            </group>
          );
        })}
        <ClayHead y={1.7} r={headR} />
      </group>
    );
  }

  // ── 站立（默认） ──
  return (
    <group>
      {/* 鞋 */}
      {[-1, 1].map((s) => (
        <mesh key={`shoe${s}`} position={[s * 0.11, 0.055, 0.055]} castShadow>
          <boxGeometry args={[0.14, 0.11, 0.27]} />
          {Mat(CLAY_DARK)}
        </mesh>
      ))}
      {/* 腿 */}
      {[-1, 1].map((s) => (
        <group key={`leg${s}`}>
          <mesh position={[s * 0.11, 0.31, 0]} castShadow>
            <capsuleGeometry args={[0.075, 0.32, 6, 12]} />
            {Mat()}
          </mesh>
          <mesh position={[s * 0.11, 0.7, 0]} castShadow>
            <capsuleGeometry args={[0.095, 0.32, 6, 12]} />
            {Mat()}
          </mesh>
        </group>
      ))}
      {/* 骨盆：正常胯部体积，白模也能一眼看出是站立的人 */}
      <mesh position={[0, 0.95, 0]} scale={[hip * 1.12, 0.18, 0.17]} castShadow>
        <sphereGeometry args={[1, 16, 12]} />
        {Mat()}
      </mesh>
      {/* 躯干：上宽下窄，肩宽随体型变化 */}
      <mesh position={[0, 1.26, 0]} castShadow>
        <cylinderGeometry args={[shoulder * 0.78, hip * 0.88, 0.52, 18]} />
        {Mat()}
      </mesh>
      {/* 肩 */}
      <mesh position={[0, 1.48, 0]} scale={[shoulder, 0.11, 0.17]} castShadow>
        <sphereGeometry args={[1, 16, 12]} />
        {Mat()}
      </mesh>
      {/* 手臂 + 手 */}
      {[-1, 1].map((s) => (
        <group key={`arm${s}`}>
          <mesh position={[s * (shoulder + 0.055), 1.28, 0]} rotation={[0, 0, s * 0.12]} castShadow>
            <capsuleGeometry args={[0.055, 0.28, 6, 12]} />
            {Mat()}
          </mesh>
          <mesh position={[s * (shoulder + 0.085), 1.02, 0.01]} rotation={[0, 0, s * 0.08]} castShadow>
            <capsuleGeometry args={[0.048, 0.24, 6, 12]} />
            {Mat(CLAY_DARK)}
          </mesh>
          <mesh position={[s * (shoulder + 0.095), 0.86, 0.02]} castShadow>
            <sphereGeometry args={[0.052, 12, 10]} />
            {Mat()}
          </mesh>
        </group>
      ))}
      <ClayHead y={1.7} r={headR} />
    </group>
  );
}

function CharacterMesh({ character }: { character: Character }) {
  const selectedCharacterId = useDirectorStore((s) => s.selectedCharacterId);
  const selectCharacter = useDirectorStore((s) => s.selectCharacter);
  const isSelected = selectedCharacterId === character.id;
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const c = character;
    const st = useDirectorStore.getState();
    const slots = previewFrame.slots;

    if (!slots.length) {
      // 编辑态 / 自由观察：白模回到静态站位（所见即所编辑）
      g.position.set(c.position.x, c.position.y, c.position.z);
      g.rotation.set(c.rotation.x, c.rotation.y, c.rotation.z);
      g.scale.setScalar(c.scale);
      return;
    }

    const a = characterPoseAt(c, st.cameras[slots[0].index], slots[0]);
    const pose = slots.length > 1 && previewFrame.blend > 0
      ? lerpCharPose(
          a,
          characterPoseAt(c, st.cameras[slots[1].index], slots[1]),
          previewFrame.blend,
        )
      : a;
    g.position.set(pose.x, pose.y, pose.z);
    g.rotation.set(c.rotation.x, pose.yaw, pose.roll);
    g.scale.setScalar(pose.scale);
  });

  return (
    <group
      ref={groupRef}
      onClick={(e) => {
        e.stopPropagation();
        selectCharacter(character.id);
      }}
    >
      <HumanoidBody character={character} />
      <Html position={[0, 2.18, 0]} center distanceFactor={8}>
        <div
          style={{
            color: '#fff',
            fontSize: '12px',
            background: isSelected ? 'rgba(79,172,254,0.92)' : 'rgba(15,23,42,0.72)',
            padding: '2px 8px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {character.name}
        </div>
      </Html>
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[0.5, 0.6, 32]} />
          <meshBasicMaterial color="#4facfe" side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
// 道具：统一白模，只按形状区分（box/sphere/cylinder/plane）
// ─────────────────────────────────────────────────────────────

function PropMesh({ prop }: { prop: Prop }) {
  const selectedPropId = useDirectorStore((s) => s.selectedPropId);
  const selectProp = useDirectorStore((s) => s.selectProp);
  const isSelected = selectedPropId === prop.id;
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.set(prop.position.x, prop.position.y, prop.position.z);
      groupRef.current.rotation.set(prop.rotation.x, prop.rotation.y, prop.rotation.z);
      groupRef.current.scale.set(prop.scale.x, prop.scale.y, prop.scale.z);
    }
  });

  const matProps = (color?: string) => ({
    color: color || prop.color || '#cdd5e2',
    roughness: 0.9,
    metalness: 0,
    emissive: isSelected ? '#4facfe' : '#000',
    emissiveIntensity: isSelected ? 0.22 : 0,
  });

  const singleGeo = () => {
    switch (prop.type) {
      case 'sphere': return <sphereGeometry args={[0.5, 24, 18]} />;
      case 'cylinder': return <cylinderGeometry args={[0.5, 0.5, 1, 24]} />;
      case 'plane': return <planeGeometry args={[2, 2]} />;
      default: return <boxGeometry args={[1, 1, 1]} />;
    }
  };

  const renderPart = (part: any, key: number) => (
    <mesh
      key={key}
      position={[part.offset?.x || 0, part.offset?.y || 0, part.offset?.z || 0]}
      rotation={[part.rotation?.x || 0, part.rotation?.y || 0, part.rotation?.z || 0]}
      scale={[part.size.x, part.size.y, part.size.z]}
      castShadow
      receiveShadow
    >
      {part.shape === 'sphere' ? <sphereGeometry args={[0.5, 24, 18]} />
        : part.shape === 'cylinder' ? <cylinderGeometry args={[0.5, 0.5, 1, 24]} />
        : part.shape === 'plane' ? <planeGeometry args={[2, 2]} />
        : <boxGeometry args={[1, 1, 1]} />}
      <meshStandardMaterial {...matProps(part.color)} side={THREE.DoubleSide} />
    </mesh>
  );

  return (
    <group
      ref={groupRef}
      onClick={(e) => {
        e.stopPropagation();
        selectProp(prop.id);
      }}
    >
      {prop.parts && prop.parts.length ? (
        prop.parts.map((p, i) => renderPart(p, i))
      ) : (
        <mesh castShadow receiveShadow>
          {singleGeo()}
          <meshStandardMaterial {...matProps()} side={THREE.DoubleSide} />
        </mesh>
      )}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.7, 0.84, 32]} />
          <meshBasicMaterial color="#4facfe" side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/** 机位标记（仅自由视角显示；进入机位视角后隐藏，避免挡住构图） */
function CameraPreview({ camera }: { camera: CameraShot }) {
  const activeCameraId = useDirectorStore((s) => s.activeCameraId);
  const setActiveCamera = useDirectorStore((s) => s.setActiveCamera);
  const isActive = activeCameraId === camera.id;
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.set(camera.position.x, camera.position.y, camera.position.z);
      groupRef.current.lookAt(camera.target.x, camera.target.y, camera.target.z);
    }
  });

  return (
    <group
      ref={groupRef}
      onClick={(e) => {
        e.stopPropagation();
        setActiveCamera(camera.id);
      }}
    >
      <mesh>
        <coneGeometry args={[0.15, 0.4, 8]} />
        <meshStandardMaterial
          color={isActive ? '#f59e0b' : '#9aa7ba'}
          emissive={isActive ? '#f59e0b' : '#000'}
          emissiveIntensity={isActive ? 0.5 : 0}
        />
      </mesh>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={new Float32Array([
              0, 0, 0,
              camera.target.x - camera.position.x,
              camera.target.y - camera.position.y,
              camera.target.z - camera.position.z,
            ])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={isActive ? '#f59e0b' : '#9aa7ba'} />
      </line>
      <Html position={[0, 0.5, 0]} center distanceFactor={8}>
        <div
          style={{
            color: '#fff',
            fontSize: '10px',
            background: isActive ? 'rgba(245,158,11,0.92)' : 'rgba(15,23,42,0.7)',
            padding: '1px 6px',
            borderRadius: '3px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          📷 {camera.name}
        </div>
      </Html>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
// 转场遮挡层
// ─────────────────────────────────────────────────────────────

/**
 * 贴在相机正前方的全屏 quad，仅在「溶解」转场窗口内升起，颜色取场景背景色。
 * 必须用 WebGL 内的 quad 而不是 DOM 遮罩：MediaRecorder 录的是
 * canvas.captureStream()，DOM 覆盖层（工具栏/三分线/名字牌）根本进不了视频。
 */
function TransitionFade() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const background = useDirectorStore((s) => s.scene.background);
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;
    const fade = previewFrame.fade;
    mesh.visible = fade > 0.002;
    mat.opacity = fade;
    if (!mesh.visible) return;
    const pc = camera as THREE.PerspectiveCamera;
    const d = 0.5;
    const h = 2 * d * Math.tan((pc.fov * Math.PI) / 360); // tan(fov/2)
    const w = h * (size.width / Math.max(1, size.height));
    mesh.position.copy(camera.position);
    mesh.quaternion.copy(camera.quaternion);
    mesh.translateZ(-d);
    mesh.scale.set(w * 1.06, h * 1.06, 1);
  });

  return (
    <mesh ref={meshRef} renderOrder={9999} frustumCulled={false} visible={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={matRef}
        color={background}
        transparent
        opacity={0}
        depthTest={false}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────
// 相机驱动 + 时间轴时钟
// ─────────────────────────────────────────────────────────────

function CameraRig() {
  const { camera } = useThree();
  const elapsed = useRef(0);
  const lastReport = useRef(0);
  const seekNonce = useDirectorStore((s) => s.seekNonce);
  const previewActive = useDirectorStore((s) => s.playing || s.activeCameraId !== null);

  // seek / play / stop 会递增 seekNonce，此处把内部时钟同步到 store 的 playhead
  useEffect(() => {
    const st = useDirectorStore.getState();
    elapsed.current = st.playhead;
    lastReport.current = st.playhead;
  }, [seekNonce]);

  // 退出机位视角时把相机复位到自由观察位，否则用户会被困在最后一个机位
  useEffect(() => {
    if (!previewActive) {
      camera.position.set(8, 6, 8);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 1, 0);
      const pc = camera as THREE.PerspectiveCamera;
      if (pc.fov !== 50) {
        pc.fov = 50;
        pc.updateProjectionMatrix();
      }
    }
  }, [previewActive, camera]);

  useFrame((_state, delta) => {
    const st = useDirectorStore.getState();
    const dt = Math.min(delta, 0.1);
    const total = totalDuration(st.cameras);

    if (st.playing && st.cameras.length > 0 && total > 0) {
      elapsed.current += dt;
      if (elapsed.current >= total) {
        if (st.loop) {
          elapsed.current = 0;
          lastReport.current = 0;
        } else {
          elapsed.current = total;
          st.pause();
        }
      }
    } else if (!st.playing) {
      elapsed.current = st.playhead;
    }

    // 播放态：用转场窗口求「出镜 + 入镜」两个镜头槽；
    // 编辑态（点选单个机位）：只看该机位，保持所见即所编辑，不做转场。
    let frame: FrameState | null = null;
    if (st.playing) {
      frame = frameAt(st.cameras, elapsed.current);
    } else {
      const cam = st.cameras.find((c) => c.id === st.activeCameraId) || null;
      if (cam) {
        const start = shotStartOf(st.cameras, cam.id);
        const duration = durOf(cam);
        const localT = Math.max(0, Math.min(duration, elapsed.current - start));
        frame = {
          slots: [{
            index: st.cameras.indexOf(cam),
            cam,
            localT,
            duration,
            progress: duration > 0 ? Math.min(1, Math.max(0, localT / duration)) : 0,
          }],
          blend: 0,
          transitioning: false,
          boundary: -1,
        };
      }
    }

    // 低频回写进度（~8fps）。若每帧 set，整块 1000 行面板会被拖垮。
    if (st.playing && Math.abs(elapsed.current - lastReport.current) > 0.12) {
      lastReport.current = elapsed.current;
      const last = frame ? frame.slots[frame.slots.length - 1] : undefined;
      st.reportProgress(elapsed.current, last?.cam.id ?? null);
    }

    // 发布给白模动画 / 转场遮挡（可变对象，不触发 React 重渲染 → 60fps 平滑）
    previewClock.t = elapsed.current;
    previewClock.playing = st.playing;

    if (frame && frame.slots.length) {
      // cut 模式把连续 blend 量化成 0/1，退回硬切；dissolve / move 保留连续插值
      const blend = effectiveBlend(frame.blend, st.transitionMode);
      const dom = frame.slots[blend < 0.5 ? 0 : frame.slots.length - 1];
      previewClock.localT = dom.localT;
      previewClock.duration = dom.duration;
      previewClock.progress = dom.progress;
      previewClock.shotIndex = dom.index;

      previewFrame.slots.length = 0;
      for (const s of frame.slots) {
        previewFrame.slots.push({
          index: s.index,
          localT: s.localT,
          duration: s.duration,
          progress: s.progress,
        });
      }
      previewFrame.blend = blend;
      previewFrame.transitioning = frame.transitioning;
      previewFrame.fade = frame.transitioning && st.transitionMode === 'dissolve'
        ? fadeOf(blend)
        : 0;

      // 相机：单镜直接落位；转场窗口内把出镜/入镜两个位姿插值，取代硬切
      const poseA = cameraPose(frame.slots[0].cam, frame.slots[0].localT, frame.slots[0].duration);
      const pose = frame.slots.length > 1
        ? lerpPose(
            poseA,
            cameraPose(frame.slots[1].cam, frame.slots[1].localT, frame.slots[1].duration),
            blend,
          )
        : poseA;
      applyPose(camera as THREE.PerspectiveCamera, pose);
    } else {
      // 自由观察（未播放、未选机位）：动作时钟归零，白模回到静态站位
      previewClock.localT = 0;
      previewClock.duration = 0;
      previewClock.progress = 0;
      previewClock.shotIndex = -1;
      previewFrame.slots.length = 0;
      previewFrame.blend = 0;
      previewFrame.transitioning = false;
      previewFrame.fade = 0;
    }
  });

  return null;
}

// ─────────────────────────────────────────────────────────────
// 场景
// ─────────────────────────────────────────────────────────────

function SceneContent() {
  // 分字段订阅：时间轴每 0.12s 回写 playhead 时，这里不会重渲染整场景
  const characters = useDirectorStore((s) => s.characters);
  const props = useDirectorStore((s) => s.props);
  const cameras = useDirectorStore((s) => s.cameras);
  const scene = useDirectorStore((s) => s.scene);
  const showGrid = useDirectorStore((s) => s.showGrid);
  const selectCharacter = useDirectorStore((s) => s.selectCharacter);
  const selectProp = useDirectorStore((s) => s.selectProp);
  const previewActive = useDirectorStore((s) => s.playing || s.activeCameraId !== null);

  const { scene: threeScene } = useThree();

  useEffect(() => {
    threeScene.background = new THREE.Color(scene.background);
    threeScene.fog = scene.fogEnabled
      ? new THREE.FogExp2(scene.fogColor, scene.fogDensity)
      : null;
  }, [scene.background, scene.fogEnabled, scene.fogColor, scene.fogDensity, threeScene]);

  return (
    <>
      <GradientSky base={scene.background} />
      <TransitionFade />

      {/* 三点布光：主光 + 冷色补光 + 暖色轮廓光。白模靠光影看体积，布光反而更重要 */}
      <ambientLight intensity={scene.ambientLightIntensity} />
      <hemisphereLight args={['#eaf0fa', '#8c97a8', 0.42]} />
      <directionalLight
        position={[
          scene.directionalLightPosition.x,
          scene.directionalLightPosition.y,
          scene.directionalLightPosition.z,
        ]}
        intensity={scene.directionalLightIntensity}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-6, 4, -4]} intensity={0.3} color="#c8d8f0" />
      <directionalLight position={[0, 5, -8]} intensity={0.38} color="#ffe6c8" />

      {/* 地面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color={CLAY_GROUND} roughness={0.95} metalness={0} />
      </mesh>
      <ContactShadows
        position={[0, 0.012, 0]}
        opacity={0.5}
        scale={26}
        blur={2.6}
        far={5}
        resolution={512}
        color="#5b6678"
      />

      {/* 网格/坐标轴/机位标记只在自由视角显示，机位构图里保持画面干净 */}
      {!previewActive && showGrid && (
        <Grid
          args={[50, 50]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#dbe3f2"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#8d9bb2"
          fadeDistance={30}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid
        />
      )}

      {characters.map((c) => (
        <CharacterMesh key={c.id} character={c} />
      ))}
      {props.map((p) => (
        <PropMesh key={p.id} prop={p} />
      ))}
      {!previewActive &&
        cameras.map((cam) => <CameraPreview key={cam.id} camera={cam} />)}

      {!previewActive && (
        <>
          <mesh
            position={[0, -0.01, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={() => {
              selectCharacter(null);
              selectProp(null);
            }}
          >
            <planeGeometry args={[100, 100]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
          <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport axisColors={['#ff6b6b', '#51cf66', '#339af0']} labelColor="white" />
          </GizmoHelper>
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.05}
            minDistance={2}
            maxDistance={30}
            maxPolarAngle={Math.PI / 2 - 0.05}
          />
        </>
      )}

      <CameraRig />
    </>
  );
}

export function DirectorCanvas({
  canvasRef,
}: {
  canvasRef?: React.RefObject<HTMLCanvasElement>;
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [8, 6, 8], fov: 50 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      ref={canvasRef as any}
    >
      <SceneContent />
    </Canvas>
  );
}
