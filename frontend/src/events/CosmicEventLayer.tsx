import { useState, useEffect } from 'react'
import { eventState, subscribeEventState } from './eventState'
import { SupernovaRenderer } from './SupernovaRenderer'
import { PulsarRenderer } from './PulsarRenderer'
import { BlackHoleRenderer } from './BlackHoleRenderer'
import { NebulaRenderer } from './NebulaRenderer'

export function CosmicEventLayer() {
  const [activeId, setActiveId] = useState(eventState.activeId)

  useEffect(() => {
    return subscribeEventState(() => {
      setActiveId(eventState.activeId)
    })
  }, [])

  if (!activeId) return null

  switch (activeId) {
    case 'supernova-betelgeuse':
      return <SupernovaRenderer />
    case 'pulsar-crab':
      return <PulsarRenderer />
    case 'black-hole-m87':
      return <BlackHoleRenderer />
    case 'nebula-carina':
      return <NebulaRenderer />
    default:
      return null
  }
}
