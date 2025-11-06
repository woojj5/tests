import { NextResponse } from 'next/server';
import { loadMetricsCsv } from '@/lib/metrics';

export async function GET() {
  try {
    const rows = await loadMetricsCsv();
    return NextResponse.json(
      { rows },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (e: any) {
    console.error('[api] metrics error:', e?.message || e);
    return NextResponse.json({ error: 'failed to load metrics' }, { status: 500 });
  }
}
