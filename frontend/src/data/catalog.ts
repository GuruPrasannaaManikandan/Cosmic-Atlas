import { Vec3, raDecDistToRoot, galacticLBToUnit, sunRelativeToRoot, SUN_POS, LY_PER_AU, add } from '../astro/coords'
import { planetRootPos, moonOffsetLy } from '../astro/ephemeris'

export type Category =
  | 'supercluster' | 'cluster' | 'group' | 'sheet' | 'galaxy' | 'galactic-structure'
  | 'nebula' | 'star' | 'star-cluster' | 'planet' | 'moon' | 'star-system'

export type Provenance = 'curated-approximate' | 'illustrative' | 'computed-model' | 'live-catalogue' | 'user-dataset'
export type Visual = 'cluster' | 'galaxy' | 'milkyway' | 'nebula' | 'star' | 'starcluster' | 'sun' | 'planet' | 'marker'

export type PositionSpec =
  | { kind: 'origin' }
  | { kind: 'equatorial'; raDeg: number; decDeg: number; distanceLy: number }
  | { kind: 'galactic'; lDeg: number; bDeg: number; distanceLy: number } // from the Sun
  | { kind: 'sun' }
  | { kind: 'offset'; from: string; xyzLy: Vec3 } // illustrative offset from another object
  | { kind: 'planet'; body: string }
  | { kind: 'moon'; parent: string }

export interface CosmicObject {
  id: string
  name: string
  aliases: string[]
  category: Category
  visual: Visual
  position: PositionSpec
  /** physical hierarchy (star -> planetary system). Not the same as membership. */
  parents: string[]
  /** membership in large-scale structures (galaxy -> group/cluster). May be several. */
  memberOf: string[]
  /** simple spatial proximity, not physical association */
  nearby: string[]
  /** physical extent, light-years (diameter). */
  extentLy?: number
  /** exaggerated visual radius for solar-system bodies, in AU (documented as not to scale) */
  displayRadiusAU?: number
  distance?: { valueLy: number; uncertaintyLy?: number; basis: string }
  color: string
  provenance: Provenance
  confidence: 'high' | 'medium' | 'low'
  source: { catalogue: string; identifier?: string; note?: string }
  info: string
  props?: Record<string, string>
  schematic?: boolean
  importance: number // label priority 0..1
  viewDistanceLy: number // comfortable arrival distance
  links?: { label: string; url: string }[]
}

const MLY = 1e6
const sim = (n: string) => ({ label: 'SIMBAD', url: `https://simbad.cds.unistra.fr/simbad/sim-id?Ident=${encodeURIComponent(n)}` })
const ned = (n: string) => ({ label: 'NED', url: `https://ned.ipac.caltech.edu/byname?objname=${encodeURIComponent(n)}` })

const CUR = 'Cosmic Atlas bundled starter set (curated, approximate; cross-check with live SIMBAD/NED)'

