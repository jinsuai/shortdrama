// components/Studio/AutoPipelinePanel.jsx
//
// 第二优先 · 一键全自动流水线 的可视化入口。
// 复用 lib/pipeline/orchestrator.js（九步串跑）+ agent.js（默认建议/兜底）。
//
// 契约：
//   - 传入 project（活对象）与 update（App 的 setter，浅合并 patch 持久化）。
//   - 编排器每步成功后通过 onPatch 把 patch 回传，本面板调用 update 让工程实时落盘。
//   - Agent 开关：开 → 可选步缺模型静默跳过 + 套用 Agent 默认值；关 → 缺模型直接报错提示。

import React, { useState, useRef, useEffect } from 'react';
import { Modal, Btn, Icon, Pill } from './ui';
import { PIPELINE_STAGES, runPipeline } from '../../lib/pipeline/orchestrator.js';

const STATUS_COLOR = {
  pending: '#9aa3b2',
  running: '#6d28d9',
  success: '#16a34a',
  skipped: '#f59e0b',
  error: '#dc2626',
};
const STATUS_TEXT = {
  pending: '待运行', running: '运行中', success: '完成', skipped: '跳过', error: '异常',
};

export function AutoPipelinePanel({ project, update, log, open, onClose }) {
  const [agent, setAgent] = useState(true);
  const [force, setForce] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({});      // stageKey → status
  const [logs, setLogs] = useState([]);              // [{stage, message}]
  const [report, setReport] = useState(null);
  const abortRef = useRef(null);

  // 打开时重置
  useEffect(() => {
    if (open) { setProgress({}); setLogs([]); setReport(null); }
  }, [open]);

  const pushLog = (stage, message) =>
    setLogs((l) => [...l, { stage, message, t: Date.now() }].slice(-200));

  const run = async () => {
    if (running) return;
    setRunning(true);
    setReport(null);
    setProgress({});
    setLogs([]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const onProgress = (stageKey, status, info = {}) => {
      if (status === 'log') { pushLog(stageKey, info.message); return; }
      setProgress((p) => ({ ...p, [stageKey]: status }));
      if (info.message) pushLog(stageKey, `${STATUS_TEXT[status] || status}：${info.message}`);
    };
    const onPatch = (patch) => { update?.(patch); };

    try {
      const rep = await runPipeline(project, {
        onProgress, onPatch, force, signal: ctrl.signal, agent,
      });
      setReport(rep);
      if (log) {
        const ok = rep.done.length;
        const skip = rep.skipped.length;
        const err = rep.errors.length;
        log?.(`一键全自动完成：成功 ${ok} 步，跳过 ${skip} 步，异常 ${err} 步`);
      }
    } catch (e) {
      pushLog('*', `管线中断：${e?.message || e}`);
      if (log) log?.(`一键全自动中断：${e?.message || e}`);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    pushLog('*', '已发送中止信号…');
  };

  const stageRows = PIPELINE_STAGES.map((s) => {
    const st = progress[s.key] || 'pending';
    return { ...s, st };
  });

  const footer = (
    <>
      {running
        ? <Btn variant="primary" onClick={stop}><Icon name="stop" size={12} />停止</Btn>
        : <Btn variant="primary" onClick={run} disabled={!project}><Icon name="play" size={12} />一键全自动</Btn>}
    </>
  );

  return (
    <Modal
      open={open}
      onClose={() => { if (!running) onClose?.(); }}
      title="一键全自动流水线"
      subtitle="九步管线自动串跑 · 每步可手动覆盖 · 已有产物自动跳过"
      width={680}
      footer={footer}
    >
      {/* 选项行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={agent} disabled={running}
            onChange={(e) => setAgent(e.target.checked)} style={{ accentColor: '#6d28d9' }} />
          Agent 模式（建议默认值 + 缺模型静默跳过）
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={force} disabled={running}
            onChange={(e) => setForce(e.target.checked)} style={{ accentColor: '#6d28d9' }} />
          强制重跑（忽略已有产物）
        </label>
        {agent && <Pill tone="purple">Agent</Pill>}
      </div>

      {/* 阶段清单 */}
      <div style={{
        border: '1px solid rgba(15,23,42,0.12)', borderRadius: 10, overflow: 'hidden', marginBottom: 14,
      }}>
        {stageRows.map((s, i) => (
          <div key={s.key} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
            borderBottom: i < stageRows.length - 1 ? '1px solid rgba(15,23,42,0.08)' : 'none',
            background: s.st === 'running' ? 'rgba(109,40,217,.06)' : 'transparent',
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
              background: STATUS_COLOR[s.st], boxShadow: s.st === 'running' ? `0 0 0 3px ${STATUS_COLOR[s.st]}22` : 'none',
            }} />
            <span style={{ fontSize: 11, color: '#7c8798', fontWeight: 600, width: 16 }}>{s.n}</span>
            <span style={{ flex: 1, fontSize: 12.5, color: '#1f2937' }}>{s.label}</span>
            {!s.required && <Pill tone="orange">可选</Pill>}
            <span style={{ fontSize: 11, color: STATUS_COLOR[s.st] }}>{STATUS_TEXT[s.st]}</span>
          </div>
        ))}
      </div>

      {/* 日志 */}
      <div style={{
        height: 168, overflowY: 'auto', background: 'rgba(15,23,42,0.04)', borderRadius: 9,
        padding: 10, fontSize: 11.5, lineHeight: 1.7, color: '#4b5563',
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
      }}>
        {logs.length === 0
          ? <span style={{ color: '#9aa3b2' }}>点击「一键全自动」开始。编排器会按剧本 → 艺术指导 → 资产 → 分镜 → 动态 → 装配 → 配音 → 混音 → 导出 依次串跑，并把结果实时写回工程。</span>
          : logs.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: '#9aa3b2', flexShrink: 0 }}>{(l.stage || '*').padEnd(10, ' ').slice(0, 10)}</span>
              <span style={{ whiteSpace: 'pre-wrap' }}>{l.message}</span>
            </div>
          ))}
      </div>

      {/* 结果摘要 */}
      {report && (
        <div style={{
          marginTop: 12, padding: 12, borderRadius: 9, fontSize: 12, lineHeight: 1.7,
          background: report.errors.length ? 'rgba(220,38,38,.06)' : 'rgba(22,163,74,.06)',
          border: `1px solid ${report.errors.length ? 'rgba(220,38,38,.2)' : 'rgba(22,163,74,.2)'}`,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: '#1f2937' }}>运行结果</div>
          <div>完成 <b>{report.done.length}</b> 步 · 跳过 <b>{report.skipped.length}</b> 步 · 异常 <b>{report.errors.length}</b> 步</div>
          {report.errors.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#dc2626' }}>
              {report.errors.map((e, i) => (
                <li key={i}>{e.stage}：{e.message}</li>
              ))}
            </ul>
          )}
          {report.errors.length === 0 && (
            <div style={{ color: '#16a34a', marginTop: 2 }}>✓ 流水线跑通，可在对应步骤查看/微调结果。</div>
          )}
        </div>
      )}
    </Modal>
  );
}
