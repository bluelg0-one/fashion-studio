// 여러 상품을 이 브라우저(IndexedDB)에 저장합니다. 서버로 보내지 않으며,
// 다른 컴퓨터·다른 브라우저에서는 보이지 않습니다.
const DB='fashion-studio',STORE='products';
let opening=null;
function open() {
  if(!opening)opening=new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined')return reject(new Error('이 브라우저는 상품 저장을 지원하지 않습니다.'));
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('상품 저장소를 열 수 없습니다.'));
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
    tx.onerror=tx.onabort=()=>reject(tx.error||new Error('상품 저장에 실패했습니다. 저장 공간을 확인하세요.'));
  });
}
export async function listProducts() {
  const all=await run('readonly',store=>store.getAll())||[];
  return all.map(({id,name,updatedAt})=>({id,name,updatedAt})).sort((a,b)=>b.updatedAt-a.updatedAt);
}
export const getProduct=id=>run('readonly',store=>store.get(id));
export const saveProduct=product=>run('readwrite',store=>store.put({...product,updatedAt:Date.now()}));
export const deleteProduct=id=>run('readwrite',store=>store.delete(id));
export const newProductId=()=>'p-'+(crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2));
