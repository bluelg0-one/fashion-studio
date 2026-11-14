import {useEffect, useRef, useState} from 'react';
import './AutoStudio.css';
import {cutoutBounds} from '../utils/detailCrops.js';
import {removeStand} from '../utils/stand.js';
import {GARMENTS, initialSlots, DETAIL_SLOTS, newSizeRow, sizeFields, guideUrl, documentBlocks, documentHtml} from '../utils/studioDocument.js';
import {DEFAULT_RETOUCH, sanitizeRetouch} from '../utils/retouchPresets.js';
import {RetouchSettings, cutoutCost} from './RetouchSettings.jsx';
import {CutRow, SHOT_LABEL} from './CutRow.jsx';
import {applyTone} from '../utils/matte.js';
import {getIopaintUrl, setIopaintUrl, checkIopaint, inspectImage, markedPreview, inpaint, removeBackground, checkBirefnet, DEFECT_LABEL} from '../utils/iopaint.js';
import {listProducts, getProduct, saveProduct, deleteProduct, newProductId} from '../utils/productStore.js';
import DrivePanel from './DrivePanel.jsx';
import ShopeePanel from './ShopeePanel.jsx';
import {COST, Cost} from './Cost.jsx';
import {dominantLab, colorShift, applyShift, labCss} from '../utils/colorMatch.js';
import {readPhoto, imageCanvas, medianLight, whitePhoto, download, downloadBlob, renderDocument, compressPng, thumbnail, framePhoto} from '../utils/studioImages.js';

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

