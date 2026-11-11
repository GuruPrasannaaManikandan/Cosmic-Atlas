"""
M4 site definitions -> frontend/public/mars-sites/<site>/site.json (read by the Unity player's site mode and by the React
HUD). Run after build_site.py (it reads each terrain.json for the extent and checks that the hardware is on valid DTM).

Rules kept here:
- every date comes from the mission catalogue (frontend/src/missions/catalog/mars.ts, sourced facts);
- the main hardware sits at the site ORIGIN = the sourced coordinate in mars_sites.SITES (never moved for a better view);
- any secondary placement (a rover next to its lander) and every time of day is labelled ILLUSTRATIVE;
- each hardware entry states its model provenance class: NASA MODEL / DOCUMENTED RECONSTRUCTION / SIMPLIFIED MODEL.

  python -I scripts/mars/site_defs.py
"""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mars_sites import SITES  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / 'frontend' / 'public' / 'mars-sites'
TAU = {'tau': 0.5, 'tauLabel': 'tau 0.5 ASSUMED (no sourced optical depth for this sol in the scene)'}

MER_COMPONENTS = [
    {'id': 'mast', 'label': 'Pancam mast assembly (Pancam, Navcam, Mini-TES)', 'parts': ['mer:mast']},
    {'id': 'solar', 'label': 'Solar array', 'parts': ['mer:solar']},
    {'id': 'mobility', 'label': 'Rocker-bogie suspension and six wheels', 'parts': ['mer:mobility']},
    {'id': 'arm', 'label': 'Instrument deployment device (arm) and turret', 'parts': ['mer:arm']},
    {'id': 'hga', 'label': 'High-gain antenna', 'parts': ['mer:hga']},
    {'id': 'body', 'label': 'Warm electronics box', 'parts': ['mer:body']},
]

