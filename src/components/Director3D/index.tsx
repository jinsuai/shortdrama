import { useRef, useState, useEffect } from 'react';
import { DirectorCanvas } from './DirectorCanvas';
import { DirectorPanel } from './DirectorPanel';
import { useDirectorStore } from './store';
import { CAMERA_DEFAULT_DURATION } from './types';

export interface Director3DProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: React.CSSProperties;
  onExport?: (data: object) => void;
  onCameraReference?: (cameraId: string, data: object) => void;
  onRenderFrame?: (imageDataUrl: string) => void;
  onFirstFrame?: (imageDataUrl: string) => void;
  project?: any;
  update?: (patch: any) => void;
  log?: (message: string) => void;
}

const ASPECT_MAP: Record<string, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  '2.35:1': 2.35,
};

const durOf = (c: any) =>
  Number.isFinite(c?.duration) && c.duration > 0 ? c.duration : CAMERA_DEFAULT_DURATION;

/** 等若干渲染帧，确保 CameraRig 已把主相机切到目标机位、且画面已绘制 */
function waitFrames(n = 3): Promise<void> {
  return new Promise((resolve) => {
    let left = n;
    const step = () => {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/** 把画布按机位画幅裁切、统一输出 1080 短边，得到干净的构图参考图 */
function cropToAspect(src: HTMLCanvasElement, aspect: string): string {
  const w = src.width;
  const h = src.height;
  if (!w || !h) return src.toDataURL('image/png');
  const target = ASPECT_MAP[aspect] || 16 / 9;
  const srcRatio = w / h;
  let cw = w;
  let ch = h;
  let cx = 0;
  let cy = 0;
  if (srcRatio > target) {
    cw = Math.round(h * target);
    cx = Math.round((w - cw) / 2);
  } else {
    ch = Math.round(w / target);
    cy = Math.round((h - ch) / 2);
  }
  const outH = 1080;
  const outW = Math.round(outH * target);
  const off = document.createElement('canvas');
  off.width = outW;
  off.height = outH;
  const ctx = off.getContext('2d');
  if (!ctx) return src.toDataURL('image/png');
  ctx.drawImage(src, cx, cy, cw, ch, 0, 0, outW, outH);
  return off.toDataURL('image/png');
}

function download(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * 3D 导演台
 *
 * 白模空间预演：布景/摆位 → 机位与运镜 → 时间轴切镜 → 抽帧导出构图参考 → 回流分镜首帧。
 * 以前「渲染首帧」截的是用户随手转的自由视角，且回调根本没接；现在截的是机位相机。
 */
export function Director3D({
  width = '100%',
  height = '100%',
  className,
  style,
  onExport,
  onCameraReference,
  onRenderFrame,
  onFirstFrame,
  project,
  update,
  log,
}: Director3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);
  const [frames, setFrames] = useState<any[]>([]);

  const activeCameraId = useDirectorStore((s) => s.activeCameraId);
  const previewCameraId = useDirectorStore((s) => s.previewCameraId);
  const playing = useDirectorStore((s) => s.playing);
  const cameras = useDirectorStore((s) => s.cameras);
  const loadScene = useDirectorStore((s) => s.loadScene);
  const exportScene = useDirectorStore((s) => s.exportScene);
  const setActiveCamera = useDirectorStore((s) => s.setActiveCamera);
  const pause = useDirectorStore((s) => s.pause);
  const stop = useDirectorStore((s) => s.stop);
  const seek = useDirectorStore((s) => s.seek);
  const play = useDirectorStore((s) => s.play);
  const setLoop = useDirectorStore((s) => s.setLoop);

  // 进入导演台时回灌项目里存过的布景/机位/构图（只在切换项目时灌一次）
  useEffect(() => {
    if (project?.director3d) {
      loadScene(project.director3d);
      setFrames(Array.isArray(project.director3d.frames) ? project.director3d.frames : []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const previewActive = activeCameraId !== null || playing;
  const viewCam =
    cameras.find((c) => c.id === (playing ? previewCameraId : activeCameraId)) || null;
  const viewAspect = viewCam?.aspect || '16:9';
  const viewRatio = ASPECT_MAP[viewAspect] || 16 / 9;

  /** 写回项目（App 的 update 支持对象或函数两种形态，这里用函数避免覆盖别人刚改的字段） */
  const writeProject = (fn: (p: any) => any) => {
    if (typeof update === 'function') update(fn);
  };

  /** 切到某个机位并截一张构图参考图 */
  const captureCamera = async (cameraId: string, startSeconds = 0) => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('画布未就绪');
    const st = useDirectorStore.getState();
    st.pause();
    st.seek(startSeconds);
    st.setActiveCamera(cameraId);
    await waitFrames(3);
    const cam = useDirectorStore.getState().cameras.find((c) => c.id === cameraId);
    return cropToAspect(canvas, cam?.aspect || '16:9');
  };

  /** 顶部「渲染首帧并生成视频」：把当前机位构图作为首帧送出去 */
  const handleRenderFrame = async () => {
    const camId = activeCameraId || cameras[0]?.id;
    if (!camId) {
      log?.('还没有机位，请先新增，或点「🤖 AI 布机位」');
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await captureCamera(camId);
      // 首帧自包含回流：写进项目 + 01 号分镜，不再依赖外部回调是否接线
      writeProject((p) => ({
        ...p,
        director3d: { ...(p?.director3d || {}), firstFrame: dataUrl },
        shots: Array.isArray(p?.shots) && p.shots.length
          ? p.shots.map((s: any, i: number) => (i === 0 ? { ...s, imageUrl: dataUrl } : s))
          : p?.shots,
      }));
      onRenderFrame?.(dataUrl);
      onFirstFrame?.(dataUrl);
      log?.('已按机位视角渲染首帧，写入项目与 01 号分镜 · 去「05 动态」即可用它生成视频');
    } catch (e: any) {
      log?.(`渲染首帧失败：${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  /** 按时间轴逐镜抽帧：导出构图参考图 + 写回项目 + 回流到分镜首帧 */
  const handleExportFrames = async () => {
    const list = useDirectorStore.getState().cameras;
    if (!list.length) {
      log?.('还没有机位，请先新增，或点「🤖 AI 布机位」');
      return;
    }
    setBusy(true);
    const out: any[] = [];
    try {
      let acc = 0;
      for (let i = 0; i < list.length; i++) {
        const cam = list[i];
        const dataUrl = await captureCamera(cam.id, acc);
        acc += durOf(cam);
        out.push({
          index: i,
          cameraId: cam.id,
          name: cam.name,
          aspect: cam.aspect,
          movement: cam.movement,
          duration: durOf(cam),
          dataUrl,
        });
        log?.(`已抽帧 ${i + 1}/${list.length}：${cam.name}`);
      }
      setFrames(out);
      writeProject((p) => ({
        ...p,
        director3d: { ...(p?.director3d || {}), frames: out, firstFrame: out[0]?.dataUrl || '' },
        // 构图回流：按镜头顺序写进分镜首帧，05 动态生成视频时自动吃到
        shots: Array.isArray(p?.shots) && p.shots.length
          ? p.shots.map((s: any, i: number) => (out[i] ? { ...s, imageUrl: out[i].dataUrl } : s))
          : p?.shots,
      }));
      onCameraReference?.('all', { frames: out, exportedAt: new Date().toISOString() });
      log?.(`已导出 ${out.length} 张构图参考图并写入项目；分镜首帧已同步，可直接去「05 动态」生成视频`);
    } catch (e: any) {
      log?.(`导出构图失败：${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  /** 只导出当前选中机位的一张 */
  const handleExportFrame = async (cameraId: string) => {
    const cam = cameras.find((c) => c.id === cameraId);
    if (!cam) return;
    setBusy(true);
    try {
      const dataUrl = await captureCamera(cameraId);
      download(dataUrl, `构图_${cam.name || '机位'}.png`);
      onCameraReference?.(cameraId, { camera: cam, dataUrl });
      log?.(`已导出机位「${cam.name}」的构图参考图`);
    } catch (e: any) {
      log?.(`导出失败：${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  /** 录制整条时间轴预演为 webm（浏览器原生，零依赖） */
  const handleExportPreviewVideo = () => {
    const canvas = canvasRef.current;
    if (!canvas || typeof (canvas as any).captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      log?.('当前环境不支持画布录制（需桌面端 / 新版浏览器）');
      return;
    }
    const list = useDirectorStore.getState().cameras;
    if (!list.length) {
      log?.('还没有机位，无法录制预演');
      return;
    }
    const total = list.reduce((a, c) => a + durOf(c), 0);
    try {
      const stream = (canvas as any).captureStream(30) as MediaStream;
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `预演_${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        log?.('预演视频已导出（webm）');
      };
      // 录制期间临时关循环：否则时间轴到末尾会绕回第 1 镜，
      // 视频尾巴平白多出一次硬切（与「镜头之间要平滑」相冲突）。
      const prevLoop = useDirectorStore.getState().loop;
      setLoop(false);
      rec.start();
      seek(0);
      play();
      window.setTimeout(() => {
        try { rec.stop(); } catch (_) { /* 已停止 */ }
        pause();
        setLoop(prevLoop);
        log?.(`预演录制完成（${total.toFixed(1)}s）`);
      }, (total + 0.4) * 1000);
      log?.(`开始录制时间轴预演（${total.toFixed(1)}s）…`);
    } catch (e: any) {
      log?.(`录制预演失败：${e?.message || e}`);
    }
  };

  const handleSave = () => {
    const data = exportScene();
    writeProject((p) => ({ ...p, director3d: { ...(p?.director3d || {}), ...(data as any), frames } }));
    onExport?.(data);
    log?.('导演台布景/机位已保存到项目');
  };

  const handleExitPreview = () => {
    stop();
    setActiveCamera(null);
    log?.('已退出机位视角，回到自由观察');
  };

  const btn = (bg: string, disabled = false): React.CSSProperties => ({
    padding: '6px 10px',
    background: bg,
    border: '1px solid rgba(15,23,42,0.12)',
    borderRadius: 6,
    color: '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    opacity: disabled ? 0.6 : 1,
  });

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        width,
        height,
        background: '#f6f8fc',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* 左侧控制面板 */}
      <DirectorPanel
        project={project}
        update={update}
        log={log}
        onExportFrames={handleExportFrames}
        onExportFrame={handleExportFrame}
      />

      {/* 右侧 3D 画布 */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <DirectorCanvas canvasRef={canvasRef} />

        {/* 构图辅助线：三分线 + 安全框 + 画幅标签（仅在机位视角显示，不进截图） */}
        {previewActive && (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
              <g stroke="rgba(255,255,255,0.55)" strokeWidth="1" strokeDasharray="6 5">
                <line x1="33.33%" y1="0" x2="33.33%" y2="100%" />
                <line x1="66.66%" y1="0" x2="66.66%" y2="100%" />
                <line x1="0" y1="33.33%" x2="100%" y2="33.33%" />
                <line x1="0" y1="66.66%" x2="100%" y2="66.66%" />
              </g>
              <rect x="5%" y="5%" width="90%" height="90%" fill="none"
                stroke="rgba(255,255,255,0.35)" strokeWidth="1" strokeDasharray="4 6" />
              <rect x="0" y="0" width="100%" height="100%" fill="none"
                stroke="rgba(15,23,42,0.35)" strokeWidth="2" />
            </svg>
            <div style={{
              position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(15,23,42,0.78)', color: '#fff', fontSize: 11,
              padding: '3px 10px', borderRadius: 4, whiteSpace: 'nowrap',
            }}>
              🎬 {viewCam?.name || '机位视角'} · {viewAspect} · 三分线/安全框
            </div>
          </div>
        )}

        {/* 顶部工具栏 */}
        <div
          style={{
            position: 'absolute',
            top: previewActive ? 40 : 12,
            left: 12,
            right: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 8,
            pointerEvents: 'none',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              background: 'rgba(15,23,42,0.78)',
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 12,
              color: '#fff',
              pointerEvents: 'auto',
            }}
          >
            🖱️ 左键旋转 · 右键平移 · 滚轮缩放 · 点选物体 / 机位
          </div>
          <div style={{ display: 'flex', gap: 6, pointerEvents: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button style={btn('linear-gradient(135deg,#f59e0b,#d97706)', busy)}
              disabled={busy} onClick={handleRenderFrame}>🎬 渲染首帧并生成视频</button>
            <button style={btn('linear-gradient(135deg,#4facfe,#0284c7)', busy)}
              disabled={busy} onClick={handleExportFrames}>📸 导出全部构图</button>
            <button style={btn('linear-gradient(135deg,#8b5cf6,#6d28d9)')}
              onClick={handleExportPreviewVideo}>🎞️ 导出预演视频</button>
            <button
              style={{ ...btn('rgba(255,255,255,.92)'), color: '#1f2937' }}
              onClick={handleSave}
            >💾 保存到项目</button>
            {previewActive && (
              <button style={btn('rgba(15,23,42,.82)')} onClick={handleExitPreview}>↩ 退出机位视角</button>
            )}
          </div>
        </div>

        {/* 底部：已抽帧的构图参考缩略图（点一张即可下载） */}
        {frames.length > 0 && (
          <div style={{
            position: 'absolute', left: 12, right: 12, bottom: 42,
            display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 10px',
            background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(15,23,42,0.12)',
            borderRadius: 8,
          }}>
            {frames.map((f: any) => (
              <div key={f.cameraId || f.index} style={{ flex: '0 0 auto', textAlign: 'center' }} title="点击下载这张构图">
                <img
                  src={f.dataUrl}
                  alt={f.name}
                  onClick={() => download(f.dataUrl, `构图_${String(f.index + 1).padStart(2, '0')}_${f.name || ''}.png`)}
                  style={{
                    height: 68, width: Math.round(68 * (ASPECT_MAP[f.aspect] || viewRatio)),
                    objectFit: 'cover', borderRadius: 4, cursor: 'pointer',
                    border: '1px solid rgba(15,23,42,0.16)', display: 'block',
                  }}
                />
                <div style={{ fontSize: 10, color: '#4b5563', marginTop: 3, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.index + 1}. {f.name}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 底部状态栏 */}
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            background: 'rgba(15,23,42,0.78)',
            padding: '4px 10px',
            borderRadius: 4,
            fontSize: 11,
            color: '#e2e8f0',
          }}
        >
          角色: {useDirectorStore.getState().characters.length} · 道具: {useDirectorStore.getState().props.length} · 机位: {cameras.length}
          {busy ? ' · 处理中…' : ''}
        </div>
      </div>
    </div>
  );
}

export { useDirectorStore } from './store';
export * from './types';
