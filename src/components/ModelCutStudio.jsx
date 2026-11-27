import { useState, useRef, useEffect } from 'react'
import { listProducts, getProduct } from '../utils/productStore.js'
import { addCost } from '../utils/costLog.js'
import { COMPOSITIONS, compositionOf, baseSlotOf, BASE_SLOTS, ENGINES, modelCutRow, faceCrop, cropInfo, fashnMode, FASHN_MODE_LABEL, tryonInputs, newerBase } from '../utils/modelCut.js'
import { hasToken, savedFolder, loadBaseModels, saveBaseModels } from '../utils/googleDrive.js'

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function downloadImage(dataUrl, filename) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

// ─────────────────────────────────────────────────────────────
// AI 모델컷 스튜디오 (1단계)
//  - 내 모델 고정: 한 번 만든 모델 얼굴을 저장해 모든 컷에 같은 모델 사용 (FASHN face_reference)
//  - 장면 프리셋: 거울셀카·스트릿·바닷가 등 포즈+배경 묶음
//  - 일괄 생성: 옷 1벌 × 장면 N개 × 장면당 1~4장
//  - 비동기 처리: 작업 시작 후 화면에서 상태 확인 (서버 시간 초과 없음)
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'fashion-studio:my-models'
const MAX_CONCURRENT = 3          // 동시에 돌리는 작업 수
const POLL_MS = 3000
const POLL_TIMEOUT_MS = 5 * 60 * 1000

const SCENES = [
  { id: 'studio', emoji: '⬜', label: '스튜디오 화이트', prompt: 'full body shot, standing naturally, clean white studio background, soft even lighting, e-commerce fashion photography' },
  { id: 'mirror', emoji: '🤳', label: '거울 셀카', prompt: 'mirror selfie holding a smartphone, one hand touching hair, minimal apartment interior with white walls and stairs, natural daylight, Korean fashion influencer vibe' },
  { id: 'street', emoji: '🏙️', label: '도심 스트릿', prompt: 'full body street snap walking on a city sidewalk in Seoul, candid pose, soft overcast daylight, editorial street style photography' },
  { id: 'concrete', emoji: '🧱', label: '콘크리트 벽', prompt: 'leaning against a gray concrete wall, relaxed pose with one hand in pocket, soft shade, minimal urban photography' },
  { id: 'cafe', emoji: '☕', label: '카페', prompt: 'standing in a minimal modern cafe holding an iced coffee, warm natural window light, lifestyle photography' },
  { id: 'beach', emoji: '🌊', label: '바닷가', prompt: 'standing on a seaside breakwater at golden hour, ocean and sky in background, looking away from camera, hand in pocket, warm sunset light' },
  { id: 'indoor', emoji: '🛋️', label: '실내 거실', prompt: 'in a bright minimal living room with white curtains and sunlight, natural relaxed pose, cozy lifestyle photography' },
  { id: 'park', emoji: '🌳', label: '공원 산책', prompt: 'walking in a park with trees, natural candid movement, soft afternoon sunlight, film photography look' },
  { id: 'closeup', emoji: '🔍', label: '상반신 디테일', prompt: 'upper body close-up shot focusing on garment details and fabric texture, neutral background, soft lighting' },
  { id: 'back', emoji: '🔙', label: '뒷모습', prompt: 'full body shot from behind showing the back of the outfit, walking away in a clean minimal hallway' },
]

const MODEL_OPTIONS = {
  gender: [{ id: 'woman', label: '여성' }, { id: 'man', label: '남성' }],
  age: [{ id: 'early 20s', label: '20대 초반' }, { id: 'late 20s', label: '20대 후반' }, { id: '30s', label: '30대' }, { id: '40s', label: '40대' }],
  body: [{ id: 'slim', label: '슬림' }, { id: 'average build', label: '보통' }, { id: 'curvy', label: '글래머' }, { id: 'tall and athletic', label: '키 큰 탄탄' }],
  hair: [{ id: 'long straight black hair', label: '긴 생머리' }, { id: 'shoulder-length bob', label: '단발' }, { id: 'hair tied in a low bun', label: '묶은 머리' }, { id: 'long wavy brown hair', label: '웨이브' }, { id: 'short neat hair', label: '숏컷' }],
  mood: [{ id: 'innocent natural look', label: '청순' }, { id: 'chic cool look', label: '시크' }, { id: 'casual friendly look', label: '캐주얼' }, { id: 'elegant feminine look', label: '페미닌' }],
}

const ASPECTS = [
  { id: '3:4', label: '3:4 상세페이지' },
  { id: '4:5', label: '4:5 인스타 피드' },
  { id: '9:16', label: '9:16 숏폼/스토리' },
  { id: '1:1', label: '1:1 정사각' },
]

// ── 유틸 ─────────────────────────────────────────────────────
async function compressImage(dataUrl, maxSize = 1024, quality = 0.9) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'               // 누끼(투명) 이미지는 흰 배경으로
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

async function api(body) {
  const res = await fetch('/api/modelshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { throw new Error('서버 응답 오류: ' + text.slice(0, 120)) }
  if (!res.ok) throw new Error(data.error || `오류 (${res.status})`)
  return data
}

// 작업 시작 → 완료될 때까지 상태 확인 → 결과 URL 배열 반환
async function runAndWait({ provider, model_name, inputs }, onStarted) {
  const started0 = await api({ action: 'run', provider, model_name, inputs })
  if (started0.status === 'completed' && Array.isArray(started0.output)) return started0.output   // Google 가상 피팅: 바로 결과
  const { id } = started0
  onStarted?.(id)
  const started = Date.now()
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, POLL_MS))
    let s
    try { s = await api({ action: 'status', provider, id }) } catch { continue } // 일시적 네트워크 오류는 재시도
    if (s.status === 'completed') return s.output
    if (s.status === 'failed') throw new Error(s.error || '생성 실패')
  }
  throw new Error('5분이 지나도 완료되지 않았습니다.')
}

async function urlToDataUrl(url) {
  if (url.startsWith('data:')) return url
  const { dataUrl } = await api({ action: 'fetch', url })
  return dataUrl
}

// ── 비용 표시 · 같은 요청 재사용 ────────────────────────────────
// FASHN 장당 단가는 공식 문서를 이 작업 환경에서 열어 확인하지 못했으므로 금액을 적지 않습니다.
// 단가를 확인하면 여기 문구만 바꾸면 됩니다(출처를 함께 적어 주세요).
const FASHN_COST_LABEL = 'FASHN 크레딧 차감(단가 미확인)'
const CACHE_KEY = 'fashion-studio:modelcut-cache'
const CACHE_TTL_MS = 70 * 60 * 60 * 1000   // FASHN 결과 주소는 약 3일(72시간) 뒤 만료 → 70시간까지만 재사용