export const OBJECTS: CosmicObject[] = [
  {
    id: 'laniakea', name: 'Laniakea Supercluster', aliases: ['Laniakea'], category: 'supercluster', visual: 'cluster',
    position: { kind: 'galactic', lDeg: 320, bDeg: -5, distanceLy: 160 * MLY }, parents: [], memberOf: [], nearby: ['virgo', 'local-group'],
    extentLy: 520 * MLY, color: '#9b8cff', provenance: 'illustrative', confidence: 'low', schematic: true,
    source: { catalogue: 'Tully et al. 2014, Nature 513, 71', note: 'Marker placed toward the Great Attractor basin at an approximate centroid distance. Boundaries are schematic.' },
    info: 'A supercluster of roughly 100,000 galaxies defined by the flow field of galaxy velocities. It contains the Virgo Supercluster, hence the Local Group. Shown as a diffuse marker; the real boundary is a velocity-flow basin, not a sphere.',
    props: { 'Approx. span': '~520 million ly', 'Placement': 'Schematic (centroid direction/distance approximate)' },
    importance: 1, viewDistanceLy: 700 * MLY, links: [sim('Laniakea')],
  },
  {
    id: 'coma', name: 'Coma Cluster', aliases: ['Abell 1656', 'A1656'], category: 'cluster', visual: 'cluster',
    position: { kind: 'equatorial', raDeg: 194.9531, decDeg: 27.9806, distanceLy: 321 * MLY }, parents: [], memberOf: [], nearby: [],
    extentLy: 20 * MLY, distance: { valueLy: 321 * MLY, uncertaintyLy: 15 * MLY, basis: 'Redshift z≈0.0231 with H0≈70 km/s/Mpc (approximate)' },
    color: '#ffb36b', provenance: 'curated-approximate', confidence: 'medium',
    source: { catalogue: CUR, identifier: 'Abell 1656' },
    info: 'A rich galaxy cluster with over 1,000 identified galaxies, dominated by two giant ellipticals (NGC 4874, NGC 4889). It lies in a different region of the sky from Virgo; it is a separate landmark, not nested inside Laniakea.',
    props: { 'Redshift': '≈0.0231', 'Type': 'Rich galaxy cluster' },
    importance: 0.95, viewDistanceLy: 40 * MLY, links: [sim('Abell 1656'), ned('Abell 1656')],
  },
  {
    id: 'virgo', name: 'Virgo Cluster', aliases: ['Virgo I', 'Virgo'], category: 'cluster', visual: 'cluster',
    position: { kind: 'equatorial', raDeg: 186.6333, decDeg: 12.7233, distanceLy: 54 * MLY }, parents: [], memberOf: ['laniakea'], nearby: ['local-group'],
    extentLy: 15 * MLY, distance: { valueLy: 54 * MLY, uncertaintyLy: 3 * MLY, basis: 'Surface-brightness-fluctuation distance (~16.5 Mpc)' },
    color: '#ffd27a', provenance: 'curated-approximate', confidence: 'medium',
    source: { catalogue: CUR, identifier: 'Virgo Cluster' },
    info: 'The nearest rich galaxy cluster, with ~1,300–2,000 member galaxies, including M87. The Local Group is a gravitationally infalling neighbour, not a member.',
    props: { 'Distance basis': '~16.5 Mpc', 'Brightest member': 'M87' },
    importance: 0.95, viewDistanceLy: 14 * MLY, links: [sim('Virgo Cluster')],
  },
  {
    id: 'local-sheet', name: 'Local Sheet', aliases: [], category: 'sheet', visual: 'marker',
    position: { kind: 'offset', from: 'local-group', xyzLy: [0, 0, 0] }, parents: [], memberOf: ['laniakea'], nearby: ['local-group'],
    extentLy: 23 * MLY, color: '#6fe3ff', provenance: 'illustrative', confidence: 'low', schematic: true,
    source: { catalogue: 'Tully et al. 2008; McCall 2014', note: 'Schematic: a flattened planar structure ~23 Mly across, drawn as a marker centred near the Local Group.' },
    info: 'A thin planar structure of galaxies within about 7 Mpc, in which the Local Group is embedded. It is flattened; the marker here is only a label.',
    props: { 'Shape': 'Flattened sheet (schematic marker)' }, importance: 0.8, viewDistanceLy: 40 * MLY,
  },
  {
    id: 'local-group', name: 'Local Group', aliases: ['LG'], category: 'group', visual: 'marker',
    position: { kind: 'offset', from: 'andromeda', xyzLy: [0, 0, 0] }, parents: [], memberOf: ['local-sheet', 'laniakea'], nearby: ['virgo'],
    extentLy: 10 * MLY, color: '#6fe3ff', provenance: 'illustrative', confidence: 'medium', schematic: true,
    source: { catalogue: 'McConnachie 2012, AJ 144, 4', note: 'Centre drawn between the Milky Way and M31 (barycentre is approximate).' },
    info: 'The galaxy group containing the Milky Way, Andromeda (M31), Triangulum (M33) and 80+ dwarf galaxies, ~10 million ly across.',
    props: { 'Dominant members': 'Milky Way, Andromeda, Triangulum' }, importance: 0.9, viewDistanceLy: 7 * MLY, links: [sim('Local Group')],
  },
  {
    id: 'milky-way', name: 'Milky Way Galaxy', aliases: ['The Galaxy', 'Milky Way'], category: 'galaxy', visual: 'milkyway',
    position: { kind: 'origin' }, parents: [], memberOf: ['local-group'], nearby: ['andromeda', 'm33'],
    extentLy: 105700, color: '#cfe4ff', provenance: 'curated-approximate', confidence: 'high',
    source: { catalogue: 'Bland-Hawthorn & Gerhard 2016, ARA&A 54, 529' },
    info: 'A barred spiral galaxy. The 3D model drawn here is an ILLUSTRATIVE procedural model (bulge, disk, four logarithmic arms) – not a measured map. The Sun is placed ~26,700 ly from the centre.',
    props: { 'Diameter': '~105,700 ly (stellar disk)', 'Sun–centre distance': '26,673 ly (GRAVITY 2019)', 'Model': 'Procedural / illustrative' },
    importance: 1, viewDistanceLy: 180000, links: [sim('Milky Way')],
  },
  {
    id: 'andromeda', name: 'Andromeda Galaxy (M31)', aliases: ['M31', 'M 31', 'NGC 224', 'Andromeda'], category: 'galaxy', visual: 'galaxy',
    position: { kind: 'equatorial', raDeg: 10.6847, decDeg: 41.2687, distanceLy: 2.537 * MLY }, parents: [], memberOf: ['local-group'], nearby: ['m33', 'milky-way'],
    extentLy: 220000, distance: { valueLy: 2.537 * MLY, uncertaintyLy: 0.07 * MLY, basis: 'Cepheid / TRGB distance (~778 kpc)' },
    color: '#bcd0ff', provenance: 'curated-approximate', confidence: 'high',
    source: { catalogue: CUR, identifier: 'M31 / NGC 224' },
    info: 'The nearest large spiral galaxy and the most massive member of the Local Group alongside the Milky Way. Approaching us at ~110 km/s.',
    props: { 'Type': 'SA(s)b spiral', 'Approx. diameter': '~220,000 ly' }, importance: 1, viewDistanceLy: 600000, links: [sim('M31'), ned('M31')],
  },
  {
    id: 'm33', name: 'Triangulum Galaxy (M33)', aliases: ['M33', 'M 33', 'NGC 598', 'Triangulum'], category: 'galaxy', visual: 'galaxy',
    position: { kind: 'equatorial', raDeg: 23.4621, decDeg: 30.6602, distanceLy: 2.73 * MLY }, parents: [], memberOf: ['local-group'], nearby: ['andromeda'],
    extentLy: 60000, distance: { valueLy: 2.73 * MLY, uncertaintyLy: 0.14 * MLY, basis: 'Cepheid / TRGB distance (~840 kpc)' },
    color: '#c8dcff', provenance: 'curated-approximate', confidence: 'medium',
    source: { catalogue: CUR, identifier: 'M33 / NGC 598' },
    info: 'The third-largest member of the Local Group; a spiral galaxy with active star formation.',
    props: { 'Type': 'SA(s)cd spiral', 'Approx. diameter': '~60,000 ly' }, importance: 0.9, viewDistanceLy: 200000, links: [sim('M33'), ned('M33')],
  },
  {
    id: 'orion-arm', name: 'Orion Arm (Orion Spur)', aliases: ['Orion Spur', 'Local Arm'], category: 'galactic-structure', visual: 'marker',
    position: { kind: 'sun' }, parents: [], memberOf: ['milky-way'], nearby: ['sun'],
    extentLy: 10000, color: '#7fe8ff', provenance: 'illustrative', confidence: 'medium', schematic: true,
    source: { catalogue: 'Xu et al. 2016, Sci. Adv. 2, e1600878 (maser parallaxes)', note: 'Drawn as a schematic line through the Sun; length ~20,000 ly, width ~3,500 ly.' },
    info: 'A minor spiral structure ("spur") between the Sagittarius and Perseus arms that hosts the Solar System. Its drawn path here is schematic.',
    props: { 'Length': '~20,000 ly', 'Width': '~3,500 ly', 'Drawn as': 'Schematic line' }, importance: 0.8, viewDistanceLy: 9000,
  },
  {
    id: 'carina', name: 'Carina Nebula', aliases: ['NGC 3372', 'Eta Carinae Nebula'], category: 'nebula', visual: 'nebula',
    position: { kind: 'equatorial', raDeg: 161.2658, decDeg: -59.6844, distanceLy: 8500 }, parents: [], memberOf: ['milky-way'], nearby: [],
    extentLy: 300, distance: { valueLy: 8500, uncertaintyLy: 1000, basis: 'Published estimates 7,500–8,500 ly' },
    color: '#ff7a9c', provenance: 'curated-approximate', confidence: 'medium',
    source: { catalogue: CUR, identifier: 'NGC 3372' },
    info: 'A large star-forming region in the Carina–Sagittarius arm hosting Eta Carinae and many massive stars. Drawn as an extended glow; structure is illustrative.',
    props: { 'Type': 'Emission nebula', 'Extent': '~300 ly' }, importance: 0.85, viewDistanceLy: 700, links: [sim('NGC 3372')],
  },
  {
    id: 'alnitak', name: 'Alnitak (Zeta Orionis)', aliases: ['Zeta Ori', 'Zeta Orionis', 'HD 37742', 'HIP 26727', 'HR 1948', "Orion's Belt (east)", 'Alnitah'], category: 'star', visual: 'star',
    position: { kind: 'equatorial', raDeg: 85.1897, decDeg: -1.9426, distanceLy: 1260 }, parents: [], memberOf: ['milky-way'], nearby: ['alnilam', 'mintaka'],
    displayRadiusAU: 0.6,
    distance: { valueLy: 1260, uncertaintyLy: 150, basis: 'Hipparcos-based (approximate)' }, color: '#a8c8ff', provenance: 'curated-approximate', confidence: 'medium',
    source: { catalogue: CUR, identifier: 'HD 37742' }, info: 'Eastern star of Orion\'s Belt: a multiple system with a hot O-type supergiant. It is NOT physically close to the other belt stars along our line of sight.',
    props: { 'Spectral type': 'O9.5Ib', 'Radius': '~20 R☉ (0.093 AU)', 'Temperature': '~29,500 K' }, importance: 0.7, viewDistanceLy: 0.00008, links: [sim('Alnitak')],
  },
  {
    id: 'alnilam', name: 'Alnilam (Epsilon Orionis)', aliases: ['Eps Ori', 'Epsilon Orionis', 'HD 37128', 'HIP 26311', 'HR 1903', "Orion's Belt (central)"], category: 'star', visual: 'star',
    position: { kind: 'equatorial', raDeg: 84.0534, decDeg: -1.2019, distanceLy: 2000 }, parents: [], memberOf: ['milky-way'], nearby: ['alnitak', 'mintaka'],
    displayRadiusAU: 0.8,
    distance: { valueLy: 2000, uncertaintyLy: 400, basis: 'Hipparcos-based (large uncertainty)' }, color: '#9fc0ff', provenance: 'curated-approximate', confidence: 'low',
    source: { catalogue: CUR, identifier: 'HD 37128' }, info: 'Central belt star, a luminous blue supergiant. Its parallax distance is poorly constrained (~±20%).',
    props: { 'Spectral type': 'B0Ia', 'Radius': '~32 R☉ (0.15 AU)', 'Temperature': '~27,000 K' }, importance: 0.7, viewDistanceLy: 0.0001, links: [sim('Alnilam')],
  },
  {
    id: 'mintaka', name: 'Mintaka (Delta Orionis)', aliases: ['Del Ori', 'Delta Orionis', 'HD 36486', 'HIP 25930', 'HR 1852', "Orion's Belt (west)"], category: 'star', visual: 'star',
    position: { kind: 'equatorial', raDeg: 83.0017, decDeg: -0.2991, distanceLy: 1200 }, parents: [], memberOf: ['milky-way'], nearby: ['alnilam', 'alnitak'],
    displayRadiusAU: 0.6,
    distance: { valueLy: 1200, uncertaintyLy: 150, basis: 'Hipparcos-based (approximate)' }, color: '#a8c8ff', provenance: 'curated-approximate', confidence: 'medium',
    source: { catalogue: CUR, identifier: 'HD 36486' }, info: 'Western belt star; a multiple system including an eclipsing binary.',
    props: { 'Spectral type': 'O9.5II', 'Radius': '~16 R☉ (0.075 AU)', 'Temperature': '~29,500 K' }, importance: 0.7, viewDistanceLy: 0.00008, links: [sim('Mintaka')],
  },
  {
    id: 'betelgeuse', name: 'Betelgeuse (Alpha Orionis)', aliases: ['Betelgeuse', 'Alpha Ori', 'Alpha Orionis', 'HD 39801', 'HIP 27989', 'HR 2061', 'Betelgeux', 'Beteiguex'], category: 'star', visual: 'star',
    position: { kind: 'equatorial', raDeg: 88.7929, decDeg: 7.4071, distanceLy: 548 }, parents: [], memberOf: ['milky-way'], nearby: [],
    displayRadiusAU: 3.55,
    distance: { valueLy: 548, uncertaintyLy: 90, basis: 'Joyce et al. 2020 (seismic + astrometric)' }, color: '#ff6b35', provenance: 'curated-approximate', confidence: 'medium',
    source: { catalogue: CUR, identifier: 'HD 39801' }, info: 'A colossal M-type red supergiant nearing the end of its nuclear life cycle. With a physical radius of ~764 solar radii (~3.55 AU), if placed at the centre of our Solar System its surface would engulf Mars and approach the orbit of Jupiter. It will eventually explode as a core-collapse Type II-P supernova.',
    props: { 'Spectral type': 'M1-M2 Ia-ab', 'Radius': '~764 R☉ (~3.55 AU / 530,000,000 km)', 'Mass': '~16.5–19 M☉', 'Luminosity': '~100,000 L☉', 'Variable': 'Semi-regular pulsating' }, importance: 1.0, viewDistanceLy: 0.0003, links: [sim('Betelgeuse')],
  },
  {
    id: 'pleiades', name: 'Pleiades (M45)', aliases: ['M45', 'M 45', 'Seven Sisters', 'Messier 45', 'Subaru'], category: 'star-cluster', visual: 'starcluster',
    position: { kind: 'equatorial', raDeg: 56.75, decDeg: 24.1167, distanceLy: 444 }, parents: [], memberOf: ['milky-way'], nearby: [],
    extentLy: 86, distance: { valueLy: 444, uncertaintyLy: 8, basis: 'Gaia DR2 parallax (~136 pc)' }, color: '#9ec8ff', provenance: 'curated-approximate', confidence: 'high',
    source: { catalogue: CUR, identifier: 'M45' }, info: 'An open cluster of ~1,000 hot young stars dominated by luminous blue B-type stars. Unlike constellations, this IS a physical, gravitationally bound group embedded in a reflection nebula.',
    props: { 'Age': '~100 million years', 'Dominant stars': 'Alcyone, Atlas, Electra, Maia', 'Distance': '~444 ly (Gaia DR2)' }, importance: 0.9, viewDistanceLy: 110, links: [sim('M45')],
  },
  {
    id: 'aldebaran', name: 'Aldebaran (Alpha Tauri)', aliases: ['Aldebaran', 'Alpha Tau', 'Alpha Tauri', 'HD 29139', 'HIP 21421', 'HR 1457', "Bull's Eye"], category: 'star', visual: 'star',
    position: { kind: 'equatorial', raDeg: 68.98, decDeg: 16.5093, distanceLy: 65.3 }, parents: [], memberOf: ['milky-way'], nearby: [],
    displayRadiusAU: 0.8,
    distance: { valueLy: 65.3, uncertaintyLy: 0.5, basis: 'Hipparcos parallax' }, color: '#ff9d42', provenance: 'curated-approximate', confidence: 'high',
    source: { catalogue: CUR, identifier: 'HD 29139' }, info: 'An orange giant star, the brightest in the constellation Taurus. Although it appears line-of-sight aligned with the Hyades cluster, it is a foreground star located ~65 ly away (~2.5× closer than the cluster).',
    props: { 'Spectral type': 'K5+ III', 'Radius': '~44 R☉ (~0.20 AU)', 'Luminosity': '~439 L☉', 'Distance': '65.3 ly' }, importance: 0.85, viewDistanceLy: 0.00012, links: [sim('Aldebaran')],
  },
  // --- Solar System ---
  {
    id: 'sun', name: 'Sun', aliases: ['Sol'], category: 'star', visual: 'sun',
    position: { kind: 'sun' }, parents: [], memberOf: ['milky-way', 'orion-arm'], nearby: [],
    displayRadiusAU: 0.05, color: '#ffd27a', provenance: 'computed-model', confidence: 'high',
    source: { catalogue: 'NASA Solar System Exploration', note: 'Radius 695,700 km (0.00465 AU). Display radius exaggerated ~10×.' },
    info: 'The G2V star at the centre of the Solar System, ~26,673 ly from the Galactic Centre.',
    props: { 'True radius': '695,700 km', 'Display radius': 'Exaggerated (~10×)', 'Spectral type': 'G2V' }, importance: 1, viewDistanceLy: 0.0006,
  },
  ...[
    ['mercury', 'Mercury', '#b5a79a', 0.006, '4,879 km diameter. Fastest planet; 88-day year.', { 'Mean radius': '2,439.7 km', 'Orbital period': '87.97 d', 'Semi-major axis': '0.387 AU' }],
    ['venus', 'Venus', '#e8c98a', 0.009, 'Thick CO₂ atmosphere, hottest planet (~465 °C).', { 'Mean radius': '6,051.8 km', 'Orbital period': '224.7 d', 'Semi-major axis': '0.723 AU' }],
    ['earth', 'Earth', '#4f9bff', 0.012, 'Our home planet; the only known world with life. Texture is procedural (illustrative), not a satellite image.', { 'Mean radius': '6,371.0 km', 'Orbital period': '365.256 d', 'Semi-major axis': '1.000 AU', 'Moons': '1' }],
    ['mars', 'Mars', '#d9704a', 0.008, 'Cold desert world with the largest volcano in the Solar System.', { 'Mean radius': '3,389.5 km', 'Orbital period': '687.0 d', 'Semi-major axis': '1.524 AU' }],
    ['jupiter', 'Jupiter', '#d8b48a', 0.07, 'Largest planet; gas giant with 95+ known moons.', { 'Mean radius': '69,911 km', 'Orbital period': '11.86 yr', 'Semi-major axis': '5.203 AU' }],
    ['saturn', 'Saturn', '#e6d29a', 0.06, 'Gas giant with a prominent ring system (rings shown with schematic radii).', { 'Mean radius': '58,232 km', 'Orbital period': '29.46 yr', 'Semi-major axis': '9.537 AU' }],
    ['uranus', 'Uranus', '#9fe3e8', 0.035, 'Ice giant rotating on its side (axial tilt 98°).', { 'Mean radius': '25,362 km', 'Orbital period': '84.0 yr', 'Semi-major axis': '19.19 AU' }],
    ['neptune', 'Neptune', '#5877ff', 0.034, 'Ice giant with supersonic winds.', { 'Mean radius': '24,622 km', 'Orbital period': '164.8 yr', 'Semi-major axis': '30.07 AU' }],
  ].map(([id, name, color, r, info, props]) => ({
    id: id as string, name: name as string, aliases: [] as string[], category: 'planet' as Category, visual: 'planet' as Visual,
    position: { kind: 'planet', body: id as string } as PositionSpec, parents: ['sun'], memberOf: [], nearby: [],
    displayRadiusAU: r as number, color: color as string, provenance: 'computed-model' as Provenance, confidence: 'medium' as const,
    source: { catalogue: 'JPL approximate Keplerian elements (1800–2050); NASA planetary fact sheets', note: 'Position is an approximate model, not JPL Horizons. Display radius exaggerated.' },
    info: info as string, props: props as Record<string, string>, importance: id === 'earth' || id === 'jupiter' || id === 'saturn' ? 0.9 : 0.6,
    viewDistanceLy: (r as number) * 4 * LY_PER_AU,
  } as CosmicObject)),
  {
    id: 'moon', name: 'Moon', aliases: ['Luna', 'The Moon'], category: 'moon', visual: 'planet',
    position: { kind: 'moon', parent: 'earth' }, parents: ['earth'], memberOf: [], nearby: [],
    displayRadiusAU: 0.0035, color: '#c9c9c9', provenance: 'illustrative', confidence: 'low', schematic: true,
    source: { catalogue: 'NASA Moon Fact Sheet', note: 'Orbit drawn as a simplified circular orbit at an EXAGGERATED distance (real: 384,400 km = 0.00257 AU).' },
    info: 'Earth\'s only natural satellite. Its displayed distance is exaggerated so that it is visible beside Earth.',
    props: { 'Mean radius': '1,737.4 km', 'Orbital period': '27.32 d', 'True mean distance': '384,400 km' }, importance: 0.7, viewDistanceLy: 0.0035 * 4 * LY_PER_AU,
  },
]

