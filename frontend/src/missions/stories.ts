/**
 * Storytelling layer. Text is written ONLY from facts already in the curated catalogue and cites the same source
 * ids. It never adds dates, numbers or "final words" that no source gives. Two versions per object: a short one
 * for a quick stop and an expanded one that follows the brief's 11-part structure where facts exist.
 */
export interface StoryPart {
  /** one of the 11 storytelling parts */
  part: 'introduction' | 'why' | 'who' | 'launch' | 'journey' | 'objectives' | 'design' | 'discoveries' | 'events' | 'end' | 'significance'
  heading: string
  text: string
  sources: string[]
}

/** one sentence of the short (child-friendly) story, with the sources its facts come from */
export interface StoryLine {
  text: string
  sources: string[]
}

export interface Story {
  objectId: string
  narrator: string
  concise: StoryLine[]
  expanded: StoryPart[]
}

const A11 = ['nssdca-a11-lm', 'nssdca-a11-csm', 'nasa-apollo11']

export const STORIES: Record<string, Story> = {
  'a11-lm-descent': {
    objectId: 'a11-lm-descent',
    narrator: 'Astronaut guide',
    concise: [
      { text: 'Look at this — it is the bottom half of the Apollo 11 Lunar Module, the spacecraft that carried the first people to land on the Moon.', sources: ['nssdca-a11-lm', 'nasa-apollo11', 'nssdca-chronology'] },
      { text: 'On 20 July 1969 Neil Armstrong and Buzz Aldrin landed right here, in the Sea of Tranquility, while Michael Collins waited for them in orbit.', sources: ['nssdca-a11-lm', 'nssdca-a11-csm', 'nasa-apollo11'] },
      { text: 'The next day the top half, the ascent stage, blasted off and used this descent stage as its launch pad. That is why it is still standing here today.', sources: ['nssdca-a11-lm'] },
    ],
    expanded: [
      { part: 'introduction', heading: 'What you are looking at', text: 'This is the descent stage of the Apollo 11 Lunar Module: an eight-sided box about 4.2 metres across standing on four legs. The Lunar Reconnaissance Orbiter has photographed it from orbit, so we know exactly where it is.', sources: ['nssdca-a11-lm', 'lroc-2016-coords'] },
      { part: 'why', heading: 'Why NASA built it', text: 'The Lunar Module was the part of Apollo designed to fly down from lunar orbit, land two astronauts on the surface and carry them back up again. The descent stage held the landing engine and everything needed for the landing.', sources: ['nssdca-a11-lm'] },
      { part: 'who', heading: 'Who flew it', text: 'Neil Armstrong was the Commander and Buzz Aldrin the Lunar Module Pilot. Michael Collins, the Command Module Pilot, stayed in orbit around the Moon.', sources: A11 },
      { part: 'launch', heading: 'Launch', text: 'Apollo 11 lifted off on a Saturn V rocket from pad 39A at Kennedy Space Center on 16 July 1969 at 13:32 UT.', sources: ['nssdca-a11-csm'] },
      { part: 'journey', heading: 'Landing', text: 'Four days later, at 20:17:40 UT on 20 July 1969, the Lunar Module touched down in Mare Tranquilitatis. Armstrong radioed: "Houston, Tranquility Base here — the Eagle has landed."', sources: ['nssdca-a11-lm', 'nssdca-a11-csm'] },
      { part: 'design', heading: 'How it is built', text: 'The descent stage is an octagonal prism 4.2 m across and 1.7 m thick. Its legs hold it 1.5 m above the ground, and opposite footpads are 9.4 m apart. Inside were the propellant tanks plus water, oxygen and helium. In the middle sits a deep-throttling rocket engine of about 45,000 newtons, with a one-metre conical skirt sticking out underneath. One leg carries the small platform and ladder the astronauts climbed down.', sources: ['nssdca-a11-lm'] },
      { part: 'events', heading: 'The first steps', text: 'At 02:56:15 UT on 21 July Neil Armstrong stepped off this ladder onto the Moon. Buzz Aldrin followed 19 minutes later. Together they collected 21.55 kg of rock and soil and set up experiments nearby.', sources: ['nssdca-a11-csm'] },
      { part: 'end', heading: 'Why it was left behind', text: 'At 17:54:01 UT on 21 July, after 21 hours and 36 minutes on the surface, the ascent stage lifted off. The descent stage was its launch platform, so it stayed here — and it is still here today.', sources: ['nssdca-a11-lm'] },
      { part: 'significance', heading: 'Why it matters', text: 'Apollo 11 was the first crewed lunar landing. This descent stage marks the exact spot where it happened.', sources: ['nasa-apollo11', 'nssdca-chronology'] },
    ],
  },
  'a11-easep-pse': {
    objectId: 'a11-easep-pse',
    narrator: 'Astronaut guide',
    concise: [
      { text: 'This little station is the Early Apollo Scientific Experiments Package, with a seismometer to feel moonquakes.', sources: ['nssdca-a11-lm'] },
      { text: 'Its two slanted solar panels powered it, and an antenna sent its measurements to Earth.', sources: ['nssdca-a11-lm'] },
      { text: 'It was switched on the morning after the landing, worked through the lunar day, and on 27 August 1969 it stopped accepting commands from Earth.', sources: ['nssdca-a11-lm'] },
    ],
    expanded: [
      { part: 'introduction', heading: 'What you are looking at', text: 'This is EASEP, the science station the Apollo 11 crew set up near the Lunar Module. Its main instrument is a passive seismometer.', sources: ['nssdca-a11-lm'] },
      { part: 'objectives', heading: 'What it was for', text: 'The seismometer was designed to measure seismic activity on the Moon — the shaking from moonquakes and meteorite impacts. A dust detector measured how much dust settled on it.', sources: ['nssdca-a11-lm'] },
      { part: 'design', heading: 'How it is built', text: 'A square base carries the seismometer and dust detector. Two canted rectangular solar panels made electricity, an antenna mast talked to Earth, and an isotope heater kept it warm. The whole unit had a mass of 48 kg.', sources: ['nssdca-a11-lm'] },
      { part: 'events', heading: 'Switching on', text: 'The station was turned on at 04:40:39 UT on 21 July 1969, during the moonwalk. It ran about 30 °C hotter than planned but still worked normally.', sources: ['nssdca-a11-lm'] },
      { part: 'end', heading: 'Going silent', text: 'As lunar night approached its solar power fell, and it stopped transmitting at 10:58:46 UT on 3 August 1969. It was turned on again the next lunar day, but on 27 August 1969 it no longer accepted commands from Earth and the experiment was ended.', sources: ['nssdca-a11-lm'] },
    ],
  },
  'a11-lrrr': {
    objectId: 'a11-lrrr',
    narrator: 'Astronaut guide',
    concise: [
      { text: 'This is the Laser Ranging Retroreflector: a panel of special glass cubes that bounce light straight back to where it came from.', sources: ['nssdca-a11-lrrr'] },
      { text: 'Scientists on Earth aimed lasers at it to measure the distance to the Moon.', sources: ['nssdca-a11-lrrr'] },
      { text: 'It needs no electricity at all, so it never needed batteries or solar panels.', sources: ['nssdca-a11-lm'] },
    ],
    expanded: [
      { part: 'introduction', heading: 'What you are looking at', text: 'The Laser Ranging Retroreflector is a flat array of fused-silica cubes on a folding stand, set up a few metres from the seismometer.', sources: ['nssdca-a11-lrrr', 'nssdca-a11-lm'] },
      { part: 'who', heading: 'Who designed it', text: 'Its principal investigator was Dr. Carroll O. Alley of the University of Maryland.', sources: ['nssdca-a11-lrrr'] },
      { part: 'design', heading: 'How it works', text: 'Each glass cube reflects light back in exactly the direction it arrived from. The folding support was used to aim and align the array toward Earth. NSSDCA lists its mass as 77 kg.', sources: ['nssdca-a11-lrrr'] },
      { part: 'objectives', heading: 'What it was for', text: 'By timing laser pulses sent from Earth to this array and back, scientists can measure the distance to the Moon.', sources: ['nssdca-a11-lrrr'] },
      { part: 'significance', heading: 'Why it is special', text: 'It was considered part of the EASEP but needs no power, so it was not affected by the cold lunar nights that ended the seismometer.', sources: ['nssdca-a11-lm'] },
    ],
  },
  'opportunity-rover': {
    objectId: 'opportunity-rover',
    narrator: 'Astronaut guide',
    concise: [
      { text: 'This is Opportunity, one of NASA\'s Mars Exploration Rovers. It was sent to look for clues that water once flowed on Mars.', sources: ['nasa-opportunity'] },
      { text: 'It was planned to work for 90 Martian days, but it kept exploring for almost 15 years and drove 45.16 kilometres.', sources: ['nasa-opportunity'] },
      { text: 'In June 2018 a huge dust storm covered Mars. Opportunity stopped communicating on 10 June 2018, and NASA declared the mission complete on 13 February 2019.', sources: ['nasa-opportunity'] },
    ],
    expanded: [
      { part: 'launch', heading: 'Launch', text: 'Opportunity launched from Cape Canaveral on 7 July 2003 (US Pacific time) on a Delta II rocket.', sources: ['nasa-opportunity'] },
      { part: 'journey', heading: 'Landing', text: 'It landed on 25 January 2004 (UTC) inside a small crater called Eagle crater on Meridiani Planum.', sources: ['nasa-opportunity'] },
      { part: 'objectives', heading: 'What it was looking for', text: 'Its job was to look for clues of past water activity on Mars, and it found evidence that Mars may once have been able to support microbial life.', sources: ['nasa-opportunity'] },
      { part: 'events', heading: 'A long journey', text: 'On 9 August 2011 it reached Endeavour crater, about 22 km across. It eventually drove 45.16 km — more than a marathon.', sources: ['nasa-opportunity'] },
      { part: 'end', heading: 'The dust storm', text: 'In June 2018 a severe dust storm covered the whole planet and blanketed Opportunity\'s location. Its last communication was on 10 June 2018, and NASA declared the end of the mission on 13 February 2019.', sources: ['nasa-opportunity'] },
    ],
  },
}

