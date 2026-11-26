import { useState } from 'react'
import AutoStudio from './components/AutoStudio.jsx'
import ModelCutStudio from './components/ModelCutStudio.jsx'
import { HANGER_V2 } from './utils/appMode.js'

// 옷걸이 v2(014): 모델컷은 서비스 조사 뒤 결정(사장님) → 'AI모델컷' 탭은 숨깁니다(코드는 남김, ?v1 에서 보임).
const TABS = [
  { id: 'studio', label: '상세페이지 제작' },
  ...(HANGER_V2 ? [] : [{ id: 'modelcut', label: 'AI모델컷' }]),
]

export default function App() {
  const [tab, setTab] = useState('studio')
  return (
    <>
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: '#fff', borderBottom: '1px solid #e5e5e5' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 32px', display: 'flex', gap: 4 }}>
          {TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              style={{ padding: '14px 18px', border: 'none', background: 'none', fontSize: 14, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? '#1a1a2e' : '#888', borderBottom: `3px solid ${tab === t.id ? '#1a1a2e' : 'transparent'}` }}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      <main style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        {/* 탭을 옮겨도 작업 중인 내용이 사라지지 않도록 숨김 처리만 함 */}
        <div style={{ display: tab === 'studio' ? 'block' : 'none' }}><AutoStudio /></div>
        {!HANGER_V2 && <div style={{ display: tab === 'modelcut' ? 'block' : 'none' }}><ModelCutStudio active={tab === 'modelcut'} /></div>}
      </main>
    </>
  )
}
