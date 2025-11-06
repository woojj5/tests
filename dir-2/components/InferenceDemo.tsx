'use client';

/**
 * FastAPI 추론 API 통합 데모 컴포넌트
 * 
 * 사용 예시:
 * <InferenceDemo />
 */
import { useState } from 'react';

interface InferenceResult {
  outputs: number[];
  latency_ms: number;
  total_latency_ms?: number;
  fastapi_latency_ms?: number;
  network_latency_ms?: number;
}

export default function InferenceDemo() {
  const [inputs, setInputs] = useState<string>('1.0, 2.0, 3.0, 4.0');
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInference = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // 입력값 파싱
      const inputArray = inputs
        .split(',')
        .map(s => parseFloat(s.trim()))
        .filter(n => !isNaN(n));

      if (inputArray.length === 0) {
        throw new Error('입력값이 올바르지 않습니다. 숫자를 쉼표로 구분하여 입력하세요.');
      }

      // API 호출
      const response = await fetch('/api/infer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: inputArray,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: InferenceResult = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || '추론 요청 실패');
      console.error('Inference error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-6 bg-white dark:bg-zinc-900">
      <h3 className="text-lg font-semibold mb-4">머신러닝 추론 API 통합 데모</h3>
      
      <div className="space-y-4">
        {/* 입력 필드 */}
        <div>
          <label className="block text-sm font-medium mb-2">
            입력값 (쉼표로 구분):
          </label>
          <input
            type="text"
            value={inputs}
            onChange={(e) => setInputs(e.target.value)}
            placeholder="1.0, 2.0, 3.0, 4.0"
            className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800"
            disabled={loading}
          />
          <p className="text-xs text-zinc-500 mt-1">
            예: 1.0, 2.0, 3.0, 4.0 (더미 모델: 입력값 × 2)
          </p>
        </div>

        {/* 실행 버튼 */}
        <button
          onClick={handleInference}
          disabled={loading}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-400 text-white rounded-lg font-medium transition-colors"
        >
          {loading ? '처리 중...' : '추론 실행'}
        </button>

        {/* 에러 메시지 */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">❌ {error}</p>
          </div>
        )}

        {/* 결과 표시 */}
        {result && (
          <div className="space-y-3">
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">
                ✅ 추론 결과
              </h4>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">출력값: </span>
                  <span className="font-mono">
                    [{result.outputs.map((v, i) => (
                      <span key={i}>
                        {v.toFixed(2)}
                        {i < result.outputs.length - 1 && ', '}
                      </span>
                    ))}]
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-green-200 dark:border-green-700">
                  <div>
                    <span className="text-zinc-600 dark:text-zinc-400">FastAPI 지연: </span>
                    <span className="font-mono">{result.fastapi_latency_ms?.toFixed(2) || result.latency_ms.toFixed(2)}ms</span>
                  </div>
                  {result.total_latency_ms && (
                    <div>
                      <span className="text-zinc-600 dark:text-zinc-400">전체 지연: </span>
                      <span className="font-mono">{result.total_latency_ms.toFixed(2)}ms</span>
                    </div>
                  )}
                  {result.network_latency_ms !== undefined && (
                    <div className="col-span-2">
                      <span className="text-zinc-600 dark:text-zinc-400">네트워크 지연: </span>
                      <span className="font-mono">{result.network_latency_ms.toFixed(2)}ms</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

