/**
 * 插件配置文件
 * 在这里注册所有可用的插件，避免动态导入的构建问题
 */

// 可用插件配置
export const AVAILABLE_PLUGINS = {
  // 示例插件
  example: {
    name: 'example',
    description: '示例插件，演示插件系统的基本功能',
    version: '1.0.0',
    enabled: true,
    // 使用相对路径的静态导入，而不是动态字符串模板
    importPath: '../../plugins/example/index.js'
  }

  // 可以在这里添加更多插件
  // anotherPlugin: {
  //   name: 'another-plugin',
  //   description: '另一个插件',
  //   version: '1.0.0',
  //   enabled: false,
  //   importPath: '../../plugins/another-plugin/index.js'
  // }
};

// 插件类型定义
export interface AvailablePluginConfig {
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  importPath: string;
}

// 获取所有可用插件名称
export function getAvailablePluginNames(): string[] {
  return Object.keys(AVAILABLE_PLUGINS);
}

// 获取启用的插件名称
export function getEnabledPluginNames(): string[] {
  return Object.entries(AVAILABLE_PLUGINS)
    .filter(([_, config]) => config.enabled)
    .map(([name, _]) => name);
}

// 获取插件配置
export function getPluginConfig(name: string): AvailablePluginConfig | undefined {
  return AVAILABLE_PLUGINS[name as keyof typeof AVAILABLE_PLUGINS];
}
