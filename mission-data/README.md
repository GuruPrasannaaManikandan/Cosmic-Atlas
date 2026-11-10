# mission-data

Canonical mission records for the time machine and engineering inspection. Both the web shell and the Unity renderer read them.

- `schemas/`: JSON Schema 2020-12 contracts (`common`, `frames`, `routes`, `events`, `components`, `quality-profiles`).
- `missions/<mission-id>/`: records per mission. Opportunity (`mer-opportunity`) is the worked example.
- `quality-profiles.json`: Ultra / High / Balanced / Performance settings, plus the reference-machine gate.

**Rules:** every value cites a source id from `frontend/src/missions/sources.ts`. See `docs/space-exploration/MISSION_DATA_AUTHORING_GUIDE.md`.

**Validation:** run `cd frontend && npx vitest run src/realism`. It checks the schemas and the semantic rules.

**Unity:** a build step will copy this folder into `Assets/StreamingAssets/mission-data/` (Stage 2). Edit only here.
