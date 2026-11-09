"""
Static server for the Unity WebGL build with the MIME types Unity's loader needs (application/wasm etc.).
The build is uncompressed (WebGLBuild.cs sets compression Disabled), so no Content-Encoding headers are required.

Usage: python scripts/e2e/serve_unity_webgl.py --dir unity/CosmicAtlas/Builds/WebGL --port 8091
"""
import argparse
import functools
import http.server
import mimetypes

mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/octet-stream", ".data")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".wasm": "application/wasm", ".js": "application/javascript", ".data": "application/octet-stream"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="unity/CosmicAtlas/Builds/WebGL")
    ap.add_argument("--port", type=int, default=8091)
    a = ap.parse_args()
    http.server.ThreadingHTTPServer(("127.0.0.1", a.port), functools.partial(Handler, directory=a.dir)).serve_forever()


if __name__ == "__main__":
    main()
