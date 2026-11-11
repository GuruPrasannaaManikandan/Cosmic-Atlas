"""
Mars landing-site registry for the terrain pipeline (scripts/mars/build_site.py, locate_hardware.py).

Every terrain is a USGS Astrogeology analysis-ready, CONTROLLED HiRISE DTM (SOCET SET), found by a spatial search of the
USGS STAC catalogue (collection mro_hirise_socet_dtms) at the landing coordinate. `hardwareLatLon` starts as the sourced
catalogue landing site (frontend/src/missions/catalog/mars.ts) and is replaced by the position MEASURED in the controlled
HiRISE orthoimage once the hardware has been located there (see `located`).
"""
import json, urllib.request

R = 3396190.0  # Mars 2015 sphere (the ARD products' datum)
STAC = 'https://stac.astrogeology.usgs.gov/api/search'

SITES = {
    # M5: landers identified by eye in the USGS controlled orthoimages (scripts/mars/locate_hardware_fullres.py), measured in
    # that HiRISE/MOLA-controlled frame; the evidence is written into each site's registration note (site_defs.py).
    # The catalogue coordinates they replace: Viking 1 (22.269, 312.049), Pathfinder (19.095, 326.747) Folkner et al. 1997;
    # Spirit (-14.5692, 175.4729) Arvidson et al. 2004; Phoenix (68.22, 234.25) Smith et al. 2009 (all via PDS ODE).
    'viking-1': {'dtm': 'DTEEC_001521_2025_001719_2025_U01', 'hardwareLatLon': (22.272895, 312.048526), 'source': 'HiRISE-identified lander, PSP_001521_2025 controlled orthoimage (this project, M5)', 'located': True},
    'viking-2': {'dtm': 'DTEEC_002055_2280_001976_2280_A01', 'hardwareLatLon': (47.668, 134.28), 'source': 'PDS ODE (Folkner et al. 1997)'},
    'pathfinder': {'dtm': 'DTEEC_002391_1995_001890_1995_A01', 'hardwareLatLon': (19.073883, 326.741371), 'source': 'HiRISE-identified lander, PSP_001890_1995 controlled orthoimage (this project, M5)', 'located': True},
    'spirit': {'dtm': 'DTEEC_001513_1655_001777_1650_U01', 'hardwareLatLon': (-14.565818, 175.475472), 'source': 'HiRISE-identified lander, PSP_001513_1655 controlled orthoimage (this project, M5)', 'located': True},
    'phoenix': {'dtm': 'DTEPC_008591_2485_008644_2485_U01', 'hardwareLatLon': (68.217789, 234.249968), 'source': 'HiRISE-identified lander, PSP_008591_2485 controlled orthoimage (this project, M5)', 'located': True},
    # catalogue (-4.59, 137.44) PDS ODE (Seelos et al. 2014). The controlled pair predates the landing, so the rover was found in
    # the uncontrolled ESP_028401_1755 (17 Aug 2012) and carried into the controlled frame (scripts/mars/coregister_hirise.py)
    # The rover was found in the uncontrolled ESP_028401_1755 and co-registered to the controlled ortho ESP_018854_1755
    # (-4.590776, 137.444164 in that product's frame). The USGS HiRISE products here are offset from the CTX/MOLA-controlled
    # frame (ESP_018854 by 164 m E / 67 m S, PSP_010573 by 537 m E / 195 m S; phase correlation against the CTX controlled
    # ortho), so the origin is given in the CTX/MOLA frame (20 m from NASA's published 4.5895 S, 137.4417 E) and the
    # terrain product (PSP_010573: the only HiRISE DTM covering the rover) is sampled with its measured shift.
    'curiosity': {'dtm': 'DTEEC_010573_1755_010639_1755_U01', 'hardwareLatLon': (-4.589646, 137.441388), 'productShiftM': (537.0, -195.0),
                  'source': 'HiRISE-identified rover at Bradbury Landing (ESP_028401_1755), in the CTX/MOLA-controlled frame (this project, M5)', 'located': True},
    # NASA's "centered at about 4.5N 135.9E" is the landing ELLIPSE centre and lies outside this DTM. The lander itself was
    # located in HiRISE (6 Dec 2018): Golombek et al. 2020, Earth Space Sci., doi:10.1029/2020EA001248 (planetocentric;
    # JPL Horizons' 4.555681 N is the same point in planetographic latitude). RISE radio tracking is ~220 m west.
    'insight': {'dtm': 'DTEEC_037262_1845_036761_1845_U01', 'hardwareLatLon': (4.502384, 135.623447), 'source': 'Golombek et al. 2020 (HiRISE-located lander)'},
}


def stac_item(dtm_id: str) -> dict:
    body = json.dumps({'collections': ['mro_hirise_socet_dtms'], 'ids': [dtm_id]}).encode()
    req = urllib.request.Request(STAC, data=body, headers={'Content-Type': 'application/json', 'User-Agent': 'cosmic-atlas-terrain-pipeline'})
    fs = json.load(urllib.request.urlopen(req, timeout=60))['features']
    if not fs:
        raise LookupError(f'{dtm_id} not in USGS STAC')
    return fs[0]


def gdal_href(href: str) -> str:
    """
    GDAL reads the public USGS bucket over plain HTTP: on Windows its curl uses schannel, which fails the certificate
    revocation check for this host and retries for minutes. The objects are public, read-only NASA/USGS products.
    """
    return '/vsicurl/' + href.replace('https://astrogeo-ard.s3-us-west-2.amazonaws.com/', 'http://astrogeo-ard.s3-us-west-2.amazonaws.com/')


GDAL_ENV = {'GDAL_DISABLE_READDIR_ON_OPEN': 'EMPTY_DIR', 'GDAL_HTTP_TIMEOUT': '60', 'GDAL_HTTP_MAX_RETRY': '2', 'VSI_CACHE': 'TRUE'}


def _exists(href: str) -> bool:
    try:
        r = urllib.request.urlopen(urllib.request.Request(gdal_href(href)[len('/vsicurl/'):], method='HEAD'), timeout=30)
        return r.status == 200
    except Exception:
        return False


def dtm_href(item: dict) -> str:
    """
    The catalogue's 'dtm' href. Some STAC items (e.g. Viking 2, Pathfinder: the A01 products) list the DTM without its
    pair folder although the file is stored there, next to its orthoimages: fall back to that folder when the listed
    URL does not exist (checked with a HEAD request; the product itself is unchanged).
    """
    href = item['assets']['dtm']['href']
    if _exists(href):
        return href
    ortho = next((a['href'] for k, a in item['assets'].items() if 'ORTHO' in k.upper() and a['href'].lower().endswith('.tif')), None)
    if ortho:
        alt = ortho.rsplit('/', 1)[0] + '/' + href.rsplit('/', 1)[1]
        if _exists(alt):
            return alt
    return href


def ortho_href(item: dict, prefer: str = 'RED_A') -> str:
    # STAC asset keys differ between products: 'ortho_0' ... or the observation name ('PSP_..._RED_A_01_ORTHO')
    hrefs = [a['href'] for k, a in item['assets'].items()
             if (k.startswith('ortho_') or k.endswith('_ORTHO')) and 'thumbnail' not in k and 'label' not in k and a['href'].lower().endswith('.tif')]
    for h in hrefs:
        if prefer in h:
            return h
    return hrefs[0]
