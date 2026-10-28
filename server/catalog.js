'use strict';
// Material categories, extra per-category fields, and quantity units.
// The SEED list is only used the first time (database upgrade); after that admins manage categories in the app.
// Hierarchy: parent mains (parent_id NULL) → leaf subs; "other" is a top-level leaf with no parent.

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
  '⚙️', '🔗', '🛢️', '🪟', '🛁', '💡', '🔌', '🧪', '🏭', '🚛', '⛽', '🧲', '🌍'];

const W = ['length', 'wireGauge', 'wireType'], LV = ['length', 'cableType'], P = ['length', 'pipeSize', 'pipeMaterial'];

// Parent main groups (id, name, icon). Sort order = position among mains.
const PARENT_SEED = [
  ['site-dirt', 'Site, Dirt & Landscaping', '🌍'],
  ['concrete-metals', 'Concrete, Masonry & Metals', '🧱'],
  ['roads-paving', 'Roads, Paving & Traffic', '🛣️'],
  ['underground', 'Underground Utilities', '💧'],
  ['building-shell', 'Building Structure & Shell', '🏠'],
  ['interior', 'Interior Finishes', '🖌️'],
  // Combined trades parent (keep id "mep"; display name is the four trades, not four separate mains)
  ['mep', 'Plumbing, HVAC, Electrical & Low Voltage', '⚡'],
  ['hardware-safety', 'Hardware & Safety', '🦺']
];

// Leaf categories: [id, name, icon, parentId, fields?]
// Merges (kept as hidden leftovers, not listed as leaves):
//   aggregates → site-work; concrete → masonry; roads-bridges → asphalt
const SEED = [
  ['site-work', 'Site Work, Earthwork & Aggregates', '🚜', 'site-dirt'],
  ['erosion', 'Erosion Control & Geotextiles', '🌾', 'site-dirt'],
  ['landscaping', 'Landscaping', '🌳', 'site-dirt'],
  ['masonry', 'Concrete, Cement & Masonry', '🧱', 'concrete-metals'],
  ['rebar', 'Rebar & Reinforcing', '#️⃣', 'concrete-metals'],
  ['steel', 'Structural Steel & Metals', '🏗️', 'concrete-metals'],
  ['asphalt', 'Asphalt & Paving', '🛣️', 'roads-paving'],
  ['traffic', 'Traffic Control & Signage', '🚧', 'roads-paving'],
  ['drainage', 'Drainage, Storm & Sewer', '🌧️', 'underground', P],
  ['water-utilities', 'Water & Underground Utilities', '💧', 'underground', P],
  ['framing', 'Framing, Lumber & Sheathing', '🪵', 'building-shell'],
  ['roofing', 'Roofing', '🏠', 'building-shell'],
  ['siding', 'Siding & Exterior Finishes', '🏘️', 'building-shell'],
  ['insulation', 'Insulation & Weatherproofing', '🌡️', 'building-shell'],
  ['doors-windows', 'Doors & Windows', '🚪', 'building-shell'],
  ['drywall', 'Drywall & Interior Finishes', '⬜', 'interior'],
  ['flooring', 'Flooring & Tile', '🔲', 'interior'],
  ['paint', 'Paint, Caulk & Adhesives', '🖌️', 'interior'],
  ['plumbing', 'Plumbing', '🚰', 'mep', P],
  ['hvac', 'HVAC & Ductwork', '🌬️', 'mep'],
  ['electrical', 'Electrical', '⚡', 'mep', W],
  ['low-voltage', 'Low Voltage, Data & Communications', '📶', 'mep', LV],
  ['fire', 'Fire Protection & Life Safety', '🧯', 'mep'],
  ['fasteners', 'Fasteners, Anchors & Hardware', '🔩', 'hardware-safety'],
  ['safety', 'Safety & PPE', '🦺', 'hardware-safety'],
  ['other', 'Other / Uncategorized', '📦', null],
  // Hidden leftovers (kept so old DBs / backups still resolve; never listed as active leaves)
  ['aggregates', 'Aggregates (Stone, Gravel, Sand)', '🪨', 'site-dirt'],
  ['concrete', 'Concrete & Cement', '🪣', 'concrete-metals'],
  ['roads-bridges', 'Roads & Bridges', '🌉', 'roads-paving']
];
const OTHER_ID = 'other';
const HIDDEN_SEED_IDS = new Set(['aggregates', 'concrete', 'roads-bridges']);

