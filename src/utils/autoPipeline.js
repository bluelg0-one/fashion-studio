// 상품 단위 자동 보정 (지시서 010) — 화면과 분리된 순서·상태 관리.
// 상품마다: ① 모든 컷 자동 수평 → 1차(누끼·받침대·정리·색상 기본값)  ② 색감 통일(대표 정면컷 기준)  ③ 2차(Claude 찾기 ‘적극’ → 작은 상자 분할 → IOPaint)  ④ 최종 확정
// 실제 처리(사진 계산·엔진 호출)는 deps.steps로 받습니다(AutoStudio.jsx). 단계가 끝날 때마다 상품과 진행 상태를 저장해서
// 중단·새로 고침 뒤에도 끝난 단계는 다시 하지 않습니다.
//
// 엔진 정책: 기본은 무료 엔진(BiRefNet·IOPaint, 사장님 PC). 처리 중 끊기면(오류에 offline=true) 그 컷을 ‘대기(PC 연결 끊김)’로 두고
// 다시 연결될 때까지 기다렸다가(다음 컷으로 넘어가지 않음) 이어서 합니다. 유료 대체(Photoroom)는 옵션을 켰을 때만, 상한 안에서만 씁니다.

export const STEPS=['level','stage1','color','stage2','final'];
export const STATUS_LABEL={pending:'대기',running:'처리 중',waiting:'대기(PC 연결 끊김)',done:'완료',review:'확인 필요',failed:'실패',skipped:'건너뜀(이미 보정)'};
export const PAID_STEP_COST=.1;// Photoroom 호출 1번
// 예상 시간(가정): BiRefNet 장당 약 30초 + Claude 찾기(적극 4회) 약 20초 + IOPaint 약 10초
export const SECONDS_PER_CUT={stage1:30,stage2:30,other:2};
// 품질 안전장치 기준
export const LIMITS={areaMin:.05,areaMax:.85,levelConfidence:.25,deltaE:10,regionsCap:40};

const check=signal=>{if(signal?.aborted)throw Object.assign(new Error('중단했습니다. ‘이어서 하기’를 누르면 남은 것부터 이어서 합니다.'),{stopped:true});};

// products: [{id, name, data}] · 대표 정면(hero)을 먼저 처리합니다(색감 기준).
export function planAuto(products,{redo=false,paid=false,paidCap=0,now=Date.now()}={}) {
  const list=products.map(p=>{
    const slots=p.data?.slots||{},ids=Object.keys(slots).filter(k=>slots[k]?.source&&slots[k].enabled!==false);
    ids.sort((a,b)=>(b==='hero')-(a==='hero'));
    return {id:p.id,name:p.name||'이름 없는 상품',cuts:ids.map(k=>{
      // 이미 보정 = 2차 결과가 있거나, 자동 보정이 끝까지 확정한 컷(찾은 곳 0곳이라 2차가 없는 컷 포함 → Claude를 다시 부르지 않음)
      const s=slots[k],done=Boolean(s.stage2||s.auto?.at),half=Boolean(s.stage1);
      return {slotId:k,label:s.label||k,status:!redo&&done?'skipped':'pending',step:!redo&&done?'done':!redo&&half?'color':'level',flags:[],error:null,seconds:0};
    })};
  });
  return {id:`auto-${now.toString(36)}`,createdAt:now,products:list,options:{redo,paid:Boolean(paid),paidCap:Number(paidCap)||0},spent:{claude:0,paid:0,claudeUnknown:0},elapsed:0,finished:false};
}
const allCuts=job=>job.products.flatMap(p=>p.cuts);
const todo=c=>!['done','review','skipped','failed'].includes(c.status);
export function autoCounts(job) {
  const c={products:job.products.length,cuts:0,pending:0,running:0,waiting:0,done:0,review:0,failed:0,skipped:0};
  for(const x of allCuts(job)){c.cuts++;c[x.status]++;}
  c.work=c.cuts-c.skipped;c.finished=c.done+c.review+c.failed;
  return c;
}
// 시작 전 예상: 처리할 컷 수 × 단계별 시간, Claude 비용(적극 4회/컷)
export function estimateAuto(job,claudePerCut=[0,0]) {
  let seconds=0,claudeCuts=0;
  for(const c of allCuts(job)){
    if(!todo(c))continue;
    const i=STEPS.indexOf(c.step);
    if(i<=1)seconds+=SECONDS_PER_CUT.stage1;
    if(i<=3){seconds+=SECONDS_PER_CUT.stage2;claudeCuts++;}
    seconds+=SECONDS_PER_CUT.other;
  }
  const c=autoCounts(job);
  return {products:job.products.filter(p=>p.cuts.some(todo)).length,cuts:c.work-c.finished,seconds,claude:[claudePerCut[0]*claudeCuts,claudePerCut[1]*claudeCuts]};
}
// 남은 예상 시간: 끝난 컷의 실제 평균(없으면 가정값)
export function remainingSeconds(job) {
  const done=allCuts(job).filter(c=>c.seconds>0),rest=allCuts(job).filter(todo);
  if(!done.length)return estimateAuto({...job,products:job.products.map(p=>({...p,cuts:p.cuts.filter(todo)}))}).seconds;
  return Math.round(done.reduce((a,c)=>a+c.seconds,0)/done.length*rest.length);
}
export function summary(job) {
  const c=autoCounts(job);
  return {done:c.done,review:c.review,failed:c.failed,skipped:c.skipped,claude:job.spent.claude,claudeUnknown:job.spent.claudeUnknown,paid:job.spent.paid,elapsed:job.elapsed,
    reviews:job.products.flatMap(p=>p.cuts.filter(x=>x.status==='review').map(x=>({productId:p.id,product:p.name,slotId:x.slotId,label:x.label,flags:x.flags}))),
    failures:job.products.flatMap(p=>p.cuts.filter(x=>x.status==='failed').map(x=>({productId:p.id,product:p.name,slotId:x.slotId,label:x.label,error:x.error})))};
}

