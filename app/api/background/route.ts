import { db, DEFAULT_WATCH, readSetting, validConfig, writeSetting } from "../../../lib/background";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{
 const u=new URL(request.url),before=u.searchParams.get("before"),beforeId=u.searchParams.get("beforeId");
 if((before||beforeId)&&(!before||Number.isNaN(Date.parse(before))||!beforeId||beforeId.length>300))return Response.json({error:"ページ指定が正しくありません"},{status:400});
 const database=db(),config=await readSetting("watch",DEFAULT_WATCH),schedule=await readSetting("schedule",null);const revision=await database.prepare("SELECT updated_at FROM signal_background_config WHERE id='watch'").first<{updated_at:string}>();const configRevision=revision?.updated_at||"default";
 const sql="SELECT id,item_id,topic_id,data,first_seen,last_seen FROM signal_observations"+(before?" WHERE (first_seen < ? OR (first_seen = ? AND id < ?))":"")+" ORDER BY first_seen DESC,id DESC LIMIT 300";
 const stmt=database.prepare(sql);const rows=await(before?stmt.bind(before,before,beforeId):stmt).all<{id:string;item_id:string;topic_id:string;data:string;first_seen:string;last_seen:string}>();
 const runs=await database.prepare("SELECT * FROM signal_collection_runs ORDER BY started_at DESC LIMIT 12").all(),count=await database.prepare("SELECT COUNT(DISTINCT item_id) AS count FROM signal_observations").first<{count:number}>();
 const unique=new Map<string,Record<string,unknown>>();
 for(const row of rows.results){const item=JSON.parse(row.data),old=unique.get(row.item_id);if(old){(old.watchTopics as string[]).push(item.watchTopicName||row.topic_id);(old.watchTopicIds as string[]).push(row.topic_id);if(row.first_seen<String(old.firstSeen))old.firstSeen=row.first_seen;if(row.last_seen>String(old.lastSeen))old.lastSeen=row.last_seen}else unique.set(row.item_id,{...item,watchTopics:[item.watchTopicName||row.topic_id],watchTopicIds:[row.topic_id],firstSeen:row.first_seen,lastSeen:row.last_seen})}
 const last=rows.results.at(-1),nextCursor=rows.results.length===300&&last?{date:last.first_seen,id:last.id}:null;
 return Response.json({config,configRevision,schedule,items:[...unique.values()],runs:runs.results.map(r=>({...r,details:JSON.parse(String(r.details))})),storedCount:count?.count||0,nextCursor},{headers:{"Cache-Control":"no-store"}})
 }catch{return Response.json({error:"永続ストレージを読み込めませんでした。時間を置いて再読み込みしてください。"},{status:503})}}
export async function POST(request:Request){try{const value=await request.json();if(!validConfig(value))return Response.json({error:"設定を確認してください。最大8テーマ、検索語は1〜200文字です。有効にするにはテーマと情報源が必要です。"},{status:400});const config={enabled:value.enabled,providers:value.providers,days:value.days,topics:value.topics.map(t=>({...t,name:t.name.trim(),query:t.query.trim()}))};await writeSetting("watch",config);return Response.json({ok:true,config})}catch{return Response.json({error:"設定を保存できませんでした。"},{status:500})}}