function seedCategories(db, t) {
  const ins = db.prepare(
    'INSERT OR IGNORE INTO categories (id, name, icon, sort, hidden, fields, created_at, parent_id) VALUES (?,?,?,?,?,?,?,?)'
  );
  PARENT_SEED.forEach(([id, name, icon], i) => {
    ins.run(id, name, icon, (i + 1) * 100, 0, '[]', t, null);
  });
  SEED.forEach(([id, name, icon, parentId, fields], i) => {
    const hidden = HIDDEN_SEED_IDS.has(id) ? 1 : 0;
    // other last; hidden leftovers after active leaves but before other in sort space
    const sort = id === OTHER_ID ? 9000 : HIDDEN_SEED_IDS.has(id) ? 8000 + i : (i + 1) * 10;
    ins.run(id, name, icon, sort, hidden, JSON.stringify(fields || []), t, parentId || null);
  });
}

/** Apply hierarchy renames/merges on an existing DB (idempotent). */
function applyHierarchyV5(db, t) {
  // Ensure parents exist
  const ins = db.prepare(
    'INSERT OR IGNORE INTO categories (id, name, icon, sort, hidden, fields, created_at, parent_id) VALUES (?,?,?,?,0,?,?,?)'
  );
  PARENT_SEED.forEach(([id, name, icon], i) => {
    ins.run(id, name, icon, (i + 1) * 100, '[]', t, null);
    db.prepare('UPDATE categories SET name = ?, icon = ?, parent_id = NULL, hidden = 0 WHERE id = ?').run(name, icon, id);
  });

  // Active leaves: names, parents, unhide
  const leafUpserts = [
    ['site-work', 'Site Work, Earthwork & Aggregates', '🚜', 'site-dirt'],
    ['erosion', 'Erosion Control & Geotextiles', '🌾', 'site-dirt'],
    ['landscaping', 'Landscaping', '🌳', 'site-dirt'],
    ['masonry', 'Concrete, Cement & Masonry', '🧱', 'concrete-metals'],
    ['rebar', 'Rebar & Reinforcing', '#️⃣', 'concrete-metals'],
    ['steel', 'Structural Steel & Metals', '🏗️', 'concrete-metals'],
    ['asphalt', 'Asphalt & Paving', '🛣️', 'roads-paving'],
    ['traffic', 'Traffic Control & Signage', '🚧', 'roads-paving'],
    ['drainage', 'Drainage, Storm & Sewer', '🌧️', 'underground'],
    ['water-utilities', 'Water & Underground Utilities', '💧', 'underground'],
    ['framing', 'Framing, Lumber & Sheathing', '🪵', 'building-shell'],
    ['roofing', 'Roofing', '🏠', 'building-shell'],
    ['siding', 'Siding & Exterior Finishes', '🏘️', 'building-shell'],
    ['insulation', 'Insulation & Weatherproofing', '🌡️', 'building-shell'],
    ['doors-windows', 'Doors & Windows', '🚪', 'building-shell'],
    ['drywall', 'Drywall & Interior Finishes', '⬜', 'interior'],
    ['flooring', 'Flooring & Tile', '🔲', 'interior'],
    ['paint', 'Paint, Caulk & Adhesives', '🖌️', 'interior'],
    ['plumbing', 'Plumbing', '🚰', 'mep'],
    ['hvac', 'HVAC & Ductwork', '🌬️', 'mep'],
    ['electrical', 'Electrical', '⚡', 'mep'],
    ['low-voltage', 'Low Voltage, Data & Communications', '📶', 'mep'],
    ['fire', 'Fire Protection & Life Safety', '🧯', 'mep'],
    ['fasteners', 'Fasteners, Anchors & Hardware', '🔩', 'hardware-safety'],
    ['safety', 'Safety & PPE', '🦺', 'hardware-safety']
  ];
  const upd = db.prepare('UPDATE categories SET name = ?, icon = ?, parent_id = ?, hidden = 0 WHERE id = ?');
  leafUpserts.forEach(([id, name, icon, parentId], i) => {
    // Insert if a brand-new install somehow skipped seed; ignore if missing on weird DBs
    const row = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
    if (row) upd.run(name, icon, parentId, id);
    else {
      db.prepare(
        'INSERT INTO categories (id, name, icon, sort, hidden, fields, created_at, parent_id) VALUES (?,?,?,?,0,?,?,?)'
      ).run(id, name, icon, (i + 1) * 10, '[]', t, parentId);
    }
  });

  // other stays top-level leaf
  db.prepare("UPDATE categories SET name = 'Other / Uncategorized', icon = '📦', parent_id = NULL, hidden = 0, sort = 9000 WHERE id = ?").run(OTHER_ID);

  // Migrate items from merged categories into the keepers
  const migrate = [
    ['aggregates', 'site-work'],
    ['concrete', 'masonry'],
    ['roads-bridges', 'asphalt']
  ];
  for (const [from, to] of migrate) {
    db.prepare('UPDATE items SET category_id = ? WHERE category_id = ?').run(to, from);
  }

  // Hide merged leftovers (keep rows for old backups / foreign refs)
  for (const [from, parentGuess] of [
    ['aggregates', 'site-dirt'],
    ['concrete', 'concrete-metals'],
    ['roads-bridges', 'roads-paving']
  ]) {
    const row = db.prepare('SELECT id FROM categories WHERE id = ?').get(from);
    if (row) {
      db.prepare('UPDATE categories SET hidden = 1, parent_id = ? WHERE id = ?').run(parentGuess, from);
    }
  }
}


