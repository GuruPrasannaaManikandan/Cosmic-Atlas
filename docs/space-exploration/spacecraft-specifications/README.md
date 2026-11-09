# Spacecraft Specifications

Specifications live in the curated catalogue (`frontend/src/missions/catalog/*.ts`, `PhysicalObject.dimensions` / `massKg` / `design`). Each one is a `Fact` with a verification status and source ids. The in-app **Technical Specifications** tab renders them with badges and citation links.

## Specifications sourced so far

| Object | Dimensions | Mass | Source |
|---|---|---|---|
| Apollo 11 LM descent stage | ✅ octagonal prism 4.2 m across and 1.7 m thick; 1.5 m ground clearance; 9.4 m footpad span; ~1 m engine skirt | ✅ 2034 kg dry at launch (incl. stowed equipment) | NSSDCA 1969-059C |
| Apollo 11 LM ascent stage (left the Moon) | ✅ ~2.8 m high, 4.0 × 4.3 m | ✅ 2445 kg dry | NSSDCA 1969-059C |
| Apollo 11 EASEP | ⬜ | ✅ 48 kg | NSSDCA 1969-059C |
| Apollo 11 LRRR | ⬜ | ✅ 77 kg (as stated) | NSSDCA 1969-059C-04 |
| Opportunity rover | ⬜ ("about the size of a golf cart") | ✅ 185 kg (spacecraft 1,062 kg) | NASA Science |
| Chandrayaan-3 lander module (ISRO) | ⬜ | ✅ 1752 kg incl. rover; 738 W | ISRO |
| Chandrayaan-3 rover (ISRO) | ⬜ | ✅ 26 kg; 50 W | ISRO |

✅ = sourced; ⬜ = not yet sourced (left empty, not guessed).
