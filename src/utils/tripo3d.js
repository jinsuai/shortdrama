/**
 * 3D 模型生成 API 封装（开源版：统一从「设置 → 模型配置」读取 model3d 模态配置）。
 *
 * 兼容阿里云百炼 Tripo / 任意 OpenAI 兼容 3D 服务。配置方式：
 *   在「设置 → 模型配置 → 3D 模型」填写 baseUrl（百炼为工作空间 ID，如 ws-xxx；
 *   或完整 base URL）与 apiKey、model。
 */

import { getModelConfig } from '../lib/providers/index.js';

function _cfg() {
  const env = (import.meta && import.meta.env) ? import.meta.env : {};
  const c = getModelConfig('model3d');
  return {
    workspaceId: c.baseUrl || c.workspaceId || env.VITE_TRIPO_WORKSPACE_ID || "",
    apiKey: c.apiKey || env.VITE_TRIPO_API_KEY || "",
    region: "cn-beijing",
    model: c.model || "Tripo/Tripo-H3.1",
  };
}

let TRIPO_CONFIG = _cfg();

/**
 * 获取 API 基础 URL（百炼工作空间 ID → 拼接；或直接使用完整 baseUrl）
 */
function getBaseUrl() {
  TRIPO_CONFIG = _cfg();
  const { workspaceId, region } = TRIPO_CONFIG;
  if (!workspaceId) {
    throw new Error("3D 服务未配置：请在「设置 → 模型配置 → 3D 模型」填写 baseUrl（百炼工作空间 ID 或完整地址）");
  }
  if (/^https?:\/\//i.test(workspaceId)) return workspaceId.replace(/\/$/, '');
  return `https://${workspaceId}.${region}.maas.aliyuncs.com`;
}

function _requireKey() {
  TRIPO_CONFIG = _cfg();
  if (!TRIPO_CONFIG.apiKey) {
    throw new Error("3D 服务未配置：请在「设置 → 模型配置 → 3D 模型」填写 apiKey");
  }
}

/**
 * 创建3D模型生成任务
 * @param {Object} params - 参数
 * @param {string} [params.prompt] - 文本提示词（文生3D时必填）
 * @param {string} [params.image] - 单张图片URL（单图生3D时必填）
 * @param {Array} [params.images] - 多张图片对象列表（多图生3D时必填，固定4张：前、左、后、右）
 * @param {string} [params.textureQuality] - 贴图质量：standard/detailed
 * @param {string} [params.geometryQuality] - 几何精度：standard/ultra（仅H3.1支持）
 * @param {boolean} [params.pbr] - 是否生成PBR材质模型
 * @param {boolean} [params.texture] - 是否生成贴图
 * @returns {Promise<string>} task_id
 */
export async function create3DTask(params) {
  _requireKey();
  const { prompt, image, images, textureQuality = "standard", geometryQuality = "standard", pbr = true, texture = true } = params;

  // 构建input对象
  const input = {};
  if (prompt) input.prompt = prompt;
  if (image) input.image = image;
  if (images) input.images = images;

  // 构建parameters对象
  const parameters = {
    texture_quality: textureQuality,
    geometry_quality: geometryQuality,
    pbr: pbr,
    texture: texture
  };

  const requestBody = {
    model: TRIPO_CONFIG.model,
    input: input,
    parameters: parameters
  };

  try {
    const response = await fetch(`${getBaseUrl()}/api/v1/services/aigc/video-generation/3d-generation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TRIPO_CONFIG.apiKey}`,
        "X-DashScope-Async": "enable"
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (data.code && data.code !== "200") {
      throw new Error(`创建任务失败: ${data.message || data.code}`);
    }

    if (!data.output?.task_id) {
      throw new Error("创建任务失败：未返回task_id");
    }

    return data.output.task_id;
  } catch (error) {
    console.error("[Tripo3D] 创建任务失败:", error);
    throw error;
  }
}

/**
 * 查询3D模型生成任务状态
 * @param {string} taskId - 任务ID
 * @returns {Promise<Object>} 任务结果
 */
export async function query3DTask(taskId) {
  _requireKey();
  try {
    const response = await fetch(`${getBaseUrl()}/api/v1/tasks/${taskId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${TRIPO_CONFIG.apiKey}`
      }
    });

    const data = await response.json();

    if (data.code && data.code !== "200") {
      throw new Error(`查询任务失败: ${data.message || data.code}`);
    }

    return data.output;
  } catch (error) {
    console.error("[Tripo3D] 查询任务失败:", error);
    throw error;
  }
}

