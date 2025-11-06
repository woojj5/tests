/**
 * FastAPI 추론 API 클라이언트 라이브러리
 * 
 * 서버 컴포넌트에서 사용:
 * import { infer } from '@/lib/inference-api';
 * const result = await infer([1.0, 2.0, 3.0]);
 * 
 * 클라이언트 컴포넌트에서 사용:
 * import { inferClient } from '@/lib/inference-api';
 * const result = await inferClient([1.0, 2.0, 3.0]);
 */

export interface InferenceRequest {
  inputs: number[];
}

export interface InferenceResponse {
  outputs: number[];
  latency_ms: number;
  total_latency_ms?: number;
  fastapi_latency_ms?: number;
  network_latency_ms?: number;
}

/**
 * 서버 컴포넌트에서 사용하는 추론 함수
 * (서버 사이드에서 직접 FastAPI 호출)
 */
export async function infer(inputs: number[]): Promise<InferenceResponse> {
  const fastapiUrl = process.env.FASTAPI_URL || 'http://localhost:8001';
  
  const response = await fetch(`${fastapiUrl}/infer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs }),
    // 서버 사이드에서는 캐시 비활성화
    cache: 'no-store',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `FastAPI error: ${response.status}`);
  }

  return response.json();
}

/**
 * 클라이언트 컴포넌트에서 사용하는 추론 함수
 * (Next.js API 브릿지를 통해 호출)
 */
export async function inferClient(inputs: number[]): Promise<InferenceResponse> {
  const response = await fetch('/api/infer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * FastAPI 서버 상태 확인
 */
export async function checkFastAPIHealth(): Promise<{ status: string; model_loaded: boolean }> {
  const fastapiUrl = process.env.FASTAPI_URL || 'http://localhost:8001';
  
  const response = await fetch(`${fastapiUrl}/health`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`FastAPI health check failed: ${response.status}`);
  }

  return response.json();
}

