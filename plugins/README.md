# 插件系统

本项目实现了一个基于 TypeScript 的插件系统，允许动态扩展应用功能。

## 插件架构

### 核心组件

- **事件系统** (`src/plugin/events.ts`): 定义所有插件事件类型
- **插件基类** (`src/plugin/plugin.ts`): 插件开发的基础类和装饰器
- **插件管理器** (`src/plugin/manager.ts`): 管理插件加载、路由、卡片等
- **插件入口** (`src/plugin/index.ts`): 统一的插件系统导出

## 事件系统

插件可以监听以下事件：

### 应用生命周期事件
- `AppInitEvent`: 应用初始化
- `AppStartEvent`: 应用启动
- `AppShutdownEvent`: 应用关闭

### 请求事件
- `RequestEvent`: HTTP 请求处理
- `ResponseEvent`: HTTP 响应处理

### 状态更新事件
- `StatusUpdateEvent`: 设备状态更新

### 设备事件
- `DeviceSetEvent`: 设备设置

### 页面事件
- `HomepageEvent`: 首页加载
- `PanelEvent`: 面板页面加载

### 用户事件
- `LoginEvent`: 用户登录
- `LogoutEvent`: 用户登出

## 插件开发指南

### 1. 创建插件目录

```
plugins/
  your-plugin/
    index.ts          # 主入口文件
    README.md         # 插件文档
    package.json      # 插件信息（可选）
```

### 2. 实现插件类

```typescript
import { Plugin, registerRoute, registerCard, registerInject } from '../../src/plugin';

export default class YourPlugin extends Plugin {
  constructor() {
    super('your-plugin', '1.0.0', 'Your Plugin Description');
  }

  async init(): Promise<void> {
    console.log('YourPlugin initialized');

    // 注册事件处理器
    this.on('homepage', this.onHomepage.bind(this));
    this.on('login', this.onLogin.bind(this));

    // 注册路由
    this.registerRoute('GET', '/api/your-plugin/info', this.getInfo.bind(this));
  }

  // 事件处理器
  private async onHomepage(event: HomepageEvent): Promise<void> {
    console.log('Homepage event triggered');
  }

  private async onLogin(event: LoginEvent): Promise<void> {
    console.log('User logged in');
  }

  // API 路由处理器
  private async getInfo(c: Context): Promise<Response> {
    return c.json({ plugin: 'your-plugin', status: 'active' });
  }

  // 注册首页卡片
  @registerCard
  getHomepageCards(): string[] {
    return [`
      <div class="plugin-card">
        <h3>Your Plugin</h3>
        <p>Plugin content here</p>
      </div>
    `];
  }

  // 注册页面注入内容
  @registerInject
  getPageInjects(): { [key: string]: string[] } {
    return {
      homepage: ['<script>console.log("Your plugin loaded")</script>'],
      panel: ['<style>.your-plugin { color: blue; }</style>']
    };
  }
}
```

### 3. 插件数据存储

插件可以使用内置的数据存储 API：

```typescript
// 存储数据
await this.setData('key', 'value');

// 获取数据
const value = await this.getData('key');

// 删除数据
await this.deleteData('key');

// 获取所有数据
const allData = await this.getAllData();
```

### 4. 事件拦截

插件可以拦截事件并修改默认行为：

```typescript
private async onLogin(event: LoginEvent): Promise<void> {
  // 检查某些条件
  if (someCondition) {
    // 拦截事件并返回自定义响应
    event.intercept(c => c.json({ error: 'Custom login restriction' }, 403));
    return;
  }

  // 修改事件数据
  event.username = 'modified_' + event.username;
}
```

## 插件配置

在 `config.py` 的配置模型中，插件通过 `plugins_enabled` 数组配置：

```typescript
// 启用的插件列表
plugins_enabled: ['example', 'your-plugin']
```

## 示例插件

查看 `plugins/example/` 目录中的示例插件，了解完整的实现方式。

## 注意事项

1. **Cloudflare Workers 限制**: 动态导入在 Workers 环境中可能受限
2. **类型安全**: 使用 TypeScript 确保类型安全
3. **错误处理**: 插件应妥善处理错误，避免影响主应用
4. **性能**: 避免在插件中进行重型操作
5. **依赖管理**: 插件不应引入额外的外部依赖

## 开发工具

- 使用 `@registerRoute` 装饰器注册路由
- 使用 `@registerCard` 装饰器注册首页卡片
- 使用 `@registerInject` 装饰器注册页面注入内容
- 使用事件系统实现松耦合的功能扩展

## 调试

插件加载过程会输出详细日志，包括：
- 插件加载状态
- 事件触发信息
- 路由注册状态
- 错误信息

查看控制台日志了解插件运行状态。
