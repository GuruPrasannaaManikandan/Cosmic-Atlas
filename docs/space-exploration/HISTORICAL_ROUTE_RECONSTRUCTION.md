# Historical Route Reconstruction

**Status:**
- **Stage 1 design.** The Opportunity route is **planned**: its record exists, but its frame is unknown and there are no points.
- The rule that an unknown frame is never drawn is **implemented and tested** (`frameUsable`, `validateRoutes`).

## 1. Principle

A route is drawn only when, for every point, we can say:
1. where the number came from (product, producer, row);
2. what coordinate frame it is in;
3. how uncertain it is.

If any of these is missing, the route stays in the data with status `planned` or `partial`, and the UI says why. A plausible-looking line is never drawn in its place.

## 2. Opportunity: available position data

| Source | Coverage | Frame stated? | Notes |
|---|---|---|---|
| `MERB_traverse_5130.csv` (WUSTL / PDS Geosciences Node; corrections by T. Parker) | Sols 1–5130, 21,104 drives | **No.** The label says "corrected x/y position"; the page says "easting / northing". Projection, datum, origin and units are not given | **Not a PDS archive product** (label: `DATA_SET_ID "N/A"`). Linear interpolation between corrected points. 1,463,086 bytes, not downloaded |
| Meridiani / Endeavour 25 cm basemap (CTX + HiRISE mosaic georeferenced to MOLA via HRSC ND4 / DA4) | Traverse region | Probably defines the traverse frame, but its **README link returns 404** | Image ~6 GB; README 3 KB |
| NAIF `mer1_surf_rover_0001_3240_v1.bsp` | Sols 1–3240 | **Yes:** SPICE frames relative to the landing site and Mars | 232 MB (time-subset service available) |
| NAIF `mer1_ls_040128_iau2000_v1.bsp` | Landing site | Yes | Landing-site position in IAU 2000 |
| Eagle / Endurance crater DTMs (`osu/` folder; producer not named) | Two craters | **No** (`PROJECTION_NAME Unknown`, metres) | Their extents fit a grid centred on the landing site with east/north axes. Endurance spans x 668–835 m, consistent with NASA's "about 750 m away". Not assumed until shown |
| Rover Motion Counter (PDS4, PDS Geosciences) | All drives | Site/drive frames (MER convention) | The archived raw source of the traverse |

## 3. Method to establish the traverse frame (Stage 2, needs approval to download)

1. **Read the data** (1.46 MB). Check the 21,104 rows against the label: field count, sol order and that it ends at sol 5130.
2. **Recover the basemap README.** Try the Analyst's Notebook copy, the USGS pigpen mirror and the Internet Archive. If it states the projection, adopt it and go to step 5.
3. **Fit the frame otherwise.** Compare CORRECTED_X / Y with independent, documented positions:
   - **SPICE:** rover positions from `mer1_surf_rover` at the start sol of each drive, for sols 1–3240, converted to planetocentric coordinates on the 3,396.19 km sphere;
   - **landing site:** NASA's 1.9483°S, 354.47417°E;
   - **named places with sourced coordinates**, if any are found.

   Candidate frames are tried in turn: local east/north metres from the landing site; equirectangular at the HiRISE centre longitudes; sinusoidal; Mars 2000 equidistant cylindrical. A frame is accepted only if the RMS residual against SPICE is **≤ 5 m**. All candidates and their residuals are recorded here.
4. **Check against terrain.** Draped on the HiRISE DTMs, crater-rim drives must sit on the rim and drives inside Victoria must lie inside it. Each check reports pass or fail, with screenshots in `docs/qa/space-exploration/`.
5. **Sols 3241–5130:** no SPICE. The frame found for sols 1–3240 is applied (it is one product, so one frame). The residual at sol 3240 is reported. Perseverance Valley positions are checked against the Endeavour DTM extent (lat −2.1248 to −2.4913).
6. **Write the outcome.** `frames.json` → `merb-traverse-corrected` gets its kind, axes and verified origin, and `routes.json` gets its points and `uncertaintyM` (the measured RMS, labelled as such). The route status becomes `implemented` only when the validator accepts it.

**If no frame reaches ≤ 5 m:**
- the route stays `partial`;
- only the SPICE-based sols 1–3240 are drawn;
- the gap is shown in the UI as "position record not available".

## 4. Rendering rules (Stage 3)

- **Route line:** draped on the terrain. Corrected (science-team) points and interpolated points are styled differently once the data shows which is which.
- **Uncertainty:** shown as a ribbon whose width is the measured RMS.
- **Rover between drives:** placed by linear interpolation in time, the product's own method, and labelled "interpolated position".
- **Hardware left behind** (lander, backshell, parachute, heat shield): positions only from sourced data, such as orbiter image identifications with coordinates. **No source means it isn't placed.**

## 5. Other missions (later stages)

- **Spirit:** `MERA_traverse.csv` on the same page, plus MER-2 SPICE. Same method.
- **Ingenuity:** no SPICE. NASA's flight log gives per-flight distance and altitude. Positions need a sourced map product (NASA's published flight map). Until then, flights are shown as events without paths.
