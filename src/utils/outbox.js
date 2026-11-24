// 완성본·상세페이지 보관함(지시서 011): 상품마다 만든 파일을 이 브라우저(IndexedDB)에 먼저 저장하고,
// 구글 드라이브가 연결돼 있으면 바로, 아니면 연결될 때 한꺼번에 올립니다(‘드라이브 연결 후 한 번에 올리기’ 대기열).
// 올린 뒤에는 파일 내용은 지우고 기록(이름·크기·시각)만 남겨 저장 공간을 아낍니다.
import {hasToken, savedFolder, uploadFinalPhotos, uploadProductFile} from './googleDrive.js';

const DB='fashion-studio-outbox',STORE='items';
let opening=null;
function open() {
  if(!opening)opening=new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined')return reject(new Error('이 브라우저는 완성본 보관을 지원하지 않습니다.'));
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'productId'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('완성본 보관함을 열 수 없습니다.'));
  });
  opening.catch(()=>{opening=null;});
  return opening;
}
async function run(mode,work) {
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode),s=tx.objectStore(STORE);
    let result;const request=work(s);
    if(request)request.onsuccess=()=>{result=request.result;};
    tx.oncomplete=()=>resolve(result);
    tx.onerror=tx.onabort=()=>reject(tx.error||new Error('완성본 보관에 실패했습니다. 저장 공간을 확인하세요.'));
  });
}
// item = {productId, name, draft, files:[{kind,name,blob}], photos:[{slotId,label,image}], at, uploaded, uploadedAt, error}
export const putOutputs=item=>run('readwrite',s=>s.put({...item,uploaded:false,error:null}));
export const getOutputs=id=>run('readonly',s=>s.get(id));
export const listOutputs=async()=>((await run('readonly',s=>s.getAll()))||[]).sort((a,b)=>b.at-a.at);
export const pendingUploads=async()=>(await listOutputs()).filter(x=>!x.uploaded);
export const driveReady=()=>Boolean(hasToken()&&savedFolder()?.id);

let flushing=null;
// 대기열 올리기: 상품마다 완성 사진(바뀐 것만) + 상세페이지 PNG·HTML + 채널 묶음 ZIP → 작업 폴더/상품 이름 폴더
export function flushOutbox({onStage=()=>{},only=null}={}) {
  const folderId=savedFolder()?.id;
  if(!folderId||!hasToken())return Promise.resolve({skipped:true,uploaded:0});
  if(flushing)return flushing.then(()=>flushOutbox({onStage,only}));
  flushing=(async()=>{
    let uploaded=0;const errors=[];
    for(const item of await pendingUploads()){
      if(only&&!only.includes(item.productId))continue;
      try {
        const product={id:item.productId,name:item.name};
        onStage(`${item.name} · 완성 사진 올리는 중`);
        const r=await uploadFinalPhotos(folderId,product,item.photos||[],m=>onStage(`${item.name} · ${m}`));
        for(const f of item.files||[]){onStage(`${item.name} · ${f.name} 올리는 중`);await uploadProductFile(r.folder.id,product,f);}
        await run('readwrite',s=>s.put({...item,files:(item.files||[]).map(({blob,...f})=>({...f,size:blob?.size||f.size||0})),photos:(item.photos||[]).map(({image,...p})=>p),uploaded:true,uploadedAt:Date.now(),folder:r.folder.name,error:null}));
        uploaded++;
      } catch(e) {
        errors.push(`${item.name}: ${e.message}`);
        await run('readwrite',s=>s.put({...item,error:e.message}));
        if(e.expired)break;
      }
    }
    return {uploaded,errors};
  })().finally(()=>{flushing=null;});
  return flushing;
}
