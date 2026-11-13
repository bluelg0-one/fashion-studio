// 기능별 사용 모델·비용 표시 (비용 확인용)
export const COST={
  photoroom:['Photoroom','$0.10/장'],
  birefnet:['BiRefNet','무료 · 내 PC'],
  photoroomAI:['Photoroom 생성형','같은 $0.10/장 · 결과 1K'],
  claudeClassify:['Claude Opus 5.5','약 $0.05~0.15/회'],
  claudeDefects:['Claude Opus 5.5','약 $0.02~0.05/장'],
  iopaint:['IOPaint LaMa','무료 · 내 PC'],
  openai:['OpenAI gpt-4.1-mini','소액 · 사용량만큼'],
  browser:['브라우저 계산','무료'],
};
export function Cost({k}) {const [m,p]=COST[k];return <span className={`cost cost-${k}`} title={`${m} · ${p}`}>{m} · {p}</span>;}

