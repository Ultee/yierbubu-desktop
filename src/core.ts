export interface Config {
  version: 1; salaryCents: number; weekdays: number[]; start: string; end: string;
  lunch: {start: string; end: string} | null; overrides: Record<string, boolean>;
}
export type Status = 'unconfigured'|'empty'|'rest'|'before'|'working'|'lunch'|'finished';
export interface Snapshot {
  status: Status; earnedCents: number; rate: number|null; monthSeconds: number;
  elapsedSeconds: number; remainingSeconds: number; workdays: number;
}
export class ConfigError extends Error {
  field: string;
  constructor(field: string, message: string) { super(message); this.field=field; }
}
const fail = (field:string,message:string):never => {throw new ConfigError(field,message);};
const time = (v:unknown,field:string):number => {
  if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) fail(field,'请输入有效的时间');
  const [h,m]=(v as string).split(':').map(Number); return h*3600+m*60;
};
export const dateKey = (d:Date):string => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function validateConfig(input: unknown): Config {
  if(!input||typeof input!=='object') return fail('general','设置格式无效');
  const c=input as Config;
  if(c.version!==1) fail('general','不支持此设置版本');
  if(!Number.isSafeInteger(c.salaryCents)||c.salaryCents<=0||c.salaryCents>99999999999) fail('salary','请输入大于零、最多两位小数的月薪（不超过 999,999,999.99 元）');
  if(!Array.isArray(c.weekdays)||!c.weekdays.length||c.weekdays.some(n=>!Number.isInteger(n)||n<0||n>6)) fail('weekdays','请至少选择一个工作日');
  const a=time(c.start,'start'),b=time(c.end,'end');
  if(b<=a) fail('end','下班时间须晚于上班，不支持跨夜班次');
  if(c.lunch!==null){
    if(!c.lunch||typeof c.lunch!=='object') fail('lunch','请设置午休时间或关闭午休');
    const l=time(c.lunch.start,'lunch'),r=time(c.lunch.end,'lunch');
    if(l<a||r>b||r<=l||r-l>=b-a) fail('lunch','午休须位于工作时段内，并保留有效工作时间');
  }
  if(!c.overrides||typeof c.overrides!=='object'||Array.isArray(c.overrides)) fail('overrides','日期调整格式无效');
  const overrides:Record<string,boolean>={};
  for(const [k,v] of Object.entries(c.overrides)) {
    const d=new Date(`${k}T12:00:00`);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(k)||!Number.isFinite(d.getTime())||dateKey(d)!==k||typeof v!=='boolean') fail('overrides','请输入真实日期并选择工作日或休息日');
    overrides[k]=v;
  }
  return {version:1,salaryCents:c.salaryCents,weekdays:[...new Set(c.weekdays)].sort(),start:c.start,end:c.end,lunch:c.lunch?{...c.lunch}:null,overrides};
}
export function snapshot(config: Config|null, now: Date): Snapshot {
  const s:Snapshot={status:'unconfigured',earnedCents:0,rate:null,monthSeconds:0,elapsedSeconds:0,remainingSeconds:0,workdays:0};
  if(!config) return s;
  const c=config, a=time(c.start,'start'), b=time(c.end,'end');
  const lunch=c.lunch?[time(c.lunch.start,'lunch'),time(c.lunch.end,'lunch')]:null;
  const daily=b-a-(lunch?lunch[1]-lunch[0]:0);
  const working=(d:Date) => c.overrides[dateKey(d)] ?? c.weekdays.includes(d.getDay());
  const count=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  for(let day=1;day<=count;day++) if(working(new Date(now.getFullYear(),now.getMonth(),day,12))) s.workdays++;
  s.monthSeconds=s.workdays*daily;
  if(!s.monthSeconds) return {...s,status:'empty'};
  s.rate=c.salaryCents/100/s.monthSeconds;
  if(!working(now)) return {...s,status:'rest'};
  const t=now.getHours()*3600+now.getMinutes()*60+now.getSeconds();
  s.remainingSeconds=Math.max(0,b-t);
  let elapsed=Math.max(0,Math.min(t,b)-a);
  if(lunch) elapsed-=Math.max(0,Math.min(t,lunch[1])-lunch[0]);
  s.elapsedSeconds=Math.max(0,Math.min(daily,elapsed));
  const numerator=BigInt(c.salaryCents)*BigInt(s.elapsedSeconds),denominator=BigInt(s.monthSeconds);
  s.earnedCents=Number((numerator+denominator/2n)/denominator);
  s.status=t<a?'before':t>=b?'finished':lunch&&t>=lunch[0]&&t<lunch[1]?'lunch':'working';
  return s;
}
