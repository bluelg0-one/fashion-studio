// 상품 단위 자동 보정 화면 (지시서 010). 순서·상태는 utils/autoPipeline.js, 실제 처리는 AutoStudio의 autoSteps.
import {useEffect, useRef, useState} from 'react';
import {getProduct} from '../utils/productStore.js';
import {planAuto, autoCounts, estimateAuto, remainingSeconds, summary, STATUS_LABEL} from '../utils/autoPipeline.js';
import {loadAutoJob, saveAutoJob, clearAutoJob} from '../utils/importStore.js';
import {estimateRange} from '../utils/pricing.js';
import {callsFor} from '../utils/defectTiles.js';
import {planSave, saveCounts, needsCopy, SAVE_STATUS} from '../utils/autoSave.js';
import {loadSaveJob, saveSaveJob, clearSaveJob} from '../utils/importStore.js';
import {pendingUploads, driveReady, flushOutbox, getOutputs} from '../utils/outbox.js';
import {downloadBlob} from '../utils/studioImages.js';

// 자동 보정 옵션(이 브라우저에 기억): 끝나면 완성본 저장(기본 켬) · 비어 있는 문구 자동 작성(OpenAI, 기본 끔)
const OPT_KEY='fashion-studio-auto-options';
const loadOpts=()=>{try{const v=JSON.parse(localStorage.getItem(OPT_KEY)||'{}');return {redo:false,paid:false,cap:'2',save:v.save!==false,copy:Boolean(v.copy)};}catch{return {redo:false,paid:false,cap:'2',save:true,copy:false};}};

const usd=v=>`$${(Math.round(v*100)/100).toFixed(2)}`;
const mins=s=>s<60?`약 ${Math.max(1,Math.round(s))}초`:`약 ${Math.round(s/60)}분`;
// 2차는 ‘적극’(타일 4회) 고정 → 컷당 Claude 예상 비용
const perCut=()=>estimateRange('claudeDefects').map(v=>v*callsFor('aggressive'));

