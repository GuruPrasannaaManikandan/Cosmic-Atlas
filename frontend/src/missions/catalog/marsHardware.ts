/**
 * Universal discovery (E1): the historical vehicles at the eight Mars landing sites and their instruments, written only
 * from the documents registered in sources.ts (read 2026-11-11). A field a source does not give is left out or says so.
 *
 * `part` names the scene's piece for a component (Unity site component group, or a Victoria inspection anchor);
 * `placement` says how that piece relates to the model (see PartPlacement in schema.ts). Parts the NASA meshes do not
 * separate yet are 'not-modelled': the record still opens and the whole vehicle is framed (component regions: E2).
 */
import type { Component, DiscoveryCategory, PartPlacement, PhysicalObject, SourcedText } from '../schema'
import { v, u, c, marsPos } from './facts'

const st = (text: string, sources: string[]): SourcedText => ({ text, sources })
type Opt = Partial<Omit<Component, 'id' | 'name' | 'description' | 'sources' | 'category'>>
const comp = (id: string, name: string, category: DiscoveryCategory, description: string, sources: string[], o: Opt = {}): Component => ({ id, name, category, description, sources, ...o })
const at = (part: string, placement: PartPlacement = 'model-part') => ({ part, placement })

// ------------------------------------------------------------------ Viking 1 and 2 (identical landers)

function vikingComponents(p: string, lander: string, extra: { seismo: Component['findings']; experiments: string[] }): Component[] {
  const exp = extra.experiments
  return [
    comp(`${p}-cameras`, 'Lander cameras', 'camera', 'Two 360-degree cylindrical scan cameras mounted near one long side of the base.', [lander, ...exp], at('cameras', 'model-region')),
    comp(`${p}-sampler`, 'Surface sampler arm', 'sampling', 'The sampler arm extends from the centre of the camera side, with a collector head, a temperature sensor and a magnet on the end.', [lander], at('sampler', 'model-region')),
    comp(`${p}-biology`, 'Biology experiment', 'instrument', 'The biology experiment sat in an interior, environmentally controlled compartment together with the gas chromatograph mass spectrometer.', [lander, ...exp], { fullName: exp.length ? 'Biology (GEX / LR / PR)' : undefined, ...at('body', 'inside') }),
    comp(`${p}-gcms`, 'GCMS', 'instrument', 'Gas chromatograph mass spectrometer, housed in the environmentally controlled interior compartment.', [lander, ...exp], { fullName: 'Gas Chromatograph Mass Spectrometer', ...at('body', 'inside') }),
    comp(`${p}-xrfs`, 'XRFS', 'instrument', 'The X-ray fluorescence spectrometer was mounted within the lander structure.', [lander, ...exp], { fullName: 'X-ray Fluorescence Spectrometer', ...at('body', 'inside') }),
    comp(`${p}-seismometer`, 'Seismometer', 'instrument', 'Seismometer mounted opposite the cameras, beside the magnet and camera test targets and a magnifying mirror.', [lander], { placement: 'not-modelled', findings: extra.seismo }),
    comp(`${p}-meteorology`, 'Meteorology boom', 'environmental', 'A boom holding temperature, wind-direction and wind-velocity sensors, extending out and up from one lander leg.', [lander, ...exp], at('met', 'model-region')),
    comp(`${p}-hga`, 'High-gain antenna', 'communication', 'The lander\'s high-gain antenna; the seismometer was mounted near it.', ['nssdca-viking2-lander'], at('hga', 'model-region')),
    comp(`${p}-legs`, 'Landing legs and footpads', 'historical-spacecraft', 'A six-sided base on three legs, with the footpads at the corners of an equilateral triangle 2.21 m on a side.', ['nssdca-viking1-lander'], at('legs', 'model-region')),
    comp(`${p}-pressure`, 'Pressure sensor', 'environmental', 'A pressure sensor attached under the lander body.', [lander], { placement: 'not-modelled' }),
    comp(`${p}-rtg`, 'Radioisotope thermoelectric generators', 'power', 'Two RTGs supplied the lander\'s power.', [lander], {
      placement: 'not-modelled',
      specs: [{ label: 'Output', value: '30 W continuous each', sources: [lander] }, { label: 'Size', value: '28 cm tall, 58 cm in diameter, 13.6 kg each', sources: ['nssdca-viking1-lander-instruments'] }],
    }),
    comp(`${p}-comms`, 'Radio and antennas', 'communication', 'A 20 W S-band transmitter for direct-to-Earth links and a UHF relay radio (381 MHz) to the orbiter.', ['nssdca-viking1-lander-instruments'], { placement: 'not-modelled' }),
  ]
}

