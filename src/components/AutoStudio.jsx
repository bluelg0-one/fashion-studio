import {useEffect, useRef, useState} from 'react';
import './AutoStudio.css';
import {checkProduct, retryPlan, qaCsv, QA_STATUS_LABEL} from '../utils/qaCheck.js';
import {cutoutBounds, planDetails, garmentFrame, detailSlotId, detailIds, DETAIL_LABELS, DETAIL_MIN_SIDE} from '../utils/detailCrops.js';
import {removeStand} from '../utils/stand.js';
import {isOpaque, alphaFromWhite} from '../utils/alpha.js';
import {estimateCanvasTilt, rotateCanvas, borderColor, decideLevel, autoLevelAllowed, coverScale} from '../utils/level.js';
import {removeIslands, solidifyThin, removeHanger, removeMannequinTop, clearAboveFinial, restoreHook, clearWallPockets} from '../utils/cleanup.js';
import {GARMENTS, initialSlots, DETAIL_SLOTS, newSizeRow, sizeFields, guideUrl, documentBlocks, documentHtml} from '../utils/studioDocument.js';
import {DEFAULT_RETOUCH, POST_OPTIONS, sanitizeRetouch, DEFAULT_TONE, keepSavedHanger} from '../utils/retouchPresets.js';
import {RetouchSettings, cutoutCost} from './RetouchSettings.jsx';
import {CutRow, SHOT_LABEL} from './CutRow.jsx';
import {applyTone} from '../utils/matte.js';
import {getIopaintUrl, setIopaintUrl, checkIopaint, inspectImage, inspectTile, markedPreview, inpaint, removeBackground, checkBirefnet, DEFECT_LABEL} from '../utils/iopaint.js';
import {DEFECT_LEVELS, DEFAULT_DEFECT_LEVEL, garmentBox, tileGrid, mapFromTile, mergeRegions} from '../utils/defectTiles.js';
import {planFixes, flattenShadows, fillTransparent, mergeSpots, garmentShare, GARMENT_SHARE_MIN, findButtons, nearButtons} from '../utils/flatten.js';
import {listProducts, getProduct, saveProduct, deleteProduct, newProductId} from '../utils/productStore.js';
import DrivePanel from './DrivePanel.jsx';
import DriveImportPanel from './DriveImportPanel.jsx';
import {assignSlots} from '../utils/driveImport.js';
import {driveThumb, driveFull, driveFullWithOriginal, refThumb} from '../utils/drivePhotos.js';
import {markImported} from '../utils/importStore.js';
import {runAuto, levelFlag, areaFlag, opaqueFraction, colorFlag, deltaE, regionsFlag} from '../utils/autoPipeline.js';
import {claudeCost, PHOTOROOM} from '../utils/pricing.js';
import AutoFixPanel from './AutoFixPanel.jsx';
import {runSave, planSave, fileNames, sizeMissing, AUTO_CHANNELS} from '../utils/autoSave.js';
import {putOutputs, flushOutbox, driveReady} from '../utils/outbox.js';
import {channelPackage, channelPhotos} from '../utils/channelExport.js';
import {printOf} from '../utils/googleDrive.js';
import {shopeePhotos} from '../utils/shopeeExport.js';
import ShopeePanel from './ShopeePanel.jsx';
import InstagramPanel from './InstagramPanel.jsx';
import ChannelExportPanel from './ChannelExportPanel.jsx';
import {THEME_LIST, themeOf, renderThemed, themedHtml, NEW_PRODUCT_THEME, layoutOf} from '../utils/detailThemes.js';
import {colorChoice, colorMembers, colorSuggestions, linkColor, unlinkColor} from '../utils/colorChoice.js';
import {defaultInstagram} from '../utils/instagramExport.js';
import {COST, Cost} from './Cost.jsx';
import {HANGER_V2} from '../utils/appMode.js';
import CostPanel from './CostPanel.jsx';
import {addCost} from '../utils/costLog.js';
import {claudeRow, photoroomRow, openaiRow} from '../utils/costStats.js';
import {dominantLab, colorShift, applyShift, labCss, clearWhite} from '../utils/colorMatch.js';
import {readOriginal} from '../utils/studioImages.js';
import {frameMap, originalBox, composeCrop, DETAIL_MAX_SIDE} from '../utils/originalCrop.js';
import {readPhoto, imageCanvas, medianLight, whitePhoto, download, downloadBlob, renderDocument, compressPng, thumbnail, framePhoto} from '../utils/studioImages.js';

const defaultTexts=()=>({headline:'',description:'',product:'',intro:'',tagline:'',colorName:'',material:'',care:'',fitNote:'',colorTitle:'Color choice',infoTitle:'Info',backTitle:'Back',fitTitle:'Fit guide',fitDescription:'',detailTitle:'Detail',sizeTitle:'Size',sizeNote:'단위: cm · 단면 기준\n측정 위치와 방법에 따라 실측값에 차이가 있을 수 있습니다.'});
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

