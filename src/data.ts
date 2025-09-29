import { PrismaD1 } from "@prisma/adapter-d1";
import {
  DeviceStatusData,
  MainData,
  MetricsData,
  MetricsMetaData,
  PluginData,
  PrismaClient,
} from "./generated/prisma";
import { Bindings, Utils } from "./index";
import { ConfigModel, StatusItemModel } from "./model";
import { InputJsonValue } from "./generated/prisma/runtime/library";

export class Data {
  DBClient: PrismaClient;
  config: ConfigModel;
  mainData: MainData | null = null;
  deviceStatusData: DeviceStatusData[] | null = null;
  metricsMetaData: MetricsMetaData | null = null;
  metricsData: MetricsData[] | null = null;
  pluginData: PluginData[] | null = null;
  private lastMetricsCheck: number = 0; // 上次检查重置的时间戳
  private readonly METRICS_CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟检查一次

  constructor(env: Bindings) {
    let adapter = new PrismaD1(env.DB);
    this.DBClient = new PrismaClient({ adapter });
    this.config = Utils.getConfig(env);
  }

  async get_status_id() {
    this.mainData ??= await this.DBClient?.mainData.findFirst();
    return this.mainData?.status;
  }

  async set_status_id(id: number) {
    await this.DBClient?.mainData.update({
      data: { status: id },
      where: { id: 0 },
    });
    return true;
  }

  get_status(status_id: number | undefined): [boolean, StatusItemModel] {
    if (status_id !== undefined) {
      let status = this.config?.status.status_list[status_id];
      if (status) {
        return [true, status];
      }
    }
    return [
      false,
      new StatusItemModel(
        status_id,
        "unknown",
        "未知的标识符，可能是配置问题。",
        "error"
      ),
    ];
  }

  async status(): Promise<[boolean, StatusItemModel]> {
    let id = await this.get_status_id();
    return this.get_status(id);
  }

  async get_private_mode() {
    this.mainData ??= await this.DBClient?.mainData.findFirst();
    return this.mainData?.privateMode;
  }

  async set_private_mode(value: boolean) {
    await this.DBClient?.mainData.update({
      data: { privateMode: value },
      where: { id: 0 },
    });
    return true;
  }

  async get_last_updated() {
    this.mainData ??= await this.DBClient?.mainData.findFirst();
    return this.mainData?.lastUpdated ? Math.floor(this.mainData.lastUpdated.getTime() / 1000) : null;
  }

  async set_last_updated() {
    await this.DBClient?.mainData.update({
      data: { lastUpdated: new Date() },
      where: { id: 0 },
    });
    return true;
  }

  async _raw_device_list(): Promise<DeviceStatusData[]> {
    if (await this.get_private_mode()) {
      return [];
    }
    this.deviceStatusData ??= await this.DBClient?.deviceStatusData.findMany();
    /*return this.deviceStatusData.reduce((map: { [key: string]: DeviceStatusData }, obj: DeviceStatusData) => {
        map[obj.id] = obj;
        return map;
    }, {} as Record<string, DeviceStatusData>);*/
    return this.deviceStatusData;
  }

  async device_list() {
    if (await this.get_private_mode()) {
      return {};
    }
    let device_list: DeviceStatusData[] = [];
    let device_raw_list = await this._raw_device_list();
    if (this.config.status.using_first) {
      device_list.push(...device_raw_list.filter((d) => d.using === true));
      device_list.push(...device_raw_list.filter((d) => d.using === false));
      device_list.push(...device_raw_list.filter((d) => d.using === undefined));
    } else {
      device_list = device_raw_list;
      if (this.config.status.sorted) {
        device_list.sort((a, b) => {
          if (a.show_name < b.show_name) {
            return -1;
          }
          if (a.show_name > b.show_name) {
            return 1;
          }
          return 0;
        });
      }
    }
    if (this.config.status.not_using != undefined) {
      let not_using = this.config.status.not_using;
      device_list.forEach((d) => {
        if (d.using === false) {
          d.show_name = not_using;
        }
      });
    }
    const deviceMap: { [deviceId: string]: DeviceStatusData & { last_updated: number } } = {};
    device_list.forEach(device => {
      deviceMap[device.id] = {
        ...device,
        last_updated: Math.floor(device.lastUpdated.getTime() / 1000)
      };
    });
    return deviceMap;
  }

