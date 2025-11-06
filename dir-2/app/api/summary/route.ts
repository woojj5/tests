import 'server-only';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getDashboardSummaryCached } from '@/lib/data-access';

export async function GET() {
  try {
    const data = await getDashboardSummaryCached();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' },
    });
  } catch (e: any) {
    console.error('[api] summary error:', e?.message || e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
