import { useState, useRef, useCallback } from 'react'
import { callClaude, fileToBase64, fileToDataUrl, applyImageFilters, downloadImage } from '../utils/api.js'

async function removeBackground(imageFile) {
  const apiKey = import.meta.env.VITE_REMOVEBG_API_KEY
  if (!apiKey) throw new Error('Remove.bg API Key가 설정되지 않았습니다.')
  const formData = new FormData()
  formData.append('image_file', imageFile)
  formData.append('size', 'auto')
  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey },
    body: formData,
  })
  if (!response.ok) {
    const err = await response.json()
    throw new Error(err?.errors?.[0]?.title || 'Remove.bg 오류')
  }
  const blob = await response.blob()
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.readAsDataURL(blob)
  })
}

async function applyBgColor(dataUrl, color) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (color !== 'transparent') {
        ctx.fillStyle = color
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.src = dataUrl
  })
}

export default function PhotoEditor({ images, setImages }) {
  const [selectedId, setSelectedId] = useState(null)
  const [processing, setProcessing] = useState({})
  const [removingBg, setRemovingBg] = useState({})
  const [dragOver, setDragOver] = useState(false)
  const [refinePrompt, setRefinePrompt] = useState('')
  const [filterValues, setFilterValues] = useState({})
  const [batchProcessing, setBatchProcessing] = useState(false)
  const [bgColor, setBgColor] = useState('#ffffff')
  const fileInputRef = useRef()
  const selected = images.find(i => i.id === selectedId)

  const addImages = useCallback(async (files) => {
    const validFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (validFiles.length === 0) return
    const newImgs = []
    for (const file of validFiles) {
      const dataUrl = await fileToDataUrl(file)
      const id = `img_${Date.now()}_${Math.random().toString(36).slice(2)}`
      newImgs.push({ id, name: file.name, originalUrl: dataUrl, editedUrl: dataUrl, bgRemovedUrl: null, status: 'pending', aiLog: '', file, approved: false, needsWork: false, hasBgRemoved: false })
    }
    setImages(prev => [...prev, ...newImgs])
    if (newImgs.length > 0) setSelectedId(newImgs[0].id)
  }, [setImages])

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false); addImages(e.dataTransfer.files)
  }, [addImages])

  const runAiRefine = useCallback(async (imgId, customPrompt = '') => {
    const img = images.find(i => i.id === imgId)
    if (!img) return
    setProcessing(p => ({ ...p, [imgId]: true }))
    setImages(prev => prev.map(i => i.id === imgId ? { ...i, status: 'processing' } : i))
    try {
      const base64 = await fileToBase64(img.file)
      const prompt = customPrompt || `이 의류 상품 사진을 분석해서 쇼핑몰용 최적 보정값을 JSON으로만 답해줘.
{"brightness": 숫자(80-130), "contrast": 숫자(90-125), "saturation": 숫자(85-120), "log": "보정내용 한줄 한국어 설명"}
JSON만 답해줘.`
      const raw = await callClaude(prompt, base64)
      let parsed = { brightness: 108, contrast: 108, saturation: 106, log: '밝기와 선명도를 개선했습니다.' }
      try {
        const match = raw.match(/\{[\s\S]*?\}/)
        if (match) parsed = { ...parsed, ...JSON.parse(match[0]) }
      } catch (_) {}
      const baseUrl = img.bgRemovedUrl || img.originalUrl
      const editedUrl = await applyImageFilters(baseUrl, parsed.brightness, parsed.contrast, parsed.saturation)
      setFilterValues(prev => ({ ...prev, [imgId]: { brightness: parsed.brightness, contrast: parsed.contrast, saturation: parsed.saturation } }))
      setImages(prev => prev.map(i => i.id === imgId ? { ...i, editedUrl, status: 'done', aiLog: parsed.log } : i))
    } catch (err) {
      setImages(prev => prev.map(i => i.id === imgId ? { ...i, status: 'error', aiLog: `오류: ${err.message}` } : i))
    } finally {
      setProcessing(p => ({ ...p, [imgId]: false }))
    }
  }, [images, setImages])

  const handleRemoveBg = useCallback(async (imgId) => {
    const img = images.find(i => i.id === imgId)
    if (!img) return
    setRemovingBg(p => ({ ...p, [imgId]: true }))
    try {
      const bgRemovedUrl = await removeBackground(img.file)
      const finalUrl = await applyBgColor(bgRemovedUrl, bgColor)
      setImages(prev => prev.map(i => i.id === imgId ? { ...i, bgRemovedUrl, editedUrl: finalUrl, hasBgRemoved: true, aiLog: '배경이 깔끔하게 제거됐습니다! ✂️' } : i))
    } catch (err) {
      alert('누끼 오류: ' + err.message)
    } finally {
      setRemovingBg(p => ({ ...p, [imgId]: false }))
    }
  }, [images, setImages, bgColor])

  const runAllImages = useCallback(async () => {
    const pending = images.filter(i => i.status === 'pending')
    if (pending.length === 0) return
    setBatchProcessing(true)
    for (const img of pending) await runAiRefine(img.id)
    setBatchProcessing(false)
  }, [images, runAiRefine])

  const downloadApproved = useCallback(() => {
    const approved = images.filter(i => i.approved)
    if (approved.length === 0) { alert('최종 확정된 사진이 없습니다.'); return }
    approved.forEach((img, idx) => setTimeout(() => downloadImage(img.editedUrl, `보정완료_${img.name}`), idx * 400))
  }, [images])

  const handleFilterChange = useCallback(async (imgId, key, value) => {
    const img = images.find(i => i.id === imgId)
    if (!img) return
    const current = filterValues[imgId] || { brightness: 100, contrast: 100, saturation: 100 }
    const newFilters = { ...current, [key]: value }
    setFilterValues(prev => ({ ...prev, [imgId]: newFilters }))
    const baseUrl = img.bgRemovedUrl || img.originalUrl
    const edited = await applyImageFilters(baseUrl, newFilters.brightness, newFilters.contrast, newFilters.saturation)
    setImages(prev => prev.map(i => i.id === imgId ? { ...i, editedUrl: edited } : i))
  }, [images, filterValues, setImages])

  const getFilter = (id, key) => filterValues[id]?.[key] ?? 100
  const statusColor = { pending: '#888', processing: '#f59e0b', done: '#10b981', error: '#ef4444' }
  const statusText = { pending: '⏳ 대기', processing: '⚙️ 처리중', done: '✅ 완료', error: '❌ 오류' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div onDragOver={(e) => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{ border: `2px dashed ${dragOver ? '#1a1a2e' : '#ccc'}`, borderRadius: 12, padding: 28, textAlign: 'center', cursor: 'pointer', background: dragOver ? '#e8e8ff' : '#fff', transition: 'all 0.2s' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>사진 업로드</div>
          <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>클릭하거나 여기로 드래그<br />여러 장 한번에 선택 가능</div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => addImages(e.target.files)} />
        </div>

        {images.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={runAllImages} disabled={batchProcessing || images.filter(i => i.status === 'pending').length === 0}
              style={{ padding: '10px 0', borderRadius: 10, border: 'none', background: batchProcessing ? '#ccc' : '#1a1a2e', color: '#fff', fontSize: 13, fontWeight: 700 }}>
              {batchProcessing ? '⚙️ 전체 보정 중...' : `✨ 전체 AI 자동보정 (${images.filter(i => i.status === 'pending').length}장)`}
            </button>
            <button onClick={downloadApproved}
              style={{ padding: '10px 0', borderRadius: 10, border: '1.5px solid #1a1a2e', background: '#fff', color: '#1a1a2e', fontSize: 13, fontWeight: 600 }}>
              ⬇️ 최종확정 사진 다운로드 ({images.filter(i => i.approved).length}장)
            </button>
          </div>
        )}

        {images.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e8e8e8' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', fontSize: 11, color: '#888', fontWeight: 600 }}>
              총 {images.length}장 &nbsp;|&nbsp; <span style={{ color: '#10b981' }}>완료 {images.filter(i => i.status === 'done').length}</span> &nbsp;·&nbsp; <span style={{ color: '#f59e0b' }}>대기 {images.filter(i => i.status === 'pending').length}</span>
            </div>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {images.map(img => (
                <div key={img.id} onClick={() => setSelectedId(img.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer', background: selectedId === img.id ? '#f0f0ff' : '#fff', borderLeft: selectedId === img.id ? '3px solid #1a1a2e' : '3px solid transparent' }}>
                  <div style={{ position: 'relative' }}>
                    <img src={img.editedUrl} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee', background: '#f8f8f8' }} />
                    {img.hasBgRemoved && <div style={{ position: 'absolute', top: -4, right: -4, background: '#10b981', borderRadius: '50%', width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#fff' }}>✂</div>}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{img.name}</div>
                    <div style={{ fontSize: 10, color: statusColor[img.status], marginTop: 2 }}>
                      {statusText[img.status]}{img.hasBgRemoved && <span style={{ color: '#10b981', marginLeft: 4 }}>✂️누끼완료</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                      <input type="checkbox" checked={img.approved} onChange={(e) => { e.stopPropagation(); setImages(prev => prev.map(i => i.id === img.id ? { ...i, approved: e.target.checked, needsWork: false } : i)) }} style={{ accentColor: '#10b981', width: 14, height: 14 }} />
                      <span style={{ fontSize: 9, color: '#10b981' }}>확정</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                      <input type="checkbox" checked={img.needsWork} onChange={(e) => { e.stopPropagation(); setImages(prev => prev.map(i => i.id === img.id ? { ...i, needsWork: e.target.checked, approved: false } : i)) }} style={{ accentColor: '#f59e0b', width: 14, height: 14 }} />
                      <span style={{ fontSize: 9, color: '#f59e0b' }}>수정</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {selected ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[{ label: '원본 사진', url: selected.originalUrl, tag: 'BEFORE', tagColor: '#888' }, { label: selected.hasBgRemoved ? 'AI 보정본 (누끼완료)' : 'AI 보정본', url: selected.editedUrl, tag: 'AFTER', tagColor: '#10b981' }].map(item => (
                <div key={item.tag} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: item.tagColor, background: item.tagColor + '15', padding: '2px 8px', borderRadius: 20 }}>{item.tag}</span>
                  </div>
                  <div style={{ background: '#f8f8f8', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
                    <img src={item.url} alt={item.label} style={{ width: '100%', maxHeight: 320, objectFit: 'contain', display: 'block' }} />
                  </div>
                </div>
              ))}
            </div>

            {selected.aiLog && (
              <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 14px', fontSize: 13, borderLeft: '3px solid #10b981', color: '#166534' }}>
                <strong>AI 보정 내역:</strong> {selected.aiLog}
              </div>
            )}

            <div style={{ background: '#fff', borderRadius: 12, border: '2px solid #10b981', padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}>
                ✂️ 누끼 따기 (배경 제거)
                {selected.hasBgRemoved && <span style={{ fontSize: 10, background: '#10b981', color: '#fff', padding: '2px 8px', borderRadius: 20 }}>완료</span>}
              </div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>Remove.bg AI가 배경을 자동으로 제거합니다</div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 8 }}>배경색 선택</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {[{ color: '#ffffff', label: '흰색' }, { color: '#f5f5f5', label: '연회색' }, { color: '#f0ede8', label: '크림' }, { color: '#000000', label: '검정' }, { color: 'transparent', label: '투명' }].map(({ color, label }) => (
                    <div key={color} onClick={() => setBgColor(color)} style={{ cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 6, border: bgColor === color ? '2px solid #1a1a2e' : '1px solid #ddd', background: color === 'transparent' ? 'repeating-conic-gradient(#ccc 0% 25%, white 0% 50%) 0 0 / 10px 10px' : color, margin: '0 auto 3px' }} />
                      <div style={{ fontSize: 9, color: '#888' }}>{label}</div>
                    </div>
                  ))}
                  <div>
                    <input type="color" value={bgColor === 'transparent' ? '#ffffff' : bgColor} onChange={(e) => setBgColor(e.target.value)} style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #ddd', cursor: 'pointer', padding: 2 }} />
                    <div style={{ fontSize: 9, color: '#888', textAlign: 'center', marginTop: 3 }}>직접</div>
                  </div>
                </div>
              </div>
              <button onClick={() => handleRemoveBg(selected.id)} disabled={removingBg[selected.id]}
                style={{ width: '100%', padding: '11px 0', borderRadius: 8, border: 'none', background: removingBg[selected.id] ? '#ccc' : '#10b981', color: '#fff', fontSize: 13, fontWeight: 700 }}>
                {removingBg[selected.id] ? '✂️ 누끼 따는 중...' : '✂️ 누끼 따기 실행'}
              </button>
              {selected.hasBgRemoved && (
                <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                  {[{ color: '#ffffff', label: '⬜ 흰배경' }, { color: '#f5f5f5', label: '🔲 회색' }, { color: '#f0ede8', label: '🟫 크림' }, { color: 'transparent', label: '🔳 투명' }].map(({ color, label }) => (
                    <button key={color} onClick={async () => {
                      const img = images.find(i => i.id === selected.id)
                      if (!img) return
                      const finalUrl = await applyBgColor(img.bgRemovedUrl, color)
                      setImages(prev => prev.map(i => i.id === selected.id ? { ...i, editedUrl: finalUrl } : i))
                    }} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid #e0e0e0', background: '#f9f9f9', color: '#555', fontSize: 10, cursor: 'pointer' }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: '#1a1a2e' }}>🎛️ 수동 필터 조정</div>
              {[{ key: 'brightness', label: '밝기', min: 60, max: 150 }, { key: 'contrast', label: '대비', min: 60, max: 150 }, { key: 'saturation', label: '채도', min: 60, max: 150 }].map(({ key, label, min, max }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, width: 32, color: '#555', fontWeight: 500 }}>{label}</span>
                  <input type="range" min={min} max={max} value={getFilter(selected.id, key)} onChange={(e) => handleFilterChange(selected.id, key, Number(e.target.value))} style={{ flex: 1, accentColor: '#1a1a2e' }} />
                  <span style={{ fontSize: 12, width: 36, textAlign: 'right', color: '#888', fontFamily: 'monospace' }}>{getFilter(selected.id, key)}%</span>
                </div>
              ))}
            </div>

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: '#1a1a2e' }}>✨ AI 보정 실행</div>
              <button onClick={() => runAiRefine(selected.id)} disabled={processing[selected.id]}
                style={{ width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: processing[selected.id] ? '#ccc' : '#1a1a2e', color: '#fff', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                {processing[selected.id] ? '⚙️ AI 보정 중...' : '✨ AI 자동 보정 실행'}
              </button>
              {selected.needsWork && (
                <div>
                  <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, marginBottom: 6 }}>🔧 추가 수정 요청</div>
                  <textarea value={refinePrompt} onChange={(e) => setRefinePrompt(e.target.value)} placeholder="예: 배경을 더 밝게 해줘, 색상을 더 선명하게 해줘"
                    style={{ width: '100%', height: 72, borderRadius: 8, border: '1.5px solid #f59e0b', padding: '8px 12px', fontSize: 12, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
                  <button onClick={() => { if (!refinePrompt.trim()) return; runAiRefine(selected.id, refinePrompt); setRefinePrompt('') }} disabled={processing[selected.id] || !refinePrompt.trim()}
                    style={{ marginTop: 8, width: '100%', padding: '9px 0', borderRadius: 8, border: '1.5px solid #f59e0b', background: '#fffbeb', color: '#92400e', fontSize: 12, fontWeight: 700 }}>
                    🔄 프롬프트로 재보정하기
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button onClick={() => setImages(prev => prev.map(i => i.id === selected.id ? { ...i, approved: true, needsWork: false } : i))}
                style={{ padding: '12px 0', borderRadius: 10, border: `2px solid ${selected.approved ? '#10b981' : '#e8e8e8'}`, background: selected.approved ? '#f0fdf4' : '#fff', color: selected.approved ? '#166534' : '#888', fontSize: 13, fontWeight: selected.approved ? 700 : 400 }}>
                ✅ 최종 확정
              </button>
              <button onClick={() => setImages(prev => prev.map(i => i.id === selected.id ? { ...i, needsWork: true, approved: false } : i))}
                style={{ padding: '12px 0', borderRadius: 10, border: `2px solid ${selected.needsWork ? '#f59e0b' : '#e8e8e8'}`, background: selected.needsWork ? '#fffbeb' : '#fff', color: selected.needsWork ? '#92400e' : '#888', fontSize: 13, fontWeight: selected.needsWork ? 700 : 400 }}>
                🔧 추가 수정 필요
              </button>
            </div>
          </>
        ) : (
          <div style={{ background: '#fff', borderRadius: 16, border: '2px dashed #e8e8e8', height: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📸</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>사진을 업로드해 주세요</div>
            <div style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>왼쪽 업로드 영역에서 사진을 올린 후<br />AI 자동보정 또는 누끼 따기를 해보세요</div>
          </div>
        )}
      </div>
    </div>
  )
}
