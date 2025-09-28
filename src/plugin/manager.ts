import { Context, Hono } from "hono";
import { BaseEvent, EventHandler, SleepyEvent } from "./events";
import { ConfigModel } from "../model";
import { Data } from "../data";
import { Bindings } from "../index";
import { PluginRegistry, initializeDefaultPlugins } from "./registry.js";
import { loadPluginInstance, hasPluginLoader, getAvailablePluginNames } from "./loader.js";

// Forward declarations to avoid circular dependencies
export interface PluginConfig {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  requireVersionMin?: string;
  requireVersionMax?: string;
  defaultConfig?: Record<string, any>;
  defaultData?: Record<string, any>;
}

export interface CardConfig {
  title: string;
  content: string | (() => string | Promise<string>);
  priority?: number;
  plugin?: string;
}

export interface RouteConfig {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  handler: (c: Context) => Response | Promise<Response>;
  global?: boolean;
}

// Plugin interface for type safety
export interface IPlugin {
  config: PluginConfig;
  runtimeConfig: Record<string, any>;
  init(): void | Promise<void>;
  destroy?(): void | Promise<void>;
}

// Version exception interface
export interface IVersionNotMatchException extends Error {
  pluginName: string;
  currentVersion: string;
  minVersion?: string;
  maxVersion?: string;
}

/**
 * 插件路由信息
 */
export interface PluginRouteInfo extends RouteConfig {
  plugin: string;
  originalPath?: string;  // 保留原始路径用于匹配
}

/**
 * 插件内容项 (卡片或注入内容)
 */
export interface PluginContentItem {
  content: string | (() => string | Promise<string>);
  plugin: string;
}

/**
 * 性能计时器函数类型
 */
type PerfTimer = () => number;

/**
 * 创建性能计时器
 */
function createPerfTimer(): PerfTimer {
  const start = performance.now();
  return () => Math.round((performance.now() - start) * 100) / 100;
}

/**
 * 深度合并对象
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {} as any, source[key] as any);
    } else {
      result[key] = source[key] as any;
    }
  }

  return result;
}

/**
 * 插件管理器 - 基于 Python 版本重新实现
 */
export class PluginManager {
  private static instance: PluginManager;

  // ========== 核心属性 ==========

  /** 主程序版本 (元组格式: [major, minor, patch]) */
  public readonly version: [number, number, number];

  /** 主程序版本字符串 */
  public readonly versionStr: string;

  /** 全局配置 */
  public readonly config: ConfigModel;

  /** 全局数据 */
  public readonly data: Data;

  /** Hono 应用实例 */
  private readonly app: Hono<{ Bindings: Bindings }>;

  // ========== 插件管理 ==========

  /** 已加载的插件实例列表 */
  private pluginsLoaded: IPlugin[] = [];

  // ========== 内容管理 ==========

  /** 主页卡片：cardId -> content列表 */
  private indexCards: Map<string, PluginContentItem[]> = new Map();

  /** 主页注入内容 */
  private indexInjects: PluginContentItem[] = [];

  /** 管理面板卡片：cardId -> 卡片配置 */
  private panelCards: Map<string, CardConfig & { plugin: string }> = new Map();

  /** 管理面板注入内容 */
  private panelInjects: PluginContentItem[] = [];

  // ========== 事件系统 ==========

  /** 事件处理器：eventId -> 处理器数组 */
  private eventHandlers: Map<string, Array<{ handler: EventHandler; plugin: string }>> = new Map();

  // ========== 路由系统 ==========

  /** 已注册的插件路由 */
  private routes: PluginRouteInfo[] = [];

  constructor(
    versionStr: string,
    config: ConfigModel,
    data: Data,
    app: Hono<{ Bindings: Bindings }>
  ) {
    // 解析版本字符串为元组
    this.version = this.parseVersion(versionStr);
    this.versionStr = versionStr;
    this.config = config;
    this.data = data;
    this.app = app;

    // 设置单例实例
    PluginManager.instance = this;

    // 将实例注册到全局变量，解决循环依赖问题
    (globalThis as any)._sleepyPluginManager = this;

    // 初始化默认插件注册表
    initializeDefaultPlugins();
  }

