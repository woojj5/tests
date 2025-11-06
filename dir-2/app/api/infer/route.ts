// app/api/infer/route.ts
// Next.js → FastAPI 브릿지 라우트
import { NextRequest, NextResponse } from 'next/server';
import http from 'http';
import https from 'https';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// FastAPI 서버 URL (환경 변수에서 가져오기)
// 로컬 개발: http://localhost:8001 (포트 8000은 Portainer가 사용 중)
// Docker: http://jeon-api:8000 (컨테이너 내부 포트)
const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8001';

// Note: Next.js의 fetch는 Node.js 18+에서 기본적으로 keep-alive를 지원합니다.
// Docker 네트워크 내부 통신 최적화를 위해 연결 재사용이 자동으로 처리됩니다.

interface InferenceRequest {
  inputs: number[];
}

interface InferenceResponse {
  outputs: number[];
  latency_ms: number;
}

/**
 * POST /api/infer
 * 
 * Next.js에서 FastAPI 인퍼런스 서버를 호출하는 브릿지 엔드포인트
 * 
 * 요청 예시:
 *   POST /api/infer
 *   {
 *     "inputs": [1.0, 2.0, 3.0, 4.0]
 *   }
 * 
 * 응답 예시:
 *   {
 *     "outputs": [2.0, 4.0, 6.0, 8.0],
 *     "latency_ms": 1.23
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    // 요청 본문 파싱
    const body: InferenceRequest = await req.json();

    // 입력 검증
    if (!body.inputs || !Array.isArray(body.inputs) || body.inputs.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: inputs must be a non-empty array' },
        { status: 400 }
      );
    }

    // FastAPI 서버로 요청 전송 (keep-alive 연결 재사용)
    const startTime = Date.now();
    
    const response = await fetch(`${FASTAPI_URL}/infer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
      },
      body: JSON.stringify({
        inputs: body.inputs,
      }),
      // Node.js fetch에서 keep-alive를 위한 agent 설정
      // @ts-ignore - Next.js fetch는 agent를 지원하지 않으므로, 직접 http 모듈 사용 고려
      cache: 'no-store',
      next: { revalidate: 0 },
    } as any);

    const totalLatency = Date.now() - startTime;

    // FastAPI 응답 확인
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API] FastAPI error (${response.status}):`, errorText);
      return NextResponse.json(
        { error: `FastAPI error: ${errorText}`, status: response.status },
        { status: response.status }
      );
    }

    // 응답 파싱
    const data: InferenceResponse = await response.json();

    // 전체 지연 시간 포함 (FastAPI 지연 + 네트워크 지연)
    return NextResponse.json({
      ...data,
      total_latency_ms: totalLatency,
      fastapi_latency_ms: data.latency_ms,
      network_latency_ms: totalLatency - data.latency_ms,
    });
  } catch (error: any) {
    console.error('[API] Inference error:', error);
    
    // FastAPI 서버 연결 실패 처리
    if (error.code === 'ECONNREFUSED' || error.message.includes('fetch failed')) {
      return NextResponse.json(
        { 
          error: 'FastAPI server is not available',
          message: `Failed to connect to ${FASTAPI_URL}. Make sure the FastAPI server is running.`,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/infer
 * 
 * FastAPI 서버 상태 확인
 */
export async function GET() {
  try {
    const response = await fetch(`${FASTAPI_URL}/health`, {
      headers: {
        'Connection': 'keep-alive',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'FastAPI server is not healthy', status: response.status },
        { status: 503 }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      status: 'ok',
      fastapi: data,
      fastapi_url: FASTAPI_URL,
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        status: 'error',
        error: 'FastAPI server is not available',
        message: error.message,
        fastapi_url: FASTAPI_URL,
      },
      { status: 503 }
    );
  }
}

