// 구글 드라이브 저장 (사장님 구글 계정, 무료 15GB).
// 권한은 drive.file 하나만 씁니다: 앱이 만든 폴더·파일만 보고 쓸 수 있고, 드라이브의 다른 파일은 볼 수 없습니다.
// 사진은 브라우저 → 구글 드라이브로 바로 갑니다(우리 서버를 거치지 않음).
const SCOPE='https://www.googleapis.com/auth/drive.file';
const API='https://www.googleapis.com/drive/v3';
const UPLOAD='https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME='application/vnd.google-apps.folder';
const FOLDER_KEY='gdriveFolder';
export const FORMAT='fashion-studio-product';

let gisLoading=null,tokenClient=null,token=null;

function loadGis() {
  if(window.google?.accounts?.oauth2)return Promise.resolve();
  if(!gisLoading)gisLoading=new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;
    s.onload=()=>resolve();s.onerror=()=>{gisLoading=null;reject(new Error('구글 로그인 도구를 불러오지 못했습니다. 인터넷 연결을 확인하세요.'));};
    document.head.appendChild(s);
  });
  return gisLoading;
}

export const hasToken=()=>Boolean(token&&token.expiresAt>Date.now()+60000);
export function signOut() {
  if(token&&window.google?.accounts?.oauth2?.revoke)try{window.google.accounts.oauth2.revoke(token.value,()=>{});}catch{}
  token=null;
}

// 로그인 창(팝업)을 띄워 접근 토큰을 받습니다. 버튼을 누를 때만 부르세요(팝업 차단 방지).
export async function signIn(clientId) {
  if(!clientId)throw new Error('구글 드라이브 연결 설정(GOOGLE_CLIENT_ID)이 아직 없습니다.');
  await loadGis();
  return new Promise((resolve,reject)=>{
    tokenClient=window.google.accounts.oauth2.initTokenClient({
      client_id:clientId,scope:SCOPE,
      callback:r=>{
        if(r.error)return reject(new Error(r.error==='access_denied'?'구글 드라이브 접근을 허용하지 않았습니다.':`구글 로그인 실패 (${r.error})`));
        token={value:r.access_token,expiresAt:Date.now()+(Number(r.expires_in)||3600)*1000};resolve(token);
      },
      error_callback:e=>reject(new Error(e?.type==='popup_closed'?'구글 로그인 창이 닫혔습니다.':e?.type==='popup_failed_to_open'?'팝업이 차단되었습니다. 주소창 오른쪽의 팝업 차단 표시를 눌러 허용하세요.':'구글 로그인에 실패했습니다.')),
    });
    tokenClient.requestAccessToken({prompt:''});
  });
}

async function call(url,opts={}) {
  if(!hasToken())throw Object.assign(new Error('구글 드라이브 연결 시간이 지났습니다. ‘구글 드라이브 연결’을 다시 눌러 주세요.'),{expired:true});
  const r=await fetch(url,{...opts,headers:{Authorization:`Bearer ${token.value}`,...opts.headers}});
  if(r.status===401){token=null;throw Object.assign(new Error('구글 드라이브 연결 시간이 지났습니다. ‘구글 드라이브 연결’을 다시 눌러 주세요.'),{expired:true});}
  if(r.status===404)throw Object.assign(new Error('드라이브에서 찾을 수 없습니다(삭제했거나 휴지통에 있음).'),{notFound:true});
  if(r.status===403){let reason='';try{reason=(await r.json()).error?.errors?.[0]?.reason||'';}catch{}
    throw new Error(reason==='storageQuotaExceeded'?'구글 드라이브 저장 공간이 꽉 찼습니다.':`구글 드라이브 권한 오류 (${reason||403}).`);}
  if(!r.ok)throw new Error(`구글 드라이브 오류 (${r.status}). 잠시 후 다시 시도하세요.`);
  return r;
}
const q=s=>encodeURIComponent(s);
const esc=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");

// ---- 작업 폴더 (이 컴퓨터에 기억) ----
export function savedFolder() {try{return JSON.parse(localStorage.getItem(FOLDER_KEY)||'null');}catch{return null;}}
export function rememberFolder(f) {try{f?localStorage.setItem(FOLDER_KEY,JSON.stringify({id:f.id,name:f.name})):localStorage.removeItem(FOLDER_KEY);}catch{}}

// 이 앱이 만든 작업 폴더 목록(다른 컴퓨터에서 만든 것도 같은 구글 계정이면 보임).
export async function listFolders() {
  const query=`mimeType='${FOLDER_MIME}' and appProperties has { key='fashionStudio' and value='folder' } and trashed=false`;
  const r=await call(`${API}/files?q=${q(query)}&fields=${q('files(id,name,modifiedTime)')}&orderBy=modifiedTime desc&pageSize=50&spaces=drive`);
  return (await r.json()).files||[];
}
export async function createFolder(name) {
  const r=await call(`${API}/files?fields=id,name`,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:String(name).trim().slice(0,100)||'패션스튜디오 상품',mimeType:FOLDER_MIME,appProperties:{fashionStudio:'folder'}})});
  return r.json();
}
export async function checkFolder(id) {
  const r=await call(`${API}/files/${q(id)}?fields=id,name,trashed`);const f=await r.json();
  if(f.trashed)throw Object.assign(new Error('작업 폴더가 휴지통에 있습니다.'),{notFound:true});
  return f;
}