/**
 * 等待3D模型生成完成（轮询）
 * @param {string} taskId - 任务ID
 * @param {number} [interval=15000] - 轮询间隔（毫秒），建议15秒
 * @param {number} [timeout=600000] - 超时时间（毫秒），默认10分钟
 * @param {Function} [onProgress] - 进度回调
 * @returns {Promise<Object>} 生成结果
 */
export async function waitFor3DCompletion(taskId, interval = 15000, timeout = 600000, onProgress) {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const result = await query3DTask(taskId);
        const status = result.task_status;

        if (onProgress) {
          onProgress(status, result);
        }

        if (status === "SUCCEEDED") {
          resolve(result);
          return;
        }

        if (status === "FAILED") {
          reject(new Error(`3D模型生成失败: ${result.message || "未知错误"}`));
          return;
        }

        if (status === "CANCELED") {
          reject(new Error("3D模型生成任务已取消"));
          return;
        }

        // 检查超时
        if (Date.now() - startTime > timeout) {
          reject(new Error("3D模型生成超时"));
          return;
        }

        // 继续轮询
        setTimeout(poll, interval);
      } catch (error) {
        reject(error);
      }
    };

    poll();
  });
}

/**
 * 单图生3D
 * @param {string} imageUrl - 图片URL
 * @param {Object} [options] - 选项
 * @param {Function} [onProgress] - 进度回调
 * @returns {Promise<Object>} 生成结果
 */
export async function imageTo3D(imageUrl, options = {}, onProgress) {
  const taskId = await create3DTask({
    image: imageUrl,
    ...options
  });

  return waitFor3DCompletion(taskId, 15000, 600000, onProgress);
}

/**
 * 多图生3D（四视图：前、左、后、右）
 * @param {Object} views - 四视图URL对象
 * @param {string} views.front - 正面图URL
 * @param {string} [views.left] - 左面图URL
 * @param {string} [views.back] - 后面图URL
 * @param {string} [views.right] - 右面图URL
 * @param {Object} [options] - 选项
 * @param {Function} [onProgress] - 进度回调
 * @returns {Promise<Object>} 生成结果
 */
export async function multiImageTo3D(views, options = {}, onProgress) {
  // 构建images数组，固定4个位置：前、左、后、右
  const images = [
    views.front ? { type: "png", file_token: views.front } : {},
    views.left ? { type: "png", file_token: views.left } : {},
    views.back ? { type: "png", file_token: views.back } : {},
    views.right ? { type: "png", file_token: views.right } : {}
  ];

  const taskId = await create3DTask({
    images: images,
    ...options
  });

  return waitFor3DCompletion(taskId, 15000, 600000, onProgress);
}

/**
 * 文生3D
 * @param {string} prompt - 文本提示词
 * @param {Object} [options] - 选项
 * @param {Function} [onProgress] - 进度回调
 * @returns {Promise<Object>} 生成结果
 */
export async function textTo3D(prompt, options = {}, onProgress) {
  const taskId = await create3DTask({
    prompt: prompt,
    ...options
  });

  return waitFor3DCompletion(taskId, 15000, 600000, onProgress);
}

export default {
  create3DTask,
  query3DTask,
  waitFor3DCompletion,
  imageTo3D,
  multiImageTo3D,
  textTo3D,
  TRIPO_CONFIG
};
