import 'server-only';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { fetchBmsTimeseries, FIELDS } from '@/lib/database';

export async function GET(req: NextRequest, { params }: { params: { device_no: string }}) {
  const deviceNo = params.device_no;
  const url = new URL(req.url);
  const start = url.searchParams.get('start') ?? '-30d';
  const stop  = url.searchParams.get('stop') ?? undefined;
  const every = url.searchParams.get('every') ?? '5m';

  const rows = await fetchBmsTimeseries({
    start, stop, every,
    deviceNo,
    fields: [FIELDS.SOC, FIELDS.PACK_VOLT, FIELDS.PACK_CURRENT],
  });

  return NextResponse.json(rows, {
    headers: { 'Cache-Control': 's-maxage=120, stale-while-revalidate=60' },
  });
}
