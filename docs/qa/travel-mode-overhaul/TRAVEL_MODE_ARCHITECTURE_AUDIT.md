# Travel Mode architecture audit

## Two flight systems
1. **Explore warp flight** (observer camera):
   - Path: `store.travel` -> `travelEngine.initiateTravel` -> `stepTravel` -> `nav.pos` / `nav.quat`.
   - `nav.ts` held a duplicate stepper (the flight branch of `stepNavigation`) used by the legacy `flyTo`.
   - HUD: `TravelProgressHUD`.
2. **Travel Mode spacecraft**:
   - Path: `store.enterTravelMode` -> `shipState.initShipNear`.
   - Physics: `stepShipPhysics` (gears, thrust, damping, braking).
   - Autopilot: `engageAutopilot` (align, accelerate, cruise, decelerate, arrive).
   - Co-moving reference frame: `ship.refBodyId` + exact `ship.localKm`.
   - UI: `TravelHUD`, `NavMapModal`, `CockpitOverlay`. Keys in `travelKeys.ts` (`KeyboardEvent.code`; ignored while typing).

## Flow traced
- **User action:** search / label / chip / nav map / top-nav button.
- **Store dispatch:** `travel` or `enterTravelMode`.
- **Engine:** the flight engine (Explore) or ship state (Travel).
- **Per frame:** `Scene` `useFrame` -> `stepTravel` / `stepNavigation` / `stepShipPhysics` -> camera at the scene origin. Bodies are placed camera-relative with compressed distance.

## Findings
See `TRAVEL_MODE_DEFECT_REGISTER.md`.

## Ruled out by measurement
- **Float64 quantisation jitter** while following small moons: 0.000 km frame-to-frame at Phobos (46 km away), Mars and the Moon.
- **Explore flights from a common point:** they already departed from `nav.pos`. The real continuity defect was Travel Mode entry (TM-1).
