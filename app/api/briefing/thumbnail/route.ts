import { db } from "../../../../lib/background";
import { repositoryThumbnail, unavailable, type ThumbnailCache } from "../../../../lib/briefing-thumbnail";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const params=new URL(request.url).searchParams,itemId=params.get("itemId");
 if(params.getAll("itemId").length!==1||!itemId||!/^[A-Za-z0-9_-]{1,150}$/.test(itemId)||[...params.keys()].some(k=>k!=="itemId"))return unavailable(400);
 try{
  // Dispatch's owner-private access boundary is preserved. Never accept a URL from the caller.
  const row=await db().prepare("SELECT data FROM signal_brief_items WHERE item_id = ?").bind(itemId).first<{data:string}>();
  if(!row)return unavailable();
  const item=JSON.parse(row.data) as {url?:unknown};
  const cache=(globalThis.caches as unknown as {default?:ThumbnailCache}|undefined)?.default;
  return repositoryThumbnail(item.url,{cache});
 }catch{return unavailable(502);}
}
