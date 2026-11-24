// 드라이브 가져오기 진행 상태와 ‘이미 가져온 파일’(드라이브 파일 ID) 목록을 이 브라우저(IndexedDB)에 저장합니다.
// 상품 저장소와 따로라 상품을 지워도 ‘가져온 파일’ 기록은 남습니다(다시 가져오려면 화면의 ‘가져온 기록 지우기’).
const DB='fashion-studio-imports',JOBS='jobs',FILES='files',CURRENT='current';
let opening=null;
function open() {
  if(!opening)opening=new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined')return reject(new Error('이 브라우저는 가져오기 기록 저장을 지원하지 않습니다.'));
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>{request.result.createObjectStore(JOBS,{keyPath:'key'});request.result.createObjectStore(FILES,{keyPath:'id'});};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('가져오기 기록 저장소를 열 수 없습니다.'));
  });
  opening.catch(()=>{opening=null;});
  return opening;
}
async function run(store,mode,work) {
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,mode),s=tx.objectStore(store);
    let result;const request=work(s);
    if(request)request.onsuccess=()=>{result=request.result;};
    tx.oncomplete=()=>resolve(result);
    tx.onerror=tx.onabort=()=>reject(tx.error||new Error('가져오기 기록 저장에 실패했습니다.'));
  });
}
// 진행 중인 가져오기(한 번에 하나)
export const loadJob=async()=>(await run(JOBS,'readonly',s=>s.get(CURRENT)))?.job||null;
export const saveJob=job=>run(JOBS,'readwrite',s=>s.put({key:CURRENT,job}));
export const clearJob=()=>run(JOBS,'readwrite',s=>s.delete(CURRENT));
// 이미 가져온 드라이브 파일
export async function importedIds() {return new Set(((await run(FILES,'readonly',s=>s.getAllKeys()))||[]).map(String));}
export const markImported=(files,productId)=>run(FILES,'readwrite',s=>{for(const f of files)s.put({id:f.id,name:f.name,productId,at:Date.now()});});
export const forgetImported=()=>run(FILES,'readwrite',s=>s.clear());