// ------------------------------------------------------------------ MER (Spirit and Opportunity were twins)

function merRoverComponents(p: string, src: string): Component[] {
  return [
    comp(`${p}-pancam`, 'Pancam', 'camera', 'Panoramic camera on the Pancam mast assembly, about 1.4 m above the base of the wheels.', [src, 'pds-mer-insthost'], { fullName: 'Panoramic Camera', ...at('mast', 'model-region') }),
    comp(`${p}-navcam`, 'Navigation cameras', 'camera', 'Navigation cameras on the Pancam mast assembly, beside Pancam.', [src], at('mast', 'model-region')),
    comp(`${p}-minites`, 'Mini-TES', 'instrument', 'Thermal-infrared spectrometer that uses the mast as a periscope to view the terrain.', [src, 'pds-mer-insthost'], { fullName: 'Miniature Thermal Emission Spectrometer', ...at('mast', 'model-region') }),
    comp(`${p}-hazcams`, 'Hazard-avoidance cameras', 'camera', 'Two hazard-avoidance cameras on the front of the rover and two on the rear.', [src], { placement: 'not-modelled' }),
    comp(`${p}-idd`, 'Robotic arm (Instrument Deployment Device)', 'sampling', 'A long hinged arm protruding in front of the rover from the lower front of the warm electronics box; it carries the in-situ tools.', [src, 'pds-mer-insthost'], at('arm', 'model-region')),
    comp(`${p}-apxs`, 'APXS', 'instrument', 'Measures the elemental composition of rocks and soils; carried at the end of the arm.', [src], { fullName: 'Alpha Particle X-ray Spectrometer', ...at('arm', 'model-region') }),
    comp(`${p}-mossbauer`, 'Mössbauer spectrometer', 'instrument', 'One of the four in-situ tools at the end of the arm.', [src], at('arm', 'model-region')),
    comp(`${p}-mi`, 'Microscopic Imager', 'camera', 'Close-up imager, one of the four in-situ tools at the end of the arm.', [src], at('arm', 'model-region')),
    comp(`${p}-rat`, 'Rock Abrasion Tool', 'sampling', 'Ground away rock surfaces to expose fresh interiors; at the end of the arm.', [src, 'pds-mer-insthost'], { fullName: 'Rock Abrasion Tool (RAT)', ...at('arm', 'model-region') }),
    comp(`${p}-solar`, 'Solar array', 'power', 'Solar arrays generating up to 140 W under full Sun, with two rechargeable batteries.', [src], at('solar')),
    comp(`${p}-mobility`, 'Rocker-bogie suspension and wheels', 'mobility', 'Six wheels on a rocker-bogie suspension.', [src, 'pds-mer-insthost'], {
      ...at('mobility'),
      specs: [{ label: 'Top speed', value: 'about 3.75 cm/s', sources: [src] }],
    }),
    comp(`${p}-telecom`, 'Antennas', 'communication', 'Direct-to-Earth X-band through a steerable high-gain antenna and a low-gain antenna; UHF relay through Mars orbiters.', ['pds-mer-insthost'], at('hga', 'model-region')),
  ]
}

// ------------------------------------------------------------------ new site vehicles

