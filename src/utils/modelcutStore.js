// 모델컷 결과 보존(021): 돈을 내고 만든 모델컷(착샷·모델 후보)과 진행 중인 작업 ID를 이 브라우저(IndexedDB)에 바로 저장합니다.
// 탭을 옮기거나 새로고침·브라우저 탭이 정리돼도 다시 보이고, 진행 중이던 생성은 작업 ID로 이어 받습니다(다시 과금하지 않음).
// 결과 주소(FASHN)는 약 3일 뒤 만료되므로, 결과가 나오면 이미지 자체(data URL)를 받아 저장합니다.
//
// 기록 result = {id, productId, productName, kind:'shot'|'candidate', scene, composition, provider, model_name, remoteId, key,
//               status:'queued'|'running'|'completed'|'failed', error, outputs:[이미지 data URL], sourceUrls:[원래 결과 주소], driveIds:[드라이브 파일 ID], createdAt, garmentName, garmentUrl, modelName, reused}
// 상품별 meta = {productId, finalAt(상세페이지 정식 저장 시각), keepFrom(보관 연장 시각), pendingTrash:[드라이브 파일 ID]}
// 정리(3일): 정식 저장(초안 아님) 뒤 3일(보관 연장을 누르면 그때부터 3일)이 지나면 그 상품의 '임시' 결과를 지웁니다.
// 지우지 않는 것: '이 상품 모델컷으로 저장'한 컷(상품 데이터 modelCuts), 모델 보관함(019), 상세페이지 사진 — 모두 다른 저장소입니다.
export const KEEP_MS = 3 * 24 * 60 * 60 * 1000
export const NOTICE_MS = 3 * 24 * 60 * 60 * 1000

// ── 계산(검사 가능) ─────────────────────────────────────────
export const deleteAtOf = meta => (meta?.finalAt ? Math.max(meta.finalAt, meta.keepFrom || 0) + KEEP_MS : null)
export function cleanupPlan(results, metas, now = Date.now()) {
  const byProduct = new Map(metas.map(m => [m.productId, m]))
  const remove = [], notices = []
  const groups = new Map()
  for (const r of results) { if (!groups.has(r.productId)) groups.set(r.productId, []); groups.get(r.productId).push(r) }
  for (const [pid, list] of groups) {
    const at = deleteAtOf(byProduct.get(pid))
    if (!at) continue
    const done = list.filter(r => r.status !== 'running' && r.status !== 'queued')
    if (!done.length) continue
    const images = done.reduce((n, r) => n + (r.outputs?.length || 0), 0)
    if (now >= at) remove.push(...done.map(r => r.id))
    else if (at - now <= NOTICE_MS) notices.push({ productId: pid, at, days: Math.max(1, Math.ceil((at - now) / 86400000)), images })
  }
  return { remove, notices }
}
// 드라이브에서 불러온 파일 목록(appProperties) → 이 브라우저에 없는 결과 기록
export function recordsFromDrive(files, existing) {
  const have = new Set(existing.flatMap(r => (r.driveIds || []).filter(Boolean)))
  const byResult = new Map()
  for (const f of files) {
    if (have.has(f.id) || !f.resultId) continue
    if (existing.some(r => r.id === f.resultId)) continue
    if (!byResult.has(f.resultId)) byResult.set(f.resultId, { id: f.resultId, productId: f.productId, productName: f.productName || '', kind: f.kind || 'shot', scene: { id: 'drive', emoji: '☁️', label: f.scene || '드라이브에서' }, composition: f.composition || null, provider: f.provider || 'fashn', status: 'completed', outputs: [], driveIds: [], createdAt: Number(f.createdAt) || Date.parse(f.modifiedTime) || 0, fromDrive: true })
    byResult.get(f.resultId).driveIds[Number(f.idx) || 0] = f.id
  }
  return [...byResult.values()].map(r => ({ ...r, driveIds: r.driveIds.filter(Boolean) }))
}

// ── 저장소 ─────────────────────────────────────────────────
const DB = 'fashion-studio-modelcuts'
let opening = null
function open() {
  if (!opening) opening = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('이 브라우저는 모델컷 보관을 지원하지 않습니다.'))
    const q = indexedDB.open(DB, 1)
    q.onupgradeneeded = () => { q.result.createObjectStore('results', { keyPath: 'id' }); q.result.createObjectStore('meta', { keyPath: 'productId' }) }
    q.onsuccess = () => resolve(q.result)
    q.onerror = () => reject(q.error || new Error('모델컷 보관함을 열 수 없습니다.'))
  })
  opening.catch(() => { opening = null })
  return opening
}
async function run(store, mode, work) {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode), s = tx.objectStore(store)
    let result; const q = work(s)
    if (q) q.onsuccess = () => { result = q.result }
    tx.oncomplete = () => resolve(result)
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('모델컷 보관에 실패했습니다. 저장 공간을 확인하세요.'))
  })
}
export const putResult = r => run('results', 'readwrite', s => s.put(r))
export const listResults = async () => ((await run('results', 'readonly', s => s.getAll())) || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
export const deleteResult = id => run('results', 'readwrite', s => s.delete(id))
export const getMeta = async pid => (await run('meta', 'readonly', s => s.get(pid))) || { productId: pid }
export const putMeta = m => run('meta', 'readwrite', s => s.put(m))
export const listMeta = async () => (await run('meta', 'readonly', s => s.getAll())) || []
// 상세페이지 정식 저장(011, 초안 아님) 시각 기록 → 3일 뒤 정리 시작
export async function markFinalSaved(pid, now = Date.now()) { const m = await getMeta(pid); await putMeta({ ...m, finalAt: now }) }
export async function extendKeep(pid, now = Date.now()) { const m = await getMeta(pid); await putMeta({ ...m, keepFrom: now }) }

// 정리 실행: 지울 결과를 브라우저에서 지우고, 드라이브 파일은 휴지통으로(연결 안 돼 있으면 pendingTrash에 모았다가 연결되면).
// drive = {ready(), trash(fileId)}. 반환 {removed, images, notices}
export async function runCleanup(drive, now = Date.now()) {
  const results = await listResults(), metas = await listMeta()
  const { remove, notices } = cleanupPlan(results, metas, now)
  let images = 0
  for (const id of remove) {
    const r = results.find(x => x.id === id)
    const ids = (r.driveIds || []).filter(Boolean)
    images += r.outputs?.length || r.driveIds?.length || 0
    if (ids.length) { const m = await getMeta(r.productId); await putMeta({ ...m, pendingTrash: [...new Set([...(m.pendingTrash || []), ...ids])] }) }
    await deleteResult(id)
  }
  if (drive?.ready()) {
    for (const m of await listMeta()) {
      if (!m.pendingTrash?.length) continue
      const left = []
      for (const fid of m.pendingTrash) { try { await drive.trash(fid) } catch (e) { if (!e?.notFound) left.push(fid) } }
      await putMeta({ ...m, pendingTrash: left })
    }
  }
  return { removed: remove.length, images, notices }
}
