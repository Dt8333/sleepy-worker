import { Plugin, PluginConfig } from "../../src/plugin/plugin.js";

// 静态计数器跟踪实例创建
let instanceCounter = 0;

export class ExamplePlugin extends Plugin {
  private _isInitialized: boolean = false; // 添加初始化状态跟踪
  private _instanceId: number = 0; // 实例ID

  constructor() {
    instanceCounter++;
    console.log(`[ExamplePlugin] Constructor called - Instance #${instanceCounter}`);

    const config: PluginConfig = {
      name: 'example',
      version: '1.0.0',
      description: '示例插件，演示插件系统的基本功能',
      author: 'Sleepy Team',
      requireVersionMin: '0.0.1',  // 修改为与系统版本匹配
      defaultConfig: {
        enabled: true,
        greeting: 'Hello from Example Plugin!',
        showInPanel: true
      }
    };

    super(config);
    this._instanceId = instanceCounter;
  }

  async init(): Promise<void> {
    console.log(`[ExamplePlugin] init() called - isInitialized: ${this._isInitialized}`);

    // 防止重复初始化
    if (this._isInitialized) {
      console.warn(`[ExamplePlugin] Plugin ${this.config.name} is already initialized, skipping`);
      return;
    }

    this.log(`Initializing plugin ${this.config.name} v${this.config.version}`);
    this._isInitialized = true;

    // 注册插件路由
    this.addRoute({
      path: '/hello',
      method: 'GET',
      handler: (c) => {
        const greeting = this.runtimeConfig.greeting || 'Hello!';
        return c.json({
          success: true,
          message: greeting,
          plugin: this.config.name,
          timestamp: new Date().toISOString()
        });
      }
    });

    // 添加数据管理API路由
    this.addRoute({
      path: '/data',
      method: 'GET',
      handler: async (c) => {
        try {
          const data = await this.getData();
          return c.json({
            success: true,
            data: data,
            plugin: this.config.name
          });
        } catch (error) {
          return c.json({
            success: false,
            error: error instanceof Error ? error.message : String(error),
            plugin: this.config.name
          }, 500);
        }
      }
    });

    this.addRoute({
      path: '/data/set',
      method: 'POST',
      handler: async (c) => {
        // 身份验证检查
        const isAuth = await this.checkAuth(c);
        if (!isAuth) {
          return c.json({
            success: false,
            error: 'Authentication required',
            plugin: this.config.name
          }, 401);
        }

        try {
          const body = await c.req.json();
          const { key, value } = body;

          if (!key) {
            return c.json({
              success: false,
              error: 'Key is required',
              plugin: this.config.name
            }, 400);
          }

          await this.setDataValue(key, value);

          return c.json({
            success: true,
            message: `Set ${key} = ${JSON.stringify(value)}`,
            plugin: this.config.name
          });
        } catch (error) {
          return c.json({
            success: false,
            error: error instanceof Error ? error.message : String(error),
            plugin: this.config.name
          }, 500);
        }
      }
    });

    this.addRoute({
      path: '/data/clear',
      method: 'POST',
      handler: async (c) => {
        // 身份验证检查
        const isAuth = await this.checkAuth(c);
        if (!isAuth) {
          return c.json({
            success: false,
            error: 'Authentication required',
            plugin: this.config.name
          }, 401);
        }

        try {
          await this.clearData();

          return c.json({
            success: true,
            message: 'Plugin data cleared',
            plugin: this.config.name
          });
        } catch (error) {
          return c.json({
            success: false,
            error: error instanceof Error ? error.message : String(error),
            plugin: this.config.name
          }, 500);
        }
      }
    });

    // 注册全局路由
    this.addGlobalRoute({
      path: '/plugin-demo',
      method: 'GET',
      handler: (c) => {
        return c.html(`
          <html>
            <head><title>Plugin Demo</title></head>
            <body>
              <h1>Plugin Demo Page</h1>
              <p>This is a demo page created by the Example Plugin.</p>
              <p>Plugin: ${this.config.name} v${this.config.version}</p>
              <a href="/">Back to Home</a>
            </body>
          </html>
        `);
      }
    });

    // 添加主页卡片
    this.addIndexCard('plugin-demo', async () => {
      let visitCount = 0;
      try {
        visitCount = await this.getDataValue('visitCount', 0);
        visitCount++;
        await this.setDataValue('visitCount', visitCount);
      } catch (error) {
        this.warn('Failed to access plugin data:', error);
      }

      return `
        <div class="plugin-demo-card">
          <h3>示例插件</h3>
          <p>这是由示例插件生成的卡片。</p>
          <p>访问次数: ${visitCount}</p>
          <p>数据库驱动: ✅ 从数据库加载</p>
          <p><a href="/plugin-demo" target="_blank">查看插件演示页面</a></p>
          <p><small>插件通过数据库PluginData表管理启用状态</small></p>
        </div>
      `;
    });

    // 添加管理面板卡片（如果配置允许）
    if (this.runtimeConfig.showInPanel) {
      this.addPanelCard('plugin-management', {
        title: '插件管理',
        priority: 10,
        content: async () => {
          try {
            const pluginData = await this.getData();
            const dataKeys = Object.keys(pluginData);
            return `
              <div class="plugin-management">
                <h4>示例插件状态</h4>
                <ul>
                  <li>插件名称: ${this.config.name}</li>
                  <li>版本: ${this.config.version}</li>
                  <li>状态: 运行中</li>
                  <li>数据项数: ${dataKeys.length}</li>
                  <li>数据键: ${dataKeys.length > 0 ? dataKeys.join(', ') : '无'}</li>
                </ul>
                <div style="margin-top: 10px;">
                  <button onclick="alert('插件管理功能')" style="margin-right: 10px;">管理插件</button>
                  <button onclick="fetch('/plugin/example/data/clear', {method: 'POST'}).then(()=>location.reload())" style="background-color: #dc3545; color: white;">清空数据</button>
                </div>
              </div>
            `;
          } catch (error) {
            return `
              <div class="plugin-management">
                <h4>示例插件状态 (错误)</h4>
                <p style="color: red;">无法加载插件数据: ${error}</p>
              </div>
            `;
          }
        }
      });
    }

    // 添加主页注入内容
    this.addIndexInject(() => {
      return `
        <script>
          console.log('${this.config.name} plugin loaded!');
          // 可以在这里添加自定义的 JavaScript 代码
        </script>
        <style>
          .plugin-demo-card {
            border: 2px solid #4CAF50;
            border-radius: 8px;
            padding: 15px;
            margin: 10px 0;
            background-color: rgba(76, 175, 80, 0.1);
          }
        </style>
      `;
    });

    // 注册事件处理器
    this.registerEvent('index_access', (event) => {
      this.log(`Index page accessed at ${new Date().toISOString()}`);

      // 可以修改页面数据
      if ('cards' in event && typeof event.cards === 'object' && event.cards) {
        const cards = event.cards as Record<string, string>;
        if (cards['plugin-demo']) {
          this.log('Plugin demo card is present');
        }
      }
    });

    this.registerEvent('login', (event) => {
      if ('success' in event && event.success) {
        this.log('User logged in successfully');
        // 可以在这里记录登录日志或执行其他操作
      }
    });

    // 记录初始化日志
    const initTime = new Date().toISOString();
    try {
      await this.setDataValue('lastInitialized', initTime);
    } catch (error) {
      this.warn('Failed to save initialization time:', error);
    }

    this.log('Plugin initialized successfully at', initTime);
  }

  // 可选的销毁方法
  destroy(): void {
    this.log(`Plugin ${this.config.name} is being destroyed`);
  }
}

// 导出插件类而不是实例，让 PluginManager 来创建实例
export default ExamplePlugin;
