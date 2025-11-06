// app/api/soc/estimate/route.ts
// Next.js → FastAPI SOC 추정 브릿지 라우트
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// FastAPI 서버 URL (환경 변수에서 가져오기)
// 로컬 개발: http://localhost:8001
// Docker: http://jeon-api:8000 (컨테이너 내부 포트)
const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8001';

interface SOCEstimateRequest {
  device: string;
  start?: string;
  stop?: string;
  use_label_soc?: boolean;
}

interface SOCEstimateResponse {
  device: string;
  time_range: {
    start: string;
    stop: string;
  };
  num_samples: number;
  soc_estimates: number[];
  voltage_predictions: number[];
  voltage_actual: number[];
  metrics: {
    voltage_rmse: number;
    voltage_mae: number;
    final_soc: number;
    initial_soc: number;
    soc_rmse?: number;
    soc_mae?: number;
  };
}

/**
 * POST /api/soc/estimate
 * 
 * SOC 추정 요청을 FastAPI로 전달하는 브릿지 엔드포인트
 * 
 * 요청 예시:
 *   POST /api/soc/estimate
 *   {
 *     "device": "12345678",
 *     "start": "-7d",
 *     "stop": "now()",
 *     "use_label_soc": false
 *   }
 * 
 * 응답 예시:
 *   {
 *     "device": "12345678",
 *     "time_range": {"start": "-7d", "stop": "now()"},
 *     "num_samples": 1000,
 *     "soc_estimates": [0.95, 0.94, ...],
 *     "voltage_predictions": [350.2, 349.8, ...],
 *     "voltage_actual": [350.0, 349.5, ...],
 *     "metrics": {
 *       "voltage_rmse": 0.5,
 *       "voltage_mae": 0.3,
 *       "final_soc": 93.5,
 *       "initial_soc": 95.0
 *     }
 *   }
 */
export async function POST(req: NextRequest) {
  const totalStart = process.hrtime.bigint();
  
  try {
    const body: SOCEstimateRequest = await req.json();

    // 입력 검증
    if (!body.device || typeof body.device !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request: device is required and must be a string' },
        { status: 400 }
      );
    }

    // FastAPI 서버로 요청 전송
    const params = new URLSearchParams({
      device: body.device,
      start: body.start || '-7d',
      stop: body.stop || 'now()',
      use_label_soc: String(body.use_label_soc || false),
    });

    const fastapiStart = process.hrtime.bigint();
    
    // 타임아웃 설정 (SOC 추정은 시간이 오래 걸릴 수 있음)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5분 타임아웃
    
    let fastapiRes;
    try {
      fastapiRes = await fetch(`${FASTAPI_URL}/soc/estimate?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Connection': 'keep-alive',
        },
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('SOC estimation request timeout (5 minutes)');
      }
      throw new Error(`Failed to connect to FastAPI: ${fetchError.message}`);
    } finally {
      clearTimeout(timeoutId);
    }
    
    const fastapiEnd = process.hrtime.bigint();
    const fastapiLatencyMs = Number(fastapiEnd - fastapiStart) / 1_000_000;

    if (!fastapiRes.ok) {
      const errorBody = await fastapiRes.json().catch(() => ({ error: 'Unknown error' }));
      console.error(`[API Bridge] FastAPI SOC estimation failed: ${fastapiRes.status} - ${JSON.stringify(errorBody)}`);
      
      // SOC 추정기가 사용 불가능한 경우 더 자세한 메시지 제공
      let errorMessage = 'FastAPI SOC estimation failed';
      let suggestion = 'FastAPI 서버가 실행 중인지 확인: docker compose ps jeon-api';
      
      if (errorBody.detail) {
        errorMessage = errorBody.detail;
      }
      if (errorBody.soc_estimator_error) {
        errorMessage += ` (SOC 추정기 오류: ${errorBody.soc_estimator_error})`;
        suggestion = 'SOC 모델 파일이 있는지 확인하거나 FastAPI 로그를 확인하세요: docker compose logs jeon-api';
      }
      
      return NextResponse.json(
        { 
          status: 'error', 
          message: errorMessage,
          details: errorBody,
          fastapi_url: FASTAPI_URL,
          suggestion: suggestion,
        },
        { status: fastapiRes.status }
      );
    }

    const fastapiResult: SOCEstimateResponse = await fastapiRes.json();
    const totalEnd = process.hrtime.bigint();
    const totalLatencyMs = Number(totalEnd - totalStart) / 1_000_000;

    return NextResponse.json({
      ...fastapiResult,
      latency: {
        total_ms: round(totalLatencyMs, 2),
        fastapi_ms: round(fastapiLatencyMs, 2),
        network_ms: round(totalLatencyMs - fastapiLatencyMs, 2),
      },
    });
  } catch (error: any) {
    console.error(`[API Bridge] Error processing SOC estimation request: ${error.message}`);
    console.error(`[API Bridge] FastAPI URL: ${FASTAPI_URL}`);
    console.error(`[API Bridge] Error details:`, error);
    
    // 연결 실패인 경우 더 자세한 정보 제공
    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      return NextResponse.json(
        { 
          status: 'error', 
          message: `FastAPI 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.`,
          error: error.message,
          fastapi_url: FASTAPI_URL,
          suggestion: 'FastAPI 서버가 실행 중인지 확인: docker compose ps jeon-api',
        },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { 
        status: 'error', 
        message: `SOC 추정 실패: ${error.message}`,
        error: error.message,
        fastapi_url: FASTAPI_URL,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/soc/estimate
 * 
 * SOC 추정 API 상태 확인
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const device = searchParams.get('device');

    if (!device) {
      return NextResponse.json(
        { error: 'device parameter is required' },
        { status: 400 }
      );
    }

    // FastAPI 서버 상태 확인
    const fastapiHealthRes = await fetch(`${FASTAPI_URL}/health`, {
      headers: { 'Connection': 'keep-alive' },
      cache: 'no-store',
    });

    if (!fastapiHealthRes.ok) {
      return NextResponse.json(
        { 
          status: 'error', 
          message: 'FastAPI server is not healthy',
          fastapi_url: FASTAPI_URL,
        },
        { status: 503 }
      );
    }

    const fastapiHealth = await fastapiHealthRes.json();

    let message = 'SOC estimation API is available';
    if (!fastapiHealth.soc_estimator_available) {
      message = 'SOC estimation API is available but SOC estimator is not initialized';
      if (fastapiHealth.soc_estimator_error) {
        message += `: ${fastapiHealth.soc_estimator_error}`;
      }
    }

    return NextResponse.json({
      status: 'ok',
      fastapi: fastapiHealth,
      fastapi_url: FASTAPI_URL,
      message: message,
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        status: 'error',
        error: 'Failed to check SOC estimation API status',
        message: error.message,
        fastapi_url: FASTAPI_URL,
      },
      { status: 500 }
    );
  }
}

function round(value: number, decimals: number) {
  return Number(Math.round(Number(value + 'e' + decimals)) + 'e-' + decimals);
}

