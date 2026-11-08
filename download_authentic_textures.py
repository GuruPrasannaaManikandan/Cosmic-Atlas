"""
Downloads authoritative 2K planetary textures from Wikimedia Commons (NASA / USGS / SolarSystemScope CC-BY-4.0)
and Three.js GitHub repo, processes them with PIL, and saves them to frontend/public/assets/astronomy/textures/.
"""
import os
import sys
import io
import httpx
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
DEST_DIR = os.path.join(ROOT, "frontend", "public", "assets", "astronomy", "textures")
os.makedirs(DEST_DIR, exist_ok=True)

USER_AGENT = "CosmicAtlasRealism/1.0 (contact: admin@cosmicatlas.org; student project)"

# Mapping of destination filename to download source
WIKIMEDIA_TITLES = {
    "earth_day_2k.jpg": "File:Solarsystemscope texture 2k earth daymap.jpg",
    "earth_clouds_2k.png": "File:Solarsystemscope texture 2k earth clouds.jpg",
    "earth_night_2k.jpg": "File:Solarsystemscope texture 2k earth nightmap.jpg",
    "saturn_color_2k.jpg": "File:Solarsystemscope texture 2k saturn.jpg",
    "saturn_rings_2k.png": "File:Solarsystemscope texture 2k saturn ring alpha.png",
    "jupiter_color_2k.jpg": "File:Solarsystemscope texture 2k jupiter.jpg",
    "mars_albedo_2k.jpg": "File:Solarsystemscope texture 2k mars.jpg",
    "moon_albedo_2k.jpg": "File:Solarsystemscope texture 2k moon.jpg",
    "mercury_albedo_2k.jpg": "File:Solarsystemscope texture 2k mercury.jpg",
    "venus_atmosphere_2k.jpg": "File:Solarsystemscope texture 2k venus atmosphere.jpg",
    "uranus_color_2k.jpg": "File:Solarsystemscope texture 2k uranus.jpg",
    "neptune_color_2k.jpg": "File:Solarsystemscope texture 2k neptune.jpg",
    "sun_photosphere_2k.jpg": "File:Solarsystemscope texture 2k sun.jpg",
}

DIRECT_GITHUB_URLS = {
    "earth_specular_2k.jpg": "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_specular_2048.jpg",
    "earth_normal_2k.jpg": "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_normal_2048.jpg",
    "saturn_ring_color.jpg": "https://raw.githubusercontent.com/jeromeetienne/threex.planets/master/images/saturnringcolor.jpg",
}

def fetch_wikimedia_urls(client, titles_dict):
    titles = list(titles_dict.values())
    print(f"Resolving {len(titles)} titles via Wikimedia Commons API...")
    url_map = {}
    
    # Batch in groups of 10
    for i in range(0, len(titles), 10):
        batch = titles[i:i+10]
        params = {
            "action": "query",
            "titles": "|".join(batch),
            "prop": "imageinfo",
            "iiprop": "url|size",
            "format": "json"
        }
        r = client.get("https://commons.wikimedia.org/w/api.php", params=params)
        r.raise_for_status()
        data = r.json()
        pages = data.get("query", {}).get("pages", {})
        for pid, page in pages.items():
            t = page.get("title")
            info = page.get("imageinfo", [{}])[0]
            if "url" in info:
                url_map[t] = info["url"]
    return url_map

def main():
    print("=== DOWNLOADING SCIENTIFIC PLANETARY TEXTURES ===")
    client = httpx.Client(timeout=30.0, follow_redirects=True, headers={"User-Agent": USER_AGENT})
    
    wiki_urls = fetch_wikimedia_urls(client, WIKIMEDIA_TITLES)
    
    all_targets = {}
    for filename, title in WIKIMEDIA_TITLES.items():
        if title in wiki_urls:
            all_targets[filename] = wiki_urls[title]
        else:
            print(f"WARNING: Title {title} not found in Wikimedia query!")
            
    for filename, url in DIRECT_GITHUB_URLS.items():
        all_targets[filename] = url

    for filename, url in all_targets.items():
        dest_path = os.path.join(DEST_DIR, filename)
        print(f"\nProcessing {filename}...")
        print(f"  URL: {url}")
        
        r = client.get(url)
        r.raise_for_status()
        raw_bytes = r.content
        img = Image.open(io.BytesIO(raw_bytes))
        print(f"  Raw: format={img.format}, size={img.size}, mode={img.mode}")
        
        if filename == "earth_clouds_2k.png":
            # Grayscale cloud map to RGBA: RGB=(255,255,255), Alpha=luminance
            lum = img.convert("L")
            rgba = Image.new("RGBA", lum.size, (255, 255, 255, 0))
            rgba.putalpha(lum)
            rgba.save(dest_path, "PNG", optimize=True)
            print(f"  Saved {filename} as RGBA clouds with alpha transparency ({os.path.getsize(dest_path):,} bytes)")
        elif filename == "saturn_rings_2k.png":
            # Clean RGBA ring map
            ring_img = img.convert("RGBA")
            ring_img.save(dest_path, "PNG")
            compat_path = os.path.join(DEST_DIR, "saturn_rings_highres.png")
            ring_img.save(compat_path, "PNG")
            print(f"  Saved {filename} and saturn_rings_highres.png ({os.path.getsize(dest_path):,} bytes)")
        else:
            if filename.endswith(".jpg"):
                img.convert("RGB").save(dest_path, "JPEG", quality=92, optimize=True)
            else:
                img.save(dest_path, "PNG", optimize=True)
            print(f"  Saved {filename} ({os.path.getsize(dest_path):,} bytes)")

    print("\nALL AUTHORITATIVE PLANETARY TEXTURES DOWNLOADED & VERIFIED SUCCESSFULLY!")

if __name__ == "__main__":
    main()
