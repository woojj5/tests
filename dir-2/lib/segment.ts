import { cfg } from './config';

export type Sample = {
  time: string;                // ISO
  speed?: number;              // km/h
  charge_state?: number;       // >0 when charging
  soc?: number;                // %
  pack_volt?: number;          // V
  pack_current?: number;       // A (+ charge / - discharge)
  odometer?: number;           // km
};

export type Labeled = Sample & {
  label: 'DRIVING' | 'CHARGING_SLOW' | 'CHARGING_FAST' | 'PARKING' | 'IDLE' | 'UNKNOWN';
  power_kw?: number;
  soc_delta?: number;
  odo_delta?: number;
};

export function labelFrame(frame: Sample[]): Labeled[] {
  const out: Labeled[] = [];
  for (let i = 0; i < frame.length; i++) {
    const cur = frame[i];
    const prev = i > 0 ? frame[i - 1] : undefined;

    const speed = Number(cur.speed ?? 0);
    const cs    = Number(cur.charge_state ?? 0);

    const soc = Number(cur.soc ?? (prev?.soc ?? 0));
    const socPrev = Number(prev?.soc ?? soc);
    const socDelta = soc - socPrev;

    const odo = Number(cur.odometer ?? (prev?.odometer ?? 0));
    const odoPrev = Number(prev?.odometer ?? odo);
    const odoDelta = odo - odoPrev;

    const volt = Number(cur.pack_volt ?? 0);
    const amp  = Number(cur.pack_current ?? 0);
    const powerKw = (volt * amp) / 1000;

    let label: Labeled['label'] = 'UNKNOWN';

    // Charging
    const chargingBase = (cs > cfg.CHARGE_STATE_ON) && (speed < cfg.SPEED_CHARGING_MAX);
    const chargingFinal = chargingBase && (socDelta >= cfg.SOC_DELTA_POS_MIN) && (amp >= cfg.CURRENT_POS_MIN);

    if (chargingFinal) {
      if (powerKw >= cfg.POWER_FAST_MIN_KW) label = 'CHARGING_FAST';
      else if (powerKw <= cfg.POWER_SLOW_MAX_KW) label = 'CHARGING_SLOW';
      else label = 'CHARGING_SLOW';
    } else {
      // Driving
      const drivingBySpeed   = speed > cfg.SPEED_MIN_MOVING;
      const drivingBySocDrop = socDelta <= -cfg.SOC_DELTA_NEG_MIN;
      if (drivingBySpeed || drivingBySocDrop) {
        label = 'DRIVING';
      } else {
        // Parking/Idle
        const odoStill = Math.abs(odoDelta) < cfg.ODO_DELTA_MIN;
        const csStill  = Math.abs((cs - Number(prev?.charge_state ?? cs))) <= cfg.CHARGE_STATE_EPS;
        const iNear0   = Math.abs(amp) <= cfg.CURRENT_NEAR_ZERO;
        if (odoStill && csStill && iNear0) {
          label = 'PARKING'; // 필요시 IDLE로 세분화 가능
        }
      }
    }

    out.push({
      ...cur,
      power_kw: Number.isFinite(powerKw) ? Number(powerKw.toFixed(3)) : 0,
      soc_delta: Number.isFinite(socDelta) ? Number(socDelta.toFixed(3)) : 0,
      odo_delta: Number.isFinite(odoDelta) ? Number(odoDelta.toFixed(3)) : 0,
      label,
    });
  }
  return out;
}