  async get_device(id: string) {
    return await this.DBClient?.deviceStatusData.findUnique({
      where: { id: id },
    });
  }

  async set_device(
    id: string,
    show_name: string | undefined = undefined,
    using: boolean | undefined = undefined,
    status: string | undefined = undefined,
    fields: InputJsonValue | undefined = undefined
  ) {
    this.deviceStatusData ??= await this.DBClient?.deviceStatusData.findMany();
    if (!this.deviceStatusData.find((d) => d.id == id)) {
      if (show_name === undefined) {
        return false;
      }
      await this.DBClient?.deviceStatusData.create({
        data: {
          id: id,
          show_name: show_name,
          using: using,
          status: status,
          fields: fields ?? {},
        },
      });
      return true;
    }
    await this.DBClient?.deviceStatusData.update({
      data: {
        show_name: show_name,
        using: using,
        status: status,
        fields: fields,
      },
      where: { id: id },
    });
    return true;
  }

  async remove_device(id: string) {
    this.deviceStatusData ??= await this.DBClient?.deviceStatusData.findMany();
    if (this.deviceStatusData.find((d) => d.id == id)) {
      await this.DBClient?.deviceStatusData.delete({ where: { id: id } });
      return true;
    }
    return false;
  }

  async clear_device() {
    await this.DBClient?.deviceStatusData.deleteMany();
    await this.set_last_updated();
    return true;
  }

  async record_metrics(
    path: string,
    count: number = 1,
    override: boolean = false
  ) {
    if (!this.config.metrics.allowList.includes(path)) {
      return;
    }
    this.metricsData ??= await this.DBClient?.metricsData.findMany();
    let data = this.metricsData?.find((m) => m.path == path);
    if (!data) {
      await this.DBClient?.metricsData.create({ data: { path: path } });
    }
    if (override) {
      await this.DBClient?.metricsData.update({
        data: {
          daily: count,
          weekly: count,
          monthly: count,
          yearly: count,
          total: count,
        },
        where: { path: path },
      });
    } else {
      await this.DBClient?.metricsData.update({
        data: {
          daily: { increment: count },
          weekly: { increment: count },
          monthly: { increment: count },
          yearly: { increment: count },
          total: { increment: count },
        },
        where: { path: path },
      });
    }
  }

  async get_metrics_data() {
    this.metricsData ??= await this.DBClient?.metricsData.findMany();
    return this.metricsData.reduce(
      (
        result: [
          Record<string, number>,
          Record<string, number>,
          Record<string, number>,
          Record<string, number>,
          Record<string, number>
        ],
        item: MetricsData
      ) => {
        result[0][item.path] = item.daily;
        result[1][item.path] = item.weekly;
        result[2][item.path] = item.monthly;
        result[3][item.path] = item.yearly;
        result[4][item.path] = item.total;
        return result;
      },
      [{}, {}, {}, {}, {}]
    );
  }

  async get_metric_data_index(){
    this.metricsData ??= await this.DBClient?.metricsData.findMany();
    let indexMetricData=this.metricsData.find((m) => m.path == "/")
    if(!indexMetricData){
      return [0,0,0,0,0]
    }
    return [indexMetricData.daily,indexMetricData.weekly,indexMetricData.monthly,indexMetricData.yearly,indexMetricData.total]
  }

