import { NextResponse } from 'next/server';
import { cfg } from '@/lib/config';
import { fetchBmsTimeseries, FIELDS } from '@/lib/database';
import { labelFrame, Sample } from '@/lib/segment';
import 'server-only';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { deviceNo: string } }) {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start') ?? `${cfg.DATA_START_MONTH}-01T00:00:00${cfg.DATA_TZ}`;
  const stop  = searchParams.get('stop')  ?? undefined;
  const every = searchParams.get('every') ?? cfg.SEG_EVERY;

  const fields = [FIELDS.SPEED, FIELDS.CHARGE_STATE, FIELDS.SOC, FIELDS.PACK_VOLT, FIELDS.PACK_CURRENT, FIELDS.ODOMETER];

  const rows = await fetchBmsTimeseries({
    start, stop, every, fields, deviceNo: params.deviceNo, createEmpty: false
  });

  // 동일 타임스탬프의 필드들을 하나의 레코드로 머지
  const mp = new Map<string, any>();
  for (const r of rows) {
    const key = r.time;
    const cur = mp.get(key) ?? { time: key };
    if (r.field === FIELDS.SPEED)        cur.speed = Number(r.value);
    else if (r.field === FIELDS.CHARGE_STATE) cur.charge_state = Number(r.value);
    else if (r.field === FIELDS.SOC)     cur.soc = Number(r.value);
    else if (r.field === FIELDS.PACK_VOLT) cur.pack_volt = Number(r.value);
    else if (r.field === FIELDS.PACK_CURRENT) cur.pack_current = Number(r.value);
    else if (r.field === FIELDS.ODOMETER) cur.odometer = Number(r.value);
    mp.set(key, cur);
  }
  const frame: Sample[] = Array.from(mp.values()).sort((a,b)=> new Date(a.time).getTime()-new Date(b.time).getTime());
  const labeled = labelFrame(frame);

  return NextResponse.json({ rows: labeled });
}
