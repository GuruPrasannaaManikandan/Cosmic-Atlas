export type CosmicEventCategory = 'supernova' | 'pulsar' | 'black-hole' | 'nebula'

export type CosmicEventProvenance =
  | 'measured'
  | 'model-based'
  | 'illustrative'
  | 'hypothetical-simulation'

export interface CosmicEventStage {
  timeSec: number
  name: string
  subtitle: string
  description: string
  physicsNotes: string
}

export interface CosmicEventDefinition {
  id: string
  name: string
  category: CosmicEventCategory
  title: string
  tagline: string
  scientificDescription: string
  provenance: CosmicEventProvenance
  source: { name: string; url?: string; note: string }
  durationSec: number
  stages: CosmicEventStage[]
  associatedObjectId?: string // e.g. 'betelgeuse'
  defaultCamera: {
    dist: number
    pitch: number
    yaw: number
  }
}
