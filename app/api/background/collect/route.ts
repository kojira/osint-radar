import { collect, readSetting } from "../../../../lib/background";
export const dynamic="force-dynamic";
export async function POST(request:Request){try{
 const raw=await request.text();let v:{trigger?:string;automationId?:string}={};try{if(raw)v=JSON.parse(raw)}catch{return Response.json({error:"JSON形式を確認してください"},{status:400})}
 const trigger=v.trigger==="scheduled"?"scheduled":"manual";let automationId:string|null=null;
 if(trigger==="scheduled"){const schedule=await readSetting<{automationId:string}|null>("schedule",null);if(!schedule||v.automationId!==schedule.automationId)return Response.json({error:"登録済み定期タスクのIDと一致しません"},{status:400});automationId=v.automationId!}
 const result=await collect(trigger,automationId);return Response.json(result,{status:result.status==="failed"?502:200,headers:{"Cache-Control":"no-store"}})
 }catch{return Response.json({error:"収集または永続化に失敗しました。実行履歴を確認してください。"},{status:500})}}
