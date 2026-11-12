/* Must be the first import in main.ts.
 *
 * On Vercel the compiled API (apps/api/dist) is moved to the function root, while its dependencies keep
 * their repository paths (apps/api/node_modules → node_modules/.pnpm). From the root, Node can't find
 * them, so add that folder to the module search path. Everywhere else the folder doesn't exist next to
 * this file and nothing changes. */
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import Module from 'node:module';

const moved = join(__dirname, 'apps', 'api', 'node_modules');
if (existsSync(moved)) {
  process.env.NODE_PATH = [moved, process.env.NODE_PATH].filter(Boolean).join(delimiter);
  (Module as unknown as { _initPaths: () => void })._initPaths();
}
