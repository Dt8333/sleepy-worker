import { Context, Hono } from "hono";
import { BaseEvent, EventHandler, SleepyEvent } from "./events";
import { ConfigModel } from "../model";
import { Data } from "../data";
import { Bindings } from "../index";

// Utils import for auth_check
declare const Utils: {
  auth_check(c: Context): Promise<boolean>;
};

// Forward declaration to avoid circular dependency
declare class PluginManager {
  static getInstance(): PluginManager;
  version: [number, number, number];
  versionStr: string;
  config: ConfigModel;
  data: Data;
  markPluginLoaded(plugin: IPlugin): void;
  deepMergeDict<T extends Record<string, any>>(target: T, source: Partial<T>): T;
  addRoute(config: any): void;
  addIndexCard(cardId: string, content: string | (() => string | Promise<string>), pluginName: string): void;
  addPanelCard(cardId: string, config: any): void;
  addIndexInject(content: string | (() => string | Promise<string>), pluginName: string): void;
  addPanelInject(content: string | (() => string | Promise<string>), pluginName: string): void;
  registerEventHandler<T extends BaseEvent>(eventId: string, handler: EventHandler<T>, pluginName: string): void;
  triggerEvent<T extends BaseEvent>(event: T): T;
  isPluginLoaded(pluginName: string): boolean;
  getPlugin<T extends IPlugin = IPlugin>(pluginName: string): T | null;
}

// Plugin interface for type safety
interface IPlugin {
  config: PluginConfig;
  runtimeConfig: Record<string, any>;
  init(): void | Promise<void>;
  destroy?(): void | Promise<void>;
}

/**
 * 版本不匹配错误
 */
export class VersionNotMatchException extends Error {
  constructor(
    public pluginName: string,
    public currentVersion: string,
    public minVersion?: string,
    public maxVersion?: string
  ) {
    let message: string;
    if (minVersion) {
      message = `Main program is version ${currentVersion}, but plugin ${pluginName} needs >=${minVersion}!`;
    } else if (maxVersion) {
      message = `Main program is version ${currentVersion}, but plugin ${pluginName} needs <${maxVersion}!`;
    } else {
      message = `Incorrect VersionNotMatchException calling on plugin ${pluginName}!`;
    }

    super(message);
    this.name = 'VersionNotMatchException';
  }
}

/**
 * 插件配置接口
 */
export interface PluginConfig {
  /** 插件名称 */
  name: string;
  /** 插件版本 */
  version?: string;
  /** 插件描述 */
  description?: string;
  /** 插件作者 */
  author?: string;
  /** 最小 Sleepy 版本要求 */
  requireVersionMin?: string;
  /** 最大 Sleepy 版本要求 */
  requireVersionMax?: string;
  /** 插件默认配置 */
  defaultConfig?: Record<string, any>;
  /** 插件默认数据 */
  defaultData?: Record<string, any>;
}

/**
 * 卡片配置接口
 */
export interface CardConfig {
  /** 卡片标题 */
  title: string;
  /** 卡片内容 */
  content: string | (() => string | Promise<string>);
  /** 卡片优先级 (数字越小优先级越高) */
  priority?: number;
  /** 插件名称 (自动设置) */
  plugin?: string;
}

/**
 * 路由配置接口
 */
export interface RouteConfig {
  /** 路由路径 */
  path: string;
  /** HTTP 方法 */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  /** 路由处理函数 */
  handler: (c: Context) => Response | Promise<Response>;
  /** 是否为全局路由 (默认为插件路由) */
  global?: boolean;
}

/**
 * 数据上下文接口
 */
export interface DataContext {
  [key: string]: any;
}

/**
 * Sleepy 插件基类
 */
export abstract class Plugin implements IPlugin {
  private static _registry: Map<string, IPlugin> = new Map();

  /** 插件配置 */
  public readonly config: PluginConfig;

  /** 插件运行时配置 */
  public runtimeConfig: Record<string, any> = {};

  /** 插件管理器实例 */
  protected manager?: PluginManager;

  constructor(config: PluginConfig) {
    this.config = config;

    // 延迟获取 PluginManager，避免循环依赖
    // 在 init() 方法中再获取 manager

    // 检查版本要求
    this.checkVersionRequirements();

    // 注册插件到静态注册表（如果还没有注册的话）
    if (Plugin._registry.has(config.name)) {
      console.warn(`[Plugin] Plugin ${config.name} is already registered, replacing with new instance`);
    }
    Plugin._registry.set(config.name, this);
  }

