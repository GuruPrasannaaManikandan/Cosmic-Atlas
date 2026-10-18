export type SoundtrackCategory =
  | 'deep-space'
  | 'interstellar'
  | 'cosmic-wonder'
  | 'stellar'
  | 'solar-system'

export interface TrackInfo {
  id: SoundtrackCategory
  category: SoundtrackCategory
  title: string
  subtitle: string
  description: string
  bpm: number
  key: string
}

export const SOUNDTRACKS: Record<SoundtrackCategory, TrackInfo> = {
  'deep-space': {
    id: 'deep-space',
    category: 'deep-space',
    title: 'Deep Space Odyssey',
    subtitle: 'Cosmic Microwave Background & Voids',
    description: 'Slow, expansive sub-bass drone with resonant low-frequency harmonics and celestial breath.',
    bpm: 45,
    key: 'D Minor',
  },
  'interstellar': {
    id: 'interstellar',
    category: 'interstellar',
    title: 'Interstellar Voyage',
    subtitle: 'Relativistic Galactic Crossing',
    description: 'Cinematic tension with evolving analog synth pads and slow harmonic progressions.',
    bpm: 52,
    key: 'A Minor',
  },
  'cosmic-wonder': {
    id: 'cosmic-wonder',
    category: 'cosmic-wonder',
    title: 'Cosmic Wonder',
    subtitle: 'Nebulae & Stellar Nurseries',
    description: 'Ethereal crystalline ambient with reverberant FM bells and harmonic shimmer.',
    bpm: 48,
    key: 'F Major',
  },
  'stellar': {
    id: 'stellar',
    category: 'stellar',
    title: 'Stellar Exploration',
    subtitle: 'Supergiants & Stellar Atmospheres',
    description: 'Warm, contemplative drone with low-frequency solar pulsation and harmonic overtones.',
    bpm: 40,
    key: 'C Major',
  },
  'solar-system': {
    id: 'solar-system',
    category: 'solar-system',
    title: 'Solar System Ambience',
    subtitle: 'Planetary Orbits & Cislunar Space',
    description: 'Restrained, peaceful exploratory soundscape suited for visiting planets and moons.',
    bpm: 50,
    key: 'G Major',
  },
}

export const SOUNDTRACK_LIST: TrackInfo[] = Object.values(SOUNDTRACKS)
export const TRACK_BY_ID = SOUNDTRACKS
