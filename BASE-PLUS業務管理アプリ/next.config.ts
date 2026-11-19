import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 開発時の「N」マークがスマホ下部メニューに重なるため非表示
  devIndicators: false,
};

export default nextConfig;
