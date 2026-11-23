// 기능별 사용 모델·비용 표시 (비용 확인용). 금액 표는 src/utils/cost.js
import {COST, costTimes} from '../utils/cost.js';
export {COST, costTimes};
export function CostN({k,n}) {const [m]=COST[k],p=costTimes(k,n);return <span className={`cost cost-${k}`} title={`${m} · ${p}`}>{m} · {p}</span>;}
export function Cost({k}) {const [m,p]=COST[k];return <span className={`cost cost-${k}`} title={`${m} · ${p}`}>{m} · {p}</span>;}
