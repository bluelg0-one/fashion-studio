import {useEffect, useRef, useState} from 'react';
import './AutoStudio.css';
import {cutoutBounds} from '../utils/detailCrops.js';
import {GARMENTS, initialSlots, newSizeRow, sizeFields, guideUrl, documentBlocks, documentHtml} from '../utils/studioDocument.js';
import {RETOUCH_PRESETS, DEFAULT_RETOUCH, MANNEQUIN_MODES, lowResolution, retouchPrompt} from '../utils/retouchPresets.js';
import {listProducts, getProduct, saveProduct, deleteProduct, newProductId} from '../utils/productStore.js';
import ShopeePanel from './ShopeePanel.jsx';
import {dominantLab, colorShift, applyShift, labCss} from '../utils/colorMatch.js';
import InstagramPanel from './InstagramPanel.jsx';
import {defaultInstagram} from '../utils/instagramExport.js';
import {readPhoto, imageCanvas, medianLight, whitePhoto, download, downloadBlob, renderDocument, compressPng} from '../utils/studioImages.js';

const defaultTexts=()=>({headline:'',description:'',product:'',fitTitle:'Fit guide',fitDescription:'',detailTitle:'Detail',sizeTitle:'Size',sizeNote:'단위: cm · 단면 기준\n측정 위치와 방법에 따라 실측값에 차이가 있을 수 있습니다.'});
const defaultShopee=()=>({title:'',description:'',includeSizeChart:true});

async function api(action,body) {
  const response=await fetch(`/api/studio?action=${action}`,{
    method:body?'POST':'GET', headers:body?{'Content-Type':'application/json'}:undefined,
    body:body?JSON.stringify(body):undefined,
  });
  let result;
  try {result=await response.json();} catch {throw new Error(`서버 응답을 읽을 수 없습니다 (${response.status}). 잠시 후 다시 시도하세요.`);}
  if(!response.ok)throw new Error(result.error||'서버 요청에 실패했습니다.');
  return result;
}

