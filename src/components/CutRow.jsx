import {useEffect, useRef, useState} from 'react';
import {Cost} from './Cost.jsx';
import {RetouchSettings, cutoutCost} from './RetouchSettings.jsx';
import {DEFECT_LABEL} from '../utils/iopaint.js';
import {labCss} from '../utils/colorMatch.js';
import {applyBrush} from '../utils/matte.js';
import {imageCanvas} from '../utils/studioImages.js';

export const SHOT_LABEL={front:'정면 전체',frontZoom:'정면 확대',frontTop:'정면 상단',frontBottom:'정면 하단',side:'측면',back:'후면',fabric:'원단 디테일',fit:'모델 착용',detail:'기타 디테일',unknown:'알 수 없음'};
const STAGE_LABEL={stage1:'1차',stage2:'2차',final:'최종'};

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

// 이 단계의 옷 색감을 모든 컷의 기준으로. 한 컷에서 고르면 다른 컷의 체크칸은 잠깁니다.
function ColorRefCheck({slot,stage,colorRef,onColorRef,has}) {
  const mine=colorRef?.slotId===slot.id,on=mine&&colorRef.stage===stage,locked=colorRef&&!mine;
  return <label className={`check color-ref-check${on?' on':''}`} title={locked?`‘${colorRef.label}’ 컷이 기준입니다. 그 컷에서 체크를 풀면 고를 수 있습니다.`:''}>
    <input type="checkbox" aria-label={`${slot.id} 색감 기준 ${STAGE_LABEL[stage]}`} checked={on} disabled={!has||locked} onChange={e=>onColorRef(slot.id,e.target.checked?stage:null)}/>
    {on?<><i className="swatch" style={{background:labCss(colorRef.lab)}}/>이 색감이 기준</>:'이 색감을 기준으로'}
  </label>;
}

// ---- 배경 직접 수정 (붓) ----
const TOOLS=[['restore','되살리기','지워진 마네킹·옷을 원본에서 되살립니다'],['eraseBg','배경색만 지우기','칠한 곳에서 주변 배경과 비슷한 색만 지웁니다(대충 칠해도 됨)'],['erase','모두 지우기','칠한 곳을 모두 지웁니다']];
function MatteEditor({slot,onApply,onCancel}) {
  const canvas=useRef(null),overlay=useRef(null),work=useRef(null),src=useRef(null),undo=useRef([]),stroke=useRef(null);
  const [tool,setTool]=useState('restore'),[size,setSize]=useState(3),[tol,setTol]=useState(18),[aligned,setAligned]=useState(true),[ready,setReady]=useState(false),[msg,setMsg]=useState(''),[steps,setSteps]=useState(0);
  useEffect(()=>{(async()=>{
    const m=await imageCanvas(slot.matte),c=canvas.current;c.width=m.width;c.height=m.height;overlay.current.width=m.width;overlay.current.height=m.height;
    work.current=m.getContext('2d').getImageData(0,0,m.width,m.height);
    const s=slot.source?await imageCanvas(slot.source):null;
    const ok=Boolean(s&&s.width===m.width&&s.height===m.height);setAligned(ok);if(!ok)setTool('erase');
    src.current=ok?s.getContext('2d').getImageData(0,0,s.width,s.height):null;
    c.getContext('2d').putImageData(work.current,0,0);setReady(true);
  })();},[slot.matte]);
  const at=e=>{const r=canvas.current.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*canvas.current.width,y:(e.clientY-r.top)/r.height*canvas.current.height};};
  const radius=()=>Math.max(2,canvas.current.width*size/100);
  const paint=p=>{const o=overlay.current.getContext('2d');o.fillStyle=tool==='restore'?'rgba(30,140,70,.35)':'rgba(224,36,94,.35)';o.beginPath();o.arc(p.x,p.y,radius(),0,Math.PI*2);o.fill();};
  const down=e=>{if(!ready)return;e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);const p=at(e);stroke.current=[p];paint(p);};
  const move=e=>{if(!stroke.current)return;const p=at(e);stroke.current.push(p);paint(p);};
  const up=()=>{
    const pts=stroke.current;stroke.current=null;if(!pts)return;
    overlay.current.getContext('2d').clearRect(0,0,overlay.current.width,overlay.current.height);
    const before=new Uint8ClampedArray(work.current.data);
    try {
      const n=applyBrush({matte:work.current,source:src.current,points:pts,radius:radius(),mode:tool,tolerance:tol});
      if(n){undo.current=[...undo.current.slice(-9),before];setSteps(undo.current.length);canvas.current.getContext('2d').putImageData(work.current,0,0);setMsg('');}
      else setMsg(tool==='eraseBg'?'바뀐 곳이 없습니다. 색 민감도를 올리거나 배경과 맞닿은 곳을 칠하세요.':'바뀐 곳이 없습니다.');
    } catch(err){setMsg(err.message);}
  };
  const back=()=>{const b=undo.current.pop();if(!b)return;work.current.data.set(b);canvas.current.getContext('2d').putImageData(work.current,0,0);setSteps(undo.current.length);};
  const apply=()=>{const c=document.createElement('canvas');c.width=work.current.width;c.height=work.current.height;c.getContext('2d').putImageData(work.current,0,0);onApply(c.toDataURL('image/png'));};
  return <div className="matte-editor">
    <div className="matte-stage" data-testid={`${slot.id}-matte-stage`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{stroke.current=null;}}>
      <canvas ref={canvas} className="matte-canvas" aria-label={`${slot.id} 배경 수정 화면`}/><canvas ref={overlay} className="matte-overlay"/>
    </div>
    <div className="tool-pick" role="radiogroup" aria-label={`${slot.id} 붓 종류`}>{TOOLS.map(([id,label,hint])=><label key={id} className="check" title={hint}><input type="radio" name={`${slot.id}-tool`} aria-label={`${slot.id} ${label}`} checked={tool===id} disabled={!aligned&&id!=='erase'} onChange={()=>setTool(id)}/>{label}</label>)}</div>
    <label>붓 크기 · {size}%<input type="range" aria-label={`${slot.id} 붓 크기`} min="1" max="12" value={size} onChange={e=>setSize(Number(e.target.value))}/></label>
    {tool==='eraseBg'&&<label>색 민감도 · {tol}<input type="range" aria-label={`${slot.id} 색 민감도`} min="6" max="40" value={tol} onChange={e=>setTol(Number(e.target.value))}/></label>}
    <p className="slot-note">{TOOLS.find(t=>t[0]===tool)[2]}. 분홍 체크무늬가 지워진(배경) 곳입니다.{!aligned&&' 이 결과는 원본과 크기가 달라 ‘모두 지우기’만 쓸 수 있습니다.'}</p>
    {msg&&<p className="review-note">{msg}</p>}
    <div className="btn-row"><button type="button" disabled={!steps} onClick={back}>↶ 한 획 되돌리기</button><button type="button" className="primary" disabled={!steps} onClick={apply}>수정 적용</button><button type="button" className="subtle" onClick={onCancel}>취소</button></div>
  </div>;
}