  /**
   * 解析版本字符串为版本元组
   */
  private parseVersion(versionStr: string): [number, number, number] {
    const parts = versionStr.split('.').map(Number);
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  }

  /**
   * 检查插件版本兼容性
   */
  private async checkPluginVersion(plugin: IPlugin): Promise<void> {
    const config = plugin.config;

    // 检查最小版本要求
    if (config.requireVersionMin) {
      const minVersion = this.parseVersion(config.requireVersionMin);
      if (this.compareVersions(this.version, minVersion) < 0) {
        const error = new Error(
          `Plugin ${config.name} requires minimum version ${config.requireVersionMin}, but current version is ${this.versionStr}`
        ) as IVersionNotMatchException;
        error.pluginName = config.name;
        error.currentVersion = this.versionStr;
        error.minVersion = config.requireVersionMin;
        throw error;
      }
    }

    // 检查最大版本要求
    if (config.requireVersionMax) {
      const maxVersion = this.parseVersion(config.requireVersionMax);
      if (this.compareVersions(this.version, maxVersion) > 0) {
        const error = new Error(
          `Plugin ${config.name} requires maximum version ${config.requireVersionMax}, but current version is ${this.versionStr}`
        ) as IVersionNotMatchException;
        error.pluginName = config.name;
        error.currentVersion = this.versionStr;
        error.maxVersion = config.requireVersionMax;
        throw error;
      }
    }
  }

  /**
   * 比较版本号
   * @returns -1 if version1 < version2, 0 if equal, 1 if version1 > version2
   */
  private compareVersions(version1: [number, number, number], version2: [number, number, number]): number {
    for (let i = 0; i < 3; i++) {
      if (version1[i] < version2[i]) return -1;
      if (version1[i] > version2[i]) return 1;
    }
    return 0;
  }

