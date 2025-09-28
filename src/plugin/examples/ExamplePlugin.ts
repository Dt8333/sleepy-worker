/**
 * 示例插件 - 展示插件系统的各种功能
 *
 * 这个插件演示了：
 * - 基本插件结构
 * - 路由注册
 * - 主页卡片
 * - 管理面板卡片
 * - 事件处理
 * - 数据存储
 * - 配置管理
 */

import { Plugin, PluginConfig } from '../index';
import { StatusUpdatedEvent, DeviceSetEvent } from '../events';
import { Context } from 'hono';

export class ExamplePlugin extends Plugin {
  constructor() {
    super({
      name: 'example-plugin',
      version: '1.0.0',
      description: '演示插件系统功能的示例插件',
      author: 'Sleepy Team',
      requireVersionMin: '1.0.0',
      requireVersionMax: '2.0.0',
      defaultConfig: {
        enabled: true,
        greeting: 'Hello from Example Plugin!',
        maxVisits: 100,
        showStats: true
      },
      defaultData: {
        visits: 0,
        createdAt: new Date().toISOString()
      }
    });
  }

  /**
   * 插件初始化
   */
  async init(): Promise<void> {
    console.log(`[${this.config.name}] 初始化插件...`);

    // 初始化访问计数
    const visits = await this.getDataValue('visits', 0);
    await this.setDataValue('visits', visits + 1);

    // 注册路由
    this.setupRoutes();

    // 注册UI组件
    this.setupUI();

    // 注册事件处理器
    this.setupEventHandlers();

    console.log(`[${this.config.name}] 插件初始化完成`);
  }

  /**
   * 设置路由
   */
  private setupRoutes(): void {
    // 插件路由: /plugin/example-plugin/info
    this.addRoute({
      path: '/info',
      method: 'GET',
      handler: this.handleInfo.bind(this)
    });

    // 插件路由: /plugin/example-plugin/stats
    this.addRoute({
      path: '/stats',
      method: 'GET',
      handler: this.handleStats.bind(this)
    });

    // 插件路由: /plugin/example-plugin/reset
    this.addRoute({
      path: '/reset',
      method: 'POST',
      handler: this.handleReset.bind(this)
    });

    // 全局路由: /example
    this.addGlobalRoute({
      path: '/example',
      method: 'GET',
      handler: this.handleGlobalExample.bind(this)
    });
  }

  /**
   * 设置UI组件
   */
  private setupUI(): void {
    // 主页卡片 - 显示插件信息
    this.addIndexCard('example-info', async () => {
      const visits = await this.getDataValue('visits', 0);
      return `
        <div class="plugin-card example-info">
          <h3>示例插件</h3>
          <p>${this.runtimeConfig.greeting}</p>
          <p>页面访问次数: ${visits}</p>
          <p>插件版本: ${this.config.version}</p>
        </div>
      `;
    });

    // 主页卡片 - 快速操作
    if (this.runtimeConfig.showStats) {
      this.addIndexCard('example-actions', () => `
        <div class="plugin-card example-actions">
          <h4>快速操作</h4>
          <button onclick="fetch('/plugin/example-plugin/stats').then(r=>r.json()).then(console.log)">
            获取统计
          </button>
          <button onclick="fetch('/plugin/example-plugin/reset', {method: 'POST'}).then(()=>location.reload())">
            重置计数
          </button>
        </div>
      `);
    }

    // 管理面板卡片
    this.addPanelCard('example-settings', {
      title: '示例插件设置',
      priority: 50,
      content: async () => {
        const data = await this.getData();
        return `
          <div class="plugin-panel-card">
            <h4>插件状态</h4>
            <ul>
              <li>状态: ${this.runtimeConfig.enabled ? '启用' : '禁用'}</li>
              <li>创建时间: ${data.createdAt}</li>
              <li>访问次数: ${data.visits || 0}</li>
              <li>最大访问次数: ${this.runtimeConfig.maxVisits}</li>
            </ul>
            <h4>配置信息</h4>
            <pre>${JSON.stringify(this.runtimeConfig, null, 2)}</pre>
          </div>
        `;
      }
    });

    // 主页注入 - 添加样式
    this.addIndexInject(`
      <style>
        .plugin-card.example-info {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-radius: 8px;
          padding: 16px;
          margin: 10px 0;
        }
        .plugin-card.example-actions button {
          background: #4CAF50;
          color: white;
          border: none;
          padding: 8px 16px;
          margin: 4px;
          border-radius: 4px;
          cursor: pointer;
        }
        .plugin-card.example-actions button:hover {
          background: #45a049;
        }
      </style>
    `);

    // 管理面板注入 - 添加脚本
    this.addPanelInject(`
      <script>
        console.log('[Example Plugin] 管理面板脚本已加载');

        // 添加一些便利功能
        window.examplePlugin = {
          getStats: () => fetch('/plugin/example-plugin/stats').then(r => r.json()),
          reset: () => fetch('/plugin/example-plugin/reset', {method: 'POST'})
        };
      </script>
    `);
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    // 监听状态更新事件
    this.registerEvent<StatusUpdatedEvent>('status_updated', async (event) => {
      console.log(`[${this.config.name}] 状态已更新:`, {
        from: event.oldStatus?.name,
        to: event.newStatus?.name
      });

      // 记录状态变更
      await this.withDataContext(async (data) => {
        if (!data.statusChanges) data.statusChanges = [];
        data.statusChanges.push({
          timestamp: new Date().toISOString(),
          from: event.oldStatus?.name,
          to: event.newStatus?.name
        });

        // 只保留最近50条记录
        if (data.statusChanges.length > 50) {
          data.statusChanges = data.statusChanges.slice(-50);
        }
      });
    });

    // 监听设备设置事件
    this.registerEvent<DeviceSetEvent>('device_set', async (event) => {
      console.log(`[${this.config.name}] 设备状态设置:`, {
        deviceId: event.deviceId,
        show_name: event.show_name,
        using: event.using,
        status: event.status
      });

      // 统计设备操作
      await this.withDataContext(async (data) => {
        data.deviceOperations = (data.deviceOperations || 0) + 1;
      });
    });
  }

