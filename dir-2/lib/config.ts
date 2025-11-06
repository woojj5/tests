import 'server-only';

// Helper function to get env var with fallback
const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const getEnvNumber = (key: string, defaultValue?: number): number => {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid number for environment variable ${key}: ${value}`);
  }
  return num;
};

const getEnvBool = (key: string, defaultValue?: boolean): boolean => {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) return defaultValue;
    return false;
  }
  return value.toLowerCase() === 'true' || value === '1';
};

// InfluxDB configuration
export const cfg = {
  // InfluxDB connection
  INFLUXDB_URL: getEnv('INFLUXDB_URL'),
  INFLUXDB_TOKEN: getEnv('INFLUXDB_TOKEN'),
  INFLUXDB_TIMEOUT: getEnvNumber('INFLUXDB_TIMEOUT', 30000),
  INFLUXDB_ORG: getEnv('INFLUXDB_ORG'),
  INFLUXDB_BUCKET: getEnv('INFLUXDB_BUCKET'),

  // Measurements
  EXACT_MEASUREMENT: getEnv('EXACT_MEASUREMENT', 'bms'),
  GPS_MEASUREMENT: getEnv('GPS_MEASUREMENT', 'gps'),

  // Fields
  SOC_FIELD: getEnv('SOC_FIELD', 'soc'),
  PACK_VOLT_FIELD: getEnv('PACK_VOLT_FIELD', 'pack_volt'),
  PACK_CURRENT_FIELD: getEnv('PACK_CURRENT_FIELD', 'pack_current'),
  ODOMETER_FIELD: getEnv('ODOMETER_FIELD', 'odometer'),
  SPEED_FIELD: getEnv('SPEED_FIELD', 'speed'),
  CHARGE_STATE_FIELD: getEnv('CHARGE_STATE_FIELD', 'charge_state'),

  // Tags
  DEVICE_KEY_TAG: getEnv('DEVICE_KEY_TAG', 'device_no'),
  MODEL_KEY_TAG: getEnv('MODEL_KEY_TAG', 'car_type'),

  // Data range
  DATA_START_MONTH: getEnv('DATA_START_MONTH', '2022-12'),
  DATA_STOP_MONTH: getEnv('DATA_STOP_MONTH', '2023-09'),
  DATA_TZ: getEnv('DATA_TZ', '+09:00'),

  // Cache
  CACHE_ENABLED: getEnvBool('CACHE_ENABLED', true),
  CACHE_PATH: getEnv('CACHE_PATH', './.cache'),
  CACHE_TTL_SECONDS: getEnvNumber('CACHE_TTL_SECONDS', 300),
  CACHE_TTL_HEAVY: getEnvNumber('CACHE_TTL_HEAVY', 3600),

  // Segmentation
  SEG_EVERY: getEnv('SEG_EVERY', '15m'),

  // Charging detection
  CHARGE_STATE_ON: getEnvNumber('CHARGE_STATE_ON', 0),
  SPEED_CHARGING_MAX: getEnvNumber('SPEED_CHARGING_MAX', 5),
  SOC_DELTA_POS_MIN: getEnvNumber('SOC_DELTA_POS_MIN', 0.1),
  CURRENT_POS_MIN: getEnvNumber('CURRENT_POS_MIN', 1.0),
  POWER_FAST_MIN_KW: getEnvNumber('POWER_FAST_MIN_KW', 20),
  POWER_SLOW_MAX_KW: getEnvNumber('POWER_SLOW_MAX_KW', 10),

  // Driving detection
  SPEED_MIN_MOVING: getEnvNumber('SPEED_MIN_MOVING', 1.0),
  SOC_DELTA_NEG_MIN: getEnvNumber('SOC_DELTA_NEG_MIN', 0.1),

  // Parking/Idle detection
  ODO_DELTA_MIN: getEnvNumber('ODO_DELTA_MIN', 0.1),
  CHARGE_STATE_EPS: getEnvNumber('CHARGE_STATE_EPS', 0.1),
  CURRENT_NEAR_ZERO: getEnvNumber('CURRENT_NEAR_ZERO', 0.5),
} as const;

// Helper functions for date handling
export function monthStartISO(monthStr: string, tz: string): string {
  // monthStr format: "YYYY-MM"
  const [year, month] = monthStr.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month string: ${monthStr}`);
  }
  const monthPad = String(month).padStart(2, '0');
  return `${year}-${monthPad}-01T00:00:00${tz}`;
}

export function monthStopExclusiveISO(monthStr: string, tz: string): string {
  // monthStr format: "YYYY-MM"
  const [year, month] = monthStr.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month string: ${monthStr}`);
  }
  // Next month, first day
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const monthPad = String(nextMonth).padStart(2, '0');
  return `${nextYear}-${monthPad}-01T00:00:00${tz}`;
}
