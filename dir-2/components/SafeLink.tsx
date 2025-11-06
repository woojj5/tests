'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

export default function SafeLink(
  { href, children, className }:{
    href: string;
    children: ReactNode;
    className?: string;
  }
) {
  return <Link href={href} className={className ?? 'underline'}>{children}</Link>;
}
