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
    return this.mainData?.lastUpdated;
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
          if (a.showName < b.showName) {
            return -1;
          }
          if (a.showName > b.showName) {
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
          d.showName = not_using;
        }
      });
    }
    return device_list;
  }

  async get_device(id: string) {
    return await this.DBClient?.deviceStatusData.findUnique({
      where: { id: id },
    });
  }

  async set_device(
    id: string,
    showName: string | undefined = undefined,
    using: boolean | undefined = undefined,
    status: string | undefined = undefined,
    fields: InputJsonValue | undefined = undefined
  ) {
    this.deviceStatusData ??= await this.DBClient?.deviceStatusData.findMany();
    if (!this.deviceStatusData.find((d) => d.id == id)) {
      if (showName === undefined) {
        return false;
      }
      await this.DBClient?.deviceStatusData.create({
        data: {
          id: id,
          showName: showName,
          using: using,
          status: status,
          fields: fields ?? {},
        },
      });
      return true;
    }
    await this.DBClient?.deviceStatusData.update({
      data: {
        showName: showName,
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
}
