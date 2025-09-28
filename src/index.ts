import { Context, Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { ConfigModel, StatusItemModel } from "./model";

import { version } from "../package.json";
import { Data } from "./data";
import { streamSSE } from "hono/streaming";
import { html } from "hono/html";

export type Bindings = {
  DB: D1Database;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  SECRET: string;
  DATABASE: string;
};

export class Utils {
  static getTheme(c: Context): string {
    let theme = getCookie(c, "theme");
    if (theme == undefined) {
      theme = "default";
      setCookie(c, "theme", theme);
    }
    return theme;
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
    let url = new URL(path, "http://localhost");
    let req = new Request(url);
    let res = await env.ASSETS.fetch(req);
    if (res.status == 200) {
      return res.text();
    }
    return null;
  }
  static async render_template(
    c: Context,
    filename: string,
    dirname: string,
    theme: string,
    Data: Record<string, any>
  ): Promise<string | null> {
    let path = `${theme}/${dirname}/${filename}`;
    let template = await Utils.getFileText(c.env, path);
    if (!template) {
      path = `default/${dirname}/${filename}`;
      template = await Utils.getFileText(c.env, path);
      if (!template) {
        return null;
      }
    }
    return html`raw`;
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
}

const app = new Hono<{ Bindings: Bindings }>();
/*
app.get('static/:path', (c) => {
  let theme=Utils.getTheme(c)
  return c.redirect(`/static-themed/${theme}/${c.req.param('path')}`)
})

app.get('static-themed/:theme/:path', async (c) => {
  let url = new URL(c.req.url)
  url.pathname = url.pathname.replace(/static-themed\/([^/]+)\//, '$1/static/')
  let assets=await c.env.ASSETS.fetch(new Request(url))
  if(assets.status==200){
    return assets
  }
  url.pathname = url.pathname.replace(c.req.param('theme'), 'default')
  assets=await c.env.ASSETS.fetch(new Request(url))
  if(assets.status==200){
    return assets
  }
  return c.notFound()
})

app.get('/default/:path', async (c) => {
  let path=c.req.param('path')
  if(!path.endsWith('.js')){
    path+='.js'
  }
  let url = new URL(c.req.url)
  url.pathname = `default/${path}`
  return await c.env.ASSETS.fetch(new Request(url))
})

app.get('/', async (c) => {
  let config=Utils.getConfig(c.env)
  let more_text=config.page.more_text
  if(config.metrics.enabled) {
    //todo
  }
  let main_card=await Utils.render_template(c.env, 'main.index.html', 'cards', Utils.getTheme(c), {
    username: config.page.name,
    status:more_text==""?config.page.learn_more_text:more_text,
    last_updated:Date.now()
  })
  let more_info_card=await Utils.render_template(c.env, 'more_info.index.html', 'cards', Utils.getTheme(c), {
    more_text:more_text,
    username: config.page.name,
    learn_more_text:config.page.learn_more_text,
    learn_more_link:config.page.learn_more_link
  })
  let cards={
    'main':main_card,
    'more_info':more_info_card
  }

  let rendered_page=await Utils.render_template(c.env, 'index.html', 'pages', Utils.getTheme(c), {
    page_title: config.page.title,
    page_desc: config.page.desc,
    page_favicon: config.page.favicon,
    page_background: config.page.background,
    cards:cards,
    inject:''
  })
  if(rendered_page){
    return c.html(rendered_page)
  }
  return c.text('Hello Hono!')
})
*/

app.get("/meta", (c) => {
  let config = Utils.getConfig(c.env);
  return c.json({
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
  });
});

app.get("/metrics", (c) => {
  //TODO
  return c.text("# no metrics");
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
  return {
    success: true,
    time: Date.now(),
    status: stinfo,
    device_list: await data.device_list(),
    last_updated: await data.get_last_updated(),
  };
}

app.get("/status/query", async (c) => {
  return c.json(await query(c));
});

app.get("/status/events", (c) => {
  let last_event_id = Number(c.req.header("Last-Event-ID") ?? "0");
  if (isNaN(last_event_id)) {
    return c.text("invalid Last-Event-ID", 400);
  }
  return streamSSE(c, async (stream) => {
    let last_updated;
    let last_heartbeat = Date.now();

    while (true) {
      let current_time = Date.now();
      let current_updated = await new Data(c.env).get_last_updated();
      if (last_updated != current_updated) {
        last_updated = current_updated;
        last_heartbeat = current_time;

        let update_data = JSON.stringify(query(c));
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
  });
});

app.get("/status/set", async (c) => {
  if (!(await Utils.auth_check(c))) {
    return c.text("unauthorized", 401);
  }
  let status = Number(await c.req.query("status"));
  if (isNaN(status)) {
    return c.text("invalid status", 400);
  }
  let data = new Data(c.env);
  if ((await data.get_status_id()) !== status) {
    let old_status = await data.status();
    let new_status = data.get_status(status);
    //TODO plugin

    data.set_status_id(status);
  }
  return c.json({
    success: true,
    set_to: status,
  });
});

app.get("/status/list", (c) => {
  //TODO plugin
  return c.json({
    success: true,
    status_list: Utils.getConfig(c.env).status.status_list,
  });
});

app.get("/device/set", async (c) => {
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
  return c.json({
    success: await data.set_device(
      device_id,
      device_show_name,
      device_using,
      device_status
    ),
  });
});

app.post("/device/set", async (c) => {
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
  let data = new Data(c.env);
  return c.json({
    success: await data.set_device(
      device_id,
      device_show_name,
      device_using,
      device_status
    ),
  });
});

app.get("/device/remove", async (c) => {
  if (!(await Utils.auth_check(c))) {
    return c.text("unauthorized", 401);
  }
  let device_id = c.req.query("id");
  if (!device_id) {
    return c.text("invalid device id", 400);
  }
  let data = new Data(c.env);
  return c.json({
    success: await data.remove_device(device_id),
  });
});

app.get("/device/clear", async (c) => {
  if (!(await Utils.auth_check(c))) {
    return c.text("unauthorized", 401);
  }
  let data = new Data(c.env);
  return c.json({
    success: await data.clear_device(),
  });
});

app.get("/device/private", async (c) => {
  if (!(await Utils.auth_check(c))) {
    return c.text("unauthorized", 401);
  }
  let privateMode = Boolean(c.req.query("private"));
  if (privateMode === undefined) {
    return c.text("invalid private", 400);
  }
  let data = new Data(c.env);
  return c.json({
    success: await data.set_private_mode(privateMode),
  });
});

app.get("/init", async (c) => {
  if (!(await Utils.auth_check(c))) {
    return c.text("unauthorized", 401);
  }
  let data = new Data(c.env);
  return c.json({
    success: await data.init_db(),
  });
});

export default app;
