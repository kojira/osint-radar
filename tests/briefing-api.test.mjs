import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { evaluateBrief, isPriority } from "../lib/briefing-evaluation.ts";

function setup() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("CREATE TABLE signal_observations(item_id TEXT,data TEXT,last_seen TEXT); CREATE TABLE signal_brief_items(item_id TEXT PRIMARY KEY,data TEXT,batch_id TEXT,generated_at TEXT); CREATE TABLE signal_brief_batches(id TEXT PRIMARY KEY,data TEXT,created_at TEXT); CREATE TABLE signal_topic_adjustments(id TEXT PRIMARY KEY,data TEXT,created_at TEXT);");
  const wrap = (query, values = []) => ({
    bind: (...args) => wrap(query, args),
    first: async () => sql.prepare(query).get(...values) ?? null,
    all: async () => ({results: sql.prepare(query).all(...values)}),
    run: async () => ({meta: {changes: Number(sql.prepare(query).run(...values).changes)}}),
  });
  const database = {prepare: wrap, batch: async statements => {
    sql.exec("BEGIN");
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec("COMMIT"); return results; }
    catch (error) { sql.exec("ROLLBACK"); throw error; }
  }};
  // Exercise the actual route handlers with only the Cloudflare D1 binding replaced.
  const source = readFileSync(new URL("../app/api/briefing/route.ts", import.meta.url), "utf8").replace(/^import .*;\n/gm, "");
  const context = {exports: {}, db: () => database, evaluateBrief, isPriority, Request, Response, URL};
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, context);
  return {sql, api: context.exports};
}

function item(id, priority, noveltyScore) {
  return {itemId: id, priority, titleJa: "テスト資料", summaryJa: "単体テスト用", relevanceJa: "関連性の判断", evidenceNote: "テスト資料のみ", recommendedAction: "テスト", evidenceUrls: ["https://example.com/source"], evidenceLevel: "metadata_only", relevanceScore: 5, practicalityScore: 4, noveltyScore, noveltyConfidence: noveltyScore === null ? "unknown" : "limited", noveltyReason: "比較範囲を限定", comparisonUrls: []};
}
const request = (method, body) => new Request("https://example.com/api/briefing", {method, headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});

test("POST retains explicit high/medium/low importance independently of novelty", async () => {
  const {sql, api} = setup();
  const items = [item("high", "high", null), item("medium", "medium", null), item("low", "low", null), {...item("scored", "medium", 4), relevanceScore: 4, practicalityScore: 3}];
  for (const i of items) sql.prepare("INSERT INTO signal_observations VALUES(?,?,?)").run(i.itemId, JSON.stringify({title: i.itemId, url: "https://example.com/source", provider: "github", date: null}), "2026-01-01");
  const body = {batchId: "test-batch", summaryJa: "概要", focusJa: "関心", items};
  for (const invalid of ["urgent", undefined]) {
    const bad = {...body, items: [{...items[0], priority: invalid}]};
    assert.equal((await api.POST(request("POST", bad))).status, 400);
  }
  assert.equal((await api.POST(request("POST", body))).status, 200);
  const saved = await (await api.GET()).json();
  for (const i of items) {
    const value = saved.items.find(x => x.itemId === i.itemId);
    assert.equal(value.priority, i.priority);
    assert.equal(value.score, i.noveltyScore === null ? null : 76);
  }
  assert.equal(saved.items[0].itemId, "high");
  assert.equal(saved.items.at(-1).itemId, "low");
  sql.close();
});

test("PATCH preserves content and dates, rejects stale guards, and is idempotent", async () => {
  const {sql, api} = setup();
  const original = {...item("repair", "low", null), score: null, url: "https://example.com/source"};
  sql.prepare("INSERT INTO signal_brief_items VALUES(?,?,?,?)").run("repair", JSON.stringify(original), "old-batch", "2026-01-01T00:00:00Z");
  const correction = {itemId: "repair", expectedBatchId: "old-batch", expectedGeneratedAt: "2026-01-01T00:00:00Z", expectedPriority: "low", priority: "high", priorityReason: "元の判断を復元"};
  for (const bad of [{expectedBatchId: "new-batch"}, {expectedGeneratedAt: "stale"}, {expectedPriority: "medium"}]) assert.equal((await api.PATCH(request("PATCH", {...correction, ...bad}))).status, 409);
  assert.equal((await api.PATCH(request("PATCH", correction))).status, 200);
  const repeated = await (await api.PATCH(request("PATCH", correction))).json();
  assert.equal(repeated.alreadyApplied, true);
  const row = sql.prepare("SELECT * FROM signal_brief_items WHERE item_id='repair'").get();
  const corrected = JSON.parse(row.data);
  assert.equal(row.generated_at, correction.expectedGeneratedAt);
  assert.equal(row.batch_id, correction.expectedBatchId);
  for (const [key, value] of Object.entries(original)) if (key !== "priority") assert.deepEqual(corrected[key], value);
  assert.equal(corrected.priority, "high");
  assert.equal(corrected.priorityCorrection.from, "low");
  sql.close();
});

