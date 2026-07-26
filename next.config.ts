import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Dev only: allow other machines on the LAN (event setup / phone testing) to
  // load dev assets and the HMR websocket. Next blocks cross-origin dev
  // requests by default, which made LAN access half-load the page.
  allowedDevOrigins: ["192.168.0.92", "*.local"],
};

export default nextConfig;
