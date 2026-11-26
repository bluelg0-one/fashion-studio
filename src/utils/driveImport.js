import {HANGER_V2} from './appMode.js';
// 사진 여러 장 가져오기 → 묶음 분류 → 상품 만들기 (화면과 분리된 순수 흐름).
// 네트워크·사진 처리는 deps로 받아서, 화면 버튼(지금)이나 다음 단계의 자동 보정(010)이 같은 함수를 그대로 부를 수 있습니다.
// 진행 상태(job)는 매 단계 저장(deps.save)하므로, 중간에 끊겨도 같은 job으로 다시 부르면 남은 것부터 이어서 합니다.
//
// job = {id, createdAt, files:[{id, name, mimeType, status, thumb, error, garment, shot, confidence, review, note, productId}], garments:{G1:{description, ref, last}}, nextG, products:{G1:productId}}
// 파일 상태: pending(아직) → read(썸네일 만듦) → classified(분류됨) → done(상품에 들어감) / failed(실패, 다시 누르면 다시 시도)

export const BATCH_SIZE=20;// 한 번에 Claude에 보내는 사진 수(서버 최대 24)
export const REF_LIMIT=24;// 앞 묶음에서 찾은 옷 중 최근 것 몇 벌의 썸네일을 함께 보낼지
export const IMAGE_TYPES=['image/jpeg','image/png','image/webp','image/heic','image/heif'];

// 촬영 순서(파일 이름 순)로 정렬: 같은 옷 사진이 붙어 있으면 묶음 사이에서 같은 옷을 이어 붙이기 쉽습니다.
const byName=(a,b)=>String(a.name).localeCompare(String(b.name),'ko',{numeric:true});

export function newJob(files,importedIds=new Set(),now=Date.now()) {
  const seen=new Set(),list=[];let skipped=0,unsupported=0;
  for(const f of [...files].sort(byName)){
    if(!f?.id||seen.has(f.id))continue;seen.add(f.id);
    if(importedIds.has(f.id)){skipped++;continue;}
    if(!IMAGE_TYPES.includes(f.mimeType)){unsupported++;continue;}
    list.push({id:f.id,name:f.name||f.id,mimeType:f.mimeType,status:'pending'});
  }
  return {job:{id:`job-${now.toString(36)}`,createdAt:now,files:list,garments:{},nextG:0,products:{}},skipped,unsupported};
}

export function counts(job) {
  const c={total:job.files.length,pending:0,read:0,classified:0,done:0,failed:0,review:0};
  for(const f of job.files){c[f.status]=(c[f.status]||0)+1;if(f.review&&f.status!=='failed')c.review++;}
  c.finished=c.done+c.failed;
  return c;
}
// 아직 Claude 분류가 필요한 사진 수(예상 비용 표시용)
export const toClassify=job=>job.files.filter(f=>f.status==='pending'||f.status==='read'||(f.status==='failed'&&f.stage!=='product')).length;

// 사진 칸 배치: 지금의 ‘한꺼번에 올리기’와 같은 규칙. 같은 컷이 두 장이면 뒤의 것은 추가 칸(extra).
const SHOT_SLOT={front:'hero',frontZoom:'frontZoom',frontTop:'frontTop',frontBottom:'frontBottom',side:'side',back:'back',fabric:'fabric',fit:'fit'};
const DETAIL_ORDER=['fabric','detail2','detail3','point1','point2'];
// 옷걸이 v2(014): 정면 → 옷걸이 정면(hero), 후면 → 옷걸이 후면(back). 그 밖의 사진(애매함·다른 컷)은 '확인 필요' 추가 칸으로.
const SHOT_SLOT_V2={front:'hero',back:'back'};
export function assignSlots(items,taken=[],v2=HANGER_V2) {
  const used=new Set(taken),out=[];
  for(const item of [...items].sort((a,b)=>b.confidence-a.confidence)){
    let id=(v2?SHOT_SLOT_V2:SHOT_SLOT)[item.shot];
    if(v2){if(!id||used.has(id)){out.push({slotId:null,item});continue;}used.add(id);out.push({slotId:id,item});continue;}
    if((!id||used.has(id))&&['fabric','detail'].includes(item.shot))id=DETAIL_ORDER.find(k=>!used.has(k));
    if(!id||used.has(id)){out.push({slotId:null,item});continue;}
    used.add(id);out.push({slotId:id,item});
  }
  return out;
}

const check=signal=>{if(signal?.aborted)throw Object.assign(new Error('중단했습니다. 다시 누르면 남은 것부터 이어서 합니다.'),{stopped:true});};
const errText=e=>String(e?.message||e||'오류').slice(0,200);

