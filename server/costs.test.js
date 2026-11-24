import test from 'node:test';
import assert from 'node:assert/strict';
import {findDefects, classifyPhotos} from './classify.js';
import {claudeCost, openaiCost, claudePrice, estimateText, CLAUDE_PRICES, SOURCES, PHOTOROOM} from '../src/utils/pricing.js';
import {claudeRow, photoroomRow, openaiRow, costStats, budgetState, csvLine, csvText, CSV_COLUMNS, perPhoto, boxesPerDollar} from '../src/utils/costStats.js';
import {COST} from '../src/utils/cost.js';
// 비용 기록·통계 검사. 실제 Claude·Photoroom·OpenAI를 부르지 않습니다(모의 응답에 usage를 넣어 검사).

const usage={input_tokens:1800,output_tokens:600,cache_read_input_tokens:1000,cache_creation_input_tokens:200};
const img='data:image/jpeg;base64,'+Buffer.from('x').toString('base64');

test('server returns Anthropic usage (input, output and cache tokens) from defects and classify (mock client)',async()=>{
 const client=(parsed)=>({beta:{messages:{parse:async()=>({stop_reason:'end_turn',model:'claude-opus-5-5',usage,parsed_output:parsed})}}});
 const d=await findDefects({image:img,width:800,height:800,level:'aggressive'},{},client({regions:[]}));
 assert.deepEqual(d.usage,usage);assert.equal(d.model,'claude-opus-5-5');
 const c=await classifyPhotos({photos:[{id:'a',image:img}]},{},client({garments:[{id:'g1',description:'핑크 니트'}],photos:[{index:1,garment:'g1',shot:'front',confidence:.9,review:false,note:''}]}));
 assert.deepEqual(c.usage,usage);
});

test('price table: Opus 5.5 official rates with source URL; unknown model is 미확인 (null)',()=>{
 assert.deepEqual(CLAUDE_PRICES['claude-opus-5-5'],{label:'Claude Opus 5.5',input:4,cacheWrite5m:5,cacheWrite1h:8,cacheRead:.2,output:20});
 assert.match(SOURCES.claude.url,/^https:\/\/platform\.claude\.com\/docs\/en\/about-claude\/pricing$/);
 // 1,800×$4 + 200×$5 + 1,000×$0.20 + 600×$20 = 7,200+1,000+200+12,000 = $0.0204
 assert.ok(Math.abs(claudeCost('claude-opus-5-5',usage)-.0204)<1e-9);
 assert.ok(Math.abs(claudeCost('claude-opus-5-5',{input_tokens:0,cache_creation_input_tokens:100,cache_creation:{ephemeral_5m_input_tokens:40,ephemeral_1h_input_tokens:60}})-(40*5+60*8)/1e6)<1e-12);
 assert.equal(claudePrice('claude-opus-5-5-20261101').key,'claude-opus-5-5');assert.equal(claudePrice('claude-opus-5').key,'claude-opus-5');
 assert.equal(claudeCost('mock-model',usage),null);
 assert.equal(openaiCost('gpt-4.1-mini',{input_tokens:100,output_tokens:10}),null);
 assert.equal(PHOTOROOM.perCall,.1);assert.equal(PHOTOROOM.credits,5);
});

test('on-screen estimates are recomputed from the price table',()=>{
 assert.equal(estimateText('claudeDefects'),'약 $0.01~0.04/장');
 assert.equal(COST.claudeDefects[1],'약 $0.01~0.04/장');assert.equal(COST.claudeClassify[1],'약 $0.02~0.09/회');assert.equal(COST.photoroom[1],'$0.10/장');
});

