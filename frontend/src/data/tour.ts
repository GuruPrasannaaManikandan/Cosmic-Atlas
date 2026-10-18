export interface TourStep { id: string; stage: number; stageTitle: string; target: string; text: string; dwellMs?: number; viewScale?: number }

export const STAGES = [
  'Large-scale cosmic structures',
  'The local galactic neighbourhood',
  'Enter the Milky Way',
  'Stellar landmarks',
  'The Solar System',
  'Arrival at Earth',
]

export const TOUR: TourStep[] = [
  { id: 't1', stage: 1, stageTitle: STAGES[0], target: 'laniakea', text: 'We begin ~1 billion light-years from the Sun. Laniakea is a velocity-flow basin of ~100,000 galaxies. The marker is schematic.' },
  { id: 't2', stage: 1, stageTitle: STAGES[0], target: 'coma', text: 'The Coma Cluster: a rich cluster ~320 million ly away. It is a separate landmark in a different direction – not inside the previous one.' },
  { id: 't3', stage: 1, stageTitle: STAGES[0], target: 'virgo', text: 'The Virgo Cluster at ~54 million ly: the nearest rich galaxy cluster, and a member of Laniakea.' },
  { id: 't4', stage: 2, stageTitle: STAGES[1], target: 'local-sheet', text: 'The Local Sheet: a flattened structure of galaxies ~23 million ly across that contains our neighbourhood.' },
  { id: 't5', stage: 2, stageTitle: STAGES[1], target: 'local-group', text: 'The Local Group: ~80 galaxies bound together, dominated by the Milky Way and Andromeda.' },
  { id: 't6', stage: 2, stageTitle: STAGES[1], target: 'andromeda', text: 'Andromeda (M31), 2.5 million ly away – the nearest large spiral galaxy.' },
  { id: 't7', stage: 2, stageTitle: STAGES[1], target: 'm33', text: 'Triangulum (M33), 2.7 million ly away, the third large member of the Local Group.' },
  { id: 't8', stage: 3, stageTitle: STAGES[2], target: 'milky-way', text: 'The Milky Way: bulge, disk and spiral arms. This is an illustrative procedural model, not a measured 3D map.' },
  { id: 't9', stage: 3, stageTitle: STAGES[2], target: 'orion-arm', text: 'The Orion Arm (Orion Spur), a minor arm hosting the Solar System. Its path is schematic.' },
  { id: 't10', stage: 4, stageTitle: STAGES[3], target: 'carina', text: 'The Carina Nebula, ~8,500 ly away – a giant star-forming region.' },
  { id: 't11', stage: 4, stageTitle: STAGES[3], target: 'alnitak', text: 'Orion\'s Belt: Alnitak (~1,260 ly)...' },
  { id: 't12', stage: 4, stageTitle: STAGES[3], target: 'alnilam', text: '...Alnilam (~2,000 ly)...' },
  { id: 't13', stage: 4, stageTitle: STAGES[3], target: 'mintaka', text: '...and Mintaka (~1,200 ly). They only look like a line from Earth – their distances differ by hundreds of light-years.' },
  { id: 't14', stage: 4, stageTitle: STAGES[3], target: 'betelgeuse', text: 'Betelgeuse, a red supergiant ~550 ly away.' },
  { id: 't15', stage: 4, stageTitle: STAGES[3], target: 'pleiades', text: 'The Pleiades (M45) – a real, gravitationally bound open cluster ~444 ly away.' },
  { id: 't16', stage: 4, stageTitle: STAGES[3], target: 'aldebaran', text: 'Aldebaran, an orange giant 65 ly away – a foreground star, not a Hyades member.' },
  { id: 't17', stage: 5, stageTitle: STAGES[4], target: 'sun', text: 'The Sun. Planet sizes below are exaggerated; orbit shapes and relative distances come from an approximate Keplerian model for the selected date.' },
  { id: 't18', stage: 5, stageTitle: STAGES[4], target: 'jupiter', text: 'Jupiter – the largest planet. (A guided order, not an alignment.)' },
  { id: 't19', stage: 5, stageTitle: STAGES[4], target: 'saturn', text: 'Saturn and its rings (ring radii schematic).' },
  { id: 't20', stage: 5, stageTitle: STAGES[4], target: 'mars', text: 'Mars, the outermost rocky planet.' },
  { id: 't21', stage: 5, stageTitle: STAGES[4], target: 'mercury', text: 'Mercury, innermost planet.' },
  { id: 't22', stage: 5, stageTitle: STAGES[4], target: 'venus', text: 'Venus, shrouded in thick clouds.' },
  { id: 't23', stage: 6, stageTitle: STAGES[5], target: 'earth', text: 'Home. Earth (procedural texture – illustrative). The Moon is at an exaggerated distance. You can now rotate, zoom, find the Moon, or explore freely.', viewScale: 1 },
]
