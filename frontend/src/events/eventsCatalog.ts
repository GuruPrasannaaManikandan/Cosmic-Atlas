import { CosmicEventDefinition } from './types'

export const COSMIC_EVENTS: CosmicEventDefinition[] = [
  {
    id: 'supernova-betelgeuse',
    name: 'Betelgeuse Supernova Evolution',
    category: 'supernova',
    title: 'Type II-P Core-Collapse Supernova Simulation',
    tagline: 'Hypothetical educational simulation of a red supergiant terminal explosion',
    scientificDescription:
      'A multi-stage astrophysical simulation modeling the future terminal evolution of a massive red supergiant (~18 M☉). Core iron collapse triggers neutrino shock breakout, expanding radioactive ejecta, and remnant formation.',
    provenance: 'hypothetical-simulation',
    source: {
      name: 'Smartt 2009, ARA&A 47; Joyce et al. 2020, ApJ 902, 63',
      note: 'The exact timing of Betelgeuse\'s supernova is uncertain (expected within ~100,000 years). This is an educational visualization and does not affect the real catalog star.',
    },
    durationSec: 16,
    associatedObjectId: 'betelgeuse',
    defaultCamera: {
      dist: 55,
      pitch: 0.25,
      yaw: 0.6,
    },
    stages: [
      {
        timeSec: 0,
        name: 'Stage 1: Pre-Collapse Supergiant',
        subtitle: 'Convective Boiling Photosphere & Dust Shell',
        description:
          'Massive red supergiant with a swollen convective envelope (~764 R☉). Silicon burning has completed in the degenerate core, leaving an inert iron core approaching the Chandrasekhar mass limit (~1.4 M☉).',
        physicsNotes:
          'Because iron fusion is endothermic, core nuclear reactions cease. Electron degeneracy pressure alone resists gravity.',
      },
      {
        timeSec: 3.5,
        name: 'Stage 2: Core Collapse & Shock Breakout',
        subtitle: 'Relativistic Collapse & Blinding Neutrino Flash',
        description:
          'The core collapses in ~100 milliseconds into a proto-neutron star. A high-energy bounce shock wave surges through the stellar mantle, breaking through the photosphere with a blinding ultraviolet flash.',
        physicsNotes:
          'Over 99% of the gravitational binding energy (~10⁴⁶ Joules) is radiated as a pulse of neutrinos; shock breakout velocities reach ~30,000 km/s.',
      },
      {
        timeSec: 7.0,
        name: 'Stage 3: Explosive Ejecta Fireball',
        subtitle: 'Radioactive ⁵⁶Ni Decay & Photospheric Expansion',
        description:
          'The stellar envelope is shattered into an asymmetric expanding fireball of ionized gas. Radioactive decay of synthesized Nickel-56 powers the plateau phase luminosity for ~100 days.',
        physicsNotes:
          'The optical light curve remains nearly constant (Type II-P plateau) as the hydrogen recombination wave propagates inward through the expanding debris.',
      },
      {
        timeSec: 12.0,
        name: 'Stage 4: Remnant Formation & Pulsar Core',
        subtitle: 'Rayleigh-Taylor Filaments & Compact Neutron Star',
        description:
          'The expanding blast wave decelerates against interstellar matter, forming turbulent filamentary shells rich in heavy elements. At the center spins a newborn rapidly rotating neutron star (pulsar).',
        physicsNotes:
          'Heavy elements synthesized in the explosion (calcium, oxygen, iron, gold) are seeded into the interstellar medium to form future planetary systems.',
      },
    ],
  },
  {
    id: 'pulsar-crab',
    name: 'Crab Pulsar Magnetosphere',
    category: 'pulsar',
    title: 'Relativistic Rotating Neutron Star',
    tagline: 'Coherent synchrotron beam emission from a 33-millisecond spinning stellar corpse',
    scientificDescription:
      'Visualization of the Crab Pulsar (PSR B0531+21) inside the Crab Nebula remnant. A 1.4 M☉ neutron star compressed into a radius of ~10 km, rotating 30 times per second with a trillion-Gauss magnetic field.',
    provenance: 'model-based',
    source: {
      name: 'Gold 1968, Nature 218; Hester 2008, ARA&A 46',
      note: 'Based on standard magnetic dipole lighthouse radiation models and multiwavelength observations.',
    },
    durationSec: 12,
    defaultCamera: {
      dist: 40,
      pitch: 0.35,
      yaw: 0.4,
    },
    stages: [
      {
        timeSec: 0,
        name: 'Stage 1: Neutron Star Core',
        subtitle: 'Extreme Density & Magnetic Dipole',
        description:
          'A stellar remnant compressed to nuclear density (~10¹⁴ g/cm³). The magnetic axis is tilted relative to the spin axis, creating a misaligned rotating dipole.',
        physicsNotes: 'Surface gravitational acceleration exceeds 10¹¹ m/s²; escape velocity is ~0.4 c.',
      },
      {
        timeSec: 4.0,
        name: 'Stage 2: Synchrotron Radiation Cones',
        subtitle: 'Cosmic Lighthouse Beam Sweeps',
        description:
          'Relativistic electrons accelerated along magnetic field lines emit collimated cones of synchrotron radiation across radio, optical, and gamma wavelengths.',
        physicsNotes: 'Whenever the beam sweeps across our line of sight, an observer detects a sharp periodic pulse.',
      },
      {
        timeSec: 8.0,
        name: 'Stage 3: Pulsar Wind Nebula Interface',
        subtitle: 'Equatorial Torus & Relativistic Polar Jets',
        description:
          'Magnetized relativistic particle winds slam into the surrounding supernova remnant, driving dynamic shock ripples and helical plasma jets along the spin axis.',
        physicsNotes: 'Rotational kinetic energy loss (spindown luminosity) powers the entire glow of the Crab Nebula.',
      },
    ],
  },
  {
    id: 'black-hole-m87',
    name: 'Supermassive Black Hole & Accretion Disk',
    category: 'black-hole',
    title: 'Relativistic Kerr Metric & Gravitational Lensing',
    tagline: 'Event horizon shadow, photon orbit ring, and relativistic Doppler beaming',
    scientificDescription:
      'Visualization of a supermassive black hole inspired by Event Horizon Telescope (EHT) imaging of M87* and Sagittarius A*. Illustrates extreme gravitational light bending and asymmetric Doppler brightening.',
    provenance: 'model-based',
    source: {
      name: 'Event Horizon Telescope Collaboration (2019, ApJ 875; 2022, ApJL 930)',
      note: 'Illustrates gravitational lensing and Doppler beaming according to General Relativity.',
    },
    durationSec: 12,
    defaultCamera: {
      dist: 38,
      pitch: 0.22,
      yaw: 0.7,
    },
    stages: [
      {
        timeSec: 0,
        name: 'Stage 1: Event Horizon & Shadow',
        subtitle: 'The Point of No Return (rs = 2GM/c²)',
        description:
          'The central black silhouette is the event horizon shadow, magnified by strong gravitational lensing to ~2.6 times the Schwarzschild radius.',
        physicsNotes: 'Within the event horizon, all timelike geodesics terminate at the central singularity.',
      },
      {
        timeSec: 4.0,
        name: 'Stage 2: Photon Sphere & Lensing Halo',
        subtitle: 'Unstable Closed Circular Photon Orbits (r = 1.5 rs)',
        description:
          'Light from the rear of the accretion disk is bent over and under the black hole by extreme spacetime curvature, forming a secondary Einstein ring halo.',
        physicsNotes: 'Photons orbiting at 1.5 rs can execute multiple orbits before escaping to an observer or falling inward.',
      },
      {
        timeSec: 8.0,
        name: 'Stage 3: Doppler Beaming & Relativistic Jets',
        subtitle: 'Asymmetric Accretion Disk Luminosity',
        description:
          'Plasma rotating toward the observer is Doppler-boosted into intense blue-white brilliance, while receding plasma is red-shifted and dimmed. Relativistic plasma jets erupt along the spin axis.',
        physicsNotes: 'Special relativistic aberration shifts radiant flux into the direction of orbital motion by factor δ⁴.',
      },
    ],
  },
  {
    id: 'nebula-carina',
    name: 'Carina Star-Forming Pillars',
    category: 'nebula',
    title: 'Ionized Hydrogen Clouds & Protostellar Outflows',
    tagline: 'Massive stellar winds carving dense molecular dust pillars in the Carina Nebula',
    scientificDescription:
      'Detailed visualization of the Carina Nebula (NGC 3372) complex. Radiation from massive Wolf-Rayet and O-type stars erodes cold molecular clouds into towering pillars harboring newborn stars.',
    provenance: 'illustrative',
    source: {
      name: 'Smith & Brooks 2008; NASA/ESA Hubble & JWST Carina datasets',
      note: 'Multi-wavelength visualization representing gas ionization emission lines (H-alpha, O-III, S-II).',
    },
    durationSec: 12,
    associatedObjectId: 'carina',
    defaultCamera: {
      dist: 45,
      pitch: 0.2,
      yaw: 0.5,
    },
    stages: [
      {
        timeSec: 0,
        name: 'Stage 1: Ionization Fronts',
        subtitle: 'Photo-Evaporating Molecular Gas Sheets',
        description:
          'Ultraviolet radiation from Eta Carinae and Trumpler 16 heats interstellar gas to ~10,000 K, causing hydrogen to fluoresce with characteristic crimson H-alpha glow.',
        physicsNotes: 'Strömgren sphere ionization balances stellar photon emission with electron recombination rates.',
      },
      {
        timeSec: 4.0,
        name: 'Stage 2: Dust Pillars & Evaporating Globules',
        subtitle: 'Dense Star-Forming Incubators',
        description:
          'Dense clumps of dust resist photo-evaporation, forming elongated pillar structures pointing directly toward ionizing star clusters.',
        physicsNotes: 'Gravitational collapse inside dense pillar tips triggers the birth of low- and intermediate-mass stars.',
      },
      {
        timeSec: 8.0,
        name: 'Stage 3: Herbig-Haro Bipolar Jets',
        subtitle: 'Protostellar Protuberances & Shock Cavities',
        description:
          'Infant protostars channel infalling matter through accretion disks, ejecting collimated supersonic jets that blast bow shocks into the surrounding nebula.',
        physicsNotes: 'Magnetic field lines anchored to the protostellar accretion disk collimate gas outflows at hundreds of km/s.',
      },
    ],
  },
]

export const EVENT_BY_ID: Record<string, CosmicEventDefinition> = Object.fromEntries(
  COSMIC_EVENTS.map((e) => [e.id, e])
)
