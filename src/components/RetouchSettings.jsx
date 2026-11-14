import {RETOUCH_PRESETS, MANNEQUIN_MODES, lowResolution, retouchPrompt} from '../utils/retouchPresets.js';
import {Cost} from './Cost.jsx';

export const cutoutCost=o=>o?.cutout==='birefnet'?'birefnet':'photoroom';
export function RetouchSettings({value,onChange,status,bir,prefix='',title='누끼·보정 설정'}) {
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