export const SITE_OBJECTS: PhysicalObject[] = [
  {
    id: 'viking-2-lander', missionId: 'viking-2', name: 'Viking 2 lander', category: 'lander', builtBy: 'NASA', nasaHardware: true,
    dimensions: u('the Viking 2 page read gives no dimensions (the landers were built to the same design as Viking 1)'),
    massKg: v(572, ['nssdca-viking2-lander'], 'Facts in Brief; the description gives about 600 kg after separation'),
    design: 'Three-legged lander identical in layout to Viking 1, powered by two RTGs.',
    components: vikingComponents('vl2', 'nssdca-viking2-lander', { seismo: [], experiments: [] }),
    location: v(marsPos(47.6673, 134.2809, 'NSSDCA'), ['nssdca-viking2-lander']),
    currentStatus: v('turned off 11 April 1980 when its batteries failed', ['nssdca-viking2-lander']),
    model: { id: 'nasa:viking-lander', provenance: 'Official NASA 3D Resources Viking Lander model (Viking 1 and 2 were identical landers).' },
    sources: ['nssdca-viking2-lander', 'nasa-viking-2'],
    findings: [
      st('It settled with one leg on a rock, tilted 8.2 degrees.', ['nssdca-viking2-lander']),
      st('It operated for 1281 Mars days.', ['nssdca-viking2-lander']),
    ],
  },
  {
    id: 'pathfinder-lander', missionId: 'mars-pathfinder', name: 'Mars Pathfinder lander (Carl Sagan Memorial Station)', category: 'lander', builtBy: 'NASA JPL', nasaHardware: true,
    dimensions: u('overall dimensions not given on the pages read'),
    massKg: v(463, ['nssdca-pathfinder-lander']),
    design: 'A box-shaped lander that opened three triangular solar petals after an airbag landing, with a camera on a pop-up mast and a meteorology station.',
    components: [
      comp('mpf-camera', 'Lander camera on the pop-up mast', 'camera', 'A camera extending up from the centre of the lander on a pop-up mast.', ['nssdca-pathfinder-lander'], { ...at('imp'), specs: [{ label: 'Mast height', value: '0.8 m', sources: ['nssdca-pathfinder-lander'] }] }),
      comp('mpf-met', 'Meteorology station', 'environmental', 'The lander was equipped with a meteorology station.', ['nssdca-pathfinder-lander'], at('met')),
      comp('mpf-petals', 'Solar petals', 'power', 'Three metallic triangular solar panels (petals).', ['nssdca-pathfinder-lander'], at('petals')),
      comp('mpf-ramps', 'Rover ramps', 'mobility', 'Sojourner rolled down the lander\'s rear ramp onto the surface.', ['nasa-mars-pathfinder'], at('ramps')),
      comp('mpf-airbags', 'Retracted airbags', 'historical-spacecraft', 'The landing used airbags; MER later adapted the same Pathfinder method (airbags inflated before impact, bounces, then deflated and retracted).', ['jpl-mer-edl'], at('airbags')),
      comp('mpf-antennas', 'Low-gain antennas', 'communication', 'Three low-gain antennas extending from three corners of the box.', ['nssdca-pathfinder-lander'], { placement: 'not-modelled' }),
    ],
    location: v(marsPos(19.073883, 326.741371, 'HiRISE-identified in the controlled orthoimage PSP_001890_1995 (this project)'), ['nssdca-pathfinder-lander']),
    currentStatus: v('communications lost 27 September 1997', ['nssdca-pathfinder-lander']),
    model: { id: 'proc:pathfinder-lander', provenance: 'Documented reconstruction (NASA publishes no 3D model).' },
    sources: ['nssdca-pathfinder-lander', 'nasa-mars-pathfinder'],
    findings: [st('Nominal power 35 W.', ['nssdca-pathfinder-lander'])],
  },
  {
    id: 'sojourner-rover', missionId: 'mars-pathfinder', name: 'Sojourner rover', category: 'rover', builtBy: 'NASA JPL', nasaHardware: true,
    dimensions: v('280 mm high, 630 mm long, 480 mm wide; 130 mm ground clearance', ['nssdca-sojourner']),
    massKg: c(10.5, ['nssdca-sojourner'], [{ value: 10.6, sources: ['nasa-mars-pathfinder'] }], 'NSSDCA gives 10.5 kg, the NASA mission page 10.6 kg'),
    design: 'Six-wheeled micro-rover on a rocker-bogie suspension, solar powered, driving autonomously around hazards.',
    components: [
      comp('soj-solar', 'Solar panel', 'power', 'Powered by 0.2 m² of solar cells, with non-rechargeable lithium thionyl chloride D-cell batteries as backup.', ['nssdca-sojourner'], at('solar')),
      comp('soj-wheels', 'Wheels and rocker-bogie suspension', 'mobility', 'Six wheels on a rocker-bogie suspension; stowed at 180 mm and raised to full height at deployment.', ['nssdca-sojourner'], at('wheels')),
      comp('soj-apxs', 'APXS', 'instrument', 'An alpha-proton-X-ray spectrometer assessed the composition of rocks and soil; images of the tested samples were sent to Earth.', ['nssdca-sojourner'], { fullName: 'Alpha Proton X-ray Spectrometer', ...at('apxs') }),
      comp('soj-cameras', 'Cameras', 'camera', 'Black-and-white and colour imaging systems imaged the lander, the surrounding terrain and the rover\'s wheel tracks.', ['nssdca-sojourner'], at('cameras')),
      comp('soj-computer', 'On-board computer', 'instrument', 'An Intel 80C85 processor running about 100,000 instructions per second; with a 10–15 minute signal delay the rover avoided hazards autonomously.', ['nssdca-sojourner'], { placement: 'inside' }),
    ],
    location: u('Sojourner moved around the lander (primary objectives within about 10 m); its position in this scene beside the ramp is ILLUSTRATIVE'),
    currentStatus: v('communications lost 27 September 1997', ['nssdca-sojourner']),
    model: { id: 'proc:sojourner', provenance: 'Documented reconstruction (NASA publishes no 3D model).' },
    sources: ['nssdca-sojourner', 'nasa-mars-pathfinder'],
    findings: [st('It rolled down the deployment ramp on 6 July 1997 — the first robotic rover on Mars.', ['nssdca-sojourner', 'nasa-mars-pathfinder'])],
  },
  {
    id: 'spirit-rover', missionId: 'mer-spirit', name: 'Spirit rover', category: 'rover', builtBy: 'NASA JPL', nasaHardware: true,
    dimensions: u('dimensions not given on the NSSDCA page read'),
    massKg: v(185, ['nssdca-mer-a']),
    design: 'Mars Exploration Rover carrying the Athena science package, twin of Opportunity.',
    components: merRoverComponents('mera', 'nssdca-mer-a'),
    location: u('in this scene the early-mission position beside the lander (offset ILLUSTRATIVE)'),
    currentStatus: v('last transmission 22 March 2010', ['nssdca-mer-a']),
    model: { id: 'nasa:mer', provenance: 'Official NASA 3D Resources articulated MER model (Spirit and Opportunity were twins).' },
    sources: ['nssdca-mer-a', 'nasa-mer-spirit', 'pds-mer-insthost'],
    findings: [
      st('Spirit lost the use of one wheel; in April 2009 it broke through a crust into sand and was immobile by 1 May 2009.', ['nssdca-mer-a']),
      st('It travelled 7.73 km in total before its last transmission on 22 March 2010.', ['nssdca-mer-a']),
    ],
  },
  {
    id: 'mer-a-lander', missionId: 'mer-spirit', name: 'MER-A lander (Columbia Memorial Station)', category: 'lander', builtBy: 'NASA JPL', nasaHardware: true,
    dimensions: u('dimensions not given on the pages read'), massKg: v(348, ['nssdca-mer-b'], 'lander platform mass from the MER-B record (the landers were identical)'),
    design: 'Tetrahedral airbag lander: a base and three side petals that opened to let the rover drive off.',
    components: [
      comp('mera-petals', 'Base and petals', 'historical-spacecraft', 'The lander is a tetrahedron with a base and three side petals; each petal has a motor to right the rover after landing.', ['jpl-mer-spacecraft'], at('petals')),
      comp('mera-airbags', 'Airbags', 'historical-spacecraft', 'Four airbags of six lobes each, inflated seconds before touchdown and retracted before the petals opened.', ['jpl-mer-spacecraft'], at('airbags')),
    ],
    location: v(marsPos(-14.565818, 175.475472, 'HiRISE-identified in the controlled orthoimage PSP_001513_1655 (this project)'), ['nasa-mer-spirit']),
    currentStatus: v('left at the landing site in Gusev crater', ['nasa-mer-spirit']),
    model: { id: 'proc:mer-lander', provenance: 'SIMPLIFIED MODEL — no NASA model of the MER lander exists.' },
    sources: ['jpl-mer-spacecraft'],
  },
  {
    id: 'phoenix-lander', missionId: 'phoenix', name: 'Phoenix lander', category: 'lander', builtBy: 'NASA JPL / University of Arizona', nasaHardware: true,
    dimensions: u('overall dimensions not given on the pages read'), massKg: u('only the 55 kg science payload is given on the pages read'),
    design: 'Three-legged arctic lander with two octagonal solar panel wings; its science experiments and robotic arm are mounted on the base.',
    components: [
      comp('phx-arm', 'Robotic arm', 'sampling', 'The nearly 2.5 m robotic arm was deployed within four days of landing and dug the trenches that exposed subsurface ice.', ['nasa-phoenix', 'nssdca-phoenix'], at('arm')),
      comp('phx-rac', 'RAC', 'camera', 'Robotic Arm Camera, one of the lander instruments named on the NASA and NSSDCA pages (they do not describe it further).', ['nssdca-phoenix', 'nasa-phoenix'], { fullName: 'Robotic Arm Camera', placement: 'not-modelled' }),
      comp('phx-ssi', 'SSI', 'camera', 'The Surface Stereo Imager camera on the lander deck.', ['nssdca-phoenix', 'nasa-phoenix'], { fullName: 'Surface Stereo Imager', ...at('ssi') }),
      comp('phx-tega', 'TEGA', 'instrument', 'The first soil sample went to TEGA; the lander\'s samples were heated to release volatiles, and TEGA analysed a water sample.', ['nssdca-phoenix', 'nasa-phoenix'], { fullName: 'Thermal and Evolved Gas Analyzer', ...at('tega') }),
      comp('phx-meca', 'MECA', 'instrument', 'Microscopy, Electrochemistry, and Conductivity Analyzer on the deck.', ['nssdca-phoenix', 'nasa-phoenix'], { fullName: 'Microscopy, Electrochemistry, and Conductivity Analyzer', ...at('meca') }),
      comp('phx-met', 'MET', 'environmental', 'Meteorological station; Phoenix started returning regular weather reports within four days of landing.', ['nssdca-phoenix', 'nasa-phoenix'], { fullName: 'Meteorological Station', ...at('met') }),
      comp('phx-solar', 'Solar panels', 'power', 'Two octagonal solar panel wings.', ['nssdca-phoenix'], at('solar')),
      comp('phx-legs', 'Landing legs', 'historical-spacecraft', 'Three landing legs; the descent used 8 thrusters.', ['nssdca-phoenix'], at('legs')),
    ],
    location: v(marsPos(68.217789, 234.249968, 'HiRISE-identified in the controlled orthoimage PSP_008591_2485 (this project)'), ['nssdca-phoenix']),
    currentStatus: v('last transmission 2 November 2008', ['nssdca-phoenix']),
    model: { id: 'proc:phoenix', provenance: 'Documented reconstruction (NASA publishes no 3D model).' },
    sources: ['nssdca-phoenix', 'nasa-phoenix'],
    findings: [
      st('By June 19, 2008 the team concluded that bright clumps in a trench were probably water ice.', ['nasa-phoenix']),
      st('On July 31, 2008 NASA announced that there is water on Mars.', ['nasa-phoenix']),
      st('On Aug. 5, 2008 the team announced perchlorates on the surface.', ['nasa-phoenix']),
      st('Early results from a Sept. 12 wet-chemistry sample suggested an alkaline soil of salts and other chemicals.', ['nasa-phoenix']),
    ],
  },
  {
    id: 'curiosity-rover', missionId: 'msl-curiosity', name: 'Curiosity rover', category: 'rover', builtBy: 'NASA JPL', nasaHardware: true,
    dimensions: v('about 3 m long, 2.7 m wide and 2.2 m tall, not including the arm', ['nasa-msl-curiosity']),
    massKg: v(899, ['nasa-msl-curiosity']),
    design: 'Car-sized nuclear-powered rover with 17 cameras, a 2.2 m robotic arm with a drill, and an onboard laboratory.',
    components: [
      comp('msl-mastcam', 'Mastcam', 'camera', 'Takes colour panoramas and video of the terrain and the atmosphere, and supports driving and sampling.', ['nasa-msl-instruments'], {
        fullName: 'Mast Camera', ...at('mast-head', 'model-region'),
        location: st('On the mast at about human-eye height, roughly 2.0 m.', ['nasa-msl-instruments']),
        specs: [
          { label: 'Image size', value: 'about 1600 × 1200 pixels (2 megapixels)', sources: ['nasa-msl-instruments'] },
          { label: 'Focal lengths', value: '~34 mm (left) and ~100 mm (right)', sources: ['nasa-msl-instruments'] },
          { label: 'Video', value: 'HD at 10 frames per second', sources: ['nasa-msl-instruments'] },
        ],
      }),
      comp('msl-chemcam', 'ChemCam', 'instrument', 'Vaporises a spot of rock with a laser and analyses the elements in the glowing plasma with onboard spectrographs.', ['nasa-msl-instruments'], {
        fullName: 'Chemistry and Camera', ...at('mast-head', 'model-region'),
        location: st('Laser, telescope and camera on the mast; the spectrometer inside the body.', ['nasa-msl-instruments']),
        specs: [{ label: 'Spectrographs', value: 'three', sources: ['nasa-msl-instruments'] }],
      }),
      comp('msl-cameras', 'Engineering cameras', 'camera', 'Curiosity carries 17 cameras in all. The navigation and hazard cameras are not described on the NASA pages read, so their details are not shown yet.', ['nasa-msl-curiosity'], { placement: 'not-modelled' }),
      comp('msl-arm', 'Robotic arm', 'sampling', 'The arm reaches about 2.2 m and carries the turret of tools.', ['nasa-msl-curiosity'], at('arm', 'model-region')),
      comp('msl-drill', 'Drill', 'sampling', 'A drill on the end of the arm collects powdered rock samples.', ['nasa-msl-curiosity'], {
        ...at('turret', 'model-region'),
        findings: [st('It had collected 42 powdered rock samples (as stated by NASA when read on 11 Nov 2026).', ['nasa-msl-curiosity'])],
      }),
      comp('msl-apxs', 'APXS', 'instrument', 'Measures the abundance of chemical elements in rocks and soils.', ['nasa-msl-instruments'], {
        fullName: 'Alpha Particle X-ray Spectrometer', ...at('turret', 'model-region'),
        location: st('On the turret at the end of the robotic arm.', ['nasa-msl-instruments']),
        specs: [{ label: 'Contact spot', value: 'about 1.7 cm in diameter', sources: ['nasa-msl-instruments'] }],
      }),
      comp('msl-mahli', 'MAHLI', 'camera', 'Close-up, microscopic images of minerals, textures and structures in rocks and soil.', ['nasa-msl-instruments'], {
        fullName: 'Mars Hand Lens Imager', ...at('turret', 'model-region'),
        location: st('On the turret at the end of the robotic arm.', ['nasa-msl-instruments']),
        specs: [{ label: 'Image size', value: 'up to 1600 × 1200 pixels; 720p video', sources: ['nasa-msl-instruments'] }],
      }),
      comp('msl-chemin', 'CheMin', 'instrument', 'Identifies and measures the abundances of minerals by X-ray diffraction.', ['nasa-msl-instruments'], {
        fullName: 'Chemistry and Mineralogy', ...at('body', 'inside'),
        location: st('Inside the rover body.', ['nasa-msl-instruments']),
        specs: [{ label: 'Analysis time', value: 'up to 10 hours, over two or more Martian nights', sources: ['nasa-msl-instruments'] }],
      }),
      comp('msl-sam', 'SAM', 'instrument', 'Searches for carbon-containing compounds associated with life and studies how they form and break down.', ['nasa-msl-instruments'], {
        fullName: 'Sample Analysis at Mars', ...at('body', 'inside'),
        location: st('Inside the rover body, at the front.', ['nasa-msl-instruments']),
        specs: [
          { label: 'Mass', value: 'about 40 kg', sources: ['nasa-msl-instruments'] },
          { label: 'Sample cups', value: '74', sources: ['nasa-msl-instruments'] },
          { label: 'Ovens', value: 'most samples heated to about 1,000 °C', sources: ['nasa-msl-instruments'] },
        ],
        findings: [st('Curiosity found organic molecules, the largest discovered on Mars to date.', ['nasa-msl-curiosity'])],
      }),
      comp('msl-rems', 'REMS', 'environmental', 'Measures pressure, temperature, humidity, wind and ultraviolet radiation for daily weather reports.', ['nasa-msl-instruments'], {
        fullName: 'Rover Environmental Monitoring Station', ...at('mast', 'model-region'),
        location: st('Two booms on the mast, a UV sensor on the deck and a pressure sensor inside the body.', ['nasa-msl-instruments']),
      }),
      comp('msl-rad', 'RAD', 'instrument', 'Measures high-energy radiation at the surface: protons, ions, neutrons and gamma rays.', ['nasa-msl-instruments'], {
        fullName: 'Radiation Assessment Detector', placement: 'not-modelled',
        location: st('On the rover deck, pointing at the sky.', ['nasa-msl-instruments']),
      }),
      comp('msl-dan', 'DAN', 'instrument', 'Pulses neutrons into the ground to detect hydrogen, a sign of water or water bound in minerals.', ['nasa-msl-instruments'], {
        fullName: 'Dynamic Albedo of Neutrons', placement: 'not-modelled',
        location: st('On the aft-port side of the rover body.', ['nasa-msl-instruments']),
        specs: [{ label: 'Depth', value: 'hydrogen up to 1 m below the surface; water content as low as 0.1 %', sources: ['nasa-msl-instruments'] }],
      }),
      comp('msl-mardi', 'MARDI', 'camera', 'Took colour video of the descent to the surface.', ['nasa-msl-instruments'], {
        fullName: 'Mars Descent Imager', placement: 'not-modelled',
        location: st('On the fore-port side of the rover, pointing at the ground.', ['nasa-msl-instruments']),
      }),
      comp('msl-mmrtg', 'MMRTG', 'power', 'Converts the heat of decaying plutonium dioxide into electricity with thermocouples, with no moving parts.', ['nasa-mmrtg-factsheet'], {
        fullName: 'Multi-Mission Radioisotope Thermoelectric Generator', ...at('mmrtg', 'model-region'),
        location: st('The white cylinder with radiator fins at the rear of the rover.', ['nasa-mmrtg-factsheet']),
        specs: [
          { label: 'Electrical power', value: 'about 110 W at launch', sources: ['nasa-mmrtg-factsheet'] },
          { label: 'Size', value: 'about 64 cm across the fins, 66 cm tall, ~45 kg', sources: ['nasa-mmrtg-factsheet'] },
        ],
      }),
      comp('msl-mobility', 'Rocker-bogie suspension and wheels', 'mobility', 'Six wheels on a rocker-bogie suspension.', ['nasa-msl-curiosity'], at('mobility', 'model-region')),
    ],
    location: v(marsPos(-4.589646, 137.441388, 'HiRISE-identified at Bradbury Landing, in the CTX/MOLA-controlled frame (this project)'), ['nasa-msl-curiosity']),
    currentStatus: v('operating', ['nasa-msl-curiosity']),
    model: { id: 'nasa:curiosity', provenance: 'Official NASA 3D Resources model (no separately named parts).' },
    sources: ['nasa-msl-curiosity', 'nasa-msl-instruments', 'nasa-mmrtg-factsheet'],
    findings: [st('Curiosity found chemical and mineral evidence of past habitable environments on Mars.', ['nasa-msl-curiosity'])],
  },
]

