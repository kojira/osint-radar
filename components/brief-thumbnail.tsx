"use client";
import { useState } from "react";
import { FileText, GitBranch, Newspaper } from "lucide-react";

/** Only same-origin images. Source fetches and URL checks live on the server. */
export default function BriefThumbnail({itemId,provider,title,url}:{itemId:string;provider:string;title:string;url:string}) {
 const [state,setState]=useState<"pending"|"loaded"|"failed">("pending");
 let supported=false;
 try {const source=new URL(url);supported=source.protocol==="https:"&&source.hostname==="github.com"&&!source.username&&!source.password&&!source.port&&!source.search&&!source.hash&&/^\/[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+\/?$/.test(source.pathname)}catch{}
 const Icon=provider==="github"?GitBranch:provider==="hn"?Newspaper:FileText;
 return <span className={`signal-thumbnail ${state==="loaded"?"is-loaded":""}`}>
  <span className={`signal-thumbnail-fallback source-${provider==="github"?"github":provider==="hn"?"hn":"link"}`} role="img" aria-label={supported?(state==="failed"?"公開元の画像を取得できませんでした":"公開元のプレビューを読み込み中"):`${provider==="hn"?"Hacker News":"公開リンク"}の資料。画像には未対応`}>
   <Icon size={24}/><span>{supported?(state==="failed"?"画像未取得":"プレビュー"):"リンク資料"}</span>
  </span>
  {supported&&state!=="failed"&&<img src={`/api/briefing/thumbnail?itemId=${encodeURIComponent(itemId)}`} alt={`${title}の公開元プレビュー`} width={160} height={84} loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={()=>setState("loaded")} onError={()=>setState("failed")}/>}
 </span>
}