export const BY_ID: Record<string, CosmicObject> = Object.fromEntries(OBJECTS.map((o) => [o.id, o]))

/** Add an object from a live catalogue / user dataset at runtime (never overwrites bundled objects). */
export function registerObject(o: CosmicObject): boolean {
  if (BY_ID[o.id]) return false
  OBJECTS.push(o)
  BY_ID[o.id] = o
  return true
}
export const MOON_DISPLAY_AU = 0.03

const posCache = new Map<string, Vec3>()

/** Root-frame position (galactic ly). Time-dependent for planets/moon. */
export function positionOf(o: CosmicObject, ms: number): Vec3 {
  const p = o.position
  switch (p.kind) {
    case 'origin': return [0, 0, 0]
    case 'sun': return SUN_POS
    case 'planet': return planetRootPos(p.body, ms)
    case 'moon': return add(planetRootPos(p.parent, ms), moonOffsetLy(ms, MOON_DISPLAY_AU))
    case 'offset': {
      if (o.id === 'local-group') { // schematic barycentre-ish: midway MW<->M31
        const m31 = positionOf(BY_ID.andromeda, ms)
        return [m31[0] * 0.4, m31[1] * 0.4, m31[2] * 0.4]
      }
      return positionOf(BY_ID[p.from], ms)
    }
    default: {
      const hit = posCache.get(o.id)
      if (hit) return hit
      const v = p.kind === 'equatorial'
        ? raDecDistToRoot(p.raDeg, p.decDeg, p.distanceLy)
        : sunRelativeToRoot(galacticLBToUnit(p.lDeg, p.bDeg), p.distanceLy)
      posCache.set(o.id, v)
      return v
    }
  }
}

