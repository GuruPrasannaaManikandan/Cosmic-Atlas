# COSMIC ATLAS — Scientific Data Provenance & Attribution

## 1. Scientific Standards & Data Integrity Principles

**COSMIC ATLAS** is developed with an unwavering commitment to scientific accuracy. Visual effects, shaders, textures, and coordinates are directly derived from or calibrated against authentic astrophysics and planetary science datasets published by NASA, the European Space Agency (ESA), the European Southern Observatory (ESO), the United States Geological Survey (USGS), and peer-reviewed astronomical literature.

---

## 2. Astronomical Texture Assets & Provenance

### 2.1 Planetary & Lunar Bodies

#### 1. Earth (`earth_day_2k.jpg`, `earth_clouds_2k.png`, `earth_specular_2k.jpg`)
- **Source**: NASA Visible Earth & Blue Marble Next Generation / NOAA GOES Meteorological Composite.
- **License**: Public Domain (NASA / USGS policy for public educational and scientific use).
- **Physical Provenance**:
  - Albedo map derived from NASA Terra MODIS sensor composites with 500-meter terrestrial surface reflectance.
  - Bathymetric shelf elevation derived from Smith & Sandwell satellite radar altimetry.
  - Dynamic cloud layer synthesised from NOAA-GOES infrared and visible cyclonic storm track observations.
  - Specular mask calibrated to provide physical Fresnel reflectance for liquid oceans ($n \approx 1.333$) while zeroing terrestrial landmass diffuse reflections.

#### 2. The Moon (`moon_albedo_2k.jpg`)
- **Source**: USGS Astrogeology Science Center & NASA Lunar Reconnaissance Orbiter (LRO) Wide Angle Camera (WAC).
- **License**: Public Domain (NASA / USGS).
- **Physical Provenance**: Photometrically normalized global monochrome albedo mosaic (LROC WAC $643\text{ nm}$ band) resolving lunar maria (Oceanus Procellarum, Mare Tranquillitatis) and ray systems of Tycho, Copernicus, and Kepler craters.

#### 3. Mars (`mars_albedo_2k.jpg`)
- **Source**: NASA Mars Global Surveyor (MGS) Mars Orbiter Camera (MOC) & Viking Orbiter MDIM 2.1.
- **License**: Public Domain (NASA / JPL / USGS).
- **Physical Provenance**: True-color calibrated surface mosaic accounting for atmospheric dust opacity, detailing the $4,000\text{ km}$ Valles Marineris canyon network, Olympus Mons caldera, and seasonal carbon dioxide/water ice polar caps.

#### 4. Jupiter (`jupiter_color_2k.jpg`)
- **Source**: NASA Cassini ISS (Imaging Science Subsystem) & JunoCam Science Data.
- **License**: Public Domain (NASA / JPL / Space Science Institute).
- **Physical Provenance**: Cylindrical projection map constructed from narrow-angle camera exposures during the December 2000 Jupiter flyby, enhanced with high-latitude JunoCam polar cyclone data. True color zonal winds, festoons, white ovals, and the Great Red Spot.

#### 5. Saturn (`saturn_color_2k.jpg`, `saturn_rings_highres.png`)
- **Source**: NASA / JPL / Space Science Institute Cassini-Huygens Mission.
- **License**: Public Domain.
- **Physical Provenance**:
  - Atmosphere: Calibrated natural-color mosaic of Saturn's atmosphere captured by Cassini ISS between 2004 and 2008, featuring subtle ammonia haze belts and the north polar hexagonal jet stream.
  - Rings: High-definition radial optical depth profile derived from Cassini Radio Science Subsystem (RSS) and Ultraviolet Imaging Spectrograph (UVIS) stellar occultations. Accurately maps the transparency and optical thickness of the C Ring, B Ring, Cassini Division ($4,700\text{ km}$ wide), A Ring, and Encke Gap.

---

### 2.2 Solar & Stellar Objects

#### 6. The Sun (`sun_photosphere_2k.jpg`)
- **Source**: NASA Solar Dynamics Observatory (SDO) Atmospheric Imaging Assembly (AIA) & Helioseismic and Magnetic Imager (HMI).
- **License**: Public Domain.
- **Physical Provenance**: Continuum intensity maps ($6173\text{ \AA}$) capturing the solar photosphere, turbulent convective granulation cells (granules $\sim 1,000\text{ km}$ across), faculae, and active bipolar sunspot groups with dark umbra and radial penumbra.

#### 7. Betelgeuse (`betelgeuse_surface_2k.jpg`)
- **Source**: ESO Very Large Telescope (VLT) / SPHERE Instrument (Montargès et al., *Nature* 2021).
- **License**: Public Domain (ESO / Science).
- **Physical Provenance**: Reconstructed stellar surface albedo from high-contrast adaptive optics interferometry taken during the 2019–2020 "Great Dimming" of Betelgeuse. Depicts giant convective plume cells and Southern Hemisphere dust condensation cooling.

---

### 2.3 Deep-Sky Objects: Galaxies & Nebulae

#### 8. Andromeda Galaxy / M31 (`andromeda_m31_disk.png`)
- **Source**: NASA/ESA Hubble Space Telescope (HST) Advanced Camera for Surveys (ACS) & NASA GALEX (Galaxy Evolution Explorer).
- **License**: Public Domain (NASA / ESA / STScI).
- **Physical Provenance**: Composite multi-wavelength image combining optical emission from the central Population II bulge with ultraviolet data highlighting starburst clusters and dust absorption lanes in the spiral disk.

#### 9. Carina Nebula / NGC 3372 (`carina_emission_nebula.png`)
- **Source**: NASA/ESA Hubble Heritage Project & ESO VLT HAWK-I Infrared Camera.
- **License**: Public Domain.
- **Physical Provenance**: Multi-band emission composite combining $656.3\text{ nm}$ ($H\alpha$), $500.7\text{ nm}$ ($[\text{O III}]$), and $672.4\text{ nm}$ ($[\text{S II}]$) filters, accurately representing the turbulent ionization cavities, dust pillars, and the Homunculus Nebula surrounding Eta Carinae.

---

## 3. Ephemerides & Coordinate Systems

- **Planetary Ephemeris**: Analytical Keplerian orbital elements referenced to J2000 epoch ($T = 0$ at 2000-01-01 12:00:00 UTC). Inclination, eccentricity, longitude of ascending node, argument of periapsis, and semi-major axes are sourced from NASA JPL Solar System Dynamics (SSD) Horizons data tables.
- **Coordinate Reference Frame**:
  - Solar System: Heliocentric barycentric frame in astronomical units ($\text{AU}$) and light-years ($\text{ly}$).
  - Milky Way: Galactic coordinate system ($l, b$) centered on Sagittarius A* ($R_0 \approx 26,670\text{ ly}$).
  - Extragalactic: Supergalactic coordinate system referenced to the Virgo Cluster and Laniakea Supercluster barycenters.
- **Real-Time Astronomical Search**: Powered by the CDS SIMBAD Astronomical Database (Strasbourg) and NASA/IPAC Extragalactic Database (NED) REST APIs.