// ---- 2차 보정: 얼룩·구김 (Claude 표시 + 직접 표시 → IOPaint) ----
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
  const at=e=>{const r=box.current.getBoundingClientRect();const c=v=>Math.max(0,Math.min(1000,Math.round(v)));return {x:c((e.clientX-r.left)/r.width*1000),y:c((e.clientY-r.top)/r.height*1000)};};
  const down=e=>{if(!draw)return;e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);const p=at(e);setDrag({a:p,b:p});};
  const move=e=>{if(drag)setDrag({...drag,b:at(e)});};
  const up=e=>{
    if(!drag)return;const b=at(e),r={x0:Math.min(drag.a.x,b.x),y0:Math.min(drag.a.y,b.y),x1:Math.max(drag.a.x,b.x),y1:Math.max(drag.a.y,b.y)};setDrag(null);
    if(r.x1-r.x0<4||r.y1-r.y0<4)return;
    save([...regions,{type:kind,...r,confidence:1,note:'직접 표시',manual:true}],[...sel,regions.length]);
  };
  const live=drag&&{left:`${Math.min(drag.a.x,drag.b.x)/10}%`,top:`${Math.min(drag.a.y,drag.b.y)/10}%`,width:`${Math.abs(drag.b.x-drag.a.x)/10}%`,height:`${Math.abs(drag.b.y-drag.a.y)/10}%`};
  const shown=d?.preview||slot.stage2||slot.stage1;
  return <div className="defect-panel">
    <div className={`cut-img defect-stage${draw?' drawing':''}`}>
      {shown?<div className="defect-box" ref={box} data-testid={`${slot.id}-defect-stage`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>setDrag(null)}>
        <img className={d?.preview?'defect-preview':'stage2-img'} src={shown} alt={`${slot.label} 2차 보정`} draggable={false}/>
        {live&&<div className="defect-drag" style={live}/>}
      </div>:<p className="empty-stage">1차 보정 후 사용할 수 있습니다</p>}
    </div>
    {slot.cutout&&<>
      <div className="btn-row">
        <span className="btn-with-cost"><button type="button" onClick={()=>onFind(slot.id)}>🤖 수정할 곳 자동 찾기</button><Cost k="claudeDefects"/></span>
        <span className="btn-with-cost"><button type="button" className={draw?'primary':''} aria-pressed={draw} onClick={startManual}>✏️ 직접 표시하기{draw?' (켜짐)':''}</button><Cost k="browser"/></span>
      </div>
      {draw&&<div className="btn-row draw-tools"><label>표시 종류<select aria-label={`${slot.id} 직접 표시 종류`} value={kind} onChange={e=>setKind(e.target.value)}>{MANUAL_TYPES.map(t=><option key={t} value={t}>{DEFECT_LABEL[t]}</option>)}</select></label>
        <p className="slot-note">사진 위에서 지울 곳을 <b>끌어서 상자</b>로 표시하세요. 다 했으면 ‘직접 표시하기’를 다시 눌러 끕니다.</p></div>}
      {d&&<>
        {regions.length?<ul className="defect-list">{regions.map((r,i)=><li key={i}><label className="check"><input type="checkbox" aria-label={`${slot.id} 수정 ${i+1}`} checked={sel.includes(i)} onChange={()=>toggle(i)}/><b>{i+1}</b> {DEFECT_LABEL[r.type]||r.type} · {r.note} {r.manual?<small>(직접)</small>:<small>({Math.round(r.confidence*100)}%)</small>}</label><button type="button" className="subtle tiny" aria-label={`${slot.id} 표시 ${i+1} 삭제`} onClick={()=>remove(i)}>✕</button></li>)}</ul>
          :<p className="slot-note">{draw?'사진 위에서 끌어서 표시하세요.':'표시된 곳이 없습니다.'}</p>}
        <div className="btn-row">
          <span className="btn-with-cost"><button type="button" className="primary" disabled={!sel.length||!iop?.ok} onClick={()=>{setDraw(false);onInpaint(slot.id);}}>IOPaint로 지우기 ({sel.length}곳)</button><Cost k="iopaint"/></span>
          <button type="button" className="subtle" onClick={()=>{setDraw(false);onPatch(slot.id,{defects:null});}}>표시 모두 지우기</button>
        </div>
        {!iop?.ok&&<p className="review-note">IOPaint가 꺼져 있습니다. 위쪽 ‘사용 도구·비용’ 안내대로 내 PC에서 IOPaint를 실행하세요.</p>}
      </>}
    </>}
  </div>;
}

