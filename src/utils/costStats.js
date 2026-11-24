// 비용 기록 한 줄 만들기·통계·CSV (계산만, 저장은 costLog.js). 브라우저와 검사(Node)가 함께 씁니다.
import {claudeCost, openaiCost, claudePrice, PHOTOROOM} from './pricing.js';

// 기능: 수정할 곳 찾기 / 자동 분류 / 기타(Photoroom·OpenAI)
export const FEATURES={
  defects:{label:'수정할 곳 찾기',group:'defects'},
  classify:{label:'자동 분류',group:'classify'},
  photoroom_cutout:{label:'기타 · Photoroom 누끼',group:'other'},
  photoroom_retouch2:{label:'기타 · Photoroom 2차 보정',group:'other'},
  openai_copy:{label:'기타 · OpenAI 상품 문구',group:'other'},
  openai_shopee:{label:'기타 · OpenAI 쇼피 문구',group:'other'},
  openai_edit:{label:'기타 · OpenAI 보정',group:'other'},
};
export const GROUP_LABEL={defects:'수정할 곳 찾기',classify:'자동 분류',other:'기타'};
export const LEVEL_LABEL={normal:'보통',aggressive:'적극',max:'최대'};
// 구글 드라이브 CSV 열(영문 고정)
export const CSV_COLUMNS=['timestamp','product','cut','feature','model','sensitivity','calls','input_tokens','output_tokens','cost_usd','boxes','cached'];

const num=v=>Number.isFinite(Number(v))?Number(v):0;
const sumUsage=list=>list.reduce((a,u)=>({input_tokens:a.input_tokens+num(u?.input_tokens),output_tokens:a.output_tokens+num(u?.output_tokens),
  cache_read_input_tokens:a.cache_read_input_tokens+num(u?.cache_read_input_tokens),cache_creation_input_tokens:a.cache_creation_input_tokens+num(u?.cache_creation_input_tokens)}),
  {input_tokens:0,output_tokens:0,cache_read_input_tokens:0,cache_creation_input_tokens:0});

// Claude 호출 기록: responses = [{model, usage}, ...] (타일이면 여러 개). 한 개라도 단가를 모르면 비용은 null(미확인).
export function claudeRow({feature,product,cut,level=null,responses=[],boxes=null,photos=1,cached=false,now=new Date()}) {
  const costs=responses.map(r=>claudeCost(r.model,r.usage)),model=responses[0]?.model||'claude-opus-5-5';
  const cost=cached?0:costs.some(c=>c===null)?null:costs.reduce((a,b)=>a+b,0);
  return {timestamp:now.toISOString(),product:product||'',cut:cut||'',feature,model:claudePrice(model)?.label||model,sensitivity:level,calls:cached?0:responses.length,
    ...sumUsage(cached?[]:responses.map(r=>r.usage)),cost_usd:cost,boxes,photos,cached};
}
export function photoroomRow({feature,product,cut,cached=false,now=new Date()}) {
  return {timestamp:now.toISOString(),product:product||'',cut:cut||'',feature,model:PHOTOROOM.label,sensitivity:null,calls:cached?0:1,input_tokens:0,output_tokens:0,
    cost_usd:cached?0:PHOTOROOM.perCall,credits:cached?0:PHOTOROOM.credits,boxes:null,photos:1,cached};
}
export function openaiRow({feature,product,cut,model,usage,now=new Date()}) {
  return {timestamp:now.toISOString(),product:product||'',cut:cut||'',feature,model:model||'OpenAI',sensitivity:null,calls:1,
    input_tokens:num(usage?.input_tokens),output_tokens:num(usage?.output_tokens),cost_usd:openaiCost(model,usage),boxes:null,photos:1,cached:false};
}

// ---- CSV ----
const cell=v=>{const s=v===null||v===undefined?'':String(v);return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
export function csvLine(r) {
  const vals={...r,cost_usd:r.cost_usd===null||r.cost_usd===undefined?'':Number(r.cost_usd).toFixed(6),cached:r.cached?'true':'false',sensitivity:r.sensitivity||'',boxes:r.boxes??''};
  return CSV_COLUMNS.map(k=>cell(vals[k])).join(',');
}
export const csvText=rows=>'﻿'+[CSV_COLUMNS.join(','),...rows.map(csvLine)].join('\n')+'\n';

// ---- 통계 ----
const pad=n=>String(n).padStart(2,'0');
export const dayKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const startOfDay=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
function bucket() {return {cost:0,unknown:0,rows:0,calls:0,photos:0,paidPhotos:0,boxes:0,paidBoxes:0,cached:0,input:0,output:0};}
function add(b,r) {
  b.rows++;b.calls+=num(r.calls);b.input+=num(r.input_tokens);b.output+=num(r.output_tokens);b.boxes+=num(r.boxes);
  if(r.cached){b.cached++;return;}
  if(r.cost_usd===null||r.cost_usd===undefined)b.unknown++;else b.cost+=Number(r.cost_usd);
  b.paidPhotos+=num(r.photos)||1;b.paidBoxes+=num(r.boxes);
}
// 사진당 평균 = 실제 호출한 기록의 비용 ÷ 사진 수(재사용·미확인 제외). $1당 찾은 곳 = 찾은 상자 수 ÷ 비용(재사용 제외).
export const perPhoto=b=>b.paidPhotos?b.cost/b.paidPhotos:null;
export const boxesPerDollar=b=>b.cost>0?b.paidBoxes/b.cost:null;
export function costStats(rows,now=new Date()) {
  const today=startOfDay(now),week=new Date(today);week.setDate(week.getDate()-((today.getDay()+6)%7));
  const month=new Date(now.getFullYear(),now.getMonth(),1);
  const out={today:bucket(),week:bucket(),month:bucket(),all:bucket(),byFeature:{},byGroup:{},byLevel:{},days:[]};
  const days=new Map();
  for(let i=29;i>=0;i--){const d=new Date(today);d.setDate(d.getDate()-i);days.set(dayKey(d),0);}
  for(const r of rows){
    const t=new Date(r.timestamp);if(Number.isNaN(t.getTime()))continue;
    add(out.all,r);if(t>=today)add(out.today,r);if(t>=week)add(out.week,r);if(t>=month)add(out.month,r);
    add(out.byFeature[r.feature]||(out.byFeature[r.feature]=bucket()),r);
    const g=FEATURES[r.feature]?.group||'other';add(out.byGroup[g]||(out.byGroup[g]=bucket()),r);
    if(r.feature==='defects'&&r.sensitivity)add(out.byLevel[r.sensitivity]||(out.byLevel[r.sensitivity]=bucket()),r);
    const k=dayKey(t);if(days.has(k)&&!r.cached&&Number.isFinite(Number(r.cost_usd))&&r.cost_usd!==null)days.set(k,days.get(k)+Number(r.cost_usd));
  }
  out.days=[...days].map(([date,cost])=>({date,cost}));
  return out;
}
// 월 예산 경고: budget(원)과 이번 달 합계(원) 비교. 80% 이상 노랑, 100% 이상 빨강. 호출은 막지 않습니다.
export function budgetState(monthUsd,rate,budgetKrw) {
  const b=Number(budgetKrw);if(!(b>0))return {level:'none',ratio:null};
  const ratio=monthUsd*rate/b;
  return {level:ratio>=1?'over':ratio>=.8?'warn':'ok',ratio};
}
export const fmtUsd=v=>v===null||v===undefined?'미확인':`$${v<1&&v>0?v.toFixed(4):v.toFixed(2)}`;
export const fmtKrw=(v,rate)=>`${Math.round(v*rate).toLocaleString('ko-KR')}원`;
