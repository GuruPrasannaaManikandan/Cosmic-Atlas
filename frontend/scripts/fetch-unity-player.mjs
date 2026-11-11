// Fetch the pinned Unity WebGL players (unity-player.json) into the Unity Builds folder when a checkout has none.
//
// The players are ~100 MB generated artefacts kept out of git (unity/.gitignore), so a clean clone — the Render build —
// has no unity/CosmicAtlas/Builds/MarsExplorer/Build and `vite build` would ship dist/ without /unity/mars/. This runs
// before `vite build` (npm run build): a checkout that already has a local Unity build is left untouched; otherwise the
// pinned player is downloaded from its GitHub release (gzipped), size- and sha256-checked, and given the recorded
// modification times so vite's build-info.json reports the same player id as the build that was validated.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'unity-player.json'), 'utf8'))

for (const [name, p] of Object.entries(manifest.players)) {
  const dir = path.resolve(FRONTEND, p.dir)
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) {
    console.log(`[unity] ${name}: using the local Unity build at ${dir} (not downloading pinned player ${p.id})`)
    continue
  }
  console.log(`[unity] ${name}: no local Unity build; downloading pinned player ${p.id}`)
  const tmp = dir + '.download'
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(tmp, { recursive: true })
  for (const f of p.files) {
    const url = p.baseUrl + f.name + '.gz'
    const res = await fetch(url)
    if (!res.ok) throw new Error(`[unity] ${name}: GET ${url} -> HTTP ${res.status}`)
    const data = zlib.gunzipSync(Buffer.from(await res.arrayBuffer()))
    const sha = createHash('sha256').update(data).digest('hex')
    if (data.length !== f.bytes || sha !== f.sha256)
      throw new Error(`[unity] ${name}: ${f.name} mismatch (${data.length} bytes, sha256 ${sha}; expected ${f.bytes}, ${f.sha256})`)
    const out = path.join(tmp, f.name)
    fs.writeFileSync(out, data)
    const t = new Date(f.modified)
    fs.utimesSync(out, t, t)
    console.log(`[unity] ${name}: ${f.name} ok (${f.bytes} bytes)`)
  }
  fs.mkdirSync(path.dirname(dir), { recursive: true })
  fs.rmSync(dir, { recursive: true, force: true })
  fs.renameSync(tmp, dir)
  console.log(`[unity] ${name}: player ${p.id} ready at ${dir}`)
}
