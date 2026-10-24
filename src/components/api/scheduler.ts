/**
 * 调度机 API 对接层
 * 
 * 封装文本生成、生图、视频生成等API调用
 * 实际使用时替换为你的调度机真实接口地址
 */

export interface SchedulerConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

export interface TextGenerateParams {
  model: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ImageGenerateParams {
  model: string;
  prompt: string;
  referenceImages?: string[];
  resolution?: string;
  style?: string;
}

export interface VideoGenerateParams {
  model: string;
  prompt: string;
  firstFrame?: string;
  lastFrame?: string;
  referenceImages?: string[];
  duration?: number;
  resolution?: string;
  ratio?: string;
}

export interface TaskStatus {
  taskId: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  progress?: number;
  result?: string;
  error?: string;
}

class SchedulerAPI {
  private config: SchedulerConfig;

  constructor(config: SchedulerConfig) {
    this.config = config;
  }

  private async request<T>(
    endpoint: string,
    method: string = 'GET',
    body?: any
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout || 30000);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  // ==================== 文本生成 ====================

  /**
   * 文本生成（同步）
   */
  async generateText(params: TextGenerateParams): Promise<string> {
    // 实际调用调度机文本生成接口
    // const result = await this.request<{ text: string }>('/api/v1/text/generate', 'POST', params);
    // return result.text;

    // Mock 实现（替换为真实接口）
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(`[Mock] 文本生成结果\n模型: ${params.model}\n提示词: ${params.prompt}\n生成的文本内容...`);
      }, 1000);
    });
  }

  /**
   * 文本生成（异步，返回任务ID）
   */
  async generateTextAsync(params: TextGenerateParams): Promise<string> {
    // const result = await this.request<{ taskId: string }>('/api/v1/text/generate/async', 'POST', params);
    // return result.taskId;
    return `text-task-${Date.now()}`;
  }

  // ==================== 生图 ====================

  /**
   * 文生图 / 图生图（异步）
   */
  async generateImage(params: ImageGenerateParams): Promise<string> {
    // const result = await this.request<{ taskId: string }>('/api/v1/image/generate', 'POST', params);
    // return result.taskId;
    return `image-task-${Date.now()}`;
  }

  // ==================== 视频生成 ====================

  /**
   * 视频生成（异步）
   */
  async generateVideo(params: VideoGenerateParams): Promise<string> {
    // const result = await this.request<{ taskId: string }>('/api/v1/video/generate', 'POST', params);
    // return result.taskId;
    return `video-task-${Date.now()}`;
  }

  // ==================== 任务查询 ====================

  /**
   * 查询任务状态
   */
  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    // return this.request<TaskStatus>(`/api/v1/task/${taskId}`);

    // Mock 实现
    return new Promise((resolve) => {
      setTimeout(() => {
        // 模拟任务进度
        const isVideo = taskId.startsWith('video');
        const progress = Math.random() * 100;
        const isDone = progress > 80;

        resolve({
          taskId,
          status: isDone ? 'success' : 'running',
          progress: isDone ? 100 : progress,
          result: isDone
            ? isVideo
              ? 'https://example.com/result.mp4'
              : 'https://picsum.photos/seed/' + taskId + '/512/512'
            : undefined,
        });
      }, 500);
    });
  }

  /**
   * 轮询任务直到完成
   */
  async waitForTask(
    taskId: string,
    onProgress?: (progress: number) => void,
    interval: number = 2000,
    maxAttempts: number = 150
  ): Promise<TaskStatus> {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.getTaskStatus(taskId);
      if (status.progress !== undefined) {
        onProgress?.(status.progress);
      }
      if (status.status === 'success' || status.status === 'failed') {
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error('任务超时');
  }

  // ==================== 便捷方法 ====================

  /**
   * 生成图片并等待结果
   */
  async generateImageAndWait(
    params: ImageGenerateParams,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const taskId = await this.generateImage(params);
    const result = await this.waitForTask(taskId, onProgress);
    if (result.status === 'failed') throw new Error(result.error || '生成失败');
    return result.result!;
  }

  /**
   * 生成视频并等待结果
   */
  async generateVideoAndWait(
    params: VideoGenerateParams,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const taskId = await this.generateVideo(params);
    const result = await this.waitForTask(taskId, onProgress);
    if (result.status === 'failed') throw new Error(result.error || '生成失败');
    return result.result!;
  }
}

// 默认导出单例（使用时配置真实地址）
export const schedulerAPI = new SchedulerAPI({
  baseUrl: 'http://your-scheduler-url.com',
  apiKey: 'your-api-key',
  timeout: 60000,
});

/**
 * 初始化调度机API
 * 在应用启动时调用，配置真实接口地址
 */
export function initScheduler(config: SchedulerConfig) {
  Object.assign(schedulerAPI['config'], config);
}

export default SchedulerAPI;
