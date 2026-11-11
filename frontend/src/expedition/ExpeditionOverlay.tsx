import { relive, useRelive } from '../relive/player'
import { useEffect } from 'react'
import { useExpedition, expedition, STAGE_TEXT, realCruise, type ExpeditionStage } from './expedition'
import { travelEngineState } from '../travel/travelEngine'
import { fmtDistance } from '../travel/TravelProgressHUD'
import { input } from '../input/appInput'
import { citeGroups } from '../missions'
import './expedition.css'
import { openSitePicker } from '../surface/ExploreSurface'
import { unitySitesForBody, sitesForBody } from '../surface/sites'

const ORDER: Exclude<ExpeditionStage, 'idle'>[] = ['departure', 'cruise', 'approach', 'arrival']

/** captions, stage track and Skip for a running expedition (the flight itself is the orbital scene behind it) */
export function ExpeditionOverlay() {
  const E = useExpedition()
  const flying = useRelive((s) => !!s.id)
  useEffect(() => input.on('back', () => expedition.skip(), 'UI_INTERACTION'), [])
  // the flight itself is drawn by the Relive engine (full screen, with its own captions and controls)
  if (flying || E.stage === 'idle' || !E.dest) return null
  const text = STAGE_TEXT[E.dest][E.stage]
  const real = realCruise(E.siteId)
  const idx = ORDER.indexOf(E.stage)
  return (
    <div className="expedition" role="status" aria-live="polite" data-testid="expedition" data-stage={E.stage}>
      <span className="eyebrow">EXPEDITION TO {E.dest === 'moon' ? 'THE MOON' : 'MARS'} · ABANDONED BUT NOT FORGOTTEN</span>
      <ol className="exp-track" aria-label="Expedition stages">
        {ORDER.map((s, i) => (
          <li key={s} className={i < idx ? 'done' : i === idx ? 'now' : ''}>
            {STAGE_TEXT[E.dest!][s].title}
          </li>
        ))}
        <li className={E.stage === 'arrival' ? 'now' : ''}>Surface</li>
      </ol>
      <b className="exp-title">{text.title}</b>
      <p className="exp-text">{text.text}</p>
      {(E.stage === 'cruise' || E.stage === 'approach') && (
        <div className="exp-progress" aria-label={`Flight ${Math.round(E.progress * 100)}%`}>
          <i style={{ width: `${Math.round(E.progress * 100)}%` }} />
          <span className="mono small">{fmtDistance(travelEngineState.distanceLy)} to go</span>
        </div>
      )}
      <p className="exp-honest small">
        Time-compressed camera flight, not the real trajectory; no launch vehicle is modelled yet.
        {real && (
          <>
            {' '}The real {real.mission} took <b>{real.days < 10 ? real.days.toFixed(1) : Math.round(real.days)} days</b> from launch to landing (derived from the catalogue dates{' '}
            {citeGroups(real.sources).map((g) => (
              <a key={g.label} href={g.url} target="_blank" rel="noreferrer" title={g.titles}>[{g.label}]</a>
            ))}
            ).
          </>
        )}
      </p>
      <div className="exp-actions">
        <button className="btn" onClick={() => expedition.skip()} data-testid="expedition-skip">Skip to the surface <kbd>Esc</kbd></button>
        <button className="btn ghost small" onClick={() => expedition.cancel()}>Cancel expedition</button>
      </div>
    </div>
  )
}

/** entry cards: the two expeditions of Abandoned but Not Forgotten */
export function ExpeditionLaunchers({ compact }: { compact?: boolean }) {
  return (
    <div className={'exp-launchers' + (compact ? ' compact' : '')}>
      <button className="exp-card moon" onClick={() => expedition.start('moon')} data-testid="start-expedition-moon">
        <span className="eyebrow">EXPEDITION · MOON</span>
        <b>The Apollo landing sites</b>
        {!compact && <span className="muted small">Six sites on LROC terrain. Lunar modules, ALSEP stations, retroreflectors and the rovers, where the astronauts left them.</span>}
      </button>
      <button className="exp-card mars" onClick={() => expedition.start('mars')} data-testid="start-expedition-mars">
        <span className="eyebrow">EXPEDITION · MARS</span>
        <b>Opportunity at Victoria crater</b>
        {!compact && <span className="muted small">HiRISE terrain in the embedded Unity renderer. Find the rover, inspect it, and relive its Victoria campaign drive by drive.</span>}
      </button>
      <button className="exp-card relive-a11" onClick={() => relive.open('apollo-11')} data-testid="relive-apollo-11">
        <span className="eyebrow">RELIVE THE MISSION · APOLLO 11</span>
        <b>Launch to splashdown</b>
        {!compact && <span className="muted small">Saturn V, staging, the coast, lunar orbit, the landing, the moonwalk and the return — on NASA's published mission clock.</span>}
      </button>
      <button className="exp-card relive-mer" onClick={() => relive.open('mer-opportunity')} data-testid="relive-mer-opportunity">
        <span className="eyebrow">RELIVE THE MISSION · OPPORTUNITY</span>
        <b>Launch, cruise, airbag landing</b>
        {!compact && <span className="muted small">Delta II launch, the cruise to Mars, entry, parachute, retro-rockets, 26 bounces into Eagle crater, and the drive off the lander.</span>}
      </button>
      {!compact && (
        <div className="exp-sites-row">
          <button className="btn exp-sites" onClick={() => openSitePicker('mars')} data-testid="open-sites-mars">
            ◉ Mars landing sites <span className="muted small">· {unitySitesForBody('mars').length} environments</span>
          </button>
          <button className="btn exp-sites" onClick={() => openSitePicker('moon')} data-testid="open-sites-moon">
            ◌ Moon landing sites <span className="muted small">· {sitesForBody('moon').filter((s) => s.available).length} Apollo sites</span>
          </button>
        </div>
      )}
    </div>
  )
}