  // ========== 路由处理器 ==========

  /**
   * 处理插件信息请求
   */
  private async handleInfo(c: Context): Promise<Response> {
    const data = await this.getData();

    return c.json({
      success: true,
      plugin: {
        name: this.config.name,
        version: this.config.version,
        description: this.config.description,
        author: this.config.author
      },
      config: this.runtimeConfig,
      data: data
    });
  }

  /**
   * 处理统计请求
   */
  private async handleStats(c: Context): Promise<Response> {
    const data = await this.getData();

    return c.json({
      success: true,
      stats: {
        visits: data.visits || 0,
        deviceOperations: data.deviceOperations || 0,
        statusChanges: (data.statusChanges || []).length,
        recentStatusChanges: (data.statusChanges || []).slice(-5),
        createdAt: data.createdAt,
        uptime: Date.now() - new Date(data.createdAt).getTime()
      }
    });
  }

  /**
   * 处理重置请求
   */
  private async handleReset(c: Context): Promise<Response> {
    await this.withDataContext(async (data) => {
      data.visits = 0;
      data.deviceOperations = 0;
      data.statusChanges = [];
    });

    return c.json({
      success: true,
      message: '统计数据已重置'
    });
  }

  /**
   * 处理全局路由示例
   */
  private handleGlobalExample(c: Context): Response {
    return c.json({
      success: true,
      message: '这是一个全局路由示例',
      plugin: this.config.name,
      config: this.runtimeConfig
    });
  }

  // ========== 装饰器示例 ==========

  /**
   * 使用装饰器的路由示例
   * 注意: 由于循环依赖限制，装饰器目前不可用
   * 这里仅作为示例代码展示
   */
  // @route('/decorated', 'GET')
  private decoratedRoute(c: Context): Response {
    return c.text('这是使用装饰器定义的路由');
  }

  /**
   * 使用装饰器的卡片示例
   */
  // @indexCard('decorated-card')
  private decoratedCard(): string {
    return '<p>这是使用装饰器定义的卡片</p>';
  }

  /**
   * 使用装饰器的事件处理示例
   */
  // @eventHandler<StatusUpdatedEvent>('status_updated')
  private decoratedEventHandler(event: StatusUpdatedEvent): void {
    console.log('装饰器事件处理器:', event.newStatus);
  }

  /**
   * 插件销毁方法 (可选)
   */
  async destroy(): Promise<void> {
    console.log(`[${this.config.name}] 插件正在销毁...`);

    // 清理资源，保存最终状态等
    await this.setDataValue('destroyedAt', new Date().toISOString());

    console.log(`[${this.config.name}] 插件销毁完成`);
  }
}

// 创建插件实例 (这行代码会自动注册插件)
// 在实际使用中，应该通过插件管理器的动态加载机制来创建实例
export const examplePluginInstance = new ExamplePlugin();

export default ExamplePlugin;