// ------------------------------------------------------------------ components for objects already in the catalogue

export const EXTRA_COMPONENTS: Record<string, Component[]> = {
  'viking-1-lander': vikingComponents('vl1', 'nssdca-viking1-lander-instruments', {
    experiments: ['nssdca-viking1-experiments'],
    seismo: [st('The Viking 1 seismometer failed to uncage and could not be used in a seismic network with the Viking 2 instrument.', ['nssdca-viking1-seismology'])],
  }),
  'insight-lander': [
    comp('ins-seis', 'SEIS', 'instrument', 'Measures seismic vibrations from marsquakes, meteorite impacts and atmospheric activity such as dust storms and dust devils.', ['nasa-insight-instruments'], {
      fullName: 'Seismic Experiment for Interior Structure', ...at('seis'),
      location: st('Placed on the ground in front of the lander on 19 Dec 2018, about as far away as the arm can reach (1.636 m), on ground tilted 2 to 3 degrees; the Wind and Thermal Shield was then placed over it. In this scene it stands under the shield (offset from the deck centre RECONSTRUCTED).', ['jpl-insight-seis-placed']),
      specs: [{ label: 'Power', value: 'up to 8.5 W', sources: ['nasa-insight-instruments'] }, { label: 'Data', value: '38 megabits per day', sources: ['nasa-insight-instruments'] }],
    }),
    comp('ins-hp3', 'HP3', 'instrument', 'Measures the heat flowing out of the interior; a self-hammering "mole" was to burrow into the ground.', ['nasa-insight-instruments'], {
      fullName: 'Heat Flow and Physical Properties Package', ...at('hp3'),
      location: st('Placed on the surface on 12 Feb 2019, on the east side of the lander\'s workspace. Its exact offset from SEIS in this scene is RECONSTRUCTED.', ['jpl-insight-seis-placed', 'nasa-pia-hp3-deployed']),
      specs: [{ label: 'Design depth', value: 'almost 5 m', sources: ['nasa-insight-instruments'] }, { label: 'Mass', value: 'about 3 kg', sources: ['nasa-insight-instruments'] }],
      findings: [st('The mole met different soil properties than expected and could not reach the desired depth.', ['nasa-insight-instruments'])],
    }),
    comp('ins-wts', 'Wind and Thermal Shield', 'instrument', 'A shield the arm placed over the seismometer to stabilise its environment.', ['jpl-insight-seis-placed'], {
      ...at('wts'), location: st('Over SEIS on the ground in front of the lander.', ['jpl-insight-seis-placed']),
    }),
    comp('ins-rise', 'RISE', 'communication', 'Tracks the lander precisely to measure the wobble of Mars\' north pole, which tells the size and composition of the core.', ['nasa-insight-instruments'], {
      fullName: 'Rotation and Interior Structure Experiment', ...at('rise'),
      location: st('Two antennas on either side of the deck.', ['nasa-insight-instruments']),
    }),
    comp('ins-ida', 'Instrument Deployment Arm', 'sampling', 'The 1.8 m arm lifted the seismometer and the heat-flow probe from the deck and placed them on the ground.', ['nasa-insight-spacecraft', 'nasa-insight'], { fullName: 'Instrument Deployment Arm (IDA)', ...at('arm') }),
    comp('ins-idc', 'IDC', 'camera', 'A camera on the arm with a 45-degree field of view.', ['nasa-insight-spacecraft'], { fullName: 'Instrument Deployment Camera', ...at('idc') }),
    comp('ins-icc', 'ICC', 'camera', 'A fisheye camera just below the deck, with a 120-degree field of view.', ['nasa-insight-spacecraft'], { fullName: 'Instrument Context Camera', ...at('icc') }),
    comp('ins-solar', 'Solar panels', 'power', 'Two solar panels about 2.2 m in diameter each; 6 m wingspan when deployed.', ['nasa-insight-spacecraft'], at('solar')),
    comp('ins-sensors', 'Weather and magnetic sensors', 'environmental', 'Sensors measured the weather and magnetic field variations.', ['nasa-insight-spacecraft'], at('twins')),
  ],
}

