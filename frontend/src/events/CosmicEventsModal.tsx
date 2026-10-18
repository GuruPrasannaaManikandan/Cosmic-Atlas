import { useState } from 'react'
import { COSMIC_EVENTS } from './eventsCatalog'
import { CosmicEventCategory, CosmicEventDefinition } from './types'
import { startEvent } from './eventState'
import { audio } from '../audio/CosmicAudioEngine'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function CosmicEventsModal({ isOpen, onClose }: Props) {
  const [filter, setFilter] = useState<CosmicEventCategory | 'all'>('all')

  if (!isOpen) return null

  const filtered = filter === 'all' 
    ? COSMIC_EVENTS 
    : COSMIC_EVENTS.filter((e) => e.category === filter)

  const handleLaunch = (event: CosmicEventDefinition) => {
    audio.playUiClick('navigate')
    startEvent(event.id)
    onClose()
  }

  return (
    <div className="events-modal-overlay" onClick={onClose}>
      <div className="events-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="events-modal-header">
          <div>
            <h2 className="events-modal-title">🌌 Cosmic Events Observatory</h2>
            <p className="events-modal-subtitle">
              Interactive 3D astrophysical simulations and dynamic cosmic phenomena.
            </p>
          </div>
          <button className="events-modal-close" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {/* Filter categories */}
        <div className="events-filter-bar">
          <button
            className={`events-filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Phenomena ({COSMIC_EVENTS.length})
          </button>
          <button
            className={`events-filter-btn ${filter === 'supernova' ? 'active' : ''}`}
            onClick={() => setFilter('supernova')}
          >
            💥 Supernovae
          </button>
          <button
            className={`events-filter-btn ${filter === 'pulsar' ? 'active' : ''}`}
            onClick={() => setFilter('pulsar')}
          >
            ⚡ Pulsars
          </button>
          <button
            className={`events-filter-btn ${filter === 'black-hole' ? 'active' : ''}`}
            onClick={() => setFilter('black-hole')}
          >
            🕳️ Black Holes
          </button>
          <button
            className={`events-filter-btn ${filter === 'nebula' ? 'active' : ''}`}
            onClick={() => setFilter('nebula')}
          >
            ✨ Nebulae
          </button>
        </div>

        {/* Event Cards Grid */}
        <div className="events-grid">
          {filtered.map((item) => (
            <div key={item.id} className="event-card">
              <div className="event-card-header">
                <span className={`event-badge badge-${item.provenance}`}>
                  {item.provenance === 'hypothetical-simulation'
                    ? 'Hypothetical Simulation'
                    : item.provenance === 'model-based'
                    ? 'Astrophysical Model'
                    : 'Observational Model'}
                </span>
                <span className="event-duration">{item.durationSec}s simulation</span>
              </div>

              <h3 className="event-card-title">{item.name}</h3>
              <div className="event-card-subtitle">{item.title}</div>
              <p className="event-card-desc">{item.scientificDescription}</p>

              <div className="event-card-stages-preview">
                <span className="stages-label">Timeline Stages:</span>
                <div className="stages-chips">
                  {item.stages.map((stg, idx) => (
                    <span key={idx} className="stage-chip">
                      {stg.name.split(':')[0]}
                    </span>
                  ))}
                </div>
              </div>

              <div className="event-card-footer">
                <div className="event-source-cite" title={item.source.note}>
                  📚 {item.source.name}
                </div>
                <button
                  className="event-launch-btn"
                  onClick={() => handleLaunch(item)}
                >
                  ▶ Launch Simulation
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
