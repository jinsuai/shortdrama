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

// 内联字段帮助：每个输入框下面一行小字说明
const helpStyle = {
  fontSize: 10.5, color: '#8a93a3', marginTop: 5, lineHeight: 1.5,
};
function HelpHint({ children }) {
  return <div style={helpStyle}>{children}</div>;
}

// 按字段名给的填写说明（与具体模态无关，跨模态通用）
const FIELD_HELP = {
  preset: '选厂商可一键填入地址；选「自定义」则手动填 Base URL。预设只填地址，Key / 模型名仍需自己填。',
  baseUrl: '模型服务的根地址，填到「/v1」或域名根即可。末尾斜杠会自动处理，无需手填。',
  apiKey: '服务商提供的密钥，仅保存在本机浏览器，不会上传到任何服务器。',
  model: '必填。该模态实际调用的模型 ID，如 gpt-4o-mini / deepseek-chat / qwen-max。只填 Key 不填模型名会被下游拒绝。',
  endpoint: '接口路径，可填相对路径（拼到 Base URL 后）或完整 URL。图片默认 /images/generations；图生图若模型要求别的路径（如 /images/edits 或厂商自定义路径），在此覆盖。',
  size: '视频分辨率，厂商特定。部分服务强制特定值（如 720P 必填）；其他按文档填，或留空用服务默认。',
  pollPath: '任务型 API 专用：先返回任务 id、再轮询拿结果（Kling / Runway / Sora 等）。填 /tasks/{id} 或完整轮询 URL；{id} 会自动替换成任务 id。直出型服务（返回即结果 URL）留空即可。',
  videoMode: '生成模式（请求里 mode 字段的取值），决定使用哪类素材：纯文字(text) / 首尾帧(keyframe) / 参考图·音频(reference)。留空则根据本次提交自动推断——有首/尾帧→keyframe，有参考图/音频→reference，都没有→text。换模型只改这里，代码无需动。',
  engine: '厂商自定义的引擎标识字段。默认不发送；只有你的服务商明确要求时才填。',
  sendNegative: '图片请求是否带上 negative_prompt（负向词）。默认勾选，使用内置通用负向词（糊、畸形、水印等）。若你的服务对未知字段做严格校验、带负向词就报错，取消勾选即可，请求体里将不再出现该字段。',
  imageField: '图生图时「参考图」放在哪个字段名下。各厂商不同：常见 image_url / image / init_image / reference_image。留空默认 image_url。填错会导致参考图不被识别——请求会退化成纯文生图或被直接拒绝。',
  imageFieldArray: '参考图的值格式。默认关闭：单图发字符串、多图发数组。若服务把该字段声明为数组（如有些服务的 image 是 string[]），勾选后即使只有一张图也发 [url]。',
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
        pollPath: all[m]?.pollPath ?? '',
        size: all[m]?.size ?? '',
        videoMode: all[m]?.videoMode ?? '',
        engine: all[m]?.engine ?? '',
        // 图片：参考图字段名（留空由后端默认 image_url）与是否按数组发送。
        imageField: all[m]?.imageField ?? '',
        imageFieldArray: all[m]?.imageFieldArray === true,
        // 图片：是否随请求提交 negative_prompt。默认开启（缺失该键亦视为开启），
        // 严格校验未知字段的服务可取消勾选。
        sendNegative: all[m]?.sendNegative !== false,
      };
    });
    return init;
  });
  const [saved, setSaved] = useState(false);
  // 改动未保存时给出显式提醒：徽章只代表「输入框里有值」，不代表已写入 localStorage。
  // 少了这条提示，用户很容易「填完就走」，然后被下游报「未配置」而完全对不上。
  const [dirty, setDirty] = useState(false);

  const setField = (m, key, val) => {
    setCfg((c) => ({ ...c, [m]: { ...c[m], [key]: val } }));
    setDirty(true);
  };

  const onSave = () => {
    saveAllModelConfig(cfg);
    setSaved(true);
    setDirty(false);
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

      {dirty && (
        <div style={{
          marginBottom: 12, padding: '9px 11px', borderRadius: 8,
          background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.38)',
          fontSize: 11.5, color: '#92400e', lineHeight: 1.62,
        }}>
          有修改尚未保存。下面的「已配置」只表示输入框里有值，<b>必须点底部「保存全部配置」</b>后才会写入本机并生效。
        </div>
      )}

      {ORDER.map((m) => {
        const meta = MODALITIES[m] || {};
        const c = cfg[m] || {};
        const configured = !!(c.apiKey && c.apiKey.trim());
        // 图片也暴露 endpoint：图生图模型常常不在默认的 /images/generations 路径上
        const showEndpoint = m === 'video' || m === 'music' || m === 'image';
        // 轮询只有任务型（视频 / 音乐）用得上；图片是同步直出，不给它显示，免得误导
        const showPoll = m === 'video' || m === 'music';
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
              <HelpHint>{FIELD_HELP.preset}</HelpHint>
            </div>

            {/* baseUrl */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>API 基地址 (Base URL)</label>
              <input
                style={inputStyle} value={c.baseUrl || ''}
                placeholder={meta.defaultBase || 'https://api.openai.com/v1'}
                onChange={(e) => setField(m, 'baseUrl', e.target.value)}
              />
              <HelpHint>{FIELD_HELP.baseUrl}</HelpHint>
            </div>

            {/* apiKey */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>API Key</label>
              <input
                type="password" style={inputStyle} value={c.apiKey || ''}
                placeholder="sk-...（仅存于本机）"
                onChange={(e) => setField(m, 'apiKey', e.target.value)}
              />
              <HelpHint>{FIELD_HELP.apiKey}</HelpHint>
            </div>

            {/* model */}
            <div style={{ marginBottom: showEndpoint ? 12 : 0 }}>
              <label style={labelStyle}>模型名 (Model)</label>
              <input
                style={inputStyle} value={c.model || ''}
                placeholder={meta.placeholderModel || 'gpt-4o-mini'}
                onChange={(e) => setField(m, 'model', e.target.value)}
              />
              <HelpHint>{FIELD_HELP.model}</HelpHint>
            </div>

            {/* endpoint（仅视频 / 音乐等非标准模态） */}
            {showEndpoint && (
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>接口路径 (Endpoint)</label>
                <input
                  style={inputStyle} value={c.endpoint || ''}
                  placeholder={meta.defaultEndpoint || '/video/generations'}
                  onChange={(e) => setField(m, 'endpoint', e.target.value)}
                />
                <HelpHint>{FIELD_HELP.endpoint}</HelpHint>
              </div>
            )}
            {/* 图片专有：参考图字段名 + 数组开关 + 负向词开关（全部配置化，不绑定任何厂商） */}
            {m === 'image' && (
              <>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>参考图字段名 (Image Field)</label>
                  <input
                    style={inputStyle} value={c.imageField || ''}
                    placeholder="image_url（留空默认）"
                    onChange={(e) => setField(m, 'imageField', e.target.value)}
                  />
                  <HelpHint>{FIELD_HELP.imageField}</HelpHint>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={c.imageFieldArray === true}
                      onChange={(e) => setField(m, 'imageFieldArray', e.target.checked)}
                      style={{ cursor: 'pointer', margin: 0 }}
                    />
                    参考图按数组发送
                  </label>
                  <HelpHint>{FIELD_HELP.imageFieldArray}</HelpHint>
                </div>
                <div style={{ marginBottom: 0 }}>
                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={c.sendNegative !== false}
                      onChange={(e) => setField(m, 'sendNegative', e.target.checked)}
                      style={{ cursor: 'pointer', margin: 0 }}
                    />
                    提交负向词 (negative_prompt)
                  </label>
                  <HelpHint>{FIELD_HELP.sendNegative}</HelpHint>
                </div>
              </>
            )}
            {/* size（视频尺寸，厂商特定，可选） */}
            {m === 'video' && (
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>尺寸 (Size，可选)</label>
                <input
                  style={inputStyle} value={c.size || ''}
                  placeholder="720P（部分服务必填；其他按文档填或留空）"
                  onChange={(e) => setField(m, 'size', e.target.value)}
                />
                <HelpHint>{FIELD_HELP.size}</HelpHint>
              </div>
            )}
            {/* videoMode（决定使用哪类素材：文字 / 首尾帧 / 参考图音频） */}
            {m === 'video' && (
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>生成模式 (Mode，可选)</label>
                <select
                  value={c.videoMode || ''}
                  onChange={(e) => setField(m, 'videoMode', e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">跟随调用方（默认）</option>
                  <option value="text">纯文字生成</option>
                  <option value="keyframe">首尾帧控制画面起止</option>
                  <option value="reference">参考图 / 参考音频</option>
                </select>
                <HelpHint>{FIELD_HELP.videoMode}</HelpHint>
              </div>
            )}
            {/* 视频专有：提交负向词开关（与图片一致，默认开，但只发填写的负向词、不补内置词） */}
            {m === 'video' && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={c.videoSendNegative !== false}
                    onChange={(e) => setField(m, 'videoSendNegative', e.target.checked)}
                    style={{ cursor: 'pointer', margin: 0 }}
                  />
                  提交负向词 (negative_prompt)
                </label>
                <HelpHint>{FIELD_HELP.videoSendNegative}</HelpHint>
              </div>
            )}
            {/* engine（厂商自定义字段，留空不发送） */}
            {m === 'video' && (
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>附加字段 engine（可选）</label>
                <input
                  style={inputStyle} value={c.engine || ''}
                  placeholder="留空则不发送该字段"
                  onChange={(e) => setField(m, 'engine', e.target.value)}
                />
                <HelpHint>{FIELD_HELP.engine}</HelpHint>
              </div>
            )}
            {/* pollPath（任务型 API：先返回 id 再轮询，如 Kling / Runway / Sora） */}
            {showPoll && (
              <div style={{ marginBottom: 0 }}>
                <label style={labelStyle}>轮询路径 (Poll Path，任务型 API 用)</label>
                <input
                  style={inputStyle} value={c.pollPath || ''}
                  placeholder="/tasks/{id} 或完整轮询 URL"
                  onChange={(e) => setField(m, 'pollPath', e.target.value)}
                />
                <HelpHint>{FIELD_HELP.pollPath}</HelpHint>
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