function RetouchSettings({value,onChange,status,prefix='',title='누끼·보정 설정'}) {
  const set=patch=>onChange({...value,...patch});
  const togglePreset=id=>set({presets:value.presets.includes(id)?value.presets.filter(p=>p!==id):[...value.presets,id]});
  const prompted=value.presets.length>0||value.custom.trim().length>0;
  const special=value.mannequin==='ghost'||value.mannequin==='flatlay';
  const small=lowResolution(value,retouchPrompt(value,value.engine!=='openai'));
  return <div className="retouch-settings">
    <h3>{title} <small>Photoroom</small></h3>
    <label className="check"><input type="checkbox" checked readOnly disabled/>배경 누끼 (항상 적용 · 흰 배경으로 출력)</label>
    <label className="check"><input type="checkbox" aria-label={`${prefix}중앙 정렬`} checked={value.center} onChange={e=>set({center:e.target.checked})}/>옷을 사진 중앙에 정렬</label>
    <label className="check"><input type="checkbox" aria-label={`${prefix}조명 보정`} checked={value.lighting} onChange={e=>set({lighting:e.target.checked})}/>조명 자연스럽게 보정 (색상·채도는 원본 유지)</label>
    <label className="check"><input type="checkbox" aria-label={`${prefix}AI 그림자`} checked={Boolean(value.shadow)} onChange={e=>set({shadow:e.target.checked})}/>바닥에 자연스러운 그림자 넣기 (AI 그림자)</label>
    <p className="slot-note">여기까지는 원본 옷을 그대로 두고 배경만 정리합니다. 원본 해상도(최대 2400px)를 유지하고 옷 테두리는 HD로 땁니다. 그림자는 마네킹 사진에서는 어색할 수 있어 기본으로 꺼 두었습니다.</p>
    <h4>마네킹 처리</h4>
    <select aria-label={`${prefix}마네킹 처리`} value={value.mannequin||'keep'} onChange={e=>set({mannequin:e.target.value})}>{MANNEQUIN_MODES.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select>
    {special&&<p className="review-note">AI가 옷을 새로 그리는 방식입니다. 깔끔해지지만 없던 디테일(예: 목 안쪽 라벨)이 생기거나 원단 질감이 달라질 수 있으니 원본과 꼭 비교하세요. 이 모드에서는 아래 기본 프롬프트·다림질·그림자는 적용되지 않습니다.</p>}
    <h4>기본 프롬프트 (선택)</h4>
    {RETOUCH_PRESETS.map(p=><label key={p.id} className="check"><input type="checkbox" aria-label={prefix+p.label} checked={value.presets.includes(p.id)} onChange={()=>togglePreset(p.id)}/>{p.label}</label>)}
    <label>직접 입력 프롬프트<textarea aria-label={`${prefix}직접 입력 프롬프트`} maxLength={1000} value={value.custom} placeholder="예: 목 부분 라벨이 보이지 않게 정리해 주세요." onChange={e=>set({custom:e.target.value})}/></label>
    {prompted&&<>
      <label>프롬프트 보정 엔진<select aria-label={`${prefix}프롬프트 보정 엔진`} value={value.engine} onChange={e=>set({engine:e.target.value})}>
        <option value="photoroom">Photoroom AI 편집</option>
        <option value="openai" disabled={status&&!status.openai}>OpenAI 이미지 편집{status&&!status.openai?' (키 없음)':''}</option>
      </select></label>
      <p className="review-note">{value.presets.includes('iron')&&'구김 펴기는 원본 해상도(최대 2K)를 유지합니다. '}Photoroom은 사진 1장당 한 번만 요청합니다(선택 항목 수와 관계없이 같은 요금). 프롬프트 보정은 AI가 사진을 새로 그리는 방식이라 원단 질감·무늬가 원본과 달라질 수 있습니다. 결과를 ‘원본과 비교’로 꼭 확인하세요. 실패해도 누끼 결과는 유지됩니다.</p>
    </>}
    {small&&<p className="review-note low-res">⚠ 이 설정은 결과 사진이 약 1024px(1K)로 작아집니다. 선명도가 중요하면 마네킹 그대로 + 구김 펴기만 쓰세요.</p>}
  </div>;
}

const MAX_VERSIONS=8;
// 버전 이동은 브라우저에 저장된 결과만 바꾸므로 API 호출·과금이 없습니다.
function VersionBar({slot,onVersion}) {
  const versions=slot.versions||[null],index=slot.vIndex??0;
  return <div className="version-bar" aria-label={`${slot.id} 버전`}>
    <button type="button" aria-label={`${slot.id} 이전으로 되돌리기`} disabled={index<=0} onClick={()=>onVersion(slot.id,index-1)}>↶ 이전으로</button>
    <span>{index===0?'원본':`보정 ${index}`} <small>({index+1}/{versions.length})</small></span>
    <button type="button" aria-label={`${slot.id} 다시 적용`} disabled={index>=versions.length-1} onClick={()=>onVersion(slot.id,index+1)}>다시 적용 ↷</button>
    <small className="version-note">되돌리기·다시 적용은 무료입니다</small>
  </div>;
}

function PhotoSlot({slot,busy,onUpload,onPatch,onProcess,onRemove,onVersion,onSave,retouchDefault,status,colorRef,onColorRef,onColorMatch}) {
  function paste(event) {
    const file=Array.from(event.clipboardData?.files||[]).find(f=>f.type.startsWith('image/'));
    if(file){event.preventDefault();onUpload(slot.id,file);}
  }
  const name=slot.label||'사진';
  return <section className="photo-slot" data-slot={slot.id}>
    <div className="slot-heading"><strong>{slot.id==='hero'?'01 · 대표 사진':name}</strong>
      {slot.id!=='hero'&&<label className="check"><input type="checkbox" checked={slot.enabled} onChange={e=>onPatch(slot.id,{enabled:e.target.checked})}/>상세페이지에 포함</label>}
    </div>
    <label>사진 제목<input aria-label={`${slot.id} 사진 제목`} value={slot.label} maxLength={100} onChange={e=>onPatch(slot.id,{label:e.target.value})}/></label>
    <div className="paste-zone" tabIndex={busy?-1:0} onPaste={busy?undefined:paste} aria-label={`${name} 이미지 붙여넣기`}>
      {slot.image?<img src={slot.image} alt={name}/>:<p>사진을 선택하거나 여기를 클릭한 뒤<br/>Ctrl + V로 이미지를 붙여넣으세요.</p>}
    </div>
    {slot.source&&<VersionBar slot={slot} onVersion={onVersion}/>}
    {slot.source&&<details className="slot-retouch"><summary>이 사진 보정 설정{slot.retouch?' · 개별 설정 사용 중':' · 기본 설정 사용 중'}</summary>
      <label className="check"><input type="checkbox" aria-label={`${slot.id} 개별 설정 사용`} checked={Boolean(slot.retouch)} onChange={e=>onPatch(slot.id,{retouch:e.target.checked?{...retouchDefault}:null})}/>이 사진만 따로 설정하기</label>
      {slot.retouch?<RetouchSettings value={slot.retouch} onChange={value=>onPatch(slot.id,{retouch:value})} status={status} prefix={`${slot.id} `} title="이 사진 보정 설정"/>:<p className="slot-note">위쪽 ‘누끼·보정 설정(모든 사진 기본값)’을 따릅니다.</p>}
    </details>}
    {slot.source&&<details className="source-compare"><summary>원본과 비교</summary><img src={slot.source} alt={`${name} 원본`}/></details>}
    <div className="slot-actions">
      <label className="file-button">사진 {slot.image?'교체':'선택'}<input aria-label={`${slot.id} 사진 선택`} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)onUpload(slot.id,file);e.target.value='';}}/></label>
      {slot.source&&<button type="button" onClick={()=>onProcess(slot.id)}>이 사진 누끼·보정</button>}
      {slot.cutout&&colorRef?.slotId!==slot.id&&<button type="button" onClick={()=>onColorRef(slot.id)}>🎨 이 컷 색감을 기준으로</button>}
      {slot.cutout&&colorRef&&colorRef.slotId!==slot.id&&<button type="button" onClick={()=>onColorMatch([slot.id])}>기준 색감으로 맞추기</button>}
      {colorRef?.slotId===slot.id&&<span className="color-badge"><i style={{background:labCss(colorRef.lab)}}/>색감 기준 컷</span>}
      {slot.image&&<><button type="button" onClick={()=>onSave(slot.id)}>개별 PNG 저장</button><button type="button" className="subtle" onClick={()=>onRemove(slot.id)}>사진 삭제</button></>}
    </div>
    {slot.status==='raw'&&<p className="slot-note">업로드한 사진입니다. 배경 제거·주름 보정은 ‘이 사진 누끼·보정’을 눌러 적용하세요.</p>}
    {slot.status==='done'&&<p className="slot-note">흰 배경 적용 · 색상과 무늬를 원본과 비교해 주세요.</p>}
  </section>;
}

