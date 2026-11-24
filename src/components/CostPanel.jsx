// 비용 통계: 유료 API(Claude·Photoroom·OpenAI) 호출마다 남긴 기록(costLog.js)을 모아 보여 줍니다. 호출을 막지는 않습니다.
import {useEffect, useState} from 'react';
import {listCosts, onCostChange, syncState, syncCostLog} from '../utils/costLog.js';
import {costStats, budgetState, perPhoto, boxesPerDollar, FEATURES, GROUP_LABEL, LEVEL_LABEL, csvText, fmtUsd, fmtKrw} from '../utils/costStats.js';
import {SOURCES} from '../utils/pricing.js';
import {downloadBlob} from '../utils/studioImages.js';

const KEY='fashion-studio-cost-settings',DEFAULT_RATE=1400;
const loadSettings=()=>{try{return {rate:DEFAULT_RATE,budget:'',...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch{return {rate:DEFAULT_RATE,budget:''};}};

export function useCostSettings() {
  const [s,setS]=useState(loadSettings);
  const set=p=>setS(cur=>{const next={...cur,...p};try{localStorage.setItem(KEY,JSON.stringify(next));}catch{}return next;});
  return [s,set];
}

export default function CostPanel({level,onLowerLevel}) {
  const [rows,setRows]=useState([]),[,tick]=useState(0),[settings,set]=useCostSettings();
  useEffect(()=>{
    const load=()=>{listCosts().then(setRows).catch(()=>setRows([]));tick(n=>n+1);};
    load();return onCostChange(load);
  },[]);
  const rate=Number(settings.rate)>0?Number(settings.rate):DEFAULT_RATE,assumed=Number(settings.rate)===DEFAULT_RATE||!(Number(settings.rate)>0);
  const st=costStats(rows),budget=budgetState(st.month.cost,rate,settings.budget);
  const money=v=><>{fmtUsd(v)}{v!==null&&v!==undefined&&<small> · {fmtKrw(v,rate)}</small>}</>;
  const unknownNote=b=>b.unknown?<small className="cost-unknown"> (단가 미확인 {b.unknown}건 제외)</small>:null;
  const maxDay=Math.max(...st.days.map(d=>d.cost),0);
  const unsynced=rows.filter(r=>!r.synced).length;
  const warn=budget.level==='warn'||budget.level==='over';
  return <>
    {warn&&<div role="alert" className={`budget-alert budget-${budget.level}`}>
      {budget.level==='over'?'⛔ 이번 달 예산을 넘었습니다':'⚠ 이번 달 예산의 80%를 넘었습니다'} · 사용 {fmtKrw(st.month.cost,rate)} / 예산 {Number(settings.budget).toLocaleString('ko-KR')}원 ({Math.round(budget.ratio*100)}%). 호출은 막지 않습니다.
      {budget.level==='over'&&level!=='normal'&&<button type="button" onClick={onLowerLevel}>민감도를 보통으로 낮추기</button>}
      {budget.level==='over'&&level==='normal'&&<span> · 수정할 곳 찾기 민감도는 이미 ‘보통’입니다.</span>}
    </div>}
    <details className="cost-panel"><summary>비용 통계 · 오늘 {fmtUsd(st.today.cost)} · 이번 달 {fmtUsd(st.month.cost)} ({fmtKrw(st.month.cost,rate)}){warn?budget.level==='over'?' · ⛔ 예산 초과':' · ⚠ 예산 80%':''}</summary>
      <div className="cost-cards">
        {[['오늘',st.today],['이번 주',st.week],['이번 달',st.month]].map(([t,b])=><div key={t} className="cost-card" data-period={t}><span>{t}</span><b>{fmtUsd(b.cost)}</b><small>{fmtKrw(b.cost,rate)} · 호출 {b.calls}회{b.cached?` · 재사용 ${b.cached}회`:''}</small>{unknownNote(b)}</div>)}
      </div>
      <div className="btn-row">
        <label>환율(1달러)<input aria-label="환율" type="number" min="1" step="10" value={settings.rate} onChange={e=>set({rate:e.target.value})}/>{assumed&&<small>1,400원(가정)</small>}</label>
        <label>월 예산(원)<input aria-label="월 예산" type="number" min="0" step="1000" placeholder="비워 두면 경고 없음" value={settings.budget} onChange={e=>set({budget:e.target.value})}/></label>
        <button type="button" disabled={!rows.length} onClick={()=>downloadBlob(new Blob([csvText(rows)],{type:'text/csv'}),'dooson_cost_log.csv')}>CSV 다운로드</button>
      </div>
      <h3>기능별</h3>
      <table className="cost-table"><thead><tr><th>기능</th><th>기록</th><th>호출</th><th>비용</th><th>사진당 평균</th></tr></thead><tbody>
        {['defects','classify','other'].filter(g=>st.byGroup[g]).map(g=>[g,st.byGroup[g]]).map(([g,b])=><tr key={g} data-group={g}><td><b>{GROUP_LABEL[g]||g}</b></td><td>{b.rows}{b.cached?` (재사용 ${b.cached})`:''}</td><td>{b.calls}</td><td>{money(b.cost)}{unknownNote(b)}</td><td>{fmtUsd(perPhoto(b))}</td></tr>)}
        {Object.entries(st.byFeature).filter(([f])=>FEATURES[f]?.group==='other').map(([f,b])=><tr key={f}><td>　{FEATURES[f].label}</td><td>{b.rows}{b.cached?` (재사용 ${b.cached})`:''}</td><td>{b.calls}</td><td>{money(b.cost)}{unknownNote(b)}</td><td>{fmtUsd(perPhoto(b))}</td></tr>)}
        {!rows.length&&<tr><td colSpan={5}>아직 기록이 없습니다. 유료 기능을 쓰면 호출마다 여기에 쌓입니다.</td></tr>}
      </tbody></table>
      <h3>수정할 곳 찾기 · 민감도별</h3>
      <table className="cost-table"><thead><tr><th>민감도</th><th>사진(호출)</th><th>비용</th><th>사진당 평균</th><th>찾은 곳</th><th>$1당 찾은 곳</th></tr></thead><tbody>
        {['normal','aggressive','max'].filter(l=>st.byLevel[l]).map(l=>{const b=st.byLevel[l],bpd=boxesPerDollar(b);return <tr key={l} data-level={l}><td>{LEVEL_LABEL[l]}</td><td>{b.paidPhotos} ({b.calls}회)</td><td>{money(b.cost)}</td><td>{fmtUsd(perPhoto(b))}</td><td>{b.paidBoxes}</td><td>{bpd===null?'-':`${bpd.toFixed(0)}곳`}</td></tr>;})}
        {!Object.keys(st.byLevel).length&&<tr><td colSpan={6}>기록 없음</td></tr>}
      </tbody></table>
      <h3>최근 30일 (하루 합계)</h3>
      <div className="cost-bars" aria-label="최근 30일 비용 막대">{st.days.map(d=><span key={d.date} title={`${d.date} · ${fmtUsd(d.cost)} · ${fmtKrw(d.cost,rate)}`} style={{height:`${maxDay?Math.max(2,d.cost/maxDay*100):2}%`}} className={d.cost?'on':''}/>)}</div>
      <div className="cost-bars-axis"><span>{st.days[0]?.date.slice(5)}</span><span>오늘</span></div>
      <h3>최근 기록</h3>
      <div className="cost-log-wrap"><table className="cost-table cost-log"><thead><tr><th>시각</th><th>상품</th><th>컷</th><th>기능</th><th>모델</th><th>민감도</th><th>호출</th><th>토큰(입력/출력)</th><th>비용</th><th>찾은 상자</th><th>재사용</th></tr></thead><tbody>
        {rows.slice(-30).reverse().map(r=><tr key={r.id}><td>{new Date(r.timestamp).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</td><td>{r.product}</td><td>{r.cut}</td><td>{FEATURES[r.feature]?.label||r.feature}</td><td>{r.model}</td><td>{LEVEL_LABEL[r.sensitivity]||''}</td><td>{r.calls}</td><td>{r.input_tokens||r.output_tokens?`${r.input_tokens.toLocaleString()} / ${r.output_tokens.toLocaleString()}`:'-'}</td><td>{fmtUsd(r.cost_usd)}</td><td>{r.boxes??''}</td><td>{r.cached?'재사용':''}</td></tr>)}
      </tbody></table></div>
      <p className="slot-note">구글 드라이브: {syncState.busy?'비용기록 올리는 중…':unsynced?`아직 올리지 않은 기록 ${unsynced}건 (드라이브를 연결하면 작업 폴더의 ‘두손_앱_비용기록.csv’에 덧붙입니다)`:rows.length?'모든 기록을 작업 폴더의 ‘두손_앱_비용기록.csv’에 올렸습니다.':'연결하면 작업 폴더의 ‘두손_앱_비용기록.csv’에 기록을 덧붙입니다.'}
        {unsynced>0&&<button type="button" className="subtle" onClick={()=>syncCostLog()}>지금 올리기</button>}{syncState.error&&<span className="cost-unknown"> {syncState.error}</span>}</p>
      <p className="slot-note">비용 계산: Claude는 응답의 실제 토큰 수 × 공식 단가(<a href={SOURCES.claude.url} target="_blank" rel="noreferrer">Claude 가격표</a>, {SOURCES.claude.checked} 확인), Photoroom은 호출 1번 $0.10·남은 이미지 5 차감, OpenAI는 단가 미확인이라 토큰만 기록합니다. 같은 사진을 다시 쓴 ‘재사용’은 $0입니다. 기록은 이 브라우저에 남고 상품을 지워도 지워지지 않습니다. 실제 청구 금액은 Claude Console·Photoroom 대시보드가 기준입니다.</p>
    </details>
  </>;
}
