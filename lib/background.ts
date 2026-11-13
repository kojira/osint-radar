import { env } from "cloudflare:workers";
import { searchResponse } from "./public-search";
export type WatchTopic={id:string;name:string;query:string;enabled:boolean};
export type WatchConfig={enabled:boolean;topics:WatchTopic[];providers:("hn"|"github")[];days:number};
export const DEFAULT_WATCH:WatchConfig={enabled:true,days:30,providers:["hn","github"],topics:[{id:"ai",name:"AIエージェント",query:"AI agents",enabled:true},{id:"web",name:"Web・ブラウザ",query:"browser automation",enabled:true},{id:"voice",name:"音声AI",query:"voice AI",enabled:true},{id:"security",name:"セキュリティ",query:"security",enabled:true},{id:"games",name:"ゲーム開発",query:"game engine",enabled:true}]};
export function db(){if(!env.DB)throw new Error("永続ストレージが接続されていません");return env.DB}
export async function readSetting<T>(id:string,fallback:T):Promise<T>{const r=await db().prepare("SELECT value FROM signal_background_config WHERE id = ?").bind(id).first<{value:string}>();return r?JSON.parse(r.value):fallback}
export async function writeSetting(id:string,value:unknown){await db().prepare("INSERT INTO signal_background_config (id,value,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(id,JSON.stringify(value),new Date().toISOString()).run()}
export function validConfig(value:unknown):value is WatchConfig{if(!value||typeof value!=="object")return false;const v=value as WatchConfig;return typeof v.enabled==="boolean"&&[0,7,30,90,365].includes(v.days)&&Array.isArray(v.providers)&&v.providers.length<=2&&new Set(v.providers).size===v.providers.length&&v.providers.every(p=>p==="hn"||p==="github")&&Array.isArray(v.topics)&&v.topics.length<=8&&new Set(v.topics.map(t=>t.id)).size===v.topics.length&&v.topics.every(t=>typeof t.id==="string"&&/^[a-zA-Z0-9_-]{1,80}$/.test(t.id)&&typeof t.name==="string"&&t.name.trim().length>0&&t.name.length<=80&&typeof t.query==="string"&&t.query.trim().length>0&&t.query.length<=200&&typeof t.enabled==="boolean")&&(!v.enabled||(v.providers.length>0&&v.topics.some(t=>t.enabled)))}
export async function collect(trigger="manual",automationId:string|null=null){
 const database=db(),config=await readSetting("watch",DEFAULT_WATCH);
 if(!config.enabled)return {status:"paused",message:"収集は設定画面で停止されています。外部APIへ送信しませんでした。"};
 const now=Date.now(),locked=await database.prepare("INSERT INTO signal_collection_locks (id,expires_at) VALUES ('collect',?) ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at WHERE signal_collection_locks.expires_at < ? RETURNING id").bind(now+10*60*1000,now).first();
 if(!locked)return {status:"busy",message:"別の収集が実行中のため重複実行を省略しました。"};
 const runId=crypto.randomUUID(),startedAt=new Date().toISOString();let total=0,added=0;const details:{topic:string;provider:string;ok:boolean;count:number;added:number;error?:string}[]=[];
 try{
  await database.prepare("INSERT INTO signal_collection_runs (id,started_at,status,total,added,details,trigger,automation_id) VALUES (?,?,'running',0,0,'[]',?,?)").bind(runId,startedAt,trigger,automationId).run();
  // The persisted switch is checked again before each topic so a pause stops subsequent requests.
  for(const topic of config.topics.filter(t=>t.enabled)){
   if(!(await readSetting("watch",DEFAULT_WATCH)).enabled)break;
   for(const provider of config.providers){
    try{
     const response=await searchResponse(provider,topic.query,config.days),body=await response.json() as {items?:Record<string,unknown>[];error?:string};
     if(!response.ok||!Array.isArray(body.items))throw new Error(body.error||"取得できませんでした");
     const records=body.items.filter(i=>typeof i.id==="string"&&typeof i.url==="string");
     const ids=records.map(i=>`${topic.id}::${i.id}`);const existing=ids.length?await database.prepare(`SELECT id FROM signal_observations WHERE id IN (${ids.map(()=>"?").join(",")})`).bind(...ids).all<{id:string}>():{results:[]};const seen=new Set(existing.results.map(r=>r.id));let newCount=0;
     const stamp=new Date().toISOString();const batch=records.map(item=>{const id=`${topic.id}::${item.id}`;if(!seen.has(id))newCount++;return database.prepare("INSERT INTO signal_observations (id,item_id,topic_id,data,first_seen,last_seen) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,last_seen=excluded.last_seen").bind(id,item.id,topic.id,JSON.stringify({...item,watchTopicName:topic.name}),stamp,stamp)});
     if(batch.length)await database.batch(batch);total+=records.length;added+=newCount;details.push({topic:topic.name,provider,ok:true,count:records.length,added:newCount});
    }catch(e){details.push({topic:topic.name,provider,ok:false,count:0,added:0,error:e instanceof Error?e.message:"取得エラー"})}
   }
  }
  const ok=details.filter(d=>d.ok).length,status=ok===details.length&&ok>0?"completed":ok>0?"partial":details.length?"failed":"paused";const finishedAt=new Date().toISOString();
  await database.prepare("UPDATE signal_collection_runs SET finished_at=?,status=?,total=?,added=?,details=? WHERE id=?").bind(finishedAt,status,total,added,JSON.stringify(details),runId).run();
  return {runId,status,startedAt,finishedAt,total,added,details};
 }catch(e){const error=e instanceof Error?e.message:"永続化に失敗しました";await database.prepare("UPDATE signal_collection_runs SET finished_at=?,status='failed',details=? WHERE id=?").bind(new Date().toISOString(),JSON.stringify([{ok:false,error}]),runId).run();throw new Error(error)}finally{await database.prepare("UPDATE signal_collection_locks SET expires_at=0 WHERE id='collect'").run()}
}
