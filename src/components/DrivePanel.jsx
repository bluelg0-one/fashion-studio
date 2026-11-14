import {useEffect, useRef, useState} from 'react';
import {Cost} from './Cost.jsx';
import {getProduct, saveProduct} from '../utils/productStore.js';
import {signIn, signOut, hasToken, savedFolder, rememberFolder, listFolders, createFolder, checkFolder, listDriveProducts, uploadProduct, downloadProduct, uploadFinalPhotos} from '../utils/googleDrive.js';
import {shopeePhotos} from '../utils/shopeeExport.js';

// 드라이브에 JPG로 올릴 완성 사진: 상세페이지 순서, 보정을 마친 컷만
const finalPhotos=data=>shopeePhotos(data?.slots||{},Boolean(data?.fitEnabled)).filter(s=>s.cutout||s.stage1).map(s=>({slotId:s.id,label:s.label,image:s.image}));

// 상품별로 '마지막으로 드라이브와 맞춘 시점'을 이 컴퓨터에 기억 → 다른 컴퓨터가 그 뒤에 저장했는지 알 수 있음.
const SYNC_KEY='gdriveSync';
const syncMap=()=>{try{return JSON.parse(localStorage.getItem(SYNC_KEY)||'{}');}catch{return {};}};
const setSync=(id,at)=>{try{localStorage.setItem(SYNC_KEY,JSON.stringify({...syncMap(),[id]:at}));localStorage.setItem(SYNC_KEY+'Local',JSON.stringify({...localMap(),[id]:Date.now()}));}catch{}};
// 드라이브와 맞춘 시점(이 컴퓨터 시계) — 그 뒤 이 컴퓨터에 저장된 적이 있으면 '안 올라간 변경'
const localMap=()=>{try{return JSON.parse(localStorage.getItem(SYNC_KEY+'Local')||'{}');}catch{return {};}};
const AUTO_KEY='gdriveAuto';
const when=t=>t?new Date(t).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const mb=b=>`${(b/1048576).toFixed(1)}MB`;

