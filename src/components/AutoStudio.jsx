import {useEffect, useRef, useState} from 'react';
import './AutoStudio.css';
import {cutoutBounds} from '../utils/detailCrops.js';
import {removeStand} from '../utils/stand.js';
import {GARMENTS, initialSlots, newSizeRow, sizeFields, guideUrl, documentBlocks, documentHtml} from '../utils/studioDocument.js';
import {RETOUCH_PRESETS, DEFAULT_RETOUCH, MANNEQUIN_MODES, lowResolution, retouchPrompt, sanitizeRetouch} from '../utils/retouchPresets.js';
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

const cutoutCost=o=>o?.cutout==='birefnet'?'birefnet':'photoroom';
function RetouchSettings({value,onChange,status,bir,prefix='',title='누끼·보정 설정'}) {
  const set=patch=>onChange({...value,...patch});
  const togglePreset=id=>set({presets:value.presets.includes(id)?value.presets.filter(p=>p!==id):[...value.presets,id]});
  const prompted=value.presets.length>0||value.custom.trim().length>0;
  const special=value.mannequin==='ghost'||value.mannequin==='flatlay';
  const small=lowResolution(value,retouchPrompt(value,value.engine!=='openai'));
  const advancedOn=prompted||special||value.lighting||value.shadow;
  return <div className="retouch-settings">
    <h3>{title} <Cost k={cutoutCost(value)}/></h3>
    <label>배경 지우기 엔진<select aria-label={`${prefix}배경 지우기 엔진`} value={value.cutout||'photoroom'} onChange={e=>set({cutout:e.target.value})}>
      <option value="photoroom">Photoroom (유료 $0.10/장 · 테두리 가장 깔끔)</option>
      <option value="birefnet">BiRefNet (무료 · 내 PC에서 실행)</option>
    </select></label>
    <label className="check"><input type="checkbox" checked readOnly disabled/>배경 누끼 (항상 적용 · 흰 배경으로 출력)</label>
    <label className="check"><input type="checkbox" aria-label={`${prefix}중앙 정렬`} checked={value.center} onChange={e=>set({center:e.target.checked})}/>옷을 사진 중앙에 정렬</label>
    {value.cutout==='birefnet'
      ?<><label className="check"><input type="checkbox" aria-label={`${prefix}받침대 기둥 지우기`} checked={value.removeStand!==false} onChange={e=>set({removeStand:e.target.checked})}/>마네킹 받침대(검은 기둥) 자동 지우기 · 무료</label>
        <p className="slot-note">BiRefNet은 사장님 PC에서 돌아가 비용이 없습니다(IOPaint Start로 함께 켜짐). 사진 1장에 30초 안팎(PC 성능에 따라 다름), 처리 중 메모리 약 4GB를 씁니다. 받침대 기둥은 자동으로 지웁니다. 다른 물건이 남거나 테두리가 마음에 안 들면 이 사진만 Photoroom으로 바꿔 다시 하세요.</p>
        {bir&&!bir.ok&&<p className="review-note">BiRefNet이 꺼져 있습니다. 위쪽 ‘사용 도구·비용’ 안내대로 바탕화면의 IOPaint Start를 실행하세요. 예전에 설치했다면 설치 파일을 한 번 더 실행해야 합니다.</p>}
        {bir?.ok&&!bir.ready&&<p className="review-note">BiRefNet 모델 준비 중입니다(처음 한 번 약 450MB 내려받기).</p>}</>
      :<p className="slot-note">Photoroom은 배경 지우기만 합니다(원본 해상도 최대 2400px, 옷 테두리 HD). 구김 펴기·얼룩 지우기는 각 사진의 ‘얼룩·구김 수정 (IOPaint)’에서 무료로 합니다.</p>}
    {value.cutout!=='birefnet'&&<details className="advanced" open={advancedOn||undefined}><summary>Photoroom 생성형 추가 편집 (선택 · 기본 꺼짐) <Cost k="photoroomAI"/></summary>
      <label className="check"><input type="checkbox" aria-label={`${prefix}조명 보정`} checked={value.lighting} onChange={e=>set({lighting:e.target.checked})}/>조명 자연스럽게 보정 (색상·채도는 원본 유지)</label>
      <label className="check"><input type="checkbox" aria-label={`${prefix}AI 그림자`} checked={Boolean(value.shadow)} onChange={e=>set({shadow:e.target.checked})}/>바닥에 자연스러운 그림자 넣기 (AI 그림자)</label>
      <h4>마네킹 처리</h4>
      <select aria-label={`${prefix}마네킹 처리`} value={value.mannequin||'keep'} onChange={e=>set({mannequin:e.target.value})}>{MANNEQUIN_MODES.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select>
      {special&&<p className="review-note">AI가 옷을 새로 그리는 방식입니다. 없던 디테일(예: 목 안쪽 라벨)이 생기거나 원단 질감이 달라질 수 있으니 원본과 꼭 비교하세요. 이 모드에서는 아래 프롬프트·그림자는 적용되지 않습니다.</p>}
      <h4>프롬프트 편집</h4>
      {RETOUCH_PRESETS.map(p=><label key={p.id} className="check"><input type="checkbox" aria-label={prefix+p.label} checked={value.presets.includes(p.id)} onChange={()=>togglePreset(p.id)}/>{p.label}</label>)}
      <label>직접 입력 프롬프트<textarea aria-label={`${prefix}직접 입력 프롬프트`} maxLength={1000} value={value.custom} placeholder="예: 목 부분 라벨이 보이지 않게 정리해 주세요." onChange={e=>set({custom:e.target.value})}/></label>
      {prompted&&<label>프롬프트 보정 엔진<select aria-label={`${prefix}프롬프트 보정 엔진`} value={value.engine} onChange={e=>set({engine:e.target.value})}>
        <option value="photoroom">Photoroom AI 편집 (같은 $0.10/장)</option>
        <option value="openai" disabled={status&&!status.openai}>OpenAI 이미지 편집 (별도 사용료){status&&!status.openai?' (키 없음)':''}</option>
      </select></label>}
      {prompted&&<p className="review-note">프롬프트 편집은 AI가 사진을 새로 그리는 방식이라 원단 질감·무늬가 달라질 수 있습니다. 실패해도 누끼 결과는 유지됩니다.</p>}
    </details>}
    {value.cutout!=='birefnet'&&small&&<p className="review-note low-res">⚠ 지금 설정은 결과 사진이 약 1024px(1K)로 작아집니다.</p>}
  </div>;
}

// 얼룩·구김 수정: Claude가 수정할 곳을 표시 → 사장님이 확인/선택(직접 추가·삭제 가능) → 내 PC의 IOPaint가 지움
const MANUAL_TYPES=['stain','wrinkle','lint','thread','mannequin_mark','other'];
function DefectPanel({slot,iop,onPatch,onFind,onInpaint}) {
  const d=slot.defects,sel=d?.selected||[],regions=d?.regions||[];
  const [draw,setDraw]=useState(false),[kind,setKind]=useState('stain'),[drag,setDrag]=useState(null);
  const box=useRef(null);
  const save=(nextRegions,nextSel)=>onPatch(slot.id,{defects:{...(d||{}),regions:nextRegions,selected:nextSel,preview:null}});
  const toggle=i=>save(regions,sel.includes(i)?sel.filter(x=>x!==i):[...sel,i].sort((a,b)=>a-b));
  const remove=i=>save(regions.filter((_,k)=>k!==i),sel.filter(x=>x!==i).map(x=>x>i?x-1:x));
  function startManual() {
    if(!d)onPatch(slot.id,{defects:{regions:[],selected:[],preview:null}});
    setDraw(v=>!v);
  }
  // 미리보기 사진 위 좌표 → 0~1000 비율
  const at=e=>{const r=box.current.getBoundingClientRect();const c=v=>Math.max(0,Math.min(1000,Math.round(v)));return {x:c((e.clientX-r.left)/r.width*1000),y:c((e.clientY-r.top)/r.height*1000)};};
  const down=e=>{if(!draw)return;e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);const p=at(e);setDrag({a:p,b:p});};
  const move=e=>{if(drag)setDrag({...drag,b:at(e)});};
  const up=e=>{
    if(!drag)return;const b=at(e),r={x0:Math.min(drag.a.x,b.x),y0:Math.min(drag.a.y,b.y),x1:Math.max(drag.a.x,b.x),y1:Math.max(drag.a.y,b.y)};setDrag(null);
    if(r.x1-r.x0<4||r.y1-r.y0<4)return;
    save([...regions,{type:kind,...r,confidence:1,note:'직접 표시',manual:true}],[...sel,regions.length]);
  };
  const live=drag&&{left:`${Math.min(drag.a.x,drag.b.x)/10}%`,top:`${Math.min(drag.a.y,drag.b.y)/10}%`,width:`${Math.abs(drag.b.x-drag.a.x)/10}%`,height:`${Math.abs(drag.b.y-drag.a.y)/10}%`};
  const auto=regions.filter(r=>!r.manual).length,manual=regions.length-auto;
  return <details className="defect-panel" open={Boolean(d)||undefined}><summary>얼룩·구김 수정 (IOPaint){d?` · 표시 ${regions.length}곳${manual?` (직접 ${manual})`:''}`:''}</summary>
    <div className="btn-row">
      <span className="btn-with-cost"><button type="button" onClick={()=>onFind(slot.id)}>🤖 수정할 곳 자동 찾기</button><Cost k="claudeDefects"/></span>
      <span className="btn-with-cost"><button type="button" className={draw?'primary':''} aria-pressed={draw} onClick={startManual}>✏️ 직접 표시하기{draw?' (켜짐)':''}</button><Cost k="browser"/></span>
    </div>
    {draw&&<div className="btn-row draw-tools"><label>표시 종류<select aria-label={`${slot.id} 직접 표시 종류`} value={kind} onChange={e=>setKind(e.target.value)}>{MANUAL_TYPES.map(t=><option key={t} value={t}>{DEFECT_LABEL[t]}</option>)}</select></label>
      <p className="slot-note">사진 위에서 지울 곳을 <b>끌어서 상자</b>로 표시하세요(손가락으로도 됩니다). 여러 곳을 계속 표시할 수 있습니다. 다 했으면 ‘직접 표시하기’를 다시 눌러 끕니다.</p></div>}
    {d&&<>
      {d.preview&&<div className={`defect-stage${draw?' drawing':''}`}><div className="defect-box" ref={box} data-testid={`${slot.id}-defect-stage`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>setDrag(null)}>
        <img className="defect-preview" src={d.preview} alt={`${slot.label} 수정할 곳 표시`} draggable={false}/>
        {live&&<div className="defect-drag" style={live}/>}
      </div></div>}
      {regions.length?<ul className="defect-list">{regions.map((r,i)=><li key={i}><label className="check"><input type="checkbox" aria-label={`${slot.id} 수정 ${i+1}`} checked={sel.includes(i)} onChange={()=>toggle(i)}/><b>{i+1}</b> {DEFECT_LABEL[r.type]||r.type} · {r.note} {r.manual?<small>(직접)</small>:<small>({Math.round(r.confidence*100)}%)</small>}</label><button type="button" className="subtle tiny" aria-label={`${slot.id} 표시 ${i+1} 삭제`} onClick={()=>remove(i)}>✕</button></li>)}</ul>
        :<p className="slot-note">{draw?'아직 표시한 곳이 없습니다. 사진 위에서 끌어서 표시하세요.':'표시된 곳이 없습니다. ‘직접 표시하기’로 추가할 수 있습니다.'}</p>}
      <div className="btn-row">
        <span className="btn-with-cost"><button type="button" className="primary" disabled={!sel.length||!iop?.ok} onClick={()=>{setDraw(false);onInpaint(slot.id);}}>IOPaint로 지우기 ({sel.length}곳)</button><Cost k="iopaint"/></span>
        <button type="button" className="subtle" onClick={()=>{setDraw(false);onPatch(slot.id,{defects:null});}}>표시 모두 지우기</button>
      </div>
      {!iop?.ok&&<p className="review-note">IOPaint가 꺼져 있습니다. 위쪽 ‘IOPaint 연결’ 안내대로 내 PC에서 IOPaint를 실행하세요.</p>}
      <p className="slot-note">빨간 상자만 지웁니다. 체크를 풀면 그 곳은 그대로 두고, ✕는 표시를 없앱니다. 직접 표시는 Claude를 쓰지 않아 무료입니다. 결과가 마음에 안 들면 ‘이전으로’로 되돌리세요(무료).</p>
    </>}
  </details>;
}

