/**
 * 插件加载器工具
 * 提供统一的插件加载接口，处理不同的导入方式
 */

import { IPlugin } from './manager.js';

/**
 * 插件加载器函数类型
 */
export type PluginLoader = () => Promise<IPlugin>;

/**
 * 插件加载器映射表
 * 使用静态导入以避免构建时的动态导入问题
 */
export const PLUGIN_LOADERS: Record<string, PluginLoader> = {
  // 插件加载器已经迁移到插件注册表系统
  // 新插件请在 src/plugin/registry.ts 中注册

  // 在这里添加更多插件的加载器（如有需要）
  // anotherPlugin: async () => {
  //   const { default: AnotherPlugin } = await import('../../plugins/another-plugin/index.js');
  //   if (!AnotherPlugin || typeof AnotherPlugin !== 'object') {
  //     throw new Error('Another plugin not found or invalid');
  //   }
  //   return AnotherPlugin as IPlugin;
  // }
};

/**
 * 获取插件加载器
 */
export function getPluginLoader(pluginName: string): PluginLoader | undefined {
  return PLUGIN_LOADERS[pluginName];
}

/**
 * 检查插件是否有对应的加载器
 */
export function hasPluginLoader(pluginName: string): boolean {
  const hasLoader = pluginName in PLUGIN_LOADERS;
  console.log(`[PluginLoader] hasPluginLoader(${pluginName}): ${hasLoader}`, {
    availableLoaders: Object.keys(PLUGIN_LOADERS)
  });
  return hasLoader;
}

/**
 * 获取所有可用的插件名称
 */
export function getAvailablePluginNames(): string[] {
  return Object.keys(PLUGIN_LOADERS);
}

/**
 * 加载插件实例
 */
export async function loadPluginInstance(pluginName: string): Promise<IPlugin | null> {
  const loader = getPluginLoader(pluginName);

  if (!loader) {
    console.warn(`[PluginLoader] No loader found for plugin: ${pluginName}`);
    return null;
  }

  try {
    console.log(`[PluginLoader] Loading plugin: ${pluginName}`);
    const plugin = await loader();
    console.log(`[PluginLoader] Plugin ${pluginName} loaded successfully`);
    return plugin;
  } catch (error) {
    console.error(`[PluginLoader] Failed to load plugin ${pluginName}:`, error);
    return null;
  }
}

/**
 * 批量加载插件
 */
export async function loadMultiplePlugins(pluginNames: string[]): Promise<IPlugin[]> {
  const plugins: IPlugin[] = [];

  for (const pluginName of pluginNames) {
    const plugin = await loadPluginInstance(pluginName);
    if (plugin) {
      plugins.push(plugin);
    }
  }

  return plugins;
}

export default {
  getPluginLoader,
  hasPluginLoader,
  getAvailablePluginNames,
  loadPluginInstance,
  loadMultiplePlugins,
  PLUGIN_LOADERS
};
