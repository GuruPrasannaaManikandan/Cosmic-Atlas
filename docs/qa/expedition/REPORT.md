# M3: Explore expedition (local, uncommitted)

## What changed

The expedition no longer cuts from an orbital camera flight straight onto the ground. It is now an automated, conceptual flight on the Relive engine. The flights are in `frontend/src/relive/expeditionFlight.ts` and the hand-offs in `frontend/src/expedition/expedition.ts`.

### Moon, outbound
1. Low Earth orbit and the departure burn, then stage separation.
2. The coast to the Moon.
3. Lunar orbit insertion and one revolution.
4. The descent orbit, then the powered descent to a 420 m hover over the site.
5. The surface view takes over. The conceptual lander flies its last 420 m onto the **measured LROC terrain**, beside Apollo 11's LM, and lowers its ramp.
6. The astronaut steps off and control returns to the player.

### Moon, return
1. **Return to orbit**: the astronaut boards and the lander lifts off on the measured terrain.
2. The return flight takes over above the site: ascent to lunar orbit, then the return burn.
3. The coast home and capture into Earth orbit.
4. Back in the orbital explorer, at Earth.

### Mars, outbound
1. Earth departure and the cruise.
2. The approach, then entry with heating glow.
3. Parachute, then a powered landing.
4. The ramp comes down and the rover drives off.
5. The Unity HiRISE view opens in exploration at the rover. There is no separate camera drop.

### Mars, return
The rover stays on Mars, as every Mars rover has. The view pulls back from the rover and its lander, out to orbit, and then returns to the orbital explorer at Mars.

## Honesty
- **Conceptual by label:** the vehicles and their sequence are conceptual and are labelled CONCEPTUAL in the HUD, on the event cards and under "How this is built".
- **One derived value:** the coast lasts as long as the site's real mission took from launch to landing, from the catalogue dates. That is 4.28 d for Apollo 11 and 201 d for Opportunity.
- **No historical claims:** no expedition event claims a historical time, and a unit test enforces it.
- **Real geometry:** the Earth, Moon and Mars positions and the Sun direction are the real ones for the date. The Moon landing is timed for the site's sourced daylight moment; the Mars landing for the Unity scene's moment (11 Sep 2007, 16:48 UTC).
- **Skip and Cancel:** Skip jumps to the end of the flight, which still lands. Cancel restores the explorer.

## Evidence (real Chrome, GPU, 1600×900)

| Check | Result |
|---|---|
| `scripts/e2e/expedition_check.py`, dev (:5173) | 23/23 passed |
| `scripts/e2e/expedition_check.py`, production preview (:4173) | 23/23 passed |
| Abandoned journey | 42/42 (M05 and M-exit updated for the new flow) |
| Controls | 27/27 (2 skipped) |
| Relive check | PASS |
| Unit tests | 284/284 (13 new in `relive/expedition.test.ts`) |
| `tsc` and production build | clean |

The screenshots in this folder are named `<world>_<phase>_<percent>.png`, plus the `*_surface_*` and `*_back_in_orbit` frames. `expedition_check.json` holds every check with its details.
