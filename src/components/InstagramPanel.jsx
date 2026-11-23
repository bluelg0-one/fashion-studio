import {useEffect, useState} from 'react';
import {IG_IMAGE, IG_CAPTION_MAX, IG_HASHTAG_MAX, instagramPhotos, instagramImages, instagramPackage, captionOf, countHashtags, rememberDefaults, blobToDataUrl} from '../utils/instagramExport.js';
import {downloadBlob} from '../utils/studioImages.js';

const PASSWORD_KEY='fashion-studio-instagram-password';
const MISSING={token:'인스타그램 액세스 토큰',storage:'사진 임시 저장소(Vercel Blob)',password:'게시 비밀번호'};

async function igApi(action,body) {
  const response=await fetch(`/api/instagram?action=${action}`,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  let result;
  try {result=await response.json();} catch {throw new Error(`서버 응답을 읽을 수 없습니다 (${response.status}). 잠시 후 다시 시도하세요.`);}
  if(!response.ok)throw new Error(result.error||'서버 요청에 실패했습니다.');
  return result;
}

export default function InstagramPanel({instagram,setInstagram,slots,fitEnabled,rows,texts,task,setStep,productName}) {
  const [status,setStatus]=useState(null),[account,setAccount]=useState(null);
  const [password,setPassword]=useState(()=>{try{return localStorage.getItem(PASSWORD_KEY)||'';}catch{return '';}});
  useEffect(()=>{igApi('status').then(setStatus).catch(()=>setStatus({ready:false,token:false,storage:false,password:false}));},[]);
  const set=patch=>setInstagram(current=>({...current,...patch}));
  const field=(key,label,props={})=><label>{label}<input aria-label={`인스타 ${label}`} maxLength={120} value={instagram[key]||''} onChange={e=>set({[key]:e.target.value})} {...props}/></label>;
  const all=instagramPhotos(slots,fitEnabled),photos=all.slice(0,IG_IMAGE.maxCount);
  const caption=captionOf(instagram),tags=countHashtags(caption);
  const captionOk=caption.length<=IG_CAPTION_MAX&&tags<=IG_HASHTAG_MAX;
  const missing=status?Object.keys(MISSING).filter(key=>!status[key]):[];
  const savePassword=value=>{setPassword(value);try{localStorage.setItem(PASSWORD_KEY,value);}catch{}};
  const sizes=rows.map(r=>String(r.size||'').trim()).filter(Boolean).join(' / ');

  function importFromPage() {set({title:texts.headline?.trim()||productName||instagram.title,size:sizes||instagram.size});}
  async function copyCaption() {
    await task(async()=>{
      try {await navigator.clipboard.writeText(caption);} catch {throw new Error('캡션을 복사하지 못했습니다. 캡션 칸에서 직접 선택해 복사하세요.');}
      setStep('캡션을 복사했습니다. 인스타그램 앱의 문구 입력 칸에 붙여 넣으세요.');
    });
  }
  async function download() {
    await task(async()=>{
      setStep('인스타그램용 사진(4:5 · JPG)과 캡션을 묶는 중');
      const {blob,count,filename}=await instagramPackage({name:productName,slots,fitEnabled,instagram});
      downloadBlob(blob,filename);rememberDefaults(instagram);
      setStep(`인스타그램 묶음 저장 완료 · 사진 ${count}장 + caption.txt`);
    });
  }
  async function check() {
    await task(async()=>{
      setStep('인스타그램 연결 확인 중');
      const result=await igApi('check',{password});
      setAccount(result);
      setStep(`@${result.username} 계정에 연결돼 있습니다.`);
    });
  }
  async function publish() {
    const again=instagram.posted?`이 상품은 ${new Date(instagram.posted.at).toLocaleString('ko-KR')}에 이미 게시했습니다. 한 번 더 올리면 같은 게시물이 두 개가 됩니다.\n\n`:'';
    if(!window.confirm(`${again}사진 ${photos.length}장과 캡션을 인스타그램${account?.username?` @${account.username}`:''}에 지금 바로 게시합니다.\n게시한 뒤에는 인스타그램 앱에서만 수정·삭제할 수 있습니다. 계속할까요?`))return;
    await task(async()=>{
      setStep('사진을 인스타그램 규격(4:5 · JPG)으로 바꾸는 중');
      const blobs=await instagramImages({slots,fitEnabled,fit:instagram.fit}),urls=[];
      for(let i=0;i<blobs.length;i++){
        setStep(`${i+1}/${blobs.length} · 사진 올리는 중`);
        urls.push((await igApi('upload',{password,image:await blobToDataUrl(blobs[i])})).url);
      }
      setStep('인스타그램에 게시하는 중 (최대 1분)');
      const result=await igApi('publish',{password,caption,urls});
      set({posted:{at:Date.now(),permalink:result.permalink||'',username:result.username||''}});
      rememberDefaults(instagram);
      setStep(`인스타그램 게시 완료 · 사진 ${result.count}장${result.username?` · @${result.username}`:''}`);
    });
  }

  return <section className="editor-section instagram-panel"><h2>06 · 인스타그램 게시</h2>
    <p>보정한 사진을 인스타그램 규격(세로 4:5 · JPG)으로 바꾸고, 같은 틀의 캡션을 만들어 게시합니다.</p>
    {instagram.posted&&<p className="review-note">이 상품은 {new Date(instagram.posted.at).toLocaleString('ko-KR')}에 게시했습니다.{instagram.posted.permalink&&<> <a href={instagram.posted.permalink} target="_blank" rel="noreferrer">게시물 보기</a></>}</p>}
    <button type="button" onClick={importFromPage}>상세페이지의 제목·사이즈 가져오기</button>
    {field('title','상품명',{placeholder:'레이어드 골지 라운드 긴팔티'})}
    <div className="instagram-fields">
      {field('color','컬러',{placeholder:'차콜'})}
      {field('size','사이즈',{placeholder:'FREE'})}
      {field('material','소재',{placeholder:'면95 폴리5'})}
      {field('price','가격(원)',{placeholder:'6000',inputMode:'numeric'})}
      {field('shipping','배송',{placeholder:'무료배송'})}
      {field('quantity','수량(장)',{placeholder:'5',inputMode:'numeric'})}
    </div>
    <label>추가 문구 (선택)<textarea aria-label="인스타 추가 문구" maxLength={600} value={instagram.note||''} onChange={e=>set({note:e.target.value})} placeholder="이너 일체형인지, 두께감·비침 등 확인한 내용만 적어 주세요."/></label>
    <label className="check"><input type="checkbox" aria-label="DM 구매 안내 넣기" checked={Boolean(instagram.dm)} onChange={e=>set({dm:e.target.checked})}/>‘구매·문의는 DM’ 안내 넣기</label>
    <label className="check"><input type="checkbox" aria-label="프로필 링크 구매 안내 넣기" checked={Boolean(instagram.profileLink)} onChange={e=>set({profileLink:e.target.checked})}/>‘프로필 링크에서도 구매 가능’ 안내 넣기 (이 상품이 스마트스토어에 있을 때만)</label>
    {field('hashtags','해시태그',{maxLength:600,placeholder:'#여성의류 #데일리룩'})}
    <label>캡션 <small>{caption.length}/{IG_CAPTION_MAX}자 · 해시태그 {tags}/{IG_HASHTAG_MAX}개{instagram.captionEdited?' · 직접 수정함':''}</small>
      <textarea className="instagram-caption" aria-label="인스타 캡션" value={caption} onChange={e=>set({caption:e.target.value,captionEdited:true})}/></label>
    {instagram.captionEdited&&<><p className="slot-note">캡션을 직접 고쳤기 때문에 위 입력칸을 바꿔도 캡션은 그대로입니다.</p><button type="button" onClick={()=>set({caption:'',captionEdited:false})}>입력값으로 캡션 다시 만들기</button></>}
    {!captionOk&&<p className="review-note">캡션은 {IG_CAPTION_MAX}자, 해시태그는 {IG_HASHTAG_MAX}개까지만 게시할 수 있습니다.</p>}
    <label>사진 맞춤<select aria-label="인스타 사진 맞춤" value={instagram.fit} onChange={e=>set({fit:e.target.value})}><option value="contain">흰 여백을 두고 옷 전체 보이기</option><option value="cover">여백 없이 꽉 채우기 (가장자리가 잘림)</option></select></label>
    <div className={`instagram-photos ${instagram.fit==='cover'?'cover':''}`} aria-label="인스타 사진 순서">
      {photos.map((s,i)=><figure key={s.id}><img src={s.image} alt={s.label}/><figcaption>{i+1}. {s.label}</figcaption></figure>)}
    </div>
    <p className="slot-note">사진 {photos.length}장 · 대표 → 모델컷 → 디테일 순서 · 첫 사진이 피드에 보입니다{all.length>IG_IMAGE.maxCount?` · 한 게시물은 최대 ${IG_IMAGE.maxCount}장이라 ${all.length-IG_IMAGE.maxCount}장은 빠집니다`:''}</p>
    <div className="instagram-actions">
      <button type="button" disabled={!caption} onClick={copyCaption}>캡션 복사</button>
      <button type="button" disabled={!photos.length} onClick={download}>사진·캡션 묶음 다운로드 (ZIP)</button>
    </div>
    <h3>인스타그램에 바로 게시</h3>
    {!status?<p className="slot-note">연결 상태를 확인하는 중…</p>:status.ready?<>
      <label>게시 비밀번호<input type="password" aria-label="인스타 게시 비밀번호" autoComplete="off" value={password} onChange={e=>savePassword(e.target.value)}/></label>
      <p className="slot-note">다른 사람이 이 주소로 게시하지 못하게 막는 비밀번호입니다. 이 브라우저에만 저장됩니다.</p>
      {account&&<p className="slot-note">연결된 계정: @{account.username}{account.limit?` · 최근 24시간 게시 ${account.used??0}/${account.limit}회`:''}</p>}
      <div className="instagram-actions">
        <button type="button" disabled={!password} onClick={check}>연결 확인</button>
        <button type="button" className="primary" disabled={!password||!photos.length||!captionOk} onClick={publish}>인스타그램에 지금 게시</button>
      </div>
    </>:<p className="review-note">아직 바로 게시를 쓸 수 없습니다. 서버에 {missing.map(key=>MISSING[key]).join(', ')} 설정이 필요합니다. 그 전에는 위의 ‘사진·캡션 묶음 다운로드’로 받아 인스타그램 앱에서 직접 올릴 수 있습니다.</p>}
  </section>;
}