async function requestKey(request) {
  const text = JSON.stringify([request.provider, request.model_name, request.inputs])
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')
}
function loadCache() {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    const now = Date.now()
    return Object.fromEntries(Object.entries(all).filter(([, v]) => v && now - v.at < CACHE_TTL_MS && Array.isArray(v.outputs)))
  } catch { return {} }
}
function cachedOutputs(key) { return loadCache()[key]?.outputs || null }
function rememberOutputs(key, outputs) {
  if (!key || !outputs?.length) return
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...loadCache(), [key]: { outputs, at: Date.now() } })) } catch { /* 저장 공간 부족 시 재사용만 안 됨 */ }
}

// 기본 모델 사진(구도별 1장, 017 Google용 → 018부터 FASHN '고정 모델'과 공용). 브라우저에 저장하고, 드라이브 작업 폴더가 연결돼 있으면
// 드라이브에도 저장·불러오기(노트북·집 PC 공용). 저장소에 커밋하지 않습니다. at = 마지막으로 바꾼 시각(어느 쪽이 최신인지 비교).
const BASE_KEY = 'fashion-studio:vto-base'
function loadBase() { try { return JSON.parse(localStorage.getItem(BASE_KEY) || '{}') } catch { return {} } }
function saveBase(v) { try { localStorage.setItem(BASE_KEY, JSON.stringify(v)); return true } catch { return false } }
// 장면 문구의 '전신' 지시는 얼굴 없는 구도와 부딪혀서 뺍니다.
const stripFullBody = t => t.replace(/full body (shot from behind|shot|street snap)[, ]*/g, '')

function loadModels() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
function saveModels(models) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(models)); return true } catch { return false }
}

function describeModel(attrs) {
  const gender = attrs.gender === 'man' ? 'Korean man' : 'Korean woman'
  return `${gender}, ${attrs.age}, ${attrs.body} figure, ${attrs.hair}, ${attrs.mood}`
}

// ── 공통 스타일 ──────────────────────────────────────────────
const C = { ink: '#1a1a2e', line: '#e8e8e8', sub: '#888', accent: '#10b981' }
const card = { background: '#fff', borderRadius: 12, border: `1px solid ${C.line}`, padding: 16 }
const title = { fontSize: 13, fontWeight: 700, marginBottom: 4, color: C.ink }
const hint = { fontSize: 11, color: C.sub, marginBottom: 10, lineHeight: 1.5 }
const chip = (on) => ({
  padding: '6px 10px', borderRadius: 16, border: `1.5px solid ${on ? C.ink : '#e0e0e0'}`,
  background: on ? C.ink : '#fff', color: on ? '#fff' : '#555', fontSize: 11, fontWeight: on ? 700 : 400, cursor: 'pointer',
})
const btn = (primary, disabled) => ({
  padding: '8px 12px', borderRadius: 8, border: primary ? 'none' : '1px solid #e0e0e0',
  background: disabled ? '#ccc' : primary ? C.ink : '#fff', color: primary ? '#fff' : '#555',
  fontSize: 11, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
})

