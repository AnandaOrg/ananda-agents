import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// The browser only ever calls the relative /api, so it talks to one origin and the session cookie stays
// first-party. On Vercel the project's top-level rewrite sends /api/* straight to the `api` service
// before Next sees it. Under `pnpm dev` and in Docker, Next proxies it to the NestJS API instead.
const API = process.env.API_URL ?? 'http://localhost:4020';

const config: NextConfig = {
  // The Docker image runs the self-contained server; `next start` locally keeps the default output.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@ananda-agents/shared'],
  async rewrites() {
    if (process.env.VERCEL) return [];
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
};

export default createNextIntlPlugin('./i18n/request.ts')(config);