DEFS = {
    'viking-1': {
        'name': 'Viking 1 — Chryse Planitia', 'missionId': 'viking-1', 'mode': 'lander',
        'landing': {'utc': '1976-07-20T11:53:06Z', 'landingSol': 0, 'source': 'nssdca-viking1-lander', 'solNote': 'sol count from landing (convention: landing day = sol 0, not sourced here)'},
        'scene': {'date': '1976-07-20', 'ltst': 14.0, 'label': 'Landing day, 20 July 1976 (local time of day ILLUSTRATIVE)', **TAU},
        'hardware': [{
            'id': 'viking-1-lander', 'label': 'Viking 1 lander', 'model': 'glb:viking-lander', 'kind': 'lander', 'x': 0, 'z': 0, 'yawDeg': 0, 'radius': 1.9,
            'provenance': 'NASA MODEL (NASA 3D Resources: Viking Lander), scaled so the footpad triangle is 2.21 m (NSSDCA). Orientation ILLUSTRATIVE (not sourced). Component regions (mast head, turret, cameras...) are groups of the model\'s own triangles identified by this project (scripts/mars/model_views.py), not separate NASA parts.',
            'components': [
                {'id': 'cameras', 'label': 'Lander cameras', 'parts': ['region:cameras'], 'boxes': [[-0.36, 0.85, 0.26, -0.1, 1.3, 0.52], [-0.05, 0.85, -0.5, 0.19, 1.3, -0.24]]},
                {'id': 'sampler', 'label': 'Surface sampler arm', 'parts': ['region:sampler'], 'boxes': [[0.05, 0.4, -0.32, 1.8, 1.15, 0.06]]},
                {'id': 'met', 'label': 'Meteorology boom', 'parts': ['region:met'], 'boxes': [[-0.72, 1.08, 0.55, -0.38, 1.68, 1.28]]},
                {'id': 'hga', 'label': 'High-gain antenna', 'parts': ['region:hga'], 'boxes': [[-1.3, 1.1, -0.5, -0.8, 1.9, 0.0]]},
                {'id': 'legs', 'label': 'Landing legs and footpads', 'parts': ['region:legs'], 'boxes': [[-1.8, -0.05, -1.4, 1.8, 0.45, 1.4]]},
                {'id': 'body', 'label': 'Lander body (biology, GCMS, XRFS inside)', 'parts': ['region:body'], 'boxes': [[-1.0, 0.45, -0.8, 0.35, 1.0, 0.8]]},
            ],
        }],
        'start': {'x': 0, 'z': -24, 'headingDeg': 0},
    },
    'viking-2': {
        'name': 'Viking 2 — Utopia Planitia', 'missionId': 'viking-2', 'mode': 'lander',
        'landing': {'utc': '1976-09-03T12:00:00Z', 'landingSol': 0, 'source': 'nasa-viking-2', 'solNote': 'landing DATE sourced (time of day not sourced: noon UTC used for the sol count)'},
        'scene': {'date': '1976-09-03', 'ltst': 14.0, 'label': 'Landing day, 3 September 1976 (local time of day ILLUSTRATIVE)', **TAU},
        'hardware': [{
            'id': 'viking-2-lander', 'label': 'Viking 2 lander', 'model': 'glb:viking-lander', 'kind': 'lander', 'x': 0, 'z': 0, 'yawDeg': 0, 'radius': 1.9,
            'provenance': 'NASA MODEL (NASA 3D Resources: Viking Lander; Viking 1 and 2 were identical landers). Footpad triangle 2.21 m (NSSDCA). Orientation ILLUSTRATIVE. Component regions (mast head, turret, cameras...) are groups of the model\'s own triangles identified by this project (scripts/mars/model_views.py), not separate NASA parts.',
            'components': [
                {'id': 'cameras', 'label': 'Lander cameras', 'parts': ['region:cameras'], 'boxes': [[-0.36, 0.85, 0.26, -0.1, 1.3, 0.52], [-0.05, 0.85, -0.5, 0.19, 1.3, -0.24]]},
                {'id': 'sampler', 'label': 'Surface sampler arm', 'parts': ['region:sampler'], 'boxes': [[0.05, 0.4, -0.32, 1.8, 1.15, 0.06]]},
                {'id': 'met', 'label': 'Meteorology boom', 'parts': ['region:met'], 'boxes': [[-0.72, 1.08, 0.55, -0.38, 1.68, 1.28]]},
                {'id': 'hga', 'label': 'High-gain antenna', 'parts': ['region:hga'], 'boxes': [[-1.3, 1.1, -0.5, -0.8, 1.9, 0.0]]},
                {'id': 'legs', 'label': 'Landing legs and footpads', 'parts': ['region:legs'], 'boxes': [[-1.8, -0.05, -1.4, 1.8, 0.45, 1.4]]},
                {'id': 'body', 'label': 'Lander body (biology, GCMS, XRFS inside)', 'parts': ['region:body'], 'boxes': [[-1.0, 0.45, -0.8, 0.35, 1.0, 0.8]]},
            ],
        }],
        'start': {'x': 18, 'z': -18, 'headingDeg': -45},
    },
    'pathfinder': {
        'name': 'Mars Pathfinder and Sojourner — Ares Vallis', 'missionId': 'mars-pathfinder', 'mode': 'rover',
        'landing': {'utc': '1997-07-04T16:56:55Z', 'landingSol': 1, 'source': 'nssdca (impact 16:56:55 UT)', 'solNote': 'sol count from landing (convention not sourced here)'},
        'scene': {'date': '1997-07-06', 'ltst': 14.0, 'label': 'After Sojourner rolled onto the surface (NASA: 5 July 1997, US date; NSSDCA: ~05:40 UT 6 July). Local time ILLUSTRATIVE', **TAU},
        'hardware': [
            {'id': 'pathfinder-lander', 'label': 'Mars Pathfinder lander (Carl Sagan Memorial Station)', 'model': 'proc:pathfinder-lander', 'kind': 'lander', 'x': 0, 'z': 0, 'yawDeg': 0, 'radius': 2.4,
             'provenance': 'DOCUMENTED RECONSTRUCTION — NASA publishes no 3D model. Tetrahedral lander, three solar petals with 2.8 m² of cells, IMP camera ~1.5 m above the ground, 1 m meteorology mast (Mars Pathfinder Landing Press Kit; NSSDCA). Petal size derived from the cell area; ramps and airbags ILLUSTRATIVE.',
             'components': [
                 {'id': 'petals', 'label': 'Solar petals', 'parts': ['solar petal', 'base petal']},
                 {'id': 'imp', 'label': 'Imager for Mars Pathfinder (IMP) on its pop-up mast', 'parts': ['imp']},
                 {'id': 'met', 'label': 'Atmospheric structure / meteorology mast (ASI/MET)', 'parts': ['met mast']},
                 {'id': 'ramps', 'label': 'Rover ramps', 'parts': ['rover ramp']},
                 {'id': 'airbags', 'label': 'Retracted airbags', 'parts': ['airbags']},
             ]},
            {'id': 'sojourner', 'label': 'Sojourner rover', 'model': 'proc:sojourner', 'kind': 'rover', 'x': 0.3, 'z': 3.1, 'yawDeg': 10, 'radius': 0.5,
             'provenance': 'DOCUMENTED RECONSTRUCTION — NASA publishes no 3D model. 65 x 48 x 30 cm, 10.6 kg, six 13 cm wheels, rocker-bogie, 0.2 m² solar array, APXS (Mars Pathfinder Landing Press Kit; NSSDCA gives 63 x 48 x 28 cm, 10.5 kg). Position just off the ramp ILLUSTRATIVE.',
             'components': [
                 {'id': 'solar', 'label': 'Solar array (0.2 m²)', 'parts': ['solar']},
                 {'id': 'wheels', 'label': 'Six wheels and rocker-bogie', 'parts': ['wheel', 'rocker-bogie']},
                 {'id': 'apxs', 'label': 'Alpha proton X-ray spectrometer (APXS)', 'parts': ['apxs']},
                 {'id': 'cameras', 'label': 'Front stereo cameras', 'parts': ['cameras']},
             ]},
        ],
        'start': {'x': 30, 'z': 20, 'headingDeg': -120},
    },
    'spirit': {
        'name': 'Spirit (MER-A) — Gusev crater', 'missionId': 'mer-spirit', 'mode': 'rover',
        'landing': {'utc': '2004-01-04T04:35:00Z', 'landingSol': 1, 'source': 'nasa-mer-spirit (date); MER landing sol = Sol 1 (Mars24 notes)', 'solNote': 'catalogue gives the landing DATE as 3 January (US); the UTC time used for the sol count is ILLUSTRATIVE'},
        'scene': {'date': '2004-01-20', 'ltst': 14.0, 'label': 'Columbia Memorial Station, early mission: Spirit beside its lander after rolling off (date and offset ILLUSTRATIVE)', **TAU},
        'hardware': [
            {'id': 'spirit-rover', 'label': 'Spirit rover', 'model': 'mer', 'kind': 'rover', 'x': 3.4, 'z': 2.2, 'yawDeg': 35, 'radius': 1.4,
             'provenance': 'NASA MODEL (NASA 3D Resources articulated MER model; Spirit and Opportunity were twins), solar-panel span scaled to 2.25 m (PDS). Position beside the lander ILLUSTRATIVE.',
             'components': MER_COMPONENTS},
            {'id': 'spirit-lander', 'label': 'MER-A lander (Columbia Memorial Station)', 'model': 'proc:mer-lander', 'kind': 'lander', 'x': 0, 'z': 0, 'yawDeg': 0, 'radius': 2.2,
             'provenance': 'SIMPLIFIED MODEL — no NASA model of the MER lander exists. Base, three opened petals, deflated airbags and egress aids; shapes and dimensions ILLUSTRATIVE. Placed where the lander is identified in the HiRISE orthoimage.',
             'components': [{'id': 'petals', 'label': 'Lander petals', 'parts': ['base petal', 'side petal']}, {'id': 'airbags', 'label': 'Deflated airbags', 'parts': ['airbags']}]},
        ],
        'start': {'x': -40, 'z': -25, 'headingDeg': 60},
    },
    'phoenix': {
        'name': 'Phoenix — Vastitas Borealis', 'missionId': 'phoenix', 'mode': 'lander',
        'landing': {'utc': '2008-05-25T23:53:44Z', 'landingSol': 0, 'source': 'nssdca (23:53:44 UT); Phoenix landing sol = Sol 0 (Mars24 notes)', 'solNote': ''},
        'scene': {'date': '2008-05-26', 'ltst': 14.0, 'label': 'First days after landing, 25-26 May 2008 (arm pose and local time ILLUSTRATIVE)', **TAU},
        'hardware': [{
            'id': 'phoenix-lander', 'label': 'Phoenix lander', 'model': 'proc:phoenix', 'kind': 'lander', 'x': 0, 'z': 0, 'yawDeg': 0, 'radius': 2.9,
            'provenance': 'DOCUMENTED RECONSTRUCTION — NASA publishes no 3D model. Deck 1.5 m, solar-array span 5.52 m, robotic arm 2.35 m, top of the meteorology mast 2.2 m (NASA Phoenix press kit). Array outline many-sided (NSSDCA: "octagonal"; drawn with 10 sides, not sourced). Instrument positions SIMPLIFIED.',
            'components': [
                {'id': 'solar', 'label': 'Solar arrays (5.52 m span)', 'parts': ['solar']},
                {'id': 'arm', 'label': 'Robotic arm (2.35 m) and scoop', 'parts': ['arm']},
                {'id': 'tega', 'label': 'Thermal and Evolved Gas Analyzer (TEGA)', 'parts': ['tega']},
                {'id': 'meca', 'label': 'Microscopy, Electrochemistry and Conductivity Analyzer (MECA)', 'parts': ['meca']},
                {'id': 'ssi', 'label': 'Surface Stereo Imager (SSI)', 'parts': ['ssi']},
                {'id': 'met', 'label': 'Meteorological station (MET) mast', 'parts': ['met mast']},
                {'id': 'legs', 'label': 'Three landing legs', 'parts': ['legs']},
            ],
        }],
        'start': {'x': -16, 'z': -20, 'headingDeg': 40},
    },
    'curiosity': {
        'name': 'Curiosity — Gale crater (Bradbury Landing)', 'missionId': 'msl-curiosity', 'mode': 'rover',
        'landing': {'utc': '2012-08-06T05:17:57Z', 'landingSol': 0, 'source': 'nasa-msl-curiosity (date); MSL landing sol = Sol 0 (Mars24 notes)', 'solNote': 'UTC time of day used for the sol count is ILLUSTRATIVE'},
        'scene': {'date': '2012-08-06', 'ltst': 14.0, 'label': 'Bradbury Landing, landing day (local time ILLUSTRATIVE). Mount Sharp and the crater rim on the horizon from controlled CTX terrain', **TAU},
        'hardware': [{
            'id': 'curiosity-rover', 'label': 'Curiosity rover', 'model': 'glb:curiosity', 'kind': 'rover', 'x': 0, 'z': 0, 'yawDeg': 0, 'radius': 2.0,
            'provenance': 'NASA MODEL (NASA 3D Resources: Curiosity), scaled to the sourced 2.2 m height; its length measures 3.92 m vs 3.0 m sourced (+31 %: the model\'s arm pose extends it). Heading ILLUSTRATIVE. Component regions (mast head, turret, cameras...) are groups of the model\'s own triangles identified by this project (scripts/mars/model_views.py), not separate NASA parts.',
            'components': [
                {'id': 'turret', 'label': 'Arm turret (APXS, MAHLI, drill)', 'parts': ['region:turret'], 'boxes': [[-0.2, 1.3, -2.1, 1.0, 2.25, -1.35]]},
                {'id': 'arm', 'label': 'Robotic arm', 'parts': ['region:arm'], 'boxes': [[0.15, 0.6, -1.35, 0.8, 2.1, -0.88]]},
                {'id': 'mast-head', 'label': 'Mast head (Mastcam, ChemCam)', 'parts': ['region:mast-head'], 'boxes': [[-0.9, 1.72, -0.75, -0.1, 2.3, -0.1]]},
                {'id': 'mast', 'label': 'Remote sensing mast', 'parts': ['region:mast'], 'boxes': [[-0.9, 1.2, -0.75, -0.1, 1.72, -0.1]]},
                {'id': 'mmrtg', 'label': 'MMRTG (rear)', 'parts': ['region:mmrtg'], 'boxes': [[-0.42, 0.55, 1.05, 0.42, 1.55, 2.0]]},
                {'id': 'mobility', 'label': 'Wheels and rocker-bogie suspension', 'parts': ['region:mobility'], 'boxes': [[-1.45, -0.05, -1.1, -0.62, 1.0, 1.7], [0.62, -0.05, -1.1, 1.45, 1.0, 1.7]]},
                {'id': 'body', 'label': 'Body (CheMin, SAM inside)', 'parts': ['region:body'], 'boxes': [[-0.62, 0.55, -0.62, 0.62, 1.3, 1.05]]},
            ],
        }],
        'start': {'x': 35, 'z': 30, 'headingDeg': -130},
    },
    'insight': {
        'name': 'InSight — Elysium Planitia', 'missionId': 'insight', 'mode': 'lander',
        'landing': {'utc': '2018-11-26T19:52:59Z', 'landingSol': 0, 'source': 'nasa-insight', 'solNote': ''},
        'scene': {'date': '2019-02-13', 'ltst': 14.0, 'label': '13 February 2019, after deployment: SEIS under its Wind and Thermal Shield and HP3 on the ground in front of the lander (JPL). Offsets RECONSTRUCTED; lander heading ASSUMED; local time ILLUSTRATIVE', **TAU},
        'hardware': [{
            'id': 'insight-lander', 'label': 'InSight lander', 'model': 'glb:insight', 'kind': 'lander', 'x': 0, 'z': 0, 'yawDeg': 0, 'radius': 3.1,
            'provenance': 'NASA MODEL (NASA 3D Resources: InSight Cruise Lander), native metres. SEIS, its Wind and Thermal Shield and HP3 are moved from the deck (where the model stows them) to the ground in front of the lander, in their deployed configuration: SEIS about 1.636 m away, about as far as the arm reaches (JPL, 19 Dec 2018), the shield placed over it, HP3 on the east side of the workspace (JPL). RECONSTRUCTED offsets: the 1.636 m is taken from the deck centre and HP3 is placed 1 m east of SEIS (not sourced); lander heading ASSUMED with the workspace (the arm side) to the south. Position: HiRISE-located lander (Golombek et al. 2020).',
            'components': [
                {'id': 'seis', 'label': 'Seismic Experiment for Interior Structure (SEIS)', 'parts': ['SEIS'], 'deployTo': [0.0, -1.876]},
                {'id': 'wts', 'label': 'Wind and Thermal Shield (WTS) for SEIS', 'parts': ['WTS'], 'deployTo': [0.0, -1.876]},
                {'id': 'hp3', 'label': 'Heat Flow and Physical Properties Package (HP3)', 'parts': ['HP3'], 'deployTo': [1.0, -1.876]},
                {'id': 'arm', 'label': 'Instrument Deployment Arm and grapple', 'parts': ['arm_', 'grapple', 'claw_', 'shovel']},
                {'id': 'idc', 'label': 'Instrument Deployment Camera (IDC)', 'parts': ['IDC', 'lens_cap_IDC']},
                {'id': 'icc', 'label': 'Instrument Context Camera (ICC)', 'parts': ['ICC', 'lens_cap_ICC']},
                {'id': 'solar', 'label': 'Solar arrays', 'parts': ['panel_']},
                {'id': 'rise', 'label': 'RISE antennas (Rotation and Interior Structure Experiment)', 'parts': ['RISE']},
                {'id': 'twins', 'label': 'TWINS weather sensors', 'parts': ['TWINS']},
                {'id': 'uhf', 'label': 'UHF antenna', 'parts': ['UHF']},
            ],
        }],
        'start': {'x': 20, 'z': -22, 'headingDeg': -40},
    },
}

