class status{
    id:number;
    name:string;
    desc:string;
    color:string;

    constructor(json:any){
        this.id=json.id;
        this.name=json.name;
        this.desc=json.desc;
        this.color=json.color;
    }
}

export class statusManager{
    status:Array<status>;

    constructor(json:any){
        this.status=new Array();
        for(let i=0;i<json.length;i++){
            this.status.push(new status(json[i]));
        }
    }

    getStatus():Array<status>{
        return this.status;
    }

    getStatusById(id:number):status|undefined{
        return this.status[id];
    }
}
