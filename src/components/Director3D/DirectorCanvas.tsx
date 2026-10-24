import { useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import {
  OrbitControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
  TransformControls,
  Html,
  useGLTF,
} from '@react-three/drei';
import * as THREE from 'three';
import { useMemo, Suspense } from 'react';
import { useDirectorStore } from './store';
import { Character, Prop, CameraShot, Vector3 } from './types';

// 角色模型（胶囊体+头部+方向指示）
function CharacterMesh({ character }: { character: Character }) {
  const { selectedCharacterId, selectCharacter, updateCharacter } =
    useDirectorStore();
  const isSelected = selectedCharacterId === character.id;
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.set(
        character.position.x,
        character.position.y,
        character.position.z
      );
      groupRef.current.rotation.set(
        character.rotation.x,
        character.rotation.y,
        character.rotation.z
      );
      groupRef.current.scale.setScalar(character.scale);
    }
  });

  return (
    <group
      ref={groupRef}
      onClick={(e) => {
        e.stopPropagation();
        selectCharacter(character.id);
      }}
    >
      {character.modelUrl ? (
        <Suspense fallback={null}>
          <CustomModel url={character.modelUrl} targetSize={1.6} />
        </Suspense>
      ) : (
        <>
          {/* 身体 */}
          <mesh position={[0, 0.75, 0]}>
            <capsuleGeometry args={[0.3, 1, 8, 16]} />
            <meshStandardMaterial
              color={character.color}
              emissive={isSelected ? character.color : '#000'}
              emissiveIntensity={isSelected ? 0.3 : 0}
            />
          </mesh>
          {/* 头部 */}
          <mesh position={[0, 1.6, 0]}>
            <sphereGeometry args={[0.25, 16, 16]} />
            <meshStandardMaterial color={character.color} />
          </mesh>
          {/* 朝向指示（前方箭头） */}
          <mesh position={[0, 1, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.1, 0.3, 8]} />
            <meshStandardMaterial color="#fff" />
          </mesh>
        </>
      )}
      {/* 名字标签 */}
      <Html position={[0, 2.2, 0]} center distanceFactor={8}>
        <div
          style={{
            color: '#fff',
            fontSize: '12px',
            background: isSelected ? 'rgba(79,172,254,0.9)' : 'rgba(0,0,0,0.6)',
            padding: '2px 8px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {character.name}
        </div>
      </Html>
      {/* 选中光环 */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[0.5, 0.6, 32]} />
          <meshBasicMaterial color="#4facfe" side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

// 道具模型
function PropMesh({ prop }: { prop: Prop }) {
  const { selectedPropId, selectProp } = useDirectorStore();
  const isSelected = selectedPropId === prop.id;
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.set(
        prop.position.x,
        prop.position.y,
        prop.position.z
      );
      meshRef.current.rotation.set(
        prop.rotation.x,
        prop.rotation.y,
        prop.rotation.z
      );
      meshRef.current.scale.set(prop.scale.x, prop.scale.y, prop.scale.z);
    }
  });

  const renderGeometry = () => {
    switch (prop.type) {
      case 'box':
        return <boxGeometry args={[1, 1, 1]} />;
      case 'sphere':
        return <sphereGeometry args={[0.5, 16, 16]} />;
      case 'cylinder':
        return <cylinderGeometry args={[0.5, 0.5, 1, 16]} />;
      case 'plane':
        return <planeGeometry args={[2, 2]} />;
      default:
        return <boxGeometry args={[1, 1, 1]} />;
    }
  };

  return (
    <mesh
      ref={meshRef}
      onClick={(e) => {
        e.stopPropagation();
        selectProp(prop.id);
      }}
    >
      {renderGeometry()}
      <meshStandardMaterial
        color={prop.color}
        emissive={isSelected ? prop.color : '#000'}
        emissiveIntensity={isSelected ? 0.4 : 0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// 自定义 GLB 模型（尺寸归一化 + 脚底落地）
function CustomModel({
  url,
  targetSize = 1.6,
  position = [0, 0, 0],
}: {
  url: string;
  targetSize?: number;
  position?: [number, number, number];
}) {
  const { scene: loaded } = useGLTF(url);
  const model = useMemo(() => {
    const cloned = loaded.clone(true);
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const minY = box.min.y;
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const k = targetSize / maxDim;
    cloned.scale.setScalar(k);
    cloned.position.set(-center.x * k, -minY * k, -center.z * k);
    cloned.traverse((o: any) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return cloned;
  }, [loaded, targetSize]);
  return <primitive object={model} position={position} />;
}

// 机位预览（虚拟相机位置显示）
function CameraPreview({ camera }: { camera: CameraShot }) {
  const { activeCameraId, setActiveCamera } = useDirectorStore();
  const isActive = activeCameraId === camera.id;
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.set(
        camera.position.x,
        camera.position.y,
        camera.position.z
      );
      groupRef.current.lookAt(
        camera.target.x,
        camera.target.y,
        camera.target.z
      );
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
      {/* 相机锥体 */}
      <mesh>
        <coneGeometry args={[0.15, 0.4, 8]} />
        <meshStandardMaterial
          color={isActive ? '#ffd700' : '#888'}
          emissive={isActive ? '#ffd700' : '#000'}
          emissiveIntensity={isActive ? 0.5 : 0}
        />
      </mesh>
      {/* 视线 */}
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
        <lineBasicMaterial color={isActive ? '#ffd700' : '#666'} />
      </line>
      <Html position={[0, 0.5, 0]} center distanceFactor={8}>
        <div
          style={{
            color: '#fff',
            fontSize: '10px',
            background: isActive ? 'rgba(255,215,0,0.9)' : 'rgba(0,0,0,0.6)',
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

// 场景内容
function SceneContent() {
  const {
    characters,
    props,
    cameras,
    scene,
    showGrid,
    selectedCharacterId,
    selectedPropId,
    selectCharacter,
    selectProp,
  } = useDirectorStore();

  const { scene: threeScene } = useThree();

  useEffect(() => {
    threeScene.background = new THREE.Color(scene.background);
    if (scene.fogEnabled) {
      threeScene.fog = new THREE.FogExp2(scene.fogColor, scene.fogDensity);
    } else {
      threeScene.fog = null;
    }
  }, [scene, threeScene]);

  // 加载自定义场景模型（生成结果 sceneModelUrl 或手动配置 environmentModelUrl）
  const EnvironmentModel = () => {
    const modelUrl = scene.environmentModelUrl || scene.sceneModelUrl;
    if (!modelUrl || scene.showEnvironmentModel === false) return null;
    return (
      <Suspense fallback={null}>
        <CustomModel url={modelUrl} targetSize={8} position={[0, 0, 0]} />
      </Suspense>
    );
  };

  return (
    <>
      {/* 自定义场景模型 */}
      <EnvironmentModel />
      {/* 灯光 */}
      <ambientLight intensity={scene.ambientLightIntensity} />
      <directionalLight
        position={[
          scene.directionalLightPosition.x,
          scene.directionalLightPosition.y,
          scene.directionalLightPosition.z,
        ]}
        intensity={scene.directionalLightIntensity}
        castShadow
      />

      {/* 地面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color={scene.groundColor} />
      </mesh>

      {/* 网格 */}
      {showGrid && (
        <Grid
          args={[50, 50]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#dbe3f2"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#4a4a6a"
          fadeDistance={30}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid
        />
      )}

      {/* 角色 */}
      {characters.map((c) => (
        <CharacterMesh key={c.id} character={c} />
      ))}

      {/* 道具 */}
      {props.map((p) => (
        <PropMesh key={p.id} prop={p} />
      ))}

      {/* 机位预览 */}
      {cameras.map((cam) => (
        <CameraPreview key={cam.id} camera={cam} />
      ))}

      {/* 点击空白取消选中 */}
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

      {/* 坐标轴 */}
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
  );
}

// 主3D画布
export function DirectorCanvas({ canvasRef }: { canvasRef?: React.RefObject<HTMLCanvasElement> }) {
  return (
    <Canvas
      shadows
      camera={{ position: [8, 6, 8], fov: 50 }}
      style={{ width: '100%', height: '100%' }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      ref={canvasRef as any}
    >
      <Suspense fallback={null}>
        <SceneContent />
      </Suspense>
    </Canvas>
  );
}