// deps:
//  loadProduct(id) → {id,name,data} · saveProduct(product)
//  steps.level(slot) · steps.stage1(slot,{paid}) · steps.refLab(slot) · steps.color(slot,lab) · steps.stage2(slot,{paid}) · steps.final(product)
//    각 단계는 {slot(새 칸 값), flags:[문구], cost:{claude, claudeUnknown, paid}}를 돌려줍니다(final은 새 product).
//  checkFree(kind: 'birefnet'|'iopaint') → 연결됐는지 · wait(ms) · save(job) · onProgress(job,text) · signal · now()
export async function runAuto(job,deps) {
  const {loadProduct,saveProduct,steps,checkFree=async()=>true,wait=ms=>new Promise(r=>setTimeout(r,ms)),save=async()=>{},onProgress=()=>{},signal,now=()=>Date.now()}=deps;
  const progress=t=>onProgress(job,t);
  let tick=now();
  const clock=()=>{const t=now();job.elapsed+=Math.max(0,t-tick)/1000;tick=t;};
  const addCost=c=>{if(!c)return;job.spent.claude+=c.claude||0;job.spent.claudeUnknown+=c.claudeUnknown||0;job.spent.paid+=c.paid||0;};
  // 무료 엔진으로 하되, 끊기면 기다리거나(기본) 유료 대체(옵션·상한 안에서)
  async function engine(cut,kind,fn) {
    let paid=false;
    for(;;){
      check(signal);
      try {return await fn(paid);}
      catch(e) {
        if(!e?.offline||paid)throw e;
        if(job.options.paid){
          if(job.spent.paid+PAID_STEP_COST>job.options.paidCap+1e-9)throw Object.assign(new Error(`유료 상한($${job.options.paidCap.toFixed(2)})에 닿아 멈췄습니다. 무료 엔진(IOPaint Start)을 켜거나 상한을 올린 뒤 이어서 하세요.`),{capReached:true});
          paid=true;cut.paidFallback=true;continue;
        }
        cut.status='waiting';cut.error=`대기(PC 연결 끊김) · ${kind==='birefnet'?'BiRefNet':'IOPaint'}이 꺼져 있습니다. 바탕화면의 ‘IOPaint Start’를 켜 주세요.`;
        await save(job);progress(cut.error);
        while(!(await checkFree(kind))){check(signal);await wait(5000);}
        cut.status='running';cut.error=null;progress('다시 연결되어 이어서 처리합니다.');
      }
    }
  }
  try {
    for(const p of job.products){
      if(!p.cuts.some(todo))continue;
      check(signal);
      let product=await loadProduct(p.id);
      if(!product){for(const c of p.cuts.filter(todo)){c.status='failed';c.error='상품을 찾을 수 없습니다(삭제됨).';}await save(job);continue;}
      const slots=()=>product.data.slots;
      const put=async(cut,res)=>{product={...product,data:{...product.data,slots:{...slots(),[cut.slotId]:res.slot}}};for(const f of res.flags||[])if(!cut.flags.includes(f))cut.flags.push(f);addCost(res.cost);await saveProduct(product);};
      const run=async(cut,step,work)=>{
        if(!todo(cut)||STEPS.indexOf(cut.step)>STEPS.indexOf(step))return;
        check(signal);
        const t0=now();cut.status='running';progress(`${p.name} · ${cut.label} · ${{level:'자동 수평',stage1:'1차(누끼·정리·색상)',color:'색감 통일',stage2:'2차(수정할 곳 찾기 → IOPaint)'}[step]}`);
        try {await work();cut.step=STEPS[STEPS.indexOf(step)+1];cut.status='pending';}
        catch(e){if(e?.stopped||e?.capReached)throw e;cut.status='failed';cut.error=String(e?.message||e).slice(0,200);}
        finally {cut.seconds+=Math.max(0,now()-t0)/1000;clock();await save(job);}
      };
      // ① 자동 수평 + 1차 (대표 정면 먼저)
      for(const cut of p.cuts){
        await run(cut,'level',async()=>{if(!slots()[cut.slotId]?.source)throw new Error('사진이 없습니다.');await put(cut,await steps.level(slots()[cut.slotId],{product}));});
        await run(cut,'stage1',async()=>put(cut,await engine(cut,'birefnet',paid=>steps.stage1(slots()[cut.slotId],{paid,product}))));
      }
      // ② 색감 통일: 대표 정면(없으면 1차가 끝난 첫 컷)의 옷 색 기준
      const refCut=p.cuts.find(c=>c.slotId==='hero'&&slots().hero?.stage1)||p.cuts.find(c=>slots()[c.slotId]?.stage1);
      const lab=refCut?await steps.refLab(slots()[refCut.slotId]):null;
      for(const cut of p.cuts)await run(cut,'color',async()=>{if(cut===refCut||!lab)return;await put(cut,await steps.color(slots()[cut.slotId],lab,{product}));});
      // ③ 2차
      for(const cut of p.cuts)await run(cut,'stage2',async()=>put(cut,await engine(cut,'iopaint',paid=>steps.stage2(slots()[cut.slotId],{paid,product}))));
      // ④ 최종 확정: 상품 전체 이미지 다시 그리기(색감 기준 저장) → 컷 상태
      if(p.cuts.some(c=>todo(c)&&c.step==='final')){
        product=await steps.final(product,refCut?{slotId:refCut.slotId,label:refCut.label,lab}:null);
        const fin=p.cuts.filter(c=>todo(c)&&c.step==='final'),at=now(),ss={...product.data.slots};
        for(const c of fin)if(ss[c.slotId])ss[c.slotId]={...ss[c.slotId],auto:{at,flags:[...c.flags]}};
        product={...product,data:{...product.data,slots:ss}};await saveProduct(product);
        for(const c of p.cuts)if(todo(c)&&c.step==='final'){c.step='done';c.status=c.flags.length?'review':'done';}
        clock();await save(job);
      }
    }
    job.finished=!allCuts(job).some(todo);
    progress(job.finished?'완료':'멈춤');
  } finally {clock();await save(job);}
  return summary(job);
}

