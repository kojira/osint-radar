import { db } from "../../../lib/background";
import { evaluateBrief, isPriority, type Priority } from "../../../lib/briefing-evaluation";
export const dynamic="force-dynamic";
function text(v:unknown,max:number){return typeof v==="string"&&v.trim().length>0&&v.length<=max}
function score(v:unknown){return typeof v==="number"&&Number.isInteger(v)&&v>=0&&v<=5}
function url(v:unknown){if(typeof v!=="string")return false;try{const u=new URL(v);return ["https:","http:"].includes(u.protocol)&&!u.username&&!u.password}catch{return false}}
const defaultPriorityRank = "CASE json_extract(data,'$.priority') WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END";
const defaultScoreRank = "COALESCE(json_extract(data,'$.score'),-1)";
type BriefRow = {item_id:string;data:string;generated_at:string;batch_id:string};
type BriefCursor = {v:1;scope:string;rank:number;score:number;date:string;id:string};

export async function GET(request?:Request) {
 try {
  const params = new URL(request?.url || "https://site.invalid/api/briefing").searchParams;
  const keys = ["itemId","batchId","priority","novelty","limit","cursor","q","sort"];
  if (keys.some(key => params.getAll(key).length > 1)) return Response.json({error:"同じ検索条件は一度だけ指定してください"},{status:400});
  const itemId=params.get("itemId"), batchId=params.get("batchId"), priority=params.get("priority"), novelty=params.get("novelty");
  const q=(params.get("q")??"").trim(), sort=params.get("sort")??"priority";
  if(q.length>200 || !["priority","newest","novelty","score"].includes(sort)) return Response.json({error:"qは前後の空白を除いて200文字以内、sortはpriority/newest/novelty/scoreで指定してください"},{status:400});
  const priorityRank=sort==="priority"?defaultPriorityRank:"CAST(0 AS INTEGER)";
  const scoreRank=sort==="newest"?"CAST(0 AS INTEGER)":sort==="novelty"?"COALESCE(json_extract(data,'$.noveltyScore'),-1)":defaultScoreRank;
  const limitText=params.get("limit"), limit=limitText===null?100:Number(limitText);
  if ((itemId!==null&&!text(itemId,150)) || (batchId!==null&&!text(batchId,150)) || (priority!==null&&!isPriority(priority)) || (novelty!==null&&novelty!=="unknown") || (limitText!==null&&!/^[0-9]+$/.test(limitText)) || !Number.isInteger(limit) || limit<1 || limit>100) {
   return Response.json({error:"itemId・batchIdは150文字以内、limitは1〜100、priorityはhigh/medium/low、noveltyはunknownで指定してください"},{status:400});
  }
  const scope=JSON.stringify(q===""&&sort==="priority"?{itemId,batchId,priority,novelty}:{itemId,batchId,priority,novelty,q,sort});
  const clauses:string[]=[], values:(string|number)[]=[];
  if(itemId!==null){clauses.push("item_id=?");values.push(itemId)}
  if(batchId!==null){clauses.push("batch_id=?");values.push(batchId)}
  if(priority!==null){clauses.push("json_extract(data,'$.priority')=?");values.push(priority)}
  if(novelty!==null)clauses.push("json_extract(data,'$.noveltyScore') IS NULL");
  if(q){
   // instr is literal: percent, underscore and apostrophes are not wildcard syntax.
   clauses.push("("+["titleJa","summaryJa","relevanceJa","originalTitle"].map(field=>`instr(lower(COALESCE(json_extract(data,'$.${field}'),'')),lower(?))>0`).join(" OR ")+")");
   values.push(q,q,q,q);
  }
  const baseWhere=clauses.length?` WHERE ${clauses.join(" AND ")}`:"";
  const pageClauses=[...clauses], pageValues=[...values];
  const token=params.get("cursor");
  if(token!==null){
   if(token.length>10000)return Response.json({error:"ページ位置が長すぎます"},{status:400});
   let c:BriefCursor;
   try { c=JSON.parse(decodeURIComponent(token)); } catch { return Response.json({error:"ページ位置が不正です。最初から読み直してください"},{status:400}); }
   if(!c||c.v!==1||c.scope!==scope||!Number.isInteger(c.rank)||c.rank<0||c.rank>2||!Number.isInteger(c.score)||c.score< -1||c.score>100||!text(c.date,80)||!Number.isFinite(Date.parse(c.date))||!text(c.id,150))return Response.json({error:"ページ位置と検索条件が一致しません。最初から読み直してください"},{status:400});
   pageClauses.push(`(${priorityRank}>? OR (${priorityRank}=? AND ${scoreRank}<?) OR (${priorityRank}=? AND ${scoreRank}=? AND generated_at<?) OR (${priorityRank}=? AND ${scoreRank}=? AND generated_at=? AND item_id>?))`);
   pageValues.push(c.rank,c.rank,c.score,c.rank,c.score,c.date,c.rank,c.score,c.date,c.id);
  }
  const d=db(), pageWhere=pageClauses.length?` WHERE ${pageClauses.join(" AND ")}`:"";
  const rows=await d.prepare(`SELECT item_id,data,generated_at,batch_id FROM signal_brief_items${pageWhere} ORDER BY ${priorityRank},${scoreRank} DESC,generated_at DESC,item_id ASC LIMIT ?`).bind(...pageValues,limit+1).all<BriefRow>();
  const total=await d.prepare(`SELECT COUNT(*) AS total FROM signal_brief_items${baseWhere}`).bind(...values).first<{total:number}>();
  const hasMore=rows.results.length>limit, page=rows.results.slice(0,limit), last=page[page.length-1];
  let nextCursor:string|null=null;
  if(hasMore&&last){const item=JSON.parse(last.data);nextCursor=encodeURIComponent(JSON.stringify({v:1,scope,rank:sort==="priority"?(item.priority==="high"?0:item.priority==="medium"?1:2):0,score:sort==="newest"?0:sort==="novelty"?(item.noveltyScore??-1):(item.score??-1),date:last.generated_at,id:last.item_id} satisfies BriefCursor))}
  const batches=await (batchId===null?d.prepare("SELECT data,created_at FROM signal_brief_batches ORDER BY created_at DESC LIMIT 8"):d.prepare("SELECT data,created_at FROM signal_brief_batches WHERE id=?").bind(batchId)).all<{data:string;created_at:string}>();
  const adjustments=await d.prepare("SELECT data,created_at FROM signal_topic_adjustments ORDER BY created_at DESC LIMIT 8").all<{data:string;created_at:string}>();
  return Response.json({items:page.map(r=>({...JSON.parse(r.data),generatedAt:r.generated_at,batchId:r.batch_id})),batches:batches.results.map(r=>({...JSON.parse(r.data),createdAt:r.created_at})),adjustments:adjustments.results.map(r=>({...JSON.parse(r.data),createdAt:r.created_at})),totalCount:total?.total??0,nextCursor,hasMore,limit},{headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({error:"ブリーフを読み込めませんでした"},{status:503})}
}
export async function POST(request:Request){try{
 const v=await request.json() as Record<string,unknown>;
 if(!text(v.batchId,150)||!text(v.summaryJa,2400)||!text(v.focusJa,700)||!Array.isArray(v.items)||!v.items.length||v.items.length>30)return Response.json({error:"batchId、summaryJa、focusJa、1〜30件のitemsが必要です"},{status:400});
 const items=v.items as Record<string,unknown>[];
 if(!items.every(i=>text(i.itemId,150)&&text(i.titleJa,240)&&text(i.summaryJa,2400)&&text(i.relevanceJa,1000)&&text(i.evidenceNote,1000)&&text(i.recommendedAction,1000)&&isPriority(i.priority)&&(i.priorityReason===undefined||text(i.priorityReason,1200))&&["primary_read","source_read","metadata_only"].includes(String(i.evidenceLevel))&&Array.isArray(i.evidenceUrls)&&i.evidenceUrls.length>0&&i.evidenceUrls.length<=6&&i.evidenceUrls.every(url)&&score(i.relevanceScore)&&score(i.practicalityScore)&&(i.noveltyScore===null||score(i.noveltyScore))&&["supported","limited","unknown"].includes(String(i.noveltyConfidence))&&(i.noveltyScore===null?i.noveltyConfidence==="unknown":i.noveltyConfidence!=="unknown")&&text(i.noveltyReason,1800)&&Array.isArray(i.comparisonUrls)&&i.comparisonUrls.length<=5&&i.comparisonUrls.every(url)))return Response.json({error:"ブリーフの形式が正しくありません。根拠・関連理由・確認範囲を記録してください"},{status:400});
 const d=db(),stamp=new Date().toISOString(),prepared=[];
 for(const i of items){const source=await d.prepare("SELECT data FROM signal_observations WHERE item_id=? ORDER BY last_seen DESC LIMIT 1").bind(i.itemId).first<{data:string}>();if(!source)return Response.json({error:`収集済み資料にないitemIdです: ${i.itemId}`},{status:400});const raw=JSON.parse(source.data);const evaluation=evaluateBrief({priority:i.priority as Priority,relevanceScore:Number(i.relevanceScore),noveltyScore:i.noveltyScore===null?null:Number(i.noveltyScore),practicalityScore:Number(i.practicalityScore)});const item={...evaluation,prioritySource:"editorial",priorityReason:typeof i.priorityReason==="string"?i.priorityReason:null,relevanceScore:i.relevanceScore,noveltyScore:i.noveltyScore,practicalityScore:i.practicalityScore,noveltyConfidence:i.noveltyConfidence,noveltyReason:i.noveltyReason,comparisonUrls:i.comparisonUrls,itemId:i.itemId,titleJa:i.titleJa,summaryJa:i.summaryJa,relevanceJa:i.relevanceJa,evidenceLevel:i.evidenceLevel,evidenceNote:i.evidenceNote,recommendedAction:i.recommendedAction,evidenceUrls:i.evidenceUrls,originalTitle:raw.title,url:raw.url,sourceUrl:raw.sourceUrl,provider:raw.provider,sourceDate:raw.date,dateLabel:raw.dateLabel,collectedAt:raw.retrievedAt};prepared.push(d.prepare("INSERT INTO signal_brief_items (item_id,data,batch_id,generated_at) VALUES (?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET data=excluded.data,batch_id=excluded.batch_id,generated_at=excluded.generated_at").bind(i.itemId,JSON.stringify(item),v.batchId,stamp))}
 const batch={id:v.batchId,summaryJa:v.summaryJa,focusJa:v.focusJa,sourceRunId:typeof v.sourceRunId==="string"?v.sourceRunId:null,itemCount:items.length};
 prepared.push(d.prepare("INSERT INTO signal_brief_batches (id,data,created_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data").bind(v.batchId,JSON.stringify(batch),stamp));await d.batch(prepared);return Response.json({ok:true,batchId:v.batchId,saved:items.length,generatedAt:stamp})
 }catch{return Response.json({error:"ブリーフを保存できませんでした"},{status:500})}}

// Narrow correction path: do not rewrite a summary, its evidence, or its original timestamp.
export async function PATCH(request: Request) {
 try {
  const v = await request.json() as Record<string, unknown>;
  if (!text(v.itemId,150) || !text(v.expectedBatchId,150) || !text(v.expectedGeneratedAt,80) || !isPriority(v.expectedPriority) || !isPriority(v.priority) || !text(v.priorityReason,1200)) {
   return Response.json({error:"資料ID、元のバッチ・作成日時・重要度、新しい重要度と判断理由が必要です"},{status:400});
  }
  const d = db();
  const row = await d.prepare("SELECT data,batch_id,generated_at FROM signal_brief_items WHERE item_id=?").bind(v.itemId).first<{data:string;batch_id:string;generated_at:string}>();
  if (!row) return Response.json({error:"資料が見つかりません"},{status:404});
  if (row.batch_id !== v.expectedBatchId || row.generated_at !== v.expectedGeneratedAt) return Response.json({error:"新しい要約があります。読み直して判断してください"},{status:409});
  const current = JSON.parse(row.data);
  if (current.priority === v.priority && current.priorityReason === v.priorityReason) return Response.json({ok:true,alreadyApplied:true,itemId:v.itemId});
  if (current.priority !== v.expectedPriority) return Response.json({error:"重要度が更新されています。読み直して判断してください"},{status:409});
  const correctedAt = new Date().toISOString();
  const corrected = {...current,priority:v.priority,priorityReason:v.priorityReason,prioritySource:"editorial",priorityCorrection:{from:current.priority,to:v.priority,reasonJa:v.priorityReason,correctedAt}};
  const result = await d.prepare("UPDATE signal_brief_items SET data=? WHERE item_id=? AND batch_id=? AND generated_at=? AND data=?").bind(JSON.stringify(corrected),v.itemId,row.batch_id,row.generated_at,row.data).run();
  if (!result.meta.changes) return Response.json({error:"資料が同時に更新されました。再読込してください"},{status:409});
  return Response.json({ok:true,itemId:v.itemId,priority:v.priority,correctedAt});
 } catch { return Response.json({error:"重要度を補正できませんでした"},{status:500}); }
}