/** Opportunity's existing records: categories and the Victoria inspection anchors they frame */
export const OPPORTUNITY_PARTS: Record<string, { category: DiscoveryCategory; part: string; placement: PartPlacement; fullName?: string }> = {
  'merb-pma': { category: 'camera', part: 'mast', placement: 'model-region' },
  'merb-pancam': { category: 'camera', part: 'mast', placement: 'model-region', fullName: 'Panoramic Camera' },
  'merb-navcam': { category: 'camera', part: 'mast', placement: 'model-region' },
  'merb-minites': { category: 'instrument', part: 'mast', placement: 'model-region', fullName: 'Miniature Thermal Emission Spectrometer' },
  'merb-solar-array': { category: 'power', part: 'solar', placement: 'model-part' },
  'merb-batteries': { category: 'power', part: 'body', placement: 'inside' },
  'merb-mobility': { category: 'mobility', part: 'mobility', placement: 'model-part' },
  'merb-idd': { category: 'sampling', part: 'arm', placement: 'model-region' },
  'merb-telecom': { category: 'communication', part: 'hga', placement: 'model-region' },
  'merb-web': { category: 'instrument', part: 'body', placement: 'model-region' },
  'merb-avionics': { category: 'instrument', part: 'body', placement: 'inside' },
}
export const OPPORTUNITY_EXTRA: Component[] = [
  comp('merb-apxs', 'APXS', 'instrument', 'Measures the elemental composition of rocks and soils; carried at the end of the arm.', ['nssdca-mer-b'], { fullName: 'Alpha Particle X-ray Spectrometer', ...at('arm', 'model-region') }),
  comp('merb-mossbauer', 'Mössbauer spectrometer', 'instrument', 'One of the four in-situ tools at the end of the arm.', ['nssdca-mer-b'], at('arm', 'model-region')),
  comp('merb-mi', 'Microscopic Imager', 'camera', 'Close-up imager at the end of the arm.', ['nssdca-mer-b'], at('arm', 'model-region')),
  comp('merb-rat', 'Rock Abrasion Tool', 'sampling', 'Ground away rock surfaces to expose fresh interiors; at the end of the arm.', ['nssdca-mer-b', 'pds-mer-insthost'], { fullName: 'Rock Abrasion Tool (RAT)', ...at('arm', 'model-region') }),
]

/** mission → the site vehicles it left (added to Mission.objectIds) */
export const SITE_OBJECT_IDS: Record<string, string[]> = {
  'viking-2': ['viking-2-lander'],
  'mars-pathfinder': ['pathfinder-lander', 'sojourner-rover'],
  'mer-spirit': ['spirit-rover', 'mer-a-lander'],
  phoenix: ['phoenix-lander'],
  'msl-curiosity': ['curiosity-rover'],
}
