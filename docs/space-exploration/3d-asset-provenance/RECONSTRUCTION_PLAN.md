# C. 3D Reconstruction Plan and Asset Provenance

**Policy:**
- No downloaded third-party meshes are used so far. All current models are procedural geometry written in this repository: no licensing exposure, and nothing is passed off as an official NASA model.
- Every model records what is sourced and what is approximated. The UI shows this in the Inspect tab ("3D model: …").
- An official model will be adopted only after its licence and accuracy have been checked against engineering photographs.

## Models built in this phase

| Model (`surface/models`) | Object | Sourced geometry (NSSDCA 1969-059C) | Approximated (documented) | Complexity |
|---|---|---|---|---|
| `LunarModuleDescentStage` | Apollo 11 LM descent stage | Octagonal prism 4.2 m across and 1.7 m thick; bottom 1.5 m above the surface; 9.4 m between opposite footpad ends; ~1 m conical engine skirt; four legs with round footpads; ladder and egress platform on one leg | Footpad Ø ~0.94 m; strut layout; contact probes; foil colours and panel layout; heading (ladder facing west) | Medium (~60 meshes, procedural foil bump map) |
| `EasepStation` | EASEP passive seismic station | Square base; seismometer; two canted rectangular solar panels; antenna mast; dust detector | All dimensions; panel angle; shroud shape | Low |
| `Retroreflector` | Apollo 11 LRRR | Fused-silica corner-cube array on a folding support aimed at Earth | Panel size (~0.46 m); the 10×10 cube grid (the cube count is not yet sourced); leg geometry. The aim uses Earth's mean direction from the site, not a measured heading | Low |
| `Astronaut` | Generic explorer | — | Stylised Apollo-era EVA suit (PLSS, gold visor, overshoes). Not a specific crew member. Articulated rig: hips, spine, neck and head, shoulders, elbows, hips, knees | Medium (joint hierarchy driven by the gait solver) |

## Plan for the major objects (later phases)

| Object | Official reference material to use | Candidate existing 3D model (to verify) | Reconstruction work | Expected complexity |
|---|---|---|---|---|
| J-mission LM descent stage (Apollo 15–17) | NSSDCA records for 1971-063C, 1972-031C and 1972-096C; Apollo Lunar Surface Journal photos | NASA 3D Resources (github.com/nasa/NASA-3D-Resources) has Apollo LM content; check the licence and match the J-mission variant | Extended descent stage and LRV stowage bay | Medium |
| ALSEP central station and instruments | NSSDCA experiment records per mission; ALSEP documentation | — | Central station, RTG, Passive Seismic Experiment, heat flow, magnetometer, solar wind | Medium, per instrument |
| Lunar Roving Vehicle | NSSDCA; the LRV operations handbook (NTRS) | NASA 3D Resources (check) | Open frame, four wire-mesh wheels, seats, hand controller, high-gain antenna, TV camera | High |
| MER rover (Spirit / Opportunity) | NASA/JPL MER engineering pages and press kit | NASA 3D Resources MER model (check the licence) | Rover-family geometry: six wheels, rocker-bogie suspension, Pancam mast, instrument arm, solar array "wings" | High |
| Curiosity / Perseverance | NASA/JPL MSL and Mars 2020 pages | NASA 3D Resources (check) | Distinct from MER: RTG at the rear, ChemCam/SuperCam mast, 2.1 m arm, coring drill | High |
| Sojourner + Pathfinder lander | NASA/JPL Pathfinder archive | — | Petal lander, airbags, six-wheel micro-rover | Medium |
| Viking lander | NSSDCA 1975-075C / 1975-083C | — | Three-legged hexagonal body, RTGs, sampler arm, high-gain dish | Medium |
| Phoenix / InSight | NASA/JPL mission pages | — | Round solar arrays, robotic arm; InSight SEIS and HP3 | Medium |
| Ingenuity | NASA/JPL Mars 2020 helicopter page | — | Coaxial rotors, solar panel, four legs | Low |
| Huygens (ESA) | ESA Huygens engineering archive | ESA material (check the licence) | Front shield, back cover, descent module; label "ESA" | Medium |
| Cassini (NASA) | NASA Cassini spacecraft page | NASA 3D Resources (check) | High-gain dish, RTGs, magnetometer boom | High |
| Pragyan (ISRO, not NASA) | ISRO official pages | — | Six-wheel micro-rover; label "ISRO — not NASA" | Medium |

**Validation step for every model:**
1. Overlay the model's silhouette on an official engineering photograph at a known scale.
2. Record the reference image and the deviations in this folder before it ships.
