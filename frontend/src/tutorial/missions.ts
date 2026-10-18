import { TutorialMission } from './types'

export const TUTORIAL_MISSIONS: TutorialMission[] = [
  {
    id: 'mission-1-take-command',
    number: 1,
    title: 'TAKE COMMAND',
    subtitle: 'Observatory Viewport & Attitude Calibration',
    narrative:
      'Welcome to the Cosmic Atlas Observatory, explorer. Before embarking on intergalactic voyages, you must calibrate your viewpoint and observational sensors.',
    objective: 'Interact with the 3D universe camera.',
    instruction:
      'Left-drag anywhere across the screen to rotate your view, or use your mouse wheel / trackpad to zoom in and out.',
    hint: 'You can also use W A S D keys to fly, or drag with the right mouse button to pan.',
    highlightSelector: 'canvas',
    highlightPosition: 'center',
    targetActionName: 'Rotate or zoom the 3D viewport',
    completionText: 'Navigation systems online. The universe is ready for exploration.',
    canSkip: true,
  },
  {
    id: 'mission-2-find-first-world',
    number: 2,
    title: 'FIND YOUR FIRST WORLD',
    subtitle: 'Astronomical Search & Object Resolution',
    narrative:
      'The Cosmic Atlas catalogue indexes thousands of celestial landmarks across 15 orders of magnitude. Let us locate humanity’s cradle in the Solar System.',
    objective: 'Search for and select Earth.',
    instruction:
      'Click the Search bar at the top (or press /), type "Earth", and click the Earth search result.',
    hint: 'Our catalog supports names, Bayer designations, and HD/HIP numbers.',
    highlightSelector: '.search',
    highlightPosition: 'bottom',
    targetActionName: 'Search and select Earth',
    completionText: 'Destination acquired. You have located your first celestial landmark.',
    canSkip: true,
  },
  {
    id: 'mission-3-investigate-star',
    number: 3,
    title: 'INVESTIGATE A STAR',
    subtitle: 'Astrophysical Telemetry & Catalogue Provenance',
    narrative:
      'Every object in the atlas contains curated astrophysical data, coordinate transforms, and catalog citations. Let us investigate a colossal red supergiant.',
    objective: 'Inspect Betelgeuse (Alpha Orionis) and examine its astrophysical data.',
    instruction:
      'Click "Investigate Betelgeuse" below, or search for Betelgeuse and review its physical radius (~764 R☉) and distance in the Inspector panel.',
    hint: 'Look for the distance from Sun (548 ly) and spectral type (M1-M2 Ia-ab).',
    highlightSelector: '.panel.right',
    highlightPosition: 'left',
    targetActionName: 'Select and inspect Betelgeuse',
    completionText: 'Investigation complete. You can now inspect any celestial body you discover.',
    canSkip: true,
  },
  {
    id: 'mission-4-cosmic-scales',
    number: 4,
    title: 'TRAVEL THROUGH COSMIC SCALES',
    subtitle: 'Adaptive Scale-Aware Navigation',
    narrative:
      'Astronomical space spans from astronomical units in our Solar System to millions of light-years across galaxy superclusters. The camera adapts perspective dynamically.',
    objective: 'Travel between scales: jump from stellar scale to the Solar System or Milky Way.',
    instruction:
      'Click "☀ Solar System" or "◎ Milky Way" in the top navigation bar to experience a rapid scale transition.',
    hint: 'Notice how rendering units and orbital reference frames adjust automatically.',
    highlightSelector: '.topnav',
    highlightPosition: 'bottom',
    targetActionName: 'Jump between astronomical scales',
    completionText: 'Scale transition confirmed. You can now bridge light-years in seconds.',
    canSkip: true,
  },
  {
    id: 'mission-5-find-home',
    number: 5,
    title: 'BEGIN THE FIND HOME JOURNEY',
    subtitle: 'Guided Multi-Scale Astronomical Tour',
    narrative:
      'Cosmic Atlas features a curated 20-stage guided journey starting 1 billion light-years out at the Cosmic Web and descending through Laniakea all the way to Earth.',
    objective: 'Start the FIND HOME guided journey and inspect its tour controls.',
    instruction:
      'Click "✦ FIND HOME" in the top bar to begin the descent. Notice the tour card with pause, skip, and exit controls.',
    hint: 'You do not need to finish all 20 stages now — try pausing or resuming to complete this mission.',
    highlightSelector: 'button.btn.find',
    highlightPosition: 'bottom',
    targetActionName: 'Activate FIND HOME tour',
    completionText: 'Guided navigation active. The cosmic highway to Earth is charted.',
    canSkip: true,
  },
  {
    id: 'mission-6-data-lab',
    number: 6,
    title: 'UNLOCK THE DATA LAB',
    subtitle: 'Astro Data Intelligence & Survey Mapping',
    narrative:
      'Astronomers frequently ingest unfamiliar observational surveys. Astro Data Intelligence validates raw CSV, JSON, and VOTables and maps valid spatial coordinates in 3D.',
    objective: 'Open Data Intelligence and load the bundled sample dataset.',
    instruction:
      'Click "⌬ Data Intelligence" in the top bar, then click "✦ Load Sample Dataset" to review column mapping and data quality.',
    hint: 'Notice how objects lacking reliable distances are flagged rather than plotted arbitrarily.',
    highlightSelector: "button:has-text('Data Intelligence')",
    highlightPosition: 'bottom',
    targetActionName: 'Load sample dataset in Data Intelligence',
    completionText: 'Data lab online. You can now ingest custom astronomical surveys.',
    canSkip: true,
  },
  {
    id: 'mission-7-cosmic-events',
    number: 7,
    title: 'DISCOVER THE COSMIC EVENTS LAB',
    subtitle: 'Astrophysical Simulations & Relativistic Models',
    narrative:
      'Beyond static maps lie dynamic astrophysical phenomena. The Cosmic Events Observatory models core-collapse supernovae, relativistic pulsars, and black hole accretion disks.',
    objective: 'Open the Cosmic Events Observatory and launch an astrophysical simulation.',
    instruction:
      'Click "🌌 Cosmic Events" in the top bar, then click "Launch Simulation" on the Betelgeuse Supernova or Crab Pulsar to inspect its timeline.',
    hint: 'Use the timeline scrubber and playback speeds (0.5x to 5x) to step through each phase.',
    highlightSelector: 'button.events-btn',
    highlightPosition: 'bottom',
    targetActionName: 'Launch a Cosmic Event simulation',
    completionText: 'Astrophysical simulation verified. You have witnessed cosmic evolution in motion.',
    canSkip: true,
  },
  {
    id: 'mission-8-your-mission',
    number: 8,
    title: 'YOUR MISSION, YOUR WAY',
    subtitle: 'Cadet Commissioning & Free Exploration',
    narrative:
      'Outstanding work, explorer! You have mastered observatory attitude controls, catalogue search, astrophysical inspection, scale transitions, guided tours, and simulation labs.',
    objective: 'Choose your exploration path and enter the universe.',
    instruction:
      'Select any mode to begin your journey: free 3D exploration, spacecraft Travel Mode, the FIND HOME tour, or custom survey mapping.',
    hint: 'You can relaunch this tutorial anytime from Help (press ? or click ? Help).',
    highlightSelector: undefined,
    highlightPosition: 'center',
    targetActionName: 'Complete academy training and enter universe',
    completionText: 'Mission complete, explorer. The universe is yours to discover.',
    canSkip: false,
  },
]

export const MISSION_BY_ID: Record<string, TutorialMission> = Object.fromEntries(
  TUTORIAL_MISSIONS.map((m) => [m.id, m])
)
