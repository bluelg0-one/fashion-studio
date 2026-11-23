// 기능별 사용 모델·비용 표시 (비용 확인용) — 화면(Cost.jsx)과 검사가 함께 씁니다.
export const COST={
  photoroom:['Photoroom','$0.10/장'],
  birefnet:['BiRefNet','무료 · 내 PC'],
  photoroomAI:['Photoroom 생성형','같은 $0.10/장 · 결과 1K'],
  claudeClassify:['Claude Opus 5.5','약 $0.05~0.15/회'],
  claudeDefects:['Claude Opus 5.5','약 $0.02~0.05/장'],
  iopaint:['IOPaint LaMa','무료 · 내 PC'],
  openai:['OpenAI gpt-4.1-mini','소액 · 사용량만큼'],
  browser:['브라우저 계산','무료'],
  gdrive:['구글 드라이브','무료 · 15GB까지'],
};
// 호출 수에 맞춘 예상 비용(같은 단가 표시 방식: 약 $최소~최대). 예: costTimes('claudeDefects',4) → '약 $0.08~0.20 (4회)'
export function costTimes(k,n) {
  const m=COST[k][1].match(/\$([\d.]+)~([\d.]+)/);if(!m)return COST[k][1];
  const f=v=>(Math.round(v*100)/100).toFixed(2);
  return `약 $${f(m[1]*n)}~${f(m[2]*n)} (${n}회)`;
}