// COLOR CHOICE(015)용 저장소 접근. 연결 상품 정면 사진은 긴 변 720px JPG로 줄여 넣습니다.
const colorStore={list:listProducts,get:getProduct,save:saveProduct,shrink:src=>thumbnail(src,720)};
const MAX_VERSIONS=6;
const PHOTO_FIELDS=['source','original','image','cutout','crop','derived','status','versions','vIndex','retouch','ai','defects','matte','stage1','stage2','tone','shown','level','workSource','rawCut','raw2','auto'];
// 버전 한 칸 = {matte(원본과 위치가 같은 누끼), stage1(1차 결과), stage2(2차 결과)}. 예전 버전(문자열)은 1차 결과로 봅니다.
const entryOf=slot=>{const v=(slot.versions||[null])[slot.vIndex??0];return typeof v==='string'?{matte:null,stage1:v,stage2:null}:v||null;};
const entryFields=e=>e?{matte:e.matte||null,stage1:e.stage1||null,stage2:e.stage2||null,cutout:e.stage2||e.stage1||null,status:'done'}:{matte:null,stage1:null,stage2:null,cutout:null,status:'raw'};
// ops(014): 1차에 적용한 전체 보정 값 [{op:'tone'|'white'|'shift',...}] — 원본 해상도 디테일컷에 같은 값을 다시 씁니다.
// 같은 1차 위에서 만든 새 버전(2차 등)은 지금 버전의 ops를 그대로 물려받습니다.
function withEntry(slot,entry) {
  const cur=entryOf(slot);
  if(entry.ops===undefined&&cur?.ops&&cur.stage1===entry.stage1)entry={...entry,ops:cur.ops};
  const kept=(slot.versions||[null]).slice(0,(slot.vIndex??0)+1),versions=[...kept,entry].slice(-MAX_VERSIONS);
  return {...slot,...entryFields(entry),versions,vIndex:versions.length-1};
}
// 예전에 저장한 상품: 새 컷 종류를 더하고, 사진 있는 예전 칸은 그대로 둡니다.
function migrateSlots(saved) {
  const base=initialSlots(),out={};
  for(const [k,v] of Object.entries(base)){const o=saved?.[k];out[k]=o?{...v,...o,label:o.source?o.label:v.label}:v;}
  // 옷걸이 v2 자동 디테일컷(derived.from)은 원본 사진이 없어도 남깁니다(014 점검 C-1).
  for(const [k,v] of Object.entries(saved||{}))if(!(k in base)&&(v?.source||v?.derived?.from))out[k]=v;
  for(const v of Object.values(out))if(v.source&&!v.cutout&&entryOf(v)){const {status,...f}=entryFields(entryOf(v));Object.assign(v,f);}
  for(const v of Object.values(out))if(v.source&&!v.stage1&&v.cutout){const e=entryOf(v);Object.assign(v,{stage1:e?.stage1||v.cutout,stage2:e?.stage2||null,matte:e?.matte||null});}
  return out;
}
// 버전 이동은 브라우저에 저장된 결과만 바꾸므로 API 호출·과금이 없습니다.
export default function AutoStudio() {
  const [ready,setReady]=useState(null),[credits,setCredits]=useState(null),[retouch,setRetouch]=useState(DEFAULT_RETOUCH),[slots,setSlots]=useState(initialSlots),[fitEnabled,setFitEnabled]=useState(false);
  const [garment,setGarment]=useState('long-top'),[sizeRows,setSizeRows]=useState({});
  const [texts,setTexts]=useState(defaultTexts),[shopee,setShopee]=useState(defaultShopee),[instagram,setInstagram]=useState(defaultInstagram),[docTheme,setDocTheme]=useState('basic');
  // 수정할 곳 찾기 설정(이 브라우저에 기억): 민감도 · 넓은 상자 잘게 나누기
  const [defectOpts,setDefectOptsState]=useState(()=>{try{return {level:DEFAULT_DEFECT_LEVEL,engine2:'iopaint',stainAI:false,...JSON.parse(localStorage.getItem('fashion-studio-defects')||'{}')};}catch{return {level:DEFAULT_DEFECT_LEVEL,engine2:'iopaint',stainAI:false};}});
  const setDefectOpts=patchOpts=>setDefectOptsState(cur=>{const next={...cur,...patchOpts};try{localStorage.setItem('fashion-studio-defects',JSON.stringify(next));}catch{}return next;});
  const [iop,setIop]=useState(null),[bir,setBir]=useState(null),[iopUrl,setIopUrl]=useState(getIopaintUrl),[frame,setFrame]=useState({enabled:false,ratio:'3:4',margin:6}),[colorRef,setColorRef]=useState(null),[matchStrength,setMatchStrength]=useState(80);
  const [products,setProducts]=useState([]),[productId,setProductId]=useState(null),[productName,setProductName]=useState(''),[saveState,setSaveState]=useState(''),[localSavedAt,setLocalSavedAt]=useState(0);
  const skipSave=useRef(true),saveTimer=useRef(null),dirty=useRef(false),latest=useRef(null);
  const [brightness,setBrightness]=useState(0),[busy,setBusy]=useState(false),[step,setStep]=useState(''),[error,setError]=useState('');
  const [preview,setPreview]=useState(null),[previewBusy,setPreviewBusy]=useState(false);
  const [autoRequest,setAutoRequest]=useState(null),[detailReport,setDetailReport]=useState(null),[qa,setQa]=useState(null);
  const cache=useRef(new Map()),lock=useRef(false),previewUrl=useRef(null),costCut=useRef(''),costProduct=useRef('');
  // 유료 호출 비용 기록(이 브라우저 + 연결 시 드라이브 CSV). 기록 실패는 작업을 멈추지 않습니다.
  const logCost=row=>{addCost(row);};
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
  const snapshot=()=>({slots,texts,garment,sizeRows,fitEnabled,retouch,shopee,instagram,docTheme,color:{ref:colorRef,strength:matchStrength},frame,detailReport,qa});
  latest.current={id:productId,name:productName,data:snapshot()};
  async function applyProduct(product) {
    const d=product?.data||{};
    skipSave.current=true;dirty.current=false;clearTimeout(saveTimer.current);
    // 예전 버전이 대표 사진에서 자동으로 잘라 만든 디테일컷(원본 사진 없음)은 비웁니다.
    const nextSlots=Object.fromEntries(Object.entries(migrateSlots(d.slots)).map(([k,v])=>[k,v.derived===true&&!v.source?{...v,image:null,cutout:null,crop:null,derived:false,status:'empty'}:{...v,retouch:sanitizeRetouch(v.retouch)}]));
    setSlots(nextSlots);setTexts({...defaultTexts(),...d.texts});setGarment(d.garment||'long-top');setSizeRows(d.sizeRows||{});
    setFitEnabled(Boolean(d.fitEnabled));setRetouch(sanitizeRetouch(keepSavedHanger(d.retouch)));setShopee({...defaultShopee(),...d.shopee});setInstagram({...defaultInstagram(),...d.instagram});setDocTheme(themeOf(d.docTheme).id);
    setDetailReport(d.detailReport||null);setQa(d.qa||null);setColorRef(d.color?.ref||null);setFrame({enabled:false,ratio:'3:4',margin:6,...d.frame});setMatchStrength(d.color?.strength??80);
    setProductId(product.id);setProductName(product.name||'');setPreview(null);setSaveState('saved');
  }
  // 인자 없이 부르면 ‘화면의 최신 상태’를 저장하되, 저장 안 된 편집이 있을 때만 저장합니다.
  // (자동 보정·완성본 저장처럼 오래 걸리는 작업 뒤에 예전 화면 상태로 덮어쓰지 않도록)
  async function saveNow(id,name,data) {
    if(id===undefined){if(!dirty.current)return;({id,name,data}=latest.current);}
    if(!id)return;
    clearTimeout(saveTimer.current);dirty.current=false;
    // 편집 화면이 다루지 않는 값(예: 상세페이지 확인 detailApproved)은 저장된 값을 그대로 둡니다.
    try {setSaveState('saving');const old=await getProduct(id);await saveProduct({id,name,data:{...(old?.data||{}),...data}});setSaveState('saved');setLocalSavedAt(Date.now());setProducts(await listProducts());}
    catch(e){setSaveState('error');setError(`자동 저장 실패: ${e.message} 작업은 화면에 남아 있으니 다운로드로 보관하세요.`);}
  }
  useEffect(()=>{(async()=>{
    // 저장된 상품을 다 불러올 때까지 편집을 잠가 업로드가 덮어써지지 않게 합니다.
    lock.current=true;setBusy(true);setStep('저장된 상품을 불러오는 중');
    try {
      const list=await listProducts();
      if(list.length)await applyProduct(await getProduct(list[0].id));
      else {const product={id:newProductId(),name:'상품 1',data:{docTheme:NEW_PRODUCT_THEME}};await saveProduct(product);await applyProduct(product);}
      setProducts(await listProducts());
      setStep('');
    } catch(e){setSaveState('error');setStep('');setError(`상품 저장소를 쓸 수 없습니다 (${e.message}). 작업은 이 화면에서만 유지됩니다.`);}
    finally {lock.current=false;setBusy(false);}
  })();},[]);
  useEffect(()=>{
    if(!productId)return;
    if(skipSave.current){skipSave.current=false;return;}
    dirty.current=true;setSaveState('pending');clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(()=>saveNow(),800);
    return()=>clearTimeout(saveTimer.current);
  },[slots,texts,garment,sizeRows,fitEnabled,retouch,shopee,instagram,docTheme,productName,colorRef,matchStrength,frame,detailReport,qa]);
  async function switchProduct(id) {
    if(id===productId)return;
    await task(async()=>{await saveNow();await applyProduct(await getProduct(id));setStep('상품을 불러왔습니다.');});
  }
  async function addProduct() {
    await task(async()=>{
      await saveNow();
      const product={id:newProductId(),name:`상품 ${products.length+1}`,data:{docTheme:NEW_PRODUCT_THEME}};
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
      else {const product={id:newProductId(),name:'상품 1',data:{docTheme:NEW_PRODUCT_THEME}};await saveProduct(product);await applyProduct(product);}
      setProducts(await listProducts());setStep('상품을 삭제했습니다.');
    });
  }
  // ---- 자동 수평 (브라우저 계산, 무료) ----
  // 원본은 그대로 두고, 바로 세운 사본(workSource)으로 누끼를 땁니다. 돌리며 생긴 모서리는 벽 색으로 채워 누끼 때 배경으로 지워집니다.
  // zoom: 확대·디테일 컷을 돌릴 때 모서리가 비지 않도록 가운데 기준으로 확대(안쪽으로 잘라 냄). 정면 전체 등은 1(모서리는 벽 색 → 누끼 때 배경).
  async function levelSource(source,angle,zoom=1) {
    if(!angle)return null;
    const c=await imageCanvas(source),fill=borderColor(c.getContext('2d').getImageData(0,0,c.width,c.height));
    const r=rotateCanvas(c,angle,fill,zoom);
    return source.startsWith('data:image/png')?r.toDataURL('image/png'):r.toDataURL('image/jpeg',.95);
  }
  const zoomFor=async(slotId,source,angle,shot)=>{if(!angle||autoLevelAllowed(slotId,shot))return 1;const c=await imageCanvas(source);return Math.round(coverScale(c.width,c.height,angle)*10000)/10000;};
  // 새 사진을 넣을 때(013 팀장 결정): 자동 수평은 기본으로 끔. 기울기는 계산해서 '수평 제안 n°'(suggest)로만 보여 주고, 누를 때만 돌립니다.
  // '자동 수평 (실험)'을 켜면 예전처럼 정면 전체·측면·후면만, 세로·가로 근거가 같은 방향·비슷한 각도이고 ±4° 안일 때만 돌립니다.
  async function initialLevel(source,options,slotId,shot) {
    const none={angle:0,auto:null,confidence:null,manual:false,zoom:1,reason:null,review:false,suggest:0};
    // 옷걸이 v2(014 사장님 결정): 회전 없음. 옷걸이 사진은 걸린 그대로가 정상이라 기울기 계산도 하지 않습니다.
    if(HANGER_V2)return {level:none,workSource:null};
    const est=estimateCanvasTilt(await imageCanvas(source)),d=decideLevel(est);
    const base={...none,auto:est.angle,confidence:est.confidence,suggest:d.angle,reason:d.reason};
    if(options?.autoLevelBeta!==true)return {level:base,workSource:null};
    if(!autoLevelAllowed(slotId,shot))return {level:{...base,reason:'확대·디테일 컷은 자동 수평을 하지 않음'},workSource:null};
    return {level:{...base,angle:d.angle,review:d.review},workSource:await levelSource(source,d.angle,1)};
  }
  // 수평 바꾸기: 'auto'(다시 계산) · 숫자(직접 각도). 이미 누끼를 딴 사진은 바로 다시 처리합니다
  // (Photoroom은 저장된 결과를 차이만큼 돌려 쓰므로 다시 과금하지 않음).
  async function levelFor(id,value) {
    const slot=slots[id];if(!slot?.source)return;
    let next=null;
    await task(async()=>{
      let level;
      if(value==='auto'){const est=estimateCanvasTilt(await imageCanvas(slot.source)),d=decideLevel(est);level={angle:d.angle,auto:est.angle,confidence:est.confidence,manual:false,reason:d.reason,review:d.review};}
      else level={...(slot.level||{auto:null,confidence:null}),angle:Math.max(-10,Math.min(10,Math.round(Number(value)*10)/10)),manual:true,reason:null,review:false};
      level.zoom=await zoomFor(id,slot.source,level.angle,slot.ai?.shot);
      const workSource=await levelSource(slot.source,level.angle,level.zoom);
      next={...slots,[id]:{...slot,level,workSource}};setSlots(next);
      setStep(`${slot.label} · 수평 ${level.angle>0?'+':''}${level.angle}°${value==='auto'?` (자동${level.confidence!=null?`, 신뢰도 ${Math.round(level.confidence*100)}%`:''}${level.reason?` — ${level.reason}`:''})`:''}${level.zoom>1?` · 모서리가 비지 않게 ${Math.round((level.zoom-1)*1000)/10}% 안쪽으로 잘라 냄`:''}`);
    });
    if(next&&slot.stage1)await processPhotos(id,next);
  }
  async function upload(id,file) {
    await task(async()=>{
      const source=await readPhoto(file),canvas=await imageCanvas(source);
      // 옷걸이 v2: 정면·후면은 원본(줄이기 전)도 보관 → 디테일컷을 원본 해상도에서 자름(014)
      const original=HANGER_V2&&(id==='hero'||id==='back')?await readOriginal(file):null;
      const lv=await initialLevel(source,slots[id]?.retouch||retouch,id);
      patch(id,{source,original,...lv,image:whitePhoto(canvas,null,0),cutout:null,matte:null,stage1:null,stage2:null,defects:null,tone:{...DEFAULT_TONE},rawCut:null,auto:null,crop:null,derived:false,status:'raw',enabled:true,shown:true,versions:[null],vIndex:0});
      setStep('사진을 넣었습니다. 누끼·보정을 적용하거나 사진을 더 추가하세요.');
    });
  }
  // 배경 지우기 결과(원본과 같은 위치·크기의 누끼). 같은 사진·같은 설정은 다시 과금하지 않습니다.
  // 누끼 뒤 정리(무료): 옷걸이 → 마네킹 꼭지·목 받침 → 떨어진 조각 순서로 알파만 고칩니다.
  // src: 누끼를 딴 사진(같은 크기·위치). 있으면 벽 색을 재서 옷걸이 고리 끝 살리기·닫힌 틈의 벽 지우기를 합니다(013-B).
  async function cleanMatte(url,options,src=null) {
    const c=await imageCanvas(url),ctx=c.getContext('2d'),px=ctx.getImageData(0,0,c.width,c.height);
    let sp=null,wall=null;
    if(src){const sc=await imageCanvas(src);if(sc.width===c.width&&sc.height===c.height){sp=sc.getContext('2d').getImageData(0,0,sc.width,sc.height);wall=borderColor(sp);}}
    if(options.hangerMode==='remove')removeHanger(px);else {solidifyThin(px);if(sp)restoreHook(px,sp,wall);}
    if(wall)clearWallPockets(px,wall);
    // 마네킹 꼭지는 남기되(사장님 결정), 꼭지 맨 위보다 위에 남은 벽 걸이 부품 등은 지웁니다.
    if(options.cleanMannequinTop)removeMannequinTop(px);else if(options.clearFinial!==false)clearAboveFinial(px);
    if(options.cleanIslands!==false)removeIslands(px);
    ctx.putImageData(px,0,0);
    return c.toDataURL('image/png');
  }
  // 반환: {matte: 정리까지 끝난 누끼, raw: Photoroom 원본 결과(사진에 저장 → 정리 옵션만 바꿔 다시 돌려도 재과금 없음)}
  async function engineMatte(source,warnings,options,saved,angle=0,work=null,zoom=1) {
    const cut=await engineCut(source,warnings,options,saved,angle,work,zoom);
    return {matte:await cleanMatte(cut.url,options,angle&&work?work:source),raw:cut.raw||null,charged:Boolean(cut.charged)};
  }
  // 받침대 기둥 지우기(무료): BiRefNet·Photoroom 모두 기둥을 옷의 일부로 남기는 경우가 있어 같은 방법으로 지웁니다.
  // 사진 아래에서 올라오는 좁고 곧은 무채색 기둥만 지웁니다(stand.js).
  function standCleanup(c,options) {
    if(options.removeStand===false)return;
    const ctx=c.getContext('2d'),px=ctx.getImageData(0,0,c.width,c.height);
    if(removeStand(px))ctx.putImageData(px,0,0);
  }
  // angle·work: 자동 수평으로 바로 세운 원본(work)과 그 각도. 누끼는 바로 세운 사진으로 땁니다.
  async function engineCut(source,warnings,options,saved,angle=0,work=null,zoom=1) {
    const input=angle&&work?work:source;
    if(options.cutout==='birefnet'){
      const rawKey='birefnet:'+input;
      if(!cache.current.has(rawKey))cache.current.set(rawKey,await removeBackground(input));
      const c=await imageCanvas(cache.current.get(rawKey));
      standCleanup(c,options);
      cutoutBounds(c.getContext('2d').getImageData(0,0,c.width,c.height));
      return {url:c.toDataURL('image/png')};
    }
    // Photoroom: 중앙 정렬은 브라우저에서 하므로 원본 위치 그대로 받습니다(직접 수정 붓이 원본과 맞도록).
    // 정리 옵션(POST_OPTIONS)은 요청에서 빼서, 바꿔도 같은 요청 = 같은 결과(재과금 없음)로 봅니다.
    const req={...options,center:false};for(const k of POST_OPTIONS)delete req[k];
    // 재과금 기준은 ‘원본 사진 + 요청 설정’입니다. 수평 각도만 바꾸면 저장된 결과를 각도 차이만큼 돌려 씁니다(무료).
    const key='photoroom:'+JSON.stringify(req)+source;
    let hit=cache.current.get(key)||(saved?.key===key?{image:saved.image,angle:saved.angle||0,zoom:saved.zoom||1}:null);
    let charged=false;
    if(!hit){
      const response=await api('retouch',{image:input,options:req});charged=true;
      logCost(photoroomRow({feature:'photoroom_cutout',product:costProduct.current||productName,cut:costCut.current}));
      if(response.openai)logCost(openaiRow({feature:'openai_edit',product:costProduct.current||productName,cut:costCut.current,...response.openai}));
      if(response.warning){warnings.push(response.warning);return {url:await photoroomCleanup(response.image,options),charged:true};}
      hit={image:response.image,angle:input===source?0:angle,zoom:input===source?1:zoom};cache.current.set(key,hit);
    } else logCost(photoroomRow({feature:'photoroom_cutout',product:costProduct.current||productName,cut:costCut.current,cached:true}));
    let raw=hit.image;
    // 저장된 결과(각도 a1·확대 k1) → 지금(a2·k2): 가운데 기준 회전(a2−a1)·확대(k2/k1)를 한 번 더 하면 같습니다.
    const delta=Math.round((angle-(hit.angle||0))*100)/100,curZoom=angle?zoom:1,ratio=curZoom/(hit.zoom||1);
    if(delta||Math.abs(ratio-1)>1e-4)raw=rotateCanvas(await imageCanvas(raw),delta,null,ratio).toDataURL('image/png');
    return {url:await photoroomCleanup(raw,options),raw:{key,image:hit.image,angle:hit.angle||0,zoom:hit.zoom||1},charged};
  }
  // Photoroom 결과 정리(무료): 흰 배경으로 왔으면 가장자리 흰색을 투명으로 되살리고, 받침대 기둥을 지웁니다.
  // 고스트 마네킹·플랫레이·배경 유지는 모양이 다른 결과라 건드리지 않습니다.
  async function photoroomCleanup(url,options) {
    const c=await imageCanvas(url),ctx=c.getContext('2d'),px=ctx.getImageData(0,0,c.width,c.height);
    if(options.removeBackground===false||options.mannequin==='ghost'||options.mannequin==='flatlay'){cutoutBounds(px);return url;}
    if(isOpaque(px)&&alphaFromWhite(px))ctx.putImageData(px,0,0);
    standCleanup(c,options);
    cutoutBounds(ctx.getImageData(0,0,c.width,c.height));
    return c.toDataURL('image/png');
  }
  // 1차 결과 = 누끼 + 색상 보정(밝기·화사함) + 기준 색감 맞춤(다른 컷이 기준일 때) + 중앙 정렬
  // ops 배열을 넘기면 적용한 값을 순서대로 담습니다(014 원본 해상도 디테일컷용).
  async function buildStage1(matte,{options,tone,slotId,ref=colorRef,ops=null}) {
    let c=await imageCanvas(matte);
    const ctx=c.getContext('2d'),px=ctx.getImageData(0,0,c.width,c.height);
    applyTone(px,tone||{});if(ops&&(tone?.bright||tone?.vivid))ops.push({op:'tone',bright:tone.bright||0,vivid:tone.vivid||0});
    // 흰·아이보리 옷이면 누런 기를 약하게 덜고 밝은 부분을 살짝 올립니다(013-B, 실물과 다르지 않게 최대 Lab 5·밝기 +3).
    if(options?.clearWhite!==false){const w=clearWhite(px);if(ops&&w.applied)ops.push({op:'white',a:w.shift.a,b:w.shift.b});}
    if(ref&&ref.slotId!==slotId){try{const sh=colorShift(dominantLab(px),ref.lab,matchStrength/100);applyShift(px,sh);if(ops&&(sh.L||sh.a||sh.b))ops.push({op:'shift',...sh});}catch{}}
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
  async function processPhotos(onlyId,base) {
    await task(async()=>{
      const status=await api('status');setReady(status);
      let current={...(base||slots)};const warnings=[];
      const pending=Object.values(current).filter(slot=>slot.source&&(onlyId?slot.id===onlyId:slot.enabled&&(slot.id!=='fit'||fitEnabled)&&slot.status!=='done'));
      const engines=new Set(pending.map(slot=>cutoutCost(slot.retouch||retouch)));
      if(engines.has('photoroom')&&!status.photoroom)throw new Error('서버에 Photoroom API 키(PHOTOROOM_API_KEY)가 연결되지 않았습니다. Vercel 환경변수에 등록한 뒤 다시 배포하거나, 배경 지우기 엔진을 BiRefNet(무료)으로 바꾸세요.');
      if(engines.has('birefnet'))setBir(await checkBirefnet());
      for(let index=0;index<pending.length;index++){
        const slot=pending[index];setStep(`${index+1}/${pending.length} · ${slot.label} 배경 제거 (${cutoutCost(slot.retouch||retouch)==='birefnet'?'BiRefNet · 내 PC, 수십 초 걸릴 수 있음':'Photoroom'})`);
        costCut.current=slot.label;
        const options=slot.retouch||retouch,{matte,raw}=await engineMatte(slot.source,warnings,options,slot.rawCut,slot.level?.angle||0,slot.workSource,slot.level?.zoom||1);
        const ops=[],stage1=await buildStage1(matte,{options,tone:slot.tone,slotId:slot.id,ops});
        const prev=entryOf(slot);
        // 같은 결과(저장된 결과 재사용)는 버전을 새로 늘리지 않습니다.
        current={...current,[slot.id]:{...(prev&&prev.stage1===stage1&&!prev.stage2?{...slot,...entryFields(prev)}:{...withEntry(slot,{matte,stage1,stage2:null,ops}),defects:null}),rawCut:raw||slot.rawCut||null}};
        current=await refreshImages(current);
        setSlots(current);
      }
      if(!onlyId&&!texts.headline&&current.hero.source&&status.openai){
        setStep('확인된 상품 정보로 문구 작성 중');
        const copy=await api('analyze',{image:current.hero.source,product:texts.product});
        logCost(openaiRow({feature:'openai_copy',product:productName,cut:current.hero.label,model:copy.model,usage:copy.usage}));
        setTexts(value=>({...value,headline:copy.headline,description:[copy.description,...copy.points].join('\n')}));
      }
      if(warnings.length)setError(warnings.join('\n'));
      refreshCredits();
      setStep(`완료 · 사진과 문구를 확인한 후 전체 이미지를 저장하세요.${!onlyId&&!status.openai?' (OpenAI 키가 없어 문구 자동 작성은 건너뛰었습니다.)':''}`);
    });
  }
  // ---- 자동 점검(014-2): 검증 기준서의 자동 측정 항목(qaCheck.js) ----
  async function qaOf(data) {
    // hanger: 이 컷에 실제로 쓰인 옷걸이 설정(016: 지우기면 '옷걸이 잔여물 없음', 남기기면 '고리 유지'를 점검)
    const load=async slot=>{if(!slot?.cutout)return null;const e=entryOf(slot)||{};return {matte:e.matte?await pixelsOf(e.matte):null,stage1:e.stage1?await pixelsOf(e.stage1):null,final:await pixelsOf(slot.cutout),hanger:{...keepSavedHanger(data.retouch),...(slot.retouch||{})}.hangerMode||'keep'};};
    return checkProduct({front:await load(data.slots?.hero),back:await load(data.slots?.back),details:data.detailReport||null});
  }
  async function runQa() {
    await task(async()=>{
      setStep('자동 점검 중 (브라우저 계산, 무료)');
      const r=await qaOf({slots,detailReport,retouch});
      setQa({status:r.status,reasons:r.reasons,checks:r.checks,attempts:0,owner:r.status!=='pass',at:Date.now(),manual:true});
      setStep(`자동 점검: ${QA_STATUS_LABEL[r.status]}${r.reasons.length?` · ${r.reasons.join(' · ')}`:''}`);
    });
  }
  // ---- 옷걸이 v2 디테일컷(014): 보정이 끝난 정면·후면(지금 버전의 2차, 없으면 1차)에서 잘라 냅니다 ----
  // 사장님 결정: 실제 사진만 씀(생성 없음). 원본 기준 긴 변 800px이 안 나오면 키우지 않고 빼고 '해상도 부족'으로 표시합니다.
  // ai: 확신 없는 디테일(단추 없음·소매가 붙음 등)만 Claude 1회로 상자를 받음(선택·유료, 같은 사진은 다시 부르지 않음).
  async function buildDetails(cur,garmentId,{ai=false,product=productName}={}) {
    const hero=cur.hero,back=cur.back,front=hero?.cutout?await pixelsOf(hero.cutout):null,backPx=back?.cutout?await pixelsOf(back.cutout):null;
    // 보정본 px / 원본 px. 원본(줄이기 전)을 보관했으면 원본 기준(1보다 작을 수 있음 → 원본에서 자름), 없으면 누끼 기준(1 이상, 키우지 않음)
    const geo={};
    for(const [k,slot,px] of [['front',hero,front],['back',back,backPx]]){
      const m=(entryOf(slot)||{}).matte||slot?.matte;if(!m||!px){geo[k]={s:1};continue;}
      const mp=await pixelsOf(m),map=frameMap(mp,px);if(!map){geo[k]={s:1};continue;}
      if(slot.original){const oc=await imageCanvas(slot.original),ratio=oc.width/mp.width;geo[k]={s:map.sx/ratio,map,ratio,oc,mp};}
      else geo[k]={s:Math.max(1,map.sx)};
    }
    const scale={front:geo.front.s,back:geo.back.s};
    let plan=planDetails({front,back:backPx,garment:garmentId,scale}),aiUsed=false,cost=null;
    const unsure=front?plan.skipped.filter(x=>x.review).map(x=>x.id):[];
    if(ai&&unsure.length){
      const key='details:'+unsure.join(',')+':'+hero.cutout;
      let res=cache.current.get(key),cached=Boolean(res);
      if(!res){
        const status=await api('status');setReady(status);
        if(!status.claude)throw new Error('서버에 Claude API 키(ANTHROPIC_API_KEY)가 없어 디테일 위치를 찾을 수 없습니다. ‘Claude로 위치 찾기’를 끄고 다시 하세요.');
        res=await api('details',{...(await inspectImage(hero.cutout)),ids:unsure});cache.current.set(key,res);
      }
      logCost(claudeRow({feature:'details',product,cut:hero.label,responses:[res],boxes:Object.keys(res.details||{}).length,cached}));
      cost=cached?null:{claude:claudeCost(res.model,res.usage)||0,claudeUnknown:claudeCost(res.model,res.usage)==null?1:0};
      plan=planDetails({front,back:backPx,garment:garmentId,scale,ai:res.details});aiUsed=true;
    }
    const next={};
    for(const [k,v] of Object.entries(cur))if(!v?.derived?.from)next[k]=v;
    const fit=(w,h)=>{const k=Math.min(1,DETAIL_MAX_SIDE/Math.max(w,h));return [Math.max(1,Math.round(w*k)),Math.max(1,Math.round(h*k))];};
    const canvasOf=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.imageSmoothingQuality='high';return [c,g];};
    for(const it of plan.items){
      const src=it.from==='front'?hero:back,G=geo[it.from],{x,y,w,h}=it.box,e=entryOf(src)||{};let png,origin='보정본';
      if(G.oc){
        // 원본 해상도: 원본 조각 + 같은 보정 값(ops) + 늘린 누끼 알파 + 2차가 바꾼 곳만 늘린 최종 픽셀
        const ob=originalBox(it.box,G.map,G.ratio,G.oc.width,G.oc.height),[W,H]=fit(ob.w,ob.h);
        const grab=async(url,sx,sy,sw,sh)=>{const [c,g]=canvasOf(W,H);g.drawImage(url instanceof HTMLCanvasElement?url:await imageCanvas(url),sx,sy,sw,sh,0,0,W,H);return g.getImageData(0,0,W,H);};
        const orig=await grab(G.oc,ob.x,ob.y,ob.w,ob.h);
        const [mx,my]=G.map.toMatte(x,y),alpha=await grab(e.matte,mx,my,w/G.map.sx,h/G.map.sx);
        const s1=e.stage2&&e.stage1?await grab(e.stage1,x,y,w,h):null,s2=s1?await grab(e.stage2,x,y,w,h):null;
        const {image}=composeCrop({orig,alpha,s1,s2,ops:e.ops||[]});
        const [c,g]=canvasOf(W,H);g.putImageData(image,0,0);png=c.toDataURL('image/png');origin='원본';
      } else {
        const c=await imageCanvas(src.cutout),s=Math.max(1,G.s||1),[W,H]=fit(w/s,h/s),[out,g]=canvasOf(W,H);
        g.drawImage(c,x,y,w,h,0,0,W,H);png=out.toDataURL('image/png');
      }
      const id=detailSlotId(it.id),old=cur[id],side=it.outSide>DETAIL_MAX_SIDE?DETAIL_MAX_SIDE:it.outSide;
      next[id]={id,label:it.label,enabled:old?.enabled??true,source:null,image:null,cutout:png,stage1:png,stage2:null,matte:null,status:'done',versions:[null],vIndex:0,
        derived:{from:src.id,detail:it.id,box:it.box,side,origin,at:Date.now()}};
    }
    return {slots:next,report:{items:plan.items.map(({id,label,from,outSide})=>({id,label,from,outSide})),skipped:plan.skipped,ai:aiUsed,garment:garmentId,at:Date.now()},cost};
  }
  async function makeDetails() {
    await task(async()=>{
      if(!slots.hero.cutout)throw new Error('먼저 옷걸이 정면을 누끼·보정해 주세요.');
      setStep('정면·후면에서 디테일컷을 잘라 내는 중 (브라우저 계산, 무료)');
      const r=await buildDetails(slots,garment,{ai:Boolean(defectOpts.detailAI)});
      setSlots(await refreshImages(r.slots));setDetailReport(r.report);
      const review=r.report.skipped.filter(x=>x.review).length;
      setStep(`디테일컷 ${r.report.items.length}장을 만들었습니다${r.report.skipped.length?` · 빠짐 ${r.report.skipped.length}(${r.report.skipped.map(x=>`${x.label}: ${x.reason}`).join(' · ')})`:''}${review?' · 위치 확인이 필요한 디테일은 ‘Claude로 위치 찾기’를 켜고 다시 누를 수 있습니다(유료)':''}.`);
    });
  }
  // ---- 색감 통일 (브라우저 계산, API 비용 없음) ----
  async function matchedCutout(src,lab,strength=matchStrength/100) {
    const c=await imageCanvas(src),ctx=c.getContext('2d'),pixels=ctx.getImageData(0,0,c.width,c.height);
    const shift=colorShift(dominantLab(pixels),lab,strength);
    applyShift(pixels,shift);ctx.putImageData(pixels,0,0);
    return {image:c.toDataURL('image/png'),shift};
  }
  // 1차·2차를 같은 양만큼 옮겨 새 버전으로
  async function matchedEntry(slot,lab,strength) {
    const e=entryOf(slot)||{stage1:slot.cutout};
    const m1=e.stage1?await matchedCutout(e.stage1,lab,strength):null,stage1=m1?.image||null,stage2=e.stage2?(await matchedCutout(e.stage2,lab,strength)).image:null;
    const sh=m1?.shift,ops=[...(e.ops||[]),...(sh&&(sh.L||sh.a||sh.b)?[{op:'shift',...sh}]:[])];
    return withEntry(slot,{matte:e.matte||null,stage1,stage2,ops});
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
      const ops=[],stage1=await buildStage1(matte,{options,tone:slot.tone,slotId:id,ops});
      setSlots(await refreshImages({...slots,[id]:{...withEntry(slot,{matte,stage1,stage2:null,ops}),defects:null}}));
      setStep(`${slot.label} · 배경 직접 수정을 적용했습니다 (무료). 2차 보정을 했다면 다시 해 주세요.`);
    });
  }
  async function toneFor(id,tone) {
    await task(async()=>{
      const slot=slots[id],options=slot.retouch||retouch,e=entryOf(slot)||{};
      const base=e.matte||slot.matte;
      if(!base)throw new Error('이 컷은 예전 방식으로 보정되어 색상 보정을 하려면 ‘이 사진 누끼·보정’을 한 번 더 눌러 주세요(같은 사진이면 다시 과금하지 않을 수 있습니다).');
      const ops=[],stage1=await buildStage1(base,{options,tone,slotId:id,ops});
      setSlots(await refreshImages({...slots,[id]:{...withEntry(slot,{matte:base,stage1,stage2:null,ops}),tone,defects:null}}));
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
  // 민감도별 호출: 보통 1회(사진 전체) · 적극 4회(옷 영역 2×2 타일) · 최대 9회(3×3). 같은 사진·같은 민감도는 다시 부르지 않습니다.
  async function findRegions(cutout,level) {
    const key='defects:'+level+':'+cutout;
    if(cache.current.has(key))return {regions:cache.current.get(key),cached:true,responses:[]};
    const n=(DEFECT_LEVELS[level]||DEFECT_LEVELS.normal).grid,responses=[];
    let regions;
    try {
      if(n<=1){const r=await api('defects',{...(await inspectImage(cutout)),level});responses.push(r);regions=r.regions;}
      else {
        const c=await imageCanvas(cutout),tiles=tileGrid(garmentBox(c.getContext('2d').getImageData(0,0,c.width,c.height)),n),all=[];
        for(let i=0;i<tiles.length;i++){
          setStep(`Claude가 수정할 곳을 찾는 중 · 타일 ${i+1}/${tiles.length}`);
          const r=await api('defects',{...(await inspectTile(cutout,tiles[i])),level,tile:true});responses.push(r);
          all.push(...r.regions.map(x=>mapFromTile(x,tiles[i],c.width,c.height)));
        }
        regions=mergeRegions(all).slice(0,40);
      }
    } catch(e) {
      // 중간에 실패해도 이미 끝난 타일은 과금되었으므로 기록합니다.
      if(responses.length)e.partial=responses;
      throw e;
    }
    cache.current.set(key,regions);
    return {regions,cached:false,responses};
  }
  async function findDefectsFor(id) {
    await task(async()=>{
      const slot=slots[id];if(!slot?.cutout)throw new Error('먼저 ‘이 사진 누끼·보정’으로 배경을 지운 뒤 찾아 주세요.');
      const status=await api('status');setReady(status);
      if(!status.claude)throw new Error('서버에 Claude API 키(ANTHROPIC_API_KEY)가 연결되지 않았습니다.');
      const level=defectOpts.level||DEFAULT_DEFECT_LEVEL;
      setStep(`Claude가 ${slot.label}에서 얼룩·구김을 찾는 중 (민감도: ${DEFECT_LEVELS[level].label})`);
      let res;
      try {res=await findRegions(slot.cutout,level);}
      catch(e){if(e.partial)logCost(claudeRow({feature:'defects',product:productName,cut:slot.label,level,responses:e.partial,boxes:e.partial.reduce((a,r)=>a+r.regions.length,0)}));throw e;}
      const {regions:found,cached}=res;
      logCost(claudeRow({feature:'defects',product:productName,cut:slot.label,level,responses:res.responses,boxes:found.length,cached}));
      // 사장님이 직접 표시한 곳은 그대로 두고, Claude가 찾은 곳만 새로 바꿉니다.
      const old=slot.defects||{regions:[],selected:[]},kept=old.regions.map((r,i)=>({r,on:old.selected.includes(i)})).filter(x=>x.r.manual);
      const regions=[...found,...kept.map(x=>x.r)];
      // 적극·최대는 신뢰도가 낮은 표시(0.3 이상)도 미리 골라 둡니다(지우기 전에 사장님이 확인).
      const minConf=level==='normal'?.5:.3;
      const selected=[...found.map((r,i)=>r.confidence>=minConf?i:-1).filter(i=>i>=0),...kept.map((x,k)=>x.on?found.length+k:-1).filter(i=>i>=0)];
      const preview=await markedPreview(slot.cutout,regions,selected);
      patch(id,{defects:{regions,selected,preview}});
      setStep((found.length?`${slot.label} · Claude가 수정할 곳 ${found.length}곳을 표시했습니다 (민감도 ${DEFECT_LEVELS[level].label}${cached?', 저장된 결과 재사용·추가 비용 없음':''}). 빠진 곳은 ‘직접 표시하기’로 추가하고 ‘선택한 곳 고치기’를 누르세요.`:`${slot.label} · Claude가 고칠 곳을 찾지 못했습니다. 필요하면 ‘직접 표시하기’로 표시하거나 민감도를 높여 보세요.`));
    });
  }
  async function pixelsOf(src){const c=await imageCanvas(src);return c.getContext('2d').getImageData(0,0,c.width,c.height);}
  function dataUrlOf(img){const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').putImageData(new ImageData(img.data,img.width,img.height),0,0);return c.toDataURL('image/png');}
  // ---- 2차 보정(013): 종류별로 나눠 고치기 ----
  // 구김 = 그림자 펴기(브라우저 계산: 밝기 저주파만 주변에 맞춤, 니트 결·색은 그대로 → 회색이 들어갈 수 없음)
  // 작은 얼룩·먼지·실밥 = IOPaint(투명한 곳을 가까운 옷 색으로 채운 사진에서 지우고, 결과에 원래 누끼 알파를 다시 씌움)
  // 마네킹·벽 표시, 넓은 얼룩 = 건너뜀(사장님이 직접 표시한 곳은 그대로 고침)
  // 고친 곳마다 전·후의 채도·결 세기를 비교해, 회색으로 바랬거나 결이 사라진 곳은 자동으로 원래대로 되돌립니다.
  // (예전 방식: 넓은 구김을 작은 상자로 나눠 LaMa로 지움 → 실제 니트에서 회색 얼룩·후드 끈 지워짐, 보고서 013)
  // closeup(013-C): 확대·디테일 컷은 LaMa에 보내는 상자가 픽셀로 넓어 결 대신 회색을 채우고(원단 디테일의 단추 사이 회색 얼룩), 단추 찾기도
  // 크기 기준이 맞지 않습니다. 그래서 확대 컷의 자동 표시 얼룩은 IOPaint로 보내지 않고 '확인 필요'로 남깁니다(구김 펴기는 함, 직접 표시는 보냄).
  // spots=false(014-2 다시 편집): 얼룩은 IOPaint로 보내지 않고 구김 그림자 펴기만 합니다.
  async function fixRegions(input,regions,{iopaintOk=true,closeup=false,spots:allowSpots=true}={}) {
    const img=await pixelsOf(input),plan=planFixes(regions),spots=[],skipped=[...plan.skipped];
    let lab=null;try{lab=dominantLab(img);}catch{}
    for(const r of plan.spot){
      if(!allowSpots)skipped.push({region:r,reason:'다시 편집: 얼룩 지우기 없이 그림자 펴기만',review:false});
      else if(closeup&&!r.manual)skipped.push({region:r,reason:'확대 컷은 얼룩을 IOPaint로 자동 지우지 않음',review:true});
      else if(!r.manual&&lab&&garmentShare(img,r,lab)<GARMENT_SHARE_MIN)skipped.push({region:r,reason:'마네킹·다른 색 부분 위로 보여 건너뜀',review:false});
      else if(!iopaintOk)skipped.push({region:r,reason:'IOPaint가 꺼져 있어 얼룩은 건너뜀',review:true});
      else spots.push(r);
    }
    // 단추·부자재 보호(013-B): 단추(후보) 둘레에 닿는 얼룩은 IOPaint로 보내지 않습니다(LaMa가 단추를 지우거나 복제함). 사장님이 직접 표시한 곳은 보냄(뒤 검사는 함).
    if(spots.length){
      const near=nearButtons(img,spots,findButtons(img));
      for(let i=spots.length-1;i>=0;i--)if(near[i]&&!spots[i].manual){skipped.push({region:spots[i],reason:'단추·부자재 근처라 IOPaint로 보내지 않음',review:true});spots.splice(i,1);}
    }
    let {image,results}=flattenShadows(img,plan.flatten);
    if(spots.length){
      const sent=await inpaint(dataUrlOf(fillTransparent(image)),spots,iopUrl,{keepColors:true});
      const m=mergeSpots(image,await pixelsOf(sent),spots);image=m.image;results=[...results,...m.results];
    }
    const reverted=results.filter(r=>r.reverted),flags=[];
    if(reverted.length)flags.push(`결·색 검사에서 ${reverted.length}곳을 원래대로 되돌림(${[...new Set(reverted.flatMap(r=>r.reasons))].join(', ')})`);
    const review=skipped.filter(x=>x.review);
    if(review.length)flags.push(`${review.length}곳 자동으로 고치지 않음(${[...new Set(review.map(x=>x.reason))].join(', ')})`);
    const changed=results.some(r=>!r.reverted&&!r.skipped);
    return {image:changed?dataUrlOf(image):null,results,skipped,flags,counts:{flatten:plan.flatten.length,spot:spots.length,reverted:reverted.length,skipped:skipped.length}};
  }
  const fixSummary=c=>[c.flatten?`구김 ${c.flatten}곳 그림자 펴기`:'',c.spot?`얼룩 ${c.spot}곳 IOPaint로 지우기`:'',c.reverted?`${c.reverted}곳 검사 불합격 → 원래대로`:'',c.skipped?`${c.skipped}곳 건너뜀`:''].filter(Boolean).join(' · ');
  async function inpaintFor(id) {
    await task(async()=>{
      const slot=slots[id],d=slot.defects;if(!d?.selected?.length)return;
      const chosen=d.selected.map(i=>d.regions[i]),plan=planFixes(chosen);
      const iopaintOk=plan.spot.length?(await checkIopaint(iopUrl)).ok:true;
      setStep(`${slot.label} · 고르신 ${chosen.length}곳을 고치는 중 (구김은 그림자 펴기, 얼룩은 내 PC의 IOPaint)`);
      const e=entryOf(slot)||{stage1:slot.cutout},input=slot.cutout;
      const fix=await fixRegions(input,chosen,{iopaintOk,closeup:!autoLevelAllowed(id,slot.ai?.shot)});
      if(!fix.image){patch(id,{defects:null});setStep(`${slot.label} · 바뀐 곳이 없습니다 (${fixSummary(fix.counts)||'고칠 곳 없음'}).${fix.flags.length?' '+fix.flags.join(' · '):''}`);return;}
      const next=await refreshImages({...slots,[id]:{...withEntry(slot,{matte:e.matte||null,stage1:e.stage1||slot.cutout,stage2:fix.image}),defects:null}});
      setSlots(next);
      setStep(`${slot.label} · ${fixSummary(fix.counts)} (무료).${fix.flags.length?' 확인 필요: '+fix.flags.join(' · ')+'.':''} 마음에 안 들면 ‘이전으로’를 누르세요.`);
    });
  }
  // ---- 2차 보정 유료 대체: Photoroom (구김 = AI Ironing으로 옷 전체, 얼룩 = Edit With AI 글 지시, 기본 꺼짐) ----
  // 무료 IOPaint를 끄거나(엔진 선택) 사장님 PC의 IOPaint에 접속할 수 없을 때 씁니다. 버튼을 눌러야만 실행(자동 과금 없음).
  // 호출 1번에 다림질+얼룩 지시를 함께 보내 장당 $0.10. 같은 1차 결과·같은 설정은 저장된 결과를 다시 씁니다(새로고침 후에도).
  async function photoroomStage2For(id) {
    await task(async()=>{
      const slot=slots[id];if(!slot?.cutout)throw new Error('먼저 ‘이 사진 누끼·보정’으로 1차 보정을 해 주세요.');
      const ops={iron:true,stains:Boolean(defectOpts.stainAI)};
      // 입력은 항상 이 버전의 1차 결과(2차를 이미 했어도 1차에서 다시 시작) → 같은 입력이면 같은 결과로 보고 재사용합니다.
      const e=entryOf(slot)||{stage1:slot.cutout},input=e.stage1||slot.cutout;
      const key='pr2:'+JSON.stringify(ops)+input;
      let image=cache.current.get(key)||(slot.raw2?.key===key?slot.raw2.image:null),reused=Boolean(image);
      if(!image){
        const status=await api('status');setReady(status);
        if(!status.photoroom)throw new Error('서버에 Photoroom API 키(PHOTOROOM_API_KEY)가 연결되지 않았습니다.');
        const fallback=defectOpts.engine2!=='photoroom';
        setStep(`${slot.label} · ${fallback?'IOPaint에 연결할 수 없어 ':''}Photoroom으로 2차 보정 중 (구김 펴기${ops.stains?' + 얼룩 AI 지우기':''}, $0.10/장)`);
        const res=await api('retouch2',{image:input,options:ops});
        logCost(photoroomRow({feature:'photoroom_retouch2',product:productName,cut:slot.label}));
        // 혹시 흰 배경(불투명)으로 오면 가장자리의 흰색만 투명으로 되살립니다.
        const c=await imageCanvas(res.image),ctx=c.getContext('2d'),px=ctx.getImageData(0,0,c.width,c.height);
        if(isOpaque(px)&&alphaFromWhite(px))ctx.putImageData(px,0,0);
        image=c.toDataURL('image/png');cache.current.set(key,image);
      } else logCost(photoroomRow({feature:'photoroom_retouch2',product:productName,cut:slot.label,cached:true}));
      const next=await refreshImages({...slots,[id]:{...withEntry(slot,{matte:e.matte||null,stage1:input,stage2:image}),defects:null,raw2:{key,image}}});
      setSlots(next);refreshCredits();
      setStep(`${slot.label} · Photoroom 2차 보정 완료 (${ops.stains?'구김 펴기 + 얼룩 AI 지우기 · 결과 1K로 줄어듦':'구김 펴기(옷 전체)'}${reused?' · 저장된 결과 재사용·추가 비용 없음':' · $0.10'}). 1차와 나란히 비교하고, 마음에 안 들면 ‘이전으로’(무료)를 누르세요.`);
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
      for(let i=0;i<list.length;i++){setStep(`${i+1}/${list.length} 사진 읽는 중`);const full=await readPhoto(list[i]);photos.push({id:`p${i}`,full,thumb:await thumbnail(full),name:list[i].name,file:list[i]});}
      setStep(`Claude가 사진 ${photos.length}장을 옷별·컷별로 분류하는 중`);
      const result=await api('classify',{photos:photos.map(p=>({id:p.id,image:p.thumb})),...(HANGER_V2?{mode:'hanger'}:{})});
      logCost(claudeRow({feature:'classify',product:'(한꺼번에 올리기)',cut:`사진 ${photos.length}장`,responses:[result],photos:photos.length}));
      const byId=Object.fromEntries(photos.map(p=>[p.id,p]));
      const groups=result.garments.map(g=>({...g,items:result.photos.filter(p=>p.garment===g.id)})).filter(g=>g.items.length);
      const orphans=result.photos.filter(p=>!result.garments.some(g=>g.id===p.garment));
      if(orphans.length){if(groups.length)groups[0].items.push(...orphans.map(p=>({...p,review:true})));else groups.push({id:'g1',description:'분류 안 된 사진',items:orphans});}
      const built=[],batchTag='up-'+Date.now().toString(36);
      for(const g of groups){
        const next=initialSlots();let fit=false;
        for(const {slotId,item} of assignSlots(g.items)){
          const p=byId[item.id];
          if(await placePhoto(next,slotId,item,p.full,{file:p.name},HANGER_V2&&(slotId==='hero'||slotId==='back')?await readOriginal(p.file):null)==='fit')fit=true;
        }
        // design·color(015): 같은 디자인 다른 색 '연결 제안'용(이번 올리기 안에서만 비교). 연결은 사장님이 화면에서 확인합니다.
        built.push({name:g.description,data:{slots:next,fitEnabled:fit,docTheme:NEW_PRODUCT_THEME,...(g.design?{design:`${batchTag}-${g.design}`}:{}),...(g.color?{texts:{colorName:g.color}}:{})}});
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
  // 분류된 사진 한 장을 칸에 넣습니다(한꺼번에 올리기·드라이브 가져오기 공통). slotId가 없으면 추가 칸을 만듭니다.
  async function placePhoto(next,slotId,item,full,extra={},original=null) {
    let id=slotId;
    if(!id){id='extra-'+crypto.randomUUID();next[id]={id,label:item.shot==='unknown'?'확인 필요 사진':`${SHOT_LABEL[item.shot]||'추가'}컷`,enabled:true,source:null,image:null,cutout:null,crop:null,status:'empty'};}
    next[id]={...next[id],source:full,original,...await initialLevel(full,retouch,id,item.shot),image:whitePhoto(await imageCanvas(full),null,0),tone:{...DEFAULT_TONE},rawCut:null,auto:null,status:'raw',enabled:true,shown:true,versions:[null],vIndex:0,ai:{shot:item.shot,confidence:item.confidence,review:item.review,note:item.note,...extra}};
    return id;
  }
  // ---- 드라이브에서 가져오기(009): 화면 밖 흐름(driveImport.js)에 넘기는 함수들 ----
  // 옷 하나 = 상품 하나. 같은 옷 사진이 나중에 더 오면(실패 후 다시 시도 등) 이미 만든 상품의 빈 칸·추가 칸에 넣습니다.
  async function createImportedProduct({description,items,existing,design='',color=''}) {
    const old=existing?await getProduct(existing):null;
    const next=old?migrateSlots(old.data?.slots):initialSlots();
    let fit=Boolean(old?.data?.fitEnabled);
    for(const {slotId,item} of assignSlots(items,Object.keys(next).filter(k=>next[k].source))){
      const keep=HANGER_V2&&(slotId==='hero'||slotId==='back'),{full,original}=keep?await driveFullWithOriginal(item):{full:await driveFull(item),original:null};
      if(await placePhoto(next,slotId,item,full,{file:item.name,driveId:item.id},original)==='fit')fit=true;
    }
    const product=old?{...old,data:{...old.data,slots:next,fitEnabled:fit}}:{id:newProductId(),name:description,data:{slots:next,fitEnabled:fit,docTheme:NEW_PRODUCT_THEME,...(design?{design}:{}),...(color?{texts:{colorName:color}}:{})}};
    await saveProduct(product);await markImported(items,product.id);
    return product.id;
  }
  const importDeps={
    readThumb:driveThumb,refImage:refThumb,createProduct:createImportedProduct,
    classify:async body=>{const status=await api('status');setReady(status);if(!status.claude)throw new Error('서버에 Claude API 키(ANTHROPIC_API_KEY)가 연결되지 않았습니다.');return api('classify',HANGER_V2?{...body,mode:'hanger'}:body);},
    onClassified:(result,batch)=>logCost(claudeRow({feature:'classify',product:'(드라이브 가져오기)',cut:`사진 ${batch.length}장`,responses:[result],photos:batch.length})),
  };
  // ---- 자동 보정(010): 화면 상태가 아니라 저장된 상품 데이터로 처리하는 단계들. 순서·저장·대기는 utils/autoPipeline.js ----
  // 누끼는 무료 BiRefNet(사장님 PC)으로 고정, 유료 대체(paid)일 때만 Photoroom. 나머지 설정은 그 상품·컷의 지금 기본값 그대로.
  const autoOptions=(slot,data,paid)=>({...sanitizeRetouch({...keepSavedHanger(data?.retouch),...(slot.retouch||{})}),cutout:paid?'photoroom':'birefnet'});
  const autoSteps={
    level:async(slot,{product})=>{
      const options=autoOptions(slot,product.data,false);
      // 사장님이 직접 맞춘 각도는 그대로. 자동 수평(실험)이 꺼져 있으면 예전에 자동으로 돌린 컷도 0°로 되돌리고 제안만 남깁니다(013 팀장 결정).
      const lv=slot.level?.manual||(options.autoLevelBeta===true&&slot.level)?{level:slot.level,workSource:slot.workSource||null}:await initialLevel(slot.source,options,slot.id,slot.ai?.shot);
      const f=levelFlag(lv.level);
      return {slot:{...slot,...lv},flags:f?[f]:[]};
    },
    stage1:async(slot,{paid,product})=>{
      costProduct.current=product.name;costCut.current=slot.label;
      const options=autoOptions(slot,product.data,paid),warnings=[];
      const {matte,raw,charged}=await engineMatte(slot.source,warnings,options,slot.rawCut,slot.level?.angle||0,slot.workSource,slot.level?.zoom||1);
      const ops=[],stage1=await buildStage1(matte,{options,tone:slot.tone||DEFAULT_TONE,slotId:slot.id,ref:null,ops});
      const f=areaFlag(opaqueFraction(await pixelsOf(matte)));
      return {slot:{...withEntry(slot,{matte,stage1,stage2:null,ops}),defects:null,rawCut:raw||slot.rawCut||null},
        flags:[...(f?[f]:[]),...(paid?['무료 엔진이 꺼져 유료(Photoroom)로 누끼']:[]),...warnings],cost:charged?{paid:PHOTOROOM.perCall}:null};
    },
    refLab:async slot=>{const l=dominantLab(await pixelsOf(entryOf(slot)?.stage1||slot.cutout));return {L:l.L,a:l.a,b:l.b};},
    color:async(slot,lab)=>{
      const e=entryOf(slot)||{stage1:slot.cutout},{image,shift}=await matchedCutout(e.stage1,lab);
      const f=colorFlag(deltaE(dominantLab(await pixelsOf(image)),lab)),ops=[...(e.ops||[]),...(shift.L||shift.a||shift.b?[{op:'shift',...shift}]:[])];
      return {slot:withEntry(slot,{matte:e.matte||null,stage1:image,stage2:null,ops}),flags:f?[f]:[]};
    },
    // mode(014-2 다시 편집): 'gentle' = 같은 1차에서 찾은 곳(저장된 결과 재사용, 추가 비용 없음) 중 구김 그림자 펴기만 · 'skip' = 2차 없이 1차를 최종으로
    stage2:async(slot,{paid,product,mode=null})=>{
      const e=entryOf(slot)||{stage1:slot.cutout},input=e.stage1||slot.cutout,keep=r=>({...withEntry(slot,{matte:e.matte||null,stage1:input,stage2:r}),defects:null});
      if(mode==='skip')return {slot:keep(null),flags:['다시 편집: 2차 없이 1차를 최종으로']};
      if(paid){
        // 유료 대체: Photoroom 다림질(옷 전체, Claude 호출 없음, 얼룩 AI는 쓰지 않음)
        const res=await api('retouch2',{image:input,options:{iron:true,stains:false}});
        logCost(photoroomRow({feature:'photoroom_retouch2',product:product.name,cut:slot.label}));
        const c=await imageCanvas(res.image),ctx=c.getContext('2d'),px=ctx.getImageData(0,0,c.width,c.height);
        if(isOpaque(px)&&alphaFromWhite(px))ctx.putImageData(px,0,0);
        return {slot:keep(c.toDataURL('image/png')),flags:['무료 엔진이 꺼져 유료(Photoroom 다림질)로 2차 보정 — 원본과 비교해 주세요'],cost:{paid:PHOTOROOM.perCall}};
      }
      // IOPaint가 꺼져 있으면 Claude를 부르기 전에 멈춥니다(대기).
      // 'gentle'은 IOPaint를 쓰지 않으므로 연결을 확인하지 않습니다.
      if(mode!=='gentle'){const ok=await checkIopaint(iopUrl);setIop(ok);if(!ok.ok)throw Object.assign(new Error('IOPaint에 연결할 수 없습니다.'),{offline:true});}
      const level='aggressive';let res;
      try {res=await findRegions(input,level);}
      catch(err){if(err.partial)logCost(claudeRow({feature:'defects',product:product.name,cut:slot.label,level,responses:err.partial,boxes:err.partial.reduce((a,r)=>a+r.regions.length,0)}));throw err;}
      logCost(claudeRow({feature:'defects',product:product.name,cut:slot.label,level,responses:res.responses,boxes:res.regions.length,cached:res.cached}));
      const costs=res.responses.map(r=>claudeCost(r.model,r.usage)),cost={claude:costs.reduce((a,v)=>a+(v||0),0),claudeUnknown:costs.filter(v=>v===null).length};
      const f=regionsFlag(res.regions.length),flags=f?[f]:[];
      const chosen=res.regions.filter(r=>r.confidence>=.3);
      if(!chosen.length)return {slot:mode==='gentle'?keep(null):{...slot,defects:null},flags,cost};
      const fix=await fixRegions(input,chosen,{closeup:!autoLevelAllowed(slot.id,slot.ai?.shot),spots:mode!=='gentle'});
      if(mode==='gentle')return {slot:keep(fix.image),flags:[...flags,...fix.flags],cost};
      return {slot:fix.image?keep(fix.image):{...slot,defects:null},flags:[...flags,...fix.flags],cost};
    },
    // 옷걸이 v2: 2차까지 끝난 정면·후면에서 디테일컷(014). 실패해도 컷 보정은 그대로 두고 보고서에만 남깁니다.
    details:HANGER_V2?async product=>{
      const d=product.data;
      try {const r=await buildDetails(d.slots,d.garment||'long-top',{ai:Boolean(defectOpts.detailAI),product:product.name});return {product:{...product,data:{...d,slots:r.slots,detailReport:r.report}},cost:r.cost};}
      catch(e){return {product:{...product,data:{...d,detailReport:{items:[],skipped:[],error:String(e.message).slice(0,200),at:Date.now()}}}};}
    }:null,
    // 자동 점검(014-2, 브라우저 계산): 정면·후면의 누끼·1차·최종과 디테일 보고서로 통과/보류/불합격
    qa:HANGER_V2?async(product,{attempt})=>{const r=await qaOf(product.data);return {...r,retry:retryPlan(r,attempt+1)};}:null,
    // 다시 편집(최대 2회): retryPlan이 정한 설정으로 해당 단계만 다시 → 디테일컷 → 최종
    retry:HANGER_V2?async(product,plan)=>{
      let p=product;const cost={claude:0,claudeUnknown:0,paid:0},acc=c=>{if(c){cost.claude+=c.claude||0;cost.claudeUnknown+=c.claudeUnknown||0;cost.paid+=c.paid||0;}};
      const put=(id,slot)=>{p={...p,data:{...p.data,slots:{...p.data.slots,[id]:slot}}};},ids={front:'hero',back:'back'};
      for(const [c,patch] of Object.entries(plan.stage1)){
        const id=ids[c],slot=p.data.slots[id];if(!slot?.source)continue;
        const retouch={...(slot.retouch||{}),...patch},r=await autoSteps.stage1({...slot,retouch},{paid:false,product:p});acc(r.cost);put(id,{...r.slot,retouch});
        if(id!=='hero'&&p.data.slots.hero?.stage1){const lab=await autoSteps.refLab(p.data.slots.hero),rc=await autoSteps.color(p.data.slots[id],lab);put(id,rc.slot);}
        const r2=await autoSteps.stage2(p.data.slots[id],{paid:false,product:p});acc(r2.cost);put(id,r2.slot);
      }
      for(const [c,mode] of Object.entries(plan.stage2)){if(plan.stage1[c])continue;const id=ids[c];if(!p.data.slots[id]?.source)continue;const r=await autoSteps.stage2(p.data.slots[id],{paid:false,product:p,mode});acc(r.cost);put(id,r.slot);}
      if(plan.color&&p.data.slots.back?.cutout&&p.data.slots.hero?.cutout){const lab=await autoSteps.refLab(p.data.slots.hero);put('back',await matchedEntry(p.data.slots.back,lab,1));}
      const d=await autoSteps.details(p);p=d.product;acc(d.cost);
      const hero=p.data.slots.hero,lab=hero?.stage1?await autoSteps.refLab(hero):null;
      p=await autoSteps.final(p,lab?{slotId:'hero',label:hero.label,lab}:null);
      return {product:p,cost};
    }:null,
    final:async(product,ref)=>{
      const data=product.data,colorRefNew=ref?{slotId:ref.slotId,stage:'stage1',label:ref.label,lab:{L:ref.lab.L,a:ref.lab.a,b:ref.lab.b}}:(data.color?.ref||null);
      const next=await refreshImages(data.slots,{colorRef:colorRefNew,frame:{enabled:false,ratio:'3:4',margin:6,...data.frame}});
      // 새로 보정했으므로 상세페이지 확인(초안 해제)은 다시 받습니다.
      return {...product,data:{...data,slots:next,color:{ref:colorRefNew,strength:data.color?.strength??80},detailApproved:false}};
    },
  };
  // 무료 엔진 연결 확인(시작 전·대기 중)
  async function freeEngines() {
    const [b,i]=await Promise.all([checkBirefnet(),checkIopaint(iopUrl)]);setBir(b);setIop(i);
    return {birefnet:Boolean(b.ok&&b.ready&&!b.error),iopaint:Boolean(i.ok)};
  }
  async function runAutoJob(job,{signal,onProgress,save}) {
    await task(async()=>{
      await saveNow();
      const status=await api('status');setReady(status);
      if(!status.claude)throw new Error('서버에 Claude API 키(ANTHROPIC_API_KEY)가 연결되지 않아 2차(수정할 곳 찾기)를 할 수 없습니다.');
      if(job.options.paid&&!status.photoroom)throw new Error('유료 대체를 켰지만 서버에 Photoroom 키가 없습니다. 유료 대체를 끄고 시작하세요.');
      try {
        const r=await runAuto(job,{loadProduct:getProduct,saveProduct,steps:autoSteps,save,signal,
          checkFree:async kind=>(await freeEngines())[kind],onProgress:(j,t)=>{setStep(`자동 보정 · ${t}`);onProgress(j,t);}});
        setStep(`자동 보정 ${job.finished?'완료':'멈춤'} · 완료 ${r.done} · 확인 필요 ${r.review} · 실패 ${r.failed}${r.qa?.length?` · 자동 점검 통과 ${r.qa.filter(q=>q.status==='pass').length}/${r.qa.length}${r.qa.some(q=>q.owner)?` (사장님 확인 필요 ${r.qa.filter(q=>q.owner).length})`:''}`:''}${r.skipped?` · 건너뜀 ${r.skipped}`:''} · Claude 약 $${r.claude.toFixed(2)}${r.paid?` · 유료 $${r.paid.toFixed(2)}`:''} · ${Math.round(r.elapsed/60)}분`);
      } catch(e) {
        if(e.stopped){setStep(e.message);return;}
        throw new Error(`자동 보정이 멈췄습니다: ${e.message}${e.capReached?'':' ‘이어서 하기’를 누르면 남은 것부터 이어서 합니다.'}`);
      } finally {
        costProduct.current='';refreshCredits();
        setProducts(await listProducts());
        if(productId){const p=await getProduct(productId);if(p)await applyProduct(p);}
      }
    });
  }
  // ---- 완성본 저장 + 상세페이지(011): 저장된 상품 데이터로 파일을 만들고 보관·올리기. 순서는 utils/autoSave.js ----
  const saveDeps={
    // 비어 있는 제목·설명만 채웁니다(옵션, 유료). 사진에 보이는 것과 입력된 사실만 쓰는 기존 지시문 그대로(소재·치수·세탁법 추측 금지).
    writeCopy:async product=>{
      const d=product.data,hero=d.slots?.hero;if(!hero?.source)return product;
      const status=await api('status');setReady(status);
      if(!status.openai)throw new Error('서버에 OpenAI 키가 없어 문구 자동 작성을 할 수 없습니다. ‘비어 있는 문구 자동 작성’을 끄고 다시 하세요.');
      const texts={...defaultTexts(),...d.texts},copy=await api('analyze',{image:hero.source,product:texts.product});
      logCost(openaiRow({feature:'openai_copy',product:product.name,cut:hero.label,model:copy.model,usage:copy.usage}));
      return {...product,data:{...d,texts:{...texts,headline:texts.headline||copy.headline,description:texts.description||[copy.description,...copy.points].join('\n')}}};
    },
    build:async(product,{draft})=>{
      const d=product.data,g=d.garment||'long-top',rows=(d.sizeRows||{})[g]||[newSizeRow()],texts={...defaultTexts(),...d.texts},theme=themeOf(d.docTheme||NEW_PRODUCT_THEME).id;
      const s=migrateSlots(d.slots),fit=Boolean(d.fitEnabled);
      if(!s.hero?.image)throw new Error('대표 정면샷이 없어 상세페이지를 만들 수 없습니다.');
      const colors=layoutOf(theme)?await colorChoice({id:product.id,group:d.colorGroup,name:product.name,colorName:texts.colorName,image:s.hero?.image},colorStore):[];
      const b=documentBlocks({slots:s,fitEnabled:fit,texts,garment:g,rows,layout:layoutOf(theme),colors,name:product.name});
      const png=theme==='basic'?await renderDocument(b):(await renderThemed(b,theme)).blob;
      const title=texts.headline||product.name||'의류 상세페이지';
      const html=new Blob([theme==='basic'?documentHtml(b,title):themedHtml(b,title,theme)],{type:'text/html;charset=utf-8'});
      const zip=await channelPackage({name:product.name,slots:s,fitEnabled:fit,channelIds:AUTO_CHANNELS});
      const n=fileNames(draft),notes=[];
      if(sizeMissing(rows))notes.push('사이즈 입력 필요 (상세페이지 사이즈표는 ‘—’로 나감)');
      if(!texts.headline.trim())notes.push('상품 제목이 비어 있음');
      const photos=shopeePhotos(s,fit).filter(x=>x.cutout||x.stage1).map(x=>({slotId:x.id,label:x.label,image:x.image}));
      // 만든 재료의 지문 → 다시 저장해도 재료가 같으면 드라이브에 다시 올리지 않습니다(ZIP은 날짜 때문에 바이트가 매번 달라짐).
      const docFp=await printOf(JSON.stringify({b,theme,title})),zipFp=await printOf(JSON.stringify({name:product.name,channels:AUTO_CHANNELS,photos:channelPhotos(s,fit).map(x=>[x.id,x.image])}));
      const files=[{kind:'detail-png',name:n.png,blob:png,fp:'png-'+docFp},{kind:'detail-html',name:n.html,blob:html,fp:'html-'+docFp},{kind:'channels-zip',name:n.zip,blob:zip.blob,fp:'zip-'+zipFp}];
      // 자동 점검 결과(014-2) → 상품 폴더에 '점검보고서.csv'(영문 고정 열, 팀장이 읽음)
      if(d.qa){const csv=qaCsv(product,d.qa);files.push({kind:'qa-csv',name:'점검보고서.csv',blob:new Blob([csv],{type:'text/csv;charset=utf-8'}),fp:'qa-'+await printOf(csv)});if(d.qa.owner)notes.push(`자동 점검 ${QA_STATUS_LABEL[d.qa.status]} — 사장님 확인 필요`);}
      return {files,photos,notes};
    },
    store:async(product,{files,photos,draft})=>{
      await putOutputs({productId:product.id,name:product.name,draft,files,photos,at:Date.now()});
      if(!driveReady())return {where:'browser'};
      const r=await flushOutbox({only:[product.id],onStage:m=>setStep(`드라이브 저장 · ${m}`)});
      if(r.errors?.length)return {where:'browser',note:`드라이브 올리기 실패(대기열에 남김): ${r.errors[0]}`};
      return {where:r.uploaded?'drive':'browser'};
    },
  };
  async function runSaveJob(job,{signal,onProgress,save,prepare}) {
    await task(async()=>{
      await saveNow();
      if(prepare)job=await prepare();
      try {
        const c=await runSave(job,{loadProduct:getProduct,saveProduct,...saveDeps,save,signal,onProgress:(j,t)=>{setStep(`완성본 저장 · ${t}`);onProgress(j,t);}});
        setStep(`완성본·상세페이지 저장 ${job.finished?'완료':'멈춤'} · 상품 ${c.done}개${c.drafts?` (초안 ${c.drafts})`:''}${c.failed?` · 실패 ${c.failed}`:''} · ${driveReady()?'구글 드라이브에 저장':'이 브라우저에 보관 — 드라이브를 연결하면 한꺼번에 올립니다'}`);
      } catch(e) {
        if(e.stopped){setStep(e.message);return;}
        throw new Error(`완성본 저장이 멈췄습니다: ${e.message} ‘이어서 하기’를 누르면 남은 상품부터 이어서 합니다.`);
      } finally {
        setProducts(await listProducts());
        if(productId){const p=await getProduct(productId);if(p)await applyProduct(p);}
      }
    });
    return job;
  }
  // 초안 → 사장님 확인 → 정식으로 다시 저장(누르는 즉시 화면을 잠그고 처리)
  async function approveDetail(id) {
    return runSaveJob(null,{onProgress:()=>{},save:async()=>{},prepare:async()=>{
      const p=await getProduct(id);if(!p)throw new Error('상품을 찾을 수 없습니다.');
      const next={...p,data:{...p.data,detailApproved:true}};await saveProduct(next);
      return planSave([next]);
    }});
  }
  async function importFinished(firstId) {
    const list=await listProducts();setProducts(list);
    if(firstId&&list.some(p=>p.id===firstId)&&firstId!==productId){await saveNow();await applyProduct(await getProduct(firstId));}
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
      const next={...current,[id]:{...current[id],source:null,original:null,image:null,cutout:null,matte:null,stage1:null,stage2:null,defects:null,tone:null,level:null,workSource:null,rawCut:null,raw2:null,auto:null,crop:null,derived:false,status:'empty',versions:[null],vIndex:0,retouch:null}};
      return next;
    });
  }
  async function changeGarment(value) {
    setGarment(value);setPreview(null);
  }
  function editSize(index,key,value) {
    setSizeRows(current=>({...current,[garment]:rows.map((row,i)=>i===index?{...row,[key]:value}:row)}));setPreview(null);
  }
  // 두손 베이직(015): COLOR CHOICE에 넣을 연결 상품의 정면 최종본을 저장소에서 읽어 옵니다(작은 사진으로 줄임).
  const blocks=async()=>{
    const layout=layoutOf(docTheme),group=products.find(p=>p.id===productId)?.colorGroup||null;
    const colors=layout?await colorChoice({id:productId,group,name:productName,colorName:texts.colorName,image:slots.hero?.image},colorStore):[];
    return documentBlocks({slots,fitEnabled,texts,garment,rows,layout,colors,name:productName});
  };
  const myGroup=products.find(p=>p.id===productId)?.colorGroup||null,myDesign=products.find(p=>p.id===productId)?.design||'';
  const linked=colorMembers(products,{id:productId,group:myGroup}),suggested=colorSuggestions(products,{id:productId,group:myGroup,design:myDesign});
  async function changeColorLink(targetId,on) {
    await task(async()=>{
      await saveNow();
      if(on){const g=await linkColor({id:productId,group:myGroup},targetId,colorStore);const me=await getProduct(productId);if(me)await saveProduct({...me,data:{...me.data,colorGroup:g}});}
      else await unlinkColor(targetId,colorStore);
      setProducts(await listProducts());setPreview(null);
      setStep(on?'같은 옷 다른 색상으로 연결했습니다. 연결된 상품의 정면 최종본이 COLOR CHOICE에 나옵니다.':'색상 연결을 끊었습니다.');
    });
  }
  async function exportPng(previewOnly=false) {
    if(!slots.hero.image){setError('대표 정면샷을 먼저 넣어주세요.');return;}
    await task(async()=>{
      setStep(previewOnly?'미리보기 구성 중':'전체 이미지 제작 중');setPreviewBusy(true);
      try {
        // 기본 테마는 예전 렌더러 그대로, 나머지는 테마 렌더러(글꼴을 못 받으면 기본 글꼴로 그리고 알림)
        let blob,fontsOk=true;
        const b=await blocks();
        if(docTheme==='basic')blob=await renderDocument(b);else ({blob,fontsOk}=await renderThemed(b,docTheme));
        if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);
        previewUrl.current=URL.createObjectURL(blob);setPreview(previewUrl.current);
        if(!previewOnly)downloadBlob(blob,'의류-상세페이지.png');
        const note=fontsOk?'':' · 테마 글꼴을 받지 못해 기본 글꼴로 그렸습니다(인터넷 연결 확인)';
        setStep((previewOnly?`현재 편집 내용의 미리보기입니다 · 테마: ${themeOf(docTheme).label}`:`전체 PNG 저장 완료 · 테마: ${themeOf(docTheme).label}`)+note);
      }finally{setPreviewBusy(false);}
    });
  }
  async function exportHtml() {
    if(!slots.hero.image){setError('대표 정면샷을 먼저 넣어주세요.');return;}
    const title=texts.headline||'의류 상세페이지',b=await blocks();
    downloadBlob(new Blob([docTheme==='basic'?documentHtml(b,title):themedHtml(b,title,docTheme)],{type:'text/html;charset=utf-8'}),'의류-상세페이지.html');
  }
  const cutProps={busy,onUpload:upload,onPatch:patch,onProcess:processPhotos,onLevel:HANGER_V2?null:levelFor,defectOpts,setDefectOpts,onPhotoroom2:photoroomStage2For,onMatteEdit:matteEdit,onTone:toneFor,onRemove:removePhoto,onVersion:changeVersion,onSave:savePhoto,retouchDefault:retouch,status:ready,bir,colorRef,onColorRef:chooseColorRef,slotList:Object.values(slots).filter(s=>s.id!=='fit'||fitEnabled).map(s=>({id:s.id,label:s.label,source:Boolean(s.source)})),onMove:moveSlot,iop,onFindDefects:findDefectsFor,onInpaint:inpaintFor,onHide:HANGER_V2?null:id=>patch(id,{shown:false})};
  // 사진이 없는 컷은 숨깁니다(정면은 항상 표시). 아래 ‘+’로 꺼내 씁니다.
  // 옷걸이 v2: 옷걸이 정면·후면 2칸은 항상 보입니다. 자동 디테일컷(derived)은 아래 '디테일컷' 줄에 따로 보입니다.
  const visible=s=>s.id==='hero'||(HANGER_V2&&s.id==='back')||(!s.derived?.from&&(Boolean(s.source)||Boolean(s.shown)));
  const cutList=Object.values(slots).filter(s=>s.id!=='fit'&&visible(s));
  const hiddenCuts=Object.values(slots).filter(s=>s.id!=='fit'&&!s.derived?.from&&!visible(s));
  const derivedCuts=detailIds(garment).map(id=>slots[detailSlotId(id)]).filter(s=>s?.derived?.from);
  function addCut(id) {
    if(id==='__new'){const nid='extra-'+crypto.randomUUID();patch(nid,{id:nid,label:'추가 컷',enabled:true,shown:true,source:null,image:null,cutout:null,crop:null,status:'empty'});return;}
    patch(id,{shown:true});
  }
  const pendingCount=Object.values(slots).filter(s=>s.image&&s.enabled&&s.status==='raw'&&(s.id!=='fit'||fitEnabled)).length;
  return <div className="auto-studio">
    <div className="studio-heading"><div><span className="eyebrow">FASHION STUDIO / PAGE EDITOR</span><h1>의류 상세페이지 제작{HANGER_V2?' · 옷걸이 v2':''}</h1><p>{HANGER_V2?'옷걸이 정면 → 옷걸이 후면 → 디테일(정면·후면에서 자동으로 잘라 냄) → Size 순서로 구성합니다.':'대표 사진 → Fit guide → Detail → Size 순서로 구성합니다.'}</p></div><span className="connection">{ready===null?'연결 확인 중':`Photoroom ${ready.photoroom?`연결됨${credits&&Number.isFinite(credits.available)?` (남은 이미지 ${credits.available}/${credits.subscription})`:''}`:'키 필요'} · OpenAI 문구 ${ready.openai?'연결됨':'키 필요'}${ready.photoroom||ready.openai?' · AI 처리 시 사용료 발생':''}`}</span></div>
    <div className="studio-toolbar"><label className="theme-pick">디자인 테마<select aria-label="상세페이지 디자인 테마" value={docTheme} disabled={busy} onChange={e=>{setDocTheme(e.target.value);setPreview(null);}}>{THEME_LIST.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select><small>{themeOf(docTheme).desc}</small></label><button disabled={busy} onClick={()=>exportPng(true)}>전체 미리보기</button><button disabled={busy} className="primary" onClick={()=>exportPng(false)}>상세페이지 전체 PNG 저장</button><button disabled={busy} onClick={exportHtml}>HTML 다운로드</button></div>
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
    <CostPanel level={defectOpts.level||DEFAULT_DEFECT_LEVEL} onLowerLevel={()=>{setDefectOpts({level:'normal'});setStep('수정할 곳 찾기 민감도를 ‘보통’(사진당 1회 호출)으로 낮췄습니다. 다시 올리려면 각 사진의 수정할 곳 찾기에서 바꾸세요.');}}/>
    <section className="product-bar" aria-label="상품 목록">
      <label>상품 선택<select aria-label="상품 선택" disabled={busy} value={productId||''} onChange={e=>switchProduct(e.target.value)}>{products.map(p=><option key={p.id} value={p.id}>{p.name||'이름 없는 상품'}</option>)}</select></label>
      <label>상품 이름<input aria-label="상품 이름" disabled={busy} maxLength={80} value={productName} onChange={e=>setProductName(e.target.value)}/></label>
      <button type="button" disabled={busy} onClick={addProduct}>+ 새 상품</button>
      <label className="file-button primary bulk-upload">사진 한꺼번에 올리기 (자동 분류)<input aria-label="사진 한꺼번에 올리기" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const f=Array.from(e.target.files||[]);e.target.value='';if(f.length)bulkUpload(f);}}/></label><Cost k="claudeClassify"/>
      <button type="button" className="subtle" disabled={busy||!productId} onClick={removeProduct}>상품 삭제</button>
      <DriveImportPanel ready={ready} busy={busy} task={task} setStep={setStep} deps={importDeps} onFinished={importFinished} openProduct={id=>switchProduct(id)} onAutoFix={ids=>setAutoRequest({ids,at:Date.now()})}/>
      <span className="save-state" aria-live="polite">{{saving:'저장 중…',pending:'저장 대기',saved:'자동 저장됨',error:'저장 안 됨'}[saveState]||''}</span>
    </section>
    <AutoFixPanel products={products} busy={busy} setStep={setStep} freeEngines={freeEngines} runAutoJob={runAutoJob} runSaveJob={runSaveJob} approveDetail={approveDetail} openProduct={id=>switchProduct(id)} request={autoRequest}/>
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
      {HANGER_V2&&<section className="detail-cuts" aria-label="디테일컷 자동">
        <h3>디테일컷 <small>보정이 끝난 옷걸이 정면·후면에서 자동으로 잘라 냅니다 · 실제 사진만 사용(새로 그리지 않음)</small></h3>
        <div className="btn-row">
          <span className="btn-with-cost"><button type="button" className="primary" disabled={!slots.hero.cutout} onClick={makeDetails}>{derivedCuts.length?'디테일컷 다시 만들기':'디테일컷 자동 만들기'}</button><Cost k="browser"/></span>
          <label className="check"><input type="checkbox" aria-label="디테일 위치 Claude로 찾기" checked={Boolean(defectOpts.detailAI)} onChange={e=>setDefectOpts({detailAI:e.target.checked})}/>확신 없는 위치(단추·소매 끝)는 Claude로 찾기 <Cost k="claudeDetails"/></label>
        </div>
        <p className="slot-note">{detailIds(garment).map(id=>DETAIL_LABELS[id]).join(' · ')} ({GARMENTS.find(g=>g.id===garment)?.label}) · 원본 기준 긴 변 {DETAIL_MIN_SIDE}px이 안 나오면 키우지 않고 빼고 ‘해상도 부족’으로 표시합니다. 정면·후면을 다시 보정했으면 다시 만들어 주세요.</p>
        {derivedCuts.length>0&&<div className="detail-grid">{derivedCuts.map(s=><figure key={s.id} data-detail={s.derived.detail}>
          <img src={s.image||s.cutout} alt={`${s.label} 디테일컷`}/>
          <figcaption><b>{s.label}</b> · {s.derived.from==='back'?'후면':'정면'} {s.derived.origin||'보정본'}에서 · {s.derived.side}px
            <label className="check"><input type="checkbox" aria-label={`${s.label} 상세페이지에 포함`} checked={s.enabled!==false} onChange={e=>patch(s.id,{enabled:e.target.checked})}/>상세페이지에 포함</label></figcaption>
        </figure>)}</div>}
        {detailReport?.skipped?.length>0&&<ul className="detail-skipped" aria-label="빠진 디테일">{detailReport.skipped.map(x=><li key={x.id} className={x.review?'review-note':''}>{x.label}: {x.reason}</li>)}</ul>}
        {detailReport?.error&&<p className="review-note">디테일컷을 만들지 못했습니다: {detailReport.error}</p>}
      </section>}
      {HANGER_V2&&<section className="qa-panel" aria-label="자동 점검">
        <h3>자동 점검 <small>검증 기준서(docs/qa/검증기준서.md)의 자동 측정 항목 · 자동 보정이 끝나면 저절로 하고, 보류·불합격이면 설정을 바꿔 최대 2회 다시 편집합니다</small></h3>
        <span className="btn-with-cost"><button type="button" disabled={!slots.hero.cutout} onClick={runQa}>이 상품 자동 점검</button><Cost k="browser"/></span>
        {qa&&<div className={`check-result ${qa.status==='pass'?'check-ok':'check-fail'}`} aria-label="자동 점검 결과">
          <b>{{pass:'✅ 통과',hold:'⚠ 보류',fail:'❌ 불합격'}[qa.status]}</b>{qa.owner?' · 사장님 확인 필요':''}{qa.attempts?` · 다시 편집 ${qa.attempts}회`:''}
          {qa.reasons?.length>0&&<ul>{qa.reasons.map((r,i)=><li key={i}>{r}</li>)}</ul>}
          <details><summary>항목별 결과 ({qa.checks?.length||0})</summary><table className="cost-table"><thead><tr><th>컷</th><th>항목</th><th>결과</th><th>값</th><th>기준</th></tr></thead><tbody>
            {(qa.checks||[]).map((c,i)=><tr key={i} data-check={c.key}><td>{c.cut}</td><td>{c.key}</td><td>{QA_STATUS_LABEL[c.status]}</td><td>{String(c.value)}</td><td>{c.limit}</td></tr>)}</tbody></table></details>
        </div>}
      </section>}

      {!HANGER_V2&&<div className="add-cuts" aria-label="컷 추가">
        <span>+ 컷 추가</span>
        {hiddenCuts.map(s=><button key={s.id} type="button" aria-label={`${s.id} 컷 추가`} onClick={()=>addCut(s.id)}>+ {s.label}</button>)}
        <button type="button" disabled={Object.keys(slots).length>=18} onClick={()=>addCut('__new')}>+ 직접 이름 정하기</button>
      </div>}
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
      {!HANGER_V2&&<section className="editor-section"><h2>02 · Fit guide</h2><label className="check"><input type="checkbox" checked={fitEnabled} onChange={e=>{setFitEnabled(e.target.checked);setPreview(null);}}/>모델컷 적용</label><p>선택하고 모델 사진을 넣으면 표시됩니다. 사진이 없으면 전체 상세페이지에서 제외됩니다.</p>
        {fitEnabled&&<><label>Fit guide 제목<input maxLength={100} value={texts.fitTitle} onChange={e=>setText('fitTitle',e.target.value)}/></label><label>모델 설명<textarea maxLength={1500} value={texts.fitDescription} onChange={e=>setText('fitDescription',e.target.value)} placeholder="확인된 모델 키·착용 사이즈 등을 입력하세요."/></label><p className="slot-note">모델 사진은 위 ‘컷별 보정’의 모델컷 줄에서 넣고 보정합니다.</p></>}
      </section>}
      {HANGER_V2&&docTheme==='dooson'&&<section className="editor-section dooson-editor" aria-label="두손 베이직 구성"><h2>두손 베이직 · 상단 · 색상 · 정보</h2>
        <p className="slot-note">비워 둔 칸은 상세페이지에서 빠집니다. 확인된 내용만 입력하세요(앱이 지어내지 않습니다).</p>
        <label>소개 한 줄 (상품명 아래)<input maxLength={120} value={texts.intro} onChange={e=>setText('intro',e.target.value)}/></label>
        <label>정면 사진 아래 영문 문구 (선택)<input maxLength={80} value={texts.tagline} placeholder="예: Everyday soft knit" onChange={e=>setText('tagline',e.target.value)}/></label>
        <h3>COLOR CHOICE · 같은 옷 다른 색상</h3>
        <label>이 상품 색 이름<input maxLength={30} value={texts.colorName} placeholder="예: 아이보리" onChange={e=>setText('colorName',e.target.value)}/></label>
        {linked.length?<ul className="color-links" aria-label="연결된 색상">{linked.map(p=><li key={p.id}>{p.colorName||p.name} <small>({p.name})</small> <button type="button" className="subtle" onClick={()=>changeColorLink(p.id,false)}>연결 끊기</button></li>)}</ul>:<p className="slot-note">연결된 다른 색상이 없습니다. 2색 이상 연결하고 각 상품에 정면 사진이 있어야 COLOR CHOICE가 나옵니다.</p>}
        {suggested.length>0&&<div className="review-note" aria-label="색상 연결 제안">자동 분류가 같은 디자인의 다른 색으로 본 상품입니다. 같은 옷이 맞는지 확인하고 연결하세요.<ul>{suggested.map(p=><li key={p.id}>{p.colorName||p.name} <small>({p.name})</small> <button type="button" onClick={()=>changeColorLink(p.id,true)}>연결</button></li>)}</ul></div>}
        <label>다른 상품 연결<select aria-label="색상으로 연결할 상품" value="" onChange={e=>{if(e.target.value)changeColorLink(e.target.value,true);}}><option value="">상품 선택…</option>{products.filter(p=>p.id!==productId&&!linked.some(l=>l.id===p.id)).map(p=><option key={p.id} value={p.id}>{p.name}{p.colorName?` · ${p.colorName}`:''}</option>)}</select></label>
        <h3>INFO</h3>
        <label>소재<input maxLength={200} value={texts.material} placeholder="예: 면 100% (라벨 확인값)" onChange={e=>setText('material',e.target.value)}/></label>
        <label>세탁<input maxLength={200} value={texts.care} placeholder="예: 손세탁, 건조기 사용 금지" onChange={e=>setText('care',e.target.value)}/></label>
        <label>핏<input maxLength={200} value={texts.fitNote} placeholder="예: 여유 있는 기본 핏" onChange={e=>setText('fitNote',e.target.value)}/></label>
      </section>}
      <section className="editor-section"><h2>03 · Detail</h2><label>Detail 제목<input maxLength={100} value={texts.detailTitle} onChange={e=>setText('detailTitle',e.target.value)}/></label><p>디테일 사진은 위 ‘컷별 보정’에서 넣고 보정합니다. 사진이 없는 컷은 상세페이지에서 빠집니다.</p>
      </section>
      <section className="editor-section size-editor"><h2>04 · Size</h2><label>Size 제목<input maxLength={100} value={texts.sizeTitle} onChange={e=>setText('sizeTitle',e.target.value)}/></label>
        <img className="size-guide" src={guideUrl(garment)} alt={`${GARMENTS.find(g=>g.id===garment).label} 치수 가이드`}/>
        <p>단위: cm · 입력하지 않은 값은 ‘—’로 표시합니다.</p>
        <div className="size-scroll"><table><thead><tr>{sizeFields(garment).map(([key,label])=><th key={key}>{label}</th>)}<th>행 삭제</th></tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{sizeFields(garment).map(([key,label])=><td key={key}><input aria-label={`${i+1}행 ${label}`} value={row[key]} maxLength={key==='size'?16:12} inputMode={key==='size'?'text':'decimal'} onChange={e=>editSize(i,key,e.target.value)}/></td>)}<td><button aria-label={`${i+1}행 삭제`} disabled={rows.length===1} onClick={()=>{setSizeRows(current=>({...current,[garment]:rows.filter((_,index)=>i!==index)}));setPreview(null);}}>삭제</button></td></tr>)}</tbody></table></div>
        <button disabled={rows.length>=12} onClick={()=>{setSizeRows(current=>({...current,[garment]:[...rows,newSizeRow()]}));setPreview(null);}}>사이즈 행 추가</button>
        <label>치수 안내 문구<textarea maxLength={1500} value={texts.sizeNote} onChange={e=>setText('sizeNote',e.target.value)}/></label>
      </section>
      <ShopeePanel logCost={logCost} shopee={shopee} setShopee={setShopee} slots={slots} fitEnabled={fitEnabled} garment={garment} rows={rows} texts={texts} ready={ready} task={task} setStep={setStep} api={api} productName={productName}/>
      <InstagramPanel instagram={instagram} setInstagram={setInstagram} slots={slots} fitEnabled={fitEnabled} rows={rows} texts={texts} task={task} setStep={setStep} productName={productName}/>
      <ChannelExportPanel slots={slots} fitEnabled={fitEnabled} task={task} setStep={setStep} productName={productName}/>
    </fieldset><aside className="studio-preview"><h2>완성 상세페이지</h2><p>편집 후 ‘전체 미리보기’를 누르면 저장되는 이미지와 같은 구성을 확인할 수 있습니다.</p>{pendingCount>0&&<p className="review-note">보정 전 사진 {pendingCount}장이 포함되어 있습니다. 배경 제거가 필요하면 보정을 먼저 실행하세요.</p>}{previewBusy?<p>미리보기를 만들고 있습니다…</p>:preview?<img src={preview} alt="완성 상세페이지 미리보기"/>:<div className="preview-placeholder"><span>01 대표 정면샷</span><span>02 Fit guide · 선택</span><span>03 Detail</span><span>04 Size</span><button disabled={busy||!slots.hero.image} onClick={()=>exportPng(true)}>전체 미리보기</button></div>}</aside></div>
  </div>;
}
