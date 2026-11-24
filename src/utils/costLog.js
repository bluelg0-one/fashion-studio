// 유료 API 비용 기록: 이 브라우저(IndexedDB)에 저장합니다. 상품 저장소와 다른 저장소라 상품을 지워도 남습니다.
// 구글 드라이브가 연결돼 있으면 작업 폴더의 ‘두손_앱_비용기록.csv’에 계속 덧붙이고, 연결 전 기록은 연결되면 한꺼번에 올립니다.
import {hasToken, savedFolder, appendCostCsv} from './googleDrive.js';
import {CSV_COLUMNS, csvLine} from './costStats.js';

const DB='fashion-studio-costs',STORE='calls';
let opening=null;
function open() {
  if(!opening)opening=new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined')return reject(new Error('이 브라우저는 비용 기록 저장을 지원하지 않습니다.'));
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('비용 기록 저장소를 열 수 없습니다.'));
  });
  opening.catch(()=>{opening=null;});
  return opening;
}
async function run(mode,work) {
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
    let result;const request=work(store);
    if(request)request.onsuccess=()=>{result=request.result;};
    tx.oncomplete=()=>resolve(result);
    tx.onerror=tx.onabort=()=>reject(tx.error||new Error('비용 기록 저장에 실패했습니다.'));
  });
}
const listeners=new Set();
export const onCostChange=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
const notify=()=>{for(const fn of listeners)try{fn();}catch{}};

export async function listCosts() {return ((await run('readonly',s=>s.getAll()))||[]).sort((a,b)=>a.timestamp<b.timestamp?-1:a.timestamp>b.timestamp?1:0);}
// 기록 실패가 작업을 멈추지 않도록 오류는 삼키고 화면 알림만 남깁니다.
export async function addCost(row) {
  const id=`c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  try {await run('readwrite',s=>s.put({...row,id,synced:false}));}
  catch(e){syncState={...syncState,error:`비용 기록 저장 실패: ${e.message}`};notify();return null;}
  notify();syncCostLog().catch(()=>{});
  return id;
}

// ---- 구글 드라이브 CSV ----
export let syncState={busy:false,error:'',at:0,pending:0};
let syncing=null;
export function syncCostLog(folderId=savedFolder()?.id) {
  if(!folderId||!hasToken())return Promise.resolve({skipped:true});
  if(syncing)return syncing.then(()=>syncCostLog(folderId));
  syncing=(async()=>{
    try {
      const rows=(await listCosts()).filter(r=>!r.synced);
      if(!rows.length){syncState={...syncState,pending:0,error:''};return {uploaded:0};}
      syncState={...syncState,busy:true,pending:rows.length};notify();
      await appendCostCsv(folderId,CSV_COLUMNS.join(','),rows.map(csvLine));
      await run('readwrite',s=>{for(const r of rows)s.put({...r,synced:true});});
      syncState={busy:false,error:'',at:Date.now(),pending:0};
      return {uploaded:rows.length};
    } catch(e) {syncState={...syncState,busy:false,error:`드라이브 비용기록 올리기 실패: ${e.message}`};return {error:e.message};}
    finally {syncing=null;notify();}
  })();
  return syncing;
}
export async function pendingCount() {return (await listCosts()).filter(r=>!r.synced).length;}
