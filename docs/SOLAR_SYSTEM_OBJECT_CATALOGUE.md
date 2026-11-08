# COSMIC ATLAS — Solar System Object Catalogue

An authoritative, data-driven catalogue of the 54 individual celestial bodies added in the Solar System scientific expansion, along with the 10,842-body Main Asteroid Belt population. Every numerical parameter originates from peer-reviewed publications and official NASA/JPL/IAU planetary databases; no value has been invented or filled with placeholder estimates.

---

## 1. Overview and Primary Source Provenance

| Source Identifier | Authoritative Source / Citation | Description |
|---|---|---|
| **JPL-SAT-ELEM** | NASA/JPL Solar System Dynamics Group ([ssd.jpl.nasa.gov/sats/elem/](https://ssd.jpl.nasa.gov/sats/elem/)) | Planetary Satellite Mean Orbital Elements (Jacobson et al., SAT441, URA115, NEP097, PLU060). |
| **JPL-SAT-PHYS** | NASA/JPL Solar System Dynamics Group ([ssd.jpl.nasa.gov/sats/phys_par/](https://ssd.jpl.nasa.gov/sats/phys_par/)) | Planetary Satellite Physical Parameters (radii, GM, bulk density, triaxial dimensions). |
| **JPL-SBDB** | NASA/JPL Small-Body Database API ([ssd-api.jpl.nasa.gov/sbdb.api](https://ssd-api.jpl.nasa.gov/sbdb.api)) | Osculating Keplerian elements and physical parameters for dwarf planets and numbered asteroids. |
| **IAU-2015** | Archinal et al. (2018), *Celest. Mech. Dyn. Astr.* 130:22 | Report of the IAU/IAG Working Group on Cartographic Coordinates and Rotational Elements: 2015. |
| **HORIZONS** | NASA/JPL Horizons Ephemerides System ([ssd.jpl.nasa.gov/horizons/](https://ssd.jpl.nasa.gov/horizons/)) | State vectors and validation benchmarks across J2000.0 to 2026. |

---

## 2. Mars Satellite System

| ID | Name | Parent | Mean Radius $R$ (km) | Triaxial Shape $a \times b \times c$ (km) | Density ($\text{g/cm}^3$) | Semi-major Axis $a$ (km) | Eccentricity $e$ | Inclination $i$ (deg) | Orbital Period $P$ | Rotation Model | Surface Map / Texture |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `phobos` | Phobos (Mars I) | Mars | 11.26 ± 0.05 | 13.0 × 11.4 × 9.1 | 1.860 | 9,376 | 0.0151 | 1.075° | 0.3189 d (7.65 h) | Synchronous | USGS / Viking Orbiter (`ss_phobos`) |
| `deimos` | Deimos (Mars II) | Mars | 6.20 ± 0.05 | 7.8 × 6.0 × 5.1 | 1.471 | 23,463 | 0.0002 | 1.793° | 1.2624 d (30.30 h) | Synchronous | USGS / Viking Orbiter (`ss_deimos`) |

---

## 3. Jupiter Satellite System

### Galilean Moons

| ID | Name | Parent | Mean Radius $R$ (km) | GM ($\text{km}^3/\text{s}^2$) | Density ($\text{g/cm}^3$) | Semi-major Axis $a$ (km) | Eccentricity $e$ | Inclination $i$ (deg) | Orbital Period $P$ | Rotation Model | Surface Map / Texture |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `io` | Io (Jupiter I) | Jupiter | 1,821.6 ± 0.5 | 5,959.916 | 3.528 | 421,700 | 0.0041 | 0.036° | 1.7691 d | Synchronous | Galileo SSI / Voyager (`ss_io`) |
| `europa` | Europa (Jupiter II) | Jupiter | 1,560.8 ± 0.5 | 3,202.739 | 3.013 | 670,900 | 0.0090 | 0.467° | 3.5512 d | Synchronous | Galileo SSI / Voyager (`ss_europa`) |
| `ganymede` | Ganymede (Jupiter III) | Jupiter | 2,634.1 ± 0.3 | 9,887.834 | 1.942 | 1,070,400 | 0.0013 | 0.177° | 7.1546 d | Synchronous | Galileo SSI / Voyager (`ss_ganymede`) |
| `callisto` | Callisto (Jupiter IV) | Jupiter | 2,410.3 ± 1.5 | 7,179.289 | 1.834 | 1,882,700 | 0.0074 | 0.192° | 16.6890 d | Synchronous | Galileo SSI / Voyager (`ss_callisto`) |

### Inner & Outer Jovian Moons

| ID | Name | Parent | Mean Radius $R$ (km) | Triaxial Shape $a \times b \times c$ (km) | Semi-major Axis $a$ (km) | Eccentricity $e$ | Inclination $i$ (deg) | Orbital Period $P$ | Rotation Model | Visual Appearance |
|---|---|---|---|---|---|---|---|---|---|---|
| `amalthea` | Amalthea (Jupiter V) | Jupiter | 83.5 ± 2.0 | 125 × 73 × 64 | 181,400 | 0.0032 | 0.380° | 0.4982 d | Synchronous | Reddish, heavily cratered irregular |
| `thebe` | Thebe (Jupiter XIV) | Jupiter | 49.3 ± 2.0 | 58 × 49 × 42 | 222,200 | 0.0175 | 1.080° | 0.6745 d | Synchronous | Dark irregular cratered |
| `metis` | Metis (Jupiter XVI) | Jupiter | 21.5 ± 2.0 | 30 × 20 × 17 | 128,000 | 0.0002 | 0.060° | 0.2948 d | Synchronous | Inner ring-shepherd irregular |
| `adrastea` | Adrastea (Jupiter XV) | Jupiter | 8.2 ± 2.0 | 10 × 8 × 7 | 129,000 | 0.0015 | 0.030° | 0.2983 d | Synchronous | Inner ring-shepherd irregular |
| `himalia` | Himalia (Jupiter VI) | Jupiter | 69.8 ± 0.5 | — | 11,460,000 | 0.1623 | 27.500° | 250.56 d | Spin (7.78 h) | Neutral grey C-type captured asteroid |
| `elara` | Elara (Jupiter VII) | Jupiter | 43.0 ± 1.0 | — | 11,740,000 | 0.2174 | 26.630° | 259.64 d | Spin (11.97 h) | Neutral dark irregular |

---

## 4. Saturn Satellite System

### Major Moons

| ID | Name | Parent | Mean Radius $R$ (km) | GM ($\text{km}^3/\text{s}^2$) | Semi-major Axis $a$ (km) | Eccentricity $e$ | Inclination $i$ (deg) | Orbital Period $P$ | Rotation Model | Surface Map / Texture |
|---|---|---|---|---|---|---|---|---|---|---|
| `mimas` | Mimas (Saturn I) | Saturn | 198.2 ± 0.4 | 2.503 | 185,520 | 0.0202 | 1.574° | 0.9424 d | Synchronous | Cassini ISS (`ss_mimas`) |
| `enceladus` | Enceladus (Saturn II) | Saturn | 252.1 ± 0.2 | 7.210 | 238,020 | 0.0047 | 0.009° | 1.3702 d | Synchronous | Cassini ISS (`ss_enceladus`) |
| `tethys` | Tethys (Saturn III) | Saturn | 531.1 ± 0.6 | 41.21 | 294,660 | 0.0001 | 1.091° | 1.8878 d | Synchronous | Cassini ISS (`ss_tethys`) |
| `dione` | Dione (Saturn IV) | Saturn | 561.4 ± 0.4 | 73.11 | 377,400 | 0.0022 | 0.028° | 2.7369 d | Synchronous | Cassini / Voyager (`ss_dione`) |
| `rhea` | Rhea (Saturn V) | Saturn | 763.8 ± 1.0 | 153.94 | 527,040 | 0.0013 | 0.332° | 4.5175 d | Synchronous | Cassini / Voyager (`ss_rhea`) |
| `titan` | Titan (Saturn VI) | Saturn | 2,574.76 ± 0.02 | 8,978.14 | 1,221,830 | 0.0288 | 0.349° | 15.945 d | Synchronous | Dense photochemical haze layer |
| `hyperion` | Hyperion (Saturn VII) | Saturn | 135.0 ± 4.0 | 0.370 | 1,481,100 | 0.1230 | 0.568° | 21.277 d | Chaotic tumble | Triaxial porous sponge |
| `iapetus` | Iapetus (Saturn VIII) | Saturn | 734.5 ± 2.8 | 120.50 | 3,561,300 | 0.0286 | 15.470° | 79.330 d | Synchronous | Cassini / Voyager (`ss_iapetus`) |
| `phoebe` | Phoebe (Saturn IX) | Saturn | 106.5 ± 0.7 | 5.53 | 12,960,000 | 0.1562 | 175.300° | 550.56 d (retrograde) | Spin (9.27 h) | Cassini ISS (`ss_phoebe`) |

### Ring Moons & Co-orbitals

| ID | Name | Parent | Mean Radius $R$ (km) | Semi-major Axis $a$ (km) | Eccentricity $e$ | Inclination $i$ (deg) | Orbital Period $P$ | Characteristics |
|---|---|---|---|---|---|---|---|---|
| `janus` | Janus (Saturn X) | Saturn | 89.5 ± 1.4 | 151,472 | 0.0068 | 0.163° | 0.6947 d | Co-orbital with Epimetheus; horseshoe orbit exchange |
| `epimetheus` | Epimetheus (Saturn XI) | Saturn | 58.1 ± 1.8 | 151,422 | 0.0098 | 0.351° | 0.6943 d | Co-orbital companion of Janus |
| `pan` | Pan (Saturn XVIII) | Saturn | 14.1 ± 1.3 | 133,584 | 0.0000 | 0.001° | 0.5750 d | Encke gap shepherd; equatorial ridge |
| `atlas` | Atlas (Saturn XV) | Saturn | 15.1 ± 1.8 | 137,670 | 0.0012 | 0.003° | 0.6017 d | Outer A-ring shepherd |
| `prometheus` | Prometheus (Saturn XVI) | Saturn | 43.1 ± 2.7 | 139,380 | 0.0022 | 0.008° | 0.6130 d | Inner F-ring shepherd |
| `pandora` | Pandora (Saturn XVII) | Saturn | 40.7 ± 2.2 | 141,720 | 0.0042 | 0.050° | 0.6285 d | Outer F-ring shepherd |
| `helene` | Helene (Saturn XII) | Saturn | 17.6 ± 0.4 | 377,400 | 0.0022 | 0.199° | 2.7369 d | Leading Lagrangian (L4) trojan of Dione |

---

## 5. Uranus Satellite System

| ID | Name | Parent | Mean Radius $R$ (km) | Semi-major Axis $a$ (km) | Eccentricity $e$ | Inclination $i$ (deg) | Orbital Period $P$ | Rotation Model | Surface Map / Texture |
|---|---|---|---|---|---|---|---|---|---|
| `miranda` | Miranda (Uranus V) | Uranus | 235.8 ± 0.7 | 129,390 | 0.0013 | 4.232° | 1.4135 d | Synchronous | Voyager 2 (`ss_miranda`) |
| `ariel` | Ariel (Uranus I) | Uranus | 578.9 ± 0.6 | 191,020 | 0.0012 | 0.260° | 2.5204 d | Synchronous | Voyager 2 (`ss_ariel`) |
| `umbriel` | Umbriel (Uranus II) | Uranus | 584.7 ± 2.8 | 266,300 | 0.0039 | 0.205° | 4.1442 d | Synchronous | Voyager 2 (`ss_umbriel`) |
| `titania` | Titania (Uranus III) | Uranus | 788.4 ± 0.6 | 435,910 | 0.0011 | 0.340° | 8.7059 d | Synchronous | Voyager 2 (`ss_titania`) |
| `oberon` | Oberon (Uranus IV) | Uranus | 761.4 ± 2.6 | 583,520 | 0.0014 | 0.058° | 13.463 d | Synchronous | Voyager 2 (`ss_oberon`) |
| `puck` | Puck (Uranus XV) | Uranus | 81.0 ± 2.0 | 86,010 | 0.0001 | 0.319° | 0.7618 d | Synchronous | Dark C-type circular satellite |

---

## 6. Neptune Satellite System

| ID | Name | Parent | Mean Radius $R$ (km) | Semi-major Axis $a$ (km) | Eccentricity $e$ | Inclination $i$ (deg) | Orbital Period $P$ | Rotation Model | Surface Map / Texture |
|---|---|---|---|---|---|---|---|---|---|
| `triton` | Triton (Neptune I) | Neptune | 1,353.4 ± 0.9 | 354,760 | 0.0000 | 156.885° (retrograde) | 5.8769 d | Synchronous | Voyager 2 (`ss_triton`) |
| `proteus` | Proteus (Neptune VIII) | Neptune | 210.0 ± 7.0 | 117,647 | 0.0005 | 0.524° | 1.1223 d | Synchronous | Irregular triaxial (218 × 208 × 201 km) |
| `nereid` | Nereid (Neptune II) | Neptune | 178.5 ± 2.5 | 5,513,800 | 0.7507 | 7.232° | 360.14 d | Spin (11.52 h) | Highly eccentric irregular satellite |
| `larissa` | Larissa (Neptune VII) | Neptune | 97.0 ± 3.0 | 73,548 | 0.0014 | 0.205° | 0.5547 d | Synchronous | Inner cratered moon (108 × 102 × 84 km) |
| `galatea` | Galatea (Neptune VI) | Neptune | 87.4 ± 3.0 | 61,953 | 0.0001 | 0.060° | 0.4287 d | Synchronous | Adams ring-arc shepherd (102 × 92 × 72 km) |
| `despina` | Despina (Neptune V) | Neptune | 75.0 ± 3.0 | 52,526 | 0.0002 | 0.064° | 0.3347 d | Synchronous | Inner ring shepherd (90 × 74 × 64 km) |

---

## 7. Pluto–Charon Binary and Satellite System

| ID | Name | Parent | Mean Radius $R$ (km) | Semi-major Axis $a$ (km) | Eccentricity $e$ | Inclination $i$ (deg) | Orbital Period $P$ | Dynamic Relationship | Surface Map / Texture |
|---|---|---|---|---|---|---|---|---|---|
| `pluto` | 134340 Pluto | Sun (Barycentre) | 1,188.3 ± 1.6 | 2,132 (from barycentre) | 0.0000 | 0.001° | 6.3872 d | Mutual barycentric orbit with Charon | New Horizons (`ss_pluto`) |
| `charon` | Charon (Pluto I) | Pluto (Barycentre) | 606.0 ± 0.5 | 17,536 (from barycentre) | 0.0000 | 0.001° | 6.3872 d | Dual synchronous tidal lock | New Horizons (`ss_charon`) |
| `styx` | Styx (Pluto V) | Pluto Barycentre | 5.5 ± 1.5 | 42,656 | 0.0058 | 0.809° | 20.161 d | Chaotic rotation (3.24 d) | Irregular triaxial (8.0 × 4.5 × 4.0 km) |
| `nix` | Nix (Pluto II) | Pluto Barycentre | 19.9 ± 1.0 | 48,694 | 0.0020 | 0.133° | 24.855 d | Chaotic rotation (43.9 h) | Irregular triaxial (24.9 × 16.0 × 14.9 km) |
| `kerberos` | Kerberos (Pluto IV) | Pluto Barycentre | 7.0 ± 1.0 | 57,783 | 0.0033 | 0.389° | 32.168 d | Chaotic rotation (5.33 d) | Irregular triaxial (9.5 × 6.0 × 4.5 km) |
| `hydra` | Hydra (Pluto III) | Pluto Barycentre | 21.5 ± 1.0 | 64,738 | 0.0059 | 0.242° | 38.201 d | Chaotic rotation (10.3 h) | Irregular triaxial (27.5 × 17.0 × 15.5 km) |

---

## 8. Dwarf Planets & Major Asteroids

| ID | Name | Classification | Mean Radius $R$ (km) | Semi-major Axis $a$ (AU) | Eccentricity $e$ | Inclination $i$ (deg) | Orbital Period $P$ (yr) | Surface Map / Texture |
|---|---|---|---|---|---|---|---|---|
| `ceres` | 1 Ceres | Dwarf Planet | 469.73 ± 0.18 | 2.769 | 0.0789 | 10.59° | 4.61 yr | Dawn FC global map (`ss_ceres`) |
| `vesta` | 4 Vesta | Asteroid | 262.7 ± 0.1 | 2.361 | 0.0887 | 7.14° | 3.63 yr | Dawn FC global map (`ss_vesta`) |
| `pallas` | 2 Pallas | Asteroid | 256.5 ± 3.0 | 2.772 | 0.2313 | 34.84° | 4.62 yr | Irregular triaxial protoplanet |
| `hygiea` | 10 Hygiea | Asteroid | 216.5 ± 4.0 | 3.141 | 0.1154 | 3.84° | 5.57 yr | Spherical equilibrium C-type asteroid |
| `haumea` | 136108 Haumea | Dwarf Planet | 798 ± 20 | 43.13 | 0.1913 | 28.19° | 283.3 yr | Rapid triaxial rotator (1050 × 840 × 510 km) |
| `makemake` | 136472 Makemake | Dwarf Planet | 715 ± 7 | 45.43 | 0.1613 | 28.98° | 306.2 yr | Methane-rich bright trans-Neptunian dwarf planet |
| `eris` | 136199 Eris | Dwarf Planet | 1,163 ± 6 | 67.78 | 0.4407 | 44.04° | 558.0 yr | Ultra-high albedo scattered disc dwarf planet |

---

## 9. Main Asteroid Belt Population Dataset

- **Dataset File**: `frontend/public/assets/astronomy/data/main_belt_sbdb_h13.5.json`
- **Total Asteroids**: 10,842 real numbered asteroids ($H < 13.5$).
- **Selection**: All Main Belt Asteroids (MBA, $2.0 < a < 3.2\text{ AU}$) and Outer Main Belt ($3.2 < a < 4.6\text{ AU}$).
- **Exclusions**: Ceres, Pallas, Vesta, and Hygiea are excluded from the instanced array because they are rendered as primary interactive catalogue bodies.
- **Physics**: Real osculating Keplerian orbital elements propagated dynamically via GPU shaders.
- **Structure**: Real Kirkwood gaps (3:1 at 2.5 AU, 5:2 at 2.82 AU, 7:3 at 2.95 AU, 2:1 at 3.28 AU) naturally emerge from the authentic JPL SBDB distribution.