/** v2.4.1: keep one combined trades parent (id mep); clearer display name; leaves stay Plumbing/HVAC/Electrical/LV/Fire. */
function applyHierarchyV6(db, t) {
  // Ensure combined parent exists and is named clearly (do not split into four mains)
  const row = db.prepare('SELECT id FROM categories WHERE id = ?').get('mep');
  if (row) {
    db.prepare("UPDATE categories SET name = ?, icon = ?, parent_id = NULL, hidden = 0 WHERE id = ?")
      .run('Plumbing, HVAC, Electrical & Low Voltage', '⚡', 'mep');
  } else {
    db.prepare(
      'INSERT INTO categories (id, name, icon, sort, hidden, fields, created_at, parent_id) VALUES (?,?,?,?,0,?,?,?)'
    ).run('mep', 'Plumbing, HVAC, Electrical & Low Voltage', '⚡', 700, '[]', t, null);
  }

  const leafUpserts = [
    ['plumbing', 'Plumbing', '🚰', 'mep', JSON.stringify(['length', 'pipeSize', 'pipeMaterial'])],
    ['hvac', 'HVAC & Ductwork', '🌬️', 'mep', '[]'],
    ['electrical', 'Electrical', '⚡', 'mep', JSON.stringify(['length', 'wireGauge', 'wireType'])],
    ['low-voltage', 'Low Voltage, Data & Communications', '📶', 'mep', JSON.stringify(['length', 'cableType'])],
    ['fire', 'Fire Protection & Life Safety', '🧯', 'mep', '[]']
  ];
  const upd = db.prepare('UPDATE categories SET name = ?, icon = ?, parent_id = ?, hidden = 0, fields = ? WHERE id = ?');
  leafUpserts.forEach(([id, name, icon, parentId, fields], i) => {
    const existing = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
    if (existing) upd.run(name, icon, parentId, fields, id);
    else {
      db.prepare(
        'INSERT INTO categories (id, name, icon, sort, hidden, fields, created_at, parent_id) VALUES (?,?,?,?,0,?,?,?)'
      ).run(id, name, icon, 700 + (i + 1) * 10, fields, t, parentId);
    }
  });
}

module.exports = { FIELD_DEFS, FIELD_KEYS, UNITS, ICONS, SEED, PARENT_SEED, OTHER_ID, HIDDEN_SEED_IDS, seedCategories, applyHierarchyV5, applyHierarchyV6 };
