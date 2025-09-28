# Sleepy Worker 插件系统

基于 Python 版本 Sleepy 插件系统重新实现的 TypeScript 版本插件系统，提供完整的插件开发和管理功能。

## 📋 功能特性

- **🔌 插件管理**: 自动发现和加载插件，支持版本检查和依赖管理
- **📡 事件系统**: 完整的事件发布/订阅机制，支持事件拦截
- **🛣️ 路由管理**: 插件可注册自定义路由（插件路由和全局路由）
- **🎨 UI 扩展**: 支持主页卡片、管理面板卡片和内容注入
- **💾 数据存储**: 为每个插件提供独立的数据存储空间
- **⚡ 高性能**: 优化的事件处理和内容渲染机制
- **🔐 类型安全**: 完整的 TypeScript 类型定义

## 🏗️ 系统架构

插件系统基于以下核心组件：

### 1. PluginManager (插件管理器)
- **插件生命周期管理**: 加载、初始化、销毁
- **事件系统核心**: 事件注册和触发
- **路由注册**: 将插件路由注册到 Hono 应用
- **内容聚合**: 收集和渲染卡片、注入内容

### 2. Plugin (插件基类)
- **配置管理**: 默认配置与用户配置合并
- **数据存储**: 提供便捷的数据访问接口
- **装饰器支持**: 提供路由、卡片、事件处理装饰器
- **版本检查**: 自动检查与主程序版本兼容性

### 3. 事件系统
- **生命周期事件**: 应用启动、停止等
- **业务事件**: 状态更新、设备管理等
- **错误处理事件**: API 错误、未处理异常等
- **拦截机制**: 事件可被插件拦截和修改

## 🚀 快速开始

### 1. 初始化插件系统

```typescript
import { initializePluginSystem } from '@/plugin';

const pluginManager = await initializePluginSystem(
  '1.0.0',     // 版本
  config,      // 全局配置
  data,        // 全局数据
  app          // Hono 应用实例
);
```

### 2. 创建插件

```typescript
import { Plugin, PluginConfig } from '@/plugin';

export class MyPlugin extends Plugin {
  constructor() {
    super({
      name: 'my-plugin',
      version: '1.0.0',
      description: '我的第一个插件',
      author: 'Your Name',
      requireVersionMin: '1.0.0',  // 最低主程序版本要求
      defaultConfig: {
        enabled: true,
        message: 'Hello World'
      }
    });
  }

  async init() {
    console.log('MyPlugin 初始化完成');

    // 注册路由
    this.addRoute({
      path: '/hello',
      method: 'GET',
      handler: (c) => c.text(this.runtimeConfig.message)
    });

    // 注册主页卡片
    this.addIndexCard('greeting', () => {
      return `<p>来自插件的问候: ${this.runtimeConfig.message}</p>`;
    });

    // 注册事件处理器
    this.registerEvent('status_updated', this.onStatusUpdated.bind(this));
  }

  private onStatusUpdated(event: StatusUpdatedEvent) {
    console.log('状态已更新:', event.newStatus);
  }
}

// 创建插件实例
new MyPlugin();
```

### 3. 配置插件

在 `config.ts` 或相关配置文件中：

```typescript
export const config = {
  // ... 其他配置
  plugins_enabled: ['my-plugin'],
  plugin: {
    'my-plugin': {
      enabled: true,
      message: '自定义问候信息'
    }
  }
};
```

## 📚 API 参考

### Plugin 基类 API

#### 构造函数
```typescript
constructor(config: PluginConfig)
```

#### 数据存储
```typescript
async getData(): Promise<DataContext>
async setData(value: DataContext): Promise<void>
async withDataContext<T>(callback: (data: DataContext) => T | Promise<T>): Promise<T>
async setDataValue(key: string, value: any): Promise<void>
async getDataValue(key: string, defaultValue?: any): Promise<any>
```

#### 路由注册
```typescript
addRoute(config: RouteConfig): void
addGlobalRoute(config: RouteConfig): void

// 装饰器
@route('/path', 'GET')
@globalRoute('/global-path', 'POST')
```

#### 卡片和注入
```typescript
addIndexCard(cardId: string, content: string | (() => string | Promise<string>)): void
addPanelCard(cardId: string, config: CardConfig): void
addIndexInject(content: string | (() => string | Promise<string>)): void
addPanelInject(content: string | (() => string | Promise<string>)): void

// 装饰器
@indexCard('card-id')
@panelCard('card-id', 'Card Title', 100)
@indexInject()
@panelInject()
```

#### 事件处理
```typescript
registerEvent<T extends BaseEvent>(eventId: string, handler: EventHandler<T>): void
triggerEvent<T extends BaseEvent>(event: T): T

// 装饰器
@eventHandler<StatusUpdatedEvent>('status_updated')
```

### PluginManager API

#### 基本管理
```typescript
async loadPlugins(): Promise<void>
markPluginLoaded(plugin: IPlugin): void
isPluginLoaded(pluginName: string): boolean
getLoadedPlugins(): string[]
getPlugin(pluginName: string): IPlugin | undefined
```

#### 内容获取
```typescript
async getIndexCards(): Promise<Record<string, string>>
async getPanelCards(): Promise<Record<string, CardConfig>>
async getIndexInjects(): Promise<string[]>
async getPanelInjects(): Promise<string[]>
```

#### 事件管理
```typescript
triggerEvent<T extends BaseEvent>(event: T): T
registerEventHandler<T extends BaseEvent>(eventId: string, handler: EventHandler<T>, pluginName: string): void
getEventHandlerCount(eventId: string): number
```

