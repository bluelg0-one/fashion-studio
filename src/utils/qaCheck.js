// 상품별 자동 점검(014-2): 검증 기준서(docs/qa/검증기준서.md)의 자동 측정 항목을 계산합니다(브라우저 계산, 무료).
// 결과: 통과(pass) / 보류(hold) / 불합격(fail) + 이유. 고칠 수 있는 항목이면 다시 편집할 설정(retry)을 함께 돌려줍니다.
// 입력 사진은 모두 ImageData 모양({data,width,height}). 1차(stage1)와 최종(final)은 같은 크기·같은 위치입니다(2차는 1차 위에서 고침).
import {rgbToLab, dominantLab} from './colorMatch.js';
import {findButtons} from './flatten.js';
import {garmentFrame} from './detailCrops.js';
import {CHANNELS} from './channelSpecs.js';
import {hangerResidue} from './cleanup.js';

// 기준값(검증 기준서와 같은 숫자 — 바꾸면 기준서도 함께 고칩니다)
export const QA={
  colorShiftHold:3,colorShiftFail:6,// 2차 전·후 옷 대표 색 ΔE: 3 이하 통과, 6 이하 보류, 넘으면 불합격
  colorPairHold:10,// 정면·후면 옷 대표 색 ΔE(색감 통일 뒤): 넘으면 보류
  block:16,minChroma:6,blockChroma:.85,grayHold:1,grayFail:4,// 회색 얼룩: 1차보다 채도가 85% 미만으로 떨어진 16px 칸 수(1~3 보류, 4 이상 불합격)
  edgePx:2,edgeShare:.01,// 가장자리 잘림: 사진 테두리 2px 안에 옷이 닿은 길이가 테두리의 1% 이상이면 불합격
  areaMin:.05,areaMax:.85,// 옷 면적 비율(배경이 남았거나 옷이 지워졌는지)
  islandShare:.0005,// 배경 잔여물: 옷과 떨어진 조각(사진의 0.05% 이상) 수, 1개 이상 보류
  buttonsDiff:0,// 단추 수 변화(1차 → 최종): 0이 아니면 불합격
  hookMin:.012,// 옷걸이 고리: 몸판 위로 옷 높이의 1.2% 이상 솟은 좁은 부분(옷걸이 남기기 설정일 때)
  residueMax:.01,
  dentHold:.01,// 옷걸이 자리 패임(020): 복원 뒤 남은 어깨 패임 깊이가 옷 높이의 1% 이상이면 보류// 옷걸이 잔여물(016, 옷걸이 지우기 설정일 때): 맨 위에 남은 가는 고리 높이가 옷 높이의 1% 이상이면 불합격
  channelFill:.88,// 채널 사진에서 옷이 차지하는 긴 변 비율(여백 6%씩)
  upscaleMax:1.25,// 채널 사진을 만들 때 원본 옷을 1.25배까지 키우는 것은 통과, 더 키워야 하면 보류(흐려 보임)
};
export const QA_MAX_RETRY=2;
export const QA_STATUS_LABEL={pass:'통과',hold:'보류',fail:'불합격',na:'해당 없음'};
const RANK={pass:0,na:0,hold:1,fail:2};
export const worst=list=>list.reduce((a,s)=>RANK[s]>RANK[a]?s:a,'pass');

