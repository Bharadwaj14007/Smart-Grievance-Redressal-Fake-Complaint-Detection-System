import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

const nextConfig = {
  outputFileTracingRoot: path.join(root, '..'),
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return []
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000'
    return [{ source: '/api/v1/:path*', destination: `${backendUrl}/api/v1/:path*` }]
  },
}

export default nextConfig
