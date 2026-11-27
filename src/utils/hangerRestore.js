// 옷걸이 자리 복원(020, 사장님 결정으로 허용한 예외): 옷걸이를 지우면 옷걸이에 가려 사진에 없던 옷 부분도 비어
// 어깨 위가 옷걸이 바 모양으로 패이고, 뒷목 안쪽(고리 자리)이 구멍처럼 보입니다. 그 '가려진 작은 부분'만 주변 원단으로 채웁니다.
// 색·무늬·모양을 바꾸지 않고 가려진 윤곽만 되살립니다. 원본과 나란히 보기·끄기를 제공합니다(화면).
//
//  1) 복원 마스크(restoreMask): 옷걸이로 지운 픽셀(removed) 중 옷 실루엣 안쪽이었어야 할 곳
//     - 안쪽 구멍: 옷으로 둘러싸인 투명 덩어리(사진 테두리·바깥과 이어지지 않음) 안의 지운 픽셀 → 뒷목 고리 자리·목 안쪽 바
//     - 어깨 패임: 윗선(세로줄마다 첫 옷 픽셀) 바로 위가 지운 픽셀인 세로줄 묶음 = 패인 곳.
//       양옆 옷 윗선을 매끈한 곡선(3차 에르미트)으로 잇고, 새 윗선과 지금 윗선 사이의 '지운 픽셀'만 채웁니다(옷걸이 바가 있던 자리로 한정).
//       한쪽이 목 구멍(패인 곳보다 더 깊은 쪽)이면 그쪽은 열린 것으로 보고 다른 쪽 기울기로 이어 그려, 넥라인 곡선은 메우지 않습니다.
//  2) 채우기: 투명한 곳을 가까운 옷 색으로 채운 사진(013 fillTransparent)을 IOPaint(LaMa, 무료)로 마스크만 채우고, 마스크 알파를 255로.
//  3) 검사(inspectRestore): 채운 곳과 바로 옆 옷의 채도·결·밝기 비교(013 기준). 떨어지면 되돌리고 '확인 필요'.
// 계산은 모두 여기(검사 가능), IOPaint 호출은 밖에서 inpaintFn으로 넣습니다.
import {rgbToLab} from './colorMatch.js';
import {blur} from './flatten.js';

export const RESTORE = { gap: 2, maxShare: 0.03, ring: 6, chromaRatio: 0.8, hfRatio: 0.5, dL: 12, minChroma: 6, holeMaxShare: 0.02 }

