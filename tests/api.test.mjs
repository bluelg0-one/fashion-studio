// 서버 함수의 입력 검사 확인: node --test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fashn from '../api/fashn.js'
import claude from '../api/claude.js'

function mockRes() {
  return {
    code: 0, body: null,
    status(c) { this.code = c; return this },
    json(b) { this.body = b; return this },
  }
}

process.env.FASHN_API_KEY = 'test-key'
process.env.ANTHROPIC_API_KEY = 'test-key'

test('fashn: 허용하지 않은 모델은 거절하고 FASHN을 부르지 않는다', async () => {
  let called = false
  globalThis.fetch = async () => { called = true; return { status: 200, json: async () => ({}) } }
  const res = mockRes()
  await fashn({ method: 'POST', body: { action: 'run', model_name: 'tryon-max', inputs: {} } }, res)
  assert.equal(res.code, 400)
  assert.equal(called, false)
})

test('fashn: 작업 ID에 경로 문자가 있으면 거절한다', async () => {
  const res = mockRes()
  await fashn({ method: 'POST', body: { action: 'status', id: '../run' } }, res)
  assert.equal(res.code, 400)
})

test('fashn: 정상 요청은 키를 붙여 그대로 전달한다', async () => {
  let sent
  globalThis.fetch = async (url, opts) => { sent = { url, opts }; return { status: 200, json: async () => ({ id: 'abc' }) } }
  const res = mockRes()
  await fashn({ method: 'POST', body: { action: 'run', model_name: 'background-remove', inputs: { image: 'x' } } }, res)
  assert.equal(res.code, 200)
  assert.deepEqual(res.body, { id: 'abc' })
  assert.equal(sent.url, 'https://api.fashn.ai/v1/run')
  assert.equal(sent.opts.headers.Authorization, 'Bearer test-key')
})

test('claude: 빈 요청과 허용하지 않은 이미지 형식은 거절한다', async () => {
  let res = mockRes()
  await claude({ method: 'POST', body: { prompt: '' } }, res)
  assert.equal(res.code, 400)
  res = mockRes()
  await claude({ method: 'POST', body: { prompt: 'hi', imageBase64: 'x', mimeType: 'text/html' } }, res)
  assert.equal(res.code, 400)
})