# M5 registration evidence (what was seen, where, and how far the identified lander lies from the catalogue coordinate)
REGISTRATION = {
    'viking-1': 'Lander identified by eye in the USGS controlled orthoimage PSP_001521_2025 (22 Nov 2006, the frame in which the HiRISE team located it): a bright lander with its shadow just south-east of a shallow crater, matching the HiRISE team\'s annotated cutouts (uahirise.org/PSP_001521_2025). Measured in this controlled frame; 231 m north and 26 m west of the catalogue coordinate (22.269 N, 312.049 E; Folkner et al. 1997).',
    'pathfinder': 'Lander identified by eye in the USGS controlled orthoimage PSP_001890_1995: a bright object with its shadow about 1.95 km south of North Knob and 1 km east-north-east of Twin Peaks, with the bright backshell/parachute 260 m to the south-south-east, as in the HiRISE team\'s annotated images (uahirise.org/PSP_001890_1995). Measured in this controlled frame; 1.25 km south and 315 m west of the catalogue coordinate (19.095 N, 326.747 E; Folkner et al. 1997). Sojourner\'s position beside the lander is ILLUSTRATIVE.',
    'spirit': 'Lander identified by eye in the USGS controlled orthoimage PSP_001513_1655: a bright, petalled object about 3 m across, 400 m south-west of the centre of Bonneville crater (the HiRISE team\'s area "B", uahirise.org/PSP_001513_1655). Measured in this controlled frame; 200 m north and 148 m east of the catalogue coordinate (14.5692 S, 175.4729 E; Arvidson et al. 2004). The rover beside the lander is the early-mission scene (offset ILLUSTRATIVE); in this 2006 image Spirit itself was 3 km away at Home Plate.',
    'phoenix': 'Lander identified by eye in the USGS controlled orthoimage PSP_008591_2485 (taken 22 hours after landing): the bright lander deck at the centre of the ~25 m dark zone scoured by its descent engines; a second dark spot with a streak ~200 m away is consistent with the heat shield (uahirise.org/PSP_008591_2485). Measured in this controlled frame; 131 m south of the catalogue coordinate (68.22 N, 234.25 E; Smith et al. 2009).',
    'insight': 'HiRISE-located lander position (Golombek et al. 2020); RISE radio tracking places it ~220 m further west.',
    'curiosity': 'Rover identified by eye in HiRISE ESP_028401_1755 (17 Aug 2012, eleven days after landing and five days before the first drive): a ~3 m object at the centre of the X-shaped scour left by the engines of the sky crane. That observation is uncontrolled, so its position was carried into controlled products by phase correlation of the surrounding terrain (consistent to ~2 m over nine sub-areas). The USGS HiRISE products here turned out to be offset from the CTX/MOLA-controlled frame (ESP_018854_1755 by 177 m, PSP_010573_1755 by 571 m, measured against the CTX controlled orthoimage), so the position is given in the CTX/MOLA frame: 20 m from NASA’s published Bradbury Landing coordinate (4.5895 S, 137.4417 E) and 85 m from the catalogue coordinate (4.59 S, 137.44 E; Seelos et al. 2014). The terrain under the rover is PSP_010573_1755 (2008, the only controlled HiRISE DTM covering this spot), sampled with its measured shift; being pre-landing, its ground image shows no blast marks.',
}
NOT_LOCATED = 'Catalogue coordinate; the hardware has NOT been identified in the HiRISE orthoimage yet (Utopia Planitia\'s boulder field hides a 3 m lander in this frame). Historical coordinate frames can differ from the HiRISE/MOLA-controlled frame by up to hundreds of metres, so the true spot may be elsewhere in this terrain or beyond it.'

