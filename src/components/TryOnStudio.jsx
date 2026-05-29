import { useState, useRef } from 'react'
import { fileToDataUrl, downloadImage } from '../utils/api.js'

// 이미지를 압축해서 크기 줄이기
async function compressImage(dataUrl, maxWidth = 800, quality = 0.8) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let width = img.width
      let height = img.height
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.src = dataUrl
  })
}

async function callTryOnAPI(payload) {
  const response = await fetch('/api/tryon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  // JSON 파싱 오류 방지
  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('서버 응답 오류: ' + text.slice(0, 100))
  }

  if (!response.ok) throw new Error(data.error || `오류 (${response.status})`)
  return data.url
}

const DEFAULT_MODELS = [
  { id: 'model1', name: '서아', emoji: '👩', url: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400&h=700&fit=crop&crop=top', style: '20대 한국 여성' },
  { id: 'model2', name: '주아', emoji: '💫', url: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=700&fit=crop&crop=top', style: '20대 트렌디' },
  { id: 'model3', name: '에마', emoji: '✨', url: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=700&fit=crop&crop=top', style: '유럽풍 시크' },
  { id: 'model4', name: '윤지', emoji: '🌸', url: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=400&h=700&fit=crop&crop=top', style: '30대 페미닌' },
]

export default function TryOnStudio({ refinedImages = [] }) {
  const [mode, setMode] = useState('product-to-model')
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODELS[0])
  const [customModelUrl, setCustomModelUrl] = useState(null)
  const [selectedGarment, setSelectedGarment] = useState(null)
  const [category, setCategory] = useState('tops')
  const [customPrompt, setCustomPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState('')
  const [results, setResults] = useState([])
  const modelFileRef = useRef()
  const garmentFileRef = useRef()

  const approvedImages = refinedImages.filter(i => i.approved || i.status === 'done')

  const handleModelUpload = async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const dataUrl = await fileToDataUrl(file)
    const compressed = await compressImage(dataUrl, 800, 0.85)
    setCustomModelUrl(compressed)
    setSelectedModel(null)
  }

  const handleGarmentUpload = async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const dataUrl = await fileToDataUrl(file)
    const compressed = await compressImage(dataUrl, 800, 0.85)
    setSelectedGarment({ id: 'custom', url: compressed, name: file.name, isCustom: true })
  }

  const handleGenerate = async () => {
    if (!selectedGarment?.url) { alert('의류 이미지를 선택해주세요!'); return }
    if (mode === 'tryon' && !customModelUrl && !selectedModel?.url) { alert('모델 이미지를 선택해주세요!'); return }

    setGenerating(true)
    try {
      let garmentUrl = selectedGarment.url
      let modelUrl = customModelUrl || selectedModel?.url

      // 로컬 이미지면 압축
      if (garmentUrl.startsWith('data:')) {
        setProgress('이미지 압축 중...')
        garmentUrl = await compressImage(garmentUrl, 800, 0.85)
      }
      if (modelUrl && modelUrl.startsWith('data:')) {
        modelUrl = await compressImage(modelUrl, 800, 0.85)
      }

      setProgress(mode === 'product-to-model' ? 'AI 모델 생성 중... (20~40초)' : '착용샷 합성 중... (5~15초)')

      let resultUrl
      if (mode === 'product-to-model') {
        resultUrl = await callTryOnAPI({
          mode: 'product-to-model',
          product_image: garmentUrl,
          prompt: customPrompt || 'Korean woman, 20s, slim figure, natural standing pose, white background, fashion model photography',
        })
      } else {
        resultUrl = await callTryOnAPI({
          mode: 'tryon',
          model_image: modelUrl,
          garment_image: garmentUrl,
          category,
        })
      }

      setResults(prev => [{
        id: Date.now(),
        mode,
        modelName: mode === 'product-to-model' ? 'AI 자동 생성' : (customModelUrl ? '직접 업로드' : selectedModel?.name),
        garmentName: selectedGarment?.name || '선택한 의류',
        url: resultUrl,
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 모드 선택 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: '#1a1a2e' }}>🎯 착용샷 생성 방식 선택</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { id: 'product-to-model', icon: '🛍️', label: 'Product to Model', desc: '의류 1장으로\nAI 모델 자동 생성', badge: '⭐ 퀄리티 최고', badgeColor: '#10b981' },
              { id: 'tryon', icon: '👗', label: 'Virtual Try-On', desc: '내가 고른 모델에\n의류 합성', badge: '모델 선택 자유', badgeColor: '#888' },
            ].map(m => (
              <div key={m.id} onClick={() => setMode(m.id)}
                style={{ padding: '12px 8px', borderRadius: 10, border: `2px solid ${mode === m.id ? '#1a1a2e' : '#e8e8e8'}`, background: mode === m.id ? '#1a1a2e' : '#fff', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{m.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: mode === m.id ? '#fff' : '#1a1a2e' }}>{m.label}</div>
                <div style={{ fontSize: 9, color: mode === m.id ? 'rgba(255,255,255,0.6)' : '#888', marginTop: 3, lineHeight: 1.4, whiteSpace: 'pre-line' }}>{m.desc}</div>
                <div style={{ fontSize: 9, marginTop: 4, color: mode === m.id ? '#fbbf24' : m.badgeColor, fontWeight: 600 }}>{m.badge}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 의류 선택 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1a1a2e' }}>👗 의류 사진 선택</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>1차 보정 완료된 사진 또는 직접 업로드</div>

          {mode === 'tryon' && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {[{ id: 'tops', label: '상의' }, { id: 'bottoms', label: '하의' }, { id: 'one-pieces', label: '원피스' }].map(cat => (
                <button key={cat.id} onClick={() => setCategory(cat.id)}
                  style={{ flex: 1, padding: '6px 4px', borderRadius: 7, border: `1.5px solid ${category === cat.id ? '#1a1a2e' : '#e0e0e0'}`, background: category === cat.id ? '#1a1a2e' : '#fff', color: category === cat.id ? '#fff' : '#555', fontSize: 11, fontWeight: category === cat.id ? 700 : 400, cursor: 'pointer' }}>
                  {cat.label}
                </button>
              ))}
            </div>
          )}

          {approvedImages.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 6 }}>1차 보정된 사진에서 선택</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxHeight: 130, overflowY: 'auto' }}>
                {approvedImages.map(img => (
                  <div key={img.id} onClick={() => setSelectedGarment({ id: img.id, url: img.editedUrl, name: img.name })}
                    style={{ cursor: 'pointer', borderRadius: 8, overflow: 'hidden', border: `2px solid ${selectedGarment?.id === img.id ? '#1a1a2e' : '#e8e8e8'}` }}>
                    <img src={img.editedUrl} alt="" style={{ width: '100%', height: 60, objectFit: 'cover', display: 'block' }} />
                    {selectedGarment?.id === img.id && (
                      <div style={{ background: '#1a1a2e', color: '#fff', fontSize: 9, textAlign: 'center', padding: '1px 0' }}>✓</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div onClick={() => garmentFileRef.current?.click()}
            style={{ border: '2px dashed #ddd', borderRadius: 8, padding: 10, textAlign: 'center', cursor: 'pointer', background: '#f9f9f9' }}>
            {selectedGarment?.isCustom ? (
              <div>
                <img src={selectedGarment.url} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, margin: '0 auto 4px', display: 'block' }} />
                <div style={{ fontSize: 10, color: '#10b981', fontWeight: 600 }}>✓ 업로드 완료</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 18, marginBottom: 3 }}>📤</div>
                <div style={{ fontSize: 11, color: '#888' }}>직접 업로드</div>
              </div>
            )}
            <input ref={garmentFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleGarmentUpload(e.target.files[0])} />
          </div>
        </div>

        {/* Product to Model 프롬프트 */}
        {mode === 'product-to-model' && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1a1a2e' }}>✍️ 모델 스타일 지정 (선택)</div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>비워두면 한국 여성 모델 자동 생성</div>
            <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="예: Korean woman, 20s, slim figure, natural standing pose, white background"
              style={{ width: '100%', height: 70, borderRadius: 8, border: '1px solid #e0e0e0', padding: '8px 10px', fontSize: 11, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
          </div>
        )}

        {/* Try-On 모델 선택 */}
        {mode === 'tryon' && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1a1a2e' }}>👤 AI 모델 선택</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
              {DEFAULT_MODELS.map(m => (
                <div key={m.id} onClick={() => { setSelectedModel(m); setCustomModelUrl(null) }}
                  style={{ borderRadius: 8, overflow: 'hidden', border: `2px solid ${selectedModel?.id === m.id && !customModelUrl ? '#1a1a2e' : '#e8e8e8'}`, cursor: 'pointer' }}>
                  <img src={m.url} alt={m.name} style={{ width: '100%', height: 75, objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
                  <div style={{ padding: '3px 6px', background: selectedModel?.id === m.id && !customModelUrl ? '#1a1a2e' : '#fff' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: selectedModel?.id === m.id && !customModelUrl ? '#fff' : '#1a1a2e' }}>{m.emoji} {m.name}</div>
                  </div>
                </div>
              ))}
            </div>
            <div onClick={() => modelFileRef.current?.click()}
              style={{ border: `2px dashed ${customModelUrl ? '#1a1a2e' : '#ddd'}`, borderRadius: 8, padding: 8, textAlign: 'center', cursor: 'pointer', background: customModelUrl ? '#f0f0ff' : '#f9f9f9' }}>
              {customModelUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={customModelUrl} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }} />
                  <div style={{ fontSize: 10, color: '#1a1a2e', fontWeight: 600 }}>✓ 내 모델 사용 중</div>
                </div>
              ) : (
                <div style={{ fontSize: 10, color: '#888' }}>📤 내 모델 직접 업로드 (전신 사진 필수!)</div>
              )}
              <input ref={modelFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleModelUpload(e.target.files[0])} />
            </div>
          </div>
        )}

        <button onClick={handleGenerate} disabled={generating}
          style={{ padding: '14px 0', borderRadius: 10, border: 'none', background: generating ? '#ccc' : '#1a1a2e', color: '#fff', fontSize: 14, fontWeight: 700, cursor: generating ? 'not-allowed' : 'pointer' }}>
          {generating ? `⚙️ ${progress}` : mode === 'product-to-model' ? '🛍️ Product to Model 생성' : '👗 Virtual Try-On 생성'}
        </button>

        {generating && (
          <div style={{ background: '#f0f4ff', borderRadius: 8, padding: 12, fontSize: 12, color: '#3730a3', textAlign: 'center', lineHeight: 1.7 }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>⏳</div>
            {progress}<br />
            <span style={{ fontSize: 10, color: '#6366f1' }}>잠시만 기다려주세요</span>
          </div>
        )}
      </div>

      {/* 결과 */}
      <div>
        {results.length > 0 ? (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: '#1a1a2e' }}>🎭 생성된 착용샷 ({results.length}장)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              {results.map(result => (
                <div key={result.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <img src={result.url} alt="착용샷" style={{ width: '100%', height: 380, objectFit: 'cover', display: 'block' }} />
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, background: result.mode === 'product-to-model' ? '#1a1a2e' : '#e8e8e8', color: result.mode === 'product-to-model' ? '#fff' : '#555', padding: '2px 7px', borderRadius: 20, fontWeight: 600 }}>
                        {result.mode === 'product-to-model' ? '🛍️ P2M' : '👗 Try-On'}
                      </span>
                      <span style={{ fontSize: 11, color: '#1a1a2e', fontWeight: 600 }}>{result.modelName}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>{result.garmentName} · {result.createdAt}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => downloadImage(result.url, `착용샷_${Date.now()}.png`)}
                        style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', background: '#1a1a2e', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>⬇️ 다운로드</button>
                      <button onClick={() => window.open(result.url, '_blank')}
                        style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: '1px solid #e0e0e0', background: '#fff', color: '#555', fontSize: 11, cursor: 'pointer' }}>🔍 크게 보기</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 16, border: '2px dashed #e8e8e8', height: 480, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🎭</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: '#888' }}>AI 착용샷 생성</div>
            <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 26, marginBottom: 4 }}>🛍️</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#1a1a2e' }}>Product to Model</div>
                <div style={{ fontSize: 10, color: '#10b981' }}>퀄리티 최고 ⭐⭐⭐⭐⭐</div>
              </div>
              <div style={{ width: 1, background: '#eee' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 26, marginBottom: 4 }}>👗</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#1a1a2e' }}>Virtual Try-On</div>
                <div style={{ fontSize: 10, color: '#888' }}>모델 선택 자유 ⭐⭐⭐</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#bbb' }}>왼쪽에서 방식 선택 후 의류 사진을 올려주세요</div>
          </div>
        )}
      </div>
    </div>
  )
}
