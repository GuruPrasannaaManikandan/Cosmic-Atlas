import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/**
 * Unity WebGL players embedded in the app (Mars). The builds are large generated artefacts (~90 MB) and stay out of
 * git (unity/.gitignore): in dev they are served straight from the Unity project's Builds folder at /unity/<name>/,
 * and `vite build` copies them into dist/unity/<name>/ when present (a warning says when one is missing, so a deploy
 * without the Unity build still serves the rest of the app and the Mars entry shows a clear message instead).
 */
const UNITY_BUILDS: Record<string, string> = { mars: '../unity/CosmicAtlas/Builds/MarsExplorer' }

const MIME: Record<string, string> = { '.wasm': 'application/wasm', '.js': 'application/javascript', '.data': 'application/octet-stream', '.json': 'application/json' }

function unityBuilds(): Plugin {
  return {
    name: 'cosmic-atlas-unity-builds',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/unity\/([a-z0-9-]+)\/(.+)$/.exec((req.url ?? '').split('?')[0])
        if (!m || !UNITY_BUILDS[m[1]]) return next()
        const root = path.resolve(HERE, UNITY_BUILDS[m[1]])
        const file = path.resolve(root, decodeURIComponent(m[2]))
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          res.statusCode = 404
          return res.end(`Unity build file not found: ${m[2]} (build the player first: see unity/README or MarsPrototypeBuild.cs)`)
        }
        let inner = file
        if (file.endsWith('.br')) { res.setHeader('Content-Encoding', 'br'); inner = file.slice(0, -3) }
        else if (file.endsWith('.gz')) { res.setHeader('Content-Encoding', 'gzip'); inner = file.slice(0, -3) }
        res.setHeader('Content-Type', MIME[path.extname(inner)] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Content-Length', String(fs.statSync(file).size))
        fs.createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      if (process.env.VITEST || this.meta.watchMode) return // only a real production build copies the players
      for (const [name, rel] of Object.entries(UNITY_BUILDS)) {
        const src = path.resolve(HERE, rel, 'Build')
        if (!fs.existsSync(src)) {
          console.warn(`[unity] ${name}: no build at ${src}; /unity/${name}/ will be missing from dist`)
          continue
        }
        const dst = path.resolve(HERE, 'dist', 'unity', name, 'Build')
        fs.mkdirSync(dst, { recursive: true })
        for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dst, f))
        console.log(`[unity] ${name}: copied ${fs.readdirSync(src).length} files to dist/unity/${name}/Build`)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), unityBuilds()],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8000' } },
  test: { environment: 'node' },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three') || id.includes('@react-three')) {
              return 'vendor-three'
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
})