  /**
   * 获取 PluginManager 实例
   */
  protected getManager(): PluginManager {
    if (!this.manager) {
      // 尝试从全局获取 PluginManager 实例
      // 这里需要通过全局变量或者模块解决循环依赖问题
      const manager = (globalThis as any)._sleepyPluginManager;

      if (!manager) {
        throw new Error('PluginManager not available. Ensure plugin system is properly initialized.');
      }

      this.manager = manager;
      // 注册到插件管理器
      if (this.manager) {
        this.manager.markPluginLoaded(this);

        // 加载插件配置
        this.loadConfiguration();
      }
    }

    if (!this.manager) {
      throw new Error('Failed to initialize PluginManager');
    }

    return this.manager;
  }

  /**
   * 检查版本要求
   */
  private checkVersionRequirements(): void {
    // 跳过版本检查，因为此时 manager 可能还未初始化
    // 版本检查将在 init() 方法中进行
    return;
  }

  /**
   * 在init方法中进行版本检查
   */
  private performVersionCheck(): void {
    const sleepyVersion = this.getManager().versionStr;
    const { requireVersionMin, requireVersionMax, name } = this.config;

    if (requireVersionMin && sleepyVersion && this.compareVersions(sleepyVersion, requireVersionMin) < 0) {
      throw new VersionNotMatchException(name, sleepyVersion, requireVersionMin);
    }

    if (requireVersionMax && sleepyVersion && this.compareVersions(sleepyVersion, requireVersionMax) >= 0) {
      throw new VersionNotMatchException(name, sleepyVersion, undefined, requireVersionMax);
    }
  }

