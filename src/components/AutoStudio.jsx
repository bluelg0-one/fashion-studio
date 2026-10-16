import {useEffect, useRef, useState} from 'react';
import './AutoStudio.css';
import {cutoutBounds, clampCrop, cropCanvas} from '../utils/detailCrops.js';
import {GARMENTS, initialSlots, newSizeRow, sizeFields, guideUrl, documentBlocks, documentHtml} from '../utils/studioDocument.js';
import {readPhoto, imageCanvas, medianLight, whitePhoto, download, downloadBlob, renderDocument} from '../utils/studioImages.js';

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

function defaultRegions(bounds,type) {
  const pants=type.endsWith('pants');
  const regions={
    frontZoom:{x:.05,y:pants ? .03 : .15,w:.9,h:pants ? .9 : .78},
    frontTop:{x:.04,y:pants ? .02 : .12,w:.92,h:.38},
    frontBottom:{x:.04,y:.57,w:.92,h:.4},
    fabric:{x:.34,y:pants ? .27 : .39,w:.32,h:.25},
  };
  return Object.fromEntries(Object.entries(regions).map(([id,d])=>[id,clampCrop({x:bounds.x+d.x*bounds.w,y:bounds.y+d.y*bounds.h,w:d.w*bounds.w,h:d.h*bounds.h})]));
}

function PhotoSlot({slot,busy,onUpload,onPatch,onProcess,onCrop,onRemove}) {
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
    {slot.source&&<details className="source-compare"><summary>원본과 비교</summary><img src={slot.source} alt={`${name} 원본`}/></details>}
    <div className="slot-actions">
      <label className="file-button">사진 {slot.image?'교체':'선택'}<input aria-label={`${slot.id} 사진 선택`} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)onUpload(slot.id,file);e.target.value='';}}/></label>
      {slot.source&&<button type="button" onClick={()=>onProcess(slot.id)}>이 사진 누끼·보정</button>}
      {slot.image&&<><button type="button" onClick={()=>download(slot.image,`${slot.id}.png`)}>개별 PNG 저장</button><button type="button" className="subtle" onClick={()=>onRemove(slot.id)}>사진 삭제</button></>}
    </div>
    {slot.status==='raw'&&<p className="slot-note">업로드한 사진입니다. 배경 제거·주름 보정은 ‘이 사진 누끼·보정’을 눌러 적용하세요.</p>}
    {slot.status==='done'&&<p className="slot-note">흰 배경 적용 · 색상과 무늬를 원본과 비교해 주세요.</p>}
    {slot.derived&&slot.crop&&<details className="crop-controls"><summary>확대 위치·범위 조정</summary><p>대표 사진에서 자릅니다. 추가 생성 비용이 없습니다.</p>
      {[['x','가로 위치'],['y','세로 위치'],['w','가로 범위'],['h','세로 범위']].map(([key,label])=><label key={key}>{label} · {Math.round(slot.crop[key]*100)}%<input type="range" aria-label={`${slot.id} ${label}`} min={['w','h'].includes(key)?5:0} max="100" value={Math.round(slot.crop[key]*100)} onChange={e=>onCrop(slot.id,key,Number(e.target.value)/100)}/></label>)}
    </details>}
  </section>;
}

