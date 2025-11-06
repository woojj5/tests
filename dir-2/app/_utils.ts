// app/_utils.ts
import 'server-only';
import { headers } from 'next/headers';

export async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  // 절대 URL이면 그대로
  if (/^https?:\/\//i.test(path)) {
    const resAbs = await fetch(path, { cache: 'no-store', ...(init ?? {}) });
    if (!resAbs.ok) throw new Error(`GET ${path} ${resAbs.status}`);
    return resAbs.json() as Promise<T>;
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL;
  let url: string;
  if (base && /^https?:\/\//i.test(base)) {
    url = new URL(path, base).toString();
  } else {
    const h = headers();
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
    const proto = h.get('x-forwarded-proto') ?? 'http';
    url = `${proto}://${host}${path}`;
  }

  const res = await fetch(url, { cache: 'no-store', ...(init ?? {}) });
  if (!res.ok) throw new Error(`GET ${url} ${res.status}`);
  return res.json() as Promise<T>;
}

