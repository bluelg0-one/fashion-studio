import { useState, useRef, useCallback } from 'react'
import { callGemini, fileToBase64, fileToDataUrl, applyImageFilters, downloadImage } from '../utils/gemini.js'

export default function PhotoEditor({ images, setImages }) {
  const [selectedId, setSelectedId] = useState(null)
  const [processing, setProcessing] = useState({})
  const [dragOver, setDragOver] = useState(false)
  const [refinePrompt, setRefinePrompt] = useState('')
  const [filterValues, setFilterValues] = useState({})
  const [batchProcessing, setBatchProcessing] = useState(false)
  const fileInputRef = useRef()

  const selected = images.find(i => i.id === selectedId)

  // 이미지 추가
  const addImages = useCallback(async (files) => {
    const validFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (validFiles.length === 0) return

    const newImgs = []
    for (const file of validFiles) {
      const dataUrl = await fileToDataUrl(file)
      const id = `img_${Date.now()}_${Math.random().toString(36).slice(2)}`
      newImgs.push({
        id,
        name: file.name,
        originalUrl: dataUrl,
        editedUrl: dataUrl,
        status: 'pending',
        aiLog: '',
        file,
        approved: false,
        needsWork: false,
      })
    }

    setImages(prev => {
      const next = [...prev, ...newImgs]
      return next
    })
    if (newImgs.length > 0) setSelectedId(newImgs[0].id)
  }, [setImages])

  // 드래그앤드롭
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    addImages(e.dataTransfer.files)
  }, [addImages])

  // AI 자동 보정
  const runAiRefine = useCallback(async (imgId, customPrompt = '') => {
    const img = images.find(i => i.id === imgId)
    if (!img) return

    setProcessing(p => ({ ...p, [imgId]: true }))
    setImages(prev => prev.map(i => i.id === imgId ? { ...i, status: 'processing' } : i))

    try {
      const base64 = await fileToBase64(img.file)

      const prompt = customPrompt || `
이 의류 상품 사진을 분석해줘.
쇼핑몰에 올릴 상품 사진으로 최적화하기 위한 보정값을 JSON으로만 답해줘.

{
  "brightness": 숫자(범위: 80~130, 기본값 100, 어두우면 올려줘),
  "contrast": 숫자(범위: 90~125, 기본값 100, 흐릿하면 올려줘),
  "saturation": 숫자(범위: 85~120, 기본값 100, 색감이 칙칙하면 올려줘),
  "log": "보정 내용 한국어로 한 줄 설명"
}

JSON 형식만 답해줘. 다른 텍스트 없이.`

      const raw = await callGemini(prompt, base64)

      let parsed = { brightness: 105, contrast: 105, saturation: 105, log: '밝기와 선명도를 개선했습니다.' }
      try {
        const match = raw.match(/\{[\s\S]*?\}/)
        if (match) parsed = { ...parsed, ...JSON.parse(match[0]) }
      } catch (_) {}

      const editedUrl = await applyImageFilters(
        img.originalUrl,
        parsed.brightness,
        parsed.contrast,
        parsed.saturation
      )

      setFilterValues(prev => ({
        ...prev,
        [imgId]: {
          brightness: parsed.brightness,
          contrast: parsed.contrast,
          saturation: parsed.saturation,
        }
      }))

      setImages(prev => prev.map(i =>
        i.id === imgId
          ? { ...i, editedUrl, status: 'done', aiLog: parsed.log }
          : i
      ))
    } catch (err) {
      setImages(prev => prev.map(i =>
        i.id === imgId
          ? { ...i, status: 'error', aiLog: `오류: ${err.message}` }
          : i
      ))
    } finally {
      setProcessing(p => ({ ...p, [imgId]: false }))
    }
  }, [images, setImages])

  // 전체 일괄 보정
  const runAllImages = useCallback(async () => {
    const pending = images.filter(i => i.status === 'pending')
    if (pending.length === 0) return
    setBatchProcessing(true)
    for (const img of pending) {
      await runAiRefine(img.id)
    }
    setBatchProcessing(false)
  }, [images, runAiRefine])

  // 확정된 이미지 다운로드
  const downloadApproved = useCallback(() => {
    const approved = images.filter(i => i.approved)
    if (approved.length === 0) {
      alert('✅ 최종 확정된 사진이 없습니다.\n왼쪽 목록에서 체크박스를 체크해주세요.')
      return
    }
    approved.forEach((img, idx) => {
      setTimeout(() => {
        downloadImage(img.editedUrl, `보정완료_${img.name}`)
      }, idx * 400)
    })
  }, [images])

  // 필터 슬라이더 변경
  const handleFilterChange = useCallback(async (imgId, key, value) => {
    const img = images.find(i => i.id === imgId)
    if (!img) return

    const current = filterValues[imgId] || { brightness: 100, contrast: 100, saturation: 100 }
    const newFilters = { ...current, [key]: value }

    setFilterValues(prev => ({ ...prev, [imgId]: newFilters }))

    const edited = await applyImageFilters(
      img.originalUrl,
      newFilters.brightness,
      newFilters.contrast,
      newFilters.saturation
    )
    setImages(prev => prev.map(i => i.id === imgId ? { ...i, editedUrl: edited } : i))
  }, [images, filterValues, setImages])

  const getFilter = (id, key) => filterValues[id]?.[key] ?? 100

  const statusColor = {
    pending: '#888',
    processing: '#f59e0b',
    done: '#10b981',
    error: '#ef4444',
  }

  const statusText = {
    pending: '⏳ 대기',
    processing: '⚙️ 처리중',
    done: '✅ 완료',
    error: '❌ 오류',
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>

      {/* 왼쪽: 업로드 + 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 업로드 영역 */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? '#1a1a2e' : '#ccc'}`,
            borderRadius: 12,
            padding: 28,
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? '#e8e8ff' : '#fff',
            transition: 'all 0.2s',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>사진 업로드</div>
          <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>
            클릭하거나 여기로 드래그<br />
            여러 장 한번에 선택 가능
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => addImages(e.target.files)}
          />
        </div>

        {/* 일괄 작업 버튼 */}
        {images.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={runAllImages}
              disabled={batchProcessing || images.filter(i => i.status === 'pending').length === 0}
              style={{
                padding: '10px 0',
                borderRadius: 10,
                border: 'none',
                background: batchProcessing ? '#ccc' : '#1a1a2e',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                transition: 'all 0.2s',
              }}
            >
              {batchProcessing ? '⚙️ 전체 보정 중...' : `✨ 전체 AI 자동보정 (${images.filter(i => i.status === 'pending').length}장)`}
            </button>
            <button
              onClick={downloadApproved}
              style={{
                padding: '10px 0',
                borderRadius: 10,
                border: '1.5px solid #1a1a2e',
                background: '#fff',
                color: '#1a1a2e',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              ⬇️ 최종확정 사진 다운로드 ({images.filter(i => i.approved).length}장)
            </button>
          </div>
        )}

        {/* 이미지 목록 */}
        {images.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e8e8e8' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', fontSize: 11, color: '#888', fontWeight: 600 }}>
              총 {images.length}장 &nbsp;|&nbsp;
              <span style={{ color: '#10b981' }}>완료 {images.filter(i => i.status === 'done').length}</span> &nbsp;·&nbsp;
              <span style={{ color: '#f59e0b' }}>대기 {images.filter(i => i.status === 'pending').length}</span>
            </div>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              {images.map(img => (
                <div
                  key={img.id}
                  onClick={() => setSelectedId(img.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    borderBottom: '1px solid #f5f5f5',
                    cursor: 'pointer',
                    background: selectedId === img.id ? '#f0f0ff' : '#fff',
                    borderLeft: selectedId === img.id ? '3px solid #1a1a2e' : '3px solid transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  {/* 썸네일 */}
                  <img
                    src={img.editedUrl}
                    alt=""
                    style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }}
                  />

                  {/* 정보 */}
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {img.name}
                    </div>
                    <div style={{ fontSize: 10, color: statusColor[img.status], marginTop: 2 }}>
                      {statusText[img.status]}
                    </div>
                  </div>

                  {/* 체크박스들 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }} title="최종 확정">
                      <input
                        type="checkbox"
                        checked={img.approved}
                        onChange={(e) => {
                          e.stopPropagation()
                          setImages(prev => prev.map(i =>
                            i.id === img.id ? { ...i, approved: e.target.checked, needsWork: false } : i
                          ))
                        }}
                        style={{ accentColor: '#10b981', width: 14, height: 14 }}
                      />
                      <span style={{ fontSize: 9, color: '#10b981' }}>확정</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }} title="추가 수정 필요">
                      <input
                        type="checkbox"
                        checked={img.needsWork}
                        onChange={(e) => {
                          e.stopPropagation()
                          setImages(prev => prev.map(i =>
                            i.id === img.id ? { ...i, needsWork: e.target.checked, approved: false } : i
                          ))
                        }}
                        style={{ accentColor: '#f59e0b', width: 14, height: 14 }}
                      />
                      <span style={{ fontSize: 9, color: '#f59e0b' }}>수정</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 오른쪽: 편집 영역 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {selected ? (
          <>
            {/* 원본 vs 보정 비교 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: '원본 사진', url: selected.originalUrl, tag: 'BEFORE', tagColor: '#888' },
                { label: 'AI 보정본', url: selected.editedUrl, tag: 'AFTER', tagColor: '#10b981' },
              ].map(item => (
                <div
                  key={item.tag}
                  style={{
                    background: '#fff',
                    borderRadius: 12,
                    border: '1px solid #e8e8e8',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid #f0f0f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: item.tagColor,
                      background: item.tagColor + '15',
                      padding: '2px 8px',
                      borderRadius: 20,
                    }}>
                      {item.tag}
                    </span>
                  </div>
                  <div style={{ background: '#f8f8f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img
                      src={item.url}
                      alt={item.label}
                      style={{ width: '100%', maxHeight: 320, objectFit: 'contain', display: 'block' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* AI 보정 로그 */}
            {selected.aiLog && (
              <div style={{
                background: '#f0fdf4',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 13,
                borderLeft: '3px solid #10b981',
                color: '#166534',
              }}>
                <strong>AI 보정 내역:</strong> {selected.aiLog}
              </div>
            )}

            {/* 수동 필터 조정 */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: '#1a1a2e' }}>
                🎛️ 수동 필터 조정
              </div>
              {[
                { key: 'brightness', label: '밝기', min: 60, max: 150 },
                { key: 'contrast', label: '대비', min: 60, max: 150 },
                { key: 'saturation', label: '채도', min: 60, max: 150 },
              ].map(({ key, label, min, max }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, width: 32, color: '#555', fontWeight: 500 }}>{label}</span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    value={getFilter(selected.id, key)}
                    onChange={(e) => handleFilterChange(selected.id, key, Number(e.target.value))}
                    style={{ flex: 1, accentColor: '#1a1a2e' }}
                  />
                  <span style={{ fontSize: 12, width: 36, textAlign: 'right', color: '#888', fontFamily: 'monospace' }}>
                    {getFilter(selected.id, key)}%
                  </span>
                </div>
              ))}
            </div>

            {/* AI 보정 실행 */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: '#1a1a2e' }}>
                ✨ AI 보정 실행
              </div>

              <button
                onClick={() => runAiRefine(selected.id)}
                disabled={processing[selected.id]}
                style={{
                  width: '100%',
                  padding: '10px 0',
                  borderRadius: 8,
                  border: 'none',
                  background: processing[selected.id] ? '#ccc' : '#1a1a2e',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 12,
                }}
              >
                {processing[selected.id] ? '⚙️ AI 보정 중...' : '✨ AI 자동 보정 실행'}
              </button>

              {/* 추가 수정 프롬프트 */}
              {selected.needsWork && (
                <div>
                  <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, marginBottom: 6 }}>
                    🔧 추가 수정 요청 (AI에게 구체적으로 지시)
                  </div>
                  <textarea
                    value={refinePrompt}
                    onChange={(e) => setRefinePrompt(e.target.value)}
                    placeholder="예시:
- 배경을 완전히 흰색으로 만들어줘
- 의류 색상을 더 선명하고 밝게 해줘
- 전체적으로 더 밝고 깨끗하게 보정해줘"
                    style={{
                      width: '100%',
                      height: 90,
                      borderRadius: 8,
                      border: '1.5px solid #f59e0b',
                      padding: '8px 12px',
                      fontSize: 12,
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={() => {
                      if (!refinePrompt.trim()) return
                      runAiRefine(selected.id, refinePrompt)
                      setRefinePrompt('')
                    }}
                    disabled={processing[selected.id] || !refinePrompt.trim()}
                    style={{
                      marginTop: 8,
                      width: '100%',
                      padding: '9px 0',
                      borderRadius: 8,
                      border: '1.5px solid #f59e0b',
                      background: '#fffbeb',
                      color: '#92400e',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    🔄 프롬프트로 재보정하기
                  </button>
                </div>
              )}
            </div>

            {/* 상태 선택 버튼 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                onClick={() => setImages(prev => prev.map(i =>
                  i.id === selected.id ? { ...i, approved: true, needsWork: false } : i
                ))}
                style={{
                  padding: '12px 0',
                  borderRadius: 10,
                  border: `2px solid ${selected.approved ? '#10b981' : '#e8e8e8'}`,
                  background: selected.approved ? '#f0fdf4' : '#fff',
                  color: selected.approved ? '#166534' : '#888',
                  fontSize: 13,
                  fontWeight: selected.approved ? 700 : 400,
                  transition: 'all 0.2s',
                }}
              >
                ✅ 최종 확정
              </button>
              <button
                onClick={() => setImages(prev => prev.map(i =>
                  i.id === selected.id ? { ...i, needsWork: true, approved: false } : i
                ))}
                style={{
                  padding: '12px 0',
                  borderRadius: 10,
                  border: `2px solid ${selected.needsWork ? '#f59e0b' : '#e8e8e8'}`,
                  background: selected.needsWork ? '#fffbeb' : '#fff',
                  color: selected.needsWork ? '#92400e' : '#888',
                  fontSize: 13,
                  fontWeight: selected.needsWork ? 700 : 400,
                  transition: 'all 0.2s',
                }}
              >
                🔧 추가 수정 필요
              </button>
            </div>
          </>
        ) : (
          /* 선택된 이미지 없을 때 */
          <div style={{
            background: '#fff',
            borderRadius: 16,
            border: '2px dashed #e8e8e8',
            height: 400,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#aaa',
          }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📸</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>사진을 업로드해 주세요</div>
            <div style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>
              왼쪽 업로드 영역에서 사진을 올린 후<br />
              AI 자동보정 버튼을 눌러보세요
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
