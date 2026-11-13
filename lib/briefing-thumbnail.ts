/** Public-source preview retrieval. No user headers or arbitrary URL proxying. */
export const HTML_LIMIT = 2 * 1024 * 1024;
export const IMAGE_LIMIT = 2 * 1024 * 1024;
export const HTML_TIMEOUT_MS = 12000;
export const IMAGE_TIMEOUT_MS = 15000;
export type ThumbnailCache = {match(request:Request):Promise<Response|undefined>;put(request:Request,response:Response):Promise<void>};
type Fetcher = (input:string, init:RequestInit)=>Promise<Response>;
export function publicRepositoryUrl(value:unknown):string|null {
 if(typeof value!=="string")return null;
 const match=/^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})\/?$/.exec(value);
 if(!match||[".",".."].includes(match[2]))return null;
 return `https://github.com/${match[1]}/${match[2]}`;
}
export function publicImageUrl(value:string):string|null {
 if(!/^https:\/\/(opengraph\.githubassets\.com|repository-images\.githubusercontent\.com)\/[A-Za-z0-9_./-]{1,1500}$/.test(value))return null;
 const url=new URL(value);
 if(url.pathname.split("/").some(p=>p==="."||p===".."))return null;
 // Reject dot segments in the raw input before URL normalization as well.
 if(/\/(?:\.|\.\.)(?:\/|$)/.test(value))return null;
 return value;
}
function decode(value:string){return value.replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));}
export function openGraphImage(html:string):string|null {
 for(const tag of html.match(/<meta\b[^>]{0,4096}>/gi)??[]){
  const attributes:Record<string,string>={};
  for(const a of tag.matchAll(/\b([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attributes[a[1].toLowerCase()]=decode(a[2]??a[3]??a[4]);
  if((attributes.property??attributes.name)?.toLowerCase()==="og:image")return publicImageUrl(attributes.content??"");
 }
 return null;
}
async function boundedBody(response:Response,max:number):Promise<Uint8Array> {
 const length=response.headers.get("Content-Length");
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>max)){await response.body?.cancel();throw Error("body-too-large");}
 if(!response.body)throw Error("empty-body");
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw Error("body-too-large");chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
function imageType(bytes:Uint8Array,type:string):string|null {
 const mime=type.split(";")[0].trim().toLowerCase();
 const matches=(values:number[],offset=0)=>values.every((v,i)=>bytes[offset+i]===v);
 if(mime==="image/png"&&matches([137,80,78,71,13,10,26,10]))return mime;
 if(mime==="image/jpeg"&&matches([255,216,255]))return mime;
 if(mime==="image/webp"&&matches([82,73,70,70])&&matches([87,69,66,80],8))return mime;
 if(mime==="image/gif"&&(matches([71,73,70,56,55,97])||matches([71,73,70,56,57,97])))return mime;
 return null;
}
const clientHeaders={"Cache-Control":"private, max-age=3600","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Cross-Origin-Resource-Policy":"same-origin"};
export function unavailable(status=404){return new Response(null,{status,headers:{...clientHeaders,"Cache-Control":"private, max-age=120"}});}
export async function repositoryThumbnail(value:unknown,options:{fetcher?:Fetcher;cache?:ThumbnailCache}={}):Promise<Response>{
 const repository=publicRepositoryUrl(value);if(!repository)return unavailable();
 const key=new Request(`https://signal-thumbnail-cache.invalid/v1${new URL(repository).pathname}`);
 const cache=options.cache;
 if(cache){try{const hit=await cache.match(key);if(hit){const headers=new Headers(hit.headers);headers.set("Cache-Control",hit.ok?clientHeaders["Cache-Control"]:"private, max-age=120");return new Response(hit.body,{status:hit.status,headers});}}catch{/* Cache failure must not break previews. */}}
 const fetcher=options.fetcher??fetch;
 const request=async(url:string,accept:string,timeout:number)=>fetcher(url,{method:"GET",headers:{Accept:accept,"User-Agent":"Signal-OSINT-Thumbnail/1.0"},redirect:"manual",credentials:"omit",referrerPolicy:"no-referrer",signal:AbortSignal.timeout(timeout)});
 let result:Response;
 try{
  const page=await request(repository,"text/html",HTML_TIMEOUT_MS);
  if(page.status!==200||!/^text\/html(?:;|$)/i.test(page.headers.get("Content-Type")??"")){await page.body?.cancel();result=unavailable(page.status===404?404:502);}
  else{
   const url=openGraphImage(new TextDecoder().decode(await boundedBody(page,HTML_LIMIT)));
   if(!url)result=unavailable();
   else{
    const response=await request(url,"image/png,image/jpeg,image/webp,image/gif",IMAGE_TIMEOUT_MS);
    if(response.status!==200){await response.body?.cancel();result=unavailable(502);}
    else{const bytes=await boundedBody(response,IMAGE_LIMIT),type=imageType(bytes,response.headers.get("Content-Type")??"");result=type?new Response(bytes as BodyInit,{headers:{...clientHeaders,"Content-Type":type}}):unavailable(502);}
   }
  }
 }catch{result=unavailable(502);}
 if(cache){try{const cached=result.clone();const headers=new Headers(cached.headers);headers.set("Cache-Control",result.ok?"public, max-age=3600":"public, max-age=120");await cache.put(key,new Response(cached.body,{status:result.ok?200:404,headers}));}catch{/* Best-effort public-byte cache only. */}}
 return result;
}
