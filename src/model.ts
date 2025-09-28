export class StatusItemModel {
  id: number;
  name: string;
  desc: string;
  color: string;

  constructor(
    id: number = -1,
    name: string = "Unknown",
    desc: string = "未知的标识符，可能是配置问题。",
    color: string = "error"
  ){
    this.id = id;
    this.name = name;
    this.desc = desc;
    this.color = color;
  }
}

class MainConfigModel {
  database: string = "";
  debug: boolean = false;
  timezone: string = "Asia/Shanghai";
  checkdata_interval: number = 120;
  secret: string = "";
  cache_age: number = 1200;
  cors_origins: string[] | string = "*";
}

class PageConfigModel {
  name: string = "Dale";
  title: string = `${this.name} Alive?`;
  desc: string = `${this.name} \'s Online Status Page`;
  favicon: string = "/favicon.ico";
  background: string = "https://imgapi.siiway.top/image";
  learn_more_text: string = "GitHub Repo";
  learn_more_link: string = "https://github.com/sleepy-project/sleepy";
  more_text: string = "";
  theme: string = "default";
}

class StatusConfigModel {
  device_slice: number = 50;
  refresh_interval: number = 5000;
  not_using: string | undefined ;
  sorted: boolean = false;
  using_first: boolean = false;
  status_list: StatusItemModel[] = [
    { id: 0, name: "Awake", desc: "目前在线，可以通过任何可用的联系方式联系本人。", color: "awake" },
    { id: 1, name: "Asleep", desc: "睡似了或其他原因不在线，紧急情况请使用电话联系。", color: "sleeping" },
  ];
}

class MetricsConfigModel {
  enabled: boolean = true;
  allowList: string[] = [
    "/",
    "/api/status/query",
    "/api/status/list",
    "/api/status/set",
    "/api/device/set",
    "/api/device/remove",
    "/api/device/clear",
    "/api/device/private",
    "/api/status/events",
    "/api/metrics",
    "/api/meta",
    "/robots.txt",
    "/favicon.ico",
    "[static]",
  ];
}

export class ConfigModel {
  main: MainConfigModel = new MainConfigModel();
  page: PageConfigModel = new PageConfigModel();
  status: StatusConfigModel = new StatusConfigModel();
  metrics: MetricsConfigModel = new MetricsConfigModel();

  plugins_enabled: string[] = ["v4_compatible"];

  plugin: Record<string, Record<string, any>> = {};
}
