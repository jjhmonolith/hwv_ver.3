# OpenAI API Integration Guide

> **CRITICAL**: 이 프로젝트는 OpenAI Responses API와 GPT-5.2 모델을 사용합니다.
> **절대로** Chat Completions API나 이전 모델(gpt-4, gpt-4o 등)로 되돌리지 마세요.

## 현재 구성

### SDK 버전
- **openai**: `^6.16.0` (필수 - Responses API는 SDK 5.x 이상에서만 지원)
- SDK 4.x에는 `responses.create()` 메서드가 **존재하지 않음**

### 사용 모델
- **기본 모델**: `gpt-5.2` (환경변수 `OPENAI_MODEL`로 설정)
- **Reasoning Effort**: `medium` (환경변수 `OPENAI_REASONING_EFFORT`로 설정)

## Responses API vs Chat Completions API

### Responses API (현재 사용 중)
```typescript
const response = await openai.responses.create({
  model: 'gpt-5.2',
  instructions: 'System prompt here',
  input: 'User message here',
  reasoning: { effort: 'medium' },
  text: { format: { type: 'json_object' } },
});

const result = response.output_text;
```

### Chat Completions API (사용하지 않음)
```typescript
// ❌ 이 방식은 사용하지 않습니다
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [
    { role: 'system', content: '...' },
    { role: 'user', content: '...' }
  ],
});
```

## 주요 차이점

| 항목 | Responses API | Chat Completions API |
|------|---------------|---------------------|
| 메서드 | `openai.responses.create()` | `openai.chat.completions.create()` |
| 시스템 프롬프트 | `instructions` 파라미터 | `messages[].role: 'system'` |
| 사용자 입력 | `input` 파라미터 | `messages[].role: 'user'` |
| 응답 추출 | `response.output_text` | `response.choices[0].message.content` |
| Reasoning | `reasoning: { effort: 'medium' }` | `reasoning_effort: 'medium'` |
| JSON 출력 | `text: { format: { type: 'json_object' } }` | `response_format: { type: 'json_object' }` |

## GPT-5.2 모델 정보

### 출시 정보
- **출시일**: 2025년 12월 11일
- **스냅샷**: `gpt-5.2-2025-12-11`

### Reasoning Effort 값
- `none`: 추론 없음 (gpt-5.1+ 기본값, 최저 지연)
- `minimal`: 최소 추론
- `low`: 낮은 추론
- `medium`: 중간 추론 (이 프로젝트 기본값)
- `high`: 높은 추론
- `xhigh`: 최대 추론 (gpt-5.1-codex-max+ 지원)

### GPT-5 모델 패밀리
- `gpt-5`: 기본 모델
- `gpt-5-mini`: 경량 모델
- `gpt-5-nano`: 초경량 모델
- `gpt-5-pro`: 고성능 모델
- `gpt-5.2`: 최신 모델 (현재 사용)

## JSON Mode 사용 시 주의사항

`text: { format: { type: 'json_object' } }` 사용 시:
- **input 메시지에 "json" 또는 "JSON" 단어가 반드시 포함되어야 함**
- 그렇지 않으면 400 에러 발생:
  ```
  400 Response input messages must contain the word 'json' in some form
  to use 'text.format' of type 'json_object'.
  ```

### 올바른 예시
```typescript
input: `다음 텍스트를 분석하고 JSON 형식으로 결과를 제공해주세요: ${text}`
```

## 환경 변수

```env
OPENAI_API_KEY=sk-...          # OpenAI API 키
OPENAI_MODEL=gpt-5.2           # 사용할 모델
OPENAI_REASONING_EFFORT=medium # Reasoning effort 수준
```

## 파일 위치

- **LLM 서비스**: `backend/src/services/llm.ts`
- **주요 함수**:
  - `analyzeTopics()`: PDF에서 주제 추출
  - `generateQuestion()`: 인터뷰 질문 생성
  - `evaluateInterview()`: 인터뷰 평가

## 트러블슈팅

### 500 에러 발생 시
1. OpenAI SDK 버전 확인 (`npm ls openai` - 6.x 이상 필요)
2. 환경변수 설정 확인 (`OPENAI_API_KEY`)
3. Railway 로그에서 `[analyzeTopics] Error:` 메시지 확인

### "responses is not a function" 에러
- SDK 버전이 4.x인 경우 발생
- `npm install openai@latest`로 업그레이드 필요

### JSON 관련 400 에러
- input 메시지에 "json" 단어 포함 여부 확인

---

**마지막 업데이트**: 2026-01-29
