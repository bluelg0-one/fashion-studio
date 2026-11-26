// 상세페이지 탭의 'AI 모델 컷'(017): 모델컷 탭에서 저장한 컷의 포함 여부·순서를 고릅니다. 상세페이지에는 사진마다 'AI 모델 컷' 표시가 붙습니다.
import {COMPOSITIONS, ENGINES} from '../utils/modelCut.js';
export default function ModelCutList({cuts=[],onChange}) {
  const move=(i,d)=>{const next=[...cuts],j=i+d;if(j<0||j>=next.length)return;[next[i],next[j]]=[next[j],next[i]];onChange(next);};
  return <section className="editor-section model-cut-list" aria-label="AI 모델 컷 목록"><h2>AI 모델 컷 <small>모델컷 탭에서 저장한 컷 · 상세페이지에는 사진 아래 ‘AI 모델 컷’ 표시가 붙습니다</small></h2>
    {cuts.length===0?<p className="slot-note">저장한 모델컷이 없습니다. ‘모델컷’ 탭에서 만든 뒤 ‘이 상품 모델컷으로 저장’을 누르세요.</p>:
    <ol className="mc-list">{cuts.map((c,i)=><li key={c.id} data-cut={c.id}>
      <img src={c.src} alt={`AI 모델 컷 ${i+1}`}/>
      <div>
        <b>AI 모델 컷 {i+1}</b> <small>{ENGINES[c.engine]?.label||c.engine||''}{c.composition?` · ${COMPOSITIONS[c.composition]?.label||c.composition}`:''}{c.side?` · 긴 변 ${c.side}px`:''}</small>
        {c.review&&<p className="review-note">얼굴 자동 자르기를 했습니다 · 자른 위치를 확인하세요.</p>}
        {c.lowRes&&<p className="review-note">해상도 부족(긴 변 1000px 미만) · 채널 사진으로 쓰면 흐려질 수 있습니다.</p>}
        <label className="check"><input type="checkbox" aria-label={`AI 모델 컷 ${i+1} 상세페이지에 포함`} checked={c.enabled!==false} onChange={e=>onChange(cuts.map(x=>x.id===c.id?{...x,enabled:e.target.checked}:x))}/>상세페이지에 포함</label>
        <div className="btn-row">
          <button type="button" aria-label={`AI 모델 컷 ${i+1} 위로`} disabled={i===0} onClick={()=>move(i,-1)}>↑ 위로</button>
          <button type="button" aria-label={`AI 모델 컷 ${i+1} 아래로`} disabled={i===cuts.length-1} onClick={()=>move(i,1)}>↓ 아래로</button>
          <button type="button" className="subtle" aria-label={`AI 모델 컷 ${i+1} 삭제`} onClick={()=>{if(confirm('이 모델컷을 상품에서 뺄까요? (생성 결과 재사용 기록은 남습니다)'))onChange(cuts.filter(x=>x.id!==c.id));}}>삭제</button>
          {/^https:/.test(c.sourceUrl||'')&&<a href={c.sourceUrl} target="_blank" rel="noreferrer">원본 결과</a>}
        </div>
      </div>
    </li>)}</ol>}
  </section>;
}
