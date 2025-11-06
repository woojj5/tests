'use client';

import { useState } from 'react';
import { estimateSOCClient, checkSOCAPIHealthClient, type SOCEstimateResponse } from '@/lib/soc-api';

export default function SOCEstimationDemo() {
  const [device, setDevice] = useState<string>('');
  const [start, setStart] = useState<string>('-7d');
  const [stop, setStop] = useState<string>('now()');
  const [useLabelSOC, setUseLabelSOC] = useState<boolean>(false);
  const [result, setResult] = useState<SOCEstimateResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<any>(null);

  const handleEstimate = async () => {
    if (!device.trim()) {
      setError('디바이스 번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // 시간 형식 변환 (날짜 형식 -> Flux 형식)
      let startParam = start;
      let stopParam = stop;
      
      // 날짜 형식인 경우 Flux 형식으로 변환
      if (start.match(/^\d{4}-\d{2}-\d{2}$/)) {
        startParam = start + 'T00:00:00Z';
      }
      if (stop.match(/^\d{4}-\d{2}-\d{2}$/)) {
        stopParam = stop + 'T23:59:59Z';
      }
      
      const res = await estimateSOCClient({
        device: device.trim(),
        start: startParam,
        stop: stopParam,
        use_label_soc: useLabelSOC,
      });
      setResult(res);
    } catch (err: any) {
      // 더 자세한 에러 메시지 표시
      let errorMessage = err.message || 'SOC 추정 중 오류가 발생했습니다.';
      
      // 응답에서 상세 에러 정보 추출
      if (err.response) {
        try {
          const errorData = await err.response.json();
          if (errorData.message) {
            errorMessage = errorData.message;
          }
          if (errorData.suggestion) {
            errorMessage += `\n${errorData.suggestion}`;
          }
        } catch {
          // JSON 파싱 실패 시 기본 메시지 사용
        }
      }
      
      setError(errorMessage);
      console.error('SOC estimation error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckHealth = async () => {
    if (!device.trim()) {
      setError('디바이스 번호를 입력해주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    setHealth(null);

    try {
      const res = await checkSOCAPIHealthClient(device.trim());
      setHealth(res);
    } catch (err: any) {
      setError(err.message || 'SOC API 헬스 체크 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white dark:bg-zinc-800 space-y-4">
      <h3 className="text-lg font-semibold">SOC 추정 (RevIN + GRU + UKF)</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="device" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            디바이스 번호 *
          </label>
          <input
            type="text"
            id="device"
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50 dark:bg-zinc-700 dark:border-zinc-600 dark:text-white px-3 py-2"
            value={device}
            onChange={(e) => setDevice(e.target.value)}
            placeholder="예: 12345678"
          />
        </div>

        <div>
          <label htmlFor="start" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            시작 시간
          </label>
          <input
            type="text"
            id="start"
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50 dark:bg-zinc-700 dark:border-zinc-600 dark:text-white px-3 py-2"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            placeholder="예: -7d, -30d"
          />
        </div>

        <div>
          <label htmlFor="stop" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            종료 시간
          </label>
          <input
            type="text"
            id="stop"
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50 dark:bg-zinc-700 dark:border-zinc-600 dark:text-white px-3 py-2"
            value={stop}
            onChange={(e) => setStop(e.target.value)}
            placeholder="예: now()"
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="useLabelSOC"
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            checked={useLabelSOC}
            onChange={(e) => setUseLabelSOC(e.target.checked)}
          />
          <label htmlFor="useLabelSOC" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
            실제 SOC 라벨 사용
          </label>
        </div>
      </div>

      <div className="flex space-x-2">
        <button
          onClick={handleEstimate}
          disabled={loading || !device.trim()}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-700 dark:hover:bg-blue-800"
        >
          {loading ? '추정 중...' : 'SOC 추정 실행'}
        </button>
        <button
          onClick={handleCheckHealth}
          disabled={loading || !device.trim()}
          className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-700 dark:text-gray-200 dark:border-zinc-600 dark:hover:bg-zinc-600"
        >
          {loading ? '확인 중...' : 'API 상태 확인'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 whitespace-pre-line">
          <div className="font-semibold mb-1">❌ 오류 발생</div>
          <div>{error}</div>
          <div className="mt-2 text-xs text-red-600 dark:text-red-500">
            💡 해결 방법:
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>FastAPI 서버가 실행 중인지 확인: <code className="bg-red-100 dark:bg-red-900 px-1 rounded">docker compose ps jeon-api</code></li>
              <li>서버 재시작: <code className="bg-red-100 dark:bg-red-900 px-1 rounded">docker compose restart jeon-api</code></li>
              <li>로그 확인: <code className="bg-red-100 dark:bg-red-900 px-1 rounded">docker compose logs jeon-api</code></li>
            </ul>
          </div>
        </div>
      )}

      {health && (
        <div className="p-3 bg-gray-50 dark:bg-zinc-700 rounded-md text-sm">
          <h4 className="font-semibold mb-2">API 상태:</h4>
          <pre className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(health, null, 2)}</pre>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 dark:bg-zinc-700 rounded-md text-sm">
            <h4 className="font-semibold mb-2">추정 결과:</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-gray-500 dark:text-gray-400">샘플 수:</span>
                <span className="ml-2 font-medium">{result.num_samples.toLocaleString('ko-KR')}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">초기 SOC:</span>
                <span className="ml-2 font-medium">{result.metrics.initial_soc.toFixed(2)}%</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">최종 SOC:</span>
                <span className="ml-2 font-medium">{result.metrics.final_soc.toFixed(2)}%</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">전압 RMSE:</span>
                <span className="ml-2 font-medium">{result.metrics.voltage_rmse.toFixed(4)} V</span>
              </div>
            </div>
          </div>

          {result.latency && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md text-sm">
              <h4 className="font-semibold mb-2">성능:</h4>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">총 지연:</span>
                  <span className="ml-2 font-medium">{result.latency.total_ms.toFixed(2)} ms</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">FastAPI:</span>
                  <span className="ml-2 font-medium">{result.latency.fastapi_ms.toFixed(2)} ms</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">네트워크:</span>
                  <span className="ml-2 font-medium">{result.latency.network_ms.toFixed(2)} ms</span>
                </div>
              </div>
            </div>
          )}

          <details className="p-3 bg-gray-50 dark:bg-zinc-700 rounded-md text-sm">
            <summary className="cursor-pointer font-semibold">상세 결과 보기</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all text-xs overflow-auto max-h-96">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

