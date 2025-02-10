import { DeviceManager } from './device';
import { statusManager } from './status';

/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.json`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
export default {
	async fetch(request, env, ctx): Promise<Response> {
		let responseNotFound = new Response(
			JSON.stringify({
				success: false,
				code: 'not found',
				message: 'Invalid API path',
			}),
			{
				headers: {
					'content-type': 'application/json',
				},
			}
		);
		let responseNotAuthorized = new Response(
			JSON.stringify({
				success: false,
				code: 'not authorized',
				message: 'Invalid secret',
			}),
			{
				headers: {
					'content-type': 'application/json',
				},
			}
		);
		let responseMissingParameter = new Response(
			JSON.stringify({
				success: false,
				code: 'bad request',
				message: 'Missing required parameter',
			}),
			{
				headers: {
					'content-type': 'application/json',
				},
			}
		);

		if ((await env.SLEEPY.get('inited')) != 'true') {
			await env.SLEEPY.put(
				'status_list',
				'\
	[    {        "id": 0, \
			"name": "活着", \
			"desc": "目前在线，可以通过任何可用的联系方式联系本人。",\
			"color": "awake" \
		}, \
		{  "id": 1, \
			"name": "似了", \
			"desc": "睡似了或其他原因不在线，紧急情况请使用电话联系。", \
			"color": "sleeping"\
		}]'
			);
			await env.SLEEPY.put('inited', 'true');
		}

		const url = new URL(request.url);

		if (url.pathname == '/set') {
			let secret = url.searchParams.get('secret');
			if (secret != env.SECRET) {
				return responseNotAuthorized;
			}
			let status = url.searchParams.get('status');
			if (status == null) {
				return responseMissingParameter;
			}
			await env.SLEEPY.put('status', status);
			await env.SLEEPY.put('last_updated', new Date(Date.now()).toLocaleString('zh-CN'));
			return new Response(
				JSON.stringify({
					success: true,
					code: 'ok',
					set_to: status,
				}),
				{
					headers: {
						'content-type': 'application/json',
					},
				}
			);
		} else if (url.pathname.startsWith('/device')) {
			let devicesJSON = await env.SLEEPY.get('devices');
			let devices: DeviceManager = new DeviceManager(devicesJSON == null ? {} : JSON.parse(devicesJSON));
			if (url.pathname == '/device/set') {
				if (request.method != 'POST') {
					let secret = url.searchParams.get('secret');
					if (secret != env.SECRET) {
						return responseNotAuthorized;
					}
					let id = url.searchParams.get('id');
					let showName = url.searchParams.get('show_name');
					let using = url.searchParams.get('using');
					let appName = url.searchParams.get('app_name');
					if (id == null || showName == null || using == null || appName == null) {
						return responseMissingParameter;
					}
					devices.updateDevice(id, showName, using == 'true', appName);
					await env.SLEEPY.put('devices', JSON.stringify(devices));
					console.log(JSON.stringify(devices));
					await env.SLEEPY.put('last_updated', new Date(Date.now()).toLocaleString('zh-CN'));
					return new Response(
						JSON.stringify({
							success: true,
							code: 'ok',
						}),
						{
							headers: {
								'content-type': 'application/json',
							},
						}
					);
				} else {
					let data = await request.json();
					if (
						typeof data === 'object' &&
						data !== null &&
						'id' in data &&
						'show_name' in data &&
						'using' in data &&
						'app_name' in data &&
						'secret' in data
					) {
						if (data.secret != env.SECRET) {
							return responseNotAuthorized;
						}
						devices.updateDevice(data.id as string, data.show_name as string, data.using as boolean, data.app_name as string);
					} else {
						return responseMissingParameter;
					}
					await env.SLEEPY.put('devices', JSON.stringify(devices));
					await env.SLEEPY.put('last_updated', new Date(Date.now()).toLocaleString('zh-CN'));
					return new Response(
						JSON.stringify({
							success: true,
							code: 'ok',
						}),
						{
							headers: {
								'content-type': 'application/json',
							},
						}
					);
				}
			} else if (url.pathname == '/device/remove') {
				let secret = url.searchParams.get('secret');
				if (secret != env.SECRET) {
					return responseNotAuthorized;
				}
				let id = url.searchParams.get('id');
				if (id == null) {
					return responseMissingParameter;
				}
				if (!devices.isDeviceExist(id)) {
					return new Response(
						JSON.stringify({
							success: false,
							code: 'not found',
							message: 'Device not found',
						}),
						{
							headers: {
								'content-type': 'application/json',
							},
						}
					);
				}
				devices.removeDevice(id);
				await env.SLEEPY.put('devices', JSON.stringify(devices));
				await env.SLEEPY.put('last_updated', new Date(Date.now()).toLocaleString('zh-CN'));
				return new Response(
					JSON.stringify({
						success: true,
						code: 'ok',
					}),
					{
						headers: {
							'content-type': 'application/json',
						},
					}
				);
			} else if (url.pathname == '/device/clear') {
				let secret = url.searchParams.get('secret');
				if (secret != env.SECRET) {
					return responseNotAuthorized;
				}
				devices.clearDevices();
				await env.SLEEPY.put('devices', JSON.stringify(devices));
				await env.SLEEPY.put('last_updated', new Date(Date.now()).toLocaleString('zh-CN'));
				return new Response(
					JSON.stringify({
						success: true,
						code: 'ok',
					}),
					{
						headers: {
							'content-type': 'application/json',
						},
					}
				);
			} else if (url.pathname == '/device/private_mode') {
				let secret = url.searchParams.get('secret');
				if (secret != env.SECRET) {
					return responseNotAuthorized;
				}
				let private_mode = url.searchParams.get('private');
				if (private_mode == null) {
					return responseMissingParameter;
				}
				await env.SLEEPY.put('private_mode', private_mode);
				await env.SLEEPY.put('last_updated', new Date(Date.now()).toLocaleString('zh-CN'));
				return new Response(
					JSON.stringify({
						success: true,
						code: 'ok',
					}),
					{
						headers: {
							'content-type': 'application/json',
						},
					}
				);
			}
		} else if (url.pathname == '/query') {
			let time = new Date(Date.now()).toLocaleString('zh-CN');

			let statusListJSON = await env.SLEEPY.get('status_list');
			let statusList: statusManager = new statusManager(statusListJSON == null ? {} : JSON.parse(statusListJSON));

			let status = await env.SLEEPY.get('status');
			if (status == null) {
				status = '2';
			}

			let info = statusList.getStatusById(parseInt(status));
			if (info == undefined) {
				info = {
					id: 2,
					name: '未知',
					desc: '未知的标识符，可能是配置问题。',
					color: 'error',
				};
			}

			let private_mode = await env.SLEEPY.get('private_mode');
			let devicesJSON = await env.SLEEPY.get('devices');
			let devices: DeviceManager = new DeviceManager(devicesJSON == null || private_mode == 'true' ? {} : JSON.parse(devicesJSON));

			let last_updated = await env.SLEEPY.get('last_updated');

			return new Response(
				JSON.stringify({
					time: time,
					success: true,
					status: status,
					info: info,
					device: devices.toJSON().devices,
					last_updated: last_updated,
					refresh: 5000,
					device_status_slice: 30,
				}),
				{
					headers: {
						'content-type': 'application/json',
					},
				}
			);
		} else if (url.pathname == '/status_list') {
			let statusList = await env.SLEEPY.get('status_list');
			return new Response(JSON.stringify(statusList), {
				headers: {
					'content-type': 'application/json',
				},
			});
		} else if (url.pathname == '/status_list/init') {
			return new Response(
				JSON.stringify({
					success: true,
					code: 'ok',
				}),
				{
					headers: {
						'content-type': 'application/json',
					},
				}
			);
		}
		if (url.pathname == '/') {
			url.pathname = '/index1.html';
			var assets = await env.ASSETS.fetch(url);
		} else if (url.pathname == '/style.css') {
			url.pathname = '/style.css1';
			var assets = await env.ASSETS.fetch(url);

			var assetsText = await assets.text();
			assetsText = assetsText.replace(/\{\{ bg \}\}/gi, env.BG);
			var response = new Response(assetsText, assets);
			response.headers.set('content-type', 'text/css');
			return response;
		} else {
			var assets = await env.ASSETS.fetch(request);
		}
		var assetsText = await assets.text();

		assetsText = assetsText.replace(/\{\{ user \}\}/gi, env.USER);
		assetsText = assetsText.replace(/\{\{ learn_more \| safe \}\}/gi, env.LEARNMORE);
		assetsText = assetsText.replace(/\{\{ repo \}\}/gi, env.REPO);

		var statusListJSON = await env.SLEEPY.get('status_list');
		var statusList: statusManager = new statusManager(statusListJSON == null ? {} : JSON.parse(statusListJSON));
		var statusID = await env.SLEEPY.get('status');

		try {
			if (statusID == null) {
				throw new Error('Status Not Found');
			}
			var status = statusList.getStatusById(parseInt(statusID));
			if (status == undefined) {
				throw new Error('Status Not Found');
			}
			assetsText = assetsText.replace(/\{\{ status_name \}\}/gi, status.name);
			assetsText = assetsText.replace(/\{\{ status_desc \| safe \}\}/gi, status.desc);
			assetsText = assetsText.replace(/\{\{ status_color \}\}/gi, status.color);
		} catch (error) {
			assetsText = assetsText.replace(/\{\{ status_name \}\}/gi, '未知');
			assetsText = assetsText.replace(/\{\{ status_desc \| safe \}\}/gi, '未知的标识符，可能是配置问题。');
			assetsText = assetsText.replace(/\{\{ status_color \}\}/gi, 'error');
		}

		assetsText = assetsText.replace(/\{\{ more_text \| safe \}\}/gi, env.MORETEXT);

		var last_updated = await env.SLEEPY.get('last_updated');
		if (last_updated == null) {
			last_updated = '未知';
		}
		assetsText = assetsText.replace(/\{\{ last_updated \}\}/gi, last_updated);
		assetsText = assetsText.replace(/\{\{ hitokoto \}\}/gi, '一言获取中~');

		assetsText = assetsText.replace(/\{\{ url_for\('static', filename='favicon\.ico'\) \}\}/gi, 'favicon.ico');

		assetsText = assetsText.replace(/\{\{ url_for\('static', filename='get\.js'\) \}\}/gi, 'get.js');
		return new Response(assetsText, assets);
	},
} satisfies ExportedHandler<Env>;