for sid, d in DEFS.items():
    s = SITES[sid]
    lat, lon = s['hardwareLatLon']
    t = json.loads((OUT / sid / 'terrain.json').read_text())
    doc = {
        'id': sid, **{k: v for k, v in d.items()},
        'origin': {'latDeg': lat, 'lonEastDeg': lon if lon <= 180 else lon - 360, 'source': s['source'],
                   'registration': REGISTRATION.get(sid, NOT_LOCATED), 'located': bool(s.get('located')) or sid == 'insight'},
        'terrain': {'dtm': t['source'], 'spacingM': t['spacingM'][0], 'sizeM': (t['width'] - 1) * t['spacingM'][0], 'validFraction': round(t['validCells'] / t['cells'], 3),
                    'albedo': 'HiRISE orthoimage (RED band, single channel) at 0.5 m, colourised with an ILLUSTRATIVE soil ramp',
                    'horizon': 'same DTM, decimated to ~24 m, out to ~9 km where the DTM covers it',
                    **({'far': {k: fj[k] for k in ('source', 'spacingM', 'datumOffsetM', 'datumResidualP90M', 'provenance')} | {'extentKm': round(fj['width'] * fj['spacingM'][0] / 1000), 'albedo': fj.get('albedo', {}).get('source'), 'validFraction': round(fj['validCells'] / fj['cells'], 3)}}
                       if (fj := (json.loads((OUT / sid / 'far.json').read_text()) if (OUT / sid / 'far.json').exists() else None)) else {})},
    }
    (OUT / sid / 'site.json').write_text(json.dumps(doc, indent=1), encoding='utf-8')
    print(sid, 'ok', doc['terrain']['validFraction'])
