import React from 'react';
import { Script } from './Script';
import { ArtDirection } from './ArtDirection';
import { Assets } from './Assets';
import { Storyboard } from './Storyboard';
import { Motion } from './Motion';
import { Assembly } from './Assembly';
import { Voice } from './Voice';
import { FinalMix } from './FinalMix';
import { Export } from './Export';

export function PipelineView({ project, update, log, currentStep, onStepChange, onBack }) {
  const steps = ['script', 'art_direction', 'assets', 'storyboard', 'motion', 'assembly', 'voice', 'final_mix', 'export'];
  const stepIndex = steps.indexOf(currentStep);
  const prevStep = stepIndex > 0 ? steps[stepIndex - 1] : null;
  const nextStep = stepIndex < 8 ? steps[stepIndex + 1] : null;

  const renderContent = () => {
    switch (currentStep) {
      case 'script': return <Script project={project} update={update} log={log} />;
      case 'art_direction': return <ArtDirection project={project} update={update} log={log} />;
      case 'assets': return <Assets project={project} update={update} log={log} />;
      case 'storyboard': return <Storyboard project={project} update={update} log={log} />;
      case 'motion': return <Motion project={project} update={update} log={log} />;
      case 'assembly': return <Assembly project={project} update={update} log={log} />;
      case 'voice': return <Voice project={project} update={update} log={log} />;
      case 'final_mix': return <FinalMix project={project} update={update} log={log} />;
      case 'export': return <Export project={project} update={update} log={log} />;
      default: return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#eef3fa' }}>
      {/* Header */}
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid rgba(15,23,42,0.16)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <button onClick={onBack} style={navBtnStyle}>
          ← 返回项目
        </button>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
          {currentStep.toUpperCase()}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {prevStep && (
            <button onClick={() => onStepChange(prevStep)} style={navBtnStyle}>
              ← 上一步
            </button>
          )}
          {nextStep && (
            <button onClick={() => onStepChange(nextStep)} style={{ ...navBtnStyle, background: '#7c3aed' }}>
              下一步 →
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {renderContent()}
      </div>
    </div>
  );
}

const navBtnStyle = {
  padding: '6px 14px',
  background: 'rgba(15,23,42,0.08)',
  border: '1px solid rgba(15,23,42,0.16)',
  borderRadius: 6,
  color: 'rgba(255,255,255,0.7)',
  cursor: 'pointer',
  fontSize: 12
};
