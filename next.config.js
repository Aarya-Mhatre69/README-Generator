/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Fix 8: Disable proxy buffering so SSE tokens stream immediately
        source: "/api/generate",
        headers: [{ key: "X-Accel-Buffering", value: "no" }],
      },
    ];
  },
};

module.exports = nextConfig;
