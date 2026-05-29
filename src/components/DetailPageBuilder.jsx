import { useState, useRef } from 'react'
import { callGemini, fileToBase64 } from '../utils/gemini.js'

const MODEL_PRESETS = [
  { id: 'seoa', name: '서아', style: '20대 한국 여성, 청초하고 여성스러운 스타일', emoji: '👩' },
  { id: 'jua', name: '주아', style: '20대 트렌디 힙스터, 개성있는 스타일', emoji: '💫' },
  { id: 'emma', name: '에마', style: '유럽풍 시크하고 세련된 스타일', emoji: '✨' },
  { id: 'yoonji', name: '윤지', style: '30대 페미닌 엘레강스, 고급스러운 스타일', emoji: '🌸' },
]

const TEMPLATES = [
  { id: 'minimal', name: '미니멀 화이트', desc: '깔끔하고 모던한 레이아웃', bg: '#ffffff', accent: '#1a1a2e', text: '#1a1a1a', muted: '#888', divider: '#eeeeee', tag: '#f5f5f5', tagText: '#555' },
  { id: 'editorial', name: '에디토리얼', desc: '매거진 스타일 감성 레이아웃', bg: '#faf8f4', accent: '#8B4513', text: '#2c1810', muted: '#9a8070', divider: '#e8ddd0', tag: '#f5ede0', tagText: '#8B4513' },
  { id: 'luxe', name: '럭셔리 블랙', desc: '고급스러운 다크 테마', bg: '#111111', accent: '#d4af37', text: '#f0ece0', muted: '#888', divider: '#2a2a2a', tag: '#1e1e1e', tagText: '#d4af37' },
]

