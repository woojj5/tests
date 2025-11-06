import 'server-only';
import { NextResponse } from 'next/server';
import { getCarTypesByDevices } from '@/lib/database';

export async function POST(req: Request) {
  try {
    const { deviceNos } = await req.json();
    if (!Array.isArray(deviceNos)) {
      return NextResponse.json({ error: 'deviceNos must be an array' }, { status: 400 });
    }
    const carTypes = await getCarTypesByDevices(deviceNos);
    return NextResponse.json(carTypes);
  } catch (e: any) {
    console.error('[api] cluster-car-types error:', e?.message || e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