// ---- 컷 한 줄: 원본 → 1차 보정 → 2차 보정 → 최종 (PC는 가로 4칸, 모바일은 세로) ----
export function CutRow({slot,busy,onUpload,onPatch,onProcess,onMatteEdit,onTone,onRemove,onVersion,onSave,retouchDefault,status,bir,colorRef,onColorRef,slotList,onMove,iop,onFindDefects,onInpaint,onHide}) {
  const [editing,setEditing]=useState(false);
  const tone=slot.tone||{bright:0,vivid:0},[draft,setDraft]=useState(tone);
  useEffect(()=>setDraft(slot.tone||{bright:0,vivid:0}),[slot.tone]);
  useEffect(()=>{if(!slot.matte)setEditing(false);},[slot.matte]);
  function paste(event) {
    const file=Array.from(event.clipboardData?.files||[]).find(f=>f.type.startsWith('image/'));
    if(file){event.preventDefault();onUpload(slot.id,file);}
  }
  const name=slot.label||'사진',opts=slot.retouch||retouchDefault,toneChanged=draft.bright!==tone.bright||draft.vivid!==tone.vivid;
  return <section className="cut-row photo-slot" data-slot={slot.id}>
    <div className="cut-head">
      <input className="cut-title" aria-label={`${slot.id} 사진 제목`} value={slot.label} maxLength={100} onChange={e=>onPatch(slot.id,{label:e.target.value})}/>
      {slot.id!=='hero'&&<label className="check"><input type="checkbox" aria-label={slot.id==='fit'?'모델컷 상세페이지에 포함':'상세페이지에 포함'} checked={slot.enabled} onChange={e=>onPatch(slot.id,{enabled:e.target.checked})}/>상세페이지에 포함</label>}
      {slot.ai&&<div className={`ai-badge${slot.ai.review?' review':''}`}>{slot.ai.review?'⚠ 확인 필요':'AI 분류'} · {SHOT_LABEL[slot.ai.shot]||slot.ai.shot} {Math.round(slot.ai.confidence*100)}%{slot.ai.note?` — ${slot.ai.note}`:''}
        {slot.ai.review&&<button type="button" onClick={()=>onPatch(slot.id,{ai:{...slot.ai,review:false}})}>맞아요</button>}</div>}
      {slot.source&&slotList&&<label className="move-slot">자리 이동<select aria-label={`${slot.id} 자리 이동`} value="" onChange={e=>{if(e.target.value)onMove(slot.id,e.target.value);}}><option value="">다른 칸으로…</option>{slotList.filter(s=>s.id!==slot.id).map(s=><option key={s.id} value={s.id}>{s.label}{s.source?' (서로 바꾸기)':''}</option>)}</select></label>}
      {!slot.source&&slot.id!=='hero'&&onHide&&<button type="button" className="subtle tiny" aria-label={`${slot.id} 칸 숨기기`} onClick={()=>onHide(slot.id)}>숨기기</button>}
    </div>
    <div className="cut-grid">
      <div className="cut-col">
        <h4>원본</h4>
        <div className="cut-img source-zone" tabIndex={busy?-1:0} onPaste={busy?undefined:paste} aria-label={`${name} 이미지 붙여넣기`}>
          {slot.source?<img src={slot.source} alt={`${name} 원본`}/>:<p>사진을 선택하거나<br/>여기를 클릭한 뒤 Ctrl+V</p>}
        </div>
        <div className="btn-row">
          <label className="file-button">사진 {slot.source?'교체':'선택'}<input aria-label={`${slot.id} 사진 선택`} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)onUpload(slot.id,file);e.target.value='';}}/></label>
          {slot.source&&<button type="button" className="subtle" onClick={()=>onRemove(slot.id)}>사진 삭제</button>}
        </div>
      </div>
      <div className="cut-col">
        <h4>1차 보정 <small>배경 · 기둥 · 색상</small></h4>
        {editing&&slot.matte?<MatteEditor slot={slot} onApply={url=>{setEditing(false);onMatteEdit(slot.id,url);}} onCancel={()=>setEditing(false)}/>
          :<div className="cut-img">{slot.stage1?<img className="stage1-img" src={slot.stage1} alt={`${name} 1차 보정`}/>:<p className="empty-stage">{slot.source?'아래 ‘이 사진 누끼·보정’을 누르세요':'원본을 먼저 넣으세요'}</p>}</div>}
        <ColorRefCheck slot={slot} stage="stage1" colorRef={colorRef} onColorRef={onColorRef} has={Boolean(slot.stage1)}/>
        {slot.source&&<div className="btn-row"><span className="btn-with-cost"><button type="button" onClick={()=>onProcess(slot.id)}>이 사진 누끼·보정</button><Cost k={cutoutCost(opts)}/></span>
          {slot.matte&&!editing&&<button type="button" onClick={()=>setEditing(true)}>✏️ 배경 직접 수정</button>}</div>}
        {slot.stage1&&!editing&&<div className="tone-tools">
          <label>밝기 · {draft.bright>0?'+':''}{draft.bright}<input type="range" aria-label={`${slot.id} 밝기`} min="-30" max="30" value={draft.bright} onChange={e=>setDraft({...draft,bright:Number(e.target.value)})}/></label>
          <label>화사하게 · {draft.vivid>0?'+':''}{draft.vivid}<input type="range" aria-label={`${slot.id} 화사하게`} min="-20" max="40" value={draft.vivid} onChange={e=>setDraft({...draft,vivid:Number(e.target.value)})}/></label>
          <button type="button" disabled={!toneChanged} onClick={()=>onTone(slot.id,draft)}>색상 보정 적용</button><Cost k="browser"/>
        </div>}
        {slot.source&&<details className="slot-retouch"><summary>1차 보정 설정{slot.retouch?' · 이 컷만 따로':' · 기본 설정'}</summary>
          <label className="check"><input type="checkbox" aria-label={`${slot.id} 개별 설정 사용`} checked={Boolean(slot.retouch)} onChange={e=>onPatch(slot.id,{retouch:e.target.checked?{...retouchDefault}:null})}/>이 컷만 따로 설정하기</label>
          {slot.retouch?<RetouchSettings value={slot.retouch} onChange={value=>onPatch(slot.id,{retouch:value})} status={status} bir={bir} prefix={`${slot.id} `} title="이 컷 1차 보정 설정"/>:<p className="slot-note">위쪽 ‘누끼·보정 설정(모든 컷 기본값)’을 따릅니다.</p>}
        </details>}
      </div>
      <div className="cut-col">
        <h4>2차 보정 <small>얼룩 · 구김</small></h4>
        <DefectPanel slot={slot} iop={iop} onPatch={onPatch} onFind={onFindDefects} onInpaint={onInpaint}/>
        <ColorRefCheck slot={slot} stage="stage2" colorRef={colorRef} onColorRef={onColorRef} has={Boolean(slot.stage2)}/>
      </div>
      <div className="cut-col">
        <h4>최종 완성본</h4>
        <div className="cut-img final-zone">{slot.image?<img src={slot.image} alt={name}/>:<p className="empty-stage">아직 없습니다</p>}</div>
        <ColorRefCheck slot={slot} stage="final" colorRef={colorRef} onColorRef={onColorRef} has={Boolean(slot.cutout)}/>
        {slot.source&&<VersionBar slot={slot} onVersion={onVersion}/>}
        {slot.image&&<button type="button" onClick={()=>onSave(slot.id)}>개별 PNG 저장</button>}
      </div>
    </div>
  </section>;
}