const MAX_VERSIONS=8;
// Claude 분류 결과(컷 종류) → 업로드 칸
const SHOT_SLOT={front:'hero',frontTop:'frontTop',frontBottom:'frontBottom',side:'side',back:'back',fabric:'fabric',fit:'fit'};
const SHOT_LABEL={front:'정면 전체',frontTop:'정면 상단',frontBottom:'정면 하단',side:'측면',back:'후면',fabric:'원단 디테일',fit:'모델 착용',detail:'기타 디테일',unknown:'알 수 없음'};
const PHOTO_FIELDS=['source','image','cutout','crop','derived','status','versions','vIndex','retouch','ai','defects'];
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

function PhotoSlot({slot,busy,onUpload,onPatch,onProcess,onRemove,onVersion,onSave,retouchDefault,status,bir,colorRef,onColorRef,onColorMatch,slotList,onMove,iop,onFindDefects,onInpaint}) {
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
    {slot.ai&&<div className={`ai-badge${slot.ai.review?' review':''}`}>{slot.ai.review?'⚠ 확인 필요':'AI 분류'} · {SHOT_LABEL[slot.ai.shot]||slot.ai.shot} {Math.round(slot.ai.confidence*100)}%{slot.ai.note?` — ${slot.ai.note}`:''}
      {slot.ai.review&&<button type="button" onClick={()=>onPatch(slot.id,{ai:{...slot.ai,review:false}})}>맞아요</button>}</div>}
    {slot.source&&slotList&&<label className="move-slot">자리 이동<select aria-label={`${slot.id} 자리 이동`} value="" onChange={e=>{if(e.target.value)onMove(slot.id,e.target.value);}}><option value="">이 사진을 다른 칸으로…</option>{slotList.filter(s=>s.id!==slot.id).map(s=><option key={s.id} value={s.id}>{s.label}{s.source?' (서로 바꾸기)':''}</option>)}</select></label>}
    {slot.source&&<VersionBar slot={slot} onVersion={onVersion}/>}
    {slot.source&&<details className="slot-retouch"><summary>이 사진 보정 설정{slot.retouch?' · 개별 설정 사용 중':' · 기본 설정 사용 중'}</summary>
      <label className="check"><input type="checkbox" aria-label={`${slot.id} 개별 설정 사용`} checked={Boolean(slot.retouch)} onChange={e=>onPatch(slot.id,{retouch:e.target.checked?{...retouchDefault}:null})}/>이 사진만 따로 설정하기</label>
      {slot.retouch?<RetouchSettings value={slot.retouch} onChange={value=>onPatch(slot.id,{retouch:value})} status={status} bir={bir} prefix={`${slot.id} `} title="이 사진 보정 설정"/>:<p className="slot-note">위쪽 ‘누끼·보정 설정(모든 사진 기본값)’을 따릅니다.</p>}
    </details>}
    {slot.source&&<details className="source-compare"><summary>원본과 비교</summary><img src={slot.source} alt={`${name} 원본`}/></details>}
    <div className="slot-actions">
      <label className="file-button">사진 {slot.image?'교체':'선택'}<input aria-label={`${slot.id} 사진 선택`} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)onUpload(slot.id,file);e.target.value='';}}/></label>
      {slot.source&&<span className="btn-with-cost"><button type="button" onClick={()=>onProcess(slot.id)}>이 사진 누끼·보정</button><Cost k={cutoutCost(slot.retouch||retouchDefault)}/></span>}
      {slot.cutout&&colorRef?.slotId!==slot.id&&<button type="button" onClick={()=>onColorRef(slot.id)}>🎨 이 컷 색감을 기준으로</button>}
      {slot.cutout&&colorRef&&colorRef.slotId!==slot.id&&<button type="button" onClick={()=>onColorMatch([slot.id])}>기준 색감으로 맞추기</button>}
      {colorRef?.slotId===slot.id&&<span className="color-badge"><i style={{background:labCss(colorRef.lab)}}/>색감 기준 컷</span>}
      {slot.image&&<><button type="button" onClick={()=>onSave(slot.id)}>개별 PNG 저장</button><button type="button" className="subtle" onClick={()=>onRemove(slot.id)}>사진 삭제</button></>}
    </div>
    {slot.cutout&&<DefectPanel slot={slot} iop={iop} onPatch={onPatch} onFind={onFindDefects} onInpaint={onInpaint}/>}
    {slot.status==='raw'&&<p className="slot-note">업로드한 사진입니다. 배경 제거·주름 보정은 ‘이 사진 누끼·보정’을 눌러 적용하세요.</p>}
    {slot.status==='done'&&<p className="slot-note">흰 배경 적용 · 색상과 무늬를 원본과 비교해 주세요.</p>}
  </section>;
}

