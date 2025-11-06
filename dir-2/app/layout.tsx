// app/layout.tsx
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'AICar Dashboard',
  description: 'InfluxDB-based EV analytics dashboard',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const sidebarWidth = 220;

  return (
    <html lang="ko">
      <body style={{ margin: 0 }}>
        {/* 왼쪽 고정 사이드바 */}
        <aside
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            height: '100vh',
            width: sidebarWidth,
            boxSizing: 'border-box',
            padding: '20px 16px',
            background: '#0b0b0c', // 다크 배경
            borderRight: '1px solid #2a2a2e',
            color: '#e5e7eb',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 16 }}>AICar Dashboard</div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <a href="/" style={linkStyle}>홈</a>
            <a href="/analysis" style={linkStyle}>개괄 분석</a>
            <a href="/ranking" style={linkStyle}>랭킹</a>
            <a href="/vehicle-details" style={linkStyle}>디바이스 목록</a>
            {/* 🔹 추가: 이상치 분석 */}
            <a href="/outliers" style={linkStyle}>이상치 분석</a>
            <a href="/missing" style={linkStyle}>결측치</a>   {/* ← 추가 */}
            <a href="/metrics-pca" style={linkStyle}>K-Means 분석</a>
          </nav>
        </aside>

        {/* 본문 영역 (사이드바 폭만큼 여백) */}
        <main
          style={{
            marginLeft: sidebarWidth,
            padding: 16,
            minHeight: '100vh',
            background: '#ffffff',
            color: '#000000',
          }}
        >
          {children}
        </main>
      </body>
    </html>
  );
}

// 사이드바 링크 공통 스타일
const linkStyle: React.CSSProperties = {
  display: 'block',
  padding: '10px 12px',
  borderRadius: 8,
  color: '#c7d2fe', // 연보라
  textDecoration: 'none',
  fontWeight: 600,
  background: 'transparent',
};