/**
 * A story for any catalogued object: the handcrafted one when it exists, otherwise one assembled ONLY from the
 * object's and its mission's catalogue facts (design, mission summary, landing, sourced status), citing the same
 * sources. It never adds anything that is not in the catalogue.
 */
import { OBJECT_BY_ID, MISSION_BY_ID } from './index'

export function storyFor(objectId: string): Story | null {
  if (STORIES[objectId]) return STORIES[objectId]
  const o = OBJECT_BY_ID[objectId]
  if (!o) return null
  const m = MISSION_BY_ID[o.missionId]
  const landing = m.landing?.value ? new Date(m.landing.value.length > 10 ? m.landing.value : m.landing.value + 'T00:00:00Z').toUTCString().slice(5, 16) : null
  const status = o.currentStatus.value
  const parts: StoryPart[] = [
    { part: 'introduction', heading: 'What you are looking at', text: `This is the ${o.name}, left here by ${m.name}.`, sources: o.sources },
    { part: 'design', heading: 'How it worked', text: o.design, sources: [...new Set([...o.sources, ...(o.massKg.sources ?? []), ...(o.dimensions.sources ?? [])])] },
    ...(landing ? [{ part: 'journey' as const, heading: 'The mission', text: `${m.name} landed on ${landing}. ${m.summary}`, sources: [...(m.landing?.sources ?? []), ...m.launch.sources] }] : []),
    ...(status ? [{ part: 'end' as const, heading: 'Where it is now', text: `Status: ${status}.`, sources: o.currentStatus.sources.length ? o.currentStatus.sources : o.sources }] : []),
  ]
  return {
    objectId,
    narrator: 'Astronaut guide',
    concise: [
      { text: parts[0].text, sources: o.sources },
      { text: o.design, sources: parts[1].sources },
      ...(status ? [{ text: `Today it is ${status.replace(/^on the lunar surface/, 'still on the lunar surface')}.`, sources: o.currentStatus.sources.length ? o.currentStatus.sources : o.sources }] : []),
    ],
    expanded: parts.filter((p) => p.sources.length),
  }
}

