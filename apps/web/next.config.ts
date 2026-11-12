import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Locally the web app proxies /api/* to the NestJS API, so the browser talks to one origin and the
// session cookie stays first-party.
const API = process.env.API_URL ?? 'http://localhost:4020';

const config: NextConfig = {
  // The Docker image runs the self-contained server; `next start` locally keeps the default output.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@ananda-agents/shared'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
};

export default createNextIntlPlugin('./i18n/request.ts')(config);
