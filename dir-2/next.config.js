/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Influx 클라가 외부 패키지를 서버 컴포넌트에서 쓸 때 필요할 수 있음
    serverComponentsExternalPackages: ['@influxdata/influxdb-client'],
  },
  // 정적 페이지 생성 타임아웃 감소 (기본값 60초로 복원)
  staticPageGenerationTimeout: 60,
  // 컴파일러 최적화
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  // 이미지 최적화
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
  },
  // 압축 활성화
  compress: true,
  // 프로덕션 빌드 최적화
  swcMinify: true,
  // 성능 향상: 큰 의존성은 외부화
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // 클라이언트 번들 크기 최적화
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};
module.exports = nextConfig;