const MAX_VERSIONS=6;
// Claude 분류 결과(컷 종류) → 칸. 기타 디테일은 원단 및 디테일 → 디테일2·3 → 포인트1·2 순서로 빈 칸에.
const SHOT_SLOT={front:'hero',frontZoom:'frontZoom',frontTop:'frontTop',frontBottom:'frontBottom',side:'side',back:'back',fabric:'fabric',fit:'fit'};
const DETAIL_ORDER=['fabric','detail2','detail3','point1','point2'];
const PHOTO_FIELDS=['source','image','cutout','crop','derived','status','versions','vIndex','retouch','ai','defects','matte','stage1','stage2','tone','shown'];
// 버전 한 칸 = {matte(원본과 위치가 같은 누끼), stage1(1차 결과), stage2(2차 결과)}. 예전 버전(문자열)은 1차 결과로 봅니다.
const entryOf=slot=>{const v=(slot.versions||[null])[slot.vIndex??0];return typeof v==='string'?{matte:null,stage1:v,stage2:null}:v||null;};
const entryFields=e=>e?{matte:e.matte||null,stage1:e.stage1||null,stage2:e.stage2||null,cutout:e.stage2||e.stage1||null,status:'done'}:{matte:null,stage1:null,stage2:null,cutout:null,status:'raw'};
function withEntry(slot,entry) {
  const kept=(slot.versions||[null]).slice(0,(slot.vIndex??0)+1),versions=[...kept,entry].slice(-MAX_VERSIONS);
  return {...slot,...entryFields(entry),versions,vIndex:versions.length-1};
}
// 예전에 저장한 상품: 새 컷 종류를 더하고, 사진 있는 예전 칸은 그대로 둡니다.
function migrateSlots(saved) {
  const base=initialSlots(),out={};
  for(const [k,v] of Object.entries(base)){const o=saved?.[k];out[k]=o?{...v,...o,label:o.source?o.label:v.label}:v;}
  for(const [k,v] of Object.entries(saved||{}))if(!(k in base)&&v?.source)out[k]=v;
  for(const v of Object.values(out))if(v.source&&!v.cutout&&entryOf(v)){const {status,...f}=entryFields(entryOf(v));Object.assign(v,f);}
  for(const v of Object.values(out))if(v.source&&!v.stage1&&v.cutout){const e=entryOf(v);Object.assign(v,{stage1:e?.stage1||v.cutout,stage2:e?.stage2||null,matte:e?.matte||null});}
  return out;
}
// 버전 이동은 브라우저에 저장된 결과만 바꾸므로 API 호출·과금이 없습니다.
export default function AutoStudio() {
  const [ready,setReady]=useState(null),[credits,setCredits]=useState(null),[retouch,setRetouch]=useState(DEFAULT_RETOUCH),[slots,setSlots]=useState(initialSlots),[fitEnabled,setFitEnabled]=useState(false);
  const [garment,setGarment]=useState('long-top'),[sizeRows,setSizeRows]=useState({});
  const [texts,setTexts]=useState(defaultTexts),[shopee,setShopee]=useState(defaultShopee);
  const [iop,setIop]=useState(null),[bir,setBir]=useState(null),[iopUrl,setIopUrl]=useState(getIopaintUrl),[frame,setFrame]=useState({enabled:false,ratio:'3:4',margin:6}),[colorRef,setColorRef]=useState(null),[matchStrength,setMatchStrength]=useState(80);
  const [products,setProducts]=useState([]),[productId,setProductId]=useState(null),[productName,setProductName]=useState(''),[saveState,setSaveState]=useState(''),[localSavedAt,setLocalSavedAt]=useState(0);
  const skipSave=useRef(true),saveTimer=useRef(null);
  const [brightness,setBrightness]=useState(0),[busy,setBusy]=useState(false),[step,setStep]=useState(''),[error,setError]=useState('');
  const [preview,setPreview]=useState(null),[previewBusy,setPreviewBusy]=useState(false);
  const cache=useRef(new Map()),lock=useRef(false),previewUrl=useRef(null);
  const rows=sizeRows[garment]||[newSizeRow()];
  useEffect(()=>{checkIopaint(getIopaintUrl()).then(setIop);checkBirefnet().then(setBir);api('status').then(r=>{setReady(r);if(r.photoroom)refreshCredits();}).catch(()=>setReady({}));return()=>{if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);};},[]);
  const patch=(id,values)=>{setSlots(current=>({...current,[id]:{...current[id],...values}}));setPreview(null);};
  const setText=(key,value)=>{setTexts(current=>({...current,[key]:value}));setPreview(null);};
  async function task(work) {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');setPreview(null);
    try {await work();}catch(e){setError(e.message);setStep('중단됨 · 완료한 사진은 유지됩니다.');}
    finally {lock.current=false;setBusy(false);}
  }
  const snapshot=()=>({slots,texts,garment,sizeRows,fitEnabled,retouch,shopee,color:{ref:colorRef,strength:matchStrength},frame});
  async function applyProduct(product) {
    const d=product?.data||{};
    skipSave.current=true;
    // 예전 버전이 대표 사진에서 자동으로 잘라 만든 디테일컷(원본 사진 없음)은 비웁니다.
    const nextSlots=Object.fromEntries(Object.entries(migrateSlots(d.slots)).map(([k,v])=>[k,v.derived&&!v.source?{...v,image:null,cutout:null,crop:null,derived:false,status:'empty'}:{...v,retouch:sanitizeRetouch(v.retouch)}]));
    setSlots(nextSlots);setTexts({...defaultTexts(),...d.texts});setGarment(d.garment||'long-top');setSizeRows(d.sizeRows||{});
    setFitEnabled(Boolean(d.fitEnabled));setRetouch(sanitizeRetouch({...DEFAULT_RETOUCH,...d.retouch}));setShopee({...defaultShopee(),...d.shopee});
    setColorRef(d.color?.ref||null);setFrame({enabled:false,ratio:'3:4',margin:6,...d.frame});setMatchStrength(d.color?.strength??80);
    setProductId(product.id);setProductName(product.name||'');setPreview(null);setSaveState('saved');
  }
  async function saveNow(id=productId,name=productName,data=snapshot()) {
    if(!id)return;
    clearTimeout(saveTimer.current);
    try {setSaveState('saving');await saveProduct({id,name,data});setSaveState('saved');setLocalSavedAt(Date.now());setProducts(await listProducts());}
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
  },[slots,texts,garment,sizeRows,fitEnabled,retouch,shopee,productName,colorRef,matchStrength,frame]);
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
      patch(id,{source,image:whitePhoto(canvas,null,0),cutout:null,matte:null,stage1:null,stage2:null,defects:null,tone:null,crop:null,derived:false,status:'raw',enabled:true,shown:true,versions:[null],vIndex:0});
      setStep('사진을 넣었습니다. 누끼·보정을 적용하거나 사진을 더 추가하세요.');
    });
  }
  // 배경 지우기 결과(원본과 같은 위치·크기의 누끼). 같은 사진·같은 설정은 다시 과금하지 않습니다.
  async function engineMatte(source,warnings,options) {
    if(options.cutout==='birefnet'){
      const rawKey='birefnet:'+source;
      if(!cache.current.has(rawKey))cache.current.set(rawKey,await removeBackground(source));
      const c=await imageCanvas(cache.current.get(rawKey));
      if(options.removeStand!==false){
        // BiRefNet은 받침대 기둥을 옷의 일부로 남기므로, 사진 아래에서 올라오는 좁고 곧은 기둥만 지웁니다.
        const ctx=c.getContext('2d'),px=ctx.getImageData(0,0,c.width,c.height);
        if(removeStand(px))ctx.putImageData(px,0,0);
      }
      cutoutBounds(c.getContext('2d').getImageData(0,0,c.width,c.height));
      return c.toDataURL('image/png');
    }
    // Photoroom: 중앙 정렬은 브라우저에서 하므로 원본 위치 그대로 받습니다(직접 수정 붓이 원본과 맞도록).
    const req={...options,center:false},key='photoroom:'+JSON.stringify(req)+source;
    if(cache.current.has(key))return cache.current.get(key);
    const response=await api('retouch',{image:source,options:req});
    const canvas=await imageCanvas(response.image);
    cutoutBounds(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height));
    if(response.warning)warnings.push(response.warning);
    else cache.current.set(key,response.image);
    return response.image;
  }
  // 1차 결과 = 누끼 + 색상 보정(밝기·화사함) + 기준 색감 맞춤(다른 컷이 기준일 때) + 중앙 정렬
  async function buildStage1(matte,{options,tone,slotId,ref=colorRef}) {
    let c=await imageCanvas(matte);
    const ctx=c.getContext('2d'),px=ctx.getImageData(0,0,c.width,c.height);
    applyTone(px,tone||{});
    if(ref&&ref.slotId!==slotId){try{applyShift(px,colorShift(dominantLab(px),ref.lab,matchStrength/100));}catch{}}
    ctx.putImageData(px,0,0);
    if(options?.center!==false)c=framePhoto(c,{margin:6,size:[c.width,c.height]});
    return c.toDataURL('image/png');
  }
  // 보정된 사진마다 공통 밝기를 적용합니다. 디테일컷은 각 자리에 넣은 사진으로만 만듭니다(자동 생성 없음).
  async function refreshImages(current,opts={}) {
    const ref=opts.colorRef!==undefined?opts.colorRef:colorRef,fr=opts.frame||frame;
    // 색감 기준이 있으면 대표 사진 밝기 맞춤은 하지 않습니다(색감 통일 결과를 다시 바꾸지 않도록).
    const target=!ref&&current.hero.cutout?medianLight(await imageCanvas(current.hero.cutout)):null;
    const next={...current};
    for(const [id,slot] of Object.entries(next))if(slot.cutout){
      let c=await imageCanvas(slot.cutout);
      if(fr.enabled)c=framePhoto(c,fr);
      next[id]={...slot,image:whitePhoto(c,target,brightness),status:'done'};
    }
    return next;
  }
  async function processPhotos(onlyId) {
    await task(async()=>{
      const status=await api('status');setReady(status);
      let current={...slots};const warnings=[];
      const pending=Object.values(current).filter(slot=>slot.source&&(onlyId?slot.id===onlyId:slot.enabled&&(slot.id!=='fit'||fitEnabled)&&slot.status!=='done'));
      const engines=new Set(pending.map(slot=>cutoutCost(slot.retouch||retouch)));
      if(engines.has('photoroom')&&!status.photoroom)throw new Error('서버에 Photoroom API 키(PHOTOROOM_API_KEY)가 연결되지 않았습니다. Vercel 환경변수에 등록한 뒤 다시 배포하거나, 배경 지우기 엔진을 BiRefNet(무료)으로 바꾸세요.');
      if(engines.has('birefnet'))setBir(await checkBirefnet());
      for(let index=0;index<pending.length;index++){
        const slot=pending[index];setStep(`${index+1}/${pending.length} · ${slot.label} 배경 제거 (${cutoutCost(slot.retouch||retouch)==='birefnet'?'BiRefNet · 내 PC, 수십 초 걸릴 수 있음':'Photoroom'})`);
        const options=slot.retouch||retouch,matte=await engineMatte(slot.source,warnings,options);
        const stage1=await buildStage1(matte,{options,tone:slot.tone,slotId:slot.id});
        const prev=entryOf(slot);
        // 같은 결과(저장된 결과 재사용)는 버전을 새로 늘리지 않습니다.
        current={...current,[slot.id]:prev&&prev.stage1===stage1&&!prev.stage2?{...slot,...entryFields(prev)}:{...withEntry(slot,{matte,stage1,stage2:null}),defects:null}};
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
  // 1차·2차를 같은 양만큼 옮겨 새 버전으로
  async function matchedEntry(slot,lab) {
    const e=entryOf(slot)||{stage1:slot.cutout};
    const stage1=e.stage1?(await matchedCutout(e.stage1,lab)).image:null,stage2=e.stage2?(await matchedCutout(e.stage2,lab)).image:null;
    return withEntry(slot,{matte:e.matte||null,stage1,stage2});
  }
  // 컷의 단계(1차·2차·최종)에서 고른 옷 색감을 기준으로. stage=null이면 해제.
  async function chooseColorRef(id,stage) {
    if(!stage){setColorRef(null);setStep('색감 기준을 해제했습니다.');return;}
    await task(async()=>{
      const slot=slots[id],src=stage==='stage1'?slot.stage1:stage==='stage2'?slot.stage2:slot.cutout;
      const c=await imageCanvas(src),lab=dominantLab(c.getContext('2d').getImageData(0,0,c.width,c.height));
      setColorRef({slotId:id,stage,label:slot.label,lab:{L:lab.L,a:lab.a,b:lab.b}});
      setStep(`‘${slot.label}’ ${{stage1:'1차',stage2:'2차',final:'최종'}[stage]} 사진의 옷 색감을 기준으로 정했습니다. 다른 컷은 보정할 때 자동으로 이 색감에 맞춰집니다. 이미 보정한 컷은 ‘기준 색감으로 다른 컷 지금 맞추기’를 누르세요.`);
    });
  }
  // 배경 직접 수정 결과 → 1차를 다시 만들고 2차는 비움(바탕이 바뀌었으므로)
  async function matteEdit(id,matte) {
    await task(async()=>{
      const slot=slots[id],options=slot.retouch||retouch;
      const stage1=await buildStage1(matte,{options,tone:slot.tone,slotId:id});
      setSlots(await refreshImages({...slots,[id]:{...withEntry(slot,{matte,stage1,stage2:null}),defects:null}}));
      setStep(`${slot.label} · 배경 직접 수정을 적용했습니다 (무료). 2차 보정을 했다면 다시 해 주세요.`);
    });
  }
  async function toneFor(id,tone) {
    await task(async()=>{
      const slot=slots[id],options=slot.retouch||retouch,e=entryOf(slot)||{};
      const base=e.matte||slot.matte;
      if(!base)throw new Error('이 컷은 예전 방식으로 보정되어 색상 보정을 하려면 ‘이 사진 누끼·보정’을 한 번 더 눌러 주세요(같은 사진이면 다시 과금하지 않을 수 있습니다).');
      const stage1=await buildStage1(base,{options,tone,slotId:id});
      setSlots(await refreshImages({...slots,[id]:{...withEntry(slot,{matte:base,stage1,stage2:null}),tone,defects:null}}));
      setStep(`${slot.label} · 색상 보정을 적용했습니다 (밝기 ${tone.bright}, 화사하게 ${tone.vivid}). 2차 보정을 했다면 다시 해 주세요.`);
    });
  }
  async function matchColorsIn(current,ids,ref) {
    const next={...current},done=[],skipped=[];
    for(const id of ids){
      const slot=next[id];
      if(!slot||id===ref.slotId)continue;
      if(!slot.cutout){if(slot.source)skipped.push(slot.label);continue;}
      setStep(`${done.length+1} · ${slot.label} 색감 맞추는 중`);
      next[id]=await matchedEntry(slot,ref.lab);done.push(slot.label);
    }
    return {next,done,skipped};
  }
  // 한 번에: 기준 색(없으면 대표 사진) → 모든 컷 색감·밝기 맞춤 → 같은 비율·크기·여백·중앙 정렬
  async function unifyAll() {
    await task(async()=>{
      let ref=colorRef;
      if(!ref){
        const src=slots.hero.cutout?slots.hero:Object.values(slots).find(s=>s.cutout);
        if(!src)throw new Error('누끼·보정된 컷이 없습니다. 먼저 사진을 보정하세요.');
        const c=await imageCanvas(src.cutout),lab=dominantLab(c.getContext('2d').getImageData(0,0,c.width,c.height));
        ref={slotId:src.id,label:src.label,lab:{L:lab.L,a:lab.a,b:lab.b}};setColorRef(ref);
      }
      const {next,done,skipped}=await matchColorsIn(slots,Object.keys(slots),ref);
      const fr={...frame,enabled:true};setFrame(fr);
      setSlots(await refreshImages(next,{colorRef:ref,frame:fr}));
      setStep(`일관성 맞추기 완료 · 기준: ${ref.label} · 색감 ${done.length}컷 · 모든 보정 컷을 ${fr.ratio} 같은 크기·여백으로 정렬 (API 사용 없음)${skipped.length?` · 보정 전이라 제외: ${skipped.join(', ')}`:''}`);
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
        next[id]=await matchedEntry(slot,colorRef.lab);done.push(slot.label);
      }
      setSlots(await refreshImages(next));
      setStep(`색감 통일 완료 · ${done.length}컷 (API 사용 없음, ‘이전으로’로 되돌릴 수 있습니다)${skipped.length?` · 보정 전이라 제외: ${skipped.join(', ')}`:''}`);
    });
  }
  // ---- 얼룩·구김: Claude가 표시 → IOPaint가 지움 ----
  async function findDefectsFor(id) {
    await task(async()=>{
      const slot=slots[id];if(!slot?.cutout)throw new Error('먼저 ‘이 사진 누끼·보정’으로 배경을 지운 뒤 찾아 주세요.');
      const status=await api('status');setReady(status);
      if(!status.claude)throw new Error('서버에 Claude API 키(ANTHROPIC_API_KEY)가 연결되지 않았습니다.');
      setStep(`Claude가 ${slot.label}에서 얼룩·구김을 찾는 중`);
      const shot=await inspectImage(slot.cutout);
      const {regions:found}=await api('defects',shot);
      // 사장님이 직접 표시한 곳은 그대로 두고, Claude가 찾은 곳만 새로 바꿉니다.
      const old=slot.defects||{regions:[],selected:[]},kept=old.regions.map((r,i)=>({r,on:old.selected.includes(i)})).filter(x=>x.r.manual);
      const regions=[...found,...kept.map(x=>x.r)];
      const selected=[...found.map((r,i)=>r.confidence>=.5?i:-1).filter(i=>i>=0),...kept.map((x,k)=>x.on?found.length+k:-1).filter(i=>i>=0)];
      const preview=await markedPreview(slot.cutout,regions,selected);
      patch(id,{defects:{regions,selected,preview}});
      setStep(found.length?`${slot.label} · Claude가 수정할 곳 ${found.length}곳을 표시했습니다. 빠진 곳은 ‘직접 표시하기’로 추가하고 ‘IOPaint로 지우기’를 누르세요.`:`${slot.label} · Claude가 고칠 곳을 찾지 못했습니다. 필요하면 ‘직접 표시하기’로 표시하세요.`);
    });
  }
  async function inpaintFor(id) {
    await task(async()=>{
      const slot=slots[id],d=slot.defects;if(!d?.selected?.length)return;
      setStep(`내 PC의 IOPaint가 ${slot.label}의 ${d.selected.length}곳을 지우는 중`);
      const result=await inpaint(slot.cutout,d.selected.map(i=>d.regions[i]),iopUrl);
      const e=entryOf(slot)||{stage1:slot.cutout};
      const next=await refreshImages({...slots,[id]:{...withEntry(slot,{matte:e.matte||null,stage1:e.stage1||slot.cutout,stage2:result}),defects:null}});
      setSlots(next);
      setStep(`${slot.label} · IOPaint로 ${d.selected.length}곳을 지웠습니다 (무료). 마음에 안 들면 ‘이전으로’를 누르세요.`);
    });
  }
  // 같은 사진에서 다시 찾으면 표시 미리보기를 새로 그립니다.
  useEffect(()=>{(async()=>{for(const s of Object.values(slots))if(s.defects&&!s.defects.preview&&s.cutout){const preview=await markedPreview(s.cutout,s.defects.regions,s.defects.selected);setSlots(cur=>cur[s.id]?.defects===s.defects?{...cur,[s.id]:{...cur[s.id],defects:{...s.defects,preview}}}:cur);}})();},[slots]);
  function moveSlot(from,to) {
    setPreview(null);
    setSlots(current=>{
      const a=current[from],b=current[to],pick=s=>Object.fromEntries(PHOTO_FIELDS.map(k=>[k,s[k]??(k==='versions'?[null]:k==='vIndex'?0:k==='status'?'empty':null)]));
      return {...current,[from]:{...a,...pick(b)},[to]:{...b,...pick(a),enabled:true,ai:a.ai?{...a.ai,review:false}:a.ai}};
    });
    setStep('사진 자리를 옮겼습니다.');
  }
  // ---- 한꺼번에 올리기 + Claude 자동 분류 ----
  async function bulkUpload(files) {
    await task(async()=>{
      const status=await api('status');setReady(status);
      if(!status.claude)throw new Error('서버에 Claude API 키(ANTHROPIC_API_KEY)가 연결되지 않았습니다. Vercel 환경변수에 등록한 뒤 다시 배포하세요.');
      const list=Array.from(files).filter(f=>f.type.startsWith('image/'));
      if(!list.length)return;
      if(list.length>24)throw new Error('한 번에 24장까지 분류할 수 있습니다. 나눠서 올려 주세요.');
      const photos=[];
      for(let i=0;i<list.length;i++){setStep(`${i+1}/${list.length} 사진 읽는 중`);const full=await readPhoto(list[i]);photos.push({id:`p${i}`,full,thumb:await thumbnail(full),name:list[i].name});}
      setStep(`Claude가 사진 ${photos.length}장을 옷별·컷별로 분류하는 중`);
      const result=await api('classify',{photos:photos.map(p=>({id:p.id,image:p.thumb}))});
      const byId=Object.fromEntries(photos.map(p=>[p.id,p]));
      const groups=result.garments.map(g=>({...g,items:result.photos.filter(p=>p.garment===g.id)})).filter(g=>g.items.length);
      const orphans=result.photos.filter(p=>!result.garments.some(g=>g.id===p.garment));
      if(orphans.length){if(groups.length)groups[0].items.push(...orphans.map(p=>({...p,review:true})));else groups.push({id:'g1',description:'분류 안 된 사진',items:orphans});}
      const built=[];
      for(const g of groups){
        const next=initialSlots();let fit=false;
        const order=[...g.items].sort((a,b)=>b.confidence-a.confidence);
        for(const item of order){
          const p=byId[item.id];let id=SHOT_SLOT[item.shot];
          if((!id||next[id].source)&&['fabric','detail'].includes(item.shot))id=DETAIL_ORDER.find(k=>!next[k].source);
          if(!id||next[id].source){id='extra-'+crypto.randomUUID();next[id]={id,label:item.shot==='unknown'?'확인 필요 사진':`${SHOT_LABEL[item.shot]||'추가'}컷`,enabled:true,source:null,image:null,cutout:null,crop:null,status:'empty'};}
          if(id==='fit')fit=true;
          next[id]={...next[id],source:p.full,image:whitePhoto(await imageCanvas(p.full),null,0),status:'raw',enabled:true,shown:true,versions:[null],vIndex:0,ai:{shot:item.shot,confidence:item.confidence,review:item.review,note:item.note,file:p.name}};
        }
        built.push({name:g.description,data:{slots:next,fitEnabled:fit}});
      }
      const currentEmpty=!Object.values(slots).some(s=>s.source);
      let first=null;
      for(let i=0;i<built.length;i++){
        const id=i===0&&currentEmpty?productId:newProductId();
        const product={id,name:built[i].name,data:built[i].data};
        await saveProduct(product);if(!first)first=product;
      }
      if(first){skipSave.current=false;await applyProduct(first);}
      setProducts(await listProducts());
      const review=result.photos.filter(p=>p.review).length;
      setStep(`분류 완료 · 옷 ${built.length}벌 · 사진 ${result.photos.length}장${review?` · ⚠ 확인 필요 ${review}장 (노란 표시)`:''} · 상품 선택에서 옷별로 확인하세요.`);
    });
  }
  async function changeVersion(id,index) {
    await task(async()=>{
      const slot=slots[id],versions=slot.versions||[null];
      if(index<0||index>=versions.length)return;
      const e=entryOf({...slot,vIndex:index});
      let next={...slots,[id]:{...slot,vIndex:index,...entryFields(e),defects:null}};
      if(!e)next[id].image=whitePhoto(await imageCanvas(slot.source),null,0);
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
      const next={...current,[id]:{...current[id],source:null,image:null,cutout:null,matte:null,stage1:null,stage2:null,defects:null,tone:null,crop:null,derived:false,status:'empty',versions:[null],vIndex:0,retouch:null}};
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
  const cutProps={busy,onUpload:upload,onPatch:patch,onProcess:processPhotos,onMatteEdit:matteEdit,onTone:toneFor,onRemove:removePhoto,onVersion:changeVersion,onSave:savePhoto,retouchDefault:retouch,status:ready,bir,colorRef,onColorRef:chooseColorRef,slotList:Object.values(slots).filter(s=>s.id!=='fit'||fitEnabled).map(s=>({id:s.id,label:s.label,source:Boolean(s.source)})),onMove:moveSlot,iop,onFindDefects:findDefectsFor,onInpaint:inpaintFor,onHide:id=>patch(id,{shown:false})};
  // 사진이 없는 컷은 숨깁니다(정면은 항상 표시). 아래 ‘+’로 꺼내 씁니다.
  const visible=s=>s.id==='hero'||Boolean(s.source)||Boolean(s.shown);
  const cutList=Object.values(slots).filter(s=>s.id!=='fit'&&visible(s));
  const hiddenCuts=Object.values(slots).filter(s=>s.id!=='fit'&&!visible(s));
  function addCut(id) {
    if(id==='__new'){const nid='extra-'+crypto.randomUUID();patch(nid,{id:nid,label:'추가 컷',enabled:true,shown:true,source:null,image:null,cutout:null,crop:null,status:'empty'});return;}
    patch(id,{shown:true});
  }
  const pendingCount=Object.values(slots).filter(s=>s.image&&s.enabled&&s.status==='raw'&&(s.id!=='fit'||fitEnabled)).length;
  return <div className="auto-studio">
    <div className="studio-heading"><div><span className="eyebrow">FASHION STUDIO / PAGE EDITOR</span><h1>의류 상세페이지 제작</h1><p>대표 사진 → Fit guide → Detail → Size 순서로 구성합니다.</p></div><span className="connection">{ready===null?'연결 확인 중':`Photoroom ${ready.photoroom?`연결됨${credits&&Number.isFinite(credits.available)?` (남은 이미지 ${credits.available}/${credits.subscription})`:''}`:'키 필요'} · OpenAI 문구 ${ready.openai?'연결됨':'키 필요'}${ready.photoroom||ready.openai?' · AI 처리 시 사용료 발생':''}`}</span></div>
    <div className="studio-toolbar"><button disabled={busy} onClick={()=>exportPng(true)}>전체 미리보기</button><button disabled={busy} className="primary" onClick={()=>exportPng(false)}>상세페이지 전체 PNG 저장</button><button disabled={busy} onClick={exportHtml}>HTML 다운로드</button></div>
    <details className="tools-panel"><summary>사용 도구·비용 · Photoroom {ready?.photoroom?'✅':'⛔'} · Claude {ready?.claude?'✅':'⛔'} · IOPaint(내 PC) {iop?.ok?'✅':'⛔'} · BiRefNet(내 PC) {bir?.ok&&bir.ready?'✅':'⛔'} · OpenAI {ready?.openai?'✅':'⛔'}</summary>
      <table className="cost-table"><thead><tr><th>기능</th><th>사용 모델</th><th>비용</th></tr></thead><tbody>
        {[['배경 지우기 (누끼) · 기본','photoroom'],['배경 지우기 (누끼) · 무료 선택','birefnet'],['Photoroom 생성형 추가 편집 (선택)','photoroomAI'],['사진 한꺼번에 올리기 (옷별·컷별 분류)','claudeClassify'],['얼룩·구김 자동 찾기','claudeDefects'],['얼룩·구김 지우기 (다림질 포함)','iopaint'],['상품 문구·쇼피 영문 문구','openai'],['얼룩·구김 직접 표시','browser'],['색감·일관성 맞추기 · PNG 압축 · ZIP','browser'],['상품 저장 (다른 컴퓨터와 이어서 작업)','gdrive']].map(([f,k])=><tr key={f}><td>{f}</td><td>{COST[k][0]}</td><td>{COST[k][1]}</td></tr>)}
      </tbody></table>
      <p className="slot-note">Claude 비용은 사진 크기·개수에 따른 추정치입니다. 실제 금액은 Claude Console·Photoroom 대시보드에서 확인하세요.</p>
      <h3>IOPaint · BiRefNet 연결 (내 PC) {iop?.ok?<span className="ok-tag">IOPaint 연결됨 · {iop.model}</span>:<span className="off-tag">IOPaint 꺼짐</span>} {bir?.ok?<span className={bir.ready?'ok-tag':'off-tag'}>BiRefNet {bir.ready?'연결됨':bir.error?'오류':'준비 중'}</span>:<span className="off-tag">BiRefNet 꺼짐</span>}</h3>
      {iop?.ok&&!bir?.ok&&<p className="review-note">얼룩·구김 지우기는 됩니다. 무료 배경 지우기(BiRefNet)도 쓰려면 아래 설치 파일을 다시 받아 한 번 더 실행하고, 바탕화면 IOPaint Start로 다시 켜세요(이미 설치된 부분은 건너뛰어 빨리 끝납니다).</p>}
      <p className="slot-note">IOPaint(얼룩·구김 지우기)와 BiRefNet(무료 배경 지우기)은 사장님 PC에서 실행되는 무료 프로그램입니다. 설치 파일 하나로 둘 다 설치되고, IOPaint Start 하나로 둘 다 켜집니다. 이 앱을 연 그 PC에서 켜져 있어야 합니다(사진은 PC 안에서만 처리).</p>
      <ol className="steps">
        <li>처음 한 번: <a href="/iopaint/install-iopaint.bat" download>설치 파일(install-iopaint.bat)</a>을 받아 더블클릭 → 끝날 때까지 기다립니다(10~20분, 약 3GB). 얼룩·구김 지우기(LaMa)와 무료 배경 지우기(BiRefNet)가 함께 설치됩니다.</li>
        <li>쓸 때마다: 바탕화면의 <b>IOPaint Start</b>(또는 <a href="/iopaint/start-iopaint.bat" download>start-iopaint.bat</a>)을 더블클릭 → 검은 창은 닫지 말고 둡니다.</li>
        <li>아래 ‘다시 확인’을 누릅니다. 크롬이 “이 기기의 다른 앱 및 서비스에 액세스” 허용을 물으면 <b>허용</b>을 누릅니다.</li>
      </ol>
      <div className="btn-row"><label className="iop-url">IOPaint 주소<input aria-label="IOPaint 주소" value={iopUrl} onChange={e=>{setIopUrl(e.target.value);setIopaintUrl(e.target.value);}}/></label>
        <button type="button" onClick={async()=>{setIop(null);setBir(null);const [a,b]=await Promise.all([checkIopaint(iopUrl),checkBirefnet()]);setIop(a);setBir(b);}}>다시 확인</button></div>
    </details>
    <section className="product-bar" aria-label="상품 목록">
      <label>상품 선택<select aria-label="상품 선택" disabled={busy} value={productId||''} onChange={e=>switchProduct(e.target.value)}>{products.map(p=><option key={p.id} value={p.id}>{p.name||'이름 없는 상품'}</option>)}</select></label>
      <label>상품 이름<input aria-label="상품 이름" disabled={busy} maxLength={80} value={productName} onChange={e=>setProductName(e.target.value)}/></label>
      <button type="button" disabled={busy} onClick={addProduct}>+ 새 상품</button>
      <label className="file-button primary bulk-upload">사진 한꺼번에 올리기 (자동 분류)<input aria-label="사진 한꺼번에 올리기" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const f=Array.from(e.target.files||[]);e.target.value='';if(f.length)bulkUpload(f);}}/></label><Cost k="claudeClassify"/>
      <button type="button" className="subtle" disabled={busy||!productId} onClick={removeProduct}>상품 삭제</button>
      <span className="save-state" aria-live="polite">{{saving:'저장 중…',pending:'저장 대기',saved:'자동 저장됨',error:'저장 안 됨'}[saveState]||''}</span>
    </section>
    <DrivePanel clientId={ready?.googleClientId} productId={productId} localSavedAt={localSavedAt} busy={busy} task={task} setStep={setStep}
      flush={()=>saveNow()} onLoaded={async id=>{clearTimeout(saveTimer.current);await applyProduct(await getProduct(id));setProducts(await listProducts());}}/>
    <p className="session-note">‘사진 한꺼번에 올리기’: 여러 옷이 섞인 사진을 최대 24장까지 올리면 Claude가 같은 옷끼리 묶어 상품을 만들고 컷 종류별 칸에 넣습니다(분류 1회당 Claude API 요금 발생). 옷마다 첫 컷을 정면 전체로 찍으면 더 정확합니다. </p>
    <p className="session-note">상품은 이 브라우저에 자동 저장됩니다(총 {products.length}개). 다른 컴퓨터에서 이어서 작업하려면 위 ‘구글 드라이브 저장’을 쓰세요.</p>
    <p role="status" aria-live="polite">{step}</p>{error&&<p role="alert" className="studio-error">{error}</p>}
    <fieldset disabled={busy} className="cut-section" aria-label="컷별 보정">
      <h2>컷별 보정 <small>원본 → 1차 보정 → 2차 보정 → 최종 완성본</small></h2>
      {colorRef&&<p className="color-ref"><i style={{background:labCss(colorRef.lab)}}/>색감 기준: <b>{colorRef.label}</b> ({{stage1:'1차',stage2:'2차',final:'최종'}[colorRef.stage]||'최종'}) · 다른 컷은 보정할 때 이 색감으로 맞춰집니다 <button type="button" className="subtle tiny" onClick={()=>chooseColorRef(null,null)}>기준 해제</button></p>}
      {cutList.map(slot=><CutRow key={slot.id} slot={slot} {...cutProps}/>)}
      {fitEnabled&&<CutRow slot={slots.fit} {...cutProps} onHide={null}/>}
      <div className="add-cuts" aria-label="컷 추가">
        <span>+ 컷 추가</span>
        {hiddenCuts.map(s=><button key={s.id} type="button" aria-label={`${s.id} 컷 추가`} onClick={()=>addCut(s.id)}>+ {s.label}</button>)}
        <button type="button" disabled={Object.keys(slots).length>=18} onClick={()=>addCut('__new')}>+ 직접 이름 정하기</button>
      </div>
    </fieldset>
    <div className="studio-workspace"><fieldset disabled={busy} className="studio-editor">
      <section className="editor-section"><h2>상품 정보와 공통 보정</h2>
        <label>옷 종류<select aria-label="옷 종류" value={garment} onChange={e=>changeGarment(e.target.value)}>{GARMENTS.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
        <label>상품 정보<textarea value={texts.product} maxLength={3000} placeholder="확인된 소재·색상·상품 정보만 입력하세요." onChange={e=>setText('product',e.target.value)}/></label>
        <label>상품 제목<input value={texts.headline} maxLength={200} onChange={e=>setText('headline',e.target.value)}/></label>
        <label>상품 설명<textarea value={texts.description} maxLength={4000} onChange={e=>setText('description',e.target.value)}/></label>
        <RetouchSettings value={retouch} onChange={setRetouch} status={ready} bir={bir} title="누끼·보정 설정 (모든 컷 기본값)"/>
        <p className="slot-note">컷마다 다르게 하려면 각 컷의 ‘1차 보정 설정’에서 바꾸세요.</p>
        {credits&&Number.isFinite(credits.available)&&credits.available<=3&&<p className="review-note">Photoroom 남은 이미지가 {credits.available}장입니다. 사진 1장 보정에 1장이 사용됩니다.</p>}
        <label>공통 밝기 · {brightness}%<input aria-label="공통 밝기" type="range" min="0" max="8" value={brightness} onChange={e=>setBrightness(Number(e.target.value))}/></label>
        <button onClick={()=>task(async()=>{setSlots(await refreshImages(slots));setStep('보정된 사진 전체에 공통 밝기를 적용했습니다.');})}>보정된 사진에 공통 밝기 적용</button>
        <div className="color-unify" aria-label="색감 통일">
          <h3>일관성 맞추기 <small>API 비용 없음</small></h3>
          <span className="btn-with-cost"><button type="button" className="primary" onClick={unifyAll}>모든 컷 일관성 맞추기 (색감·밝기·크기·여백·중앙)</button><Cost k="browser"/></span>
          <p className="slot-note">기준 색감(없으면 대표 사진)에 맞춰 모든 보정 컷의 색감·밝기를 맞추고, 같은 비율·크기·여백으로 가운데 정렬합니다. 각 컷의 ‘이전으로’로 색감을 되돌릴 수 있습니다.</p>
          <label className="check"><input type="checkbox" aria-label="같은 크기·여백으로 정렬" checked={frame.enabled} onChange={e=>{const fr={...frame,enabled:e.target.checked};setFrame(fr);task(async()=>setSlots(await refreshImages(slots,{frame:fr})));}}/>모든 보정 컷을 같은 비율·크기·여백으로 정렬</label>
          {frame.enabled&&<div className="frame-opts"><label>비율<select aria-label="정렬 비율" value={frame.ratio} onChange={e=>{const fr={...frame,ratio:e.target.value};setFrame(fr);task(async()=>setSlots(await refreshImages(slots,{frame:fr})));}}><option value="3:4">3:4 세로 (1500×2000)</option><option value="4:5">4:5 세로 (1600×2000)</option><option value="1:1">1:1 정사각 (1800×1800)</option></select></label>
            <label>여백 · {frame.margin}%<input aria-label="정렬 여백" type="range" min="0" max="20" value={frame.margin} onChange={e=>setFrame({...frame,margin:Number(e.target.value)})} onMouseUp={()=>task(async()=>setSlots(await refreshImages(slots)))} onTouchEnd={()=>task(async()=>setSlots(await refreshImages(slots)))} onKeyUp={()=>task(async()=>setSlots(await refreshImages(slots)))}/></label></div>}
          <h4>색감만 따로 맞추기</h4>
          {colorRef?<p className="color-ref"><i style={{background:labCss(colorRef.lab)}}/>기준: <b>{colorRef.label}</b>의 옷 대표 색 <button type="button" className="subtle" onClick={()=>setColorRef(null)}>기준 해제</button></p>
            :<p className="slot-note">컷별 보정의 사진 아래 ‘이 색감을 기준으로’에 체크하세요(1차·2차·최종 어느 단계든). 그 뒤 보정하는 다른 컷은 자동으로 그 색감에 맞춰집니다.</p>}
          <label>맞추는 강도 · {matchStrength}%<input aria-label="색감 맞추는 강도" type="range" min="10" max="100" step="10" value={matchStrength} onChange={e=>setMatchStrength(Number(e.target.value))}/></label>
          <button type="button" disabled={!colorRef} onClick={()=>matchColors(Object.keys(slots))}>기준 색감으로 다른 컷 지금 맞추기</button>
          <p className="slot-note">누끼·보정된 컷에만 적용됩니다. 한 번에 바꾸는 양에 한계를 둬서 색이 크게 틀어지지 않으며, 각 컷의 ‘이전으로’로 되돌릴 수 있습니다. 같은 컷에 여러 번 누르면 조금씩 더 맞춰집니다.</p>
        </div>
        <span className="btn-with-cost"><button className="primary" disabled={!slots.hero.source} onClick={()=>processPhotos()}>사진 일괄 누끼·보정 및 문구 제작</button><Cost k={cutoutCost(retouch)}/><Cost k="openai"/></span>
        <p className="slot-note">완료한 사진은 재사용합니다. 옆면·후면·모델 사진은 실제 사진을 넣었을 때만 사용합니다.</p>
      </section>
      <section className="editor-section"><h2>02 · Fit guide</h2><label className="check"><input type="checkbox" checked={fitEnabled} onChange={e=>{setFitEnabled(e.target.checked);setPreview(null);}}/>모델컷 적용</label><p>선택하고 모델 사진을 넣으면 표시됩니다. 사진이 없으면 전체 상세페이지에서 제외됩니다.</p>
        {fitEnabled&&<><label>Fit guide 제목<input maxLength={100} value={texts.fitTitle} onChange={e=>setText('fitTitle',e.target.value)}/></label><label>모델 설명<textarea maxLength={1500} value={texts.fitDescription} onChange={e=>setText('fitDescription',e.target.value)} placeholder="확인된 모델 키·착용 사이즈 등을 입력하세요."/></label><p className="slot-note">모델 사진은 위 ‘컷별 보정’의 모델컷 줄에서 넣고 보정합니다.</p></>}
      </section>
      <section className="editor-section"><h2>03 · Detail</h2><label>Detail 제목<input maxLength={100} value={texts.detailTitle} onChange={e=>setText('detailTitle',e.target.value)}/></label><p>디테일 사진은 위 ‘컷별 보정’에서 넣고 보정합니다. 사진이 없는 컷은 상세페이지에서 빠집니다.</p>
      </section>
      <section className="editor-section size-editor"><h2>04 · Size</h2><label>Size 제목<input maxLength={100} value={texts.sizeTitle} onChange={e=>setText('sizeTitle',e.target.value)}/></label>
        <img className="size-guide" src={guideUrl(garment)} alt={`${GARMENTS.find(g=>g.id===garment).label} 치수 가이드`}/>
        <p>단위: cm · 입력하지 않은 값은 ‘—’로 표시합니다.</p>
        <div className="size-scroll"><table><thead><tr>{sizeFields(garment).map(([key,label])=><th key={key}>{label}</th>)}<th>행 삭제</th></tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{sizeFields(garment).map(([key,label])=><td key={key}><input aria-label={`${i+1}행 ${label}`} value={row[key]} maxLength={key==='size'?16:12} inputMode={key==='size'?'text':'decimal'} onChange={e=>editSize(i,key,e.target.value)}/></td>)}<td><button aria-label={`${i+1}행 삭제`} disabled={rows.length===1} onClick={()=>{setSizeRows(current=>({...current,[garment]:rows.filter((_,index)=>i!==index)}));setPreview(null);}}>삭제</button></td></tr>)}</tbody></table></div>
        <button disabled={rows.length>=12} onClick={()=>{setSizeRows(current=>({...current,[garment]:[...rows,newSizeRow()]}));setPreview(null);}}>사이즈 행 추가</button>
        <label>치수 안내 문구<textarea maxLength={1500} value={texts.sizeNote} onChange={e=>setText('sizeNote',e.target.value)}/></label>
      </section>
      <ShopeePanel shopee={shopee} setShopee={setShopee} slots={slots} fitEnabled={fitEnabled} garment={garment} rows={rows} texts={texts} ready={ready} task={task} setStep={setStep} api={api} productName={productName}/>
    </fieldset><aside className="studio-preview"><h2>완성 상세페이지</h2><p>편집 후 ‘전체 미리보기’를 누르면 저장되는 이미지와 같은 구성을 확인할 수 있습니다.</p>{pendingCount>0&&<p className="review-note">보정 전 사진 {pendingCount}장이 포함되어 있습니다. 배경 제거가 필요하면 보정을 먼저 실행하세요.</p>}{previewBusy?<p>미리보기를 만들고 있습니다…</p>:preview?<img src={preview} alt="완성 상세페이지 미리보기"/>:<div className="preview-placeholder"><span>01 대표 정면샷</span><span>02 Fit guide · 선택</span><span>03 Detail</span><span>04 Size</span><button disabled={busy||!slots.hero.image} onClick={()=>exportPng(true)}>전체 미리보기</button></div>}</aside></div>
  </div>;
}