const chroma=(img,i)=>{const [,a,b]=rgbToLab(img.data[i],img.data[i+1],img.data[i+2]);return Math.hypot(a,b);};
// 회색 얼룩: 1차 대비 채도가 크게 떨어진 칸 수(원래 채도가 있는 칸만)
export function grayBlocks(before,after,o=QA) {
  const {width:W,height:H}=before,B=o.block;let n=0;
  for(let by=0;by+B<=H;by+=B)for(let bx=0;bx+B<=W;bx+=B){
    let c0=0,c1=0,k=0;
    for(let y=by;y<by+B;y+=2)for(let x=bx;x<bx+B;x+=2){const i=(y*W+x)*4;if(before.data[i+3]<200||after.data[i+3]<200)continue;c0+=chroma(before,i);c1+=chroma(after,i);k++;}
    if(k<(B*B/4)*.8)continue;c0/=k;c1/=k;
    if(c0>=o.minChroma&&c1<c0*o.blockChroma)n++;
  }
  return n;
}
export function edgeTouch(img,o=QA) {
  const {width:W,height:H,data}=img,e=o.edgePx;let n=0;
  const hit=(x,y)=>data[(y*W+x)*4+3]>=128;
  for(let x=0;x<W;x++){let t=false,b=false;for(let k=0;k<e;k++){t=t||hit(x,k);b=b||hit(x,H-1-k);}n+=t+b;}
  for(let y=0;y<H;y++){let l=false,r=false;for(let k=0;k<e;k++){l=l||hit(k,y);r=r||hit(W-1-k,y);}n+=l+r;}
  return n/(2*(W+H));
}
export function opaqueShareOf({data}) {let n=0;for(let i=3;i<data.length;i+=4)if(data[i]>=128)n++;return data.length?n/(data.length/4):0;}
// 떨어진 조각 수(4배 줄여 셈). 가장 큰 덩어리(옷)와, 그 위에서 이어지는 옷걸이 고리는 빼고 셉니다.
export function islands(img,o=QA) {
  const s=4,W=Math.ceil(img.width/s),H=Math.ceil(img.height/s),m=new Uint8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=((Math.min(img.height-1,y*s))*img.width+Math.min(img.width-1,x*s))*4;m[y*W+x]=img.data[i+3]>=128?1:0;}
  const lab=new Int32Array(W*H).fill(-1),sizes=[];const st=[];
  for(let p=0;p<W*H;p++){if(!m[p]||lab[p]>=0)continue;const id=sizes.length;let n=0;st.push(p);lab[p]=id;
    while(st.length){const q=st.pop();n++;const x=q%W,y=(q-x)/W;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;const r=ny*W+nx;if(m[r]&&lab[r]<0){lab[r]=id;st.push(r);}}}
    sizes.push(n);}
  if(sizes.length<2)return 0;
  const main=sizes.indexOf(Math.max(...sizes)),min=W*H*o.islandShare;
  return sizes.filter((n,id)=>id!==main&&n>=min).length;
}
// 옷걸이 고리: 몸판 위쪽보다 위로 솟은 좁은 부분이 옷 높이의 1.2% 이상
export function hasHook(img,o=QA) {const f=garmentFrame(img);return Boolean(f&&f.bodyTop-f.y0>=(f.hemY-f.y0+1)*o.hookMin);}
// 2차가 바꾼 곳(1차와 픽셀이 다른 곳)의 범위. 단추는 바뀐 곳에서만 사라지거나 생길 수 있으므로 그 범위(+여유)에서만 찾습니다(빠름).
export function changedBox(before,after,tol=8) {
  const {width:W,height:H}=before,a=before.data,b=after.data;let x0=W,y0=H,x1=-1,y1=-1;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;if(Math.abs(a[i]-b[i])>tol||Math.abs(a[i+1]-b[i+1])>tol||Math.abs(a[i+2]-b[i+2])>tol||Math.abs(a[i+3]-b[i+3])>tol){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}
  if(x1<0)return null;
  const m=Math.round(Math.max(W,H)*.05);
  return {x:Math.max(0,x0-m),y:Math.max(0,y0-m),x1:Math.min(W-1,x1+m),y1:Math.min(H-1,y1+m)};
}
// 단추 변화: 1차의 단추(확실한 것)와 최종의 단추를 위치로 짝지어 잃은 것·생긴 것(바뀐 곳 안에서만)
export function buttonChangeOf(before,after) {
  const box=changedBox(before,after);
  if(!box)return {before:0,after:0,lost:0,added:0,changed:false};
  const o={strong:true},a=findButtons(before,box,o),b=findButtons(after,box,o);
  const match=(p,list)=>list.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<=Math.max(p.r,q.r));
  return {before:a.length,after:b.length,lost:a.filter(p=>!match(p,b)).length,added:b.filter(q=>!match(q,a)).length,changed:true};
}
const dE=(p,q)=>Math.hypot(p.L-q.L,p.a-q.a,p.b-q.b);
const r1=v=>Math.round(v*10)/10;