export default function AutoStudio() {
  const [ready,setReady]=useState(null),[slots,setSlots]=useState(initialSlots),[fitEnabled,setFitEnabled]=useState(false);
  const [garment,setGarment]=useState('long-top'),[sizeRows,setSizeRows]=useState({});
  const [texts,setTexts]=useState({headline:'',description:'',product:'',fitTitle:'Fit guide',fitDescription:'',detailTitle:'Detail',sizeTitle:'Size',sizeNote:'단위: cm · 단면 기준\n측정 위치와 방법에 따라 실측값에 차이가 있을 수 있습니다.'});
  const [brightness,setBrightness]=useState(3),[busy,setBusy]=useState(false),[step,setStep]=useState(''),[error,setError]=useState('');
  const [preview,setPreview]=useState(null),[previewBusy,setPreviewBusy]=useState(false);
  const cache=useRef(new Map()),lock=useRef(false),heroCanvas=useRef(null),previewUrl=useRef(null);
  const rows=sizeRows[garment]||[newSizeRow()];
  useEffect(()=>{api('status').then(r=>setReady(r.configured)).catch(()=>setReady(false));return()=>{if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);};},[]);
  const patch=(id,values)=>{setSlots(current=>({...current,[id]:{...current[id],...values}}));setPreview(null);};
  const setText=(key,value)=>{setTexts(current=>({...current,[key]:value}));setPreview(null);};
  async function task(work) {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');setPreview(null);
    try {await work();}catch(e){setError(e.message);setStep('중단됨 · 완료한 사진은 유지됩니다.');}
    finally {lock.current=false;setBusy(false);}
  }
  async function upload(id,file) {
    await task(async()=>{
      const source=await readPhoto(file),canvas=await imageCanvas(source);
      patch(id,{source,image:whitePhoto(canvas,null,0),cutout:null,crop:null,derived:false,status:'raw',enabled:true});
      if(id==='hero'){
        heroCanvas.current=null;
        setSlots(current=>Object.fromEntries(Object.entries(current).map(([key,slot])=>[key,slot.derived?{...slot,image:null,cutout:null,crop:null,status:'empty'}:slot])));
      }
      setStep('사진을 넣었습니다. 누끼·보정을 적용하거나 사진을 더 추가하세요.');
    });
  }
  async function edited(source) {
    if(cache.current.has(source))return cache.current.get(source);
    const response=await api('edit',{image:source});
    const canvas=await imageCanvas(response.image);
    cutoutBounds(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height));
    cache.current.set(source,response.image);
    return response.image;
  }
  async function refreshImages(current,makeDefaults=false,type=garment) {
    let target=null,hero=null;
    if(current.hero.cutout){hero=await imageCanvas(current.hero.cutout);heroCanvas.current=hero;target=medianLight(hero);}
    const next={...current};
    if(makeDefaults&&hero){
      const bounds=cutoutBounds(hero.getContext('2d').getImageData(0,0,hero.width,hero.height));
      for(const [id,rect] of Object.entries(defaultRegions(bounds,type))){
        // Uploaded close-ups always win over automatically generated crops.
        if(!next[id].source&&(next[id].status==='empty'||next[id].derived))next[id]={...next[id],derived:true,crop:rect,status:'done'};
      }
    }
    for(const [id,slot] of Object.entries(next)){
      if(slot.derived&&slot.crop&&hero){const crop=cropCanvas(hero,slot.crop);next[id]={...slot,image:whitePhoto(await imageCanvas(crop.image),target,brightness),status:'done'};}
      else if(slot.cutout)next[id]={...slot,image:whitePhoto(await imageCanvas(slot.cutout),target,brightness),status:'done'};
    }
    return next;
  }
  async function processPhotos(onlyId) {
    await task(async()=>{
      const status=await api('status');setReady(status.configured);
      if(!status.configured)throw new Error('서버에 API 키가 연결되지 않았습니다. API 키가 설정된 Preview에서 실행하세요.');
      let current={...slots};
      const pending=Object.values(current).filter(slot=>slot.source&&(onlyId?slot.id===onlyId:slot.enabled&&(slot.id!=='fit'||fitEnabled)&&slot.status!=='done'));
      for(let index=0;index<pending.length;index++){
        const slot=pending[index];setStep(`${index+1}/${pending.length} · ${slot.label} 배경 제거·약한 주름 보정`);
        const cutout=await edited(slot.source);
        current={...current,[slot.id]:{...slot,cutout,status:'done'}};
        current=await refreshImages(current,slot.id==='hero');
        setSlots(current);
      }
      if(!onlyId&&!texts.headline&&current.hero.source){
        setStep('확인된 상품 정보로 문구 작성 중');
        const copy=await api('analyze',{image:current.hero.source,product:texts.product});
        setTexts(value=>({...value,headline:copy.headline,description:[copy.description,...copy.points].join('\n')}));
      }
      setStep('완료 · 사진과 문구를 확인한 후 전체 이미지를 저장하세요.');
    });
  }
  function adjustCrop(id,key,value) {
    if(!heroCanvas.current)return;
    const crop=clampCrop({...slots[id].crop,[key]:value});
    // Synchronous canvas crop avoids older slider updates replacing newer edits.
    const source=heroCanvas.current,c=document.createElement('canvas');
    const x=Math.round(crop.x*source.width),y=Math.round(crop.y*source.height);
    c.width=Math.max(1,Math.min(source.width-x,Math.round(crop.w*source.width)));c.height=Math.max(1,Math.min(source.height-y,Math.round(crop.h*source.height)));
    c.getContext('2d').drawImage(source,x,y,c.width,c.height,0,0,c.width,c.height);
    patch(id,{crop,image:whitePhoto(c,medianLight(source),brightness)});
  }
  function removePhoto(id) {
    setPreview(null);
    setSlots(current=>{
      const next={...current,[id]:{...current[id],source:null,image:null,cutout:null,crop:null,derived:false,status:'empty'}};
      if(id==='hero'){
        heroCanvas.current=null;
        for(const [key,slot] of Object.entries(next))if(slot.derived)next[key]={...slot,image:null,cutout:null,crop:null,status:'empty'};
      }
      return next;
    });
  }
  async function changeGarment(value) {
    await task(async()=>{setGarment(value);setSlots(await refreshImages(slots,true,value));});
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
  const photoProps={busy,onUpload:upload,onPatch:patch,onProcess:processPhotos,onCrop:adjustCrop,onRemove:removePhoto};
  const pendingCount=Object.values(slots).filter(s=>s.image&&s.enabled&&s.status==='raw'&&(s.id!=='fit'||fitEnabled)).length;
  return <div className="auto-studio">
    <div className="studio-heading"><div><span className="eyebrow">FASHION STUDIO / PAGE EDITOR</span><h1>의류 상세페이지 제작</h1><p>대표 사진 → Fit guide → Detail → Size 순서로 구성합니다.</p></div><span className="connection">{ready===null?'연결 확인 중':ready?'API 키 설정됨 · AI 보정 시 사용료 발생':'AI 연결 필요 · 사진 배치와 편집은 가능합니다'}</span></div>
    <div className="studio-toolbar"><button disabled={busy} onClick={()=>exportPng(true)}>전체 미리보기</button><button disabled={busy} className="primary" onClick={()=>exportPng(false)}>상세페이지 전체 PNG 저장</button><button disabled={busy} onClick={exportHtml}>HTML 다운로드</button></div>
    <p className="session-note">작업은 현재 브라우저 메모리에만 보관됩니다. 새로고침하거나 다른 탭으로 이동하기 전에 저장하세요.</p>
    <p role="status" aria-live="polite">{step}</p>{error&&<p role="alert" className="studio-error">{error}</p>}
    <div className="studio-workspace"><fieldset disabled={busy} className="studio-editor">
      <section className="editor-section"><h2>상품 정보와 공통 보정</h2>
        <label>옷 종류<select aria-label="옷 종류" value={garment} onChange={e=>changeGarment(e.target.value)}>{GARMENTS.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}</select></label>
        <label>상품 정보<textarea value={texts.product} maxLength={3000} placeholder="확인된 소재·색상·상품 정보만 입력하세요." onChange={e=>setText('product',e.target.value)}/></label>
        <label>상품 제목<input value={texts.headline} maxLength={200} onChange={e=>setText('headline',e.target.value)}/></label>
        <label>상품 설명<textarea value={texts.description} maxLength={4000} onChange={e=>setText('description',e.target.value)}/></label>
        <p>배경을 제거해 흰색으로 저장하고, 주름과 조명을 약하게 정리합니다. 무늬·봉제선·실제 색상은 원본과 비교해 주세요.</p>
        <label>공통 밝기 · {brightness}%<input aria-label="공통 밝기" type="range" min="0" max="8" value={brightness} onChange={e=>setBrightness(Number(e.target.value))}/></label>
        <button onClick={()=>task(async()=>{setSlots(await refreshImages(slots));setStep('보정된 사진 전체에 공통 밝기를 적용했습니다.');})}>보정된 사진에 공통 밝기 적용</button>
        <button className="primary" disabled={!slots.hero.source} onClick={()=>processPhotos()}>사진 일괄 누끼·보정 및 문구 제작</button>
        <p className="slot-note">완료한 사진은 재사용합니다. 옆면·후면·모델 사진은 실제 사진을 넣었을 때만 사용합니다.</p>
      </section>
      <PhotoSlot slot={slots.hero} {...photoProps}/>
      <section className="editor-section"><h2>02 · Fit guide</h2><label className="check"><input type="checkbox" checked={fitEnabled} onChange={e=>{setFitEnabled(e.target.checked);setPreview(null);}}/>모델컷 적용</label><p>선택하고 모델 사진을 넣으면 표시됩니다. 사진이 없으면 전체 상세페이지에서 제외됩니다.</p>
        {fitEnabled&&<><label>Fit guide 제목<input maxLength={100} value={texts.fitTitle} onChange={e=>setText('fitTitle',e.target.value)}/></label><label>모델 설명<textarea maxLength={1500} value={texts.fitDescription} onChange={e=>setText('fitDescription',e.target.value)} placeholder="확인된 모델 키·착용 사이즈 등을 입력하세요."/></label><PhotoSlot slot={slots.fit} {...photoProps}/></>}
      </section>
      <section className="editor-section"><h2>03 · Detail</h2><label>Detail 제목<input maxLength={100} value={texts.detailTitle} onChange={e=>setText('detailTitle',e.target.value)}/></label><p>정면 확대·상단·하단·원단컷은 대표 사진 보정 후 자동 배치합니다. 직접 찍은 클로즈업 사진으로 교체하면 더 선명한 디테일을 보여줄 수 있습니다.</p>
        <button disabled={!slots.hero.cutout} onClick={()=>task(async()=>{setSlots(await refreshImages(slots,true));setStep('선택한 옷 종류에 맞춰 자동 확대 영역을 다시 배치했습니다.');})}>옷 종류 기준으로 자동 확대 위치 초기화</button>
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
    </fieldset><aside className="studio-preview"><h2>완성 상세페이지</h2><p>편집 후 ‘전체 미리보기’를 누르면 저장되는 이미지와 같은 구성을 확인할 수 있습니다.</p>{pendingCount>0&&<p className="review-note">보정 전 사진 {pendingCount}장이 포함되어 있습니다. 배경 제거가 필요하면 보정을 먼저 실행하세요.</p>}{previewBusy?<p>미리보기를 만들고 있습니다…</p>:preview?<img src={preview} alt="완성 상세페이지 미리보기"/>:<div className="preview-placeholder"><span>01 대표 정면샷</span><span>02 Fit guide · 선택</span><span>03 Detail</span><span>04 Size</span><button disabled={busy||!slots.hero.image} onClick={()=>exportPng(true)}>전체 미리보기</button></div>}</aside></div>
  </div>;
}