export default function AutoStudio() {
  const [ready,setReady]=useState(null),[credits,setCredits]=useState(null),[retouch,setRetouch]=useState(DEFAULT_RETOUCH),[slots,setSlots]=useState(initialSlots),[fitEnabled,setFitEnabled]=useState(false);
  const [garment,setGarment]=useState('long-top'),[sizeRows,setSizeRows]=useState({});
  const [texts,setTexts]=useState(defaultTexts),[shopee,setShopee]=useState(defaultShopee);
  const [iop,setIop]=useState(null),[bir,setBir]=useState(null),[iopUrl,setIopUrl]=useState(getIopaintUrl),[frame,setFrame]=useState({enabled:false,ratio:'3:4',margin:6}),[colorRef,setColorRef]=useState(null),[matchStrength,setMatchStrength]=useState(80),[autoMatch,setAutoMatch]=useState(false);
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
  const snapshot=()=>({slots,texts,garment,sizeRows,fitEnabled,retouch,shopee,color:{ref:colorRef,strength:matchStrength,auto:autoMatch},frame});
  async function applyProduct(product) {
    const d=product?.data||{};
    skipSave.current=true;
    // 예전 버전이 대표 사진에서 자동으로 잘라 만든 디테일컷(원본 사진 없음)은 비웁니다.
    const nextSlots=Object.fromEntries(Object.entries(d.slots||initialSlots()).map(([k,v])=>[k,v.derived&&!v.source?{...v,image:null,cutout:null,crop:null,derived:false,status:'empty'}:{...v,retouch:sanitizeRetouch(v.retouch)}]));
    setSlots(nextSlots);setTexts({...defaultTexts(),...d.texts});setGarment(d.garment||'long-top');setSizeRows(d.sizeRows||{});
    setFitEnabled(Boolean(d.fitEnabled));setRetouch(sanitizeRetouch({...DEFAULT_RETOUCH,...d.retouch}));setShopee({...defaultShopee(),...d.shopee});
    setColorRef(d.color?.ref||null);setFrame({enabled:false,ratio:'3:4',margin:6,...d.frame});setMatchStrength(d.color?.strength??80);setAutoMatch(Boolean(d.color?.auto));
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
  },[slots,texts,garment,sizeRows,fitEnabled,retouch,shopee,productName,colorRef,matchStrength,autoMatch,frame]);
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
    if(options.cutout==='birefnet'){
      // BiRefNet(내 PC의 IOPaint) → 중앙 정렬은 브라우저에서 원본 크기 그대로 여백 6%로 맞춥니다.
      // BiRefNet 원본 결과는 사진별로 따로 보관 → 기둥 지우기·중앙 정렬만 바꿀 때 다시 돌리지 않음.
      const rawKey='birefnet:'+source;
      if(!cache.current.has(rawKey))cache.current.set(rawKey,await removeBackground(source));
      let c=await imageCanvas(cache.current.get(rawKey));
      if(options.removeStand!==false){
        // BiRefNet은 받침대 기둥을 옷의 일부로 남기므로, 사진 아래에서 올라오는 좁고 곧은 기둥만 지웁니다.
        const ctx=c.getContext('2d'),px=ctx.getImageData(0,0,c.width,c.height);
        if(removeStand(px))ctx.putImageData(px,0,0);
      }
      cutoutBounds(c.getContext('2d').getImageData(0,0,c.width,c.height));
      if(options.center!==false)c=framePhoto(c,{margin:6,size:[c.width,c.height]});
      const image=c.toDataURL('image/png');cache.current.set(key,image);return image;
    }
    const response=await api('retouch',{image:source,options});
    const canvas=await imageCanvas(response.image);
    cutoutBounds(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height));
    if(response.warning)warnings.push(response.warning);
    else cache.current.set(key,response.image);
    return response.image;
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
  async function matchColorsIn(current,ids,ref) {
    const next={...current},done=[],skipped=[];
    for(const id of ids){
      const slot=next[id];
      if(!slot||id===ref.slotId)continue;
      if(!slot.cutout){if(slot.source)skipped.push(slot.label);continue;}
      setStep(`${done.length+1} · ${slot.label} 색감 맞추는 중`);
      const {image}=await matchedCutout(slot.cutout,ref.lab);
      const versions=[...(slot.versions||[null]).slice(0,(slot.vIndex??0)+1),image].slice(-MAX_VERSIONS);
      next[id]={...slot,cutout:image,status:'done',versions,vIndex:versions.length-1};done.push(slot.label);
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
        const {image}=await matchedCutout(slot.cutout,colorRef.lab);
        const versions=[...(slot.versions||[null]).slice(0,(slot.vIndex??0)+1),image].slice(-MAX_VERSIONS);
        next[id]={...slot,cutout:image,status:'done',versions,vIndex:versions.length-1};done.push(slot.label);
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
      const versions=[...(slot.versions||[null]).slice(0,(slot.vIndex??0)+1),result].slice(-MAX_VERSIONS);
      const next=await refreshImages({...slots,[id]:{...slot,cutout:result,status:'done',versions,vIndex:versions.length-1,defects:null}});
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
          if(!id||next[id].source){id='extra-'+crypto.randomUUID();next[id]={id,label:item.shot==='unknown'?'확인 필요 사진':`${SHOT_LABEL[item.shot]||'추가'}컷`,enabled:true,source:null,image:null,cutout:null,crop:null,status:'empty'};}
          if(id==='fit')fit=true;
          next[id]={...next[id],source:p.full,image:whitePhoto(await imageCanvas(p.full),null,0),status:'raw',enabled:true,versions:[null],vIndex:0,ai:{shot:item.shot,confidence:item.confidence,review:item.review,note:item.note,file:p.name}};
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
  const photoProps={busy,onUpload:upload,onPatch:patch,onProcess:processPhotos,onRemove:removePhoto,onVersion:changeVersion,onSave:savePhoto,retouchDefault:retouch,status:ready,bir,colorRef,onColorRef:chooseColorRef,onColorMatch:matchColors,slotList:Object.values(slots).map(s=>({id:s.id,label:s.label,source:Boolean(s.source)})),onMove:moveSlot,iop,onFindDefects:findDefectsFor,onInpaint:inpaintFor};
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
    <div className="studio-workspace"><fieldset disabled={busy} className="studio-editor">
      <section className="editor-section"><h2>상품 정보와 공통 보정</h2>
        <label>옷 종류<select aria-label="옷 종류" value={garment} onChange={e=>changeGarment(e.target.value)}>{GARMENTS.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
        <label>상품 정보<textarea value={texts.product} maxLength={3000} placeholder="확인된 소재·색상·상품 정보만 입력하세요." onChange={e=>setText('product',e.target.value)}/></label>
        <label>상품 제목<input value={texts.headline} maxLength={200} onChange={e=>setText('headline',e.target.value)}/></label>
        <label>상품 설명<textarea value={texts.description} maxLength={4000} onChange={e=>setText('description',e.target.value)}/></label>
        <RetouchSettings value={retouch} onChange={setRetouch} status={ready} bir={bir} title="누끼·보정 설정 (모든 사진 기본값)"/>
        <p className="slot-note">사진별로 다르게 하려면 각 사진 아래 ‘이 사진 보정 설정’에서 바꾸세요.</p>
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
            :<p className="slot-note">마음에 드는 보정 컷에서 ‘🎨 이 컷 색감을 기준으로’를 누르세요. 그 컷 옷의 대표 색에 맞춰 다른 컷의 밝기·색조를 조정합니다.</p>}
          <label>맞추는 강도 · {matchStrength}%<input aria-label="색감 맞추는 강도" type="range" min="10" max="100" step="10" value={matchStrength} onChange={e=>setMatchStrength(Number(e.target.value))}/></label>
          <button type="button" disabled={!colorRef} onClick={()=>matchColors(Object.keys(slots))}>보정된 모든 컷을 기준 색감으로 맞추기</button>
          <label className="check"><input type="checkbox" aria-label="새 보정 컷 자동 색감 맞춤" disabled={!colorRef} checked={autoMatch} onChange={e=>setAutoMatch(e.target.checked)}/>앞으로 보정하는 컷도 자동으로 기준 색감에 맞추기</label>
          <p className="slot-note">누끼·보정된 컷에만 적용됩니다. 한 번에 바꾸는 양에 한계를 둬서 색이 크게 틀어지지 않으며, 각 컷의 ‘이전으로’로 되돌릴 수 있습니다. 같은 컷에 여러 번 누르면 조금씩 더 맞춰집니다.</p>
        </div>
        <span className="btn-with-cost"><button className="primary" disabled={!slots.hero.source} onClick={()=>processPhotos()}>사진 일괄 누끼·보정 및 문구 제작</button><Cost k={cutoutCost(retouch)}/><Cost k="openai"/></span>
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
    </fieldset><aside className="studio-preview"><h2>완성 상세페이지</h2><p>편집 후 ‘전체 미리보기’를 누르면 저장되는 이미지와 같은 구성을 확인할 수 있습니다.</p>{pendingCount>0&&<p className="review-note">보정 전 사진 {pendingCount}장이 포함되어 있습니다. 배경 제거가 필요하면 보정을 먼저 실행하세요.</p>}{previewBusy?<p>미리보기를 만들고 있습니다…</p>:preview?<img src={preview} alt="완성 상세페이지 미리보기"/>:<div className="preview-placeholder"><span>01 대표 정면샷</span><span>02 Fit guide · 선택</span><span>03 Detail</span><span>04 Size</span><button disabled={busy||!slots.hero.image} onClick={()=>exportPng(true)}>전체 미리보기</button></div>}</aside></div>
  </div>;
}
