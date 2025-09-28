/**
 * 插件注册表
 * 用于注册和管理可用的插件，避免动态导入的构建问题
 */

import { IPlugin } from './manager.js';

// 插件注册表类型定义
export interface PluginRegistryEntry {
  name: string;
  loader: () => Promise<IPlugin>;
  description?: string;
  version?: string;
}

/**
 * 插件注册表类
 */
export class PluginRegistry {
  private static instance: PluginRegistry;
  private registry: Map<string, PluginRegistryEntry> = new Map();
  private instanceCache: Map<string, IPlugin> = new Map(); // 添加实例缓存

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  /**
   * 注册插件
   */
  register(entry: PluginRegistryEntry): void {
    this.registry.set(entry.name, entry);
    console.log(`[PluginRegistry] Registered plugin: ${entry.name}`);
  }

  /**
   * 批量注册插件
   */
  registerMultiple(entries: PluginRegistryEntry[]): void {
    for (const entry of entries) {
      this.register(entry);
    }
  }

  /**
   * 获取插件
   */
  get(name: string): PluginRegistryEntry | undefined {
    return this.registry.get(name);
  }

  /**
   * 检查插件是否已注册
   */
  has(name: string): boolean {
    const hasPlugin = this.registry.has(name);
    console.log(`[PluginRegistry] has(${name}): ${hasPlugin}`, {
      registeredPlugins: this.getRegisteredPluginNames()
    });
    return hasPlugin;
  }

  /**
   * 获取所有已注册的插件名称
   */
  getRegisteredPluginNames(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * 获取所有已注册的插件条目
   */
  getAllEntries(): PluginRegistryEntry[] {
    return Array.from(this.registry.values());
  }

  /**
   * 加载插件实例
   */
  async loadPlugin(name: string): Promise<IPlugin | null> {
    // 首先检查实例缓存
    if (this.instanceCache.has(name)) {
      console.log(`[PluginRegistry] Returning cached instance for plugin: ${name}`);
      return this.instanceCache.get(name)!;
    }

    const entry = this.registry.get(name);
    if (!entry) {
      console.warn(`[PluginRegistry] Plugin ${name} not found in registry`);
      return null;
    }

    try {
      console.log(`[PluginRegistry] Loading plugin: ${name}`);
      const plugin = await entry.loader();

      // 缓存插件实例
      if (plugin) {
        this.instanceCache.set(name, plugin);
        console.log(`[PluginRegistry] Plugin ${name} loaded and cached successfully`);
      }

      return plugin;
    } catch (error) {
      console.error(`[PluginRegistry] Failed to load plugin ${name}:`, error);
      return null;
    }
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this.registry.clear();
    this.instanceCache.clear(); // 同时清空实例缓存
    console.log('[PluginRegistry] Registry and instance cache cleared');
  }

  /**
   * 清除特定插件的实例缓存
   */
  clearPluginCache(name: string): void {
    if (this.instanceCache.has(name)) {
      this.instanceCache.delete(name);
      console.log(`[PluginRegistry] Cleared cache for plugin: ${name}`);
    }
  }

  /**
   * 清除所有实例缓存
   */
  clearAllCaches(): void {
    this.instanceCache.clear();
    console.log('[PluginRegistry] All plugin instance caches cleared');
  }

  /**
   * 获取注册表统计信息
   */
  getStats(): { total: number; names: string[] } {
    return {
      total: this.registry.size,
      names: this.getRegisteredPluginNames()
    };
  }
}

/**
 * 初始化默认插件注册表
 */
export function initializeDefaultPlugins(): void {
  const registry = PluginRegistry.getInstance();

  // 注册示例插件 - 使用静态导入而不是动态模板字符串
  registry.register({
    name: 'example',
    description: '示例插件，演示插件系统的基本功能',
    version: '1.0.0',
    loader: async () => {
      try {
        // 直接静态导入，避免构建时的路径解析问题
        const pluginModule = await import('../../plugins/example/index.js');
        const ExamplePlugin = pluginModule.default;

        // 检查是否是插件类
        if (typeof ExamplePlugin === 'function') {
          console.log('[PluginRegistry] Found example plugin class, creating instance');
          return new ExamplePlugin();
        }

        // 检查是否是已经创建的插件实例
        if (ExamplePlugin && typeof ExamplePlugin === 'object' && 'config' in ExamplePlugin && typeof (ExamplePlugin as any).init === 'function') {
          console.log('[PluginRegistry] Found example plugin instance');
          return ExamplePlugin as IPlugin;
        }

        throw new Error('Example plugin not found or invalid format');
      } catch (error) {
        console.error('[PluginRegistry] Failed to load example plugin:', error);
        throw error;
      }
    }
  });

  // 在这里可以继续注册其他插件
  // 每个插件都需要使用静态导入路径

  console.log(`[PluginRegistry] Initialized with ${registry.getStats().total} default plugins`);
}

export default PluginRegistry;
