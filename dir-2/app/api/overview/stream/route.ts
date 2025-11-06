// app/api/overview/stream/route.ts (SSE 실시간 KPI 스트리밍)
import { NextResponse } from 'next/server';
import { getDashboardSummaryCached } from '@/lib/data-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      // SSE 헤더 전송
      send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));

      // 30초마다 데이터 전송
      const interval = setInterval(async () => {
        try {
          const summary = await getDashboardSummaryCached();
          send(
            JSON.stringify({
              type: 'update',
              data: {
                total_vehicles: summary.total_vehicles,
                total_avg_soh: summary.total_avg_soh,
                total_avg_soc: summary.total_avg_soc,
                total_bms_records: summary.total_bms_records,
                total_gps_records: summary.total_gps_records,
              },
              timestamp: new Date().toISOString(),
            })
          );
        } catch (err: any) {
          send(
            JSON.stringify({
              type: 'error',
              message: err?.message || 'Failed to fetch data',
            })
          );
        }
      }, 30000); // 30초

      // 클라이언트 연결 종료 시 정리
      return () => {
        clearInterval(interval);
        controller.close();
      };
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

