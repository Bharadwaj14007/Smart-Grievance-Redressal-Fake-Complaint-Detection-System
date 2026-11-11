import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '..'),
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000'
    return [{ source: '/api/v1/:path*', destination: `${backendUrl}/api/v1/:path*` }]
  },
}

export default nextConfig
