import { useState } from 'react'
import AutoStudio from './components/AutoStudio.jsx'
import ModelCutStudio from './components/ModelCutStudio.jsx'
import { HANGER_V2 } from './utils/appMode.js'

// 옷걸이 v2(017, 사장님 요청): [원본 보정] [모델컷] [상세페이지] 3개 탭. 한 AutoStudio가 상태(상품·사진·문구)를 들고 있고
// 탭은 보여 줄 부분만 바꾸므로 탭을 옮겨도 작업 중인 상품과 상태가 그대로입니다. 모델컷 탭은 같은 상품의 보정본으로 만듭니다.
// ?v1(마네킹 앱)은 예전 그대로: '상세페이지 제작' + 'AI모델컷'(따로 동작).
const TABS = HANGER_V2
  ? [{ id: 'retouch', label: '원본 보정' }, { id: 'modelcut', label: '모델컷' }, { id: 'page', label: '상세페이지' }]
  : [{ id: 'studio', label: '상세페이지 제작' }, { id: 'modelcut', label: 'AI모델컷' }]

export default function App() {
  const [tab, setTab] = useState(TABS[0].id)
  return (
    <>
      <nav aria-label="작업 단계" style={{ position: 'sticky', top: 0, zIndex: 50, background: '#fff', borderBottom: '1px solid #e5e5e5' }}>
        <div role="tablist" style={{ maxWidth: 1400, margin: '0 auto', padding: '0 32px', display: 'flex', gap: 4 }}>
          {TABS.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              style={{ padding: '14px 18px', border: 'none', background: 'none', fontSize: 14, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? '#1a1a2e' : '#666', borderBottom: `3px solid ${tab === t.id ? '#1a1a2e' : 'transparent'}` }}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      <main style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
        {HANGER_V2
          ? <AutoStudio view={tab} />
          : <>
            {/* 탭을 옮겨도 작업 중인 내용이 사라지지 않도록 숨김 처리만 함 */}
            <div style={{ display: tab === 'studio' ? 'block' : 'none' }}><AutoStudio /></div>
            <div style={{ display: tab === 'modelcut' ? 'block' : 'none' }}><ModelCutStudio active={tab === 'modelcut'} /></div>
          </>}
      </main>
    </>
  )
}
