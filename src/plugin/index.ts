/**
 * Sleepy Worker 插件系统
 *
 * 这个文件提供了完整的插件系统 API，包括：
 * - 事件系统：处理应用生命周期和业务事件
 * - 插件基类：提供路由、卡片、注入等功能
 * - 插件管理器：负责插件加载和管理
 *
 * 使用示例：
 * ```typescript
 * import { Plugin, PluginConfig } from '@/plugin';
 *
 * export class MyPlugin extends Plugin {
 *   constructor() {
 *     super({
 *       name: 'my-plugin',
 *       version: '1.0.0',
 *       description: '我的插件',
 *     });
 *   }
 *
 *   async init() {
 *     this.addRoute({
 *       path: '/hello',
 *       handler: (c) => c.text('Hello from plugin!')
 *     });
 *
 *     this.addIndexCard('greeting', () => '<p>Hello World!</p>');
 *   }
 * }
 * ```
 */

// ========== 事件系统 ==========
export {
  // 基础事件类
  BaseEvent,

  // 应用生命周期事件
  AppInitializedEvent,
  AppStartedEvent,
  AppStoppedEvent,

  // 错误处理事件
  APIUnsuccessfulEvent,
  HTTPErrorEvent,
  UnhandledErrorEvent,

  // 请求处理事件
  BeforeRequestHook,
  AfterRequestHook,

  // 页面访问事件
  IndexAccessEvent,
  FaviconAccessEvent,
  MetadataAccessEvent,
  MetricsAccessEvent,

  // 状态管理事件
  QueryAccessEvent,
  StreamConnectedEvent,
  StreamDisconnectedEvent,
  StatusUpdatedEvent,
  StatuslistAccessEvent,

  // 设备管理事件
  DeviceSetEvent,
  DeviceRemovedEvent,
  DeviceClearedEvent,
  PrivateModeChangedEvent,

  // 管理面板事件
  PanelAccessEvent,
  LoginEvent,
  LogoutEvent,

  // 类型定义
  type SleepyEvent,
  type EventHandler,
  type EventHandlerMap
} from './events';

// ========== 插件系统 ==========
export {
  // 插件基类
  Plugin,

  // 异常类
  VersionNotMatchException,

  // 接口定义
  type PluginConfig,
  type CardConfig,
  type RouteConfig,
  type DataContext,

  // 装饰器
  createPlugin,
  pluginInit
} from './plugin';

// ========== 插件管理器 ==========
export {
  PluginManager,
  type PluginRouteInfo,
  type PluginContentItem
} from './manager';

// ========== 插件注册表 ==========
export {
  PluginRegistry,
  initializeDefaultPlugins,
  type PluginRegistryEntry
} from './registry';

// ========== 插件加载器 ==========
export {
  loadPluginInstance,
  loadMultiplePlugins,
  hasPluginLoader,
  getAvailablePluginNames as getAvailablePluginNamesFromLoaders,
  type PluginLoader,
  PLUGIN_LOADERS
} from './loader';

// ========== 插件配置 ==========
export {
  AVAILABLE_PLUGINS,
  getAvailablePluginNames,
  getEnabledPluginNames,
  getPluginConfig,
  type AvailablePluginConfig
} from './config';

// ========== 插件管理 API ==========
export {
  handleGetPluginStatus,
  handleEnablePlugin,
  handleDisablePlugin,
  handleReloadPlugins,
  handleGetPluginInfo,
  handleGetAvailablePlugins
} from './api';

// ========== 版本信息 ==========
export const PLUGIN_SYSTEM_VERSION = '1.0.0';

// ========== 导入类型 ==========
import { ConfigModel } from '../model';
import { Data } from '../data';
import { Hono } from 'hono';
import { Bindings } from '../index';
import { PluginManager } from './manager';
import { Plugin, PluginConfig } from './plugin';

/**
 * 插件系统初始化函数 (对应 Python 中的 PluginInit.__init__)
 *
 * @param version 主程序版本字符串
 * @param config 全局配置
 * @param data 全局数据
 * @param app Hono 应用实例
 * @returns 插件管理器实例
 */
export async function initializePluginSystem(
  version: string,
  config: ConfigModel,
  data: Data,
  app: Hono<any>
): Promise<PluginManager> {
  console.log(`[Plugin System] Initializing plugin system v${PLUGIN_SYSTEM_VERSION}...`);

  const manager = new PluginManager(version, config, data, app);

  // 自动加载启用的插件 (对应 Python 中的 load_plugins 调用)
  await manager.loadPlugins();

  console.log(`[Plugin System] Plugin system initialized successfully`);
  return manager;
}

/**
 * 快速创建插件实例的工厂函数
 */
export function createPluginInstance<T extends Plugin>(
  PluginClass: new (config: PluginConfig) => T,
  config: PluginConfig
): T {
  const plugin = new PluginClass(config);
  return plugin;
}
