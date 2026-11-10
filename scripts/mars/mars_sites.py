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
    'viking-1': {'dtm': 'DTEEC_001521_2025_001719_2025_U01', 'hardwareLatLon': (22.269, 312.049), 'source': 'PDS ODE (Folkner et al. 1997)'},
    'viking-2': {'dtm': 'DTEEC_002055_2280_001976_2280_A01', 'hardwareLatLon': (47.668, 134.28), 'source': 'PDS ODE (Folkner et al. 1997)'},
    'pathfinder': {'dtm': 'DTEEC_002391_1995_001890_1995_A01', 'hardwareLatLon': (19.095, 326.747), 'source': 'PDS ODE (Folkner et al. 1997)'},
    'spirit': {'dtm': 'DTEEC_001513_1655_001777_1650_U01', 'hardwareLatLon': (-14.5692, 175.4729), 'source': 'PDS ODE (Arvidson et al. 2004), landing site'},
    'phoenix': {'dtm': 'DTEPC_008591_2485_008644_2485_U01', 'hardwareLatLon': (68.22, 234.25), 'source': 'PDS ODE (Smith et al. 2009)'},
    'curiosity': {'dtm': 'DTEEC_018854_1755_018920_1755_U01', 'hardwareLatLon': (-4.59, 137.44), 'source': 'PDS ODE (Seelos et al. 2014)'},
    'insight': {'dtm': 'DTEEC_037262_1845_036761_1845_U01', 'hardwareLatLon': (4.5, 135.9), 'source': 'NASA (approximate: "centered at about")'},
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


def dtm_href(item: dict) -> str:
    return item['assets']['dtm']['href']


def ortho_href(item: dict, prefer: str = 'RED_A') -> str:
    hrefs = [a['href'] for k, a in item['assets'].items() if k.startswith('ortho_') and a['href'].endswith('.tif')]
    for h in hrefs:
        if prefer in h:
            return h
    return hrefs[0]
