# Fashion Studio

기존 React/Vite 프로젝트에 OpenAI 자동 제작 탭을 추가했습니다.

- `npm run dev`: Vite와 서버 전용 AI API를 함께 실행합니다.
- `npm run build` 후 `npm start`: 빌드 결과와 AI API를 localhost:3000에서 제공합니다.
- `npm test`: 실제 API 비용 없는 서버 검증입니다.

실행 환경에 `OPENAI_API_KEY`를 비밀값으로 등록하세요. VITE_ 접두사를 사용하지 마세요. 개발 서버는 프로젝트 `.env.local`도 지원하며, 프로덕션 서버는 실행 환경 변수를 사용합니다. 선택 변수: OPENAI_IMAGE_MODEL (기본 gpt-image-1), OPENAI_TEXT_MODEL (기본 gpt-4.1-mini).

자동 제작은 최대 6장 업로드 → 각 사진 배경 제거 및 보정 → 첫 원본 사진에서 실제 영역 추출 → 한국어 문구 → HTML/PNG 다운로드 순서입니다. 실패 후 같은 사진을 재시도할 때 성공한 이미지 보정은 재사용합니다. 결과는 브라우저 메모리에만 있으며 새로고침 전에 다운로드해야 합니다. AI 사진 보정은 실제 상품과 비교 확인해야 합니다.

현재 자동 제작 탭은 OpenAI 서버 API를 사용합니다. 기존 사진 보정·착용샷·상세페이지 탭은 별도 FASHN/Anthropic 연결을 사용하는 기존 기능입니다. 기존 VITE_ API 키를 설정하면 브라우저에 포함될 수 있으므로 새 키를 그 변수에 저장하지 마세요.

공개 배포 전 사용자 인증, 사용량 제한, 호스팅 환경의 서버 비밀값 등록이 필요합니다. 현재 서버는 기본적으로 127.0.0.1에만 바인딩합니다. Vercel용 api/studio.js도 포함하며 긴 이미지 요청에 맞는 실행 시간과 요청 크기 제한을 확인하세요. Vite preview만으로는 AI API가 실행되지 않습니다.
