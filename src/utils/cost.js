// 기능별 사용 모델·비용 표시 (비용 확인용) — 화면(Cost.jsx)과 검사가 함께 씁니다.
// 금액은 단가표(pricing.js)로 계산합니다. 실제 사용 금액은 ‘비용 통계’에서 확인합니다.
import {estimateText, PHOTOROOM} from './pricing.js';
const pr=`$${PHOTOROOM.perCall.toFixed(2)}/장`;
export const COST={
  photoroom:['Photoroom',pr],
  birefnet:['BiRefNet','무료 · 내 PC'],
  photoroomAI:['Photoroom 생성형',`같은 ${pr} · 결과 1K`],
  claudeClassify:['Claude Opus 5.5',estimateText('claudeClassify')],
  claudeDefects:['Claude Opus 5.5',estimateText('claudeDefects')],
  claudeDetails:['Claude Opus 5.5',`${estimateText('claudeDefects')} · 확신 없는 디테일이 있을 때만 상품당 1회`],
  iopaint:['IOPaint LaMa','무료 · 내 PC'],
  openai:['OpenAI gpt-4.1-mini','단가 미확인 · 토큰만 기록'],
  browser:['브라우저 계산','무료'],
  gdrive:['구글 드라이브','무료 · 15GB까지'],
};
// 호출 수에 맞춘 예상 비용(같은 단가 표시 방식: 약 $최소~최대). 예: costTimes('claudeDefects',4) → '약 $0.04~0.16 (4회)'
export function costTimes(k,n) {
  const m=COST[k][1].match(/\$([\d.]+)~([\d.]+)/);if(!m)return COST[k][1];
  const f=v=>(Math.round(v*100)/100).toFixed(2);
  return `약 $${f(m[1]*n)}~${f(m[2]*n)} (${n}회)`;
}