  /**
   * 比较版本号
   */
  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part < v2Part) return -1;
      if (v1Part > v2Part) return 1;
    }

    return 0;
  }

  /**
   * 加载插件配置
   */
  private loadConfiguration(): void {
    const manager = this.getManager();
    const globalConfig = manager.config;
    const pluginUserConfig = globalConfig.plugin[this.config.name] || {};

    // 使用PluginManager的深度合并方法
    this.runtimeConfig = manager.deepMergeDict(
      this.config.defaultConfig || {},
      pluginUserConfig
    );
  }

  // ========== 数据存储 API ==========

  /**
   * 获取插件数据
   */
  get data(): DataContext {
    // 需要异步调用，但getter必须同步，所以返回一个Promise包装的结果
    // 在实际使用中，推荐使用 getData() 异步方法
    throw new Error('Use async getData() method instead of synchronous data getter');
  }

  /**
   * 设置插件数据
   */
  set data(value: DataContext) {
    // 需要异步调用，但setter必须同步
    // 在实际使用中，推荐使用 setData() 异步方法
    throw new Error('Use async setData() method instead of synchronous data setter');
  }

  /**
   * 异步获取插件数据（注意：需要在Data类中实现这些方法）
   */
  async getData(): Promise<DataContext> {
    try {
      const manager = this.getManager();
      const globalData = manager.data;
      return await globalData.getPluginData(this.config.name);
    } catch (error) {
      this.error('Failed to get plugin data:', error);
      return {};
    }
  }

  /**
   * 异步设置插件数据（注意：需要在Data类中实现这些方法）
   */
  async setData(value: DataContext): Promise<void> {
    try {
      const manager = this.getManager();
      const globalData = manager.data;
      const success = await globalData.setPluginData(this.config.name, value);
      if (!success) {
        throw new Error('Failed to save plugin data to database');
      }
    } catch (error) {
      this.error('Failed to set plugin data:', error);
      throw error;
    }
  }

  /**
   * 数据上下文 (在退出时自动保存)
   */
  async withDataContext<T>(callback: (data: DataContext) => T | Promise<T>): Promise<T> {
    try {
      const data = await this.getData();
      const result = await callback(data);
      await this.setData(data);
      return result;
    } catch (error) {
      this.error('Failed to execute data context callback:', error);
      throw error;
    }
  }

  /**
   * 设置数据值
   */
  async setDataValue(key: string, value: any): Promise<void> {
    try {
      const data = await this.getData();
      data[key] = value;
      await this.setData(data);
    } catch (error) {
      this.error(`Failed to set data value '${key}':`, error);
      throw error;
    }
  }

  /**
   * 获取数据值
   */
  async getDataValue(key: string, defaultValue?: any): Promise<any> {
    try {
      const data = await this.getData();
      return data[key] ?? defaultValue;
    } catch (error) {
      this.error(`Failed to get data value '${key}':`, error);
      return defaultValue;
    }
  }

  /**
   * 检查数据键是否存在
   */
  async hasDataKey(key: string): Promise<boolean> {
    try {
      const data = await this.getData();
      return key in data;
    } catch (error) {
      this.error(`Failed to check data key '${key}':`, error);
      return false;
    }
  }

  /**
   * 删除数据键
   */
  async deleteDataKey(key: string): Promise<void> {
    try {
      const data = await this.getData();
      delete data[key];
      await this.setData(data);
    } catch (error) {
      this.error(`Failed to delete data key '${key}':`, error);
      throw error;
    }
  }

  /**
   * 获取所有数据键
   */
  async getDataKeys(): Promise<string[]> {
    try {
      const data = await this.getData();
      return Object.keys(data);
    } catch (error) {
      this.error('Failed to get data keys:', error);
      return [];
    }
  }

  /**
   * 清空所有插件数据
   */
  async clearData(): Promise<void> {
    try {
      await this.setData({});
    } catch (error) {
      this.error('Failed to clear plugin data:', error);
      throw error;
    }
  }

  /**
   * 原子性地更新数据值（避免并发问题）
   */
  async updateDataValue<T>(key: string, updater: (currentValue: T) => T, defaultValue?: T): Promise<T> {
    try {
      const data = await this.getData();
      const currentValue = data[key] ?? defaultValue;
      const newValue = updater(currentValue);
      data[key] = newValue;
      await this.setData(data);
      return newValue;
    } catch (error) {
      this.error(`Failed to update data value '${key}':`, error);
      throw error;
    }
  }

  /**
   * 获取全局配置
   */
  get globalConfig(): ConfigModel {
    return this.getManager().config;
  }

  /**
   * 获取全局数据
   */
  get globalData(): Data {
    return this.getManager().data;
  }

  // ========== 日志 API ==========

  /**
   * 记录日志
   */
  protected log(message: string, ...args: any[]): void {
    console.log(`[Plugin:${this.config.name}] ${message}`, ...args);
  }

  /**
   * 记录警告
   */
  protected warn(message: string, ...args: any[]): void {
    console.warn(`[Plugin:${this.config.name}] ${message}`, ...args);
  }

  /**
   * 记录错误
   */
  protected error(message: string, ...args: any[]): void {
    console.error(`[Plugin:${this.config.name}] ${message}`, ...args);
  }

  // ========== 工具方法 ==========

  /**
   * 检查是否其他插件已加载
   */
  protected isPluginLoaded(pluginName: string): boolean {
    return this.getManager().isPluginLoaded(pluginName);
  }

  /**
   * 获取其他插件实例
   */
  protected getPlugin(pluginName: string): IPlugin | undefined {
    return this.getManager().getPlugin(pluginName) || undefined;
  }

  /**
   * 延迟执行
   */
  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 安全执行异步函数，捕获错误
   */
  protected async safeAsync<T>(
    fn: () => Promise<T>,
    errorMessage?: string
  ): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      this.error(errorMessage || 'Async operation failed:', error);
      return null;
    }
  }

  // ========== 身份验证 API ==========

  /**
   * 检查请求是否已通过身份验证
   * @param c Hono Context 对象
   * @returns Promise<boolean> 是否已验证
   */
  protected async checkAuth(c: Context): Promise<boolean> {
    try {
      // 使用全局Utils进行身份验证
      const { Utils } = await import('../index.js');
      return await Utils.auth_check(c);
    } catch (error) {
      this.error('Failed to check authentication:', error);
      return false;
    }
  }

  /**
   * 身份验证中间件生成器
   * 返回一个可以用于路由的身份验证检查函数
   */
  protected createAuthMiddleware() {
    return async (c: Context, next?: () => Promise<void>) => {
      const isAuthenticated = await this.checkAuth(c);

      if (!isAuthenticated) {
        return c.json({
          success: false,
          error: 'Authentication required',
          plugin: this.config.name
        }, 401);
      }

      if (next) {
        await next();
      }

      return isAuthenticated;
    };
  }

  // ========== 路由 API ==========

  /**
   * 注册插件路由 (访问: /plugin/<name>/<path>)
   */
  addRoute(config: RouteConfig): void {
    const fullPath = config.global
      ? config.path
      : `/plugin/${this.config.name}${config.path.startsWith('/') ? '' : '/'}${config.path}`;

    this.getManager().addRoute({
      ...config,
      path: fullPath,
      plugin: this.config.name
    });
  }

  /**
   * 路由装饰器 (插件路由)
   */
  route(path: string, method: RouteConfig['method'] = 'GET') {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      this.addRoute({
        path,
        method,
        handler: descriptor.value.bind(target),
        global: false
      });
    };
  }

  /**
   * 注册全局路由 (访问: /<path>)
   */
  addGlobalRoute(config: RouteConfig): void {
    this.getManager().addRoute({
      ...config,
      global: true,
      plugin: this.config.name
    });
  }

  /**
   * 全局路由装饰器
   */
  globalRoute(path: string, method: RouteConfig['method'] = 'GET') {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      this.addRoute({
        path,
        method,
        handler: descriptor.value.bind(target),
        global: true
      });
    };
  }

  // ========== 卡片 API ==========

  /**
   * 注册主页卡片 (如已有则追加到末尾)
   */
  addIndexCard(cardId: string, content: string | (() => string | Promise<string>)): void {
    this.getManager().addIndexCard(cardId, content, this.config.name);
  }

  /**
   * 主页卡片装饰器
   */
  indexCard(cardId: string) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      this.addIndexCard(cardId, descriptor.value.bind(target));
    };
  }

  /**
   * 注册管理面板卡片 (唯一, 不可追加)
   */
  addPanelCard(cardId: string, config: CardConfig): void {
    this.getManager().addPanelCard(cardId, {
      ...config,
      plugin: this.config.name
    });
  }

  /**
   * 管理面板卡片装饰器
   */
  panelCard(cardId: string, title: string, priority?: number) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      this.addPanelCard(cardId, {
        title,
        content: descriptor.value.bind(target),
        priority,
        plugin: this.config.name
      });
    };
  }

  // ========== 注入 API ==========

  /**
   * 主页注入 (不显示卡片)
   */
  addIndexInject(content: string | (() => string | Promise<string>)): void {
    this.getManager().addIndexInject(content, this.config.name);
  }

  /**
   * 主页注入装饰器
   */
  indexInject() {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      this.addIndexInject(descriptor.value.bind(target));
    };
  }

  /**
   * 管理面板注入 (不显示卡片)
   */
  addPanelInject(content: string | (() => string | Promise<string>)): void {
    this.getManager().addPanelInject(content, this.config.name);
  }

  /**
   * 管理面板注入装饰器
   */
  panelInject() {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      this.addPanelInject(descriptor.value.bind(target));
    };
  }

  // ========== 事件 API ==========

  /**
   * 注册事件处理器
   */
  registerEvent<T extends BaseEvent>(eventId: string, handler: EventHandler<T>): void {
    this.getManager().registerEventHandler(eventId, handler, this.config.name);
  }

  /**
   * 事件处理装饰器
   */
  eventHandler<T extends BaseEvent>(eventId: string) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
      this.registerEvent<T>(eventId, descriptor.value.bind(target));
    };
  }

  /**
   * 触发事件
   */
  triggerEvent<T extends BaseEvent>(event: T): T {
    return this.getManager().triggerEvent(event);
  }

  // ========== 生命周期 API ==========

  /**
   * 检查插件是否已初始化
   */
  private _initialized: boolean = false;

  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * 内部初始化方法（由插件管理器调用）
   */
  async _internalInit(): Promise<void> {
    if (this._initialized) {
      this.warn('Plugin already initialized, skipping');
      return;
    }

    try {
      this.log('Initializing plugin...');

      // 确保 manager 已初始化
      this.getManager();

      // 执行版本检查
      this.performVersionCheck();

      // 加载配置
      this.loadConfiguration();

      // 调用用户定义的初始化方法
      await this.init();

      this._initialized = true;
      this.log('Plugin initialized successfully');
    } catch (error) {
      this.error('Plugin initialization failed:', error);
      throw error;
    }
  }

  /**
   * 内部销毁方法（由插件管理器调用）
   */
  async _internalDestroy(): Promise<void> {
    if (!this._initialized) {
      this.warn('Plugin not initialized, skipping destroy');
      return;
    }

    try {
      this.log('Destroying plugin...');
      if (this.destroy) {
        await this.destroy();
      }
      this._initialized = false;

      // 从静态注册表中移除
      Plugin._registry.delete(this.config.name);

      this.log('Plugin destroyed successfully');
    } catch (error) {
      this.error('Plugin destruction failed:', error);
      throw error;
    }
  }

  // ========== 静态方法 ==========

  /**
   * 获取插件注册表
   */
  static getRegistry(): Map<string, IPlugin> {
    return Plugin._registry;
  }

  /**
   * 根据名称获取插件
   */
  static getPlugin(name: string): IPlugin | undefined {
    return Plugin._registry.get(name);
  }

  /**
   * 获取所有已加载插件的名称列表
   */
  static getLoadedPluginNames(): string[] {
    return Array.from(Plugin._registry.keys());
  }

  /**
   * 检查插件是否已加载
   */
  static isPluginLoaded(name: string): boolean {
    return Plugin._registry.has(name);
  }

  /**
   * 获取插件统计信息
   */
  static getPluginStats(): { total: number; initialized: number; names: string[] } {
    const plugins = Array.from(Plugin._registry.values());
    return {
      total: plugins.length,
      initialized: plugins.filter(p => (p as any)._initialized).length,
      names: plugins.map(p => p.config.name)
    };
  }

  // ========== 抽象方法 ==========

  /**
   * 插件初始化方法 (由子类实现)
   */
  abstract init(): void | Promise<void>;

  /**
   * 插件销毁方法 (可选实现)
   */
  destroy?(): void | Promise<void>;
}

