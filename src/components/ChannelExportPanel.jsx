import {useState} from 'react';
import {CHANNELS, VERIFIED_LABEL, DEFAULT_MARGIN} from '../utils/channelSpecs.js';
import {channelPhotos, channelSummary, channelPackage} from '../utils/channelExport.js';
import {downloadBlob} from '../utils/studioImages.js';
import {Cost} from './Cost.jsx';

const CHOICE_KEY='fashion-studio-channel-export';
const loadChoice=()=>{try{const v=JSON.parse(localStorage.getItem(CHOICE_KEY));if(v&&Array.isArray(v.ids))return v;}catch{}return {ids:CHANNELS.map(c=>c.id),margin:DEFAULT_MARGIN};};

const px=([w,h])=>`${w}×${h}`;
const mb=b=>`${Math.round(b/1024/1024*10)/10}MB`;

export default function ChannelExportPanel({slots,fitEnabled,task,setStep,productName}) {
  const [choice,setChoice]=useState(loadChoice);
  const update=next=>{setChoice(next);try{localStorage.setItem(CHOICE_KEY,JSON.stringify(next));}catch{}};
  const toggle=id=>update({...choice,ids:choice.ids.includes(id)?choice.ids.filter(x=>x!==id):[...choice.ids,id]});
  const photos=channelPhotos(slots,fitEnabled);
  const summary=channelSummary(choice.ids,photos);
  const total=summary.reduce((n,x)=>n+x.items.length,0);

  async function exportAll() {
    await task(async()=>{
      setStep('채널별 사진을 만드는 중');
      const {blob,count,filename}=await channelPackage({name:productName,slots,fitEnabled,channelIds:choice.ids,margin:choice.margin,onProgress:(d,t)=>setStep(`채널별 사진 만드는 중 · ${d}/${t}`)});
      downloadBlob(blob,filename);
      setStep(`채널별 묶음 저장 완료 · 사진 ${count}장 (채널마다 폴더, 목록.txt 포함)`);
    });
  }

  return <section className="editor-section channel-panel"><h2>07 · 채널별 내보내기</h2>
    <p>완성 사진(최종 버전)을 채널 규격에 맞춰 흰 배경 · 같은 여백 · 가운데 배치로 한 번에 만듭니다. 옷은 자르지 않습니다. 채널마다 폴더가 나뉜 ZIP 하나로 받습니다.</p>
    <div className="channel-list">
      {CHANNELS.map(c=><div key={c.id} className="channel-item">
        <label className="check"><input type="checkbox" aria-label={`${c.label} 내보내기`} checked={choice.ids.includes(c.id)} onChange={()=>toggle(c.id)}/><b>{c.label}</b> <span className={`spec-badge spec-${c.verified}`}>{VERIFIED_LABEL[c.verified]}</span></label>
        <ul>{c.images.map(s=><li key={s.role}>{s.label}: {s.ratio.join(':')} · {px(s.size)} · JPG · {mb(s.maxBytes)} 이하 · 흰 배경{Number.isFinite(s.maxCount)?` · 최대 ${s.maxCount}장`:''}</li>)}</ul>
        <p className="slot-note">{c.note}</p>
      </div>)}
    </div>
    <label>옷 둘레 여백 · {choice.margin}%<input aria-label="채널 내보내기 여백" type="range" min="0" max="20" value={choice.margin} onChange={e=>update({...choice,margin:Number(e.target.value)})}/></label>
    <p className="slot-note">사진 {photos.length}장(대표 → 모델컷 → 디테일 순서) → 만들 파일 {total}장{summary.length?` · ${summary.map(x=>`${x.channel.label} ${x.items.length}`).join(' · ')}`:''} · 파일 이름: 상품명_채널_순번.jpg</p>
    <span className="btn-with-cost"><button type="button" className="primary" disabled={!photos.length||!total} onClick={exportAll}>채널별 묶음 다운로드 (ZIP)</button><Cost k="browser"/></span>
    <p className="review-note">‘미확인’ 규격은 공식 안내를 확인하지 못해 보수적인 값으로 만든 것입니다. 셀러센터 등록 화면의 안내와 다르면 알려 주세요(src/utils/channelSpecs.js 한 곳만 바꾸면 됩니다).</p>
  </section>;
}