// ---- 상품 파일 ----
export async function listDriveProducts(folderId) {
  const query=`'${esc(folderId)}' in parents and appProperties has { key='fashionStudio' and value='product' } and trashed=false`;
  const r=await call(`${API}/files?q=${q(query)}&fields=${q('files(id,name,modifiedTime,size,appProperties)')}&orderBy=modifiedTime desc&pageSize=200&spaces=drive`);
  return ((await r.json()).files||[]).map(f=>({fileId:f.id,id:f.appProperties?.productId,name:f.appProperties?.productName||f.name,updatedAt:Number(f.appProperties?.updatedAt)||Date.parse(f.modifiedTime),modifiedTime:f.modifiedTime,size:Number(f.size)||0}));
}

// 드라이브에는 지금 보이는 결과만 올립니다(되돌리기 기록·미리보기는 이 컴퓨터에만 남김) → 용량 절약.
export function trimForDrive(data={}) {
  const slots=Object.fromEntries(Object.entries(data.slots||{}).map(([k,s])=>{
    const vi=s.vIndex??0,cur=(s.versions||[null])[vi]??null;
    const out={...s,versions:vi>0&&cur?[null,cur]:[null],vIndex:vi>0&&cur?1:0,defects:s.defects?{...s.defects,preview:null}:s.defects};
    // 지금 결과(누끼·1차·2차)는 버전 칸에 이미 있으므로 겹치는 사본은 빼고 올립니다(불러올 때 다시 채움).
    if(cur&&typeof cur==='object'){delete out.matte;delete out.stage1;delete out.stage2;delete out.cutout;}
    return [k,out];
  }));
  return {...data,slots};
}

// 드라이브용으로 사진 용량 줄이기: 큰 PNG는 WebP(투명 유지, 품질 95%)로 바꿉니다. 화면에서 차이는 거의 없고 용량은 크게 줄어듭니다.
const packed=new Map();
async function toWebp(url) {
  if(packed.has(url))return packed.get(url);
  const blob=await (await fetch(url)).blob(),bmp=await createImageBitmap(blob);
  const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;c.getContext('2d').drawImage(bmp,0,0);bmp.close?.();
  let out=c.toDataURL('image/webp',.95);
  if(!out.startsWith('data:image/webp')||out.length>=url.length)out=url;
  if(packed.size>40)packed.delete(packed.keys().next().value);
  packed.set(url,out);return out;
}
export async function compactImages(value) {
  if(typeof value==='string')return value.startsWith('data:image/png')&&value.length>100000?toWebp(value):value;
  if(Array.isArray(value)){const out=[];for(const v of value)out.push(await compactImages(v));return out;}
  if(value&&typeof value==='object'){const out={};for(const [k,v] of Object.entries(value))out[k]=k==='preview'?null:await compactImages(v);return out;}
  return value;
}