// ─────────────────────────────────────────────────────────────
// product(017, 옷걸이 v2 모델컷 탭): {id, name, garment, front, back} — 원본 보정 탭에서 보정이 끝난 옷걸이 정면·후면(최종본).
// onSaveCut(cut): 고른 결과를 '이 상품의 모델컷'으로 저장. product가 없으면(?v1) 예전 'AI모델컷' 탭 그대로 동작합니다.
export default function ModelCutStudio({ active = true, product: linked = null, onSaveCut = null, savedCount = 0 }) {
  const [provider, setProvider] = useState('fashn')
  const [composition, setComposition] = useState(() => linked ? compositionOf(linked.garment) : 'full')
  const [base, setBase] = useState(loadBase)
  const [saveTarget, setSaveTarget] = useState(null)
  // 서버에 키가 있는지만 확인 (과금 없음). null = 확인 중
  const [config, setConfig] = useState(null)
  useEffect(() => {
    if (!active || config) return
    api({ action: 'config' }).then(setConfig).catch(() => setConfig({ fashn: false, styleroom: false, google: false, unknown: true }))
  }, [active, config])
  const fashnReady = config?.fashn === true, googleReady = config?.google === true
  const engineReady = provider === 'fashn' ? fashnReady : provider === 'google' ? googleReady : false
  const comp = COMPOSITIONS[composition] || COMPOSITIONS.full
  // 018: FASHN은 해당 구도의 기본 모델 사진이 있으면 '고정 모델'(가상 피팅), 없으면 '새 모델 생성'
  const mode = linked && provider === 'fashn' ? fashnMode(base, composition) : 'create'
  const fixed = mode === 'fixed', noScenes = provider === 'google' || fixed
  const [baseSync, setBaseSync] = useState('')
  // 드라이브 작업 폴더가 연결돼 있으면 탭을 열 때 드라이브의 기본 모델 사진을 불러옵니다(나중에 바꾼 쪽을 씀).
  useEffect(() => {
    if (!active || !linked || !hasToken() || !savedFolder()?.id) return
    let off = false
    loadBaseModels(savedFolder().id).then(remote => {
      if (off || !remote) return
      setBase(cur => { const next = newerBase(cur, remote); if (next !== cur) { saveBase(next); setBaseSync('드라이브에서 기본 모델 사진을 불러왔습니다.') } return next })
    }).catch(() => setBaseSync('드라이브의 기본 모델 사진을 불러오지 못했습니다(브라우저 저장본을 씁니다).'))
    return () => { off = true }
  }, [active, linked?.id])
  // 기본 모델 사진 바꾸기: 브라우저 저장 + (연결돼 있으면) 드라이브 저장
  const putBase = (next) => {
    const v = { ...next, at: Date.now() }
    if (!saveBase(v)) alert('브라우저 저장 공간이 부족합니다.')
    setBase(v)
    if (hasToken() && savedFolder()?.id) saveBaseModels(savedFolder().id, v).then(() => setBaseSync('드라이브 작업 폴더에도 저장했습니다(다른 PC에서 같은 모델 사용).')).catch(() => setBaseSync('드라이브 저장 실패 · 이 브라우저에만 저장됨'))
    else setBaseSync('이 브라우저에 저장했습니다. 구글 드라이브를 연결하면 다른 PC에서도 같은 모델을 씁니다.')
  }
  const [compare, setCompare] = useState(null)

  // 의류
  const [garment, setGarment] = useState(null)
  const garmentFileRef = useRef()
  // 상세페이지 제작 탭에 저장된 상품의 최종 완성 사진을 불러옴 (이 브라우저 IndexedDB)
  const [products, setProducts] = useState([])
  const [productId, setProductId] = useState('')
  const [editedImages, setEditedImages] = useState([])

  // 모델컷 탭: 상품이 바뀌거나 보정본이 바뀌면 정면 최종본을 기본 의류로, 옷 종류로 기본 구도를 다시 정합니다.
  useEffect(() => {
    if (!linked) return
    setGarment(linked.front ? { id: 'front', name: `${linked.name || '상품'} · 옷걸이 정면`, url: linked.front } : null)
  }, [linked?.id, linked?.front])
  useEffect(() => { if (linked) setComposition(compositionOf(linked.garment)) }, [linked?.id, linked?.garment])
  useEffect(() => {
    if (!active || linked) return
    listProducts().then(list => {
      setProducts(list)
      setProductId(prev => (prev && list.some(p => p.id === prev) ? prev : list[0]?.id || ''))
    }).catch(() => setProducts([]))
  }, [active])

  useEffect(() => {
    if (!productId || !active || linked) { setEditedImages([]); return }
    getProduct(productId).then(product => {
      const slots = Object.values(product?.data?.slots || {})
      setEditedImages(slots
        .filter(s => s.image && s.enabled !== false)
        .map(s => ({ id: `${productId}:${s.id}`, name: `${product.name} · ${s.label}`, url: s.image })))
    }).catch(() => setEditedImages([]))
  }, [productId, active])

  // 내 모델
  const [models, setModels] = useState(loadModels)
  // 얼굴 없는 구도(017)에서는 얼굴 고정이 필요 없어 기본 꺼짐(비용 절약)
  const [modelId, setModelId] = useState(() => linked ? null : loadModels()[0]?.id || null)
  const [showCreator, setShowCreator] = useState(false)
  const [attrs, setAttrs] = useState({ gender: 'woman', age: 'early 20s', body: 'slim', hair: 'long straight black hair', mood: 'innocent natural look' })
  const [candidates, setCandidates] = useState([])
  const [creating, setCreating] = useState(false)
  const [savingModel, setSavingModel] = useState(null)
  const faceFileRef = useRef()
  const selectedModel = models.find(m => m.id === modelId) || null

  // 장면·출력
  const [sceneIds, setSceneIds] = useState(['studio', 'mirror', 'street', 'concrete'])
  const [extraPrompt, setExtraPrompt] = useState('')
  const [aspect, setAspect] = useState('3:4')
  const [perScene, setPerScene] = useState(1)
  const [bgRef, setBgRef] = useState(null)
  const bgFileRef = useRef()

  // 작업
  const [jobs, setJobs] = useState([])
  const queueRef = useRef([])
  const activeRef = useRef(0)

  useEffect(() => { saveModels(models) }, [models])

  const updateJob = (id, patch) => setJobs(prev => prev.map(j => (j.id === id ? { ...j, ...patch } : j)))

  // ── 의류 업로드
  const handleGarmentUpload = async (file) => {
    if (!file?.type.startsWith('image/')) return
    setGarment({ id: 'upload-' + Date.now(), name: file.name, url: await fileToDataUrl(file) })
  }

  // ── 모델 후보 생성 (FASHN model-create, 2장 동시)
  const createCandidates = async () => {
    if (provider !== 'fashn') { alert('모델 만들기는 현재 FASHN으로만 가능합니다.'); return }
    if (!confirm(`AI 모델 후보 2장을 만듭니다.\n${FASHN_COST_LABEL} · 2장 분량\n계속할까요?`)) return
    setCreating(true)
    setCandidates([])
    const desc = describeModel(attrs)
    const prompt = `${desc}, upper body portrait looking at camera, natural makeup, plain light gray studio background, soft lighting, fashion model casting photo`
    const tasks = [0, 1].map(() =>
      runAndWait({ provider, model_name: 'model-create', inputs: { prompt, aspect_ratio: '3:4' } })
        .then(out => { addCost(modelCutRow({ engine: 'fashn', product: linked?.name || '', cut: '모델 후보', images: out?.length || 1 })).catch(() => {}); return out?.[0] && setCandidates(prev => [...prev, { url: out[0], desc }]) })
        .catch(err => err)
    )
    const errors = (await Promise.all(tasks)).filter(e => e instanceof Error)
    if (errors.length === tasks.length) alert('모델 생성 오류: ' + errors[0].message)
    setCreating(false)
  }

  // ── 모델 저장 (결과 URL은 3일 뒤 만료되므로 이미지 자체를 저장)
  const saveAsModel = async (url, desc, defaultName) => {
    const name = prompt('모델 이름을 입력하세요', defaultName || `모델 ${models.length + 1}`)
    if (!name) return
    setSavingModel(url)
    try {
      const face = await compressImage(await urlToDataUrl(url), 768, 0.88)
      const model = { id: 'm-' + Date.now(), name, face, desc: desc || '', createdAt: Date.now() }
      const next = [model, ...models]
      if (!saveModels(next)) alert('브라우저 저장 공간이 부족합니다. 안 쓰는 모델을 삭제해주세요.')
      setModels(next)
      setModelId(model.id)
      setShowCreator(false)
      setCandidates([])
    } catch (err) {
      alert('모델 저장 오류: ' + err.message)
    } finally {
      setSavingModel(null)
    }
  }

  const handleFaceUpload = async (file) => {
    if (!file?.type.startsWith('image/')) return
    await saveAsModel(await fileToDataUrl(file), '', file.name.replace(/\.[^.]+$/, ''))
  }

  const deleteModel = (id) => {
    if (!confirm('이 모델을 삭제할까요?')) return
    setModels(prev => prev.filter(m => m.id !== id))
    if (modelId === id) setModelId(null)
  }

  // ── 작업 큐
  const pump = () => {
    while (activeRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const job = queueRef.current.shift()
      activeRef.current++
      updateJob(job.id, { status: 'running', startedAt: Date.now() })
      runAndWait(job.request, () => {})
        .then(output => {
          rememberOutputs(job.key, output); updateJob(job.id, { status: 'completed', outputs: output || [] })
          // 비용 기록(008-6, 017부터 모델컷 포함): 엔진별 추정 단가 × 받은 장수
          addCost(modelCutRow({ engine: job.request.provider, product: linked?.name || job.garmentName, cut: job.scene.label, images: (output || []).length || 1 })).catch(() => {})
        })
        .catch(err => updateJob(job.id, { status: 'failed', error: err.message }))
        .finally(() => { activeRef.current--; pump() })
    }
  }

  const handleGenerate = async () => {
    if (!garment) { alert(linked ? '원본 보정 탭에서 옷걸이 정면(또는 후면) 보정을 먼저 끝내 주세요.' : '의류 사진을 선택해주세요!'); return }
    const google = provider === 'google'
    if (!google && !fixed && sceneIds.length === 0) { alert('장면을 1개 이상 선택해주세요!'); return }
    const person = google ? base[baseSlotOf(composition)] : null
    if (google && !person) { alert(`Google 가상 피팅은 사람 사진에 옷을 입힙니다. 먼저 '${BASE_SLOTS.find(b => b[0] === baseSlotOf(composition))?.[1]}' 기본 모델 사진을 넣어 주세요.`); return }

    let product, background
    try {
      product = await compressImage(garment.url, 1024, 0.9)
      background = bgRef ? await compressImage(bgRef, 1024, 0.85) : null
    } catch {
      alert('이미지를 읽지 못했습니다.'); return
    }

    const batchId = Date.now()
    // Google 가상 피팅: 장면·문구 없이 '기본 모델 사진 + 옷'. 응답 크기 때문에 1장씩 따로 요청합니다.
    // 018 고정 모델(FASHN 가상 피팅): 기본 모델 사진 + 옷, 장면·문구·얼굴 고정 없음. 한 번에 장수만큼.
    const fixedPerson = fixed ? base[baseSlotOf(composition)] : null
    const fixedJobs = fixedPerson ? [{
      id: `${batchId}-f`, batchId, scene: { id: 'fixed', emoji: '🧍', label: '고정 모델' }, garmentName: garment.name, garmentUrl: garment.url,
      modelName: '고정 모델', status: 'queued', outputs: [], composition,
      request: { provider: 'fashn', model_name: 'tryon-v1.6', inputs: tryonInputs({ person: fixedPerson, garment: product, composition, samples: perScene }) },
    }] : null
    const googleJobs = google ? Array.from({ length: perScene }, (_, i) => ({
      id: `${batchId}-g${i}`, batchId, scene: { id: 'vto', emoji: '👕', label: `가상 피팅 ${i + 1}` }, garmentName: garment.name, garmentUrl: garment.url,
      modelName: '기본 모델 사진', status: 'queued', outputs: [], composition,
      request: { provider: 'google', model_name: 'virtual-try-on', inputs: { person_image: person, product_image: product, sample_count: 1, seed_slot: i } },
    })) : null
    const built = googleJobs || fixedJobs || SCENES.filter(s => sceneIds.includes(s.id)).map((scene, i) => {
      // 구도 지시(017): 얼굴 없는 구도면 맨 앞에 넣고, 장면의 '전신' 지시는 뺍니다.
      const noFace = Boolean(linked) && !comp.face
      const parts = [noFace ? comp.prompt : '', selectedModel?.desc, noFace ? stripFullBody(scene.prompt) : scene.prompt, extraPrompt.trim()].filter(Boolean)
      const inputs = {
        product_image: product,
        prompt: parts.join(', '),
        aspect_ratio: aspect,
        num_images: perScene,
        output_format: 'jpeg',
      }
      if (selectedModel) inputs.face_reference = selectedModel.face
      if (background) inputs.background_reference = background
      return {
        id: `${batchId}-${i}`,
        batchId,
        scene,
        garmentName: garment.name,
        garmentUrl: garment.url,
        modelName: selectedModel?.name || '랜덤 모델',
        status: 'queued',
        outputs: [],
        composition,
        request: { provider, model_name: 'product-to-model', inputs },
      }
    })
    // 같은 옷·모델·장면·설정이면 다시 호출하지 않고 저장된 결과를 씁니다(중복 과금 방지).
    for (const job of built) job.key = await requestKey(job.request)
    const busyKeys = new Set(jobs.filter(j => j.status === 'queued' || j.status === 'running').map(j => j.key))
    const reused = [], fresh = [], skipped = []
    for (const job of built) {
      const outputs = cachedOutputs(job.key)
      if (outputs) reused.push({ ...job, status: 'completed', outputs, reused: true })
      else if (busyKeys.has(job.key)) skipped.push(job)
      else fresh.push(job)
    }
    const freshImages = google ? fresh.length : fixed ? fresh.length * perScene : fresh.length * perScene
    const eng = ENGINES[provider] || ENGINES.fashn
    if (fresh.length) {
      const lines = [
        google ? `Google 가상 피팅으로 모델컷 ${freshImages}장을 새로 만듭니다 (기본 모델 사진 + 옷).` : fixed ? `FASHN 고정 모델로 모델컷 ${freshImages}장을 만듭니다 (기본 모델 사진 + 옷 · 가상 피팅).` : `FASHN으로 모델컷 ${freshImages}장을 새로 만듭니다 (장면 ${fresh.length}개 × ${perScene}장).`,
        `${fixed ? FASHN_MODE_LABEL.fixed : linked ? eng.note : FASHN_COST_LABEL} · ${freshImages}장 분량${linked ? ` · 예상 약 $${(eng.perImage * freshImages).toFixed(2)}` : ''}`,
        linked ? `구도: ${comp.label}` : '',
        google || fixed ? '' : selectedModel ? `얼굴 고정(${selectedModel.name}) 사용: 장당 크레딧이 추가로 차감됩니다.` : '얼굴 고정 없음(랜덤 모델).',
        !google && !fixed && background ? '배경 참고 사진 사용.' : '',
        reused.length ? `같은 설정으로 이미 만든 ${reused.length}개 장면은 저장된 결과를 다시 씁니다(추가 비용 없음).` : '',
        skipped.length ? `지금 만들고 있는 같은 장면 ${skipped.length}개는 건너뜁니다.` : '',
        '계속할까요?',
      ].filter(Boolean)
      if (!confirm(lines.join('\n'))) return
    } else if (!reused.length) {
      alert('같은 설정의 작업이 이미 진행 중입니다.'); return
    }
    setJobs(prev => [...reused, ...fresh, ...prev])
    queueRef.current.push(...fresh)
    pump()
  }

  const retryJob = (job) => {
    const outputs = job.key && cachedOutputs(job.key)
    if (outputs) { updateJob(job.id, { status: 'completed', error: null, outputs, reused: true }); return }
    updateJob(job.id, { status: 'queued', error: null, outputs: [] })
    queueRef.current.push(job)
    pump()
  }

  // 결과·모델 후보를 기본 모델 사진으로 저장(구도별, 017 → 018 FASHN 고정 모델과 공용)
  const saveBaseFrom = async (url, comp0) => {
    const id = baseSlotOf(comp0 || composition)
    try { const img = await compressImage(await urlToDataUrl(url), 1024, 0.9); putBase({ ...base, [id]: img }); alert(`'${BASE_SLOTS.find(b => b[0] === id)?.[1]}' 기본 모델 사진으로 저장했습니다. 이제 이 구도는 고정 모델로 만듭니다.`) }
    catch (err) { alert('저장하지 못했습니다: ' + err.message) }
  }

  const downloadResult = async (url, name) => {
    try { downloadImage(await urlToDataUrl(url), name) } catch { window.open(url, '_blank') }
  }

  const allOutputs = jobs.flatMap(j => j.outputs.map((url, k) => ({ url, name: `모델컷_${j.scene.label}_${j.id}_${k + 1}.jpg` })))
  const downloadAll = async () => {
    for (const o of allOutputs) { await downloadResult(o.url, o.name) }
  }

  const runningCount = jobs.filter(j => j.status === 'running' || j.status === 'queued').length
  const totalImages = sceneIds.length * perScene

  // ── 화면 ───────────────────────────────────────────────────
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 엔진 선택 */}
        <div style={card}>
          <div style={title}>⚙️ 생성 엔진</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(linked ? [
              { id: 'fashn', label: 'FASHN', desc: !config ? '연결 확인 중…' : config.fashn ? ENGINES.fashn.note : '키 없음 (서버 설정 필요)' },
              { id: 'google', label: 'Google 가상 피팅', desc: !config ? '연결 확인 중…' : config.google ? ENGINES.google.note : '설정 없음 (서버 설정 필요)', off: config && !config.google },
            ] : [
              { id: 'fashn', label: 'FASHN', desc: !config ? '연결 확인 중…' : config.unknown ? '연결 상태 확인 실패' : config.fashn ? '키 설정됨 · 유료' : '키 없음 (서버 설정 필요)' },
              { id: 'styleroom', label: '스타일룸', desc: config?.styleroom ? '키 있음 · 연동 코드 없음' : '기업 API 계약 필요' },
            ]).map(p => (
              <div key={p.id} role="button" aria-label={`엔진 ${p.label}`} aria-disabled={Boolean(p.off)} onClick={() => !p.off && setProvider(p.id)}
                style={{ padding: '10px 8px', borderRadius: 10, textAlign: 'center', cursor: p.off ? 'not-allowed' : 'pointer', opacity: p.off ? 0.55 : 1, border: `2px solid ${provider === p.id ? C.ink : C.line}`, background: provider === p.id ? C.ink : '#fff' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: provider === p.id ? '#fff' : C.ink }}>{p.label}</div>
                <div style={{ fontSize: 9, marginTop: 2, color: provider === p.id ? 'rgba(255,255,255,0.6)' : C.sub }}>{p.desc}</div>
              </div>
            ))}
          </div>
          {linked && provider === 'fashn' && (
            <div aria-label="FASHN 방식" style={{ ...hint, marginTop: 10, marginBottom: 0, fontWeight: 700, color: fixed ? '#1e6b3a' : C.ink }}>
              지금 방식: {FASHN_MODE_LABEL[mode]}{fixed ? ' (기본 모델 사진에 옷 입히기 · 얼굴 고정 없음)' : ' (이 구도의 기본 모델 사진이 없음 · 장면마다 새 모델)'}
            </div>
          )}
          {linked && config && !fashnReady && provider === 'fashn' && (
            <div role="alert" style={{ ...hint, marginTop: 10, marginBottom: 0, color: '#9b1c3a', fontWeight: 700 }}>모델컷을 만들려면 Vercel에 FASHN_API_KEY가 필요합니다.</div>
          )}
          {linked && config && !googleReady && (
            <div style={{ ...hint, marginTop: 8, marginBottom: 0, color: '#9b5a00' }}>Google 가상 피팅을 쓰려면 Vercel 환경변수에 GOOGLE_VTO_CREDENTIALS(서비스 계정 키 JSON 전체)와 GOOGLE_CLOUD_PROJECT(프로젝트 ID)가 필요합니다. 지역은 GOOGLE_CLOUD_LOCATION(기본 us-central1).</div>
          )}
          {provider === 'styleroom' && (
            <div style={{ ...hint, marginTop: 10, marginBottom: 0, color: '#b45309' }}>
              스타일룸은 기업(Enterprise) 계약 고객에게만 REST API를 제공합니다. API 키와 문서를 받으면 바로 연결할 수 있게 자리를 만들어 두었습니다.
            </div>
          )}
        </div>

        {/* 1. 의류 · 구도 (017 모델컷 탭: 원본 보정 탭의 보정본) */}
        {linked && (
          <div style={card} aria-label="모델컷 의류와 구도">
            <div style={title}>① 의류 · 구도</div>
            <div style={hint}>원본 보정 탭에서 보정이 끝난 옷걸이 사진(최종본)을 씁니다. 상품: {linked.name || '이름 없음'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              {[['front', '옷걸이 정면', linked.front], ['back', '옷걸이 후면', linked.back]].map(([id, label, url]) => (
                <button key={id} type="button" aria-label={`의류 ${label}`} disabled={!url} aria-pressed={garment?.id === id}
                  onClick={() => url && setGarment({ id, name: `${linked.name || '상품'} · ${label}`, url })}
                  style={{ ...chip(garment?.id === id), borderRadius: 8, padding: 6, opacity: url ? 1 : 0.5 }}>
                  {url ? <img src={url} alt="" style={{ width: '100%', height: 90, objectFit: 'contain', background: '#fff', display: 'block', borderRadius: 4 }} /> : <div style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>보정 전</div>}
                  {label}
                </button>
              ))}
            </div>
            {!linked.front && <div style={{ ...hint, color: '#b45309' }}>원본 보정 탭에서 옷걸이 정면 보정을 먼저 끝내 주세요.</div>}
            <label style={{ fontSize: 11, fontWeight: 700, color: '#555' }}>구도 (옷 종류로 자동, 바꿀 수 있음)
              <select aria-label="모델컷 구도" value={composition} onChange={e => setComposition(e.target.value)}
                style={{ width: '100%', padding: '7px 8px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 12, marginTop: 4 }}>
                {Object.entries(COMPOSITIONS).map(([id, c]) => <option key={id} value={id}>{c.label}{id === compositionOf(linked.garment) ? ' · 기본' : ''}</option>)}
              </select>
            </label>
            <div style={{ ...hint, marginTop: 6 }}>{comp.face ? '얼굴이 나오는 구도입니다.' : '생성할 때 얼굴이 나오지 않게 지시하고, 그래도 얼굴이 나오면 저장할 때 자동으로 잘라 냅니다(확인 필요 표시 · 직접 조절 가능).'} 저장한 모델컷 {savedCount}장.</div>
          </div>
        )}
        {linked && (
          <div style={card} aria-label="기본 모델 사진">
            <div style={title}>② 기본 모델 사진 (고정 모델 · FASHN·Google 공용)</div>
            <div style={hint}>처음 한 번만 모델을 만들어 고정으로 씁니다. 구도별로 1장씩 올리거나, 'AI로 새 모델 만들기' 후보·모델컷 결과의 '기본 모델로 저장'을 누르세요. 사진이 있는 구도는 그 사람에게 옷을 입히고(가상 피팅), 없으면 FASHN이 새 모델을 만듭니다. 구글 드라이브가 연결돼 있으면 작업 폴더에도 저장해 다른 PC에서 같은 모델을 씁니다.</div>
            {baseSync && <div role="status" aria-label="기본 모델 저장 상태" style={{ ...hint, color: C.ink }}>{baseSync}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {BASE_SLOTS.map(([id, label]) => (
                <label key={id} style={{ fontSize: 10, textAlign: 'center', border: `2px solid ${baseSlotOf(composition) === id ? C.ink : C.line}`, borderRadius: 8, padding: 4, cursor: 'pointer' }}>
                  {base[id] ? <img src={base[id]} alt={`${label} 기본 모델`} style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block', borderRadius: 4 }} /> : <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.sub }}>사진 없음</div>}
                  {label}
                  <input type="file" accept="image/jpeg,image/png" aria-label={`${label} 기본 모델 사진 선택`} style={{ display: 'none' }}
                    onChange={async e => { const f = e.target.files[0]; if (!f) return; const url = await compressImage(await fileToDataUrl(f), 1024, 0.9); putBase({ ...base, [id]: url }) }} />
                  {base[id] && <button type="button" style={{ ...btn(false, false), padding: '2px 6px', marginTop: 4 }} onClick={e => { e.preventDefault(); const next = { ...base }; delete next[id]; putBase(next) }}>지우기</button>}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* 1. 의류 */}
        {!linked && <div style={card}>
          <div style={title}>① 의류 선택</div>
          <div style={hint}>상세페이지 제작 탭에서 보정한 상품의 최종 사진, 또는 직접 업로드</div>
          {products.length > 0 && (
            <select value={productId} onChange={e => setProductId(e.target.value)}
              style={{ width: '100%', padding: '7px 8px', borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 12, marginBottom: 8 }}>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {productId && editedImages.length === 0 && (
            <div style={{ ...hint, color: '#b45309' }}>이 상품에는 아직 완성된 사진이 없습니다.</div>
          )}
          {editedImages.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10, maxHeight: 140, overflowY: 'auto' }}>
              {editedImages.map(img => (
                <div key={img.id} onClick={() => setGarment(img)}
                  style={{ cursor: 'pointer', borderRadius: 8, overflow: 'hidden', border: `2px solid ${garment?.id === img.id ? C.ink : C.line}` }}>
                  <img src={img.url} alt="" style={{ width: '100%', height: 60, objectFit: 'cover', display: 'block' }} />
                </div>
              ))}
            </div>
          )}
          <div onClick={() => garmentFileRef.current?.click()}
            style={{ border: '2px dashed #ddd', borderRadius: 8, padding: 10, textAlign: 'center', cursor: 'pointer', background: '#f9f9f9', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            {garment ? (
              <>
                <img src={garment.url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} />
                <div style={{ fontSize: 11, color: C.accent, fontWeight: 600, textAlign: 'left' }}>✓ {garment.name}<br /><span style={{ color: C.sub, fontWeight: 400 }}>클릭해서 다른 사진 업로드</span></div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: C.sub }}>📤 의류 사진 업로드 (누끼컷 추천)</div>
            )}
            <input ref={garmentFileRef} aria-label="모델컷 의류 사진 선택" type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleGarmentUpload(e.target.files[0])} />
          </div>
        </div>}

        {/* 2. 내 모델 */}
        {!noScenes && <div style={card}>
          <div style={title}>② 내 모델 (얼굴 고정)</div>
          <div style={hint}>모델을 고정하면 모든 컷이 같은 사람으로 나옵니다. 얼굴 고정은 장당 크레딧이 추가로 듭니다.{linked && !comp.face ? ' 지금 구도는 얼굴이 나오지 않아 필요 없습니다(기본 꺼짐 · 비용 절약).' : ''}</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 8 }}>
            <div onClick={() => setModelId(null)}
              style={{ borderRadius: 8, border: `2px solid ${!modelId ? C.ink : C.line}`, cursor: 'pointer', height: 92, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: !modelId ? '#f0f0f5' : '#fafafa' }}>
              <div style={{ fontSize: 20 }}>🎲</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.ink }}>랜덤</div>
            </div>
            {models.map(m => (
              <div key={m.id} onClick={() => setModelId(m.id)}
                style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: `2px solid ${modelId === m.id ? C.ink : C.line}`, cursor: 'pointer' }}>
                <img src={m.face} alt={m.name} style={{ width: '100%', height: 72, objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
                <div style={{ fontSize: 10, fontWeight: 600, padding: '2px 4px', background: modelId === m.id ? C.ink : '#fff', color: modelId === m.id ? '#fff' : C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                <button onClick={e => { e.stopPropagation(); deleteModel(m.id) }} title="삭제"
                  style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 9, border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 10, cursor: 'pointer', lineHeight: '18px', padding: 0 }}>×</button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ ...btn(true, false), flex: 1 }} onClick={() => setShowCreator(v => !v)}>✨ AI로 새 모델 만들기</button>
            <button style={{ ...btn(false, false), flex: 1 }} onClick={() => faceFileRef.current?.click()}>📤 얼굴 사진 등록</button>
            <input ref={faceFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFaceUpload(e.target.files[0])} />
          </div>

          {showCreator && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: '#f7f7fb' }}>
              {Object.entries({ gender: '성별', age: '나이', body: '체형', hair: '헤어', mood: '분위기' }).map(([key, label]) => (
                <div key={key} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#555', marginBottom: 4 }}>{label}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {MODEL_OPTIONS[key].map(o => (
                      <button key={o.id} style={chip(attrs[key] === o.id)} onClick={() => setAttrs(a => ({ ...a, [key]: o.id }))}>{o.label}</button>
                    ))}
                  </div>
                </div>
              ))}
              <button style={{ ...btn(true, creating), width: '100%', marginTop: 4 }} disabled={creating || (provider === 'fashn' && !fashnReady)} onClick={createCandidates}>
                {creating ? '⏳ 모델 후보 생성 중... (30초~1분)' : `🎨 모델 후보 2명 생성 · ${FASHN_COST_LABEL}`}
              </button>
              {candidates.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                  {candidates.map(c => (
                    <div key={c.url} style={{ borderRadius: 8, overflow: 'hidden', background: '#fff', border: `1px solid ${C.line}` }}>
                      <img src={c.url} alt="" style={{ width: '100%', height: 150, objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
                      <button style={{ ...btn(true, savingModel === c.url), width: '100%', borderRadius: 0 }} disabled={!!savingModel}
                        onClick={() => saveAsModel(c.url, c.desc)}>
                        {savingModel === c.url ? '저장 중...' : '이 모델로 저장'}
                      </button>
                      {linked && <button style={{ ...btn(false, false), width: '100%', borderRadius: 0 }} onClick={() => saveBaseFrom(c.url, composition)}>기본 모델로 저장 ({BASE_SLOTS.find(b => b[0] === baseSlotOf(composition))?.[1]})</button>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>}

        {/* 3. 장면 */}
        {!noScenes && <div style={card}>
          <div style={title}>③ 장면 (포즈+배경) — {sceneIds.length}개 선택</div>
          <div style={hint}>선택한 장면마다 컷이 만들어집니다.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {SCENES.map(s => {
              const on = sceneIds.includes(s.id)
              return (
                <button key={s.id} onClick={() => setSceneIds(prev => on ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                  style={{ ...chip(on), borderRadius: 8, textAlign: 'left', padding: '8px 10px' }}>
                  {s.emoji} {s.label}
                </button>
              )
            })}
          </div>
          <textarea value={extraPrompt} onChange={e => setExtraPrompt(e.target.value)}
            placeholder="추가 요청 (선택, 영어 권장) 예: wearing black wide slacks and white sneakers"
            style={{ width: '100%', height: 54, marginTop: 10, borderRadius: 8, border: '1px solid #e0e0e0', padding: '8px 10px', fontSize: 11, resize: 'vertical', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }} />
          <div onClick={() => bgFileRef.current?.click()}
            style={{ marginTop: 8, border: '2px dashed #ddd', borderRadius: 8, padding: 8, textAlign: 'center', cursor: 'pointer', background: '#f9f9f9', fontSize: 11, color: C.sub, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {bgRef ? (
              <>
                <img src={bgRef} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
                <span style={{ color: C.ink, fontWeight: 600 }}>✓ 배경 고정 중</span>
                <span onClick={e => { e.stopPropagation(); setBgRef(null) }} style={{ color: '#ef4444', marginLeft: 4 }}>해제</span>
              </>
            ) : '🖼️ 배경 사진 고정 (선택) — 모든 컷을 같은 장소에서'}
            <input ref={bgFileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={async e => { const f = e.target.files[0]; if (f?.type.startsWith('image/')) setBgRef(await fileToDataUrl(f)) }} />
          </div>
        </div>}

        {/* 4. 출력 */}
        <div style={card}>
          <div style={title}>④ 출력 설정</div>
          {!noScenes && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {ASPECTS.map(a => <button key={a.id} style={chip(aspect === a.id)} onClick={() => setAspect(a.id)}>{a.label}</button>)}
          </div>}
          <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>{noScenes ? '장수 (기본 모델 사진 비율로 나옴)' : '장면당 장수'}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4].map(n => <button key={n} style={{ ...chip(perScene === n), flex: 1 }} onClick={() => setPerScene(n)}>{n}장</button>)}
          </div>
        </div>

        <button onClick={handleGenerate} disabled={!engineReady && (linked || provider === 'fashn')}
          style={{ padding: '14px 0', borderRadius: 10, border: 'none', background: !engineReady && (linked || provider === 'fashn') ? '#ccc' : C.ink, color: '#fff', fontSize: 14, fontWeight: 700, cursor: !engineReady && (linked || provider === 'fashn') ? 'not-allowed' : 'pointer' }}>
          📸 {provider === 'google' ? 'Google 가상 피팅' : fixed ? 'FASHN 고정 모델' : 'FASHN'} 유료 · {noScenes ? perScene : totalImages}장 생성
        </button>
        <div style={{ fontSize: 10, color: '#9b1c3a', textAlign: 'center', marginTop: -6 }}>
          {linked ? `${fixed ? FASHN_MODE_LABEL.fixed : (ENGINES[provider] || ENGINES.fashn).note} · 예상 약 $${((ENGINES[provider] || ENGINES.fashn).perImage * (noScenes ? perScene : totalImages)).toFixed(2)}` : FASHN_COST_LABEL}{!noScenes && selectedModel ? ' · 얼굴 고정은 장당 크레딧 추가' : ''} · 같은 설정은 다시 누르면 저장된 결과 재사용
        </div>
        {provider === 'fashn' && config && !fashnReady && (
          <div style={{ fontSize: 11, color: '#9b5a00', textAlign: 'center' }}>서버에 FASHN_API_KEY가 없어 생성할 수 없습니다. Vercel 환경변수에 추가해 주세요.</div>
        )}
        <div style={{ fontSize: 10, color: C.sub, textAlign: 'center', marginTop: -6 }}>
          {runningCount > 0 ? `진행 중 ${runningCount}개 작업 — 기다리는 동안 다른 옷도 추가할 수 있어요` : '생성 중에도 다른 옷을 계속 추가할 수 있어요'}
        </div>
      </div>

      {/* 결과 */}
      <div>
        {jobs.length > 0 ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>📸 생성된 모델컷 ({allOutputs.length}장)</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {allOutputs.length > 0 && <button style={btn(true, false)} onClick={downloadAll}>⬇️ 전체 다운로드</button>}
                <button style={btn(false, runningCount > 0)} disabled={runningCount > 0} onClick={() => setJobs([])}>목록 비우기</button>
              </div>
            </div>
            <div style={{ fontSize: 10, color: C.sub, marginBottom: 12 }}>※ FASHN 결과 링크는 약 3일 뒤 만료됩니다. 마음에 드는 컷은 바로 다운로드하세요.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              {jobs.map(job => (
                job.status === 'completed' && job.outputs.length > 0
                  ? job.outputs.map((url, k) => (
                    <ResultCard key={job.id + k} job={job} url={url} onCompare={() => setCompare({ job, url })}
                      onSaveCut={linked && onSaveCut ? () => setSaveTarget({ job, url }) : null}
                      onSaveBase={linked ? () => saveBaseFrom(url, job.composition) : null}
                      onDownload={() => downloadResult(url, `모델컷_${job.scene.label}_${job.id}_${k + 1}.jpg`)}
                      onSaveModel={() => saveAsModel(url, '', `${job.scene.label} 모델`)}
                      saving={savingModel === url} />
                  ))
                  : <PendingCard key={job.id} job={job} onRetry={() => retryJob(job)} />
              ))}
            </div>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 16, border: '2px dashed #e8e8e8', height: 520, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#aaa', textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>📸</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: '#888' }}>AI 모델컷 스튜디오</div>
            <div style={{ fontSize: 12, lineHeight: 1.9, color: '#999' }}>
              ① 의류 선택 → ② 내 모델 고정 → ③ 장면 여러 개 선택 → 생성<br />
              옷 1벌로 같은 모델의 다양한 착샷을 한 번에 만듭니다.
            </div>
          </div>
        )}
      </div>
      {compare && <CompareView job={compare.job} url={compare.url} onClose={() => setCompare(null)} />}
      {saveTarget && <SaveCutView job={saveTarget.job} url={saveTarget.url} composition={saveTarget.job.composition || composition}
        onClose={() => setSaveTarget(null)} onSave={cut => { onSaveCut(cut); setSaveTarget(null) }} />}
    </div>
  )
}

// 생성 결과를 원본 의류 사진과 나란히 보기 (색·무늬·핏이 원본과 같은지 확인용)
function CompareView({ job, url, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const box = { flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }
  const img = { width: '100%', maxHeight: '72vh', objectFit: 'contain', background: '#fff', borderRadius: 8, border: `1px solid ${C.line}` }
  return (
    <div role="dialog" aria-label="원본과 비교" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#f7f7f7', borderRadius: 12, padding: 16, width: 'min(1100px, 100%)', maxHeight: '100%', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>원본과 비교 · {job.scene.label}</div>
          <button style={btn(false, false)} onClick={onClose}>닫기</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <figure style={{ ...box, margin: 0 }}><img src={job.garmentUrl} alt="원본 의류 사진" style={img} /><figcaption style={{ fontSize: 11, color: C.sub }}>원본 · {job.garmentName}</figcaption></figure>
          <figure style={{ ...box, margin: 0 }}><img src={url} alt="AI 생성 모델컷" style={img} /><figcaption style={{ fontSize: 11, color: C.sub }}>AI 생성 결과 (실제 착용 사진 아님)</figcaption></figure>
        </div>
        <div style={{ fontSize: 11, color: '#9b1c3a', marginTop: 10 }}>색·무늬·소재감·핏·하자가 원본과 다르면 판매 사진으로 쓰지 마세요.</div>
      </div>
    </div>
  )
}

// '이 상품 모델컷으로 저장'(017): 얼굴 자동 자르기(구도별) → 수동 슬라이더로 고치기 → 원본 의류와 나란히 확인 → 저장
function SaveCutView({ job, url, composition, onClose, onSave }) {
  const [state, setState] = useState({ loading: true })
  const [topPct, setTopPct] = useState(0)
  const [preview, setPreview] = useState(null)
  const imgRef = useRef(null)
  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const dataUrl = await urlToDataUrl(url)
        const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl })
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight
        const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0)
        const auto = faceCrop(ctx.getImageData(0, 0, c.width, c.height), composition)
        if (off) return
        imgRef.current = im
        setTopPct(Math.round(auto.cropTop / c.height * 1000) / 10)
        setState({ loading: false, auto, width: c.width, height: c.height })
      } catch (err) { if (!off) setState({ loading: false, error: err.message }) }
    })()
    return () => { off = true }
  }, [url, composition])
  const crop = () => {
    const im = imgRef.current; if (!im) return null
    const top = Math.round(im.naturalHeight * topPct / 100), h = im.naturalHeight - top, k = Math.min(1, 2000 / Math.max(im.naturalWidth, h))
    const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(h * k)
    c.getContext('2d').drawImage(im, 0, top, im.naturalWidth, h, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.9)
  }
  useEffect(() => { if (!state.loading && !state.error) setPreview(crop()) }, [topPct, state.loading])
  const info = state.width ? cropInfo(state.width, state.height, state.height * topPct / 100) : null
  const save = () => {
    const src = crop(); if (!src) return
    onSave({ src, sourceUrl: /^https:/.test(url) ? url : null, engine: job.request.provider, composition, scene: job.scene.label,
      crop: { top: Math.round(topPct * 10) / 1000 }, review: Boolean(state.auto?.review), lowRes: Boolean(info?.lowRes), side: info?.side || null })
  }
  const box = { flex: '1 1 300px', minWidth: 0, margin: 0 }
  const img = { width: '100%', maxHeight: '60vh', objectFit: 'contain', background: '#fff', borderRadius: 8, border: `1px solid ${C.line}` }
  return (
    <div role="dialog" aria-label="모델컷 저장" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#f7f7f7', borderRadius: 12, padding: 16, width: 'min(1000px, 100%)', maxHeight: '100%', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>이 상품 모델컷으로 저장 · {COMPOSITIONS[composition]?.label || composition}</div>
          <button style={btn(false, false)} onClick={onClose}>닫기</button>
        </div>
        {state.loading && <div style={hint}>결과 사진을 읽는 중…</div>}
        {state.error && <div style={{ ...hint, color: '#dc2626' }}>사진을 읽지 못했습니다: {state.error}</div>}
        {!state.loading && !state.error && <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <figure style={box}><img src={job.garmentUrl} alt="원본 의류 사진" style={img} /><figcaption style={{ fontSize: 11, color: C.sub }}>원본 · {job.garmentName}</figcaption></figure>
            <figure style={box}>{preview && <img src={preview} alt="저장할 모델컷" style={img} />}<figcaption style={{ fontSize: 11, color: C.sub }}>저장할 모델컷 (AI 생성 · 상세페이지에 ‘AI 모델 컷’ 표시)</figcaption></figure>
          </div>
          <div role="status" style={{ ...hint, marginTop: 10, color: state.auto?.review ? '#9b5a00' : C.sub }}>{state.auto?.reason}</div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555' }}>위쪽 자르기 · {topPct}%
            <input type="range" aria-label="위쪽 자르기" min="0" max="60" step="0.5" value={topPct} onChange={e => setTopPct(Number(e.target.value))} style={{ width: '100%' }} />
          </label>
          {info && <div style={{ ...hint, color: info.lowRes ? '#9b1c3a' : C.sub }}>자른 뒤 {info.width}×{info.height}px{info.lowRes ? ` · ${info.note}` : ''}</div>}
          <div style={{ fontSize: 11, color: '#9b1c3a', margin: '6px 0 10px' }}>색·무늬·소재감·핏·하자가 원본과 다르면 저장하지 마세요.</div>
          <button style={{ ...btn(true, false), padding: '10px 16px' }} onClick={save}>이 상품 모델컷으로 저장</button>
        </>}
      </div>
    </div>
  )
}

