import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['ffmpeg-static'],
  allowedDevOrigins: ["127.0.0.1", "localhost:3000", "127.0.0.1:3000"],
};

export default nextConfig;