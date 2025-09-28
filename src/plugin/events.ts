import { Context } from "hono";
import { StatusItemModel } from "../model";

/**
 * 基础事件类
 */
export abstract class BaseEvent {
  /** 事件 ID */
  abstract readonly id: string;

  /** 事件生成时间 */
  readonly time: Date = new Date();

  /** 事件是否可拦截 */
  readonly interceptable: boolean = true;

  /** 拦截后返回结果 (如被拦截) */
  interception: { response: any; code: number } | null = null;

  /** 触发事件的请求上下文 (如有) */
  context?: Context;

  constructor(context?: Context) {
    this.context = context;
  }

  /**
   * 中断事件, 并提前返回 (如果可中断)
   * @param response 中断后返回的内容
   * @param code 中断后返回的 HTTP 状态码
   */
  intercept(response: any, code: number = 200): void {
    if (this.interceptable) {
      this.interception = { response, code };
    }
  }

  /** 检查事件是否已被拦截 */
  get isIntercepted(): boolean {
    return this.interception !== null;
  }
}

// ========== 应用生命周期事件 ==========

/**
 * 应用初始化完成事件
 */
export class AppInitializedEvent extends BaseEvent {
  readonly id = 'app_initialized';
  readonly interceptable = false;
}

/**
 * 应用启动事件
 */
export class AppStartedEvent extends BaseEvent {
  readonly id = 'app_started';
  readonly interceptable = false;
}

/**
 * 应用停止事件
 */
export class AppStoppedEvent extends BaseEvent {
  readonly id = 'app_stopped';
  readonly interceptable = false;

  constructor(public readonly exitCode: number, context?: Context) {
    super(context);
  }
}

// ========== 错误处理事件 ==========

/**
 * API 失败事件
 */
export class APIUnsuccessfulEvent extends BaseEvent {
  readonly id = 'api_unsuccessful';

  constructor(
    public readonly error: {
      code: number;
      message: string;
      details?: string;
    },
    context?: Context
  ) {
    super(context);
  }
}

/**
 * HTTP 错误事件
 */
export class HTTPErrorEvent extends BaseEvent {
  readonly id = 'http_error';

  constructor(
    public readonly error: {
      status: number;
      message: string;
    },
    context?: Context
  ) {
    super(context);
  }
}

/**
 * 未处理错误事件
 */
export class UnhandledErrorEvent extends BaseEvent {
  readonly id = 'unhandled_error';

  constructor(public readonly error: Error, context?: Context) {
    super(context);
  }
}

// ========== 请求处理事件 ==========

/**
 * 请求前置钩子
 */
export class BeforeRequestHook extends BaseEvent {
  readonly id = 'before_request';

  constructor(context: Context) {
    super(context);
  }
}

/**
 * 请求后置钩子
 */
export class AfterRequestHook extends BaseEvent {
  readonly id = 'after_request';

  constructor(
    public response: Response,
    context: Context
  ) {
    super(context);
  }
}

// ========== 页面访问事件 ==========

/**
 * 请求主页事件
 */
export class IndexAccessEvent extends BaseEvent {
  readonly id = 'index_access';

  constructor(
    public pageTitle: string,
    public pageDesc: string,
    public pageFavicon: string,
    public pageBackground: string,
    public cards: Record<string, string>,
    public injects: string[],
    context?: Context
  ) {
    super(context);
  }
}

/**
 * 请求 /favicon.ico 事件
 */
export class FaviconAccessEvent extends BaseEvent {
  readonly id = 'favicon_access';

  constructor(public faviconUrl: string, context?: Context) {
    super(context);
  }
}

/**
 * 请求 /api/meta 事件
 */
export class MetadataAccessEvent extends BaseEvent {
  readonly id = 'metadata_access';

  constructor(public metadata: Record<string, any>, context?: Context) {
    super(context);
  }
}

/**
 * 请求 /api/metrics 事件
 */
export class MetricsAccessEvent extends BaseEvent {
  readonly id = 'metrics_access';

  constructor(public metricsResponse: Record<string, any>, context?: Context) {
    super(context);
  }
}

// ========== 状态管理事件 ==========

/**
 * 请求 /api/status/query 事件
 */
export class QueryAccessEvent extends BaseEvent {
  readonly id = 'query_access';