function ResultCard({ job, url, onDownload, onSaveModel, onCompare, saving, onSaveCut = null, onSaveBase = null }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <img src={url} alt={job.scene.label} onClick={() => window.open(url, '_blank')}
        style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }} />
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.ink }}>{job.scene.emoji} {job.scene.label}</div>
        {job.reused && <div style={{ display: 'inline-block', margin: '3px 0 2px', fontSize: 10, fontWeight: 600, color: '#1e6b3a', background: '#e7f6ec', borderRadius: 8, padding: '1px 8px', whiteSpace: 'nowrap' }}>저장된 결과 재사용 · 추가 비용 없음</div>}
        <div style={{ fontSize: 10, color: C.sub, marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.modelName} · {job.garmentName}</div>
        <button style={{ ...btn(false, false), width: '100%', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }} onClick={onCompare}>
          <img src={job.garmentUrl} alt="" style={{ width: 22, height: 22, objectFit: 'cover', borderRadius: 4 }} /> 원본과 나란히 보기
        </button>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{ ...btn(true, false), flex: 1 }} onClick={onDownload}>⬇️ 다운로드</button>
          <button style={{ ...btn(false, saving), flex: 1 }} disabled={saving} onClick={onSaveModel} title="이 컷의 얼굴을 내 모델로 저장">
            {saving ? '저장 중' : '👤 모델로 저장'}
          </button>
        </div>
        {onSaveCut && <button style={{ ...btn(true, false), width: '100%', marginTop: 6 }} onClick={onSaveCut}>이 상품 모델컷으로 저장</button>}
        {onSaveBase && <button style={{ ...btn(false, false), width: '100%', marginTop: 6 }} onClick={onSaveBase} title="이 사람 사진을 이 구도의 고정 모델로 다시 씁니다(FASHN·Google)">기본 모델로 저장</button>}
      </div>
    </div>
  )
}

function PendingCard({ job, onRetry }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (job.status !== 'running') return
    const t = setInterval(() => tick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [job.status])
  const secs = job.startedAt ? Math.round((Date.now() - job.startedAt) / 1000) : 0

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${job.status === 'failed' ? '#fecaca' : C.line}`, aspectRatio: '3 / 4.6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{job.status === 'failed' ? '⚠️' : job.status === 'queued' ? '🕒' : '⏳'}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{job.scene.emoji} {job.scene.label}</div>
      <div style={{ fontSize: 11, color: job.status === 'failed' ? '#dc2626' : C.sub, marginTop: 4, lineHeight: 1.5, wordBreak: 'break-all' }}>
        {job.status === 'queued' && '대기 중'}
        {job.status === 'running' && `생성 중... ${secs}초`}
        {job.status === 'completed' && '결과 없음'}
        {job.status === 'failed' && job.error}
      </div>
      {(job.status === 'failed' || (job.status === 'completed' && job.outputs.length === 0)) && (
        <button style={{ ...btn(false, false), marginTop: 10 }} onClick={onRetry}>다시 시도</button>
      )}
    </div>
  )
}
