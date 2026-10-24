import React, { useState } from 'react';
import { Icon, Btn, Pill } from './ui';
import {
  MODALITIES, PROVIDER_PRESETS, getAllModelConfig, saveAllModelConfig,
} from '../../lib/providers/index.js';

/**
 * 开源版「模型配置（API Key）」面板。
 *
 * 与旧版「账号 / 调度机鉴权 / 计费」彻底无关：开源版不依赖任何后端，所有生成
 * 直连用户自备的模型 API。配置按「模态」写入本机 localStorage（MODEL_SETTINGS），不上传。
 *
 * 统一抽象为 OpenAI 兼容接口（baseUrl + apiKey + model），可对接 OpenAI / DeepSeek /
 * 通义 / 智谱 / Moonshot / Ollama 等绝大多数服务；视频 / 音乐等非标准模态额外允许 endpoint。
 */

const ORDER = ['text', 'image', 'video', 'tts', 'music', 'model3d'];

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(15,23,42,0.064)', border: '1px solid rgba(15,23,42,0.16)',
  borderRadius: 7, padding: '8px 10px', color: '#374151', fontSize: 12.5,
  fontFamily: 'inherit', outline: 'none',
};
const labelStyle = { fontSize: 11.5, color: '#5b6678', marginBottom: 5, display: 'block' };
const subCard = {
  padding: 14, borderRadius: 9, marginBottom: 12,
  background: 'rgba(15,23,42,0.032)', border: '1px solid rgba(15,23,42,0.096)',
};

export function ApiSettings() {
  const [cfg, setCfg] = useState(() => {
    const all = getAllModelConfig();
    const init = {};
    ORDER.forEach((m) => {
      const meta = MODALITIES[m] || {};
      init[m] = {
        baseUrl: all[m]?.baseUrl ?? meta.defaultBase ?? '',
        apiKey: all[m]?.apiKey ?? '',
        model: all[m]?.model ?? meta.defaultModel ?? '',
        endpoint: all[m]?.endpoint ?? meta.defaultEndpoint ?? '',
      };
    });
    return init;
  });
  const [saved, setSaved] = useState(false);

  const setField = (m, key, val) =>
    setCfg((c) => ({ ...c, [m]: { ...c[m], [key]: val } }));

  const onSave = () => {
    saveAllModelConfig(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div style={{
      padding: 18, borderRadius: 11,
      background: 'rgba(15,23,42,0.048)', border: '1px solid rgba(15,23,42,0.128)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: 'rgba(109,40,217,.13)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Icon name="lock" size={15} color="#6d28d9" /></div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1f2937' }}>模型配置（API Key）</div>
      </div>
      <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 14, lineHeight: 1.6 }}>
        开源版不依赖任何后端，所有生成直连你自备的模型 API。配置按「模态」保存到本机浏览器（localStorage），不会上传。
        以 OpenAI 兼容接口为统一抽象，可对接 OpenAI / DeepSeek / 通义 / 智谱 / Moonshot / 本地 Ollama 等。
      </div>

      {ORDER.map((m) => {
        const meta = MODALITIES[m] || {};
        const c = cfg[m] || {};
        const configured = !!(c.apiKey && c.apiKey.trim());
        const showEndpoint = m === 'video' || m === 'music';
        const presetValue =
          PROVIDER_PRESETS.find((p) => p.base === (c.baseUrl || ''))?.base || '__custom__';

        return (
          <div key={m} style={subCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{meta.label || m}</div>
              {configured
                ? <Pill tone="green">已配置</Pill>
                : <Pill tone="orange">未配置</Pill>}
            </div>
            {meta.desc && (
              <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 12 }}>{meta.desc}</div>
            )}

            {/* 厂商预设 */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>厂商预设（一键填入地址）</label>
              <select
                value={presetValue}
                onChange={(e) => { if (e.target.value !== '__custom__') setField(m, 'baseUrl', e.target.value); }}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {PROVIDER_PRESETS.map((p) => (
                  <option key={p.name} value={p.base}>{p.name}</option>
                ))}
                <option value="__custom__">自定义…</option>
              </select>
            </div>

            {/* baseUrl */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>API 基地址 (Base URL)</label>
              <input
                style={inputStyle} value={c.baseUrl || ''}
                placeholder={meta.defaultBase || 'https://api.openai.com/v1'}
                onChange={(e) => setField(m, 'baseUrl', e.target.value)}
              />
            </div>

            {/* apiKey */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>API Key</label>
              <input
                type="password" style={inputStyle} value={c.apiKey || ''}
                placeholder="sk-...（仅存于本机）"
                onChange={(e) => setField(m, 'apiKey', e.target.value)}
              />
            </div>

            {/* model */}
            <div style={{ marginBottom: showEndpoint ? 12 : 0 }}>
              <label style={labelStyle}>模型名 (Model)</label>
              <input
                style={inputStyle} value={c.model || ''}
                placeholder={meta.placeholderModel || 'gpt-4o-mini'}
                onChange={(e) => setField(m, 'model', e.target.value)}
              />
            </div>

            {/* endpoint（仅视频 / 音乐等非标准模态） */}
            {showEndpoint && (
              <div style={{ marginBottom: 0 }}>
                <label style={labelStyle}>接口路径 (Endpoint)</label>
                <input
                  style={inputStyle} value={c.endpoint || ''}
                  placeholder={meta.defaultEndpoint || '/video/generations'}
                  onChange={(e) => setField(m, 'endpoint', e.target.value)}
                />
              </div>
            )}
          </div>
        );
      })}

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
        {saved && (
          <span style={{ fontSize: 11.5, color: '#22c55e', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="check" size={13} color="#22c55e" /> 已保存到本机
          </span>
        )}
        <Btn variant="primary" onClick={onSave}>
          <Icon name="save" size={13} /> 保存全部配置
        </Btn>
      </div>
    </div>
  );
}
