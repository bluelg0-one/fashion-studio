// 상품 단위 자동 보정 화면 (지시서 010). 순서·상태는 utils/autoPipeline.js, 실제 처리는 AutoStudio의 autoSteps.
import {useEffect, useRef, useState} from 'react';
import {getProduct} from '../utils/productStore.js';
import {planAuto, autoCounts, estimateAuto, remainingSeconds, summary, STATUS_LABEL} from '../utils/autoPipeline.js';
import {loadAutoJob, saveAutoJob, clearAutoJob} from '../utils/importStore.js';
import {estimateRange} from '../utils/pricing.js';
import {callsFor} from '../utils/defectTiles.js';

const usd=v=>`$${(Math.round(v*100)/100).toFixed(2)}`;
const mins=s=>s<60?`약 ${Math.max(1,Math.round(s))}초`:`약 ${Math.round(s/60)}분`;
// 2차는 ‘적극’(타일 4회) 고정 → 컷당 Claude 예상 비용
const perCut=()=>estimateRange('claudeDefects').map(v=>v*callsFor('aggressive'));

export default function AutoFixPanel({products,busy,setStep,freeEngines,runAutoJob,openProduct,request}) {
  const [selected,setSelected]=useState([]),[opts,setOpts]=useState({redo:false,paid:false,cap:'2'});
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
  }
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
      <button type="button" className="primary" disabled={busy||!selected.length} onClick={()=>makePlan()}>자동 보정 준비 (예상 보기)</button>
      {running&&<button type="button" className="subtle" onClick={()=>ctrl.current?.abort()}>중단</button>}
      {!running&&unfinished&&!plan&&<><button type="button" disabled={busy} onClick={()=>start(job)}>이어서 하기 (남은 컷 {c.work-c.finished}개)</button><button type="button" className="subtle" disabled={busy} onClick={discard}>진행 기록 버리기</button></>}
    </div>
    {plan&&<div className="import-plan auto-plan">
      <p><b>상품 {plan.est.products}개 · 컷 {plan.est.cuts}개</b>{autoCounts(plan.job).skipped?` · 이미 보정한 컷 ${autoCounts(plan.job).skipped}개 건너뜀`:''}</p>
      <p>예상 시간: <b>{mins(plan.est.seconds)}</b> (BiRefNet 장당 약 30초 + 2차 약 30초 기준, 사장님 PC 속도에 따라 다름) · 예상 Claude 비용: <span className="cost cost-claudeDefects">약 {usd(plan.est.claude[0])}~{usd(plan.est.claude[1])}</span>{plan.job.options.paid?<> · 유료 대체 상한: <b>{usd(plan.job.options.paidCap)}</b> (Photoroom $0.10/회)</>:' · 유료 대체 꺼짐'}</p>
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
  </section>;
}