  constructor(public queryResponse: Record<string, any>, context?: Context) {
    super(context);
  }
}

/**
 * event stream 连接事件 (请求 /api/status/events)
 */
export class StreamConnectedEvent extends BaseEvent {
  readonly id = 'stream_connected';

  constructor(public eventId: number, context?: Context) {
    super(context);
  }
}

/**
 * event stream 断开事件
 */
export class StreamDisconnectedEvent extends BaseEvent {
  readonly id = 'stream_disconnected';
  readonly interceptable = false;
}

/**
 * 手动状态更新事件
 */
export class StatusUpdatedEvent extends BaseEvent {
  readonly id = 'status_updated';

  constructor(
    public oldExists: boolean,
    public oldStatus: StatusItemModel,
    public newExists: boolean,
    public newStatus: StatusItemModel,
    context?: Context
  ) {
    super(context);
  }
}

/**
 * 请求 /api/status/list 事件
 */
export class StatuslistAccessEvent extends BaseEvent {
  readonly id = 'statuslist_access';

  constructor(public statusList: StatusItemModel[], context?: Context) {
    super(context);
  }
}

// ========== 设备管理事件 ==========

/**
 * 设备状态更新事件 (请求 /api/device/set)
 */
export class DeviceSetEvent extends BaseEvent {
  readonly id = 'device_set';

  constructor(
    public deviceId: string | null,
    public showName: string | null,
    public using: boolean | null,
    public status: string | null,
    public fields: Record<string, any>,
    context?: Context
  ) {
    super(context);
  }
}

/**
 * 设备移除事件
 */
export class DeviceRemovedEvent extends BaseEvent {
  readonly id = 'device_removed';

  constructor(
    public exists: boolean,
    public deviceId: string,
    public showName: string | null,
    public using: boolean | null,
    public status: string | null,
    public fields: Record<string, any> | null,
    context?: Context
  ) {
    super(context);
  }
}

/**
 * 设备清除事件
 */
export class DeviceClearedEvent extends BaseEvent {
  readonly id = 'device_cleared';

  constructor(public devices: Record<string, any>, context?: Context) {
    super(context);
  }
}

/**
 * 隐私模式切换事件
 */
export class PrivateModeChangedEvent extends BaseEvent {
  readonly id = 'private_mode_changed';

  constructor(
    public oldStatus: boolean,
    public newStatus: boolean,
    context?: Context
  ) {
    super(context);
  }
}

// ========== 管理面板事件 ==========

/**
 * 管理面板访问事件
 */
export class PanelAccessEvent extends BaseEvent {
  readonly id = 'panel_access';

  constructor(
    public cards: Record<string, { title: string; content: string; priority?: number }>,
    public injects: string[],
    context?: Context
  ) {
    super(context);
  }
}

/**
 * 登录事件
 */
export class LoginEvent extends BaseEvent {
  readonly id = 'login';

  constructor(public success: boolean, context?: Context) {
    super(context);
  }
}

/**
 * 登出事件
 */
export class LogoutEvent extends BaseEvent {
  readonly id = 'logout';
  readonly interceptable = false;

  constructor(context?: Context) {
    super(context);
  }
}

// ========== 事件类型联合 ==========

export type SleepyEvent =
  | AppInitializedEvent
  | AppStartedEvent
  | AppStoppedEvent
  | APIUnsuccessfulEvent
  | HTTPErrorEvent
  | UnhandledErrorEvent
  | BeforeRequestHook
  | AfterRequestHook
  | IndexAccessEvent
  | FaviconAccessEvent
  | MetadataAccessEvent
  | MetricsAccessEvent
  | QueryAccessEvent
  | StreamConnectedEvent
  | StreamDisconnectedEvent
  | StatusUpdatedEvent
  | StatuslistAccessEvent
  | DeviceSetEvent
  | DeviceRemovedEvent
  | DeviceClearedEvent
  | PrivateModeChangedEvent
  | PanelAccessEvent
  | LoginEvent
  | LogoutEvent;

// ========== 事件处理器类型 ==========

export type EventHandler<T extends BaseEvent = BaseEvent> = (event: T) => void | Promise<void>;

export type EventHandlerMap = {
  [K in SleepyEvent['id']]?: EventHandler[];
};