export default function AutoFixPanel({products,busy,setStep,freeEngines,runAutoJob,runSaveJob,approveDetail,openProduct,request}) {
  const [selected,setSelected]=useState([]),[opts,setOptsState]=useState(loadOpts);
  const setOpts=f=>setOptsState(o=>{const n=typeof f==='function'?f(o):f;try{localStorage.setItem(OPT_KEY,JSON.stringify({save:n.save,copy:n.copy}));}catch{}return n;});
  const [saveJob,setSaveJob]=useState(null),[savePlan,setSavePlan]=useState(null),[saving,setSaving]=useState(false),[pending,setPending]=useState(0);
  const refreshPending=()=>pendingUploads().then(l=>setPending(l.length)).catch(()=>{});
  useEffect(()=>{loadSaveJob().then(j=>{if(j)setSaveJob(j);}).catch(()=>{});refreshPending();},[]);
  const [plan,setPlan]=useState(null),[job,setJob]=useState(null),[engines,setEngines]=useState(null),[running,setRunning]=useState(false),[stage,setStage]=useState(''),[,tick]=useState(0);
  const ctrl=useRef(null),box=useRef(null);
  useEffect(()=>{loadAutoJob().then(j=>{if(j)setJob(j);}).catch(()=>{});},[]);
  // 드라이브 가져오기가 끝난 화면에서 ‘자동 보정 시작’을 누르면 그 상품들로 바로 계획을 만듭니다.
  useEffect(()=>{if(request?.ids?.length){setSelected(request.ids);makePlan(request.ids);box.current?.scrollIntoView?.({block:'nearest'});}},[request]);

  async function makePlan(ids=selected,o=opts) {
    const list=(await Promise.all(ids.map(id=>getProduct(id)))).filter(Boolean);
    if(!list.length){setStep('자동 보정할 상품을 골라 주세요.');return;}
    const cap=Math.max(0,Number(o.cap)||0);
    const j=planAuto(list,{redo:o.redo,paid:o.paid,paidCap:cap});
    setPlan({job:j,est:estimateAuto(j,perCut())});
    setEngines(await freeEngines());
  }
  async function start(target) {
    const j=target||plan?.job;if(!j)return;
    setPlan(null);setJob(j);setRunning(true);ctrl.current=new AbortController();
    try {await runAutoJob(j,{signal:ctrl.current.signal,save:async x=>{await saveAutoJob(x);tick(n=>n+1);},onProgress:(x,t)=>{setStage(t);tick(n=>n+1);}});}
    finally {setRunning(false);setJob({...j});}
    // 010 요약 뒤 이어서: 완성본 저장 + 상세페이지(옵션, 기본 켬). 끝까지 처리된 상품만.
    if(j.finished&&opts.save&&!ctrl.current.signal.aborted){
      const ids=j.products.filter(p=>p.cuts.some(c=>c.status==='done'||c.status==='review')).map(p=>p.id);
      if(ids.length)await startSave(planSave((await Promise.all(ids.map(getProduct))).filter(Boolean),{copy:opts.copy}));
    }
  }
  // ---- 완성본 저장 + 상세페이지(011) ----
  async function prepareSave(ids=selected) {
    const list=(await Promise.all(ids.map(id=>getProduct(id)))).filter(Boolean);
    if(!list.length){setStep('저장할 상품을 골라 주세요.');return;}
    setSavePlan({job:planSave(list,{copy:opts.copy}),copyCount:opts.copy?list.filter(p=>needsCopy(p.data?.texts)&&p.data?.slots?.hero?.source).length:0});
  }
  async function startSave(target) {
    const j=target||savePlan?.job;if(!j)return;
    setSavePlan(null);setSaveJob(j);setSaving(true);ctrl.current=new AbortController();
    try {await runSaveJob(j,{signal:ctrl.current.signal,save:async x=>{await saveSaveJob(x);tick(n=>n+1);},onProgress:(x,t)=>{setStage(t);tick(n=>n+1);}});}
    finally {setSaving(false);setSaveJob({...j});refreshPending();}
  }
  async function approve(id) {
    const j=await approveDetail(id);
    if(j&&saveJob){const done=j.products[0];setSaveJob(s=>{const next={...s,products:s.products.map(p=>p.id===id?{...done}:p)};saveSaveJob(next).catch(()=>{});return next;});}
    refreshPending();
  }
  async function downloadOutputs(id) {const o=await getOutputs(id);for(const f of o?.files||[])if(f.blob)downloadBlob(f.blob,`${o.name}_${f.name}`);}
  async function uploadNow() {setStage('드라이브에 올리는 중');const r=await flushOutbox({onStage:m=>setStep(`드라이브 저장 · ${m}`)});setStep(r.skipped?'구글 드라이브가 연결되지 않았습니다. 아래 ‘구글 드라이브 저장’에서 연결하면 한꺼번에 올립니다.':`드라이브에 상품 ${r.uploaded}개를 올렸습니다${r.errors?.length?` · 실패: ${r.errors.join(' / ')}`:''}.`);refreshPending();}
  async function discard() {await clearAutoJob();setJob(null);setStep('자동 보정 기록을 닫았습니다. 보정한 사진은 상품에 그대로 있습니다.');}

  const freeOk=engines&&engines.birefnet&&engines.iopaint,canStart=plan&&plan.est.cuts>0&&(freeOk||plan.job.options.paid);
  const c=job?autoCounts(job):null,unfinished=job&&!job.finished,sum=job?summary(job):null;
  const toggle=id=>{setPlan(null);setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);};
  return <section className="auto-fix" aria-label="자동 보정" ref={box}>
    <h3>자동 보정 <small>상품마다 자동 수평 → 1차(누끼·정리·색상) → 색감 통일 → 2차(Claude 찾기 ‘적극’ → IOPaint) → 최종</small></h3>
    <details className="auto-pick"><summary>자동 보정할 상품 고르기 ({selected.length}/{products.length})</summary>
      <div className="btn-row"><button type="button" className="subtle" disabled={busy} onClick={()=>{setPlan(null);setSelected(products.map(p=>p.id));}}>모두 선택</button><button type="button" className="subtle" disabled={busy} onClick={()=>{setPlan(null);setSelected([]);}}>모두 해제</button></div>
      <ul>{products.map(p=><li key={p.id}><label><input type="checkbox" aria-label={`자동 보정 ${p.name||'이름 없는 상품'}`} checked={selected.includes(p.id)} disabled={busy} onChange={()=>toggle(p.id)}/> {p.name||'이름 없는 상품'}</label></li>)}</ul>
    </details>
    <div className="btn-row">
      <label><input type="checkbox" aria-label="이미 보정한 컷도 다시 보정" checked={opts.redo} disabled={busy} onChange={e=>{setPlan(null);setOpts(o=>({...o,redo:e.target.checked}));}}/> 이미 보정한 컷도 다시 보정</label>
      <label><input type="checkbox" aria-label="무료 엔진이 안 될 때 유료로 대신 처리" checked={opts.paid} disabled={busy} onChange={e=>{setPlan(null);setOpts(o=>({...o,paid:e.target.checked}));}}/> 무료 엔진이 안 될 때 유료(Photoroom)로 대신 처리</label>
      {opts.paid&&<label>이번 작업 유료 상한 $<input aria-label="유료 상한" type="number" min="0" step="0.5" value={opts.cap} disabled={busy} onChange={e=>{setPlan(null);setOpts(o=>({...o,cap:e.target.value}));}}/></label>}
      <label><input type="checkbox" aria-label="끝나면 완성본 저장 + 상세페이지 만들기" checked={opts.save} disabled={busy} onChange={e=>setOpts(o=>({...o,save:e.target.checked}))}/> 끝나면 완성본 저장 + 상세페이지 만들기</label>
      <label><input type="checkbox" aria-label="비어 있는 문구 자동 작성 (OpenAI, 유료)" checked={opts.copy} disabled={busy} onChange={e=>{setSavePlan(null);setOpts(o=>({...o,copy:e.target.checked}));}}/> 비어 있는 제목·설명 자동 작성 (OpenAI, 유료)</label>
      <button type="button" className="primary" disabled={busy||!selected.length} onClick={()=>makePlan()}>자동 보정 준비 (예상 보기)</button>
      <button type="button" disabled={busy||!selected.length} onClick={()=>prepareSave()}>완성본 저장 + 상세페이지만 만들기</button>
      {running&&<button type="button" className="subtle" onClick={()=>ctrl.current?.abort()}>중단</button>}
      {!running&&unfinished&&!plan&&<><button type="button" disabled={busy} onClick={()=>start(job)}>이어서 하기 (남은 컷 {c.work-c.finished}개)</button><button type="button" className="subtle" disabled={busy} onClick={discard}>진행 기록 버리기</button></>}
    </div>
    {plan&&<div className="import-plan auto-plan">
      <p><b>상품 {plan.est.products}개 · 컷 {plan.est.cuts}개</b>{autoCounts(plan.job).skipped?` · 이미 보정한 컷 ${autoCounts(plan.job).skipped}개 건너뜀`:''}</p>
      <p>예상 시간: <b>{mins(plan.est.seconds)}</b> (BiRefNet 장당 약 30초 + 2차 약 30초 기준, 사장님 PC 속도에 따라 다름) · 예상 Claude 비용: <span className="cost cost-claudeDefects">약 {usd(plan.est.claude[0])}~{usd(plan.est.claude[1])}</span>{plan.job.options.paid?<> · 유료 대체 상한: <b>{usd(plan.job.options.paidCap)}</b> (Photoroom $0.10/회)</>:' · 유료 대체 꺼짐'}</p>
      <p>끝나면 완성본 저장 + 상세페이지: <b>{opts.save?'켜짐':'꺼짐'}</b>{opts.save?` (${driveReady()?'구글 드라이브에 저장':'이 브라우저에 보관 → 드라이브 연결 후 한 번에 올리기'})`:''}{opts.save&&opts.copy?' · 비어 있는 문구 자동 작성(OpenAI, 상품당 1회, 단가 미확인 → 토큰만 기록)':''}</p>
      <p>무료 엔진: BiRefNet {engines?.birefnet?'✅ 연결됨':'⛔ 꺼짐'} · IOPaint {engines?.iopaint?'✅ 연결됨':'⛔ 꺼짐'}</p>
      {engines&&!freeOk&&!plan.job.options.paid&&<p className="review-note" role="alert">사장님 PC에서 바탕화면의 ‘IOPaint Start’를 켜 주세요. 무료 엔진(BiRefNet·IOPaint)이 켜져야 시작할 수 있습니다. 켠 뒤 ‘자동 보정 준비’를 다시 누르세요.</p>}
      {engines&&!freeOk&&plan.job.options.paid&&<p className="review-note">무료 엔진이 꺼져 있어 시작하면 유료(Photoroom)로 대신 처리합니다(상한 {usd(plan.job.options.paidCap)}에서 멈춤).</p>}
      <div className="btn-row"><button type="button" className="primary" disabled={busy||!canStart} onClick={()=>start()}>시작</button><button type="button" className="subtle" disabled={busy} onClick={()=>setPlan(null)}>취소</button></div>
    </div>}
    {job&&c&&<div className="import-progress auto-progress">
      <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={c.work} aria-valuenow={c.finished}><span style={{width:`${c.work?c.finished/c.work*100:100}%`}}/></div>
      <p className="import-counts">컷 {c.work}개 · 완료 <b>{c.done}</b> · 확인 필요 <b>{c.review}</b> · 실패 <b>{c.failed}</b>{c.waiting?<> · <b className="waiting">대기(PC 연결 끊김) {c.waiting}</b></>:''}{unfinished?` · 남은 시간 ${mins(remainingSeconds(job))}`:''}{running&&stage?` · ${stage}`:''}</p>
      <table className="cost-table auto-table"><tbody>{job.products.map(p=><tr key={p.id}><td><button type="button" className="link" disabled={busy} onClick={()=>openProduct(p.id)}>{p.name}</button></td><td>{p.cuts.map(x=><span key={x.slotId} className={`cut-chip st-${x.status}`} title={[x.error,...x.flags].filter(Boolean).join(' · ')}>{x.label} · {STATUS_LABEL[x.status]}</span>)}</td></tr>)}</tbody></table>
      {job.finished&&<div className="auto-summary">
        <p><b>끝났습니다</b> · 완료 {sum.done} · 확인 필요 {sum.review} · 실패 {sum.failed}{sum.skipped?` · 건너뜀 ${sum.skipped}`:''} · 쓴 비용: Claude 약 {usd(sum.claude)}{sum.claudeUnknown?`(단가 미확인 ${sum.claudeUnknown}회 제외)`:''}{sum.paid?` · 유료 대체 ${usd(sum.paid)}`:''} · 걸린 시간 {mins(sum.elapsed)}</p>
        {sum.reviews.length>0&&<details open className="review-list"><summary>⚠ 확인 필요 {sum.reviews.length}컷 (사장님 확인 목록)</summary><table className="cost-table"><thead><tr><th>상품</th><th>컷</th><th>이유</th><th/></tr></thead><tbody>
          {sum.reviews.map(r=><tr key={r.productId+r.slotId}><td>{r.product}</td><td>{r.label}</td><td>{r.flags.join(' · ')}</td><td><button type="button" className="subtle" disabled={busy} onClick={()=>openProduct(r.productId)}>상품 열기</button></td></tr>)}
        </tbody></table></details>}
        {sum.failures.length>0&&<details><summary>실패 {sum.failures.length}컷</summary><ul>{sum.failures.map(r=><li key={r.productId+r.slotId}>{r.product} · {r.label} — {r.error}</li>)}</ul></details>}
        <button type="button" className="subtle" disabled={busy} onClick={discard}>기록 닫기</button>
      </div>}
    </div>}
    {savePlan&&<div className="import-plan save-plan">
      <p><b>상품 {savePlan.job.products.length}개</b> · 만들 것: 완성 사진(JPG) · 상세페이지 PNG·HTML · 채널별 묶음(스마트스토어·쿠팡·인스타 4:5·자사몰) · 저장: {driveReady()?'구글 드라이브(바뀐 것만)':'이 브라우저에 보관 → 드라이브 연결 후 한 번에 올리기'}</p>
      <p>{savePlan.copyCount?<>문구 자동 작성: 상품 {savePlan.copyCount}개 × OpenAI 1회 <span className="cost cost-openai">단가 미확인 · 토큰만 기록</span></>:'문구 자동 작성 없음(비용 없음)'}{savePlan.job.products.some(p=>p.draft)?` · ‘확인 필요’ 컷이 있는 상품 ${savePlan.job.products.filter(p=>p.draft).length}개는 상세페이지를 초안(_초안)으로 저장`:''}</p>
      <div className="btn-row"><button type="button" className="primary" disabled={busy} onClick={()=>startSave()}>저장 시작</button><button type="button" className="subtle" disabled={busy} onClick={()=>setSavePlan(null)}>취소</button></div>
    </div>}
    {saveJob&&<div className="import-progress save-progress">
      <p className="import-counts">완성본·상세페이지 · 상품 {saveCounts(saveJob).total}개 · 저장됨 <b>{saveCounts(saveJob).done}</b> · 초안 <b>{saveCounts(saveJob).drafts}</b> · 실패 <b>{saveCounts(saveJob).failed}</b>{saving&&stage?` · ${stage}`:''}</p>
      <table className="cost-table"><thead><tr><th>상품</th><th>상태</th><th>파일</th><th>확인 목록</th><th/></tr></thead><tbody>
        {saveJob.products.map(p=><tr key={p.id} data-save={p.id}><td>{p.name}{p.draft&&<span className="cut-chip st-review">초안</span>}</td><td>{SAVE_STATUS[p.status]}{p.status==='done'?` · ${p.where==='drive'?'드라이브':'브라우저 보관'}`:''}{p.error?` — ${p.error}`:''}</td><td>{p.files.join(', ')}{p.photos?` · 완성 사진 ${p.photos}장`:''}</td><td>{p.notes.join(' · ')}</td>
          <td>{p.status==='done'&&<button type="button" className="subtle" disabled={busy} onClick={()=>downloadOutputs(p.id)}>내려받기</button>}{p.draft&&p.status==='done'&&<button type="button" className="primary" disabled={busy} onClick={()=>approve(p.id)}>확인 완료 → 정식 저장</button>}<button type="button" className="link" disabled={busy} onClick={()=>openProduct(p.id)}>상품 열기</button></td></tr>)}
      </tbody></table>
      <div className="btn-row">
        {saving&&<button type="button" className="subtle" onClick={()=>ctrl.current?.abort()}>중단</button>}
        {!saving&&!saveJob.finished&&<button type="button" disabled={busy} onClick={()=>startSave(saveJob)}>이어서 하기 (남은 상품 {saveJob.products.filter(p=>p.status!=='done'&&p.status!=='failed').length}개)</button>}
        {!saving&&<button type="button" className="subtle" disabled={busy} onClick={async()=>{await clearSaveJob();setSaveJob(null);}}>목록 닫기</button>}
      </div>
    </div>}
    <p className="slot-note outbox-note">{pending?<>드라이브에 아직 올리지 않은 상품 <b>{pending}개</b>(이 브라우저에 보관 중) · 드라이브를 연결하면 한꺼번에 올립니다. <button type="button" className="subtle" disabled={busy} onClick={uploadNow}>지금 올리기</button></>:'완성본은 만들 때 이 브라우저에 먼저 보관하고, 드라이브가 연결돼 있으면 바로 올립니다.'}</p>
  </section>;
}
