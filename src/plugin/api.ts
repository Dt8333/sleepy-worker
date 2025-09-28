/**
 * 插件管理 API
 * 提供插件的启用、禁用、状态查询等功能
 */

import { Context } from 'hono';
import { PluginManager } from './manager';
import { Utils } from '../index';
import { Data } from '../data';

/**
 * 获取所有插件状态
 */
export async function handleGetPluginStatus(c: Context): Promise<Response> {
  // 检查认证
  if (!(await Utils.auth_check(c))) {
    return c.json({
      success: false,
      error: 'Unauthorized access. Authentication required.'
    }, 401);
  }

  try {
    const manager = PluginManager.getInstance();
    const stats = await manager.getStats();

    return c.json({
      success: true,
      data: {
        loaded: stats.loadedPlugins,
        enabledInDatabase: stats.enabledInDatabase,
        enabledPluginsList: stats.enabledPluginsList,
        availablePlugins: stats.availableFromLoaders,
        totalAvailable: stats.totalAvailable,
        stats: {
          routes: stats.totalRoutes,
          indexCards: stats.indexCards,
          panelCards: stats.panelCards,
          indexInjects: stats.indexInjects,
          panelInjects: stats.panelInjects,
          eventHandlers: Object.keys(stats.eventHandlers).length
        }
      }
    });
  } catch (error) {
    console.error('[PluginAPI] Error getting plugin status:', error);
    return c.json({
      success: false,
      error: 'Failed to get plugin status',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
}

/**
 * 启用插件
 */
export async function handleEnablePlugin(c: Context): Promise<Response> {
  // 检查认证
  if (!(await Utils.auth_check(c))) {
    return c.json({
      success: false,
      error: 'Unauthorized access. Authentication required.'
    }, 401);
  }

  try {
    const { pluginName, initialData = {} } = await c.req.json();

    if (!pluginName || typeof pluginName !== 'string') {
      return c.json({
        success: false,
        error: 'Plugin name is required and must be a string'
      }, 400);
    }

    const manager = PluginManager.getInstance();
    const success = await manager.enablePlugin(pluginName, initialData);

    if (success) {
      // 触发客户端更新，因为插件启用可能会影响主页卡片显示
      try {
        const data = new Data(c.env);
        await data.set_last_updated();
      } catch (error) {
        console.error('[PluginAPI] Failed to set last updated after enabling plugin:', error);
      }

      return c.json({
        success: true,
        message: `Plugin ${pluginName} enabled successfully`,
        pluginName
      });
    } else {
      return c.json({
        success: false,
        error: `Failed to enable plugin ${pluginName}`
      }, 500);
    }
  } catch (error) {
    console.error('[PluginAPI] Error enabling plugin:', error);
    return c.json({
      success: false,
      error: 'Failed to enable plugin',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
}

/**
 * 禁用插件
 */
export async function handleDisablePlugin(c: Context): Promise<Response> {
  // 身份验证检查
  if (!(await Utils.auth_check(c))) {
    return c.json({
      success: false,
      error: 'Authentication required'
    }, 401);
  }

  try {
    const { pluginName } = await c.req.json();

    if (!pluginName || typeof pluginName !== 'string') {
      return c.json({
        success: false,
        error: 'Plugin name is required and must be a string'
      }, 400);
    }

    const manager = PluginManager.getInstance();
    const success = await manager.disablePlugin(pluginName);

    if (success) {
      // 触发客户端更新，因为插件禁用可能会影响主页卡片显示
      try {
        const data = new Data(c.env);
        await data.set_last_updated();
      } catch (error) {
        console.error('[PluginAPI] Failed to set last updated after disabling plugin:', error);
      }

      return c.json({
        success: true,
        message: `Plugin ${pluginName} disabled successfully`,
        pluginName
      });
    } else {
      return c.json({
        success: false,
        error: `Failed to disable plugin ${pluginName}`
      }, 500);
    }
  } catch (error) {
    console.error('[PluginAPI] Error disabling plugin:', error);
    return c.json({
      success: false,
      error: 'Failed to disable plugin',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
}

/**
 * 重新加载所有插件
 */
export async function handleReloadPlugins(c: Context): Promise<Response> {
  // 身份验证检查
  if (!(await Utils.auth_check(c))) {
    return c.json({
      success: false,
      error: 'Authentication required'
    }, 401);
  }

  try {
    const manager = PluginManager.getInstance();
    await manager.reloadAllPlugins();

    // 触发客户端更新，因为插件重载可能会影响主页卡片显示
    try {
      const data = new Data(c.env);
      await data.set_last_updated();
    } catch (error) {
      console.error('[PluginAPI] Failed to set last updated after reloading plugins:', error);
    }

    const stats = await manager.getStats();

    return c.json({
      success: true,
      message: 'All plugins reloaded successfully',
      data: {
        loaded: stats.loadedPlugins,
        enabledInDatabase: stats.enabledInDatabase,
        enabledPluginsList: stats.enabledPluginsList
      }
    });
  } catch (error) {
    console.error('[PluginAPI] Error reloading plugins:', error);
    return c.json({
      success: false,
      error: 'Failed to reload plugins',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
}

/**
 * 获取插件详细信息
 */
export async function handleGetPluginInfo(c: Context): Promise<Response> {
  // 身份验证检查
  if (!(await Utils.auth_check(c))) {
    return c.json({
      success: false,
      error: 'Authentication required'
    }, 401);
  }

  try {
    const pluginName = c.req.param('name');

    if (!pluginName) {
      return c.json({
        success: false,
        error: 'Plugin name is required'
      }, 400);
    }

    const manager = PluginManager.getInstance();
    const pluginInfo = manager.getPluginInfo(pluginName);

    if (!pluginInfo) {
      return c.json({
        success: false,
        error: `Plugin ${pluginName} not found or not loaded`
      }, 404);
    }

    // 获取数据库中的状态
    const enabledInDatabase = await manager.isPluginEnabledInDatabase(pluginName);

    // 获取插件的路由信息
    const routes = manager.getRoutes().filter(r => r.plugin === pluginName);

    return c.json({
      success: true,
      data: {
        ...pluginInfo,
        enabledInDatabase,
        routeDetails: routes.map(r => ({
          path: r.path,
          method: r.method || 'GET',
          global: r.global || false,
          originalPath: r.originalPath
        }))
      }
    });
  } catch (error) {
    console.error('[PluginAPI] Error getting plugin info:', error);
    return c.json({
      success: false,
      error: 'Failed to get plugin info',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
}

/**
 * 获取可用插件列表
 */
export async function handleGetAvailablePlugins(c: Context): Promise<Response> {
  // 身份验证检查
  if (!(await Utils.auth_check(c))) {
    return c.json({
      success: false,
      error: 'Authentication required'
    }, 401);
  }

  try {
    const { getAvailablePluginNames } = await import('./loader.js');
    const { PluginRegistry } = await import('./registry.js');

    const registry = PluginRegistry.getInstance();
    const availableFromLoaders = getAvailablePluginNames();
    const availableFromRegistry = registry.getRegisteredPluginNames();

    const allAvailable = [...new Set([...availableFromLoaders, ...availableFromRegistry])];

    return c.json({
      success: true,
      data: {
        total: allAvailable.length,
        plugins: allAvailable,
        sources: {
          loaders: availableFromLoaders,
          registry: availableFromRegistry
        }
      }
    });
  } catch (error) {
    console.error('[PluginAPI] Error getting available plugins:', error);
    return c.json({
      success: false,
      error: 'Failed to get available plugins',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
}