export async function uploadProduct(folderId,product,existing,onStage=()=>{}) {
  onStage('사진 용량 줄이는 중');
  const body=JSON.stringify({format:FORMAT,version:1,id:product.id,name:product.name,updatedAt:product.updatedAt,data:await compactImages(trimForDrive(product.data))});
  onStage(`올리는 중 (${(body.length/1048576).toFixed(1)}MB)`);
  const meta={name:`${(product.name||'이름 없는 상품').replace(/[\\/:*?"<>|]/g,' ').slice(0,80)}.fashion-studio.json`,
    appProperties:{fashionStudio:'product',productId:product.id,productName:String(product.name||'').slice(0,100),updatedAt:String(product.updatedAt||Date.now())}};
  if(!existing)meta.parents=[folderId];
  // 큰 파일도 올라가도록 '이어 올리기(resumable)' 방식: 1) 자리 만들기 2) 내용 보내기
  const start=await call(existing?`${UPLOAD}/files/${q(existing)}?uploadType=resumable&fields=id`:`${UPLOAD}/files?uploadType=resumable&fields=id`,{
    method:existing?'PATCH':'POST',headers:{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':'application/json'},body:JSON.stringify(meta)});
  const location=start.headers.get('Location');
  if(!location)throw new Error('구글 드라이브 업로드를 시작하지 못했습니다.');
  const r=await call(location,{method:'PUT',headers:{'Content-Type':'application/json'},body});
  return {fileId:(await r.json()).id,bytes:body.length};
}

export async function downloadProduct(fileId) {
  const r=await call(`${API}/files/${q(fileId)}?alt=media`);
  let p;try{p=await r.json();}catch{throw new Error('드라이브 파일을 읽지 못했습니다.');}
  if(p?.format!==FORMAT||!p.id)throw new Error('패션스튜디오 상품 파일이 아닙니다.');
  return {id:p.id,name:p.name,updatedAt:p.updatedAt,data:p.data||{}};
}

// ---- 완성 사진 JPG: 작업 폴더 / 상품 이름 폴더 / "01 정면.jpg" ----
const safeName=s=>String(s||'').replace(/[\\/:*?"<>|]/g,' ').trim().slice(0,80)||'이름 없는 상품';
// 상품마다 사진 폴더 1개(appProperties.productId로 찾음). 상품 이름이 바뀌면 폴더 이름도 맞춥니다.
export async function productPhotoFolder(parentId,product) {
  const query=`'${esc(parentId)}' in parents and mimeType='${FOLDER_MIME}' and appProperties has { key='fashionStudio' and value='photos' } and appProperties has { key='productId' and value='${esc(product.id)}' } and trashed=false`;
  const r=await call(`${API}/files?q=${q(query)}&fields=${q('files(id,name)')}&spaces=drive`);
  const f=((await r.json()).files||[])[0],name=safeName(product.name);
  if(f){
    if(f.name!==name)await call(`${API}/files/${q(f.id)}?fields=id`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
    return {id:f.id,name};
  }
  const c=await call(`${API}/files?fields=id,name`,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name,mimeType:FOLDER_MIME,parents:[parentId],appProperties:{fashionStudio:'photos',productId:product.id}})});
  return c.json();
}
async function uploadBlob(meta,blob,existing) {
  const start=await call(existing?`${UPLOAD}/files/${q(existing)}?uploadType=resumable&fields=id`:`${UPLOAD}/files?uploadType=resumable&fields=id`,{
    method:existing?'PATCH':'POST',headers:{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':blob.type},body:JSON.stringify(meta)});
  const location=start.headers.get('Location');
  if(!location)throw new Error('구글 드라이브 업로드를 시작하지 못했습니다.');
  const r=await call(location,{method:'PUT',headers:{'Content-Type':blob.type},body:blob});
  return (await r.json()).id;
}
// 흰 배경 JPG, 2MB 이하(품질부터 낮추고, 그래도 크면 크기를 줄임)
export async function finalJpg(src,maxBytes=2*1024*1024) {
  const bmp=await createImageBitmap(await (await fetch(src)).blob());
  let w=bmp.width,h=bmp.height,blob;
  for(let round=0;round<8;round++){
    const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');
    g.fillStyle='#fff';g.fillRect(0,0,w,h);g.drawImage(bmp,0,0,w,h);
    for(const quality of [.92,.86,.8]){
      blob=await new Promise(res=>c.toBlob(res,'image/jpeg',quality));
      if(blob&&blob.size<=maxBytes){bmp.close?.();return blob;}
    }
    w=Math.round(w*.85);h=Math.round(h*.85);
  }
  bmp.close?.();return blob;
}
// 사진 내용이 같은지 알아보는 짧은 지문(같으면 다시 올리지 않음)
const fingerprint=s=>{let h=2166136261;const step=Math.max(1,Math.floor(s.length/4000));for(let i=0;i<s.length;i+=step){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return `${s.length}-${(h>>>0).toString(36)}`;};

// photos: [{slotId,label,image}] (상세페이지 순서). 바뀐 사진만 올리고, 이제 없는 컷의 사진은 휴지통으로.
export async function uploadFinalPhotos(parentId,product,photos,onStage=()=>{}) {
  const folder=await productPhotoFolder(parentId,product);
  const query=`'${esc(folder.id)}' in parents and appProperties has { key='fashionStudio' and value='photo' } and trashed=false`;
  const existing=((await (await call(`${API}/files?q=${q(query)}&fields=${q('files(id,name,appProperties)')}&pageSize=200&spaces=drive`)).json()).files||[]);
  const bySlot=new Map(existing.map(f=>[f.appProperties?.slotId,f]));
  let uploaded=0,kept=0,removed=0;
  for(let i=0;i<photos.length;i++){
    const p=photos[i],name=`${String(i+1).padStart(2,'0')} ${safeName(p.label)}.jpg`,fp=fingerprint(p.image),old=bySlot.get(p.slotId);
    bySlot.delete(p.slotId);
    if(old&&old.appProperties?.fp===fp&&old.name===name){kept++;continue;}
    onStage(`완성 사진 ${i+1}/${photos.length} 올리는 중`);
    const meta={name,mimeType:'image/jpeg',appProperties:{fashionStudio:'photo',productId:product.id,slotId:p.slotId,fp}};
    if(!old)meta.parents=[folder.id];
    await uploadBlob(meta,await finalJpg(p.image),old?.id);uploaded++;
  }
  for(const f of bySlot.values()){await call(`${API}/files/${q(f.id)}?fields=id`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})});removed++;}
  return {folder,uploaded,kept,removed};
}