// 컷 하나 점검. cut: {matte(누끼, 원본과 같은 크기), stage1, final(지금 최종), label}
// 반환: checks[{key,cut,status,value,limit,reason,fix}] (fix: 다시 편집으로 고칠 수 있는 종류)
export function checkCut({matte=null,stage1=null,final,hanger='keep',restore=null},name='front',o=QA) {
  const out=[],add=(key,status,value,limit,reason,fix=null)=>out.push({key,cut:name,status,value,limit,reason:status==='pass'||status==='na'?'':reason,fix:status==='pass'||status==='na'?null:fix});
  const area=opaqueShareOf(final);
  add('area',area<o.areaMin||area>o.areaMax?'fail':'pass',r1(area*100),`${o.areaMin*100}~${o.areaMax*100}%`,area<o.areaMin?`옷 면적이 너무 작음(${r1(area*100)}%) — 옷이 지워졌을 수 있음`:`옷 면적이 너무 큼(${r1(area*100)}%) — 배경이 남았을 수 있음`,'stage1');
  const edge=edgeTouch(final,o);
  add('edge',edge>=o.edgeShare?'fail':'pass',r1(edge*100),`<${o.edgeShare*100}%`,'옷이 사진 가장자리에서 잘림(찍은 사진에서 옷이 잘렸거나 누끼가 사진 끝까지 남음)',null);
  const isl=islands(final,o);
  // 작은 조각(0.4% 미만)은 1차에서 이미 지웠으므로 남은 조각은 옷의 일부(끈·벨트)일 수도 있음 → 자동으로 지우지 않고 사장님 확인(다시 편집 없음)
  add('islands',isl>=1?'hold':'pass',isl,'0',`옷과 떨어진 조각 ${isl}개(배경·벽 잔여물이거나 끈·벨트 같은 옷의 일부)`,null);
  if(stage1){
    const s=dE(dominantLab(stage1),dominantLab(final));
    add('color_shift',s>o.colorShiftFail?'fail':s>o.colorShiftHold?'hold':'pass',r1(s),`≤${o.colorShiftHold}`,`2차 보정 뒤 옷 색이 바뀜(ΔE ${r1(s)})`,'stage2');
    const g=grayBlocks(stage1,final,o);
    add('gray_blotch',g>=o.grayFail?'fail':g>=o.grayHold?'hold':'pass',g,'0',`회색으로 바랜 칸 ${g}곳(16px 칸)`,'stage2');
    const bt=buttonChangeOf(stage1,final),diff=bt.lost+bt.added;
    add('buttons',diff>o.buttonsDiff?'fail':'pass',diff,'0',`단추 수 변화: 잃음 ${bt.lost} · 생김 ${bt.added} (2차가 고친 범위 안 1차 ${bt.before}개 → 최종 ${bt.after}개)`,'stage2');
  }
  // 옷걸이 지우기(016 v2 기본): 최종 사진에 남은 옷걸이(모양으로 찾은 가는 고리)가 없어야 함. 설정으로 더 고칠 수 없어 사장님 확인.
  // 옷걸이 자리 패임(020): 복원할 때 잰 남은 패임 깊이(윤곽 오목 깊이, px) ÷ 옷 높이. 복원 기록이 없으면(예전 컷·남기기) 해당 없음.
  if(hanger==='remove'){const f=garmentFrame(final),gh=f?f.hemY-f.y0+1:0,dep=restore&&gh?(Number(restore.depthAfter)||0)/gh:null;
    add('hanger_dent',dep===null?'na':dep>=o.dentHold?'hold':'pass',dep===null?'-':r1(dep*100),`<${o.dentHold*100}%`,restore?.status==='review'?restore.reason:`옷걸이 자리가 패여 있음(옷 높이의 ${r1((dep||0)*100)}%)`,null);}
  if(hanger==='remove'){const r=hangerResidue(final);add('hanger_residue',r>=o.residueMax?'fail':'pass',r1(r*100),`<${o.residueMax*100}%`,`옷걸이 고리가 남음(옷 높이의 ${r1(r*100)}%) — 누끼에서 지우지 못함`,null);}
  if(matte){
    if(hanger!=='remove'){const was=hasHook(matte),now=hasHook(final);
    add('hanger_hook',!was?'na':now?'pass':'fail',now?1:0,was?'1':'-','누끼에는 있던 옷걸이 고리가 최종 사진에서 사라짐','hook');}
    // 해상도·규격: 원본 옷 긴 변이 채널 사진 크기 × 0.88 이상이어야 늘리지 않음
    const f=garmentFrame(matte),side=f?Math.max(f.x1-f.x0+1,f.hemY-f.y0+1):0;
    for(const ch of CHANNELS){
      const need=Math.round(Math.max(...ch.images[0].size)*o.channelFill/o.upscaleMax);
      add(`resolution_${ch.id}`,side>=need?'pass':'hold',side,`≥${need}px`,`${ch.label} 규격(${ch.images[0].size.join('×')})에 맞추려면 옷을 ${o.upscaleMax}배 넘게 키워야 함(원본 옷 긴 변 ${side}px)`,null);
    }
  }
  return out;
}
// 상품 점검. cuts: {front:{matte,stage1,final}, back:{...}} · details: 디테일 보고서(detailReport)
// 반환 {status, reasons[], checks[], retry|null}
export function checkProduct({front=null,back=null,details=null},o=QA) {
  const checks=[];
  if(!front?.final)checks.push({key:'front_missing',cut:'front',status:'fail',value:0,limit:'1',reason:'옷걸이 정면 보정 사진이 없음',fix:null});
  else checks.push(...checkCut(front,'front',o));
  if(back?.final)checks.push(...checkCut(back,'back',o));
  else checks.push({key:'back_missing',cut:'back',status:'hold',value:0,limit:'1',reason:'옷걸이 후면 사진이 없음',fix:null});
  if(front?.final&&back?.final){
    const p=dE(dominantLab(front.final),dominantLab(back.final));
    checks.push({key:'color_pair',cut:'front+back',status:p>o.colorPairHold?'hold':'pass',value:r1(p),limit:`≤${o.colorPairHold}`,reason:p>o.colorPairHold?`정면·후면 옷 색 차이가 큼(ΔE ${r1(p)})`:'',fix:p>o.colorPairHold?'color':null});
  }
  if(details){
    const review=(details.skipped||[]).filter(s=>s.review),low=(details.skipped||[]).filter(s=>/해상도 부족/.test(s.reason));
    checks.push({key:'details_review',cut:'detail',status:review.length?'hold':'pass',value:review.length,limit:'0',reason:review.length?`디테일 위치 확인 필요: ${review.map(s=>s.label).join(', ')}`:'',fix:null});
    checks.push({key:'details_resolution',cut:'detail',status:'pass',value:low.length,limit:'-',reason:low.length?`해상도 부족으로 뺀 디테일(참고): ${low.map(s=>s.label).join(', ')}`:'',fix:null});
    if(details.error)checks.push({key:'details_error',cut:'detail',status:'hold',value:1,limit:'0',reason:`디테일컷을 만들지 못함: ${details.error}`,fix:null});
  }
  const status=worst(checks.map(c=>c.status));
  const reasons=checks.filter(c=>c.status==='hold'||c.status==='fail').map(c=>`${c.cut==='front'?'정면':c.cut==='back'?'후면':c.cut==='detail'?'디테일':'정면·후면'} · ${c.reason}`);
  return {status,reasons,checks};
}
// 다시 편집할 설정(최대 2회): 고칠 수 있는 항목만 보고 시도마다 더 조심스러운 쪽으로 바꿉니다.
// 2차가 만든 문제(색 변화·회색·단추) → 1회: 얼룩 지우기(IOPaint) 없이 구김 그림자 펴기만, 2회: 2차 없이 1차를 최종으로
// 고리 사라짐 → 떨어진 조각 지우기 끄고 1차 다시(같은 누끼, 무료) · 옷 면적 이상 → 1차 다시
// 정면·후면 색 차이 → 색감 맞추기 강도 100%. 가장자리 잘림·떨어진 조각·해상도·디테일 위치는 설정으로 못 고침 → 다시 편집 없이 사장님 확인
export function retryPlan(result,attempt) {
  const fixes=new Set(result.checks.filter(c=>c.fix&&(c.status==='hold'||c.status==='fail')).map(c=>c.fix+':'+c.cut));
  if(!fixes.size)return null;
  const cuts=f=>[...fixes].filter(x=>x.startsWith(f+':')).map(x=>x.split(':')[1]).filter(c=>c==='front'||c==='back');
  const plan={attempt,stage1:{},stage2:{},color:false,labels:[]};
  for(const c of cuts('hook')){plan.stage1[c]={...(plan.stage1[c]||{}),cleanIslands:false};}
  for(const c of cuts('stage1'))plan.stage1[c]=plan.stage1[c]||{};
  for(const c of cuts('stage2'))plan.stage2[c]=attempt<=1?'gentle':'skip';
  if([...fixes].some(x=>x.startsWith('color:')))plan.color=true;
  if(Object.keys(plan.stage1).length)plan.labels.push(`1차 다시(${Object.entries(plan.stage1).map(([c,p])=>`${c==='front'?'정면':'후면'}${p.cleanIslands===false?' 떨어진 조각 지우기 끔(고리 보호)':''}`).join(', ')})`);
  if(Object.keys(plan.stage2).length)plan.labels.push(`2차 ${Object.values(plan.stage2).includes('skip')?'빼고 1차를 최종으로':'얼룩 지우기 없이 그림자 펴기만'}`);
  if(plan.color)plan.labels.push('색감 맞추기 강도 100%');
  plan.label=plan.labels.join(' · ');
  return plan;
}
// 점검보고서 CSV(드라이브 저장용, 영문 고정 열). 한 줄 = 점검 항목 하나.
export const QA_COLUMNS=['product_id','product_name','checked_at','product_status','attempts','owner_review','cut','check','result','value','limit','reason'];
const csvCell=v=>{const s=String(v??'');return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
export function qaCsv(product,qa) {
  const head={product_id:product.id,product_name:product.name||'',checked_at:new Date(qa.at||Date.now()).toISOString(),product_status:qa.status,attempts:qa.attempts||0,owner_review:qa.owner?'yes':'no'};
  const rows=(qa.checks||[]).map(c=>({...head,cut:c.cut,check:c.key,result:c.status,value:c.value,limit:c.limit,reason:c.reason}));
  return '﻿'+[QA_COLUMNS.join(','),...rows.map(r=>QA_COLUMNS.map(k=>csvCell(r[k])).join(','))].join('\r\n')+'\r\n';
}
