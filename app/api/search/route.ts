import { NextRequest } from "next/server";
import { searchResponse } from "../../../lib/public-search";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
 const provider=request.nextUrl.searchParams.get("provider"),q=(request.nextUrl.searchParams.get("q")||"").trim(),days=Number(request.nextUrl.searchParams.get("days")||"30");
 if(!q||q.length>200||![0,7,30,90,365].includes(days)||!["hn","github"].includes(provider||""))return Response.json({error:"検索条件が正しくありません。"},{status:400});
 return searchResponse(provider!,q,days);
}
