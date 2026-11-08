# COSMIC ATLAS — Planetary Asset Provenance

An authoritative inventory of all 23 mission-grade planetary surface textures, scientific datasets, and 3D procedural meshes integrated into the Solar System expansion. Every texture originates from genuine NASA, USGS, or ESA space mission observations. Purely illustrative elements are strictly demarcated.

---

## 1. Scientific Asset Directory & Integrity Manifest

All assets are located in `frontend/public/assets/astronomy/` and tracked with cryptographic SHA256 hashes in `frontend/public/assets/astronomy/asset-manifest.json`.

```
frontend/public/assets/astronomy/
├── asset-manifest.json
├── data/
│   └── main_belt_sbdb_h13.5.json (10,842 JPL SBDB numbered asteroids)
└── textures/
    ├── phobos_1k.jpg      ├── deimos_1k.jpg      ├── io_2k.jpg
    ├── europa_2k.jpg      ├── ganymede_2k.jpg    ├── callisto_2k.jpg
    ├── mimas_1k.jpg       ├── enceladus_2k.jpg   ├── tethys_2k.jpg
    ├── dione_2k.jpg       ├── rhea_2k.jpg        ├── iapetus_1k.jpg
    ├── phoebe_1k.jpg      ├── miranda_1k.jpg     ├── ariel_1k.jpg
    ├── umbriel_1k.jpg     ├── titania_1k.jpg     ├── oberon_1k.jpg
    ├── triton_2k.jpg      ├── charon_2k.jpg      ├── pluto_2k.jpg
    ├── ceres_1k.jpg       └── vesta_1k.jpg
```

---

## 2. Complete Asset Provenance Inventory

| Asset Key | Target Body | Spacecraft & Instrument | Producing Institution | Resolution | Color Space | License | Distinctive Geological Features |
|---|---|---|---|---|---|---|---|
| `ss_phobos` | Phobos | Viking Orbiter VIS | USGS Astrogeology Science Center | 1024 × 512 | sRGB | Public Domain | Stickney impact crater, parallel groove lineaments |
| `ss_deimos` | Deimos | Viking Orbiter VIS | USGS Astrogeology Science Center | 1024 × 512 | sRGB | Public Domain | Smooth, dust-blanketed regolith, bright albedo patches |
| `ss_io` | Io | Galileo SSI & Voyager 1/2 ISS | USGS Astrogeology Science Center | 2048 × 1024 | sRGB | Public Domain | Volcanic sulfur calderas (Pele, Prometheus, Loki Patera) |
| `ss_europa` | Europa | Galileo SSI & Voyager 2 ISS | USGS Astrogeology Science Center | 2048 × 1024 | sRGB | Public Domain | Bright icy crust, cross-cutting lineament ridges and fractures |
| `ss_ganymede` | Ganymede | Galileo SSI & Voyager 1/2 ISS | USGS Astrogeology Science Center | 2048 × 1024 | sRGB | Public Domain | Bright grooved terrain (sulci) and ancient dark cratered regions (Perrine/Galileo Regio) |
| `ss_callisto` | Callisto | Galileo SSI & Voyager 1/2 ISS | USGS Astrogeology Science Center | 2048 × 1024 | sRGB | Public Domain | Saturated impact cratering, Valhalla multi-ring impact basin |
| `ss_mimas` | Mimas | Cassini ISS | USGS Astrogeology Science Center | 1024 × 512 | sRGB | Public Domain | Herschel crater (139 km diameter, 10 km central peak) |
| `ss_enceladus` | Enceladus | Cassini ISS | USGS Astrogeology Science Center | 2048 × 1024 | sRGB | Public Domain | High-albedo pristine ice, south polar "tiger stripes" (Damascus, Baghdad, Alexandria Sulci) |
| `ss_tethys` | Tethys | Cassini ISS | USGS Astrogeology Science Center | 2048 × 1024 | sRGB | Public Domain | Odysseus impact crater (445 km diameter), Ithaca Chasma canyon |
| `ss_dione` | Dione | Cassini ISS & Voyager 2 | USGS Astrogeology Science Center | 2048 × 1024 | sRGB | Public Domain | Bright wispy fracture chasms on dark trailing hemisphere |
| `ss_rhea` | Rhea | Cassini ISS & Voyager 1/2 | USGS Astrogeology Science Center | 2048 × 1024 | sRGB | Public Domain | Heavily cratered icy terrain, Tirawa impact basin |
| `ss_iapetus` | Iapetus | Cassini ISS & Voyager 2 | NASA 3D Resources / JPL | 1024 × 512 | sRGB | Public Domain | Dual-albedo contrast: pitch-black Cassini Regio and bright Roncevaux Terra |
| `ss_phoebe` | Phoebe | Cassini ISS | USGS Astrogeology Science Center | 1024 × 512 | sRGB | Public Domain | Deep craters, excavated dark carbonaceous sub-surface material |
| `ss_miranda` | Miranda | Voyager 2 ISS | NASA 3D Resources / USGS | 1024 × 512 | sRGB | Public Domain | Ovoid coronae (Arden, Elsinore, Inverness), Verona Rupes fault scarp (20 km sheer cliff) |
| `ss_ariel` | Ariel | Voyager 2 ISS | NASA 3D Resources / USGS | 1024 × 512 | sRGB | Public Domain | Interconnected graben network, volcanic floor resurfacing |
| `ss_umbriel` | Umbriel | Voyager 2 ISS | NASA 3D Resources / USGS | 1024 × 512 | sRGB | Public Domain | Uniformly dark ancient surface, Wunda bright ring crater |
| `ss_titania` | Titania | Voyager 2 ISS | NASA 3D Resources / USGS | 1024 × 512 | sRGB | Public Domain | Giant fault valleys (Messina Chasma, Belmont Chasma) |
| `ss_oberon` | Oberon | Voyager 2 ISS | NASA 3D Resources / USGS | 1024 × 512 | sRGB | Public Domain | Hamlet crater with dark carbonaceous floor material |
| `ss_triton` | Triton | Voyager 2 ISS | USGS Astrogeology Science Center | 2048 × 1024 | sRGB | Public Domain | Nitrogen ice south polar cap, cantaloupe terrain |
| `ss_charon` | Charon | New Horizons LORRI/MVIC | USGS Astrogeology Science Center | 2048 × 1024 | sRGB | Public Domain | Mordor Macula reddish tholin polar cap, Serenity Chasma |
| `ss_pluto` | Pluto | New Horizons LORRI/MVIC | USGS Astrogeology Science Center | 2048 × 1024 | sRGB | Public Domain | Tombaugh Regio, Sputnik Planitia nitrogen glacier |
| `ss_ceres` | Ceres | Dawn Framing Camera (FC) | USGS Astropedia / NASA JPL | 1024 × 512 | sRGB | Public Domain | Occator Crater bright sodium carbonate faculae (Cerealia Facula) |
| `ss_vesta` | Vesta | Dawn Framing Camera (FC) | USGS Astropedia / NASA JPL | 1024 × 512 | sRGB | Public Domain | Rheasilvia south-polar impact basin, Divalia Fossae equatorial troughs |

