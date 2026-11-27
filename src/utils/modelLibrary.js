// 모델 보관함(019): 구도별 '모델 목록'(사람 사진 여러 장)을 저장·이름 붙이기·삭제·선택하고, 브라우저 ↔ 드라이브를 병합합니다(계산만).
// 사장님: "새로 만든 모델을 드라이브에 여러 명 저장해 두고, 그중에서 골라 착샷을 만들고 싶다."
//
// 보관함 lib = {v:2, at, models:[{id, name, slot:'top'|'bottom'|'dress', image?(이 브라우저의 사진), fileId?(드라이브 JPG), at}], deleted:{id: 지운 시각}}
//  - 018 형식({top, bottom, dress, at})은 migrateLibrary가 자동으로 목록의 첫 모델('모델 1')로 옮깁니다(사진 그대로).
//  - 삭제는 deleted에 시각을 남겨(묘비) 다른 PC와 병합해도 되살아나지 않게 합니다.
// 선택 picks = {default:{slot:id}, byProduct:{productId:{slot:id}}} — 처음 고른 모델이 그 구도의 기본값, 상품마다 마지막 선택을 기억.
export const SLOTS = ['top', 'bottom', 'dress']
const newId = () => 'm-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2))

export function migrateLibrary(old) {
  if (old && old.v === 2 && Array.isArray(old.models)) return { v: 2, at: Number(old.at) || 0, models: old.models.filter(m => m && m.id && SLOTS.includes(m.slot)), deleted: { ...(old.deleted || {}) } }
  const at = Number(old?.at) || 0
  const models = SLOTS.filter(s => typeof old?.[s] === 'string' && old[s]).map(s => ({ id: `m-018-${s}`, name: '모델 1', slot: s, image: old[s], at }))
  return { v: 2, at, models, deleted: {} }
}
// 018 사진을 옮긴 모델은 그 구도의 기본 선택으로(018처럼 바로 고정 모델로 동작)
export function migratedPicks(lib, picks = {}) {
  const def = { ...(picks.default || {}) }
  for (const m of lib.models) if (m.id.startsWith('m-018-') && !def[m.slot]) def[m.slot] = m.id
  return { default: def, byProduct: { ...(picks.byProduct || {}) } }
}
export const modelsFor = (lib, slot) => lib.models.filter(m => m.slot === slot)
export function addModel(lib, { slot, image, name = '', now = Date.now() }) {
  const n = modelsFor(lib, slot).length + 1
  const model = { id: newId(), name: String(name).trim().slice(0, 30) || `모델 ${n}`, slot, image, at: now }
  return { lib: { ...lib, at: now, models: [...lib.models, model] }, model }
}
export function renameModel(lib, id, name, now = Date.now()) {
  const v = String(name || '').trim().slice(0, 30)
  if (!v) return lib
  return { ...lib, at: now, models: lib.models.map(m => (m.id === id ? { ...m, name: v, at: now } : m)) }
}
export function deleteModel(lib, id, now = Date.now()) {
  return { ...lib, at: now, models: lib.models.filter(m => m.id !== id), deleted: { ...lib.deleted, [id]: now } }
}
// 선택: 상품의 마지막 선택 → 구도 기본값 → 없음(null = 새 모델 생성). 지운 모델은 무시.
export function pickFor(picks, lib, productId, slot) {
  const ok = id => id && lib.models.some(m => m.id === id && m.slot === slot)
  const p = picks?.byProduct?.[productId]?.[slot]
  if (p === 'none') return null
  if (ok(p)) return lib.models.find(m => m.id === p)
  const d = picks?.default?.[slot]
  return ok(d) ? lib.models.find(m => m.id === d) : null
}
export function setPick(picks = {}, productId, slot, id) {
  const def = { ...(picks.default || {}) }
  if (id && id !== 'none' && !def[slot]) def[slot] = id
  const byProduct = { ...(picks.byProduct || {}) }
  if (productId) byProduct[productId] = { ...(byProduct[productId] || {}), [slot]: id || 'none' }
  return { default: def, byProduct }
}
// 병합: 모델마다 나중에 바꾼 쪽(at), 묘비는 큰 시각. 묘비 시각 ≥ 모델 시각이면 지운 것으로 봅니다.
// 사진(image)·파일 ID(fileId)는 어느 쪽에 있든 이어 붙입니다(드라이브 목록에는 사진이 없고, 브라우저 목록에는 파일 ID가 없을 수 있음).
export function mergeLibrary(local, remote) {
  const a = migrateLibrary(local), b = migrateLibrary(remote)
  const deleted = { ...a.deleted }
  for (const [id, t] of Object.entries(b.deleted)) deleted[id] = Math.max(deleted[id] || 0, t)
  const byId = new Map()
  for (const m of [...a.models, ...b.models]) {
    const cur = byId.get(m.id)
    if (!cur) { byId.set(m.id, { ...m }); continue }
    const newer = (m.at || 0) > (cur.at || 0) ? m : cur, older = newer === m ? cur : m
    byId.set(m.id, { ...older, ...newer, image: newer.image || older.image, fileId: newer.fileId || older.fileId })
  }
  const order = [...a.models, ...b.models].map(m => m.id).filter((id, i, arr) => arr.indexOf(id) === i)
  const models = order.map(id => byId.get(id)).filter(m => !(deleted[m.id] >= (m.at || 0)))
  return { v: 2, at: Math.max(a.at, b.at), models, deleted }
}
// 드라이브 json에는 목록과 파일 ID만(사진은 '모델보관함' 폴더의 JPG)
export const driveIndex = lib => ({ v: 2, at: lib.at, models: lib.models.map(({ image, ...m }) => m), deleted: lib.deleted })
// 이 브라우저 저장본: 사진 포함
export const sameIndex = (x, y) => JSON.stringify(driveIndex(x)) === JSON.stringify(driveIndex(y))

// 드라이브 동기화(드라이브 함수는 밖에서 넣음 → 모의 검사 가능)
// d = {loadIndex(), saveIndex(index), folder(), upload(folderId, model)→fileId, download(fileId)→dataUrl, trash(fileId)}
//  1) 드라이브 목록(018 형식이면 옮김)과 병합 2) 드라이브에만 있는 모델은 사진을 받아 옴 3) 브라우저에만 있는 모델은 JPG로 올림
//  4) 지운 모델의 JPG는 휴지통으로 5) 목록이 달라졌으면 json 저장. 병합된 보관함(사진 포함)을 돌려줍니다.
export async function syncLibrary(local, d) {
  const raw = await d.loadIndex()
  const remote = raw ? migrateLibrary(raw) : null
  const merged = mergeLibrary(local, remote)
  let folder = null
  const getFolder = async () => folder || (folder = await d.folder())
  const models = []
  for (const m0 of merged.models) {
    const m = { ...m0 }
    if (!m.image && m.fileId) m.image = await d.download(m.fileId).catch(() => null)
    if (!m.fileId && m.image) m.fileId = await d.upload(await getFolder(), m)
    models.push(m)
  }
  const lib = { ...merged, models }
  const known = [...migrateLibrary(local).models, ...(remote?.models || [])]
  const trashed = new Set()
  for (const m of known) {
    if (m.fileId && !trashed.has(m.fileId) && !models.some(x => x.id === m.id) && (lib.deleted[m.id] || 0) >= (m.at || 0)) { trashed.add(m.fileId); await d.trash(m.fileId).catch(() => {}) }
  }
  if (!remote || raw.v !== 2 || !sameIndex(lib, remote)) await d.saveIndex(driveIndex(lib))
  return lib
}