function seedPages(sql, count=137) {
  for(let i=0;i<count;i++) {
    const id=`page-${String(i).padStart(4,"0")}`;
    const priority=i<50?"high":i<100?"medium":"low";
    const data={...item(id,priority,i%3===0?null:0),score:i%3===0?null:i%2===0?0:76,recommendedAction:`Complete action ${i} `+"x".repeat(950),evidenceUrls:[`https://example.com/full/${i}`]};
    sql.prepare("INSERT INTO signal_brief_items VALUES(?,?,?,?)").run(id,JSON.stringify(data),i%2?"batch-a":"batch-b",`2026-01-${String(1+i%4).padStart(2,"0")}T00:00:00Z`);
  }
}
const getRequest = params => new Request(`https://example.com/api/briefing?${new URLSearchParams(params)}`);

test("GET keeps default100 and traverses every priority/null-score tie without gaps", async()=>{
 const {sql,api}=setup();seedPages(sql);
 const first=await (await api.GET()).json();assert.equal(first.items.length,100);assert.equal(first.totalCount,137);assert.equal(first.hasMore,true);assert.ok(first.nextCursor);
 for(const limit of [1,30,100]) {
  let cursor=null,ids=[];
  do {
   const params={limit:String(limit)};if(cursor)params.cursor=cursor;
   const result=await api.GET(getRequest(params));assert.equal(result.status,200);
   const body=await result.json();assert.equal(body.totalCount,137);assert.ok(body.items.length<=limit);
   ids.push(...body.items.map(i=>i.itemId));cursor=body.nextCursor;assert.equal(body.hasMore,cursor!==null);
  } while(cursor);
  assert.equal(ids.length,137);assert.equal(new Set(ids).size,137);
  assert.equal(ids.filter(id=>Number(id.slice(5))>=100).length,37);
 }
 sql.close();
});

test("GET direct lookup beyond100 returns complete fields and filters are server-side",async()=>{
 const {sql,api}=setup();seedPages(sql);
 const direct=await (await api.GET(getRequest({itemId:"page-0136"}))).json();
 assert.equal(direct.totalCount,1);assert.equal(direct.items.length,1);assert.equal(direct.items[0].recommendedAction,`Complete action 136 `+"x".repeat(950));assert.deepEqual(direct.items[0].evidenceUrls,["https://example.com/full/136"]);assert.equal(direct.nextCursor,null);
 const low=await (await api.GET(getRequest({priority:"low"}))).json();assert.equal(low.totalCount,37);assert.equal(low.items.length,37);assert.ok(low.items.every(i=>i.priority==="low"));
 const unknown=await (await api.GET(getRequest({novelty:"unknown",batchId:"batch-b"}))).json();assert.equal(unknown.totalCount,23);assert.ok(unknown.items.every(i=>i.noveltyScore===null&&i.batchId==="batch-b"));
 const absent=await (await api.GET(getRequest({itemId:"missing"}))).json();assert.equal(absent.items.length,0);assert.equal(absent.totalCount,0);
 const mismatch=await (await api.GET(getRequest({itemId:"page-0136",batchId:"batch-a"}))).json();assert.equal(mismatch.items.length,0);
 sql.close();
});

test("GET rejects malformed pagination, changed cursor scope, and invalid parameters",async()=>{
 const {sql,api}=setup();seedPages(sql);
 const first=await (await api.GET(getRequest({limit:"1",priority:"low"}))).json();
 for(const params of [{cursor:"nonsense"},{cursor:"%oops"},{limit:"0"},{limit:"101"},{limit:"1.5"},{limit:""},{priority:"urgent"},{novelty:"yes"},{itemId:""},{batchId:"x".repeat(151)},{cursor:first.nextCursor,priority:"high"}]) assert.equal((await api.GET(getRequest(params))).status,400,JSON.stringify(params));
 assert.equal((await api.GET(new Request("https://example.com/api/briefing?limit=1&limit=2"))).status,400);
 const decoded=JSON.parse(decodeURIComponent(first.nextCursor));decoded.rank=3;
 assert.equal((await api.GET(getRequest({priority:"low",cursor:encodeURIComponent(JSON.stringify(decoded))}))).status,400);
 sql.close();
});

