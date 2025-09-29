import { Context, Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { ConfigModel, StatusItemModel } from "./model";

import { version } from "../package.json";
import { Data } from "./data";

import { streamSSE } from "hono/streaming";
import {
  initializePluginSystem,
  PluginManager,
  AppInitializedEvent,
  AppStartedEvent,
  IndexAccessEvent,
  QueryAccessEvent,
  StatusUpdatedEvent,
  DeviceSetEvent,
  DeviceRemovedEvent,
  DeviceClearedEvent,
  PrivateModeChangedEvent,
  PanelAccessEvent,
  LoginEvent,
  LogoutEvent,
  MetadataAccessEvent,
  StatuslistAccessEvent,
  FaviconAccessEvent,
  StreamConnectedEvent,
  StreamDisconnectedEvent
} from "./plugin";

export type Bindings = {
  DB: D1Database;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  SECRET: string;
  DATABASE: string;
};

export class Utils {
  static getTheme(c: Context): string {
    let theme = getCookie(c, "sleepy-theme");
    if (!theme) {
      theme= Utils.getConfig(c.env).page.theme;
      setCookie(c, "sleepy-theme", theme);
    }
    return theme;
  }

  /**
   * 处理主题 URL 参数的中间件逻辑
   * 如果 URL 包含 theme 参数，设置 Cookie 并重定向
   */
  static handleThemeParameter(c: Context): Response | null {
    const urlTheme = c.req.query("theme");
    if (urlTheme) {
      // 构造新的 URL（移除 theme 参数）
      const url = new URL(c.req.url);
      url.searchParams.delete("theme");

      // 创建重定向响应
      const response = Response.redirect(url.toString(), 302);

      // 设置 Cookie
      const headers = new Headers(response.headers);
      headers.set("Set-Cookie", `sleepy-theme=${urlTheme}; Path=/; SameSite=Lax`);

      return new Response(null, {
        status: 302,
        headers: headers,
      });
    }

    return null;
  }

  static getConfig(env: Bindings): ConfigModel {
    let config = new ConfigModel();
    config.main.secret = env.SECRET;
    return config;
  }

  static async getFileText(
    env: Bindings,
    path: string
  ): Promise<string | null> {
    try {
      const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
      let url = new URL(normalizedPath, "http://localhost");
      let req = new Request(url);
      let res = await env.ASSETS.fetch(req);
      if (res.status == 200) {
        return res.text();
      }
    } catch (error) {
      console.error(`[getFileText] Error accessing ${path}:`, error);
    }
    return null;
  }

  static async getAssetResponse(
    env: Bindings,
    path: string
  ): Promise<Response | null> {
    try {
      const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
      let url = new URL(normalizedPath, "http://localhost");
      let req = new Request(url);
      let res = await env.ASSETS.fetch(req);
      return res.status === 200 ? res : null;
    } catch (error) {
      console.error(`[getAssetResponse] Error accessing ${path}:`, error);
      return null;
    }
  }

  /**
   * 获取metrics响应数据
   */
  static async getMetricsResponse(data: Data, config: ConfigModel): Promise<Record<string, any>> {
    const enabled = config.metrics.enabled;

    if (!enabled) {
      return {
        success: true,
        enabled: false
      };
    }

    try {
      const [daily, weekly, monthly, yearly, total] = await data.get_metrics_data();
      const now = new Date();
      const timezone = config.main.timezone;

      return {
        success: true,
        enabled: true,
        time: Math.floor(now.getTime() / 1000),
        time_local: now.toLocaleString('zh-CN', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }),
        timezone: timezone,
        daily: daily,
        weekly: weekly,
        monthly: monthly,
        yearly: yearly,
        total: total
      };
    } catch (error) {
      console.error('[Metrics] Error fetching metrics data:', error);
      return {
        success: false,
        enabled: true,
        error: 'Failed to fetch metrics data'
      };
    }
  }

  static async renderTemplate(
    c: Context,
    filename: string,
    dirname: string = "templates",
    theme?: string,
    data: Record<string, any> = {}
  ): Promise<string | null> {
    // 如果没有指定主题，使用当前请求的主题
    if (!theme) {
      theme = Utils.getTheme(c);
    }

    // 1. 尝试从指定主题加载模板
    let templatePath = `${theme}/${dirname}/${filename}`;
    let templateContent = await Utils.getFileText(c.env, templatePath);

    if (templateContent) {
      return Utils.renderTemplateString(templateContent, data);
    }

    // 2. 回退到默认主题
    templatePath = `default/${dirname}/${filename}`;
    templateContent = await Utils.getFileText(c.env, templatePath);

    if (templateContent) {
      return Utils.renderTemplateString(templateContent, data);
    }

    // 3. 模板不存在
    console.warn(`[theme] template ${dirname}/${filename} not found`);
    return null;
  }  /**
   * 使用简单的模板字符串渲染（兼容基础 Jinja2 语法）
   */
  static renderTemplateString(template: string, data: Record<string, any>): string {
    try {
      let result = template;

      // 处理 {% for %} 循环语句 (需要在变量替换之前处理)
      result = Utils.renderForStatements(result, data);

      // 替换简单变量 {{ variable }}
      result = result.replace(/\{\{\s*([^\s\}]+)\s*\}\}/g, (match, varName) => {
        const value = Utils.getNestedValue(data, varName.trim());
        return value !== undefined ? String(value) : match;
      });

      // 替换 {{ variable | safe }} 过滤器（移除 | safe 部分）
      result = result.replace(/\{\{\s*([^\s\|]+)\s*\|\s*safe\s*\}\}/g, (match, varName) => {
        const value = Utils.getNestedValue(data, varName.trim());
        return value !== undefined ? String(value) : match;
      });

      // 处理简单的 {% if %} 条件语句
      result = Utils.renderIfStatements(result, data);

      return result;
    } catch (error) {
      console.error("Template rendering error:", error);
      console.error("Template content (first 200 chars):", template.substring(0, 200));
      console.error("Data:", JSON.stringify(data, null, 2));
      return template; // 出错时返回原始模板
    }
  }

  /**
   * 获取嵌套对象的值（支持 object.property 语法）
   */
  static getNestedValue(obj: any, path: string): any {
    if (!path) return undefined;

    // 处理数组索引和对象属性访问
    const keys = path.split(/[\.\[\]]/).filter(key => key !== '');

    let value = obj;
    for (const key of keys) {
      if (value == null) return undefined;

      // 处理数组索引
      if (/^\d+$/.test(key)) {
        value = value[parseInt(key)];
      } else {
        value = value[key];
      }
    }

    return value;
  }

  /**
   * 处理 for 循环语句
   */
  static renderForStatements(template: string, data: Record<string, any>): string {
    // 处理 {% for key, value in dict.items() %} ... {% endfor %} 语句
    const forItemsPattern = /\{%\s*for\s+([^,]+),\s*([^\s]+)\s+in\s+([^\.]+)\.items\(\)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g;

    let result = template.replace(forItemsPattern, (match, keyVar, valueVar, dictName, content) => {
      const dict = Utils.getNestedValue(data, dictName.trim());
      if (!dict || typeof dict !== 'object') {
        return '';
      }

      let output = '';
      for (const [key, value] of Object.entries(dict)) {
        // 为每次循环创建新的数据上下文
        const loopData = {
          ...data,
          [keyVar.trim()]: key,
          [valueVar.trim()]: value,
          loop: {
            index: Object.keys(dict).indexOf(key),
            index0: Object.keys(dict).indexOf(key),
            first: Object.keys(dict).indexOf(key) === 0,
            last: Object.keys(dict).indexOf(key) === Object.keys(dict).length - 1,
            length: Object.keys(dict).length
          }
        };

        // 递归渲染循环内容
        output += Utils.renderTemplateString(content, loopData);
      }
      return output;
    });

    // 处理 {% for item in list %} ... {% endfor %} 语句
    const forListPattern = /\{%\s*for\s+([^\s]+)\s+in\s+([^\s%]+)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g;

    result = result.replace(forListPattern, (match, itemVar, listName, content) => {
      const list = Utils.getNestedValue(data, listName.trim());
      if (!Array.isArray(list)) {
        return '';
      }

      let output = '';
      list.forEach((item, index) => {
        // 为每次循环创建新的数据上下文
        const loopData = {
          ...data,
          [itemVar.trim()]: item,
          loop: {
            index: index + 1,
            index0: index,
            first: index === 0,
            last: index === list.length - 1,
            length: list.length
          }
        };

        // 递归渲染循环内容
        output += Utils.renderTemplateString(content, loopData);
      });
      return output;
    });

    return result;
  }

  /**
   * 处理简单的 if 语句
   */
  static renderIfStatements(template: string, data: Record<string, any>): string {
    // 处理 {% if variable %} ... {% endif %} 语句
    const ifPattern = /\{%\s*if\s+([^%]+?)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;

    return template.replace(ifPattern, (match, condition, content) => {
      const trimmedCondition = condition.trim();
      let value: any;

      // 处理 "not variable" 条件
      if (trimmedCondition.startsWith('not ')) {
        const varName = trimmedCondition.substring(4).trim();
        value = Utils.getNestedValue(data, varName);
        // 取反
        value = !value || value === '' || value === 0 || value === false;
      } else {
        // 普通条件
        value = Utils.getNestedValue(data, trimmedCondition);
      }

      // 简单的真值判断
      if (value && value !== '' && value !== 0 && value !== false) {
        return Utils.renderTemplateString(content, data);
      }
      return '';
    });
  }

  /**
   * 获取可用的主题列表
   */
  static async getAvailableThemes(env: Bindings): Promise<string[]> {
    // 这里需要根据实际的文件系统结构来实现
    // 目前返回硬编码的主题列表，实际使用时可以扫描 theme 目录
    return ["default", "blue", "dark", "github", "simple", "console"];
  }

  static async auth_check(c: Context): Promise<boolean> {
    if (c.req.query("secret") && c.req.query("secret") == c.env.SECRET) {
      return true;
    }
    if (
      c.req.header("Sleepy-Secret") &&
      c.req.header("Sleepy-Secret") == c.env.SECRET
    ) {
      return true;
    }
    if (
      c.req.header("Authorization") &&
      c.req.header("Authorization") == "Bearer " + c.env.SECRET
    ) {
      return true;
    }
    if (
      getCookie(c, "sleepy-secret") &&
      getCookie(c, "sleepy-secret") == c.env.SECRET
    ) {
      return true;
    }
    try {
      let body = await c.req.json();
      if (body && body["secret"] && body["secret"] == c.env.SECRET) {
        return true;
      }
    } catch (e) {
      //ignore
    }
    return false;
  }

  /**
   * 认证中间件 - 基于 auth_check 的统一认证逻辑
   * @param c Context 对象
   * @param next 下一个处理函数
   * @param redirectTo 认证失败时重定向的URL（可选）
   * @returns Promise<Response>
   */
  static async requireAuth(
    c: Context,
    next: () => Promise<Response>,
    redirectTo?: string
  ): Promise<Response> {
    if (await Utils.auth_check(c)) {
      return await next();
    } else {
      if (redirectTo) {
        return c.redirect(redirectTo, 302);
      } else {
        return c.json({ success: false, message: 'Unauthorized' }, 401);
      }
    }
  }
}

const app = new Hono<{ Bindings: Bindings }>();

// 插件系统需要在处理请求前就初始化，但在 Workers 环境中需要访问 env
let pluginManager: PluginManager | null = null;

// 创建一个异步初始化函数
async function initializePluginSystemOnFirstRequest(c: Context): Promise<void> {
  if (!pluginManager) {
    const config = Utils.getConfig(c.env);
    const data = new Data(c.env);
    pluginManager = await initializePluginSystem(version, config, data, app);

    // 触发应用初始化事件
    pluginManager.triggerEvent(new AppInitializedEvent(c));
  }
}

// 确保插件系统在任何路由处理之前就被初始化
app.use("*", async (c, next) => {
  // 在第一次请求时初始化插件系统
  await initializePluginSystemOnFirstRequest(c);

  // 检查是否需要处理主题参数
  const themeRedirect = Utils.handleThemeParameter(c);
  if (themeRedirect) {
    return themeRedirect;
  }

  await next();
});

// 添加通用的插件路由处理器 - 处理所有插件路由（包括全局路由）
app.use("*", async (c, next) => {
  // 确保插件系统已初始化
  await initializePluginSystemOnFirstRequest(c);

  if (pluginManager) {
    const path = new URL(c.req.url).pathname;
    const method = c.req.method;

    // 查找匹配的插件路由
    const route = pluginManager.findRoute(path, method);

    if (route) {
      try {
        return await route.handler(c);
      } catch (error) {
        console.error(`[App] Error in plugin route ${path}:`, error);
        return c.text("Plugin route error", 500);
      }
    }
  }

  // 如果没有匹配的插件路由，继续处理下一个中间件
  await next();
});

// 处理中间件的后续逻辑
app.use("*", async (c, next) => {
  await next();

  // 记录metrics数据
  const config = Utils.getConfig(c.env);
  if (config.metrics.enabled) {
    const data = new Data(c.env);
    const path = new URL(c.req.url).pathname;

    try {
      // 首先检查并重置过期的metrics计数
      await data.checkAndResetMetrics(config.main.timezone);

      // 然后记录当前访问
      await data.record_metrics(path);
    } catch (error) {
      console.error('[Metrics] Failed to record metrics:', error);
    }
  }

  // 记录访问日志 - Worker已记录访问信息
});

app.get("/static/*", (c) => {
  const currentTheme = Utils.getTheme(c);
  const fullPath = c.req.path.replace('/static/', '') || "";

  return c.redirect(`/static-themed/${currentTheme}/${fullPath}`, 302);
});

// 处理面板页面的静态文件请求
app.get("/panel/static/*", (c) => {
  const currentTheme = Utils.getTheme(c);
  const fullPath = c.req.path.replace('/panel/static/', '') || "";

  return c.redirect(`/static-themed/${currentTheme}/${fullPath}`, 302);
});

app.get("/static-themed/:theme/*", async (c) => {
  const theme = c.req.param("theme");
  const filename = c.req.path.split("/static-themed/" + theme + "/")[1] || "";

  try {
    // 1. 尝试从指定主题加载静态文件
    let staticPath = `${theme}/static/${filename}`;
    let response = await Utils.getAssetResponse(c.env, staticPath);

    if (response && response.status === 200) {
      return response;
    }

    // 2. 主题不存在且不是默认主题 -> 重定向到默认主题
    if (theme !== "default") {
      return c.redirect(`/static-themed/default/${filename}`, 302);
    }

    // 3. 默认主题也没有 -> 404
    console.warn(`[theme] static file ${filename} not found`);
    return c.text(`Static file ${filename} in theme ${theme} not found!`, 404);
  } catch (error) {
    console.error(`[static-themed] Error accessing ${filename}:`, error);
    return c.text(`Static file ${filename} in theme ${theme} not found!`, 404);
  }
});

app.get("/default/*", async (c) => {
  let filename = c.req.param("*");
  if (!filename) {
    return c.notFound();
  }

  if (!filename.endsWith(".js")) {
    filename += ".js";
  }

  try {
    const response = await Utils.getAssetResponse(c.env, `default/${filename}`);
    return response || c.notFound();
  } catch (error) {
    return c.notFound();
  }
});

app.get("/", async (c) => {
  try {
    const config = Utils.getConfig(c.env);
    const data = new Data(c.env);

    let moreText = config.page.more_text;
    if (config.metrics.enabled) {
      try {
        const [daily, weekly, monthly, yearly, total] = await data.get_metric_data_index();
        moreText = moreText.replace(/{visit_daily}/g, daily.toString())
                          .replace(/{visit_weekly}/g, weekly.toString())
                          .replace(/{visit_monthly}/g, monthly.toString())
                          .replace(/{visit_yearly}/g, yearly.toString())
                          .replace(/{visit_total}/g, total.toString());
      } catch (error) {
        console.warn('[Metrics] Failed to load metric data for homepage:', error);
      }
    }

    const statusId = await data.get_status_id();
    const [, statusData] = data.get_status(statusId);
    // 获取并转换last_updated时间到UTC+8
    const lastUpdatedTimestamp = await data.get_last_updated() || Math.floor(Date.now() / 1000);
    const utcDate = new Date(lastUpdatedTimestamp * 1000);
    // 转换到UTC+8时区
    const utc8Date = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
    const formattedLastUpdated = utc8Date.toISOString().replace('T', ' ').substring(0, 19) + ' (UTC+8)';

    const mainCard = await Utils.renderTemplate(c, "main.index.html", "cards", undefined, {
      username: config.page.name,
      status: statusData,
      last_updated: formattedLastUpdated
    });
    const moreInfoCard = await Utils.renderTemplate(c, "more_info.index.html", "cards", undefined, {
      more_text: moreText,
      username: config.page.name,
      learn_more_link: config.page.learn_more_link,
      learn_more_text: config.page.learn_more_text,
      available_themes: await Utils.getAvailableThemes(c.env)
    });

    const cards = {
      main: mainCard || '',
      'more-info': moreInfoCard || ''
    };

    // 加载插件卡片
    if (pluginManager) {
      try {
        const pluginCards = await pluginManager.getIndexCards();
        Object.assign(cards, pluginCards);
      } catch (error) {
        console.error("[HomePage] Error loading plugin cards:", error);
      }
    }

    // 处理注入内容
    const injects: string[] = [];

    // 加载插件注入内容
    if (pluginManager) {
      try {
        const pluginInjects = await pluginManager.getIndexInjects();
        injects.push(...pluginInjects);
      } catch (error) {
        console.error("[HomePage] Error loading plugin injects:", error);
      }
    }

    // 触发主页访问事件
    const indexEvent = new IndexAccessEvent(
      config.page.title,
      config.page.desc,
      config.page.favicon,
      config.page.background,
      cards,
      injects,
      c
    );

    if (pluginManager) {
      pluginManager.triggerEvent(indexEvent);

      // 如果事件被拦截，返回拦截结果
      if (indexEvent.isIntercepted) {
        return new Response(indexEvent.interception!.response, {
          status: indexEvent.interception!.code
        });
      }
    }

    const renderedPage = await Utils.renderTemplate(c, "index.html", "templates", undefined, {
      page_title: indexEvent.pageTitle,
      page_desc: indexEvent.pageDesc,
      page_favicon: indexEvent.pageFavicon,
      page_background: indexEvent.pageBackground,
      cards: indexEvent.cards,
      inject: indexEvent.injects.join('\n')
    });

    if (renderedPage) {
      return c.html(renderedPage);
    }
    return c.text("Hello Hono!", 200);
  } catch (error) {
    console.error("[HomePage] Error:", error);
    return c.text("Error rendering homepage: " + (error instanceof Error ? error.message : String(error)), 500);
  }
});

app.get("/favicon.ico", async (c) => {
  const config = Utils.getConfig(c.env);

  // 触发favicon访问事件
  if (pluginManager) {
    const faviconEvent = new FaviconAccessEvent(config.page.favicon, c);
    pluginManager.triggerEvent(faviconEvent);

    if (faviconEvent.isIntercepted) {
      return faviconEvent.interception!.response;
    }

    // 使用事件中可能被修改的favicon URL
    const faviconUrl = faviconEvent.faviconUrl;

    if (faviconUrl === "/favicon.ico") {
      // 服务默认 favicon
      try {
        let response = await Utils.getAssetResponse(c.env, "../public/favicon.ico");
        if (!response) {
          response = await Utils.getAssetResponse(c.env, "default/static/favicon.ico");
        }
        return response || c.notFound();
      } catch (error) {
        return c.notFound();
      }
    } else {
      return c.redirect(faviconUrl, 302);
    }
  }

  if (config.page.favicon === "/favicon.ico") {
    try {
      let response = await Utils.getAssetResponse(c.env, "../public/favicon.ico");
      if (!response) {
        response = await Utils.getAssetResponse(c.env, "default/static/favicon.ico");
      }
      return response || c.notFound();
    } catch (error) {
      return c.notFound();
    }
  } else {
    return c.redirect(config.page.favicon, 302);
  }
});

// GitHub 重定向路由
app.get("/github", (c) => {
  return c.redirect("https://github.com/sleepy-project/sleepy", 301);
});

// 健康检查路由
app.get("/none", (c) => {
  return new Response(null, { status: 204 });
});

app.get("/api/meta", (c) => {
  let config = Utils.getConfig(c.env);
  const metadata = {
    success: true,
    version: version,
    version_str: version,
    timezone: config.main.timezone,
    page: {
      name: config.page.name,
      title: config.page.title,
      desc: config.page.desc,
      favicon: config.page.favicon,
      background: config.page.background,
      theme: config.page.theme,
    },
    status: {
      device_slice: config.status.device_slice,
      refresh_interval: config.status.refresh_interval,
      not_using: config.status.not_using,
      sorted: config.status.sorted,
      using_first: config.status.using_first,
    },
    metrics: config.metrics.enabled,
  };

  // 触发元数据访问事件
  if (pluginManager) {
    const metadataEvent = new MetadataAccessEvent(metadata, c);
    pluginManager.triggerEvent(metadataEvent);

    if (metadataEvent.isIntercepted) {
      return metadataEvent.interception!.response;
    }

    return c.json(metadataEvent.metadata);
  }

  return c.json(metadata);
});

app.get("/api/metrics", async (c) => {
  const config = Utils.getConfig(c.env);
  const data = new Data(c.env);

  // 触发metrics访问事件
  if (pluginManager) {
    const metricsResponse = await Utils.getMetricsResponse(data, config);
    const event = new (await import('./plugin')).MetricsAccessEvent(metricsResponse, c);
    const triggeredEvent = pluginManager.triggerEvent(event);

    if (triggeredEvent.isIntercepted && triggeredEvent.interception) {
      return c.json(triggeredEvent.interception.response, {
        status: triggeredEvent.interception.code as any
      });
    }

    return c.json(triggeredEvent.metricsResponse);
  }

  // 如果插件系统未初始化，直接返回数据
  const metricsResponse = await Utils.getMetricsResponse(data, config);
  return c.json(metricsResponse);
});

async function query(c: Context) {
  let config = Utils.getConfig(c.env);
  let data = new Data(c.env);
  let stid = await data.get_status_id();
  let stinfo: StatusItemModel | undefined = undefined;
  if (stid !== undefined) {
    stinfo = config.status.status_list[stid];
  } else {
    stinfo = {
      id: -1,
      name: "unknown",
      desc: "未知的标识符，可能是配置问题。",
      color: "error",
    };
  }

  const queryResponse: any = {
    success: true,
    time: Date.now(),
    status: stinfo,
    device: await data.device_list(),
    last_updated: await data.get_last_updated(),
    private_mode: await data.get_private_mode(),
  };

  // 检查是否需要包含 metadata
  const includeMeta = c.req.query('meta') === 'true';
  if (includeMeta) {
    queryResponse.meta = {
      success: true,
      version: version,
      version_str: version,
      timezone: config.main.timezone,
      page: {
        name: config.page.name,
        title: config.page.title,
        desc: config.page.desc,
        favicon: config.page.favicon,
        background: config.page.background,
        theme: config.page.theme,
      },
      status: {
        device_slice: config.status.device_slice,
        refresh_interval: config.status.refresh_interval,
        not_using: config.status.not_using,
        sorted: config.status.sorted,
        using_first: config.status.using_first,
      },
      metrics: config.metrics.enabled,
    };
  }

  // 检查是否需要包含 metrics
  const includeMetrics = c.req.query('metrics') === 'true';
  if (includeMetrics) {
    queryResponse.metrics = await Utils.getMetricsResponse(data, config);
  }

  // 触发查询访问事件
  if (pluginManager) {
    const queryEvent = new QueryAccessEvent(queryResponse, c);
    pluginManager.triggerEvent(queryEvent);

    if (queryEvent.isIntercepted) {
      return queryEvent.interception!.response;
    }

    return queryEvent.queryResponse;
  }

  return queryResponse;
}

app.get("/api/status/query", async (c) => {
  return c.json(await query(c));
});

app.get("/api/status/events", (c) => {
  let last_event_id = Number(c.req.header("Last-Event-ID") ?? "0");
  if (isNaN(last_event_id)) {
    return c.text("invalid Last-Event-ID", 400);
  }

  // 触发流连接事件
  if (pluginManager) {
    const streamConnectedEvent = new StreamConnectedEvent(last_event_id, c);
    pluginManager.triggerEvent(streamConnectedEvent);

    if (streamConnectedEvent.isIntercepted) {
      return streamConnectedEvent.interception!.response;
    }
  }

  return streamSSE(c, async (stream) => {
    let last_updated_timestamp: number | null = null;
    let last_heartbeat = Date.now();
    const connection_start_time = Date.now(); // 记录连接开始时间
    const MAX_CONNECTION_TIME = 25 * 1000;

    try {
      while (true) {
        let current_time = Date.now();

        // 检查连接是否已超时，如果是则主动断开连接
        if (current_time - connection_start_time > MAX_CONNECTION_TIME) {
          console.log("SSE连接已超，主动断开连接");
          break;
        }

        let current_updated_timestamp = await new Data(c.env).get_last_updated();
        if (last_updated_timestamp !== current_updated_timestamp) {
          last_updated_timestamp = current_updated_timestamp;
          last_heartbeat = current_time;

          let update_data = JSON.stringify(await query(c));
          last_event_id++;
          stream.write(`id: ${last_event_id}\n`);
          stream.write(`event: update\n`);
          stream.write(`data: ${update_data}\n\n`);
        } else if (current_time - last_heartbeat > 30 * 1000) {
          last_event_id++;
          last_heartbeat = current_time;
          stream.write(`id: ${last_event_id}\n`);
          stream.write(`event: heartbeat\n`);
          stream.write(`data: \n\n`);
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    } finally {
      // 触发流断开事件
      if (pluginManager) {
        const streamDisconnectedEvent = new StreamDisconnectedEvent(c);
        pluginManager.triggerEvent(streamDisconnectedEvent);
      }
    }
  });
});

app.get("/api/status/set", async (c) => {
  if (!(await Utils.auth_check(c))) {
    return c.text("unauthorized", 401);
  }
  let status = Number(c.req.query("status"));
  if (isNaN(status)) {
    return c.text("invalid status", 400);
  }
  let data = new Data(c.env);
  if ((await data.get_status_id()) !== status) {
    let oldStatusId = await data.get_status_id();
    let old_status = data.get_status(oldStatusId);
    let new_status = data.get_status(status);

    // 触发状态更新事件
    if (pluginManager) {
      const statusEvent = new StatusUpdatedEvent(
        old_status[0],
        old_status[1],
        new_status[0],
        new_status[1],
        c
      );
      pluginManager.triggerEvent(statusEvent);

      if (statusEvent.isIntercepted) {
        return statusEvent.interception!.response;
      }

      // 使用事件中可能被修改的状态值
      status = statusEvent.newStatus.id;
    }

    await data.set_status_id(status);
    await data.set_last_updated();
  }
  return c.json({
    success: true,
    set_to: status,
  });
});

app.get("/api/status/list", (c) => {
  const config = Utils.getConfig(c.env);

  // 触发状态列表访问事件
  if (pluginManager) {
    const statusListEvent = new StatuslistAccessEvent(config.status.status_list, c);
    pluginManager.triggerEvent(statusListEvent);

    if (statusListEvent.isIntercepted) {
      return statusListEvent.interception!.response;
    }

    return c.json({
      success: true,
      status_list: statusListEvent.statusList,
    });
  }

  return c.json({
    success: true,
    status_list: config.status.status_list,
  });
});

app.get("/api/device/set", async (c) => {
  if (!(await Utils.auth_check(c))) {
    return c.text("unauthorized", 401);
  }
  let device_id = c.req.query("id");
  let device_show_name = c.req.query("show_name");
  let device_using = Boolean(c.req.query("using"));
  let device_status = c.req.query("status") ?? c.req.query("app_name");

  if (!device_id) {
    return c.text("invalid device id", 400);
  }
  let data = new Data(c.env);

  // 触发设备设置事件
  if (pluginManager) {
    const deviceEvent = new DeviceSetEvent(
      device_id || null,
      device_show_name || null,
      device_using,
      device_status || null,
      {},
      c
    );
    pluginManager.triggerEvent(deviceEvent);

    if (deviceEvent.isIntercepted) {
      return deviceEvent.interception!.response;
    }

    // 使用事件中可能被修改的值
    device_id = deviceEvent.deviceId || undefined;
    device_show_name = deviceEvent.show_name || undefined;
    device_using = deviceEvent.using ?? device_using;
    device_status = deviceEvent.status || undefined;
  }

  const success = await data.set_device(
    device_id || '',
    device_show_name,
    device_using,
    device_status
  );

  if (success) {
    await data.set_last_updated();
  }

  return c.json({
    success: success,
  });
});

app.post("/api/device/set", async (c) => {
  if (!(await Utils.auth_check(c))) {
    return c.text("unauthorized", 401);
  }
  let body = await c.req.json();
  let device_id = body["id"];
  let device_show_name = body["show_name"];
  let device_using = Boolean(body["using"]);
  let device_status = body["status"] ?? body["app_name"];

  if (!device_id) {
    return c.text("invalid device id", 400);
  }

  // 触发设备设置事件
  if (pluginManager) {
    const deviceEvent = new DeviceSetEvent(
      device_id || null,
      device_show_name || null,
      device_using,
      device_status || null,
      body.fields || {},
      c
    );
    pluginManager.triggerEvent(deviceEvent);

    if (deviceEvent.isIntercepted) {
      return deviceEvent.interception!.response;
    }

    // 使用事件中可能被修改的值
    device_id = deviceEvent.deviceId || device_id;
    device_show_name = deviceEvent.show_name || device_show_name;
    device_using = deviceEvent.using ?? device_using;
    device_status = deviceEvent.status || device_status;
  }

  let data = new Data(c.env);
  const success = await data.set_device(
    device_id,
    device_show_name,
    device_using,
    device_status
  );

  if (success) {
    await data.set_last_updated();
  }

  return c.json({
    success: success,
  });
});

app.get("/api/device/remove", async (c) => {
  if (!(await Utils.auth_check(c))) {
    return c.text("unauthorized", 401);
  }
  let device_id = c.req.query("id");
  if (!device_id) {
    return c.text("invalid device id", 400);
  }
  let data = new Data(c.env);

  // 检查设备是否存在
  const device = await data.get_device(device_id);

  // 触发设备移除事件
  if (pluginManager) {
    const deviceEvent = new DeviceRemovedEvent(
      !!device,
      device_id,
      device?.show_name || null,
      device?.using || null,
      device?.status || null,
      (device?.fields as Record<string, any>) || null,
      c
    );
    pluginManager.triggerEvent(deviceEvent);

    if (deviceEvent.isIntercepted) {
      return deviceEvent.interception!.response;
    }

    device_id = deviceEvent.deviceId;
  }

  const success = await data.remove_device(device_id);

  if (success) {
    await data.set_last_updated();
  }

  return c.json({
    success: success,
  });
});

app.get("/api/device/clear", async (c) => {
  if (!(await Utils.auth_check(c))) {
    return c.text("unauthorized", 401);
  }
  let data = new Data(c.env);

  // 触发设备清空事件
  if (pluginManager) {
    const deviceList = await data.device_list();
    const deviceEvent = new DeviceClearedEvent(deviceList, c);
    pluginManager.triggerEvent(deviceEvent);

    if (deviceEvent.isIntercepted) {
      return deviceEvent.interception!.response;
    }
  }

  const success = await data.clear_device();

  if (success) {
    await data.set_last_updated();
  }

  return c.json({
    success: success,
  });
});

app.get("/api/device/private", async (c) => {
  if (!(await Utils.auth_check(c))) {
    return c.text("unauthorized", 401);
  }
  let privateModeString = c.req.query("private");
  if (privateModeString === undefined) {
    return c.text("invalid private", 400);
  }
  let privateMode = privateModeString === "true" || privateModeString === "1";
  let data = new Data(c.env);
  const currentPrivateMode = await data.get_private_mode() || false;

  // 只有当状态发生变化时才触发事件
  if (privateMode !== currentPrivateMode) {
    // 触发隐私模式变更事件
    if (pluginManager) {
      const privateModeEvent = new PrivateModeChangedEvent(
        currentPrivateMode,
        privateMode,
        c
      );
      pluginManager.triggerEvent(privateModeEvent);

      if (privateModeEvent.isIntercepted) {
        return privateModeEvent.interception!.response;
      }

      privateMode = privateModeEvent.newStatus;
    }
  }

  const success = await data.set_private_mode(privateMode);

  if (success) {
    await data.set_last_updated();
  }

  return c.json({
    success: success,
  });
});

// ========== 插件管理 API ==========

// 导入插件管理API处理函数
import {
  handleGetPluginStatus,
  handleEnablePlugin,
  handleDisablePlugin,
  handleReloadPlugins,
  handleGetPluginInfo,
  handleGetAvailablePlugins
} from './plugin/api';

// 获取所有插件状态
app.get("/api/plugins/status", handleGetPluginStatus);

// 启用插件
app.post("/api/plugins/enable", handleEnablePlugin);

// 禁用插件
app.post("/api/plugins/disable", handleDisablePlugin);

// 重新加载所有插件
app.post("/api/plugins/reload", handleReloadPlugins);

// 获取插件详细信息
app.get("/api/plugins/:name", handleGetPluginInfo);

// 获取可用插件列表
app.get("/api/plugins/available", handleGetAvailablePlugins);

app.get("/api/init", async (c) => {
  if (!(await Utils.auth_check(c))) {
    return c.text("unauthorized", 401);
  }
  let data = new Data(c.env);
  return c.json({
    success: await data.init_db(),
  });
});

// 手动重置 metrics 计数的 API 端点
app.post("/api/metrics/reset", async (c) => {
  if (!(await Utils.auth_check(c))) {
    return c.text("unauthorized", 401);
  }

  try {
    const config = Utils.getConfig(c.env);
    const data = new Data(c.env);

    // 强制重置所有 metrics 计数
    await data.DBClient?.metricsData.updateMany({
      data: {
        daily: 0,
        weekly: 0,
        monthly: 0,
        yearly: 0
        // 保留 total 计数
      }
    });

    // 更新元数据为当前时间
    const currentTime = new Date(new Date().toLocaleString("en-US", { timeZone: config.main.timezone }));
    const currentDay = currentTime.toISOString().split('T')[0];
    const currentWeek = data.getWeekIdentifier(currentTime);
    const currentMonth = `${currentTime.getFullYear()}-${(currentTime.getMonth() + 1).toString().padStart(2, '0')}`;
    const currentYear = currentTime.getFullYear().toString();

    await data.DBClient?.metricsMetaData.upsert({
      where: { id: 0 },
      update: {
        today: currentDay,
        week: currentWeek,
        month: currentMonth,
        year: currentYear
      },
      create: {
        id: 0,
        today: currentDay,
        week: currentWeek,
        month: currentMonth,
        year: currentYear
      }
    });

    console.log('[Metrics] Manual reset completed');

    // 触发客户端更新，因为 metrics 重置会影响主页统计显示
    await data.set_last_updated();

    return c.json({
      success: true,
      message: 'Metrics reset successfully',
      reset_time: currentTime.toISOString()
    });
  } catch (error) {
    console.error('[Metrics] Failed to reset metrics:', error);
    return c.json({
      success: false,
      message: 'Failed to reset metrics'
    }, 500);
  }
});

// Panel routes
app.get('/panel', async (c) => {
  return Utils.requireAuth(c, async () => {
    const theme = Utils.getTheme(c)
    const config = Utils.getConfig(c.env)

    const cards: Record<string, any> = {}

    // 加载插件管理面板卡片
    if (pluginManager) {
      try {
        const pluginCards = await pluginManager.getPanelCards();
        Object.assign(cards, pluginCards);
      } catch (error) {
        console.error("[Panel] Error loading plugin cards:", error);
      }
    }

    const injects: string[] = [];

    // 加载插件注入内容
    if (pluginManager) {
      try {
        const pluginInjects = await pluginManager.getPanelInjects();
        injects.push(...pluginInjects);
      } catch (error) {
        console.error("[Panel] Error loading plugin injects:", error);
      }
    }

    // 触发管理面板访问事件
    const panelEvent = new PanelAccessEvent(cards, injects, c);
    if (pluginManager) {
      pluginManager.triggerEvent(panelEvent);

      if (panelEvent.isIntercepted) {
        return panelEvent.interception!.response;
      }
    }

    const context = {
      c: config,
      current_theme: theme,
      available_themes: ['default', 'dark', 'blue', 'github', 'simple', 'console'],
      cards: panelEvent.cards,
      inject: panelEvent.injects.join('\n')
    }

    const renderedHtml = await Utils.renderTemplate(c, 'panel.html', 'templates', theme, context)
    if (!renderedHtml) {
      return c.text('Panel template not found', 404)
    }

    return c.html(renderedHtml)
  }, '/panel/login')
})

app.get('/panel/login', async (c) => {
  const theme = Utils.getTheme(c)
  const config = Utils.getConfig(c.env)

  // Check if already logged in
  const cookieSecret = getCookie(c, 'sleepy-secret')
  if (cookieSecret === c.env.SECRET) {
    return c.redirect('/panel')
  }

  const context = {
    c: config,
    current_theme: theme
  }

  const renderedHtml = await Utils.renderTemplate(c, 'login.html', 'templates', theme, context)
  if (!renderedHtml) {
    return c.text('Login template not found', 404)
  }

  return c.html(renderedHtml)
})

app.post('/panel/auth', async (c) => {
  return Utils.requireAuth(c, async () => {
    // 触发登录事件
    if (pluginManager) {
      const loginEvent = new LoginEvent(true, c);
      pluginManager.triggerEvent(loginEvent);

      if (loginEvent.isIntercepted) {
        return loginEvent.interception!.response;
      }
    }

    const response = new Response(JSON.stringify({
      success: true,
      code: 'OK',
      message: 'Login successful'
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `sleepy-secret=${c.env.SECRET}; Max-Age=2592000; HttpOnly; SameSite=Lax; Path=/`
      }
    })

    return response
  })
})

app.get('/panel/logout', (c) => {
  // 触发登出事件
  if (pluginManager) {
    const logoutEvent = new LogoutEvent(c);
    pluginManager.triggerEvent(logoutEvent);
  }

  const response = new Response('', {
    status: 302,
    headers: {
      'Location': '/panel/login',
      'Set-Cookie': 'sleepy-secret=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/'
    }
  })

  return response
})

app.all('/panel/verify', async (c) => {
  return Utils.requireAuth(c, async () => {
    return c.json({
      success: true,
      code: 'OK',
      message: 'Secret verified'
    })
  })
})

// 应用导出前的最终初始化
if (pluginManager) {
  // 触发应用启动事件
  (pluginManager as PluginManager).triggerEvent(new AppStartedEvent());

  // 打印插件系统统计信息
  (pluginManager as PluginManager).printStats();
} else {
  // 插件系统将在首次请求时初始化
}

export default app;
