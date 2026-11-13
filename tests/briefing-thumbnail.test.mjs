import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {publicRepositoryUrl,publicImageUrl,openGraphImage,repositoryThumbnail,IMAGE_LIMIT,HTML_LIMIT,HTML_TIMEOUT_MS,IMAGE_TIMEOUT_MS,unavailable} from '../lib/briefing-thumbnail.ts';
const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
const page=()=>new Response('<html><meta property="og:image" content="https://opengraph.githubassets.com/hash/owner/repo"></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
const image=()=>new Response(png,{headers:{'Content-Type':'image/png'}});
test('thumbnail permits only exact HTTPS GitHub repository roots and allowlisted raster origins',()=>{
 assert.equal(publicRepositoryUrl('https://github.com/owner/repo/'),'https://github.com/owner/repo');
 for(const bad of ['http://github.com/o/r','https://github.com:443/o/r','https://github.com/o/r?q=secret','https://github.com/o/r#secret','https://u:p@github.com/o/r','https://github.com.evil.test/o/r','https://127.0.0.1/o/r','https://github.com/o/..','https://github.com/o/r/tree/main','https://github.com/o/%2e%2e',null])assert.equal(publicRepositoryUrl(bad),null,String(bad));
 for(const bad of ['https://example.com/image.png','http://opengraph.githubassets.com/a','https://opengraph.githubassets.com:443/a','https://opengraph.githubassets.com/a?token=x','https://opengraph.githubassets.com/a/../b','https://opengraph.githubassets.com/%2e','data:image/png,x','https://u:p@repository-images.githubusercontent.com/a'])assert.equal(publicImageUrl(bad),null,bad);
 assert.equal(openGraphImage("<meta content='https://repository-images.githubusercontent.com/123/hash' property='og:image'>"),'https://repository-images.githubusercontent.com/123/hash');
 assert.equal(openGraphImage('<meta property="og:image" content="https://evil.test/a">'),null);
});
test('thumbnail makes two bounded credential-free requests and serves raster bytes privately',async()=>{
 assert.equal(HTML_TIMEOUT_MS,12000);assert.equal(IMAGE_TIMEOUT_MS,15000);
 const calls=[];const response=await repositoryThumbnail('https://github.com/owner/repo',{fetcher:async(url,init)=>{calls.push({url,init});return calls.length===1?page():image();}});
 assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');assert.match(response.headers.get('Cache-Control'),/^private/);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),png);
 assert.equal(calls.length,2);for(const {init} of calls){assert.equal(init.redirect,'manual');assert.equal(init.credentials,'omit');assert.equal(init.referrerPolicy,'no-referrer');assert.ok(init.signal);assert.deepEqual(Object.keys(init.headers).sort(),['Accept','User-Agent']);}
});
test('unsupported URLs, redirects, missing metadata and non-HTML do not reach arbitrary images',async()=>{
 let calls=0;const unsupported=await repositoryThumbnail('https://example.com/private',{fetcher:async()=>{calls++;return page();}});assert.equal(unsupported.status,404);assert.equal(calls,0);
 for(const first of [new Response('',{status:302,headers:{Location:'http://127.0.0.1/'}}),new Response('',{status:404}),new Response('<meta property="og:image" content="http://localhost/">',{headers:{'Content-Type':'text/html'}}),new Response('{}',{headers:{'Content-Type':'application/json'}})]){
  calls=0;const r=await repositoryThumbnail('https://github.com/o/r',{fetcher:async()=>{calls++;return first;}});assert.ok([404,502].includes(r.status));assert.equal(calls,1);
 }
});
test('image redirects, spoofed raster, SVG and oversized bodies fail closed',async()=>{
 const cases=[()=>new Response('',{status:302,headers:{Location:'https://evil.test/a'}}),()=>new Response('<svg/>',{headers:{'Content-Type':'image/svg+xml'}}),()=>new Response('<script>x</script>',{headers:{'Content-Type':'image/png'}}),()=>new Response(png,{headers:{'Content-Type':'image/png','Content-Length':String(IMAGE_LIMIT+1)}}),()=>new Response(new Uint8Array(IMAGE_LIMIT+1),{headers:{'Content-Type':'image/png'}})];
 for(const last of cases){let calls=0;const r=await repositoryThumbnail('https://github.com/o/r',{fetcher:async()=>++calls===1?page():last()});assert.equal(r.status,502);assert.equal(calls,2);}
 let calls=0;const r=await repositoryThumbnail('https://github.com/o/r',{fetcher:async()=>{calls++;return new Response('x'.repeat(HTML_LIMIT+1),{headers:{'Content-Type':'text/html'}})}});assert.equal(r.status,502);assert.equal(calls,1);
 assert.equal((await repositoryThumbnail('https://github.com/o/r',{fetcher:async()=>{throw new DOMException('Timeout','TimeoutError')}})).status,502);
});
test('public byte cache avoids repeat upstream fetch but returns private client caching',async()=>{
 const values=new Map();const cache={match:async req=>values.get(req.url)?.clone(),put:async(req,res)=>{values.set(req.url,res)}};let calls=0;
 const fetcher=async()=>++calls===1?page():image();
 assert.equal((await repositoryThumbnail('https://github.com/o/r',{cache,fetcher})).status,200);
 const repeat=await repositoryThumbnail('https://github.com/o/r',{cache,fetcher});assert.equal(repeat.status,200);assert.equal(calls,2);assert.match(repeat.headers.get('Cache-Control'),/^private/);
 assert.ok([...values.keys()].every(k=>k==='https://signal-thumbnail-cache.invalid/v1/o/r'));
 const failing={match:async()=>undefined,put:async()=>{throw Error('cache unavailable')}};assert.equal((await repositoryThumbnail('https://github.com/o/r',{cache:failing,fetcher:async()=>{throw Error('network')}})).status,502);
});
test('route looks up stored ID before fetching, rejects URL parameters, and never writes data',async()=>{
 let lookup=0,fetches=0;const context={exports:{},Request,Response,URL,unavailable,repositoryThumbnail:async url=>{fetches++;assert.equal(url,'https://github.com/o/r');return image()},db:()=>({prepare:sql=>{assert.match(sql,/^SELECT data FROM signal_brief_items WHERE item_id = \?$/);return {bind:id=>({first:async()=>{lookup++;return id==='exists'?{data:JSON.stringify({url:'https://github.com/o/r',summaryJa:'private text not sent'})}:null}})}}})};
 const source=readFileSync(new URL('../app/api/briefing/thumbnail/route.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 for(const query of ['', '?itemId=a&itemId=b','?itemId=exists&url=https://evil.test','?itemId='+ 'x'.repeat(151),'?itemId=a%2Fb'])assert.equal((await context.exports.GET(new Request('https://site.invalid/api/briefing/thumbnail'+query))).status,400);
 assert.equal(lookup,0);assert.equal((await context.exports.GET(new Request('https://site.invalid/api/briefing/thumbnail?itemId=missing'))).status,404);assert.equal(fetches,0);
 assert.equal((await context.exports.GET(new Request('https://site.invalid/api/briefing/thumbnail?itemId=exists'))).status,200);assert.equal(fetches,1);
});
