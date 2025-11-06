import { NextResponse } from 'next/server';
import { listDevices } from '@/lib/database';

import 'server-only';
export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ devices: await listDevices({}) });
}
