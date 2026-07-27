import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Deliberately no Nitro. TanStack's own Bun example builds with plain
 * `vite build` and serves the output from a Bun server (`server.ts`), which
 * keeps the whole repo on one runtime and avoids depending on `nitro@3`, still
 * a beta. `vite build` emits `dist/client` and `dist/server/server.js`.
 *
 * `resolve.tsconfigPaths` is Vite's built-in reader for the `paths` block in
 * tsconfig.json — the separate `vite-tsconfig-paths` plugin is not needed.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 3001,
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
})