export default function DrivePanel({clientId,productId,localSavedAt,busy,task,setStep,flush,onLoaded}) {
  const [folder,setFolder]=useState(savedFolder),[connected,setConnected]=useState(false),[choices,setChoices]=useState(null);
  const [files,setFiles]=useState(null),[pick,setPick]=useState(''),[auto,setAuto]=useState(()=>{try{return localStorage.getItem(AUTO_KEY)!=='off';}catch{return true;}});
  const [note,setNote]=useState(''),[localUpdated,setLocalUpdated]=useState(0),autoTimer=useRef(null),uploading=useRef(false);
  useEffect(()=>{if(productId)getProduct(productId).then(p=>setLocalUpdated(p?.updatedAt||0)).catch(()=>{});},[productId,localSavedAt,note]);

  async function connect() {
    await task(async()=>{
      setStep('구글 로그인 창에서 계정을 고르고 허용을 눌러 주세요');
      await signIn(clientId);setConnected(true);
      if(folder){
        try {const f=await checkFolder(folder.id);setFolder(f);rememberFolder(f);setStep(`구글 드라이브 연결됨 · 작업 폴더 ‘${f.name}’`);return;}
        catch(e){if(!e.notFound)throw e;rememberFolder(null);setFolder(null);}
      }
      await chooseFolder();
    });
  }
  // 작업 폴더 고르기: 이 앱이 만든 폴더만 보입니다. 없으면 이름을 정해 새로 만듭니다.
  async function chooseFolder() {
    const list=await listFolders();
    if(list.length===1){useFolder(list[0]);return;}
    if(list.length>1){setChoices(list);setStep('작업할 구글 드라이브 폴더를 고르세요.');return;}
    await makeFolder();
  }
  async function makeFolder() {
    const name=window.prompt('구글 드라이브에 만들 작업 폴더 이름을 정하세요.\n앱은 이 폴더 안에서만 저장·불러오기를 합니다.','패션스튜디오 상품');
    if(name===null){setStep('폴더 만들기를 취소했습니다.');return;}
    const f=await createFolder(name);useFolder(f);
  }
  function useFolder(f) {
    rememberFolder(f);setFolder(f);setChoices(null);setFiles(null);
    setStep(`작업 폴더 ‘${f.name}’에 연결했습니다. 구글 드라이브의 ‘내 드라이브’에 있으며, 원하는 위치로 옮겨도 됩니다.`);
  }

  async function upload(manual) {
    if(!productId||!folder||uploading.current)return;
    uploading.current=true;
    try {
      const local=await getProduct(productId);if(!local)return;
      const remote=(await listDriveProducts(folder.id)).find(f=>f.id===productId);
      const base=syncMap()[productId];
      if(remote&&remote.updatedAt!==base){
        // 다른 컴퓨터가 이 상품을 그 뒤에 저장함 → 덮어쓰기 전에 확인
        if(!manual){setNote(`⚠ 다른 컴퓨터에서 ${when(remote.updatedAt)}에 저장한 ‘${remote.name}’이(가) 있어 자동 저장을 멈췄습니다. ‘드라이브에서 불러오기’ 또는 ‘드라이브에 저장’을 눌러 정하세요.`);return;}
        if(!window.confirm(`드라이브에 다른 컴퓨터에서 ${when(remote.updatedAt)}에 저장한 ‘${remote.name}’이(가) 있습니다.\n이 컴퓨터의 내용으로 덮어쓸까요?`))return;
      }
      const stamp=Date.now();
      if(manual)setStep(`구글 드라이브에 ‘${local.name}’ 올리는 중`);
      setNote(`☁️ 드라이브에 저장 중… (창을 닫지 마세요)`);
      const {bytes}=await uploadProduct(folder.id,{...local,updatedAt:stamp},remote?.fileId,m=>{setNote(`☁️ 드라이브 저장: ${m}… (창을 닫지 마세요)`);if(manual)setStep(`구글 드라이브 저장: ${m}`);});
      setSync(productId,stamp);setFiles(null);
      // 완성 사진 JPG(바뀐 것만)를 상품 이름 폴더에
      const photos=finalPhotos(local.data);
      const r=await uploadFinalPhotos(folder.id,local,photos,m=>{setNote(`☁️ 드라이브 저장: ${m}… (창을 닫지 마세요)`);if(manual)setStep(`구글 드라이브 저장: ${m}`);});
      const pics=`완성 사진 ${photos.length}장${r.uploaded?` (새로 올림 ${r.uploaded})`:' (바뀐 사진 없음)'}${r.removed?` · 빠진 컷 ${r.removed}장 휴지통`:''}`;
      setNote(`☁️ ${when(stamp)} 드라이브에 저장됨 · 작업 파일 ${mb(bytes)} · ${pics} → ‘${folder.name} / ${r.folder.name}’`);
      if(manual)setStep(`구글 드라이브에 저장했습니다 · 작업 파일 ${mb(bytes)} · ${pics} (폴더: ${folder.name} / ${r.folder.name})`);
    } catch(e) {
      if(e.expired)setConnected(false);
      if(manual)throw e;else setNote(`⚠ 드라이브 자동 저장 실패: ${e.message}`);
    } finally {uploading.current=false;}
  }

  // 이 컴퓨터에 자동 저장된 뒤 1분 동안 더 바뀌지 않으면 드라이브에도 저장(연결돼 있는 동안).
  useEffect(()=>{
    clearTimeout(autoTimer.current);
    if(!auto||!folder||!localSavedAt||!productId)return;
    if(!hasToken()){if(connected)setConnected(false);return;}
    autoTimer.current=setTimeout(()=>upload(false),60000);
    return()=>clearTimeout(autoTimer.current);
  },[localSavedAt,auto,folder,productId]);

  async function openList() {
    await task(async()=>{
      setStep('드라이브의 상품 목록을 읽는 중');
      const list=await listDriveProducts(folder.id);setFiles(list);setPick(list[0]?.fileId||'');
      setStep(list.length?`드라이브에 상품 ${list.length}개가 있습니다. 골라서 ‘불러오기’를 누르세요.`:'드라이브 폴더에 아직 저장된 상품이 없습니다.');
    });
  }
  async function load() {
    const f=files?.find(x=>x.fileId===pick);if(!f)return;
    await task(async()=>{
      await flush(); // 지금 화면의 상품을 먼저 이 컴퓨터에 저장
      const local=await getProduct(f.id);
      if(local&&!window.confirm(`이 컴퓨터에도 ‘${local.name}’이(가) 있습니다.\n드라이브 저장본(${when(f.updatedAt)})으로 바꿀까요? 이 컴퓨터의 내용은 드라이브 저장본으로 대체됩니다.`))return;
      setStep(`드라이브에서 ‘${f.name}’ 내려받는 중 (${mb(f.size)})`);
      const p=await downloadProduct(f.fileId);
      await saveProduct({id:p.id,name:p.name,data:p.data});
      setSync(p.id,f.updatedAt);
      await onLoaded(p.id);
      setFiles(null);setNote(`☁️ ${when(f.updatedAt)} 저장본을 불러옴`);
      setStep(`드라이브에서 ‘${p.name}’을(를) 불러왔습니다. 이전/다시 적용 기록은 저장한 컴퓨터에만 있습니다.`);
    });
  }
  function toggleAuto(v){setAuto(v);try{localStorage.setItem(AUTO_KEY,v?'on':'off');}catch{}}
  function disconnect() {
    if(!window.confirm('이 컴퓨터에서 구글 드라이브 연결을 끊을까요? 드라이브에 저장된 상품은 그대로 남습니다.'))return;
    signOut();rememberFolder(null);setFolder(null);setConnected(false);setFiles(null);setNote('');
  }

  const live=connected&&hasToken();
  // 지금 상품의 드라이브 상태: 마지막으로 올린 시각과, 그 뒤 이 컴퓨터에서 바뀌었는지
  const synced=productId?syncMap()[productId]:null,changed=Boolean(synced&&localUpdated&&localUpdated>(localMap()[productId]||0));
  return <section className="drive-panel" aria-label="구글 드라이브">
    <h3>☁️ 구글 드라이브 저장 <Cost k="gdrive"/></h3>
    {!clientId?<p className="slot-note">구글 드라이브 연결 설정이 아직 없습니다(관리자 설정 필요).</p>:<>
      {folder&&<p className="drive-folder">📁 작업 폴더: <b>{folder.name}</b> {live?<span className="ok-tag">연결됨</span>:<span className="off-tag">로그인 필요</span>}</p>}
      <div className="btn-row">
        {!live&&<button type="button" className={folder?'':'primary'} disabled={busy} onClick={connect}>{folder?'구글 드라이브 다시 연결':'구글 드라이브 연결'}</button>}
        {live&&folder&&<>
          <button type="button" className="primary" disabled={busy||!productId} onClick={()=>task(()=>upload(true))}>이 상품 드라이브에 저장</button>
          <button type="button" disabled={busy} onClick={openList}>드라이브에서 불러오기</button>
          <label className="check"><input type="checkbox" aria-label="드라이브 자동 저장" checked={auto} onChange={e=>toggleAuto(e.target.checked)}/>바뀐 뒤 1분 지나면 자동 저장</label>
        </>}
        {live&&!folder&&!choices&&<button type="button" disabled={busy} onClick={()=>task(chooseFolder)}>작업 폴더 정하기</button>}
        {folder&&<button type="button" className="subtle" disabled={busy} onClick={disconnect}>연결 끊기</button>}
      </div>
      {choices&&<div className="btn-row"><label>작업 폴더 고르기<select aria-label="작업 폴더 고르기" onChange={e=>{const f=choices.find(c=>c.id===e.target.value);if(f)useFolder(f);}} defaultValue=""><option value="" disabled>폴더를 고르세요</option>{choices.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button type="button" disabled={busy} onClick={()=>task(makeFolder)}>새 폴더 만들기</button></div>}
      {files&&(files.length?<div className="btn-row"><label>드라이브의 상품<select aria-label="드라이브 상품 선택" value={pick} onChange={e=>setPick(e.target.value)}>{files.map(f=><option key={f.fileId} value={f.fileId}>{f.name} · {when(f.updatedAt)} · {mb(f.size)}</option>)}</select></label>
        <button type="button" className="primary" disabled={busy||!pick} onClick={load}>불러오기</button><button type="button" className="subtle" onClick={()=>setFiles(null)}>닫기</button></div>
        :<p className="slot-note">드라이브 폴더에 저장된 상품이 없습니다.</p>)}
      {folder&&productId&&<p className={`drive-state${!synced||changed?' warn':''}`}>{!synced?'이 상품은 아직 드라이브에 저장된 적이 없습니다.':changed?`드라이브 저장본(${when(synced)}) 이후 바뀐 내용이 아직 올라가지 않았습니다.${live&&auto?' 1분 뒤 자동 저장됩니다.':live?' ‘이 상품 드라이브에 저장’을 누르세요.':' 다시 연결한 뒤 저장하세요.'}`:`✅ 드라이브에 최신 내용 저장됨 (${when(synced)})`}</p>}
      {note&&<p className="slot-note drive-note">{note}</p>}
      <p className="slot-note">저장하면 작업 폴더에 <b>작업 파일</b>(다른 컴퓨터에서 이어서 작업용)과, 상품 이름 폴더에 <b>완성 사진 JPG</b>(보정을 마친 컷, 흰 배경, 장당 2MB 이하)가 함께 저장됩니다. 앱은 위 작업 폴더와 앱이 만든 파일만 볼 수 있고, 구글 드라이브의 다른 파일은 볼 수 없습니다. 다른 컴퓨터에서도 같은 구글 계정으로 연결하면 같은 폴더가 자동으로 잡힙니다. 로그인은 약 1시간 유지되며, 지나면 ‘다시 연결’을 누르세요.</p>
    </>}
  </section>;
}