export const isDynamic = (o: CosmicObject) => o.position.kind === 'planet' || o.position.kind === 'moon'

/** Visual radius in ly (extent/2 or exaggerated display radius). */
export function radiusLyOf(o: CosmicObject): number {
  if (o.displayRadiusAU) return o.displayRadiusAU * LY_PER_AU
  if (o.extentLy) return o.extentLy / 2
  return 0
}

export function searchObjects(q: string, list: CosmicObject[] = OBJECTS): CosmicObject[] {
  const raw = q.trim().toLowerCase()
  const n = normalizeName(q)
  if (!n) return []
  const tokens = raw.split(/\s+/).filter(Boolean)
  return list
    .map((o) => {
      const allNames = [o.name, o.id, ...o.aliases]
      const namesNorm = allNames.map(normalizeName)
      let score = 0
      if (namesNorm.some((x) => x === n)) score = 5
      else if (namesNorm.some((x) => x.startsWith(n))) score = 4
      else if (allNames.some((name) => tokens.every((tok) => name.toLowerCase().includes(tok)))) score = 3
      else if (namesNorm.some((x) => x.includes(n))) score = 2
      else if (tokens.some((tok) => namesNorm.some((x) => x.includes(tok)))) score = 1
      return { o, score }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.o.importance - a.o.importance)
    .map((r) => r.o)
}

export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function childrenOf(id: string): CosmicObject[] {
  return OBJECTS.filter((o) => o.parents.includes(id) || o.memberOf.includes(id))
}