export default function AutoStudio() {
  const [ready,setReady]=useState(null),[credits,setCredits]=useState(null),[retouch,setRetouch]=useState(DEFAULT_RETOUCH),[slots,setSlots]=useState(initialSlots),[fitEnabled,setFitEnabled]=useState(false);
  const [garment,setGarment]=useState('long-top'),[sizeRows,setSizeRows]=useState({});
  const [texts,setTexts]=useState(defaultTexts),[shopee,setShopee]=useState(defaultShopee),[instagram,setInstagram]=useState(defaultInstagram);
  const [colorRef,setColorRef]=useState(null),[matchStrength,setMatchStrength]=useState(80),[autoMatch,setAutoMatch]=useState(false);
  const [products,setProducts]=useState([]),[productId,setProductId]=useState(null),[productName,setProductName]=useState(''),[saveState,setSaveState]=useState('');
  const skipSave=useRef(true),saveTimer=useRef(null);
  const [brightness,setBrightness]=useState(0),[busy,setBusy]=useState(false),[step,setStep]=useState(''),[error,setError]=useState('');
  const [preview,setPreview]=useState(null),[previewBusy,setPreviewBusy]=useState(false);
  const cache=useRef(new Map()),lock=useRef(false),previewUrl=useRef(null);
  const rows=sizeRows[garment]||[newSizeRow()];
  useEffect(()=>{api('status').then(r=>{setReady(r);if(r.photoroom)refreshCredits();}).catch(()=>setReady({}));return()=>{if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);};},[]);
  const patch=(id,values)=>{setSlots(current=>({...current,[id]:{...current[id],...values}}));setPreview(null);};
  const setText=(key,value)=>{setTexts(current=>({...current,[key]:value}));setPreview(null);};
  async function task(work) {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');setPreview(null);
    try {await work();}catch(e){setError(e.message);setStep('중단됨 · 완료한 사진은 유지됩니다.');}
    finally {lock.current=false;setBusy(false);}
  }
  const snapshot=()=>({slots,texts,garment,sizeRows,fitEnabled,retouch,shopee,instagram,color:{ref:colorRef,strength:matchStrength,auto:autoMatch}});
  async function applyProduct(product) {
    const d=product?.data||{};
    skipSave.current=true;
    // 예전 버전이 대표 사진에서 자동으로 잘라 만든 디테일컷(원본 사진 없음)은 비웁니다.
    const nextSlots=Object.fromEntries(Object.entries(d.slots||initialSlots()).map(([k,v])=>[k,v.derived&&!v.source?{...v,image:null,cutout:null,crop:null,derived:false,status:'empty'}:v]));
    setSlots(nextSlots);setTexts({...defaultTexts(),...d.texts});setGarment(d.garment||'long-top');setSizeRows(d.sizeRows||{});
    setFitEnabled(Boolean(d.fitEnabled));setRetouch({...DEFAULT_RETOUCH,...d.retouch});setShopee({...defaultShopee(),...d.shopee});setInstagram({...defaultInstagram(),...d.instagram});
    setColorRef(d.color?.ref||null);setMatchStrength(d.color?.strength??80);setAutoMatch(Boolean(d.color?.auto));
    setProductId(product.id);setProductName(product.name||'');setPreview(null);setSaveState('saved');
  }
  async function saveNow(id=productId,name=productName,data=snapshot()) {
    if(!id)return;
    clearTimeout(saveTimer.current);
    try {setSaveState('saving');await saveProduct({id,name,data});setSaveState('saved');setProducts(await listProducts());}
    catch(e){setSaveState('error');setError(`자동 저장 실패: ${e.message} 작업은 화면에 남아 있으니 다운로드로 보관하세요.`);}
  }
  useEffect(()=>{(async()=>{
    // 저장된 상품을 다 불러올 때까지 편집을 잠가 업로드가 덮어써지지 않게 합니다.
    lock.current=true;setBusy(true);setStep('저장된 상품을 불러오는 중');
    try {
      const list=await listProducts();
      if(list.length)await applyProduct(await getProduct(list[0].id));
      else {const product={id:newProductId(),name:'상품 1',data:null};await saveProduct({...product,data:{}});await applyProduct(product);}
      setProducts(await listProducts());
      setStep('');
    } catch(e){setSaveState('error');setStep('');setError(`상품 저장소를 쓸 수 없습니다 (${e.message}). 작업은 이 화면에서만 유지됩니다.`);}
    finally {lock.current=false;setBusy(false);}
  })();},[]);
  useEffect(()=>{
    if(!productId)return;
    if(skipSave.current){skipSave.current=false;return;}
    setSaveState('pending');clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(()=>saveNow(),800);
    return()=>clearTimeout(saveTimer.current);
  },[slots,texts,garment,sizeRows,fitEnabled,retouch,shopee,instagram,productName,colorRef,matchStrength,autoMatch]);
  async function switchProduct(id) {
    if(id===productId)return;
    await task(async()=>{await saveNow();await applyProduct(await getProduct(id));setStep('상품을 불러왔습니다.');});
  }
  async function addProduct() {
    await task(async()=>{
      await saveNow();
      const product={id:newProductId(),name:`상품 ${products.length+1}`,data:{}};
      await saveProduct(product);await applyProduct(product);setProducts(await listProducts());
      setStep('새 상품을 만들었습니다. 사진을 넣어 시작하세요.');
    });
  }
  async function removeProduct() {
    if(!productId||!window.confirm(`‘${productName||'이 상품'}’을(를) 삭제할까요? 이 브라우저에 저장된 사진과 문구가 지워지며 되돌릴 수 없습니다.`))return;
    await task(async()=>{
      clearTimeout(saveTimer.current);await deleteProduct(productId);
      const list=await listProducts();
      if(list.length)await applyProduct(await getProduct(list[0].id));
      else {const product={id:newProductId(),name:'상품 1',data:{}};await saveProduct(product);await applyProduct(product);}
      setProducts(await listProducts());setStep('상품을 삭제했습니다.');
    });
  }
  async function upload(id,file) {
    await task(async()=>{
      const source=await readPhoto(file),canvas=await imageCanvas(source);
      patch(id,{source,image:whitePhoto(canvas,null,0),cutout:null,crop:null,derived:false,status:'raw',enabled:true,versions:[null],vIndex:0});
      setStep('사진을 넣었습니다. 누끼·보정을 적용하거나 사진을 더 추가하세요.');
    });
  }
  async function edited(source,warnings,options) {
    // 같은 사진·같은 설정은 다시 과금하지 않고 저장된 결과를 씁니다.
    const key=JSON.stringify(options)+source;
    if(cache.current.has(key))return cache.current.get(key);
    const response=await api('retouch',{image:source,options});
    const canvas=await imageCanvas(response.image);
    cutoutBounds(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height));
    if(response.warning)warnings.push(response.warning);
    else cache.current.set(key,response.image);
    return response.image;
  }
  // 보정된 사진마다 공통 밝기를 적용합니다. 디테일컷은 각 자리에 넣은 사진으로만 만듭니다(자동 생성 없음).
  async function refreshImages(current) {
    // 색감 기준이 있으면 대표 사진 밝기 맞춤은 하지 않습니다(색감 통일 결과를 다시 바꾸지 않도록).
    const target=!colorRef&&current.hero.cutout?medianLight(await imageCanvas(current.hero.cutout)):null;
    const next={...current};
    for(const [id,slot] of Object.entries(next))if(slot.cutout)next[id]={...slot,image:whitePhoto(await imageCanvas(slot.cutout),target,brightness),status:'done'};
    return next;
  }
  async function processPhotos(onlyId) {
    await task(async()=>{
      const status=await api('status');setReady(status);
      if(!status.photoroom)throw new Error('서버에 Photoroom API 키(PHOTOROOM_API_KEY)가 연결되지 않았습니다. Vercel 환경변수에 등록한 뒤 다시 배포하세요.');
      let current={...slots};const warnings=[];
      const pending=Object.values(current).filter(slot=>slot.source&&(onlyId?slot.id===onlyId:slot.enabled&&(slot.id!=='fit'||fitEnabled)&&slot.status!=='done'));
      for(let index=0;index<pending.length;index++){
        const slot=pending[index];setStep(`${index+1}/${pending.length} · ${slot.label} 배경 제거·약한 주름 보정`);
        const cutout=await edited(slot.source,warnings,slot.retouch||retouch);
        const kept=(slot.versions||[null]).slice(0,(slot.vIndex??0)+1);
        // 같은 결과(저장된 결과 재사용)는 버전을 새로 늘리지 않습니다.
        let versions=(kept[kept.length-1]===cutout?kept:[...kept,cutout]);
        let finalCut=cutout;
        if(colorRef&&autoMatch&&colorRef.slotId!==slot.id){finalCut=(await matchedCutout(cutout,colorRef.lab)).image;versions=[...versions,finalCut];}
        versions=versions.slice(-MAX_VERSIONS);
        current={...current,[slot.id]:{...slot,cutout:finalCut,status:'done',versions,vIndex:versions.length-1}};
        current=await refreshImages(current);
        setSlots(current);
      }
      if(!onlyId&&!texts.headline&&current.hero.source&&status.openai){
        setStep('확인된 상품 정보로 문구 작성 중');
        const copy=await api('analyze',{image:current.hero.source,product:texts.product});
        setTexts(value=>({...value,headline:copy.headline,description:[copy.description,...copy.points].join('\n')}));
      }
      if(warnings.length)setError(warnings.join('\n'));
      refreshCredits();
      setStep(`완료 · 사진과 문구를 확인한 후 전체 이미지를 저장하세요.${!onlyId&&!status.openai?' (OpenAI 키가 없어 문구 자동 작성은 건너뛰었습니다.)':''}`);
    });
  }
  // ---- 색감 통일 (브라우저 계산, API 비용 없음) ----
  async function matchedCutout(src,lab) {
    const c=await imageCanvas(src),ctx=c.getContext('2d'),pixels=ctx.getImageData(0,0,c.width,c.height);
    const shift=colorShift(dominantLab(pixels),lab,matchStrength/100);
    applyShift(pixels,shift);ctx.putImageData(pixels,0,0);
    return {image:c.toDataURL('image/png'),shift};
  }
  async function chooseColorRef(id) {
    await task(async()=>{
      const slot=slots[id],c=await imageCanvas(slot.cutout);
      const lab=dominantLab(c.getContext('2d').getImageData(0,0,c.width,c.height));
      setColorRef({slotId:id,label:slot.label,lab:{L:lab.L,a:lab.a,b:lab.b}});
      setStep(`‘${slot.label}’의 옷 색감을 기준으로 정했습니다. ‘기준 색감으로 맞추기’를 누르면 다른 컷이 이 색감에 맞춰집니다.`);
    });
  }
  async function matchColors(ids) {
    if(!colorRef)return;
    await task(async()=>{
      let next={...slots};const done=[],skipped=[];
      for(const id of ids){
        const slot=next[id];
        if(!slot||id===colorRef.slotId)continue;
        if(!slot.cutout){if(slot.source)skipped.push(slot.label);continue;}
        setStep(`${done.length+1} · ${slot.label} 색감 맞추는 중`);
        const {image}=await matchedCutout(slot.cutout,colorRef.lab);
        const versions=[...(slot.versions||[null]).slice(0,(slot.vIndex??0)+1),image].slice(-MAX_VERSIONS);
        next[id]={...slot,cutout:image,status:'done',versions,vIndex:versions.length-1};done.push(slot.label);
      }
      setSlots(await refreshImages(next));
      setStep(`색감 통일 완료 · ${done.length}컷 (API 사용 없음, ‘이전으로’로 되돌릴 수 있습니다)${skipped.length?` · 보정 전이라 제외: ${skipped.join(', ')}`:''}`);
    });
  }
  async function changeVersion(id,index) {
    await task(async()=>{
      const slot=slots[id],versions=slot.versions||[null];
      if(index<0||index>=versions.length)return;
      const cutout=versions[index];
      let next={...slots,[id]:{...slot,vIndex:index,cutout,status:cutout?'done':'raw'}};
      if(!cutout)next[id].image=whitePhoto(await imageCanvas(slot.source),null,0);
      next=await refreshImages(next);
      setSlots(next);
      setStep(`${slot.label||'사진'} · ${index===0?'원본으로 되돌렸습니다':`보정 ${index} 버전을 적용했습니다`} (API 사용 없음)`);
    });
  }
  async function savePhoto(id) {
    await task(async()=>{
      const slot=slots[id];if(!slot?.image)return;
      setStep('개별 PNG를 2MB 이하로 압축하는 중');
      const {blob,width,height,original}=await compressPng(slot.image);
      downloadBlob(blob,`${(slot.label||slot.id).replace(/[\\/:*?"<>|]/g,'_')}.png`);
      const mb=(blob.size/1024/1024).toFixed(2),resized=width!==original.width;
      setStep(`개별 PNG 저장 완료 · ${mb}MB · ${width}×${height}px${resized?` (원래 ${original.width}×${original.height}px에서 줄임)`:' (원래 크기 유지)'}`);
    });
  }
  function refreshCredits() {api('credits').then(setCredits).catch(()=>setCredits(null));}
  function removePhoto(id) {
    setPreview(null);
    setSlots(current=>{
      const next={...current,[id]:{...current[id],source:null,image:null,cutout:null,crop:null,derived:false,status:'empty',versions:[null],vIndex:0,retouch:null}};
      return next;
    });
  }
  async function changeGarment(value) {
    setGarment(value);setPreview(null);
  }
  function editSize(index,key,value) {
    setSizeRows(current=>({...current,[garment]:rows.map((row,i)=>i===index?{...row,[key]:value}:row)}));setPreview(null);
  }
  const blocks=()=>documentBlocks({slots,fitEnabled,texts,garment,rows});
  async function exportPng(previewOnly=false) {
    if(!slots.hero.image){setError('대표 정면샷을 먼저 넣어주세요.');return;}
    await task(async()=>{
      setStep(previewOnly?'미리보기 구성 중':'전체 이미지 제작 중');setPreviewBusy(true);
      try {
        const blob=await renderDocument(blocks());
        if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);
        previewUrl.current=URL.createObjectURL(blob);setPreview(previewUrl.current);
        if(!previewOnly)downloadBlob(blob,'의류-상세페이지.png');
        setStep(previewOnly?'현재 편집 내용의 미리보기입니다.':'전체 PNG 저장 완료');
      }finally{setPreviewBusy(false);}
    });
  }
  function exportHtml() {
    if(!slots.hero.image){setError('대표 정면샷을 먼저 넣어주세요.');return;}
    downloadBlob(new Blob([documentHtml(blocks(),texts.headline||'의류 상세페이지')],{type:'text/html;charset=utf-8'}),'의류-상세페이지.html');
  }
  const photoProps={busy,onUpload:upload,onPatch:patch,onProcess:processPhotos,onRemove:removePhoto,onVersion:changeVersion,onSave:savePhoto,retouchDefault:retouch,status:ready,colorRef,onColorRef:chooseColorRef,onColorMatch:matchColors};
  const pendingCount=Object.values(slots).filter(s=>s.image&&s.enabled&&s.status==='raw'&&(s.id!=='fit'||fitEnabled)).length;
  return <div className="auto-studio">
    <div className="studio-heading"><div><span className="eyebrow">FASHION STUDIO / PAGE EDITOR</span><h1>의류 상세페이지 제작</h1><p>대표 사진 → Fit guide → Detail → Size 순서로 구성합니다.</p></div><span className="connection">{ready===null?'연결 확인 중':`Photoroom ${ready.photoroom?`연결됨${credits&&Number.isFinite(credits.available)?` (남은 이미지 ${credits.available}/${credits.subscription})`:''}`:'키 필요'} · OpenAI 문구 ${ready.openai?'연결됨':'키 필요'}${ready.photoroom||ready.openai?' · AI 처리 시 사용료 발생':''}`}</span></div>
    <div className="studio-toolbar"><button disabled={busy} onClick={()=>exportPng(true)}>전체 미리보기</button><button disabled={busy} className="primary" onClick={()=>exportPng(false)}>상세페이지 전체 PNG 저장</button><button disabled={busy} onClick={exportHtml}>HTML 다운로드</button></div>
    <section className="product-bar" aria-label="상품 목록">
      <label>상품 선택<select aria-label="상품 선택" disabled={busy} value={productId||''} onChange={e=>switchProduct(e.target.value)}>{products.map(p=><option key={p.id} value={p.id}>{p.name||'이름 없는 상품'}</option>)}</select></label>
      <label>상품 이름<input aria-label="상품 이름" disabled={busy} maxLength={80} value={productName} onChange={e=>setProductName(e.target.value)}/></label>
      <button type="button" disabled={busy} onClick={addProduct}>+ 새 상품</button>
      <button type="button" className="subtle" disabled={busy||!productId} onClick={removeProduct}>상품 삭제</button>
      <span className="save-state" aria-live="polite">{{saving:'저장 중…',pending:'저장 대기',saved:'자동 저장됨',error:'저장 안 됨'}[saveState]||''}</span>
    </section>
    <p className="session-note">상품은 이 브라우저에 자동 저장됩니다(총 {products.length}개). 다른 컴퓨터·다른 브라우저에서는 보이지 않으니, 완성본은 다운로드해서 보관하세요.</p>
    <p role="status" aria-live="polite">{step}</p>{error&&<p role="alert" className="studio-error">{error}</p>}
    <div className="studio-workspace"><fieldset disabled={busy} className="studio-editor">
      <section className="editor-section"><h2>상품 정보와 공통 보정</h2>
        <label>옷 종류<select aria-label="옷 종류" value={garment} onChange={e=>changeGarment(e.target.value)}>{GARMENTS.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
        <label>상품 정보<textarea value={texts.product} maxLength={3000} placeholder="확인된 소재·색상·상품 정보만 입력하세요." onChange={e=>setText('product',e.target.value)}/></label>
        <label>상품 제목<input value={texts.headline} maxLength={200} onChange={e=>setText('headline',e.target.value)}/></label>
        <label>상품 설명<textarea value={texts.description} maxLength={4000} onChange={e=>setText('description',e.target.value)}/></label>
        <RetouchSettings value={retouch} onChange={setRetouch} status={ready} title="누끼·보정 설정 (모든 사진 기본값)"/>
        <p className="slot-note">사진별로 다르게 하려면 각 사진 아래 ‘이 사진 보정 설정’에서 바꾸세요.</p>
        {credits&&Number.isFinite(credits.available)&&credits.available<=3&&<p className="review-note">Photoroom 남은 이미지가 {credits.available}장입니다. 사진 1장 보정에 1장이 사용됩니다.</p>}
        <label>공통 밝기 · {brightness}%<input aria-label="공통 밝기" type="range" min="0" max="8" value={brightness} onChange={e=>setBrightness(Number(e.target.value))}/></label>
        <button onClick={()=>task(async()=>{setSlots(await refreshImages(slots));setStep('보정된 사진 전체에 공통 밝기를 적용했습니다.');})}>보정된 사진에 공통 밝기 적용</button>
        <div className="color-unify" aria-label="색감 통일">
          <h3>색감 통일 <small>API 비용 없음</small></h3>
          {colorRef?<p className="color-ref"><i style={{background:labCss(colorRef.lab)}}/>기준: <b>{colorRef.label}</b>의 옷 대표 색 <button type="button" className="subtle" onClick={()=>setColorRef(null)}>기준 해제</button></p>
            :<p className="slot-note">마음에 드는 보정 컷에서 ‘🎨 이 컷 색감을 기준으로’를 누르세요. 그 컷 옷의 대표 색에 맞춰 다른 컷의 밝기·색조를 조정합니다.</p>}
          <label>맞추는 강도 · {matchStrength}%<input aria-label="색감 맞추는 강도" type="range" min="10" max="100" step="10" value={matchStrength} onChange={e=>setMatchStrength(Number(e.target.value))}/></label>
          <button type="button" disabled={!colorRef} onClick={()=>matchColors(Object.keys(slots))}>보정된 모든 컷을 기준 색감으로 맞추기</button>
          <label className="check"><input type="checkbox" aria-label="새 보정 컷 자동 색감 맞춤" disabled={!colorRef} checked={autoMatch} onChange={e=>setAutoMatch(e.target.checked)}/>앞으로 보정하는 컷도 자동으로 기준 색감에 맞추기</label>
          <p className="slot-note">누끼·보정된 컷에만 적용됩니다. 한 번에 바꾸는 양에 한계를 둬서 색이 크게 틀어지지 않으며, 각 컷의 ‘이전으로’로 되돌릴 수 있습니다. 같은 컷에 여러 번 누르면 조금씩 더 맞춰집니다.</p>
        </div>
        <button className="primary" disabled={!slots.hero.source} onClick={()=>processPhotos()}>사진 일괄 누끼·보정 및 문구 제작</button>
        <p className="slot-note">완료한 사진은 재사용합니다. 옆면·후면·모델 사진은 실제 사진을 넣었을 때만 사용합니다.</p>
      </section>
      <PhotoSlot slot={slots.hero} {...photoProps}/>
      <section className="editor-section"><h2>02 · Fit guide</h2><label className="check"><input type="checkbox" checked={fitEnabled} onChange={e=>{setFitEnabled(e.target.checked);setPreview(null);}}/>모델컷 적용</label><p>선택하고 모델 사진을 넣으면 표시됩니다. 사진이 없으면 전체 상세페이지에서 제외됩니다.</p>
        {fitEnabled&&<><label>Fit guide 제목<input maxLength={100} value={texts.fitTitle} onChange={e=>setText('fitTitle',e.target.value)}/></label><label>모델 설명<textarea maxLength={1500} value={texts.fitDescription} onChange={e=>setText('fitDescription',e.target.value)} placeholder="확인된 모델 키·착용 사이즈 등을 입력하세요."/></label><PhotoSlot slot={slots.fit} {...photoProps}/></>}
      </section>
      <section className="editor-section"><h2>03 · Detail</h2><label>Detail 제목<input maxLength={100} value={texts.detailTitle} onChange={e=>setText('detailTitle',e.target.value)}/></label><p>정면 확대·상단·하단·원단컷 등은 각 자리에 사진을 직접 넣고 ‘이 사진 누끼·보정’으로 따로 보정합니다. 사진을 넣지 않은 자리는 상세페이지에서 빠집니다.</p>
        {Object.values(slots).filter(s=>!['hero','fit'].includes(s.id)).map(slot=><PhotoSlot key={slot.id} slot={slot} {...photoProps}/>)}
        <button disabled={Object.keys(slots).length>=14} onClick={()=>{const id='extra-'+crypto.randomUUID();patch(id,{id,label:'추가 디테일컷',enabled:true,source:null,image:null,cutout:null,crop:null,status:'empty'});}}>특정 디테일컷 추가</button>
      </section>
      <section className="editor-section size-editor"><h2>04 · Size</h2><label>Size 제목<input maxLength={100} value={texts.sizeTitle} onChange={e=>setText('sizeTitle',e.target.value)}/></label>
        <img className="size-guide" src={guideUrl(garment)} alt={`${GARMENTS.find(g=>g.id===garment).label} 치수 가이드`}/>
        <p>단위: cm · 입력하지 않은 값은 ‘—’로 표시합니다.</p>
        <div className="size-scroll"><table><thead><tr>{sizeFields(garment).map(([key,label])=><th key={key}>{label}</th>)}<th>행 삭제</th></tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{sizeFields(garment).map(([key,label])=><td key={key}><input aria-label={`${i+1}행 ${label}`} value={row[key]} maxLength={key==='size'?16:12} inputMode={key==='size'?'text':'decimal'} onChange={e=>editSize(i,key,e.target.value)}/></td>)}<td><button aria-label={`${i+1}행 삭제`} disabled={rows.length===1} onClick={()=>{setSizeRows(current=>({...current,[garment]:rows.filter((_,index)=>i!==index)}));setPreview(null);}}>삭제</button></td></tr>)}</tbody></table></div>
        <button disabled={rows.length>=12} onClick={()=>{setSizeRows(current=>({...current,[garment]:[...rows,newSizeRow()]}));setPreview(null);}}>사이즈 행 추가</button>
        <label>치수 안내 문구<textarea maxLength={1500} value={texts.sizeNote} onChange={e=>setText('sizeNote',e.target.value)}/></label>
      </section>
      <ShopeePanel shopee={shopee} setShopee={setShopee} slots={slots} fitEnabled={fitEnabled} garment={garment} rows={rows} texts={texts} ready={ready} task={task} setStep={setStep} api={api} productName={productName}/>
      <InstagramPanel instagram={instagram} setInstagram={setInstagram} slots={slots} fitEnabled={fitEnabled} rows={rows} texts={texts} task={task} setStep={setStep} productName={productName}/>
    </fieldset><aside className="studio-preview"><h2>완성 상세페이지</h2><p>편집 후 ‘전체 미리보기’를 누르면 저장되는 이미지와 같은 구성을 확인할 수 있습니다.</p>{pendingCount>0&&<p className="review-note">보정 전 사진 {pendingCount}장이 포함되어 있습니다. 배경 제거가 필요하면 보정을 먼저 실행하세요.</p>}{previewBusy?<p>미리보기를 만들고 있습니다…</p>:preview?<img src={preview} alt="완성 상세페이지 미리보기"/>:<div className="preview-placeholder"><span>01 대표 정면샷</span><span>02 Fit guide · 선택</span><span>03 Detail</span><span>04 Size</span><button disabled={busy||!slots.hero.image} onClick={()=>exportPng(true)}>전체 미리보기</button></div>}</aside></div>
  </div>;
}
