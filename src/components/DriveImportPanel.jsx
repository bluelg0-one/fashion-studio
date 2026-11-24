// 드라이브에서 한꺼번에 가져오기 + 자동 분류 (지시서 009). 흐름 자체는 utils/driveImport.js(화면과 분리)에 있습니다.
import {useEffect, useRef, useState} from 'react';
import {signIn, hasToken, pickPhotos, listFolderImages, FOLDER_TYPE} from '../utils/googleDrive.js';
import {newJob, runImport, counts, toClassify, reviewList, IMAGE_TYPES} from '../utils/driveImport.js';
import {loadJob, saveJob, clearJob, importedIds, forgetImported} from '../utils/importStore.js';
import {classifyEstimate} from '../utils/pricing.js';
import {SHOT_LABEL} from './CutRow.jsx';

const usd=v=>`$${(Math.round(v*100)/100).toFixed(2)}`;
const est=n=>{const e=classifyEstimate(n);return e.batches?`약 ${usd(e.range[0])}~${usd(e.range[1])} (Claude 분류 ${e.batches}번)`:'분류 비용 없음';};

// deps: readThumb, classify, createProduct, onClassified — 화면 밖 흐름에 그대로 넘깁니다.
export default function DriveImportPanel({ready,busy,task,setStep,deps,onFinished,openProduct,onAutoFix=()=>{}}) {
  const [job,setJob]=useState(null),[plan,setPlan]=useState(null),[stage,setStage]=useState(''),[running,setRunning]=useState(false),[,tick]=useState(0);
  const ctrl=useRef(null);
  useEffect(()=>{loadJob().then(j=>{if(j)setJob(j);}).catch(()=>{});},[]);
  const picker=ready?.googlePicker,clientId=ready?.googleClientId;
  const missing=!clientId||!picker;

  async function choose() {
    await task(async()=>{
      if(!hasToken()){setStep('구글 로그인 창에서 계정을 고르고 허용을 눌러 주세요');await signIn(clientId);}
      setStep('구글 선택 창에서 사진 폴더(또는 사진 여러 장)를 고르세요');
      const picked=await pickPhotos({...picker,mimeTypes:IMAGE_TYPES});
      if(!picked.length){setStep('가져오기를 취소했습니다.');return;}
      const files=[],emptyFolders=[];
      for(const p of picked){
        if(p.mimeType!==FOLDER_TYPE){files.push(p);continue;}
        setStep(`폴더 ‘${p.name}’의 사진 목록을 읽는 중`);
        const inside=await listFolderImages(p.id);
        if(inside.length)files.push(...inside);else emptyFolders.push(p.name);
      }
      const made=newJob(files,await importedIds());
      setPlan({...made,emptyFolders});
      setStep(made.job.files.length?`새 사진 ${made.job.files.length}장을 찾았습니다. 예상 비용을 확인하고 ‘분류 시작’을 누르세요.`:'새로 가져올 사진이 없습니다.');
    });
  }
  async function start(target) {
    const j=target||plan?.job;if(!j)return;
    setPlan(null);setJob(j);ctrl.current=new AbortController();setRunning(true);
    await task(async()=>{
      try {
        await saveJob(j);
        const c=await runImport(j,{...deps,save:async x=>{await saveJob(x);tick(n=>n+1);},onProgress:(x,s)=>{setStage(s);setStep(`드라이브 가져오기 · ${s}`);tick(n=>n+1);},signal:ctrl.current.signal});
        setStep(`드라이브 가져오기 완료 · 사진 ${c.total}장 중 ${c.done}장을 상품 ${Object.keys(j.products).length}개에 넣었습니다${c.failed?` · 실패 ${c.failed}장(다시 누르면 다시 시도)`:''}${c.review?` · ⚠ 확인 필요 ${c.review}장`:''}.`);
        await onFinished(Object.values(j.products)[0]);
      } catch(e) {
        if(e.stopped){setStep(e.message);return;}
        throw new Error(`드라이브 가져오기가 멈췄습니다: ${e.message} 다시 누르면 남은 사진부터 이어서 합니다.`);
      } finally {setRunning(false);setJob({...j});}
    });
  }
  async function discard() {await clearJob();setJob(null);setStage('');setStep('가져오기 기록(진행 상태)을 지웠습니다. 이미 만든 상품은 그대로 있습니다.');}

  const c=job?counts(job):null,unfinished=c&&c.finished<c.total,reviews=job?reviewList(job):[],failed=job?job.files.filter(f=>f.status==='failed'):[];
  return <section className="drive-import" aria-label="드라이브에서 가져오기">
    <div className="btn-row">
      <button type="button" className="primary" disabled={busy||missing} onClick={choose}>드라이브 폴더에서 가져오기 (자동 분류)</button>
      {running&&<button type="button" className="subtle" onClick={()=>ctrl.current?.abort()}>중단</button>}
      {!running&&unfinished&&!plan&&<><button type="button" disabled={busy} onClick={()=>start(job)}>이어서 하기 (남은 {c.total-c.finished+c.failed}장 · {est(toClassify(job))})</button><button type="button" className="subtle" disabled={busy} onClick={discard}>진행 기록 버리기</button></>}
    </div>
    {missing&&<p className="slot-note">드라이브에서 가져오려면 구글 연결 설정이 필요합니다({!clientId?'GOOGLE_CLIENT_ID':''}{!clientId&&!picker?', ':''}{!picker?'GOOGLE_PICKER_API_KEY · GOOGLE_APP_ID':''}). 그동안은 ‘사진 한꺼번에 올리기’를 쓰세요.</p>}
    {plan&&<div className="import-plan">
      <p><b>새 사진 {plan.job.files.length}장</b>{plan.skipped?` · 이미 가져온 사진 ${plan.skipped}장 건너뜀`:''}{plan.unsupported?` · 사진이 아닌 파일 ${plan.unsupported}개 제외`:''}</p>
      {plan.emptyFolders.length>0&&<p className="review-note">폴더 ‘{plan.emptyFolders.join('’, ‘')}’ 안의 사진을 읽지 못했습니다. 선택 창에서 폴더를 열고 사진을 모두 선택(Ctrl+A)해 다시 골라 주세요.</p>}
      {plan.job.files.length>0&&<p>예상 비용: <span className="cost cost-claudeClassify">{est(plan.job.files.length)}</span> · 실제 금액은 ‘비용 통계’에 기록됩니다.</p>}
      <div className="btn-row">{plan.job.files.length>0&&<button type="button" className="primary" disabled={busy} onClick={()=>start()}>분류 시작</button>}<button type="button" className="subtle" disabled={busy} onClick={()=>setPlan(null)}>취소</button></div>
    </div>}
    {job&&c&&<div className="import-progress">
      <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={c.total} aria-valuenow={c.finished}><span style={{width:`${c.total?c.finished/c.total*100:0}%`}}/></div>
      <p className="import-counts">전체 <b>{c.total}</b>장 · 완료 <b>{c.done}</b> · 실패 <b>{c.failed}</b> · 확인 필요 <b>{c.review}</b>{running&&stage?` · ${stage}`:''}</p>
      {failed.length>0&&!running&&<details><summary>실패한 사진 {failed.length}장 (다시 누르면 다시 시도)</summary><ul>{failed.slice(0,50).map(f=><li key={f.id}>{f.name} — {f.error}</li>)}</ul></details>}
      {reviews.length>0&&<details className="review-list" open><summary>⚠ 확인 필요 {reviews.length}장</summary><table className="cost-table"><thead><tr><th>파일</th><th>옷</th><th>컷</th><th>이유</th><th/></tr></thead><tbody>
        {reviews.map(r=><tr key={r.id}><td>{r.name}</td><td>{r.garment}</td><td>{SHOT_LABEL[r.shot]||r.shot}</td><td>{r.note}</td><td><button type="button" className="subtle" disabled={busy} onClick={()=>openProduct(r.productId)}>상품 열기</button></td></tr>)}
      </tbody></table></details>}
      {!unfinished&&!running&&Object.keys(job.products).length>0&&<div className="btn-row"><button type="button" className="primary" disabled={busy} onClick={()=>onAutoFix([...new Set(Object.values(job.products))])}>자동 보정 시작 (가져온 상품 {new Set(Object.values(job.products)).size}개)</button></div>}
      {!unfinished&&!running&&<p className="slot-note">끝난 가져오기입니다. <button type="button" className="subtle" disabled={busy} onClick={discard}>목록 닫기</button> <button type="button" className="subtle" disabled={busy} onClick={async()=>{if(window.confirm('이미 가져온 사진 기록을 지울까요? 같은 사진을 다시 가져오면 상품이 또 만들어집니다.')){await forgetImported();setStep('가져온 사진 기록을 지웠습니다.');}}}>가져온 기록 지우기</button></p>}
    </div>}
  </section>;
}
