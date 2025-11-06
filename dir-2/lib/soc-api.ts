// lib/soc-api.ts
// SOC 추정 API 클라이언트

export interface SOCEstimateRequest {
  device: string;
  start?: string;
  stop?: string;
  use_label_soc?: boolean;
}

export interface SOCEstimateResponse {
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
  latency?: {
    total_ms: number;
    fastapi_ms: number;
    network_ms: number;
  };
}

/**
 * 클라이언트 컴포넌트에서 SOC 추정 요청
 */
export async function estimateSOCClient(request: SOCEstimateRequest): Promise<SOCEstimateResponse> {
  const res = await fetch('/api/soc/estimate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    cache: 'no-store',
  });

  if (!res.ok) {
    let errorBody;
    try {
      errorBody = await res.json();
    } catch {
      errorBody = { message: `HTTP ${res.status}: ${res.statusText}` };
    }
    
    const error = new Error(errorBody.message || 'Failed to estimate SOC via API bridge');
    (error as any).response = res;
    (error as any).errorBody = errorBody;
    throw error;
  }

  return res.json();
}

/**
 * SOC 추정 API 상태 확인 (클라이언트)
 */
export async function checkSOCAPIHealthClient(device: string): Promise<any> {
  const res = await fetch(`/api/soc/estimate?device=${device}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorBody = await res.json();
    throw new Error(errorBody.message || 'Failed to check SOC API health');
  }

  return res.json();
}

