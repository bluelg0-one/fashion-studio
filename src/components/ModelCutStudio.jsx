import { useState, useRef, useEffect } from 'react'
import { fileToDataUrl, downloadImage } from '../utils/api.js'

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
  const { id } = await api({ action: 'run', provider, model_name, inputs })
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
export default function ModelCutStudio({ refinedImages = [] }) {
  const [provider, setProvider] = useState('fashn')

  // 의류
  const [garment, setGarment] = useState(null)
  const garmentFileRef = useRef()
  const editedImages = refinedImages
    .map(img => ({ id: img.id, name: img.name, url: img.corrected || img.editedUrl }))
    .filter(img => img.url)

  // 내 모델
  const [models, setModels] = useState(loadModels)
  const [modelId, setModelId] = useState(() => loadModels()[0]?.id || null)
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
    setCreating(true)
    setCandidates([])
    const desc = describeModel(attrs)
    const prompt = `${desc}, upper body portrait looking at camera, natural makeup, plain light gray studio background, soft lighting, fashion model casting photo`
    const tasks = [0, 1].map(() =>
      runAndWait({ provider, model_name: 'model-create', inputs: { prompt, aspect_ratio: '3:4' } })
        .then(out => out?.[0] && setCandidates(prev => [...prev, { url: out[0], desc }]))
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
        .then(output => updateJob(job.id, { status: 'completed', outputs: output || [] }))
        .catch(err => updateJob(job.id, { status: 'failed', error: err.message }))
        .finally(() => { activeRef.current--; pump() })
    }
  }

  const handleGenerate = async () => {
    if (!garment) { alert('의류 사진을 선택해주세요!'); return }
    if (sceneIds.length === 0) { alert('장면을 1개 이상 선택해주세요!'); return }

    let product, background
    try {
      product = await compressImage(garment.url, 1024, 0.9)
      background = bgRef ? await compressImage(bgRef, 1024, 0.85) : null
    } catch {
      alert('이미지를 읽지 못했습니다.'); return
    }

    const batchId = Date.now()
    const newJobs = SCENES.filter(s => sceneIds.includes(s.id)).map((scene, i) => {
      const parts = [selectedModel?.desc, scene.prompt, extraPrompt.trim()].filter(Boolean)
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
        modelName: selectedModel?.name || '랜덤 모델',
        status: 'queued',
        outputs: [],
        request: { provider, model_name: 'product-to-model', inputs },
      }
    })
    setJobs(prev => [...newJobs, ...prev])
    queueRef.current.push(...newJobs)
    pump()
  }

  const retryJob = (job) => {
    updateJob(job.id, { status: 'queued', error: null, outputs: [] })
    queueRef.current.push(job)
    pump()
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
            {[
              { id: 'fashn', label: 'FASHN', desc: '연결됨' },
              { id: 'styleroom', label: '스타일룸', desc: '기업 API 계약 필요' },
            ].map(p => (
              <div key={p.id} onClick={() => setProvider(p.id)}
                style={{ padding: '10px 8px', borderRadius: 10, textAlign: 'center', cursor: 'pointer', border: `2px solid ${provider === p.id ? C.ink : C.line}`, background: provider === p.id ? C.ink : '#fff' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: provider === p.id ? '#fff' : C.ink }}>{p.label}</div>
                <div style={{ fontSize: 9, marginTop: 2, color: provider === p.id ? 'rgba(255,255,255,0.6)' : C.sub }}>{p.desc}</div>
              </div>
            ))}
          </div>
          {provider === 'styleroom' && (
            <div style={{ ...hint, marginTop: 10, marginBottom: 0, color: '#b45309' }}>
              스타일룸은 기업(Enterprise) 계약 고객에게만 REST API를 제공합니다. API 키와 문서를 받으면 바로 연결할 수 있게 자리를 만들어 두었습니다.
            </div>
          )}
        </div>

        {/* 1. 의류 */}
        <div style={card}>
          <div style={title}>① 의류 선택</div>
          <div style={hint}>사진 편집 탭에서 "다음 단계로 전달"한 사진, 또는 직접 업로드</div>
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
            <input ref={garmentFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleGarmentUpload(e.target.files[0])} />
          </div>
        </div>

        {/* 2. 내 모델 */}
        <div style={card}>
          <div style={title}>② 내 모델 (얼굴 고정)</div>
          <div style={hint}>모델을 고정하면 모든 컷이 같은 사람으로 나옵니다. 얼굴 고정은 장당 크레딧이 추가로 듭니다.</div>

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
              <button style={{ ...btn(true, creating), width: '100%', marginTop: 4 }} disabled={creating} onClick={createCandidates}>
                {creating ? '⏳ 모델 후보 생성 중... (30초~1분)' : '🎨 모델 후보 2명 생성'}
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. 장면 */}
        <div style={card}>
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
        </div>

        {/* 4. 출력 */}
        <div style={card}>
          <div style={title}>④ 출력 설정</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {ASPECTS.map(a => <button key={a.id} style={chip(aspect === a.id)} onClick={() => setAspect(a.id)}>{a.label}</button>)}
          </div>
          <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>장면당 장수</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4].map(n => <button key={n} style={{ ...chip(perScene === n), flex: 1 }} onClick={() => setPerScene(n)}>{n}장</button>)}
          </div>
        </div>

        <button onClick={handleGenerate}
          style={{ padding: '14px 0', borderRadius: 10, border: 'none', background: C.ink, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          📸 모델컷 {totalImages}장 생성
        </button>
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
                    <ResultCard key={job.id + k} job={job} url={url}
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
    </div>
  )
}

function ResultCard({ job, url, onDownload, onSaveModel, saving }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${C.line}`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <img src={url} alt={job.scene.label} onClick={() => window.open(url, '_blank')}
        style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }} />
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.ink }}>{job.scene.emoji} {job.scene.label}</div>
        <div style={{ fontSize: 10, color: C.sub, marginBottom: 8 }}>{job.modelName} · {job.garmentName}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{ ...btn(true, false), flex: 1 }} onClick={onDownload}>⬇️ 다운로드</button>
          <button style={{ ...btn(false, saving), flex: 1 }} disabled={saving} onClick={onSaveModel} title="이 컷의 얼굴을 내 모델로 저장">
            {saving ? '저장 중' : '👤 모델로 저장'}
          </button>
        </div>
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
