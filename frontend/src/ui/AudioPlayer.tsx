import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/CosmicAudioEngine'
import { SOUNDTRACKS, SoundtrackCategory } from '../audio/types'

export function AudioPlayer() {
  const [, setTick] = useState(0)
  const [open, setOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return audio.subscribe(() => setTick((x) => x + 1))
  }, [])

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      window.addEventListener('mousedown', handleOutside)
    }
    return () => window.removeEventListener('mousedown', handleOutside)
  }, [open])

  const isPlaying = audio.getIsPlaying()
  const isMuted = audio.getIsMuted()
  const volume = audio.getVolume()
  const sfxEnabled = audio.getSfxEnabled()
  const currentTrack = audio.getTrack()
  const trackInfo = audio.getTrackInfo()

  return (
    <div className="audio-player-widget" ref={popoverRef}>
      {/* Topnav compact trigger */}
      <button
        className={'btn ghost audio-btn' + (isPlaying ? ' on' : '') + (isMuted ? ' muted' : '')}
        onClick={() => setOpen(!open)}
        title={isMuted ? 'Audio Muted' : isPlaying ? `Playing: ${trackInfo.title}` : 'Cosmic Audio Engine'}
        aria-label="Cosmic Audio Engine controls"
      >
        <span className="audio-icon">{isMuted ? '🔇' : isPlaying ? '🎵' : '🔈'}</span>
        <span className="audio-label">{isMuted ? 'Muted' : isPlaying ? trackInfo.title : 'Audio'}</span>
        {isPlaying && !isMuted && (
          <span className="audio-eq" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
      </button>

      {/* Flyout Audio Control Panel */}
      {open && (
        <div className="audio-popover glass" role="dialog" aria-label="Audio controls">
          <div className="panel-head">
            <div>
              <div className="eyebrow cy">COSMIC AUDIO ENGINE</div>
              <h3>Space Odyssey Soundscape</h3>
            </div>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close audio settings">
              ✕
            </button>
          </div>

          <div className="audio-current-track">
            <b>{trackInfo.title}</b>
            <div className="audio-track-sub">{trackInfo.subtitle}</div>
            <p className="audio-track-desc">{trackInfo.description}</p>
          </div>

          {/* Primary Transport Controls */}
          <div className="audio-transport">
            <button
              className={'btn ' + (isPlaying ? 'primary' : '')}
              onClick={() => {
                audio.playUiClick()
                audio.togglePlay()
              }}
            >
              {isPlaying ? '⏸ Pause' : '▶ Play Ambience'}
            </button>
            <button
              className={'btn ' + (isMuted ? 'warn' : '')}
              onClick={() => {
                audio.playUiClick()
                audio.toggleMute()
              }}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? '🔇 Unmute' : '🔊 Mute'}
            </button>
          </div>

          {/* Master Volume Slider */}
          <div className="audio-vol-row">
            <label htmlFor="audio-vol">Volume: {Math.round(volume * 100)}%</label>
            <input
              id="audio-vol"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => audio.setVolume(parseFloat(e.target.value))}
              disabled={isMuted}
            />
          </div>

          {/* Soundtrack Category Selector */}
          <div className="audio-select-row">
            <label htmlFor="audio-track-select">Soundtrack Theme:</label>
            <select
              id="audio-track-select"
              className="audio-track-dropdown"
              value={currentTrack}
              onChange={(e) => audio.setTrack(e.target.value as SoundtrackCategory)}
            >
              {Object.values(SOUNDTRACKS).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.key})
                </option>
              ))}
            </select>
          </div>

          {/* Environmental Sound Effects Toggle */}
          <div className="audio-toggle-row">
            <label>
              <input
                type="checkbox"
                checked={sfxEnabled}
                onChange={(e) => audio.setSfxEnabled(e.target.checked)}
              />
              <span>Environmental SFX (UI, thrusters, cosmic events)</span>
            </label>
          </div>

          {/* Scientific Licensing & Provenance Footer */}
          <div className="audio-provenance">
            <small>
              Synthesized in real-time via Web Audio API. 100% original, copyright-free procedural soundtrack.
            </small>
          </div>
        </div>
      )}
    </div>
  )
}
