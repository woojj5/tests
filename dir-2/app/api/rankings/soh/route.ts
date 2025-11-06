import { NextResponse } from 'next/server';
import { getAvgSocSoh, CAR_TYPES, START_TIME, END_TIME } from '@/lib/data-access';

import 'server-only';
export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get('limit') ?? 20);

  const byType = await getAvgSocSoh(CAR_TYPES);
  const ranking = Object.entries(byType)
    .map(([car_type, v]) => ({ car_type, avg_soh: v.avg_soh, device_count: v.device_count }))
    .sort((a, b) => b.avg_soh - a.avg_soh)
    .slice(0, limit);

  return NextResponse.json({ range: { start: START_TIME, stop: END_TIME }, ranking });
}
