import type { DiscoveryCategory } from '../missions'

export const CATEGORY_LABEL: Record<DiscoveryCategory, string> = {
  'historical-spacecraft': 'Historical spacecraft',
  'historical-rover': 'Historical rover',
  'stationary-lander': 'Stationary lander',
  mobility: 'Mobility system',
  instrument: 'Scientific instrument',
  camera: 'Camera and imaging',
  communication: 'Communication',
  power: 'Power system',
  sampling: 'Sampling equipment',
  environmental: 'Environmental sensor',
  geological: 'Geological discovery',
  landmark: 'Landing-site landmark',
}
