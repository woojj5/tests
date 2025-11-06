// app/api/overview/route.ts
import { NextResponse } from 'next/server';
import {
  getDashboardSummaryCached,
  listAllMeasurementFieldsCached,
  fetchFieldCountsByCarTypeCached,
  START_TIME,
  END_TIME,
} from '@/lib/data-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // API는 항상 동적

export async function GET() {
  try {
    const [summary, fields, perType] = await Promise.all([
      getDashboardSummaryCached(),
      listAllMeasurementFieldsCached({
        start: START_TIME,
        stop: END_TIME,
      }),
      fetchFieldCountsByCarTypeCached(),
    ]);

    return NextResponse.json(
      {
        summary,
        fields,
        perType,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=120',
        },
      }
    );
  } catch (e: any) {
    console.error('[api] overview error:', e?.message || e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