test('log rows: tiles are summed, cache hits are $0, Photoroom is $0.10 + 5 credits, OpenAI keeps tokens with 미확인 cost',()=>{
 const now=new Date('2026-11-24T03:00:00Z');
 const r=claudeRow({feature:'defects',product:'핑크 후드',cut:'대표 정면',level:'aggressive',responses:[{model:'claude-opus-5-5',usage},{model:'claude-opus-5-5',usage}],boxes:7,now});
 assert.equal(r.calls,2);assert.equal(r.input_tokens,3600);assert.equal(r.output_tokens,1200);assert.ok(Math.abs(r.cost_usd-.0408)<1e-9);assert.equal(r.model,'Claude Opus 5.5');assert.equal(r.cached,false);
 const hit=claudeRow({feature:'defects',level:'aggressive',responses:[],boxes:7,cached:true,now});
 assert.equal(hit.cost_usd,0);assert.equal(hit.calls,0);assert.equal(hit.cached,true);
 assert.equal(claudeRow({feature:'defects',responses:[{model:'mock',usage}],now}).cost_usd,null);
 const p=photoroomRow({feature:'photoroom_cutout',product:'a',cut:'b',now});assert.equal(p.cost_usd,.1);assert.equal(p.credits,5);
 assert.equal(photoroomRow({feature:'photoroom_retouch2',cached:true,now}).cost_usd,0);
 const o=openaiRow({feature:'openai_copy',model:'gpt-4.1-mini',usage:{input_tokens:900,output_tokens:120},now});assert.equal(o.cost_usd,null);assert.equal(o.input_tokens,900);
});

test('CSV uses the fixed English columns and escapes product names',()=>{
 assert.deepEqual(CSV_COLUMNS,['timestamp','product','cut','feature','model','sensitivity','calls','input_tokens','output_tokens','cost_usd','boxes','cached']);
 const line=csvLine(claudeRow({feature:'defects',product:'후드, "핑크"',cut:'정면',level:'max',responses:[{model:'claude-opus-5-5',usage}],boxes:3,now:new Date('2026-11-24T03:00:00Z')}));
 assert.equal(line,'2026-11-24T03:00:00.000Z,"후드, ""핑크""",정면,defects,Claude Opus 5.5,max,1,1800,600,0.020400,3,false');
 assert.equal(csvLine(openaiRow({feature:'openai_copy',model:'gpt-4.1-mini',usage:{},now:new Date(0)})).split(',')[9],'');
 assert.ok(csvText([]).startsWith('﻿timestamp,product'));
});

test('stats: today/week/month totals, per feature and sensitivity, average per photo, boxes per $1, 30 daily bars, budget warnings',()=>{
 const now=new Date(2026,10,24,15,0);// 2026-11-24(화) 15:00 (현지 시각)
 const at=(d,h=10)=>new Date(2026,10,d,h,0);
 const rows=[
  {...claudeRow({feature:'defects',level:'aggressive',responses:[{model:'claude-opus-5-5',usage}],boxes:10,now:at(24)}),cost_usd:.05},
  {...claudeRow({feature:'defects',level:'aggressive',responses:[],boxes:10,cached:true,now:at(24)})},
  {...claudeRow({feature:'defects',level:'normal',responses:[{model:'claude-opus-5-5',usage}],boxes:2,now:at(23)}),cost_usd:.02},
  {...claudeRow({feature:'classify',responses:[{model:'claude-opus-5-5',usage}],photos:10,now:at(17)}),cost_usd:.1},
  photoroomRow({feature:'photoroom_cutout',now:at(2)}),
  openaiRow({feature:'openai_copy',model:'gpt-4.1-mini',usage:{input_tokens:1,output_tokens:1},now:at(24)}),
  {...photoroomRow({feature:'photoroom_cutout',now:new Date(2026,9,20)})},
 ];
 const s=costStats(rows,now);
 const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} ≠ ${b}`);
 near(s.today.cost,.05);assert.equal(s.today.cached,1);assert.equal(s.today.unknown,1);
 near(s.week.cost,.07);// 월요일(23일)부터
 near(s.month.cost,.27);
 near(s.byGroup.defects.cost,.07);near(s.byGroup.classify.cost,.1);near(perPhoto(s.byGroup.classify),.01);
 near(perPhoto(s.byLevel.aggressive),.05);near(boxesPerDollar(s.byLevel.aggressive),200);near(boxesPerDollar(s.byLevel.normal),100);
 assert.equal(s.days.length,30);assert.equal(s.days.at(-1).date,'2026-11-24');near(s.days.at(-1).cost,.05);
 assert.deepEqual(budgetState(.27,1400,'').level,'none');
 assert.equal(budgetState(.27,1400,500).level,'ok');// 378원 / 500원 = 76%
 assert.equal(budgetState(.29,1400,500).level,'warn');// 406원 = 81%
 assert.equal(budgetState(.36,1400,500).level,'over');// 504원
});
