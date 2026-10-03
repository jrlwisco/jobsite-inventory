'use strict';
// Material categories, extra per-category fields, and quantity units.
// The SEED list is only used the first time (database upgrade); after that admins manage categories in the app.

// Extra fields a category can have. "choice" fields show a dropdown with an "Other (type it)" choice.
const FIELD_DEFS = {
  length: { label: 'Length', kind: 'length', units: ['ft', 'm'] },
  wireGauge: {
    label: 'Wire size / gauge', kind: 'choice',
    options: ['18 AWG', '16 AWG', '14 AWG', '12 AWG', '10 AWG', '8 AWG', '6 AWG', '4 AWG', '3 AWG', '2 AWG', '1 AWG',
      '1/0', '2/0', '3/0', '4/0', '250 kcmil', '300 kcmil', '350 kcmil', '400 kcmil', '500 kcmil', '600 kcmil', '750 kcmil']
  },
  wireType: {
    label: 'Wire type', kind: 'choice',
    options: ['THHN / THWN-2', 'Romex / NM-B', 'MC cable', 'AC (BX)', 'UF-B', 'XHHW-2', 'USE-2', 'RHW-2', 'SER / SEU',
      'Bare copper (ground)', 'Aluminum feeder', 'Tray cable (TC)', 'Fixture wire']
  },
  cableType: {
    label: 'Cable type', kind: 'choice',
    options: ['Cat5e', 'Cat6', 'Cat6A', 'Coax RG6', 'Coax RG59', 'Fiber – single mode', 'Fiber – multimode', 'Alarm 22/4',
      'Alarm 18/2', 'Thermostat 18/5', 'Speaker 16/2', 'Fire alarm (FPLR)', 'Shielded twisted pair']
  },
  pipeSize: {
    label: 'Pipe size', kind: 'choice',
    options: ['1/2"', '3/4"', '1"', '1-1/4"', '1-1/2"', '2"', '3"', '4"', '6"', '8"', '10"', '12"', '15"', '18"', '24"', '30"', '36"', '48"']
  },
  pipeMaterial: {
    label: 'Pipe material', kind: 'choice',
    options: ['PVC Sch 40', 'PVC Sch 80', 'PVC SDR 35 (sewer)', 'C900 PVC (water)', 'CPVC', 'PEX', 'Copper Type K', 'Copper Type L',
      'Copper Type M', 'Cast iron', 'ABS', 'HDPE', 'Corrugated HDPE (ADS)', 'Ductile iron', 'Galvanized steel', 'Black iron',
      'RCP (concrete pipe)', 'CMP (corrugated metal)']
  }
};
const FIELD_KEYS = Object.keys(FIELD_DEFS);

const UNITS = ['each', 'pieces', 'bags', 'boxes', 'bundles', 'rolls', 'sheets', 'pallets', 'buckets', 'tubes',
  'ft', 'sq ft', 'tons', 'cubic yards', 'gallons', 'lbs'];

// Icons admins can pick from (emoji: show in color on every phone, no downloads needed).
const ICONS = ['🚜', '🪨', '🪣', '🧱', '#️⃣', '🏗️', '🛣️', '🌉', '🚧', '🌧️', '💧', '🌾', '🪵', '🏠', '🏘️', '🌡️', '🚪', '⬜',
  '🔲', '🖌️', '🚰', '🌬️', '⚡', '📶', '🧯', '🔩', '🧴', '🦺', '🌳', '📦', '🔧', '🔨', '⛏️', '🪚', '🪜', '🧰', '📐', '📏',
  '⚙️', '🔗', '🛢️', '🪟', '🛁', '💡', '🔌', '🧪', '🏭', '🚛', '⛽', '🧲'];

const W = ['length', 'wireGauge', 'wireType'], LV = ['length', 'cableType'], P = ['length', 'pipeSize', 'pipeMaterial'];
// [id, name, icon, fields]
const SEED = [
  ['site-work', 'Site Work & Earthwork', '🚜'],
  ['aggregates', 'Aggregates (Stone, Gravel, Sand)', '🪨'],
  ['concrete', 'Concrete & Cement', '🪣'],
  ['masonry', 'Masonry (Block, Brick, Stone)', '🧱'],
  ['rebar', 'Rebar & Reinforcing', '#️⃣'],
  ['steel', 'Structural Steel & Metals', '🏗️'],
  ['asphalt', 'Asphalt & Paving', '🛣️'],
  ['roads-bridges', 'Roads & Bridges', '🌉'],
  ['traffic', 'Traffic Control & Signage', '🚧'],
  ['drainage', 'Drainage, Storm & Sewer', '🌧️', P],
  ['water-utilities', 'Water & Underground Utilities', '💧', P],
  ['erosion', 'Erosion Control & Geotextiles', '🌾'],
  ['framing', 'Framing, Lumber & Sheathing', '🪵'],
  ['roofing', 'Roofing', '🏠'],
  ['siding', 'Siding & Exterior Finishes', '🏘️'],
  ['insulation', 'Insulation & Weatherproofing', '🌡️'],
  ['doors-windows', 'Doors & Windows', '🚪'],
  ['drywall', 'Drywall & Interior Finishes', '⬜'],
  ['flooring', 'Flooring & Tile', '🔲'],
  ['paint', 'Paint, Caulk & Adhesives', '🖌️'],
  ['plumbing', 'Plumbing', '🚰', P],
  ['hvac', 'HVAC & Ductwork', '🌬️'],
  ['electrical', 'Electrical', '⚡', W],
  ['low-voltage', 'Low Voltage, Data & Communications', '📶', LV],
  ['fire', 'Fire Protection & Life Safety', '🧯'],
  ['fasteners', 'Fasteners, Anchors & Hardware', '🔩'],
  ['safety', 'Safety & PPE', '🦺'],
  ['landscaping', 'Landscaping', '🌳'],
  ['other', 'Other / Uncategorized', '📦']
];
const OTHER_ID = 'other';

function seedCategories(db, t) {
  const ins = db.prepare('INSERT OR IGNORE INTO categories (id, name, icon, sort, hidden, fields, created_at) VALUES (?,?,?,?,0,?,?)');
  SEED.forEach(([id, name, icon, fields], i) => ins.run(id, name, icon, (i + 1) * 10, JSON.stringify(fields || []), t));
}

module.exports = { FIELD_DEFS, FIELD_KEYS, UNITS, ICONS, SEED, OTHER_ID, seedCategories };