// ========== 装饰器辅助函数 ==========

/**
 * 创建插件类装饰器
 */
export function createPlugin(config: PluginConfig) {
  return function<T extends new (...args: any[]) => {}>(constructor: T) {
    return class extends constructor {
      constructor(...args: any[]) {
        super(...args);
        // 插件会在构造函数中注册自己
      }
    };
  };
}

/**
 * 插件初始化装饰器
 */
export function pluginInit() {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    // 标记为初始化方法，由插件管理器调用
    descriptor.value._isPluginInit = true;
  };
}

// ========== 插件工厂 ==========

/**
 * 插件工厂类，用于创建和管理插件实例
 */
export class PluginFactory {
  /**
   * 创建插件实例
   */
  static createPlugin<T extends Plugin>(
    PluginClass: new (config: PluginConfig) => T,
    config: PluginConfig
  ): T {
    try {
      const plugin = new PluginClass(config);
      console.log(`[PluginFactory] Created plugin: ${config.name}`);
      return plugin;
    } catch (error) {
      console.error(`[PluginFactory] Failed to create plugin ${config.name}:`, error);
      throw error;
    }
  }

  /**
   * 从模块创建插件
   */
  static async createFromModule(
    pluginModule: any,
    pluginName: string
  ): Promise<Plugin | null> {
    try {
      // 获取插件类或默认导出
      const PluginClass = pluginModule.default || pluginModule[pluginName] || pluginModule;

      if (!PluginClass) {
        console.error(`[PluginFactory] Plugin ${pluginName} does not export a valid plugin class`);
        return null;
      }

      let pluginInstance: Plugin;

      if (typeof PluginClass === 'function') {
        // 如果是类构造函数，需要首先获取配置
        if (PluginClass.config) {
          pluginInstance = new PluginClass(PluginClass.config);
        } else {
          console.error(`[PluginFactory] Plugin ${pluginName} class missing config property`);
          return null;
        }
      } else if (typeof PluginClass === 'object' && PluginClass.config) {
        // 如果是对象实例
        pluginInstance = PluginClass as Plugin;
      } else {
        console.error(`[PluginFactory] Plugin ${pluginName} is not a valid plugin class or instance`);
        return null;
      }

      // 验证插件配置
      if (!pluginInstance.config || !pluginInstance.config.name) {
        console.error(`[PluginFactory] Plugin ${pluginName} missing required config.name`);
        return null;
      }

      return pluginInstance;
    } catch (error) {
      console.error(`[PluginFactory] Error creating plugin ${pluginName} from module:`, error);
      return null;
    }
  }

  /**
   * 批量创建插件
   */
  static async createPlugins(
    pluginConfigs: Array<{ name: string; module: any }>
  ): Promise<Plugin[]> {
    const plugins: Plugin[] = [];

    for (const { name, module } of pluginConfigs) {
      const plugin = await this.createFromModule(module, name);
      if (plugin) {
        plugins.push(plugin);
      }
    }

    return plugins;
  }
}

export default Plugin;