// ---- 품질 안전장치 (계산만) ----
// 누끼에서 옷(불투명) 면적 비율. 너무 작으면 옷이 지워졌거나, 너무 크면 배경이 남았을 수 있습니다.
export function opaqueFraction({data}) {let n=0;for(let i=3;i<data.length;i+=4)if(data[i]>127)n++;return data.length?n/(data.length/4):0;}
export function areaFlag(f) {return f<LIMITS.areaMin?`누끼 옷 면적이 너무 작음(${Math.round(f*100)}%) — 옷이 지워졌을 수 있음`:f>LIMITS.areaMax?`누끼 옷 면적이 너무 큼(${Math.round(f*100)}%) — 배경이 남았을 수 있음`:null;}
export function levelFlag(level) {if(level?.review&&level.reason)return `자동 수평: ${level.reason}`;return level&&level.confidence!=null&&level.confidence<LIMITS.levelConfidence?`자동 수평 신뢰도 낮음(${Math.round(level.confidence*100)}%)`:null;}
export const deltaE=(a,b)=>Math.hypot(a.L-b.L,a.a-b.a,a.b-b.b);
export function colorFlag(dE) {return dE>LIMITS.deltaE?`색감 통일 후에도 대표 컷과 색 차이가 큼(ΔE ${dE.toFixed(1)})`:null;}
export function regionsFlag(n) {return n===0?'Claude가 수정할 곳을 찾지 못함(0곳)':n>=LIMITS.regionsCap?`Claude가 찾은 곳이 상한(${LIMITS.regionsCap}곳) 이상`:null;}
