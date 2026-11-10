# Astronaut-Guided Storytelling: Report

- **Branch:** `feat/space-exploration` (PR #12, **not merged**).
- **Scope:** turn the Story tab into an astronaut-led discovery experience, within the existing R3F architecture.

## What I inspected first

| Area | What existed |
|---|---|
| Astronaut rig (`models/Astronaut.tsx`) | Procedural joints (hips, knees, shoulders, elbows, head). Only the gait solver drove them; head pitch only. **No head turn and no gestures.** |
| Discovery flow (`SurfaceScene.tsx`) | DISCOVERED banner and an E prompt. **The astronaut was hidden during inspection.** No dialogue. |
| Narration (`DiscoveryPanel.tsx`) | Browser speech, sentence by sentence, with a bottom subtitle and a transcript. Weaknesses: <br>• it lived inside the tab, so changing tabs killed it; <br>• it could stall if the speech engine never reported the end of a sentence; <br>• it had no captions-only playback; <br>• **the short story's lines had no per-line citations.** |

## Complete (implemented and verified in Chrome)

1. **The astronaut is the visual guide**
   - **Inspection keeps the astronaut in view.** The camera opens over the astronaut's shoulder.
   - **The astronaut turns to face the object and points at it.** The right arm points at the focused part, or at the object's centre.
   - **Speaking nod:** a small nod while a factual line is shown.
   - **Head turns toward nearby hardware while walking,** only toward things roughly in front.
   - **The speech bubble is pinned above the helmet** every frame. When the astronaut is off-screen, or in first-person view, it docks at the bottom, clear of the record panel.
2. **Contextual dialogue (`guide.ts`)**
   - **Approaching:** "Over there: the *name*, about *N* m to the *compass direction*." It is built from the catalogue name and the LRO-measured position, and cites the location sources.
   - **Discovery:** the first sentence of the object's short story, with its sources.
   - **Inspection:** a framing hint with no facts and no sources (for example "Let's take a closer look…").
   - **Choosing a part:** the guide says the component's catalogue description, with its sources.
   - **Frequency:** each line is said once per object per visit and never talks over the story.
3. **Components ↔ story, in both directions**
   - **Part → story:** choosing a part shows "In the story", the story part(s) that explain it, with citations and a "▶ Hear this from the guide" button. For example, *Egress platform and ladder* → *The first steps* (02:56:15 UT).
   - **Story → part:** with "Camera follows the story" on, the camera moves to the part a sentence is about. For example, the *How it is built* part moves the focus from the engine to the whole stage.
   - Handcrafted links cover the Apollo 11 hardware. For catalogue-generated stories, every part maps to the *design* story part.
4. **Narration presentation and synchronisation (`narrator.ts`)**
   - **One shared narrator:** it keeps playing across tab switches, and stops when you leave the record.
   - **Sentence-level lines,** with a splitter that keeps "Dr. Carroll O. Alley" and decimals intact.
   - **Synchronised display:** the bubble shows the current sentence, the transcript highlights it and auto-scrolls, and a word cursor follows. The cursor uses the speech engine's word-boundary events when available, or reading speed in captions mode.
   - **Controls:** play, pause, resume, previous and next sentence, stop, "n / N" progress, speed, and click any transcript sentence to play from it.
   - **Voice:** an opt-in checkbox labelled honestly as "browser text-to-speech, synthetic". Without a speech engine, playback is **captions-only**.
   - **Watchdog:** if the speech engine never reports the end of a sentence, the story advances after its reading time.
5. **Story modes preserved:** "Young explorers (short)" and "Full scientific story", the latter split into sentences.
6. **Every claim is linked to sources**
   - Each short-story sentence now has its own catalogue sources.
   - Full-story sentences inherit their story part's sources.
   - Chips use distinct labels (NSSDCA, LROC, PDS, NASA Science, ESA, ISRO) and group repeats ("NSSDCA ×2"); the tooltip lists every document.
7. **Nothing is invented**
   - There are no recordings and no fabricated astronaut quotes. The only quotation is "Houston, Tranquility Base here — the Eagle has landed", already in the catalogue and sourced to NSSDCA.
   - The panel states that the guide reads the catalogue story and is not a real astronaut speaking.

## Tests

| Suite | Result |
|---|---|
| Unit (Vitest) | **179/179** — see below |
| `storytelling_check.py` (new, Chrome) | **15/15** — see below |
| Regressions | Listed in the PR comment for this push |

New unit tests:
- every factual guide line for every object and component has real sources; unlocated objects are never pointed out;
- lines match the catalogue data; hints carry no facts;
- once-per-visit announcements; no talking over the story;
- sentence splitting; full and short lines keep part and sources;
- captions-mode timing, pause/resume/next/stop;
- story → component camera focus;
- component ↔ story link integrity; per-line short-story sources.

`storytelling_check.py` covers:
- G1–G3: approach bubble over the astronaut with source chips; discovery line; helmet glance;
- I1–I4: astronaut visible, facing and pointing; component line and story part; "Hear this" narrates the ladder part; the story moves the camera;
- N1–N7: short story in the bubble with word cursor and transcript sync; advances by reading time and survives tab switches; pause/resume; full story with progress; stop clears; with voice on, the story still advances; leaving the record stops it;
- no console errors.

Screenshots are in `docs/qa/space-exploration/storytelling/`.

## Still pending (not implemented)

1. **Real astronaut audio:** archival Apollo transmissions with timestamps exist (for example in the Apollo Lunar Surface Journal), but none are sourced or licensed here, so none are used. Adding them would mean per-clip provenance and approval.
2. **Hand-crafted stories for later missions:** only the Apollo 11 hardware (and Opportunity) has hand-written child-friendly and full stories with hand-made part links. Apollo 12–17 objects use catalogue-generated stories, which are accurate and sourced but plainer.
3. **Gesture range:**
   - the guide points with the right arm in the vertical plane, after turning the whole body;
   - there is no full arm IK, no walking to a vantage point, and no lip or visor animation beyond a small nod.
4. **Voice quality:** it depends on the user's operating system and browser voices. The voice can't be chosen in the UI yet (only on or off, plus speed).
5. **Speech engine in tests:** headless Chrome has no reliable speech engine, so the voice-on path was verified only through the watchdog, not by listening.
6. **Mobile:** on phones the bubble is hidden while the record panel is open, because the panel fills the screen. The transcript there shows the same text.
