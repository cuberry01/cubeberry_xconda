import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 서버를 프리뷰 프록시(다른 호스트)로 열 때 /_next/* 요청이 차단되지 않도록 허용합니다.
  allowedDevOrigins: ["*.e2b.app", "*.arena.ai", "localhost", "127.0.0.1"],
};

export default nextConfig;
