import React from 'react';
import { PIPELINE_STEPS, isStepDone, getUnlockedSteps } from './PipelineSteps';

export function PipelineSidebar({ project, currentStep, onStepChange, onBack }) {
  const unlocked = getUnlockedSteps(project);

  return (
    <div style={{
      width: 200,
      background: '#eef3fa',
      borderRight: '1px solid rgba(15,23,42,0.16)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflowY: 'auto'
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 16px',
        borderBottom: '1px solid rgba(15,23,42,0.16)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>🎬</span>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em' }}>烬序</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Studio</div>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div style={{ padding: '16px', borderBottom: '1px solid rgba(15,23,42,0.16)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>完成度</span>
          <span style={{ color: '#7c3aed', fontSize: 11, fontWeight: 600 }}>
            {Math.round(PIPELINE_STEPS.filter(s => isStepDone(project, s.id)).length / PIPELINE_STEPS.length * 100)}%
          </span>
        </div>
        <div style={{ height: 3, background: 'rgba(15,23,42,0.16)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${PIPELINE_STEPS.filter(s => isStepDone(project, s.id)).length / PIPELINE_STEPS.length * 100}%`,
            background: 'linear-gradient(90deg, #7c3aed, #2563eb)',
            borderRadius: 2
          }} />
        </div>
      </div>

      {/* Steps */}
      <div style={{ flex: 1, padding: '8px 0' }}>
        {PIPELINE_STEPS.map((step) => {
          const isDone = isStepDone(project, step.id);
          const isCurrent = currentStep === step.id;
          const isUnlocked = unlocked.has(step.id);

          return (
            <button
              key={step.id}
              onClick={() => isUnlocked && onStepChange(step.id)}
              disabled={!isUnlocked && !isCurrent}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                border: 'none',
                background: isCurrent
                  ? 'rgba(109, 40, 217, 0.15)'
                  : isDone
                    ? 'rgba(34, 197, 94, 0.08)'
                    : 'transparent',
                cursor: isUnlocked || isCurrent ? 'pointer' : 'not-allowed',
                opacity: isUnlocked || isCurrent ? 1 : 0.4,
                transition: 'all 0.2s',
                textAlign: 'left'
              }}
            >
              <div style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                background: isDone
                  ? 'rgba(34, 197, 94, 0.2)'
                  : isCurrent
                    ? 'rgba(109, 40, 217, 0.3)'
                    : 'rgba(15,23,42,0.08)',
                flexShrink: 0
              }}>
                {isDone ? '✓' : step.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  color: isCurrent ? '#7c3aed' : isDone ? '#22c55e' : 'rgba(255,255,255,0.7)',
                  fontWeight: isCurrent ? 600 : 400,
                  fontSize: 13,
                  marginBottom: 2
                }}>
                  {step.label}
                </div>
                <div style={{ color: 'rgba(15,23,42,0.35)', fontSize: 10, lineHeight: 1.4 }}>
                  {step.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(15,23,42,0.16)' }}>
        <button
          onClick={onBack}
          style={{
            width: '100%',
            padding: '10px',
            background: 'rgba(15,23,42,0.08)',
            border: '1px solid rgba(15,23,42,0.16)',
            borderRadius: 6,
            color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}
        >
          <span>←</span> 返回列表
        </button>
      </div>
    </div>
  );
}