/**
 * Which story parts explain each inspectable component, and which component the camera should show while a story
 * part is narrated. Handcrafted for the handcrafted stories; for catalogue-generated stories every component maps to
 * the 'design' part (the part built from the object's design description).
 */
export const COMPONENT_PARTS: Record<string, Record<string, StoryPart['part'][]>> = {
  'a11-lm-descent': { legs: ['journey', 'design'], ladder: ['events'], engine: ['design'], body: ['design', 'end'] },
  'a11-easep-pse': { seismometer: ['objectives', 'events'], 'solar-panels': ['design', 'end'], antenna: ['design'], 'dust-detector': ['objectives'] },
  'a11-lrrr': { array: ['design', 'objectives'], support: ['design'] },
}
export const PART_FOCUS: Record<string, Partial<Record<StoryPart['part'], string>>> = {
  'a11-lm-descent': { journey: 'legs', design: 'body', events: 'ladder', end: 'body' },
  'a11-easep-pse': { objectives: 'seismometer', design: 'solar-panels', events: 'seismometer', end: 'solar-panels' },
  'a11-lrrr': { introduction: 'array', design: 'array', objectives: 'array' },
}

/** story parts that explain a component (falls back to 'design' for generated stories) */
export function partsForComponent(objectId: string, componentId: string): StoryPart[] {
  const st = storyFor(objectId)
  if (!st) return []
  const want = COMPONENT_PARTS[objectId]?.[componentId] ?? (STORIES[objectId] ? [] : ['design'])
  return st.expanded.filter((p) => want.includes(p.part))
}