// deps:
//  readThumb(file) → 분류용 작은 사진(data URL)            refImage(thumb) → 참고용 더 작은 사진(기본: 그대로)
//  classify({photos, references}) → 서버 classify 결과      onClassified(result, batchFiles) → 비용 기록 등
//  createProduct({garmentId, description, items}) → productId   (items = 분류된 파일들)
//  save(job) → 진행 저장        onProgress(job, stage)        signal → 중단
export async function runImport(job,deps) {
  const {readThumb,classify,createProduct,refImage=t=>t,onClassified=()=>{},save=async()=>{},onProgress=()=>{},signal}=deps;
  const progress=stage=>onProgress(job,stage);
  // 실패한 것은 다시 시도(실패했던 단계부터)
  for(const f of job.files)if(f.status==='failed'){f.status=f.stage==='product'?'classified':f.thumb?'read':'pending';f.error=null;}
  // 1) 사진 읽기(썸네일)
  for(const f of job.files.filter(f=>f.status==='pending')){
    check(signal);progress(`사진 읽는 중 · ${f.name}`);
    try {f.thumb=await readThumb(f);f.status='read';}
    catch(e){if(e?.stopped)throw e;f.status='failed';f.stage='read';f.error=errText(e);}
    await save(job);
  }
  // 2) 묶음 분류: 앞 묶음에서 찾은 옷(최근 것부터 REF_LIMIT벌)의 썸네일을 함께 보내 같은 옷이면 이어 붙입니다.
  let waiting=job.files.filter(f=>f.status==='read');
  const batches=Math.ceil(waiting.length/BATCH_SIZE);
  for(let b=0;waiting.length;b++){
    check(signal);
    const batch=waiting.slice(0,BATCH_SIZE);waiting=waiting.slice(BATCH_SIZE);
    const refs=Object.entries(job.garments).sort((x,y)=>y[1].last-x[1].last).slice(0,REF_LIMIT).map(([id,g])=>({id,description:g.description,image:g.ref}));
    progress(`Claude가 분류하는 중 · 묶음 ${b+1}/${batches} (${batch.length}장${refs.length?`, 앞에서 찾은 옷 ${refs.length}벌과 비교`:''})`);
    let result;
    try {result=await classify({photos:batch.map(f=>({id:f.id,image:f.thumb})),references:refs});}
    catch(e){for(const f of batch){f.status='failed';f.stage='classify';f.error=errText(e);}await save(job);progress('분류 실패');throw e;}
    onClassified(result,batch);
    // 이 묶음의 새 옷 → 전체 번호(G1, G2…). 참고 옷과 같으면 그 번호 그대로.
    const local={};
    // design(015): 같은 묶음 안에서만 비교할 수 있는 값이라 묶음 번호를 붙여 저장합니다(다른 묶음끼리는 제안하지 않음).
    for(const g of result.garments||[]){const id=`G${++job.nextG}`;local[g.id]=id;job.garments[id]={description:g.description,ref:null,last:0,...(g.design?{design:`${job.id}-${b}-${g.design}`}:{}),...(g.color?{color:g.color}:{})};}
    const byId=Object.fromEntries(batch.map(f=>[f.id,f]));
    for(const p of result.photos||[]){
      const f=byId[p.id];if(!f)continue;
      let gid=job.garments[p.garment]&&p.reference?p.garment:local[p.garment];
      if(!gid){gid=`G${++job.nextG}`;local[p.garment]=gid;job.garments[gid]={description:'분류 안 된 사진',ref:null,last:0};p.review=true;}
      Object.assign(f,{status:'classified',garment:gid,shot:p.shot,confidence:p.confidence,review:Boolean(p.review),note:p.note||''});
      const g=job.garments[gid];g.last=job.seq=(job.seq||0)+1;
      if(!g.ref||(p.shot==='front'&&!g.refFront)){g.ref=await refImage(f.thumb);g.refFront=p.shot==='front';}
    }
    for(const f of batch)if(f.status==='read'){f.status='failed';f.stage='classify';f.error='분류 결과에서 빠졌습니다.';}
    await save(job);
  }
  // 3) 옷마다 상품 만들기(이미 만든 옷은 건너뜀)
  const groups={};
  for(const f of job.files)if(f.status==='classified')(groups[f.garment]||(groups[f.garment]=[])).push(f);
  const ids=Object.keys(groups);
  for(let i=0;i<ids.length;i++){
    check(signal);
    const gid=ids[i],items=groups[gid];
    progress(`상품 만드는 중 · ${i+1}/${ids.length} ${job.garments[gid]?.description||''}`);
    try {
      const productId=await createProduct({garmentId:gid,description:job.garments[gid]?.description||'이름 없는 옷',items,existing:job.products[gid]||null,design:job.garments[gid]?.design||'',color:job.garments[gid]?.color||''});
      job.products[gid]=productId;
      for(const f of items){f.status='done';f.productId=productId;f.thumb=f.review?f.thumb:null;}
    } catch(e){if(e?.stopped)throw e;for(const f of items){f.status='failed';f.stage='product';f.error=errText(e);}}
    await save(job);
  }
  progress('완료');
  return counts(job);
}
// 확신이 낮은 사진 목록(옷·컷·이유)
export const reviewList=job=>job.files.filter(f=>f.review&&f.status==='done').map(f=>({id:f.id,name:f.name,garment:job.garments[f.garment]?.description||'',shot:f.shot,note:f.note,productId:f.productId}));