export function removedMask(alphaBefore, after) {
  const n = after.width * after.height, m = new Uint8Array(n)
  for (let p = 0; p < n; p++) if (alphaBefore[p] >= 30 && after.data[p * 4 + 3] === 0) m[p] = 1
  return m
}
const topLine = ({ width, height, data }) => {
  const top = new Int32Array(width).fill(-1)
  for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) if (data[(y * width + x) * 4 + 3] >= 128) { top[x] = y; break }
  return top
}
// 3차 에르미트: (x0,y0,기울기 m0) → (x1,y1,m1)
const hermite = (x0, y0, m0, x1, y1, m1, x) => {
  const h = x1 - x0, t = (x - x0) / h, t2 = t * t, t3 = t2 * t
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1
}
export function restoreMask(img, removed, o = RESTORE) {
  const { width: w, height: h, data } = img, n = w * h, mask = new Uint8Array(n)
  let holes = 0, depth = 0
  // 1) 안쪽 구멍
  const seen = new Uint8Array(n), stack = new Int32Array(n)
  for (let s = 0; s < n; s++) {
    if (seen[s] || data[s * 4 + 3] >= 128) continue
    let top = 0, border = false; const comp = []
    stack[top++] = s; seen[s] = 1
    while (top) {
      const p = stack[--top], x = p % w, y = (p - x) / w; comp.push(p)
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && !seen[q] && data[q * 4 + 3] < 128) { seen[q] = 1; stack[top++] = q }
    }
    if (border || comp.length > n * o.holeMaxShare) continue
    let r = 0; for (const p of comp) if (removed[p]) r++
    if (!r) continue
    holes++
    for (const p of comp) if (removed[p]) mask[p] = 1
  }
  // 2) 어깨 패임
  const tl = topLine(img), sus = new Uint8Array(w)
  for (let x = 0; x < w; x++) { const y = tl[x]; if (y <= 0) continue; for (let k = 1; k <= o.gap + 1 && y - k >= 0; k++) if (removed[(y - k) * w + x]) { sus[x] = 1; break } }
  const runs = []
  for (let x = 0; x < w;) { if (!sus[x]) { x++; continue } let e = x; while (e + 1 < w && (sus[e + 1] || (e + 2 < w && sus[e + 2] && o.gap >= 1))) e++; runs.push([x, e]); x = e + 1 }
  const dents = []
  for (const [a, b] of runs) {
    let deepest = 0; for (let x = a; x <= b; x++) deepest = Math.max(deepest, tl[x])
    const anchor = (dir) => { let x = dir < 0 ? a - 1 : b + 1; while (x >= 0 && x < w && tl[x] < 0) x += dir; if (x < 0 || x >= w) return null; return tl[x] <= deepest ? x : null }
    const slope = (x, dir) => { const k = Math.max(2, Math.round((b - a + 1) / 3)); const x2 = x + dir * k; if (x2 < 0 || x2 >= w || tl[x2] < 0) return 0; return (tl[x] - tl[x2]) / (x - x2) }
    const L = anchor(-1), R = anchor(1)
    if (L === null && R === null) continue
    const expected = x => {
      if (L !== null && R !== null) return hermite(L, tl[L], slope(L, -1), R, tl[R], slope(R, 1), x)
      const z = L ?? R, m = slope(z, L !== null ? -1 : 1), lim = Math.abs(m) > 1 ? Math.sign(m) : m
      return tl[z] + lim * (x - z)
    }
    let filled = 0, dmax = 0
    for (let x = a; x <= b; x++) {
      const e = Math.max(0, Math.ceil(expected(x)))
      if (tl[x] - e > dmax) dmax = tl[x] - e
      for (let y = e; y < tl[x]; y++) { const p = y * w + x; if (removed[p] && !mask[p]) { mask[p] = 1; filled++ } }
    }
    if (filled) { dents.push({ x0: a, x1: b, depth: dmax }); depth = Math.max(depth, dmax) }
  }
  let count = 0, x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let p = 0; p < n; p++) if (mask[p]) { count++; const x = p % w, y = (p - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  let opaque = 0; for (let p = 0; p < n; p++) if (data[p * 4 + 3] >= 128) opaque++
  const tooBig = count > opaque * o.maxShare
  return { mask: tooBig ? new Uint8Array(n) : mask, pixels: tooBig ? 0 : count, holes, dents, depth, tooBig, box: count ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null }
}
// 남은 패임 깊이(px): 같은 removed로 다시 재면, 채운 뒤에는 0에 가깝습니다.
export const remainingDepth = (img, removed) => restoreMask(img, removed).depth

// 채운 곳 검사: 마스크 안 vs 바로 옆(ring px) 옷의 채도·결·밝기
export function inspectRestore(img, mask, o = RESTORE) {
  const { width: w, height: h, data } = img, n = w * h
  const near = blur(Float32Array.from(mask), w, h, o.ring)
  const L = new Float32Array(n); for (let p = 0; p < n; p++) L[p] = rgbToLab(data[p * 4], data[p * 4 + 1], data[p * 4 + 2])[0]
  const hb = blur(L, w, h, 1.5)
  const acc = { in: { n: 0, c: 0, hf: 0, L: 0 }, ring: { n: 0, c: 0, hf: 0, L: 0 } }
  for (let p = 0; p < n; p++) {
    const k = mask[p] ? 'in' : near[p] > 0.01 && data[p * 4 + 3] >= 200 ? 'ring' : null; if (!k) continue
    const [l, a, b] = rgbToLab(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]), s = acc[k]
    s.n++; s.c += Math.hypot(a, b); s.hf += Math.abs(L[p] - hb[p]); s.L += l
  }
  if (!acc.in.n || acc.ring.n < 20) return { ok: true, reasons: [], pixels: acc.in.n }
  const m = s => ({ c: s.c / s.n, hf: s.hf / s.n, L: s.L / s.n }), I = m(acc.in), R = m(acc.ring), reasons = []
  if (R.c >= o.minChroma && I.c / R.c < o.chromaRatio) reasons.push(`색이 바램(채도 ${Math.round(I.c / R.c * 100)}%)`)
  if (R.hf > 0.3 && I.hf / R.hf < o.hfRatio) reasons.push(`결이 흐려짐(${Math.round(I.hf / R.hf * 100)}%)`)
  if (Math.abs(I.L - R.L) > o.dL) reasons.push(`밝기가 주변과 다름(ΔL ${Math.round(Math.abs(I.L - R.L))})`)
  return { ok: !reasons.length, reasons, pixels: acc.in.n }
}
// 채운 결과 붙이기: 마스크 픽셀만 채운 색 + 알파 255
export function applyRestore(img, mask, filled) {
  const out = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) }
  for (let p = 0; p < mask.length; p++) if (mask[p]) { const i = p * 4; out.data[i] = filled.data[i]; out.data[i + 1] = filled.data[i + 1]; out.data[i + 2] = filled.data[i + 2]; out.data[i + 3] = 255 }
  return out
}
// 전체 흐름. inpaintFn(maskedImage RGBA(투명한 곳 옷 색으로 채움), mask Uint8Array) → 채운 RGBA. IOPaint가 꺼져 있으면 {offline:true} 오류.
// fillTransparent(013)는 밖에서 넣습니다(같은 모듈 순환을 피하려고).
// 반환 {image(복원 결과 또는 원래 그대로), status:'done'|'none'|'review', reason, pixels, depthBefore, depthAfter, box}
export async function restoreHanger(img, removed, { inpaintFn, fill }) {
  const plan = restoreMask(img, removed)
  if (plan.tooBig) return { image: img, status: 'review', reason: '복원할 곳이 너무 넓어 건너뜀(옷걸이 지우기 결과 확인 필요)', pixels: 0, depthBefore: plan.depth, depthAfter: plan.depth, box: null }
  if (!plan.pixels) return { image: img, status: 'none', reason: '복원할 곳 없음', pixels: 0, depthBefore: 0, depthAfter: 0, box: null }
  let filled
  // 투명한 곳(알파 0)의 색은 PNG·캔버스를 거치며 사라지므로(검게 됨) 보내는 사진은 모두 불투명으로 만듭니다(색만 쓰고 알파는 여기서 다시 정함).
  const sent = fill(img); for (let i = 3; i < sent.data.length; i += 4) sent.data[i] = 255
  try { filled = await inpaintFn(sent, plan.mask) }
  catch (e) { return { image: img, status: 'review', reason: e?.offline ? '확인 필요(PC IOPaint 필요) · 옷걸이 자리 복원을 건너뜀' : `복원 실패: ${e?.message || e}`, pixels: plan.pixels, depthBefore: plan.depth, depthAfter: plan.depth, box: plan.box, offline: Boolean(e?.offline) } }
  const out = applyRestore(img, plan.mask, filled), check = inspectRestore(out, plan.mask)
  if (!check.ok) return { image: img, status: 'review', reason: `복원 검사 불합격 → 되돌림(${check.reasons.join(', ')}) · 확인 필요`, pixels: plan.pixels, depthBefore: plan.depth, depthAfter: plan.depth, box: plan.box }
  return { image: out, status: 'done', reason: `옷걸이 자리 ${plan.pixels}px 복원(구멍 ${plan.holes}곳 · 어깨 패임 ${plan.dents.length}곳)`, pixels: plan.pixels, depthBefore: plan.depth, depthAfter: remainingDepth(out, removed), box: plan.box, mask: plan.mask }
}
