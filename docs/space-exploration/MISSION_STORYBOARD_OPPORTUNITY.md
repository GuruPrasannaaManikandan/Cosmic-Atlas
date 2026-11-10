# Mission Storyboard — Opportunity (draft, Stage 1)

**Status:** draft for review. Every beat cites records in `mission-data/missions/mer-opportunity/` or catalogue sources. A beat whose data or asset is missing is marked ⛔, with the reason. Nothing is filled in to make a beat work.

**Narration voice:**
- No person has been to Mars, so there is **no astronaut guide**, and no invented crew or controller dialogue.
- The narrator speaks sourced lines only. It uses the same `StoryLine {text, sources}` model and source chips as the lunar storytelling.
- Quotations from real people appear only verbatim from a cited NASA source, with attribution.

## Beats

| # | Beat | What the viewer sees | Data / assets | Status |
|---|---|---|---|---|
| 1 | **Arrival, 25 Jan 2004** | The site at landing time, with the Sun placed by Mars24. Text: entry vehicle 840 kg; lander 550 kg on airbags; "bounced at least 26 times"; came to rest inside Eagle crater, 14.9 km from target | events `merb-landing`; components `merb-entry-vehicle`, `merb-lander`; `marsTime` | ⛔ **The EDL hardware can't be shown:** NASA has no models, and the press-kit figures (entry speed, parachute, airbags) were not retrieved. Beat 1 runs as text + site + Sun, or a labelled *illustrative* diagram if you approve one |
| 2 | **Sol 1 in Eagle crater** | A 22 m crater at centimetre resolution, rover beside the lander | `osu/` Eagle DTM (0.01 m) | ⛔ The DTM frame is unknown and the data is not downloaded (29.2 MB, needs approval). Lander and rover positions in it are not sourced |
| 3 | **Meet the rover** | Engineering inspection: mast (1.54 m), solar array (1.3 m², ~800–900 Wh/sol at the start), rocker-bogie with 0.26 m wheels, warm electronics box, arm with APXS / Mössbauer / MI / RAT, antennas | `components.json` (21 records); NASA MER-B model | ✅ data. ◐ The model (36 KB) is too coarse for part-level views; the `.blend` evaluation needs approval |
| 4 | **Out of Eagle, 22 Mar 2004** | Time Machine jumps; the route begins | `merb-eagle-exit`; traverse | ⛔ The route is not drawn until its frame is established |
| 5 | **Heat Shield Rock, Jan 2005** | A basketball-sized iron-nickel meteorite. The story links the rover's own discarded heat shield (seen on the surface) to the find that carries its name | `merb-heat-shield-rock`, `merb-heat-shield` | ◐ Text and timeline only. The rock and shield positions are not sourced |
| 6 | **Victoria crater, Sep 2006 to Sep 2007** | An 800 m crater on HiRISE terrain at 1.01 m. Arrival, then the drive in on 11 Sep 2007 | `merb-victoria-*`; HiRISE DTM Victoria | ◐ Terrain available (8.7 MB, needs approval); the route depends on the frame |
| 7 | **Endeavour, 9 Aug 2011** | The 22 km crater rim on the HiRISE Endeavour DTM | `merb-endeavour-arrival`; HiRISE DTM Endeavour (windowed) | ◐ Same |
| 8 | **The darkest sky: sol 5111** | Perseverance Valley under a sky at τ ≈ 10.8, estimated from Pancam solar images. The scene darkens to match the sourced opacity | `merb-final-tau` (PIA22930); atmosphere model | ◐ τ is sourced. The rover position needs the route frame. The visual brightness model is Stage 2 |
| 9 | **Silence: 10 Jun 2018 to 13 Feb 2019** | Time advances with no transmissions; the mission ends | `merb-last-contact`, `merb-end` | ✅ data. No invented audio: the silence is literal |
| 10 | **Record: 45.16 km** | The full route, with "a record held until Perseverance passed it on 11 Oct 2026" | catalogue + NASA overview page | ⛔ Needs the route |

✅ ready ◐ partly blocked ⛔ blocked (reason given)

## Unblocking (approval needed)

| Need | Unblocks |
|---|---|
| Traverse CSV (1.46 MB) + frame fit | 4, 6, 7, 8, 10 |
| Victoria DTM (8.7 MB) | 6 and the Stage 2 renderer prototype |
| Eagle DTM (29.2 MB) + frame | 2 |
| Spirit + Opportunity `.blend` (12.2 MB) | 3 at part level |
| A NASA EDL source (press kit or NTRS full text) | 1 |
