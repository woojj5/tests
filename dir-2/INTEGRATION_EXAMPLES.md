# API 통합 예시

## 📚 개요

FastAPI 추론 API를 Next.js 애플리케이션에 통합하는 다양한 방법을 제공합니다.

## 🎯 사용 가능한 방법

### 1. 클라이언트 컴포넌트에서 사용 (권장)

**React Hook 사용:**
```tsx
'use client';

import { useState } from 'react';
import { inferClient } from '@/lib/inference-api';

export function MyComponent() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleInference = async () => {
    setLoading(true);
    try {
      const data = await inferClient([1.0, 2.0, 3.0, 4.0]);
      setResult(data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleInference} disabled={loading}>
        추론 실행
      </button>
      {result && <div>출력: {result.outputs.join(', ')}</div>}
    </div>
  );
}
```

**직접 fetch 사용:**
```tsx
'use client';

const response = await fetch('/api/infer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ inputs: [1.0, 2.0, 3.0] }),
});

const data = await response.json();
console.log(data.outputs);
```

### 2. 서버 컴포넌트에서 사용

```tsx
import { infer } from '@/lib/inference-api';

export default async function ServerComponent() {
  // 서버 사이드에서 직접 FastAPI 호출
  const result = await infer([1.0, 2.0, 3.0, 4.0]);
  
  return (
    <div>
      <p>출력값: {result.outputs.join(', ')}</p>
      <p>지연 시간: {result.latency_ms}ms</p>
    </div>
  );
}
```

### 3. API Route에서 사용

```typescript
// app/api/my-feature/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { infer } from '@/lib/inference-api';

export async function POST(req: NextRequest) {
  const { inputs } = await req.json();
  
  try {
    const result = await infer(inputs);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

## 📦 제공된 컴포넌트

### InferenceDemo 컴포넌트

완전한 UI를 포함한 추론 데모 컴포넌트입니다.

```tsx
import InferenceDemo from '@/components/InferenceDemo';

export default function Page() {
  return (
    <div>
      <InferenceDemo />
    </div>
  );
}
```

**특징:**
- 입력값 입력 UI
- 로딩 상태 표시
- 에러 처리
- 결과 표시 (출력값, 지연 시간 등)

## 🔧 API 라이브러리 함수

### `inferClient(inputs: number[])` - 클라이언트용

클라이언트 컴포넌트에서 Next.js 브릿지를 통해 호출합니다.

```typescript
import { inferClient } from '@/lib/inference-api';

const result = await inferClient([1.0, 2.0, 3.0]);
// result.outputs, result.latency_ms 등
```

### `infer(inputs: number[])` - 서버용

서버 컴포넌트에서 FastAPI를 직접 호출합니다.

```typescript
import { infer } from '@/lib/inference-api';

const result = await infer([1.0, 2.0, 3.0]);
```

### `checkFastAPIHealth()` - 상태 확인

FastAPI 서버 상태를 확인합니다.

```typescript
import { checkFastAPIHealth } from '@/lib/inference-api';

const health = await checkFastAPIHealth();
// health.status, health.model_loaded
```

## 🎨 실제 사용 예시

### 분석 페이지에 통합

`app/analysis/page.tsx`에 이미 통합되어 있습니다:

```tsx
import InferenceDemo from '@/components/InferenceDemo';

export default async function AnalysisPage() {
  // ... 기존 코드 ...
  
  return (
    <div>
      {/* 기존 분석 섹션 */}
      
      {/* 추론 API 통합 데모 */}
      <section>
        <InferenceDemo />
      </section>
    </div>
  );
}
```

### 커스텀 컴포넌트 만들기

```tsx
'use client';

import { useState } from 'react';
import { inferClient } from '@/lib/inference-api';

export function CustomInference() {
  const [inputs, setInputs] = useState<number[]>([1.0, 2.0]);
  const [result, setResult] = useState(null);

  const run = async () => {
    const data = await inferClient(inputs);
    setResult(data);
  };

  return (
    <div>
      {/* 커스텀 UI */}
    </div>
  );
}
```

## 📊 응답 구조

```typescript
interface InferenceResponse {
  outputs: number[];              // 추론 결과
  latency_ms: number;             // FastAPI 지연 시간
  total_latency_ms?: number;       // 전체 지연 시간 (브릿지 호출 시)
  fastapi_latency_ms?: number;     // FastAPI 지연 시간 (브릿지 호출 시)
  network_latency_ms?: number;     // 네트워크 지연 시간 (브릿지 호출 시)
}
```

## 🔍 에러 처리

```typescript
try {
  const result = await inferClient([1.0, 2.0, 3.0]);
} catch (error: any) {
  if (error.message.includes('FastAPI server is not available')) {
    // FastAPI 서버가 실행되지 않음
    console.error('FastAPI 서버를 시작하세요');
  } else {
    // 기타 에러
    console.error('Error:', error.message);
  }
}
```

## 🚀 다음 단계

1. ✅ API 통합 완료
2. 실제 모델 파일 추가
3. 입력 데이터 전처리 로직 추가
4. 결과 후처리 및 시각화
5. 배치 처리 기능 추가

## 📝 참고

- 브라우저에서 http://localhost:3006/analysis 접속
- "머신러닝 추론 API 통합" 섹션에서 직접 테스트 가능
- API 라이브러리: `lib/inference-api.ts`
- 데모 컴포넌트: `components/InferenceDemo.tsx`