export default function DetailPageBuilder({ refinedImages = [] }) {
  const [config, setConfig] = useState({
    template: 'minimal',
    model: 'seoa',
    productName: '',
    price: '',
    fabric: '',
    features: '',
    category: 'tops',
  })
  const [sizeInfo, setSizeInfo] = useState({
    tops: [
      { size: 'S', length: '', shoulder: '', chest: '', sleeve: '' },
      { size: 'M', length: '', shoulder: '', chest: '', sleeve: '' },
      { size: 'L', length: '', shoulder: '', chest: '', sleeve: '' },
    ],
    pants: [
      { size: 'S', length: '', waist: '', hip: '', rise: '', thigh: '' },
      { size: 'M', length: '', waist: '', hip: '', rise: '', thigh: '' },
      { size: 'L', length: '', waist: '', hip: '', rise: '', thigh: '' },
    ],
    dress: [
      { size: 'S', length: '', shoulder: '', chest: '', waist: '' },
      { size: 'M', length: '', shoulder: '', chest: '', waist: '' },
      { size: 'L', length: '', shoulder: '', chest: '', waist: '' },
    ],
  })
  const [detailContent, setDetailContent] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [editPrompt, setEditPrompt] = useState('')
  const [editing, setEditing] = useState(false)
  const previewRef = useRef()

  const template = TEMPLATES.find(t => t.id === config.template) || TEMPLATES[0]
  const model = MODEL_PRESETS.find(m => m.id === config.model) || MODEL_PRESETS[0]

  const generateDetailPage = async () => {
    setGenerating(true)
    try {
      const approvedImgs = refinedImages.filter(i => i.approved || i.status === 'done')
      let imageBase64 = null
      if (approvedImgs.length > 0 && approvedImgs[0].file) {
        imageBase64 = await fileToBase64(approvedImgs[0].file)
      }

      const currentSizes = sizeInfo[config.category] || []
      const sizeText = currentSizes.map(s => JSON.stringify(s)).join(', ')

      const prompt = `
여성 의류 쇼핑몰 상세페이지 내용을 생성해줘.

[상품 정보]
- 상품명: ${config.productName || '여성 의류'}
- 가격: ${config.price || '미정'}
- 소재: ${config.fabric || '혼방'}
- 특징: ${config.features || ''}
- 카테고리: ${config.category === 'tops' ? '상의' : config.category === 'pants' ? '하의' : '원피스'}
- AI 모델: ${model.name} (${model.style})
- 사이즈 정보: ${sizeText}

[출력 형식]
반드시 아래 JSON 형식으로만 답해줘. 다른 텍스트 없이:

{
  "headline": "감성적인 상품 헤드라인 20자 이내",
  "subheadline": "부드러운 부제목 30자 이내",
  "story": "상품 스토리 2-3문장. 소재의 질감, 착용감, 스타일링 포인트를 감성적으로 설명",
  "points": ["핵심 특징 1", "핵심 특징 2", "핵심 특징 3", "핵심 특징 4"],
  "modelDesc": "${model.name} 모델 착용 스타일링 설명 2문장",
  "styling": "스타일링 추천 2-3가지",
  "care": ["세탁법 1", "세탁법 2", "보관법"],
  "hashtags": ["#태그1", "#태그2", "#태그3", "#태그4", "#태그5"]
}
`
      const raw = await callGemini(prompt, imageBase64)
      let content = {
        headline: '감각적인 여성 의류',
        subheadline: '일상을 특별하게 만드는 스타일',
        story: '섬세한 디테일과 편안한 착용감으로 완성된 아이템입니다.',
        points: ['고급 소재', '편안한 핏', '다양한 스타일링', '시즌리스 아이템'],
        modelDesc: '자연스럽고 우아한 실루엣으로 매력을 극대화합니다.',
        styling: '데님과 매치하거나 슬랙스와 함께 연출해보세요.',
        care: ['손세탁 권장', '그늘에서 건조', '중온 다림질'],
        hashtags: ['#여성패션', '#데일리룩', '#신상', '#쇼핑몰', '#오오티디'],
      }
      try {
        const match = raw.match(/\{[\s\S]*\}/)
        if (match) content = { ...content, ...JSON.parse(match[0]) }
      } catch (_) {}

      setDetailContent({
        ...content,
        images: approvedImgs.slice(0, 4).map(i => i.editedUrl),
        sizes: sizeInfo[config.category],
        category: config.category,
        productName: config.productName,
        price: config.price,
        fabric: config.fabric,
      })
    } catch (err) {
      alert('상세페이지 생성 중 오류가 발생했습니다: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  const refineDetailPage = async () => {
    if (!editPrompt.trim() || !detailContent) return
    setEditing(true)
    try {
      const prompt = `
현재 쇼핑몰 상세페이지 내용을 수정해줘.

[수정 요청]
"${editPrompt}"

[현재 내용]
${JSON.stringify(detailContent, null, 2)}

같은 JSON 구조로 수정된 내용만 답해줘. 다른 텍스트 없이.`

      const raw = await callGemini(prompt)
      try {
        const match = raw.match(/\{[\s\S]*\}/)
        if (match) {
          setDetailContent(prev => ({ ...prev, ...JSON.parse(match[0]) }))
        }
      } catch (_) {}
      setEditPrompt('')
    } catch (err) {
      alert('수정 중 오류: ' + err.message)
    } finally {
      setEditing(false)
    }
  }

  const downloadDetailPage = () => {
    if (!previewRef.current) return
    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${detailContent?.productName || '상품 상세페이지'}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Noto Sans KR', sans-serif; background: ${template.bg}; color: ${template.text}; }
</style>
</head>
<body>
${previewRef.current.innerHTML}
</body>
</html>`

    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `상세페이지_${config.productName || '상품'}.html`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>

      {/* 왼쪽: 설정 패널 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 상품 정보 입력 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: '#1a1a2e' }}>📦 상품 정보 입력</div>
          {[
            { key: 'productName', label: '상품명', placeholder: '예: 레이스 트리밍 블라우스' },
            { key: 'price', label: '판매가격', placeholder: '예: 39,000원' },
            { key: 'fabric', label: '소재/원단', placeholder: '예: 폴리에스터 100%, 비침없음' },
            { key: 'features', label: '상품 특징', placeholder: '예: 봄/여름 추천, 루즈핏' },
          ].map(({ key, label, placeholder }) => (
            <div key={key} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 3, fontWeight: 500 }}>{label}</div>
              <input
                value={config[key]}
                onChange={(e) => setConfig(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={placeholder}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: 7,
                  border: '1px solid #e0e0e0',
                  fontSize: 12,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ))}

          {/* 카테고리 선택 */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 6, fontWeight: 500 }}>의류 카테고리</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {[{ id: 'tops', label: '상의' }, { id: 'pants', label: '하의' }, { id: 'dress', label: '원피스' }].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setConfig(prev => ({ ...prev, category: cat.id }))}
                  style={{
                    padding: '7px 0',
                    borderRadius: 7,
                    border: `1.5px solid ${config.category === cat.id ? '#1a1a2e' : '#e0e0e0'}`,
                    background: config.category === cat.id ? '#1a1a2e' : '#fff',
                    color: config.category === cat.id ? '#fff' : '#555',
                    fontSize: 12,
                    fontWeight: config.category === cat.id ? 700 : 400,
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 사이즈 정보 입력 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#1a1a2e' }}>📏 사이즈 정보 (선택)</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>입력하면 상세페이지에 사이즈표가 자동 생성됩니다</div>

          {config.category === 'tops' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#f8f8f8' }}>
                  {['사이즈', '총장', '어깨', '가슴', '소매'].map(h => (
                    <th key={h} style={{ padding: '5px 3px', textAlign: 'center', color: '#666', fontWeight: 600, borderBottom: '1px solid #eee' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sizeInfo.tops.map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '4px 3px', textAlign: 'center', fontWeight: 700 }}>{row.size}</td>
                    {['length', 'shoulder', 'chest', 'sleeve'].map(field => (
                      <td key={field} style={{ padding: '3px 2px' }}>
                        <input
                          value={row[field]}
                          onChange={(e) => {
                            const newSizes = [...sizeInfo.tops]
                            newSizes[idx] = { ...newSizes[idx], [field]: e.target.value }
                            setSizeInfo(prev => ({ ...prev, tops: newSizes }))
                          }}
                          placeholder="cm"
                          style={{ width: '100%', padding: '4px 4px', borderRadius: 4, border: '1px solid #e0e0e0', fontSize: 11, textAlign: 'center' }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {config.category === 'pants' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#f8f8f8' }}>
                  {['사이즈', '총장', '허리', '힙', '밑위', '허벅지'].map(h => (
                    <th key={h} style={{ padding: '5px 3px', textAlign: 'center', color: '#666', fontWeight: 600, borderBottom: '1px solid #eee' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sizeInfo.pants.map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '4px 3px', textAlign: 'center', fontWeight: 700 }}>{row.size}</td>
                    {['length', 'waist', 'hip', 'rise', 'thigh'].map(field => (
                      <td key={field} style={{ padding: '3px 2px' }}>
                        <input
                          value={row[field]}
                          onChange={(e) => {
                            const newSizes = [...sizeInfo.pants]
                            newSizes[idx] = { ...newSizes[idx], [field]: e.target.value }
                            setSizeInfo(prev => ({ ...prev, pants: newSizes }))
                          }}
                          placeholder="cm"
                          style={{ width: '100%', padding: '4px 4px', borderRadius: 4, border: '1px solid #e0e0e0', fontSize: 11, textAlign: 'center' }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {config.category === 'dress' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#f8f8f8' }}>
                  {['사이즈', '총장', '어깨', '가슴', '허리'].map(h => (
                    <th key={h} style={{ padding: '5px 3px', textAlign: 'center', color: '#666', fontWeight: 600, borderBottom: '1px solid #eee' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sizeInfo.dress.map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '4px 3px', textAlign: 'center', fontWeight: 700 }}>{row.size}</td>
                    {['length', 'shoulder', 'chest', 'waist'].map(field => (
                      <td key={field} style={{ padding: '3px 2px' }}>
                        <input
                          value={row[field]}
                          onChange={(e) => {
                            const newSizes = [...sizeInfo.dress]
                            newSizes[idx] = { ...newSizes[idx], [field]: e.target.value }
                            setSizeInfo(prev => ({ ...prev, dress: newSizes }))
                          }}
                          placeholder="cm"
                          style={{ width: '100%', padding: '4px 4px', borderRadius: 4, border: '1px solid #e0e0e0', fontSize: 11, textAlign: 'center' }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 템플릿 선택 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#1a1a2e' }}>🎨 레이아웃 템플릿</div>
          {TEMPLATES.map(t => (
            <div
              key={t.id}
              onClick={() => setConfig(prev => ({ ...prev, template: t.id }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 11px',
                borderRadius: 8,
                border: `1.5px solid ${config.template === t.id ? '#1a1a2e' : '#e8e8e8'}`,
                background: config.template === t.id ? '#f0f0ff' : '#fff',
                cursor: 'pointer',
                marginBottom: 6,
              }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: 6,
                background: t.bg, border: '1px solid #ddd',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, color: t.text,
              }}>
                {t.id === 'minimal' ? 'M' : t.id === 'editorial' ? 'E' : 'L'}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: config.template === t.id ? 700 : 500 }}>{t.name}</div>
                <div style={{ fontSize: 10, color: '#888' }}>{t.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* AI 모델 선택 */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#1a1a2e' }}>👤 AI 가상 모델</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {MODEL_PRESETS.map(m => (
              <div
                key={m.id}
                onClick={() => setConfig(prev => ({ ...prev, model: m.id }))}
                style={{
                  padding: '10px 8px',
                  borderRadius: 8,
                  border: `1.5px solid ${config.model === m.id ? '#1a1a2e' : '#e8e8e8'}`,
                  background: config.model === m.id ? '#1a1a2e' : '#fff',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 20 }}>{m.emoji}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: config.model === m.id ? '#fff' : '#1a1a2e', marginTop: 3 }}>{m.name}</div>
                <div style={{ fontSize: 9, color: config.model === m.id ? 'rgba(255,255,255,0.6)' : '#999', marginTop: 2, lineHeight: 1.3 }}>{m.style.split(',')[0]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 생성 버튼 */}
        <button
          onClick={generateDetailPage}
          disabled={generating}
          style={{
            padding: '14px 0',
            borderRadius: 10,
            border: 'none',
            background: generating ? '#ccc' : '#1a1a2e',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.3px',
          }}
        >
          {generating ? '⚙️ 상세페이지 생성 중...' : '🚀 AI 상세페이지 자동 생성'}
        </button>

        {/* 수정 프롬프트 */}
        {detailContent && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#1a1a2e' }}>✍️ 상세페이지 추가 수정</div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
              수정하고 싶은 내용을 자유롭게 입력하세요
            </div>
            <textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              placeholder="예시:
- 헤드라인을 더 감성적으로 바꿔줘
- 특징 항목에 사이즈 관련 내용 추가해줘
- 전체 톤을 더 고급스럽게 바꿔줘
- 해시태그 더 추가해줘"
              style={{
                width: '100%',
                height: 100,
                borderRadius: 8,
                border: '1px solid #e0e0e0',
                padding: '8px 10px',
                fontSize: 12,
                resize: 'vertical',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            <button
              onClick={refineDetailPage}
              disabled={editing || !editPrompt.trim()}
              style={{
                marginTop: 8,
                width: '100%',
                padding: '9px 0',
                borderRadius: 8,
                border: '1.5px solid #1a1a2e',
                background: '#fff',
                color: '#1a1a2e',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {editing ? '⚙️ 수정 중...' : '🔄 AI로 수정 적용하기'}
            </button>
          </div>
        )}

        {/* 다운로드 버튼 */}
        {detailContent && (
          <button
            onClick={downloadDetailPage}
            style={{
              padding: '12px 0',
              borderRadius: 10,
              border: '1.5px solid #10b981',
              background: '#f0fdf4',
              color: '#166534',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            ⬇️ 상세페이지 HTML 다운로드
          </button>
        )}
      </div>

      {/* 오른쪽: 미리보기 */}
      <div style={{ position: 'sticky', top: 80 }}>
        {detailContent ? (
          <div style={{ background: '#e8e8e8', borderRadius: 16, padding: 12 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8, textAlign: 'center', fontWeight: 600 }}>
              📱 상세페이지 미리보기
            </div>
            <div
              ref={previewRef}
              className="fade-in"
              style={{
                background: template.bg,
                color: template.text,
                borderRadius: 12,
                overflow: 'hidden',
                maxHeight: '80vh',
                overflowY: 'auto',
                fontFamily: "'Noto Sans KR', sans-serif",
              }}
            >
              {/* 헤더 */}
              <div style={{ padding: '40px 32px 28px', borderBottom: `1px solid ${template.divider}` }}>
                <div style={{ fontSize: 10, letterSpacing: '0.15em', color: template.muted, marginBottom: 10, textTransform: 'uppercase' }}>
                  New Arrival
                </div>
                <h1 style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.3, marginBottom: 10, color: template.text }}>
                  {detailContent.headline}
                </h1>
                <p style={{ fontSize: 14, color: template.muted, lineHeight: 1.6, marginBottom: 16 }}>
                  {detailContent.subheadline}
                </p>
                {detailContent.price && (
                  <div style={{ fontSize: 22, fontWeight: 700, color: template.accent }}>
                    {detailContent.price}
                  </div>
                )}
              </div>

              {/* 상품 이미지들 */}
              {detailContent.images?.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: detailContent.images.length > 1 ? '1fr 1fr' : '1fr',
                  gap: 2,
                }}>
                  {detailContent.images.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`상품 ${i + 1}`}
                      style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }}
                    />
                  ))}
                </div>
              )}

              {/* 스토리 */}
              <div style={{ padding: '28px 32px', borderBottom: `1px solid ${template.divider}` }}>
                <div style={{ fontSize: 9, letterSpacing: '0.15em', color: template.muted, marginBottom: 12, textTransform: 'uppercase' }}>
                  Story
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.9, color: template.text }}>
                  {detailContent.story}
                </p>
              </div>

              {/* AI 모델 섹션 */}
              <div style={{ padding: '24px 32px', background: template.tag, borderBottom: `1px solid ${template.divider}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: template.accent, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, flexShrink: 0,
                  }}>
                    {model.emoji}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: template.muted, marginBottom: 4 }}>
                      AI 모델 {model.name} 착용 컷
                    </div>
                    <p style={{ fontSize: 12, lineHeight: 1.7, color: template.text, marginBottom: 8 }}>
                      {detailContent.modelDesc}
                    </p>
                    <div style={{ fontSize: 11, color: template.muted, fontStyle: 'italic' }}>
                      💡 {detailContent.styling}
                    </div>
                  </div>
                </div>
              </div>

              {/* 핵심 특징 */}
              <div style={{ padding: '24px 32px', borderBottom: `1px solid ${template.divider}` }}>
                <div style={{ fontSize: 9, letterSpacing: '0.15em', color: template.muted, marginBottom: 14, textTransform: 'uppercase' }}>
                  Highlights
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {detailContent.points?.map((point, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: template.accent, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: template.text }}>{point}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 사이즈표 */}
              {detailContent.sizes?.some(s => s.length || s.chest || s.waist) && (
                <div style={{ padding: '24px 32px', borderBottom: `1px solid ${template.divider}` }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.15em', color: template.muted, marginBottom: 14, textTransform: 'uppercase' }}>
                    Size Guide
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr>
                        {detailContent.category === 'tops' && ['사이즈', '총장', '어깨', '가슴', '소매'].map(h => (
                          <th key={h} style={{ padding: '6px 4px', textAlign: 'center', borderBottom: `1px solid ${template.divider}`, color: template.muted }}>{h}</th>
                        ))}
                        {detailContent.category === 'pants' && ['사이즈', '총장', '허리', '힙', '밑위', '허벅지'].map(h => (
                          <th key={h} style={{ padding: '6px 4px', textAlign: 'center', borderBottom: `1px solid ${template.divider}`, color: template.muted }}>{h}</th>
                        ))}
                        {detailContent.category === 'dress' && ['사이즈', '총장', '어깨', '가슴', '허리'].map(h => (
                          <th key={h} style={{ padding: '6px 4px', textAlign: 'center', borderBottom: `1px solid ${template.divider}`, color: template.muted }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detailContent.sizes.map((row, i) => (
                        <tr key={i}>
                          <td style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 700, color: template.accent }}>{row.size}</td>
                          {detailContent.category === 'tops' && ['length', 'shoulder', 'chest', 'sleeve'].map(f => (
                            <td key={f} style={{ padding: '6px 4px', textAlign: 'center', color: template.text }}>{row[f] || '-'}</td>
                          ))}
                          {detailContent.category === 'pants' && ['length', 'waist', 'hip', 'rise', 'thigh'].map(f => (
                            <td key={f} style={{ padding: '6px 4px', textAlign: 'center', color: template.text }}>{row[f] || '-'}</td>
                          ))}
                          {detailContent.category === 'dress' && ['length', 'shoulder', 'chest', 'waist'].map(f => (
                            <td key={f} style={{ padding: '6px 4px', textAlign: 'center', color: template.text }}>{row[f] || '-'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 10, color: template.muted, marginTop: 8, textAlign: 'right' }}>
                    ※ 측정 방법에 따라 1~2cm 오차가 있을 수 있습니다
                  </div>
                </div>
              )}

              {/* 소재 및 세탁 방법 */}
              <div style={{ padding: '24px 32px', borderBottom: `1px solid ${template.divider}` }}>
                <div style={{ fontSize: 9, letterSpacing: '0.15em', color: template.muted, marginBottom: 12, textTransform: 'uppercase' }}>
                  Care & Material
                </div>
                {detailContent.fabric && (
                  <div style={{ fontSize: 12, color: template.text, marginBottom: 10 }}>
                    <strong>소재:</strong> {detailContent.fabric}
                  </div>
                )}
                {detailContent.care?.map((c, i) => (
                  <div key={i} style={{ fontSize: 12, color: template.muted, marginBottom: 4 }}>· {c}</div>
                ))}
              </div>

              {/* 해시태그 */}
              <div style={{ padding: '20px 32px 32px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {detailContent.hashtags?.map((tag, i) => (
                  <span
                    key={i}
                    style={{
                      padding: '4px 10px',
                      background: template.tag,
                      color: template.tagText,
                      borderRadius: 20,
                      fontSize: 11,
                      border: `1px solid ${template.divider}`,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            background: '#fff',
            borderRadius: 16,
            border: '2px dashed #e8e8e8',
            height: 500,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#aaa',
          }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🛍️</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#888' }}>상세페이지 미리보기</div>
            <div style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.7, color: '#aaa' }}>
              왼쪽에서 상품 정보를 입력하고<br />
              AI 상세페이지 자동 생성 버튼을 눌러주세요<br />
              <br />
              <span style={{ fontSize: 11 }}>
                💡 1차 보정 탭에서 사진을 먼저<br />
                보정하고 최종 확정하면 이미지가<br />
                자동으로 상세페이지에 들어가요!
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
