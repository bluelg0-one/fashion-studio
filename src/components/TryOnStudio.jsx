import { useState, useRef } from 'react'
import { fileToDataUrl, fileToBase64, downloadImage } from '../utils/api.js'

// FASHN API 가상 착용샷 생성
async function generateTryOn(modelImageUrl, garmentImageUrl, category = 'tops') {
  const apiKey = import.meta.env.VITE_FASHN_API_KEY
  if (!apiKey) throw new Error('FASHN API Key가 설정되지 않았습니다.')

  // 1단계: 작업 시작
  const runResponse = await fetch('https://api.fashn.ai/v1/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model_name: 'tryon-v1.6',
      inputs: {
        model_image: modelImageUrl,
        garment_image: garmentImageUrl,
        category: category,
        garment_photo_type: 'auto',
        nsfw_filter: true,
        cover_feet: false,
        adjust_hands: true,
        restore_background: true,
        restore_clothes: true,
      },
    }),
  })

  if (!runResponse.ok) {
    const err = await runResponse.json()
    throw new Error(err?.error || 'FASHN API 실행 오류')
  }

  const { id } = await runResponse.json()
  if (!id) throw new Error('작업 ID를 받지 못했습니다.')

  // 2단계: 결과 폴링 (완료될 때까지 기다리기)
  let attempts = 0
  const maxAttempts = 30 // 최대 60초 대기

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 2000)) // 2초 대기

    const statusResponse = await fetch(`https://api.fashn.ai/v1/status/${id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })

    if (!statusResponse.ok) {
      attempts++
      continue
    }

    const statusData = await statusResponse.json()

    if (statusData.status === 'completed' && statusData.output?.length > 0) {
      return statusData.output[0] // 생성된 이미지 URL 반환
    }

    if (statusData.status === 'failed') {
      throw new Error('착용샷 생성에 실패했습니다: ' + (statusData.error || '알 수 없는 오류'))
    }

    attempts++
  }

  throw new Error('처리 시간이 초과됐습니다. 다시 시도해주세요.')
}

// 기본 모델 이미지 (FASHN 테스트용 샘플 모델들)
const DEFAULT_MODELS = [
  {
    id: 'model1',
    name: '서아 (청초한 스타일)',
    emoji: '👩',
    url: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&h=600&fit=crop&crop=face',
    style: '20대 한국 여성',
  },
  {
    id: 'model2',
    name: '주아 (트렌디 스타일)',
    emoji: '💫',
    url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&h=600&fit=crop&crop=face',
    style: '20대 힙스터',
  },
  {
    id: 'model3',
    name: '에마 (시크한 스타일)',
    emoji: '✨',
    url: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=400&h=600&fit=crop&crop=face',
    style: '유럽풍 시크',
  },
  {
    id: 'model4',
    name: '윤지 (엘레강스)',
    emoji: '🌸',
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=600&fit=crop&crop=face',
    style: '30대 페미닌',
  },
]

const CATEGORIES = [
  { id: 'tops', label: '상의 (Tops)' },
  { id: 'bottoms', label: '하의 (Bottoms)' },
  { id: 'one-pieces', label: '원피스 (One-piece)' },
]

export default function TryOnStudio({ refinedImages = [] }) {
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODELS[0])
  const [customModelUrl, setCustomModelUrl] = useState(null)
  const [selectedGarment, setSelectedGarment] = useState(null)
  const [category, setCategory] = useState('tops')
  const [generating, setGenerating] = useState(false)
  const [results, setResults] = useState([])
  const [progress, setProgress] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const modelFileRef = useRef()
  const garmentFileRef = useRef()

  // 보정완료된 이미지들
  const approvedImages = refinedImages.filter(i => i.approved || i.status === 'done')

  const handleModelUpload = async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const dataUrl = await fileToDataUrl(file)
    setCustomModelUrl(dataUrl)
    setSelectedModel(null)
  }

  const handleGarmentUpload = async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const dataUrl = await fileToDataUrl(file)
    setSelectedGarment({ id: 'custom', url: dataUrl, name: file.name, isCustom: true })
  }

  const handleGenerate = async () => {
    const modelUrl = customModelUrl || selectedModel?.url
    const garmentUrl = selectedGarment?.url

    if (!modelUrl) { alert('모델 이미지를 선택해주세요!'); return }
    if (!garmentUrl) { alert('의류 이미지를 선택해주세요!'); return }

    setGenerating(true)
    setProgress('착용샷 생성 시작...')

    try {
      setProgress('AI가 의류를 분석하는 중... (5~15초 소요)')
      const resultUrl = await generateTryOn(modelUrl, garmentUrl, category)

      setProgress('완성!')
      setResults(prev => [{
        id: Date.now(),
        modelName: customModelUrl ? '직접 업로드한 모델' : selectedModel?.name,
        garmentName: selectedGarment?.name || '선택한 의류',
        url: resultUrl,
        category,
        createdAt: new Date().toLocaleTimeString('ko-KR'),
      }, ...prev])

    } catch (err) {
      alert('착용샷 생성 오류: ' + err.message)
    } finally {
      setGenerating(false)
      setProgress('')
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>

      {/* 왼쪽: 설정 패널 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 의류 선택 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1a1a2e' }}>
            👗 착용할 의류 선택
          </div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
            1차 보정에서 완료된 사진 또는 직접 업로드
          </div>

          {/* 카테고리 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 6 }}>의류 종류</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => setCategory(cat.id)}
                  style={{ flex: 1, padding: '6px 4px', borderRadius: 7, border: `1.5px solid ${category === cat.id ? '#1a1a2e' : '#e0e0e0'}`, background: category === cat.id ? '#1a1a2e' : '#fff', color: category === cat.id ? '#fff' : '#555', fontSize: 10, fontWeight: category === cat.id ? 700 : 400, cursor: 'pointer' }}>
                  {cat.id === 'tops' ? '상의' : cat.id === 'bottoms' ? '하의' : '원피스'}
                </button>
              ))}
            </div>
          </div>

          {/* 1차 보정된 이미지 목록 */}
          {approvedImages.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 6 }}>1차 보정된 사진에서 선택</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                {approvedImages.map(img => (
                  <div key={img.id} onClick={() => setSelectedGarment({ id: img.id, url: img.editedUrl, name: img.name })}
                    style={{ cursor: 'pointer', borderRadius: 8, overflow: 'hidden', border: `2px solid ${selectedGarment?.id === img.id ? '#1a1a2e' : '#e8e8e8'}`, background: '#f8f8f8' }}>
                    <img src={img.editedUrl} alt={img.name} style={{ width: '100%', height: 70, objectFit: 'cover', display: 'block' }} />
                    {selectedGarment?.id === img.id && (
                      <div style={{ background: '#1a1a2e', color: '#fff', fontSize: 9, textAlign: 'center', padding: '2px 0' }}>✓ 선택됨</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 직접 업로드 */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleGarmentUpload(e.dataTransfer.files[0]) }}
            onClick={() => garmentFileRef.current?.click()}
            style={{ border: `2px dashed ${dragOver ? '#1a1a2e' : '#ddd'}`, borderRadius: 8, padding: 12, textAlign: 'center', cursor: 'pointer', background: dragOver ? '#f0f0ff' : '#f9f9f9' }}>
            {selectedGarment?.isCustom ? (
              <div>
                <img src={selectedGarment.url} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, margin: '0 auto 4px' }} />
                <div style={{ fontSize: 10, color: '#10b981', fontWeight: 600 }}>✓ 업로드 완료</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 20, marginBottom: 4 }}>📤</div>
                <div style={{ fontSize: 11, color: '#888' }}>또는 직접 업로드<br />(누끼 딴 사진 권장)</div>
              </div>
            )}
            <input ref={garmentFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleGarmentUpload(e.target.files[0])} />
          </div>
        </div>

        {/* 모델 선택 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1a1a2e' }}>👤 AI 모델 선택</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>기본 모델 또는 직접 업로드</div>

          {/* 기본 모델 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
            {DEFAULT_MODELS.map(m => (
              <div key={m.id} onClick={() => { setSelectedModel(m); setCustomModelUrl(null) }}
                style={{ borderRadius: 8, overflow: 'hidden', border: `2px solid ${selectedModel?.id === m.id && !customModelUrl ? '#1a1a2e' : '#e8e8e8'}`, cursor: 'pointer', background: '#f8f8f8' }}>
                <img src={m.url} alt={m.name} style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block' }} />
                <div style={{ padding: '4px 6px', background: selectedModel?.id === m.id && !customModelUrl ? '#1a1a2e' : '#fff' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: selectedModel?.id === m.id && !customModelUrl ? '#fff' : '#1a1a2e' }}>{m.emoji} {m.name.split(' ')[0]}</div>
                  <div style={{ fontSize: 9, color: selectedModel?.id === m.id && !customModelUrl ? 'rgba(255,255,255,0.7)' : '#888' }}>{m.style}</div>
                </div>
              </div>
            ))}
          </div>

          {/* 모델 직접 업로드 */}
          <div onClick={() => modelFileRef.current?.click()}
            style={{ border: `2px dashed ${customModelUrl ? '#1a1a2e' : '#ddd'}`, borderRadius: 8, padding: 10, textAlign: 'center', cursor: 'pointer', background: customModelUrl ? '#f0f0ff' : '#f9f9f9' }}>
            {customModelUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img src={customModelUrl} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                <div style={{ fontSize: 11, color: '#1a1a2e', fontWeight: 600 }}>✓ 내 모델 이미지 사용 중</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 11, color: '#888' }}>📤 내 모델 사진 직접 업로드</div>
                <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>전신 또는 상반신 사진 권장</div>
              </div>
            )}
            <input ref={modelFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleModelUpload(e.target.files[0])} />
          </div>
        </div>

        {/* 생성 버튼 */}
        <button onClick={handleGenerate} disabled={generating}
          style={{ padding: '14px 0', borderRadius: 10, border: 'none', background: generating ? '#ccc' : '#1a1a2e', color: '#fff', fontSize: 14, fontWeight: 700, cursor: generating ? 'not-allowed' : 'pointer' }}>
          {generating ? `⚙️ ${progress}` : '🎭 AI 착용샷 생성하기'}
        </button>

        {generating && (
          <div style={{ background: '#f0f4ff', borderRadius: 8, padding: 12, fontSize: 12, color: '#3730a3', textAlign: 'center', lineHeight: 1.6 }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>⏳</div>
            AI가 착용샷을 생성하고 있어요<br />
            <strong>5~15초</strong> 정도 소요돼요<br />
            잠시만 기다려주세요!
          </div>
        )}

        {/* 안내 */}
        <div style={{ background: '#fffbeb', borderRadius: 8, padding: 12, fontSize: 11, color: '#92400e', lineHeight: 1.7, border: '1px solid #fde68a' }}>
          <strong>💡 더 좋은 결과를 위한 팁!</strong><br />
          • 누끼 딴 의류 사진을 사용하면 훨씬 자연스러워요<br />
          • 모델 사진은 전신이 나온 사진이 좋아요<br />
          • 1장 생성 비용: 약 <strong>$0.075 (100원)</strong>
        </div>
      </div>

      {/* 오른쪽: 결과 */}
      <div>
        {results.length > 0 ? (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: '#1a1a2e' }}>
              🎭 생성된 착용샷 ({results.length}장)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              {results.map(result => (
                <div key={result.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <img src={result.url} alt="착용샷" style={{ width: '100%', height: 380, objectFit: 'cover', display: 'block' }} />
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a2e', marginBottom: 4 }}>
                      {result.modelName}
                    </div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
                      {result.garmentName} · {result.createdAt}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => downloadImage(result.url, `착용샷_${Date.now()}.png`)}
                        style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        ⬇️ 다운로드
                      </button>
                      <button onClick={() => {
                        const link = document.createElement('a')
                        link.href = result.url
                        link.target = '_blank'
                        link.click()
                      }} style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: '1px solid #e0e0e0', background: '#fff', color: '#555', fontSize: 11, cursor: 'pointer' }}>
                        🔍 크게 보기
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 16, border: '2px dashed #e8e8e8', height: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎭</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#888' }}>AI 착용샷 생성</div>
            <div style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.8, color: '#aaa', maxWidth: 280 }}>
              왼쪽에서<br />
              <strong style={{ color: '#1a1a2e' }}>①</strong> 착용할 의류 선택<br />
              <strong style={{ color: '#1a1a2e' }}>②</strong> AI 모델 선택<br />
              <strong style={{ color: '#1a1a2e' }}>③</strong> 착용샷 생성 버튼 클릭!<br />
              <br />
              <span style={{ fontSize: 11 }}>5~15초 후 착용샷이 완성돼요 ✨</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
