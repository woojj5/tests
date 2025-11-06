import { NextResponse } from 'next/server';
import { getDistanceRankingCached } from '@/lib/data-access';

import 'server-only';
export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get('limit') ?? 50);
  const ranking = await getDistanceRankingCached(limit);
  return NextResponse.json({ ranking });
}