---

## 3. Treatment of Atmospheric and Geologically Unmapped Bodies

### 3.1 Titan (Atmosphere vs. Surface)
- **Scientific Treatment**: In visible light, Titan’s surface is completely obscured by an optically thick ($A_V \approx 0.22$, optical depth $\tau > 4$) orange-brown photochemical smog composed of complex organic tholins formed by methane-nitrogen photolysis.
- **Rendering Implementation**: Rendered as a warm nitrogen/tholin haze core (`#c98f45`) enveloped in a translucent photochemical haze deck (`#d9a05a`, opacity $0.88$) and an outer atmospheric Rayleigh limb scattering shader. Radar/near-IR surface imaging is noted in the object inspector rather than masquerading as a visible-light surface.

### 3.2 Hyperion (Porous Sponge Geometry)
- **Scientific Treatment**: Cassini observations showed Hyperion has a mean density of only $0.54\text{ g/cm}^3$ (porosity $> 40\%$). It is an irregular triaxial body ($180 \times 133 \times 103\text{ km}$) with deep, sponge-like impact craters that do not retain ejecta.
- **Rendering Implementation**: Rendered with an authentic triaxial irregular geometry deformed by deterministic surface relief ($\delta = 0.22$) and realistic reddish-tan albedo (`#b0a08a`).

### 3.3 Small Irregular Satellites (Phobos, Deimos, Amalthea, Proteus, Nix, Hydra, etc.)
- **Scientific Treatment**: Bodies below the hydrostatic equilibrium threshold ($R < 200\text{–}250\text{ km}$) have non-spherical, elongated or triaxial shapes determined by their collisional history.
- **Rendering Implementation**: Rendered using the `getIrregularGeometry()` procedural engine, which deforms a high-subdivision sphere by the verified semi-axes $(a, b, c)$ from JPL-SAT-PHYS and applies deterministic surface roughness.

### 3.4 Enceladus Cryovolcanic Plume
- **Scientific Treatment**: Cassini detected active cryovolcanic geysers erupting water vapor, simple organics, and silica nanoparticles from the South Polar "tiger stripe" fractures.
- **Rendering Implementation**: An illustrative translucent plume glow is positioned at the South Pole ($y = -1.18$) with an explicit badge in the inspector distinguishing the observed plume from illustrative rendering.
