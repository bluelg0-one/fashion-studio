import { useState, useRef } from 'react'
import { fileToDataUrl, downloadImage } from '../utils/api.js'

async function generateTryOn(modelInput, garmentInput, category = 'tops') {
  const response = await fetch('/api/tryon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_image: modelInput,
      garment_image: garmentInput,
      category,
    }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || `오류 (${response.status})`)
  return data.url
}

// 전신이 나온 패션 모델 사진으로 교체
const DEFAULT_MODELS = [
  {
    id: 'model1',
    name: '서아',
    emoji: '👩',
    url: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400&h=700&fit=crop&crop=top',
    style: '20대 한국 여성',
  },
  {
    id: 'model2',
    name: '주아',
    emoji: '💫',
    url: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=700&fit=crop&crop=top',
    style: '20대 트렌디',
  },
  {
    id: 'model3',
    name: '에마',
    emoji: '✨',
    url: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=700&fit=crop&crop=top',
    style: '유럽풍 시크',
  },
  {
    id: 'model4',
    name: '윤지',
    emoji: '🌸',
    url: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=400&h=700&fit=crop&crop=top',
    style: '30대 페미닌',
  },
]

export default function TryOnStudio({ refinedImages = [] }) {
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODELS[0])
  const [customModelUrl, setCustomModelUrl] = useState(null)
  const [selectedGarment, setSelectedGarment] = useState(null)
  const [category, setCategory] = useState('tops')
  const [generating, setGenerating] = useState(false)
  const [results, setResults] = useState([])
  const modelFileRef = useRef()
  const garmentFileRef = useRef()

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
    try {
      const resultUrl = await generateTryOn(modelUrl, garmentUrl, category)
      setResults(prev => [{
        id: Date.now(),
        modelName: customModelUrl ? '직접 업로드 모델' : selectedModel?.name,
        garmentName: selectedGarment?.name || '선택한 의류',
        url: resultUrl,
        createdAt: new Date().toLocaleTimeString('ko-KR'),
      }, ...prev])
    } catch (err) {
      alert('착용샷 생성 오류: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 의류 선택 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1a1a2e' }}>👗 착용할 의류 선택</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>1차 보정 완료된 사진 또는 직접 업로드</div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 6 }}>의류 종류</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ id: 'tops', label: '상의' }, { id: 'bottoms', label: '하의' }, { id: 'one-pieces', label: '원피스' }].map(cat => (
                <button key={cat.id} onClick={() => setCategory(cat.id)}
                  style={{ flex: 1, padding: '7px 4px', borderRadius: 7, border: `1.5px solid ${category === cat.id ? '#1a1a2e' : '#e0e0e0'}`, background: category === cat.id ? '#1a1a2e' : '#fff', color: category === cat.id ? '#fff' : '#555', fontSize: 11, fontWeight: category === cat.id ? 700 : 400, cursor: 'pointer' }}>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {approvedImages.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 6 }}>1차 보정된 사진에서 선택</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                {approvedImages.map(img => (
                  <div key={img.id} onClick={() => setSelectedGarment({ id: img.id, url: img.editedUrl, name: img.name })}
                    style={{ cursor: 'pointer', borderRadius: 8, overflow: 'hidden', border: `2px solid ${selectedGarment?.id === img.id ? '#1a1a2e' : '#e8e8e8'}` }}>
                    <img src={img.editedUrl} alt="" style={{ width: '100%', height: 70, objectFit: 'cover', display: 'block' }} />
                    {selectedGarment?.id === img.id && (
                      <div style={{ background: '#1a1a2e', color: '#fff', fontSize: 9, textAlign: 'center', padding: '2px 0' }}>✓ 선택됨</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div onClick={() => garmentFileRef.current?.click()}
            style={{ border: '2px dashed #ddd', borderRadius: 8, padding: 12, textAlign: 'center', cursor: 'pointer', background: '#f9f9f9' }}>
            {selectedGarment?.isCustom ? (
              <div>
                <img src={selectedGarment.url} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, margin: '0 auto 4px', display: 'block' }} />
                <div style={{ fontSize: 10, color: '#10b981', fontWeight: 600 }}>✓ 업로드 완료</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 20, marginBottom: 4 }}>📤</div>
                <div style={{ fontSize: 11, color: '#888' }}>직접 업로드</div>
              </div>
            )}
            <input ref={garmentFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleGarmentUpload(e.target.files[0])} />
          </div>
        </div>

        {/* 모델 선택 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1a1a2e' }}>👤 AI 모델 선택</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>전신 사진 모델 선택 또는 직접 업로드</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
            {DEFAULT_MODELS.map(m => (
              <div key={m.id} onClick={() => { setSelectedModel(m); setCustomModelUrl(null) }}
                style={{ borderRadius: 8, overflow: 'hidden', border: `2px solid ${selectedModel?.id === m.id && !customModelUrl ? '#1a1a2e' : '#e8e8e8'}`, cursor: 'pointer' }}>
                <img src={m.url} alt={m.name} style={{ width: '100%', height: 100, objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
                <div style={{ padding: '4px 6px', background: selectedModel?.id === m.id && !customModelUrl ? '#1a1a2e' : '#fff' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: selectedModel?.id === m.id && !customModelUrl ? '#fff' : '#1a1a2e' }}>{m.emoji} {m.name}</div>
                  <div style={{ fontSize: 9, color: selectedModel?.id === m.id && !customModelUrl ? 'rgba(255,255,255,0.6)' : '#888' }}>{m.style}</div>
                </div>
              </div>
            ))}
          </div>

          <div onClick={() => modelFileRef.current?.click()}
            style={{ border: `2px dashed ${customModelUrl ? '#1a1a2e' : '#ddd'}`, borderRadius: 8, padding: 10, textAlign: 'center', cursor: 'pointer', background: customModelUrl ? '#f0f0ff' : '#f9f9f9' }}>
            {customModelUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img src={customModelUrl} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                <div style={{ fontSize: 11, color: '#1a1a2e', fontWeight: 600 }}>✓ 내 모델 사용 중</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 11, color: '#888' }}>📤 내 모델 사진 직접 업로드</div>
                <div style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>⚠️ 반드시 전신 사진으로 올려주세요!</div>
              </div>
            )}
            <input ref={modelFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleModelUpload(e.target.files[0])} />
          </div>
        </div>

        <button onClick={handleGenerate} disabled={generating}
          style={{ padding: '14px 0', borderRadius: 10, border: 'none', background: generating ? '#ccc' : '#1a1a2e', color: '#fff', fontSize: 14, fontWeight: 700, cursor: generating ? 'not-allowed' : 'pointer' }}>
          {generating ? '⚙️ AI 착용샷 생성 중... (5~15초)' : '🎭 AI 착용샷 생성하기'}
        </button>

        {generating && (
          <div style={{ background: '#f0f4ff', borderRadius: 8, padding: 12, fontSize: 12, color: '#3730a3', textAlign: 'center', lineHeight: 1.6 }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>⏳</div>
            AI가 착용샷을 생성하고 있어요<br />
            <strong>5~15초</strong> 정도 소요돼요
          </div>
        )}

        <div style={{ background: '#fffbeb', borderRadius: 8, padding: 12, fontSize: 11, color: '#92400e', lineHeight: 1.7, border: '1px solid #fde68a' }}>
          <strong>💡 팁!</strong><br />
          • 누끼 딴 의류 사진이 훨씬 자연스러워요<br />
          • 모델은 반드시 <strong>전신 사진</strong>이어야 해요<br />
          • 1장 생성 비용: 약 <strong>$0.075 (100원)</strong>
        </div>
      </div>

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
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a2e', marginBottom: 4 }}>{result.modelName}</div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>{result.garmentName} · {result.createdAt}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => downloadImage(result.url, `착용샷_${Date.now()}.png`)}
                        style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        ⬇️ 다운로드
                      </button>
                      <button onClick={() => window.open(result.url, '_blank')}
                        style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: '1px solid #e0e0e0', background: '#fff', color: '#555', fontSize: 11, cursor: 'pointer' }}>
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