test("GET searches all four stored fields literally, trims q, and validates search/sort", async()=>{
 const {sql,api}=setup();
 const fields=["titleJa","summaryJa","relevanceJa","originalTitle"];
 for(const [index,field] of fields.entries()){
  const data={...item("literal-"+index,"high",null),[field]:"Literal 50%_O'Reilly 日本語"};
  sql.prepare("INSERT INTO signal_brief_items VALUES(?,?,?,?)").run(data.itemId,JSON.stringify(data),"search","2026-01-01T00:00:00Z");
 }
 sql.prepare("INSERT INTO signal_brief_items VALUES(?,?,?,?)").run("control",JSON.stringify(item("control","low",0)),"search","2026-01-01T00:00:00Z");
 for(const q of ["%", "_", "O'Reilly", "  literal  ", "日本語"]){
  const response=await api.GET(getRequest({q}));assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.totalCount,4,q);assert.equal(body.items.length,4);
 }
 assert.equal((await (await api.GET(getRequest({q:"%",priority:"low"}))).json()).totalCount,0);
 assert.equal((await (await api.GET(getRequest({q:"%_",batchId:"search",novelty:"unknown"}))).json()).totalCount,4);
 for(const q of ["x".repeat(200),"  "+"x".repeat(200)+"  ","  "])assert.equal((await api.GET(getRequest({q}))).status,200);
 for(const params of [{q:"x".repeat(201)},{sort:""},{sort:"urgent"},{sort:"NEWEST"}])assert.equal((await api.GET(getRequest(params))).status,400);
 for(const suffix of ["q=a&q=b","sort=priority&sort=newest"])assert.equal((await api.GET(new Request("https://example.com/api/briefing?"+suffix))).status,400);
 sql.close();
});

test("GET paginates every sort with nulls and date/id ties in the expected order",async()=>{
 const {sql,api}=setup();seedPages(sql);
 // Add varying novelty scores so its ordering differs from the overall score.
 for(const row of sql.prepare("SELECT item_id,data FROM signal_brief_items").all()){
  const data=JSON.parse(row.data);
  if(data.noveltyScore!==null)data.noveltyScore=Number(row.item_id.slice(5))%6;
  sql.prepare("UPDATE signal_brief_items SET data=? WHERE item_id=?").run(JSON.stringify(data),row.item_id);
 }
 const records=sql.prepare("SELECT * FROM signal_brief_items").all().map(r=>({...JSON.parse(r.data),generatedAt:r.generated_at}));
 for(const sort of ["priority","newest","novelty","score"]){
  const rank=i=>sort==="priority"?({high:0,medium:1,low:2}[i.priority]):0;
  const numeric=i=>sort==="newest"?0:sort==="novelty"?(i.noveltyScore??-1):(i.score??-1);
  const expected=[...records].sort((a,b)=>rank(a)-rank(b)||numeric(b)-numeric(a)||(a.generatedAt>b.generatedAt?-1:a.generatedAt<b.generatedAt?1:0)||(a.itemId<b.itemId?-1:a.itemId>b.itemId?1:0)).map(i=>i.itemId);
  for(const limit of [1,17,100]){
   let cursor=null,ids=[];
   do{
    const params={sort,limit:String(limit),q:"テスト"};if(cursor)params.cursor=cursor;
    const response=await api.GET(getRequest(params));assert.equal(response.status,200,sort);
    const page=await response.json();assert.equal(page.totalCount,137);
    ids.push(...page.items.map(i=>i.itemId));cursor=page.nextCursor;
    assert.ok(ids.length<=137);
   }while(cursor);
   assert.deepEqual(ids,expected,sort+" page size "+limit);
  }
 }
 sql.close();
});

test("GET preserves v1 default cursors and binds nondefault cursors to q and sort",async()=>{
 const {sql,api}=setup();seedPages(sql);
 const first=await (await api.GET(getRequest({limit:"1"}))).json();
 const legacy=JSON.parse(decodeURIComponent(first.nextCursor));
 assert.equal(legacy.scope,JSON.stringify({itemId:null,batchId:null,priority:null,novelty:null}));
 assert.equal((await api.GET(getRequest({cursor:first.nextCursor,q:"  ",sort:"priority"}))).status,200);
 for(const params of [{sort:"newest"},{q:"テスト"}])assert.equal((await api.GET(getRequest({...params,cursor:first.nextCursor}))).status,400);
 const filtered=await (await api.GET(getRequest({limit:"1",q:"テスト",sort:"novelty"}))).json();
 assert.equal((await api.GET(getRequest({cursor:filtered.nextCursor,q:" テスト ",sort:"novelty",limit:"20"}))).status,200);
 for(const params of [{q:"別",sort:"novelty"},{q:"テスト",sort:"score"},{q:"テスト"}])assert.equal((await api.GET(getRequest({...params,cursor:filtered.nextCursor}))).status,400);
 sql.close();
});