  /**
   * 获取单例实例
   */
  static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      throw new Error('PluginManager has not been initialized. Call new PluginManager() first.');
    }
    return PluginManager.instance;
  }

  // ========== 插件加载管理 ==========

  /**
   * 加载所有启用的插件
   *
   * 从数据库中读取启用的插件列表，而不是从配置文件
   */
  async loadPlugins(): Promise<void> {
    try {
      // 从数据库获取启用的插件列表
      const enabledPlugins = await this.data.getEnabledPlugins();

      console.log(`[PluginManager] Starting to load ${enabledPlugins.length} plugins from database...`);
      console.log(`[PluginManager] Enabled plugins: ${enabledPlugins.join(', ')}`);

      for (const pluginName of enabledPlugins) {
        await this.loadSinglePlugin(pluginName);
      }

      const loadedCount = this.pluginsLoaded.length;
      const loadedNames = this.pluginsLoaded.map(p => p.config.name).join(', ');

      if (loadedCount > 0) {
        console.log(`[PluginManager] ${loadedCount} plugin${loadedCount > 1 ? 's' : ''} loaded successfully: ${loadedNames}`);
      } else {
        console.log(`[PluginManager] No plugins loaded.`);
      }
    } catch (error) {
      console.error('[PluginManager] Error loading plugins from database:', error);
    }
  }

  /**
   * 加载单个插件
   */
  private async loadSinglePlugin(pluginName: string): Promise<void> {
    const perf = createPerfTimer();

    try {
      console.log(`[PluginManager] Loading plugin: ${pluginName}`);

      // 使用插件注册表来加载插件，而不是动态导入
      // 这样可以避免构建时的路径解析问题
      let pluginInstance: IPlugin | null = null;

      // 1. 尝试从预注册的插件中获取
      pluginInstance = await this.loadFromRegisteredPlugins(pluginName);

      // 2. 如果没有找到预注册的插件，尝试动态创建
      if (!pluginInstance) {
        pluginInstance = await this.loadFromDynamicImport(pluginName);
      }

      if (!pluginInstance) {
        throw new Error(`Plugin ${pluginName} not found in registry or dynamic imports`);
      }

      // 检查版本兼容性
      await this.checkPluginVersion(pluginInstance);

      // 初始化插件
      if (typeof pluginInstance.init === 'function') {
        await pluginInstance.init();
      } else if (typeof (pluginInstance as any)._internalInit === 'function') {
        await (pluginInstance as any)._internalInit();
      }

      console.log(`[PluginManager] Plugin ${pluginName} loaded successfully in ${perf()}ms`);

    } catch (error) {
      if (error && typeof error === 'object' && 'pluginName' in error) {
        console.warn(`[PluginManager] ${(error as any).message}`);
      } else {
        console.error(`[PluginManager] Error when loading plugin ${pluginName}:`, error);
      }
    }
  }

  /**
   * 从预注册的插件中加载
   */
  private async loadFromRegisteredPlugins(pluginName: string): Promise<IPlugin | null> {
    console.log(`[PluginManager] Attempting to load plugin ${pluginName} from registered sources...`);

    // 首先尝试从插件加载器中加载
    if (hasPluginLoader(pluginName)) {
      console.log(`[PluginManager] Found ${pluginName} in plugin loaders`);
      const pluginFromLoader = await loadPluginInstance(pluginName);
      if (pluginFromLoader) {
        console.log(`[PluginManager] Successfully loaded ${pluginName} from plugin loader`);
        return pluginFromLoader;
      }
    } else {
      console.log(`[PluginManager] Plugin ${pluginName} not found in plugin loaders`);
    }

    // 如果加载器中没有，再尝试从注册表中加载
    const registry = PluginRegistry.getInstance();
    if (registry.has(pluginName)) {
      console.log(`[PluginManager] Found ${pluginName} in plugin registry`);
      const pluginFromRegistry = await registry.loadPlugin(pluginName);
      if (pluginFromRegistry) {
        console.log(`[PluginManager] Successfully loaded ${pluginName} from plugin registry`);
        return pluginFromRegistry;
      }
    } else {
      console.log(`[PluginManager] Plugin ${pluginName} not found in plugin registry`);
    }

    console.log(`[PluginManager] Plugin ${pluginName} not found in any registered source`);
    return null;
  }

  /**
   * 从动态导入加载（仅作为备用方案）
   */
  private async loadFromDynamicImport(pluginName: string): Promise<IPlugin | null> {
    console.log(`[PluginManager] Dynamic import not supported in build environment for plugin: ${pluginName}`);
    console.log(`[PluginManager] Please register plugin ${pluginName} in loadFromRegisteredPlugins method`);
    return null;
  }

  /**
   * 标记插件为已加载 (由 Plugin 类构造函数调用)
   */
  markPluginLoaded(plugin: IPlugin): void {
    if (!this.pluginsLoaded.find(p => p.config.name === plugin.config.name)) {
      this.pluginsLoaded.push(plugin);
      console.log(`[PluginManager] Plugin ${plugin.config.name} registered successfully`);
    }
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(pluginName: string): Promise<boolean> {
    const pluginIndex = this.pluginsLoaded.findIndex(p => p.config.name === pluginName);

    if (pluginIndex === -1) {
      console.warn(`[PluginManager] Plugin ${pluginName} is not loaded`);
      return false;
    }

    const plugin = this.pluginsLoaded[pluginIndex];

    try {
      // 调用插件的销毁方法
      if (typeof plugin.destroy === 'function') {
        await plugin.destroy();
      }

      // 从已加载列表中移除
      this.pluginsLoaded.splice(pluginIndex, 1);

      // 清理插件相关的内容
      this.cleanupPluginContent(pluginName);

      // 清理插件注册表的实例缓存
      const registry = PluginRegistry.getInstance();
      registry.clearPluginCache(pluginName);

      console.log(`[PluginManager] Plugin ${pluginName} unloaded successfully`);
      return true;
    } catch (error) {
      console.error(`[PluginManager] Error unloading plugin ${pluginName}:`, error);
      return false;
    }
  }

  /**
   * 清理插件相关内容
   */
  private cleanupPluginContent(pluginName: string): void {
    // 清理主页卡片
    for (const [cardId, items] of this.indexCards) {
      const filteredItems = items.filter(item => item.plugin !== pluginName);
      if (filteredItems.length === 0) {
        this.indexCards.delete(cardId);
      } else {
        this.indexCards.set(cardId, filteredItems);
      }
    }

    // 清理管理面板卡片
    for (const [cardId, config] of this.panelCards) {
      if (config.plugin === pluginName) {
        this.panelCards.delete(cardId);
      }
    }

    // 清理注入内容
    this.indexInjects = this.indexInjects.filter(item => item.plugin !== pluginName);
    this.panelInjects = this.panelInjects.filter(item => item.plugin !== pluginName);

    // 清理事件处理器
    for (const [eventId, handlers] of this.eventHandlers) {
      const filteredHandlers = handlers.filter(handler => handler.plugin !== pluginName);
      if (filteredHandlers.length === 0) {
        this.eventHandlers.delete(eventId);
      } else {
        this.eventHandlers.set(eventId, filteredHandlers);
      }
    }

    // 清理路由（注意：已注册到 Hono 的路由无法移除）
    this.routes = this.routes.filter(route => route.plugin !== pluginName);
  }

  /**
   * 检查插件是否已加载
   */
  isPluginLoaded(pluginName: string): boolean {
    return this.pluginsLoaded.some(p => p.config.name === pluginName);
  }

  /**
   * 获取已加载插件列表
   */
  getLoadedPlugins(): string[] {
    return this.pluginsLoaded.map(p => p.config.name);
  }

  /**
   * 根据名称获取插件实例
   */
  getPlugin(pluginName: string): IPlugin | undefined {
    return this.pluginsLoaded.find(p => p.config.name === pluginName);
  }

  /**
   * 重新加载插件
   */
  async reloadPlugin(pluginName: string): Promise<boolean> {
    console.log(`[PluginManager] Reloading plugin: ${pluginName}`);

    // 先卸载插件
    const unloaded = await this.unloadPlugin(pluginName);
    if (!unloaded) {
      console.warn(`[PluginManager] Failed to unload plugin ${pluginName}, skipping reload`);
      return false;
    }

    // 重新加载插件
    await this.loadSinglePlugin(pluginName);

    return this.isPluginLoaded(pluginName);
  }

  /**
   * 重新加载所有插件
   */
  async reloadAllPlugins(): Promise<void> {
    console.log('[PluginManager] Reloading all plugins...');

    // 获取当前已加载的插件名称列表
    const loadedPluginNames = this.getLoadedPlugins();

    // 清理所有插件
    for (const pluginName of loadedPluginNames) {
      await this.unloadPlugin(pluginName);
    }

    // 重新从数据库加载所有启用的插件
    await this.loadPlugins();
  }

  // ========== 数据库插件管理 ==========

  /**
   * 启用插件（在数据库中创建插件记录并加载）
   */
  async enablePlugin(pluginName: string, initialData: Record<string, any> = {}): Promise<boolean> {
    try {
      // 检查插件是否已经加载
      if (this.isPluginLoaded(pluginName)) {
        console.log(`[PluginManager] Plugin ${pluginName} is already loaded`);
        return true;
      }

      // 在数据库中启用插件
      const enabled = await this.data.enablePlugin(pluginName, initialData);
      if (!enabled) {
        console.error(`[PluginManager] Failed to enable plugin ${pluginName} in database`);
        return false;
      }

      // 加载插件
      await this.loadSinglePlugin(pluginName);

      return this.isPluginLoaded(pluginName);
    } catch (error) {
      console.error(`[PluginManager] Error enabling plugin ${pluginName}:`, error);
      return false;
    }
  }

  /**
   * 禁用插件（从数据库删除插件记录并卸载）
   */
  async disablePlugin(pluginName: string): Promise<boolean> {
    try {
      // 卸载插件
      const unloaded = await this.unloadPlugin(pluginName);
      if (!unloaded) {
        console.warn(`[PluginManager] Failed to unload plugin ${pluginName}, but will still disable in database`);
      }

      // 从数据库中禁用插件
      const disabled = await this.data.disablePlugin(pluginName);
      if (!disabled) {
        console.error(`[PluginManager] Failed to disable plugin ${pluginName} in database`);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`[PluginManager] Error disabling plugin ${pluginName}:`, error);
      return false;
    }
  }

  /**
   * 获取数据库中所有启用的插件列表
   */
  async getEnabledPluginsFromDatabase(): Promise<string[]> {
    return await this.data.getEnabledPlugins();
  }

  /**
   * 检查插件是否在数据库中启用
   */
  async isPluginEnabledInDatabase(pluginName: string): Promise<boolean> {
    return await this.data.isPluginEnabled(pluginName);
  }  // ========== 路由管理 ==========

  /**
   * 注册插件路由 (对应 Python 中的 _register_route)
   * 不再直接注册到Hono应用，而是存储路由信息供动态查找
   */
  addRoute(config: PluginRouteInfo): void {
    // 存储路由信息，路径已经在Plugin类中处理过了
    const routeInfo = {
      ...config,
      originalPath: config.path  // 保留原始路径用于匹配
    };
    this.routes.push(routeInfo);

    console.log(`[PluginManager] Registered Route: ${config.method || 'GET'} ${config.path} -> plugin.${config.plugin} ${config.global ? '(global)' : ''}`);
  }

  /**
   * 获取所有插件路由
   */
  getRoutes(): PluginRouteInfo[] {
    return [...this.routes];
  }

  /**
   * 查找匹配的路由
   */
  findRoute(path: string, method: string): PluginRouteInfo | null {
    return this.routes.find(r =>
      r.path === path &&
      (r.method?.toLowerCase() || 'get') === method.toLowerCase()
    ) || null;
  }

  // ========== 卡片管理 ==========

  /**
   * 添加主页卡片 (对应 Python 中插件的 add_index_card)
   */
  addIndexCard(cardId: string, content: string | (() => string | Promise<string>), pluginName: string): void {
    if (!this.indexCards.has(cardId)) {
      this.indexCards.set(cardId, []);
    }

    this.indexCards.get(cardId)!.push({ content, plugin: pluginName });
    console.log(`[PluginManager] Added index card: ${cardId} (plugin: ${pluginName})`);
  }

  /**
   * 获取主页卡片内容 (对应 Python 中的卡片渲染逻辑)
   */
  async getIndexCards(): Promise<Record<string, string>> {
    const cards: Record<string, string> = {};

    for (const [cardId, items] of this.indexCards) {
      const cardContents: string[] = [];

      for (const item of items) {
        try {
          let content: string;
          if (typeof item.content === 'function') {
            content = await item.content();
          } else {
            content = item.content;
          }
          cardContents.push(content);
        } catch (error) {
          console.error(`[PluginManager] Error rendering index card ${cardId} from plugin ${item.plugin}:`, error);
          cardContents.push(''); // 添加空内容以避免破坏布局
        }
      }

      cards[cardId] = cardContents.join('<br/>\n');
    }

    return cards;
  }

  /**
   * 添加管理面板卡片
   */
  addPanelCard(cardId: string, config: CardConfig & { plugin: string }): void {
    this.panelCards.set(cardId, config);
    console.log(`[PluginManager] Added panel card: ${cardId} (plugin: ${config.plugin})`);
  }

  /**
   * 获取管理面板卡片内容
   */
  async getPanelCards(): Promise<Record<string, { title: string; content: string; priority: number; plugin: string }>> {
    const cards: Record<string, { title: string; content: string; priority: number; plugin: string }> = {};

    for (const [cardId, config] of this.panelCards) {
      try {
        let content: string;
        if (typeof config.content === 'function') {
          content = await config.content();
        } else {
          content = config.content;
        }

        cards[cardId] = {
          title: config.title,
          content,
          priority: config.priority || 100,
          plugin: config.plugin
        };
      } catch (error) {
        console.error(`[PluginManager] Error rendering panel card ${cardId} from plugin ${config.plugin}:`, error);
      }
    }

    return cards;
  }

  // ========== 注入内容管理 ==========

  /**
   * 添加主页注入内容
   */
  addIndexInject(content: string | (() => string | Promise<string>), pluginName: string): void {
    this.indexInjects.push({ content, plugin: pluginName });
    console.log(`[PluginManager] Added index inject (plugin: ${pluginName})`);
  }

  /**
   * 获取主页注入内容
   */
  async getIndexInjects(): Promise<string[]> {
    const injects: string[] = [];

    for (const item of this.indexInjects) {
      try {
        let content: string;
        if (typeof item.content === 'function') {
          content = await item.content();
        } else {
          content = item.content;
        }
        injects.push(content);
      } catch (error) {
        console.error(`[PluginManager] Error rendering index inject from plugin ${item.plugin}:`, error);
      }
    }

    return injects;
  }

  /**
   * 添加管理面板注入内容
   */
  addPanelInject(content: string | (() => string | Promise<string>), pluginName: string): void {
    this.panelInjects.push({ content, plugin: pluginName });
    console.log(`[PluginManager] Added panel inject (plugin: ${pluginName})`);
  }

  /**
   * 获取管理面板注入内容
   */
  async getPanelInjects(): Promise<string[]> {
    const injects: string[] = [];

    for (const item of this.panelInjects) {
      try {
        let content: string;
        if (typeof item.content === 'function') {
          content = await item.content();
        } else {
          content = item.content;
        }
        injects.push(content);
      } catch (error) {
        console.error(`[PluginManager] Error rendering panel inject from plugin ${item.plugin}:`, error);
      }
    }

    return injects;
  }

  // ========== 事件管理 ==========

  /**
   * 注册事件处理器
   */
  registerEventHandler<T extends BaseEvent>(
    eventId: string,
    handler: EventHandler<T>,
    pluginName: string
  ): void {
    if (!this.eventHandlers.has(eventId)) {
      this.eventHandlers.set(eventId, []);
    }

    this.eventHandlers.get(eventId)!.push({
      handler: handler as EventHandler,
      plugin: pluginName
    });

    console.log(`[PluginManager] Registered event handler: ${eventId} (plugin: ${pluginName})`);
  }

  /**
   * 触发事件 (对应 Python 中的 trigger_event 方法)
   */
  triggerEvent<T extends BaseEvent>(event: T): T {
    const handlers = this.eventHandlers.get(event.id) || [];

    // 遍历事件处理器
    for (const { handler, plugin } of handlers) {
      try {
        // 调用事件处理器，传入事件和请求上下文
        const result = handler(event);

        // 处理异步处理器
        if (result instanceof Promise) {
          result.catch(error => {
            console.error(`[PluginManager] Error in async event handler for ${event.id} from plugin ${plugin}:`, error);
          });
        }

        // 如果事件被拦截，停止传播
        if (event.isIntercepted) {
          console.log(`[PluginManager] Event ${event.id} intercepted by plugin: ${plugin}`);
          break;
        }
      } catch (error) {
        console.error(`[PluginManager] Error in event handler for ${event.id} from plugin ${plugin}:`, error);
      }
    }

    return event;
  }

  /**
   * 获取事件处理器数量
   */
  getEventHandlerCount(eventId: string): number {
    return this.eventHandlers.get(eventId)?.length || 0;
  }

  // ========== 统计信息 ==========

  /**
   * 获取插件详细信息
   */
  getPluginInfo(pluginName: string): any {
    const plugin = this.getPlugin(pluginName);
    if (!plugin) {
      return null;
    }

    return {
      name: plugin.config.name,
      version: plugin.config.version,
      description: plugin.config.description,
      author: plugin.config.author,
      requireVersionMin: plugin.config.requireVersionMin,
      requireVersionMax: plugin.config.requireVersionMax,
      loaded: true,
      routes: this.routes.filter(route => route.plugin === pluginName).length,
      eventHandlers: Array.from(this.eventHandlers.entries())
        .filter(([_, handlers]) => handlers.some(h => h.plugin === pluginName))
        .length
    };
  }

  /**
   * 获取所有插件的详细信息
   */
  getAllPluginsInfo(): Record<string, any> {
    const info: Record<string, any> = {};

    for (const plugin of this.pluginsLoaded) {
      info[plugin.config.name] = this.getPluginInfo(plugin.config.name);
    }

    return info;
  }

  /**
   * 获取插件系统统计信息
   */
  async getStats() {
    const registry = PluginRegistry.getInstance();
    const registryStats = registry.getStats();
    const availableFromLoaders = getAvailablePluginNames();
    const enabledInDatabase = await this.data.getEnabledPlugins();

    return {
      loadedPlugins: this.pluginsLoaded.length,
      enabledInDatabase: enabledInDatabase.length,
      enabledPluginsList: enabledInDatabase,
      registeredPlugins: registryStats.total,
      availableFromRegistry: registryStats.names,
      availableFromLoaders: availableFromLoaders,
      totalAvailable: [...new Set([...registryStats.names, ...availableFromLoaders])].length,
      totalRoutes: this.routes.length,
      indexCards: this.indexCards.size,
      panelCards: this.panelCards.size,
      indexInjects: this.indexInjects.length,
      panelInjects: this.panelInjects.length,
      eventHandlers: Array.from(this.eventHandlers.entries()).reduce(
        (acc, [eventId, handlers]) => {
          acc[eventId] = handlers.length;
          return acc;
        },
        {} as Record<string, number>
      )
    };
  }  /**
   * 打印插件系统统计信息
   */
  async printStats(): Promise<void> {
    const stats = await this.getStats();
    console.log('[PluginManager] Plugin System Stats:', {
      'Loaded Plugins': stats.loadedPlugins,
      'Enabled in Database': stats.enabledInDatabase,
      'Enabled Plugins List': stats.enabledPluginsList.join(', '),
      'Total Available': stats.totalAvailable,
      'Available from Registry': stats.availableFromRegistry.join(', '),
      'Available from Loaders': stats.availableFromLoaders.join(', '),
      'Plugin Routes': stats.totalRoutes,
      'Index Cards': stats.indexCards,
      'Panel Cards': stats.panelCards,
      'Index Injects': stats.indexInjects,
      'Panel Injects': stats.panelInjects,
      'Event Handlers': Object.keys(stats.eventHandlers).length
    });
  }

  // ========== 工具方法 ==========

  /**
   * 深度合并字典 (对应 Python 中的 u.deep_merge_dict)
   */
  deepMergeDict<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    return deepMerge(target, source);
  }

  // ========== 清理方法 ==========

  /**
   * 清理插件系统数据 (用于测试或重启)
   */
  clear(): void {
    this.pluginsLoaded.length = 0;
    this.indexCards.clear();
    this.indexInjects.length = 0;
    this.panelCards.clear();
    this.panelInjects.length = 0;
    this.eventHandlers.clear();
    this.routes.length = 0;

    console.log('[PluginManager] Plugin system cleared');
  }
}

export default PluginManager;