  /**
   * 检查并重置过期的 metrics 计数
   * @param timezone 时区，例如 'Asia/Shanghai'
   */
  async checkAndResetMetrics(timezone: string = 'Asia/Shanghai') {
    // 检查是否需要进行重置检查（避免频繁查询数据库）
    const now = Date.now();
    if (now - this.lastMetricsCheck < this.METRICS_CHECK_INTERVAL) {
      return;
    }
    this.lastMetricsCheck = now;

    // 获取当前时间（按指定时区）
    const currentTime = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));

    // 获取当前的日期标识
    const currentDay = currentTime.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentWeek = this.getWeekIdentifier(currentTime); // YYYY-WW
    const currentMonth = `${currentTime.getFullYear()}-${(currentTime.getMonth() + 1).toString().padStart(2, '0')}`; // YYYY-MM
    const currentYear = currentTime.getFullYear().toString(); // YYYY

    // 获取存储的最后重置时间
    this.metricsMetaData = await this.DBClient?.metricsMetaData.findFirst();
    if (!this.metricsMetaData) {
      // 如果没有元数据，创建并设置当前时间
      await this.DBClient?.metricsMetaData.create({
        data: {
          id: 0,
          today: currentDay,
          week: currentWeek,
          month: currentMonth,
          year: currentYear
        }
      });
      return;
    }

    const updates: any = {};
    const resetFields: string[] = [];

    // 检查是否需要重置年度计数
    if (this.metricsMetaData.year !== currentYear) {
      resetFields.push('yearly');
      updates.year = currentYear;
    }

    // 检查是否需要重置月度计数
    if (this.metricsMetaData.month !== currentMonth) {
      resetFields.push('monthly');
      updates.month = currentMonth;
    }

    // 检查是否需要重置周计数
    if (this.metricsMetaData.week !== currentWeek) {
      resetFields.push('weekly');
      updates.week = currentWeek;
    }

    // 检查是否需要重置日计数
    if (this.metricsMetaData.today !== currentDay) {
      resetFields.push('daily');
      updates.today = currentDay;
    }

    // 如果有需要重置的字段，执行重置操作
    if (resetFields.length > 0) {
      console.log(`[Metrics] Resetting metrics: ${resetFields.join(', ')}`);

      // 重置相应的计数器
      const resetData: any = {};
      resetFields.forEach(field => {
        resetData[field] = 0;
      });

      await this.DBClient?.metricsData.updateMany({
        data: resetData
      });

      // 更新元数据
      await this.DBClient?.metricsMetaData.update({
        where: { id: 0 },
        data: updates
      });

      // 清除缓存以便重新加载
      this.metricsData = null;
      this.metricsMetaData = null;
    }
  }

  /**
   * 获取周标识符 (ISO周)
   * @param date 日期对象
   * @returns 格式为 YYYY-WW 的字符串
   */
  getWeekIdentifier(date: Date): string {
    const year = date.getFullYear();
    const start = new Date(year, 0, 1);
    const days = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + start.getDay() + 1) / 7);
    return `${year}-${weekNumber.toString().padStart(2, '0')}`;
  }

  async init_db() {
    this.mainData = await this.DBClient?.mainData.findFirst();
    if (!this.mainData) {
      await this.DBClient?.mainData.create({
        data: {
          id: 0,
          status: 0,
          privateMode: false,
          lastUpdated: new Date(),
        },
      });
    }
    this.metricsMetaData = await this.DBClient?.metricsMetaData.findFirst();
    if (!this.metricsMetaData) {
      await this.DBClient?.metricsMetaData.create({
        data: {
          id: 0,
          today: '0',
          week: '0',
          month: '0',
          year: '0'
        },
      });
    }
    return true;
  }

  // ========== 插件数据管理 ==========

  /**
   * 获取启用的插件列表
   */
  async getEnabledPlugins(): Promise<string[]> {
    try {
      this.pluginData ??= await this.DBClient?.pluginData.findMany();

      const enabledPlugins = this.pluginData
        .filter(p => {
          try {
            const data = typeof p.data === 'string' ? JSON.parse(p.data) : p.data;
            return data?.enabled === true;
          } catch (error) {
            console.warn(`[Data] Failed to parse plugin data for ${p.id}:`, error);
            return false;
          }
        })
        .map(p => p.id);

      console.log('[Data] getEnabledPlugins:', enabledPlugins);
      return enabledPlugins;
    } catch (error) {
      console.error('[Data] Error getting enabled plugins:', error);
      return [];
    }
  }

  /**
   * 检查插件是否启用
   */
  async isPluginEnabled(pluginName: string): Promise<boolean> {
    try {
      this.pluginData ??= await this.DBClient?.pluginData.findMany();
      const plugin = this.pluginData.find(p => p.id === pluginName);

      if (!plugin) {
        return false;
      }

      try {
        const data = typeof plugin.data === 'string' ? JSON.parse(plugin.data) : plugin.data;
        return data?.enabled === true;
      } catch (error) {
        console.warn(`[Data] Failed to parse plugin data for ${pluginName}:`, error);
        return false;
      }
    } catch (error) {
      console.error(`[Data] Error checking plugin ${pluginName}:`, error);
      return false;
    }
  }

  /**
   * 启用插件（在数据库中创建插件数据记录）
   */
  async enablePlugin(pluginName: string, initialData: Record<string, any> = {}): Promise<boolean> {
    try {
      const dataJson = JSON.stringify({ enabled: true, ...initialData });

      await this.DBClient?.pluginData.upsert({
        where: { id: pluginName },
        update: { data: dataJson as InputJsonValue },
        create: {
          id: pluginName,
          data: dataJson as InputJsonValue
        }
      });

      this.pluginData = null; // 清除缓存
      console.log(`[Data] Plugin ${pluginName} enabled`);
      return true;
    } catch (error) {
      console.error(`[Data] Error enabling plugin ${pluginName}:`, error);
      return false;
    }
  }

  /**
   * 禁用插件（从数据库中删除插件数据记录）
   */
  async disablePlugin(pluginName: string): Promise<boolean> {
    try {
      await this.DBClient?.pluginData.deleteMany({
        where: { id: pluginName }
      });

      this.pluginData = null; // 清除缓存
      console.log(`[Data] Plugin ${pluginName} disabled`);
      return true;
    } catch (error) {
      console.error(`[Data] Error disabling plugin ${pluginName}:`, error);
      return false;
    }
  }

  /**
   * 获取插件数据
   */
  async getPluginData(pluginName: string): Promise<Record<string, any>> {
    this.pluginData ??= await this.DBClient?.pluginData.findMany();
    const pluginEntry = this.pluginData.find((p) => p.id === pluginName);

    if (!pluginEntry || !pluginEntry.data) {
      return {};
    }

    try {
      return JSON.parse(pluginEntry.data as string) || {};
    } catch (error) {
      console.error(`[Data] Error parsing plugin data for ${pluginName}:`, error);
      return {};
    }
  }

  /**
   * 设置插件数据
   */
  async setPluginData(pluginName: string, data: Record<string, any>): Promise<boolean> {
    try {
      const dataJson = JSON.stringify(data);

      // 使用 upsert 来更新或创建记录
      await this.DBClient?.pluginData.upsert({
        where: { id: pluginName },
        update: { data: dataJson as InputJsonValue },
        create: {
          id: pluginName,
          data: dataJson as InputJsonValue
        }
      });

      // 更新缓存
      this.pluginData = null; // 清除缓存，下次获取时重新加载

      return true;
    } catch (error) {
      console.error(`[Data] Error setting plugin data for ${pluginName}:`, error);
      return false;
    }
  }

  /**
   * 删除插件数据
   */
  async deletePluginData(pluginName: string): Promise<boolean> {
    try {
      await this.DBClient?.pluginData.deleteMany({
        where: { id: pluginName }
      });

      // 更新缓存
      this.pluginData = null;

      return true;
    } catch (error) {
      console.error(`[Data] Error deleting plugin data for ${pluginName}:`, error);
      return false;
    }
  }

  /**
   * 获取所有插件数据概览
   */
  async getAllPluginData(): Promise<Record<string, Record<string, any>>> {
    this.pluginData ??= await this.DBClient?.pluginData.findMany();

    const result: Record<string, Record<string, any>> = {};

    for (const pluginEntry of this.pluginData) {
      try {
        result[pluginEntry.id] = JSON.parse(pluginEntry.data as string) || {};
      } catch (error) {
        console.error(`[Data] Error parsing plugin data for ${pluginEntry.id}:`, error);
        result[pluginEntry.id] = {};
      }
    }

    return result;
  }
}
