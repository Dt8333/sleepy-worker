class Device {
    // A simple class to store device information

    show_name: string;
    using:boolean;
    app_name: string;
    update_time: string;

    constructor(json: any) {
        this.show_name = json.show_name;
        this.using = json.using;
        this.app_name = json.app_name;
        this.update_time = json.update_time;
    }

    toJSON(): any {
        return {
            show_name: this.show_name,
            using: this.using,
            app_name: this.app_name,
            update_time: this.update_time
        };
    }
}

export class DeviceManager {
    // A simple class to manage devices

    devices: Map<string, Device>;

    constructor(json: any) {
        this.devices = new Map();
        if(json.devices == null){
            return;
        }
        for (let [key, value] of Object.entries(json.devices)) {
            this.devices.set(key, new Device(value));
        }
    }

    toJSON(): any {
        let devices: any = {};
        for (let [key, value] of this.devices.entries()) {
            devices[key] = value.toJSON();
        }
        return {
            devices: devices
        };
    }

    updateDevice(id:string, show_name: string, using: boolean, app_name: string):void {
        this.devices.set(id,new Device({show_name:show_name,using:using,app_name:app_name,update_time:new Date(Date.now()).toLocaleString('zh-CN')}));
    }

    getDevices(): Map<string, Device> {
        return this.devices;
    }

    removeDevice(id:string):void {
        this.devices.delete(id);
    }

    clearDevices():void {
        this.devices.clear();
    }

    //if a device is existing
    isDeviceExist(id:string): boolean {
        return this.devices.has(id);
    }
}
