import { useState } from 'react'
import PhotoEditor from './components/PhotoEditor.jsx'
import DetailPageBuilder from './components/DetailPageBuilder.jsx'

export default function App() {
  const [activeTab, setActiveTab] = useState(0)
  const [refinedImages, setRefinedImages] = useState([])

  const tabs = [
    { label: '📸 1차 사진 보정', desc: '원본 사진 AI 보정 및 편집' },
    { label: '🛍️ 2차 상세페이지', desc: '상품 상세페이지 자동 제작' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f0' }}>
      {/* 헤더 */}
      <header style={{
        background: '#1a1a2e',
        color: '#fff',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 60,
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>✂️</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.3px' }}>
              Fashion AI Studio
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em' }}>
              여성의류 쇼핑몰 전용 AI 편집기
            </div>
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {tabs.map((tab, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              style={{
                padding: '8px 20px',
                borderRadius: 24,
                border: 'none',
                background: activeTab === i ? '#fff' : 'rgba(255,255,255,0.1)',
                color: activeTab === i ? '#1a1a2e' : 'rgba(255,255,255,0.7)',
                fontSize: 13,
                fontWeight: activeTab === i ? 700 : 400,
                transition: 'all 0.2s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 상태 표시 */}
        <div style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.5)',
          background: 'rgba(255,255,255,0.08)',
          padding: '4px 12px',
          borderRadius: 12,
        }}>
          보정완료 {refinedImages.filter(i => i.status === 'done').length}장
          &nbsp;·&nbsp;
          최종확정 {refinedImages.filter(i => i.approved).length}장
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        {activeTab === 0 && (
          <PhotoEditor
            images={refinedImages}
            setImages={setRefinedImages}
          />
        )}
        {activeTab === 1 && (
          <DetailPageBuilder
            refinedImages={refinedImages}
          />
        )}
      </main>
    </div>
  )
}
