# Unity WebGL Diagnostics (2026-11-09)

## Build

| Item | Value |
|---|---|
| Editor / target | Unity 6000.3.28f1, URP 17.3.0, WebGL 2 (OpenGL ES 3), IL2CPP, linear colour |
| Build command | `Unity.exe -batchmode -projectPath A:\CA\unity\CosmicAtlas -executeMethod CosmicAtlas.Rendering.Editor.WebGLBuild.Build -outDir …\Builds\WebGL` |
| Last build | **Exit 0**, `Result: Success`, 0 errors. All 20 warnings are unused URP Terrain shaders. |
| Output | `index.html` (AtlasMinimal template), `Build/WebGL.loader.js` 26,983 B, `WebGL.framework.js` 458,814 B, `WebGL.wasm` 56,206,082 B, `WebGL.data` 24,495,870 B. Total **81.2 MB uncompressed.** |
| Compression | Disabled on purpose for local serving (no Content-Encoding needed). **Brotli size not measured (open item).** |
| Stripping protection | `link.xml` preserves `CosmicAtlas.Astro` and `CosmicAtlas.Rendering`. Verified at runtime: catalogue schema 1, 79 objects, 54 solar bodies, Earth elements deserialised. |
| Dynamic shaders | 9 `Shader.Find` shaders force-included. Verified at runtime: `missingShaders: []`. |

## Loader / MIME / CORS / cache

| Check | Result |
|---|---|
| MIME | `.wasm` → `application/wasm`, Content-Length present, same-origin (no CORS needed), `Cache-Control: no-store` |
| Load paths, **Chrome 156** | file:// → clear "serve over HTTP" message · first visit OK · reload via UnityCache 304 OK · **hard refresh (HTTP cache disabled) OK** · **clean profile (incognito-equivalent) OK** · index.html without `Build/` → "…WebGL.loader.js (HTTP 404)". **6/6.** |
| Load paths, **Edge 157** (second browser) | Same six cases, **6/6** |
| 304 + `net::ERR_ABORTED` on `WebGL.data` | Not a failure: Unity's IndexedDB cache revalidates the file and aborts the redundant body; the instance starts. |
| Error reporting | The template sets `window.__atlasError` and a visible message for: no WebGL 2, non-HTTP origin, missing loader (URL + status), Unity `showBanner` errors, unhandled load rejections. **No silent black canvas.** |

## Bridge / runtime (Chromium; `unity_webgl_check.py`)

10/10 checks pass:
- instance creation;
- Unity → JS ready message and frame statistics;
- JS → Unity station and tier round trip echoed (30 combinations, Low/Medium/High);
- malformed input ignored;
- shaders present;
- catalogue intact;
- 10 stations;
- 0 console errors;
- WebGL-disabled failure path.

| Metric | Value |
|---|---|
| Load | 6.1 s |
| WASM heap | 166 MB, constant across all switches |
| JS heap | 39–47 MB |

The Unity console messages "Hidden/CoreSRP/CoreCopy … not supported on this GPU" (also StencilDitherMaskSeed and HDRDebugView) are URP-internal debug and utility shaders without WebGL variants. They are reported by Unity's own startup and do not affect rendering: no pink materials, and all screenshots are correct.

## Scene and shader quality (from the M2 validation)

- **Black hole:** RK4 orbit-equation integrator; ≤ 0.3 % against the exact Schwarzschild deflection at every tier; shadow edge 0.001 %; photon rings n = 1, 2 exact.
- **Nebula:** baked noise plus detail octaves; Medium 12.9 ms vs 124 ms before.
- **Pulsar:** dipole field lines; the pulse geometry is tested.

## Not done

- Unity Frame Debugger / Profiler capture: no interactive Editor; the Unity MCP bridge is not connected.
- The Unity build is not integrated into the React site (deliberately).