## 🎯 事件系统

插件系统提供丰富的事件类型：

### 应用生命周期事件
- `AppInitializedEvent`: 应用初始化完成
- `AppStartedEvent`: 应用启动
- `AppStoppedEvent`: 应用停止

### 请求处理事件
- `BeforeRequestHook`: 请求前置处理
- `AfterRequestHook`: 请求后置处理

### 状态管理事件
- `StatusUpdatedEvent`: 状态更新
- `QueryAccessEvent`: 状态查询
- `StreamConnectedEvent`: SSE 连接建立

### 设备管理事件
- `DeviceSetEvent`: 设备状态设置
- `DeviceRemovedEvent`: 设备移除
- `DeviceClearedEvent`: 设备清空

### 错误处理事件
- `APIUnsuccessfulEvent`: API 调用失败
- `HTTPErrorEvent`: HTTP 错误
- `UnhandledErrorEvent`: 未处理异常

### 使用事件处理器

```typescript
export class MyPlugin extends Plugin {
  async init() {
    // 方法1：直接注册
    this.registerEvent('status_updated', (event: StatusUpdatedEvent) => {
      console.log('状态更新:', event.newStatus);

      // 可以拦截事件
      if (event.newStatus.id === 0) {
        event.intercept({ message: '状态被插件拦截' }, 200);
      }
    });

    // 方法2：使用装饰器
    this.registerEvent('device_set', this.onDeviceSet.bind(this));
  }

  @eventHandler<DeviceSetEvent>('device_set')
  private onDeviceSet(event: DeviceSetEvent) {
    console.log('设备设置:', event.deviceId);
  }
}
```

## 🎨 UI 扩展

### 主页卡片

插件可以向主页添加自定义卡片：

```typescript
// 静态内容卡片
this.addIndexCard('my-card', '<p>静态内容</p>');

// 动态内容卡片
this.addIndexCard('dynamic-card', async () => {
  const data = await this.getData();
  return `<p>访问次数: ${data.visits || 0}</p>`;
});

// 使用装饰器
@indexCard('greeting-card')
private renderGreetingCard(): string {
  return `<div class="card">Hello from ${this.config.name}!</div>`;
}
```

### 管理面板卡片

```typescript
this.addPanelCard('settings', {
  title: '插件设置',
  priority: 50,  // 数字越小优先级越高
  content: () => this.renderSettingsPanel()
});

// 使用装饰器
@panelCard('plugin-stats', '插件统计', 100)
private renderStats(): string {
  return `<div>统计信息...</div>`;
}
```

### 内容注入

```typescript
// 主页注入
this.addIndexInject(`
  <script>
    console.log('来自插件的脚本');
  </script>
`);

// 管理面板注入
this.addPanelInject(() => `
  <style>
    .plugin-custom { color: red; }
  </style>
`);
```

## 🔧 配置管理

插件系统支持分层配置：

### 1. 插件默认配置
```typescript
super({
  name: 'my-plugin',
  defaultConfig: {
    enabled: true,
    maxItems: 10,
    theme: 'dark'
  }
});
```

### 2. 用户配置覆盖
```typescript
// 在全局配置中
plugin: {
  'my-plugin': {
    maxItems: 20,
    customOption: 'value'
  }
}
```

### 3. 运行时访问
```typescript
// 访问合并后的配置
console.log(this.runtimeConfig.maxItems); // 20 (用户配置覆盖)
console.log(this.runtimeConfig.enabled);   // true (默认配置)
console.log(this.runtimeConfig.customOption); // 'value' (用户配置新增)
```

## 💾 数据存储

每个插件都有独立的数据存储空间：

```typescript
export class MyPlugin extends Plugin {
  async init() {
    // 使用数据上下文（推荐）
    await this.withDataContext(async (data) => {
      data.visits = (data.visits || 0) + 1;
      data.lastVisit = new Date().toISOString();
    });

    // 直接设置值
    await this.setDataValue('initialized', true);

    // 获取值
    const visits = await this.getDataValue('visits', 0);
  }
}
```

## ⚠️ 注意事项

1. **循环依赖**: 插件系统内部使用 forward declaration 避免循环依赖
2. **异步操作**: 数据存储操作都是异步的，记得使用 `await`
3. **事件拦截**: 被拦截的事件不会继续传播给后续处理器
4. **版本兼容**: 插件应正确设置版本要求以确保兼容性
5. **错误处理**: 插件错误不会影响主程序运行，但会记录日志

## 🔄 与 Python 版本的对应关系

| Python | TypeScript | 说明 |
|--------|------------|------|
| `PluginInit` | `PluginManager` | 插件系统管理器 |
| `Plugin` | `Plugin` | 插件基类 |
| `BaseEvent` | `BaseEvent` | 事件基类 |
| `load_plugins()` | `loadPlugins()` | 插件加载方法 |
| `trigger_event()` | `triggerEvent()` | 事件触发方法 |
| `data` property | `getData()/setData()` | 数据存储访问 |
| `@plugin.route()` | `@route()` | 路由装饰器 |
| `@plugin.index_card()` | `@indexCard()` | 卡片装饰器 |

## 📝 更新日志

### v1.0.0
- ✅ 基于 Python 版本完全重写
- ✅ 支持所有核心功能
- ✅ 完整的 TypeScript 类型支持
- ✅ 优化的性能和错误处理
- ✅ 解决循环依赖问题

---

**注意**: 这是基于 Python 版本 Sleepy 插件系统的 TypeScript 重新实现。保持了相同的 API 设计哲学，但适配了 TypeScript 和 Cloudflare Workers 环境。
