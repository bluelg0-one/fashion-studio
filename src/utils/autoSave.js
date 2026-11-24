// 완성본 저장 + 상세페이지 만들기 (지시서 011) — 화면과 분리된 순서·상태 관리.
// 상품마다: (선택) 비어 있는 문구 자동 작성 → 확인 목록(사이즈·초안) → 파일 만들기(완성 사진, 상세페이지 PNG·HTML, 채널별 묶음) → 보관·올리기.
// 실제 계산·저장은 deps로 받습니다(AutoStudio.jsx의 saveDeps). 상품이 끝날 때마다 진행 상태를 저장해 이어서 할 수 있습니다.

export const SAVE_STATUS={pending:'대기',running:'만드는 중',done:'저장됨',failed:'실패'};
// 채널별 내보내기(07)에서 자동 저장에 넣는 채널. 쇼피 ZIP은 보류 지시로 만들지 않습니다.
export const AUTO_CHANNELS=['smartstore','coupang','instagram','mall'];

const check=signal=>{if(signal?.aborted)throw Object.assign(new Error('중단했습니다. ‘이어서 하기’를 누르면 남은 상품부터 이어서 합니다.'),{stopped:true});};

// ‘확인 필요’ 컷이 있고(자동 보정 표시) 사장님이 아직 확인을 누르지 않은 상품 = 초안
export function reviewCuts(data) {return Object.values(data?.slots||{}).filter(s=>s?.source&&s.auto?.flags?.length).map(s=>({slotId:s.id,label:s.label,flags:s.auto.flags}));}
export const isDraft=data=>reviewCuts(data).length>0&&!data?.detailApproved;
export function sizeMissing(rows) {return !rows?.length||rows.every(r=>Object.entries(r||{}).every(([k,v])=>k==='id'||!String(v??'').trim()));}
export const needsCopy=texts=>!String(texts?.headline||'').trim()||!String(texts?.description||'').trim();
export function fileNames(draft) {const d=draft?'_초안':'';return {png:`상세페이지${d}.png`,html:`상세페이지${d}.html`,zip:'채널별_묶음.zip'};}

export function planSave(products,{copy=false,now=Date.now()}={}) {
  return {id:`save-${now.toString(36)}`,createdAt:now,options:{copy:Boolean(copy)},
    products:products.map(p=>({id:p.id,name:p.name||'이름 없는 상품',status:'pending',draft:isDraft(p.data),notes:[],files:[],where:null,error:null,copied:false})),finished:false};
}
export const saveCounts=job=>{const c={total:job.products.length,pending:0,running:0,done:0,failed:0,drafts:0,notes:0};for(const p of job.products){c[p.status]++;if(p.draft)c.drafts++;if(p.notes.length)c.notes++;}return c;};
export const copyCandidates=(job,products)=>job.options.copy?products.filter(p=>needsCopy(p.data?.texts)).length:0;

// deps:
//  loadProduct(id) · saveProduct(product)
//  writeCopy(product) → 새 product(문구 채움) — job.options.copy이고 문구가 비었을 때만
//  build(product,{draft}) → {files:[{kind,name,blob}], photos:[{slotId,label,image}], notes:[]}
//  store(product,{files,photos,draft}) → {where:'drive'|'browser'}
//  save(job) · onProgress(job,text) · signal
export async function runSave(job,deps) {
  const {loadProduct,saveProduct,writeCopy,build,store,save=async()=>{},onProgress=()=>{},signal}=deps;
  for(const p of job.products){
    if(p.status==='done')continue;
    check(signal);
    p.status='running';p.error=null;onProgress(job,`${p.name} · 상세페이지·완성본 만드는 중`);
    try {
      let product=await loadProduct(p.id);
      if(!product)throw new Error('상품을 찾을 수 없습니다(삭제됨).');
      if(job.options.copy&&needsCopy(product.data?.texts)&&!p.copied){
        onProgress(job,`${p.name} · 문구 자동 작성(OpenAI)`);
        product=await writeCopy(product);await saveProduct(product);p.copied=true;
      }
      const draft=isDraft(product.data);
      const out=await build(product,{draft});
      const res=await store(product,{files:out.files,photos:out.photos,draft});
      Object.assign(p,{status:'done',draft,notes:[...(out.notes||[]),...(res.note?[res.note]:[]),...(draft?reviewCuts(product.data).map(c=>`확인 필요 컷: ${c.label} (${c.flags.join(', ')})`):[])],files:out.files.map(f=>f.name),photos:out.photos.length,where:res.where});
    } catch(e) {
      if(e?.stopped)throw e;
      p.status='failed';p.error=String(e?.message||e).slice(0,200);
    } finally {await save(job);}
  }
  job.finished=!job.products.some(p=>p.status!=='done'&&p.status!=='failed');
  onProgress(job,job.finished?'완료':'멈춤');await save(job);
  return saveCounts(job);
}
