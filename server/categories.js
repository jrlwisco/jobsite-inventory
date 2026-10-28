'use strict';
// Material categories (admin-managed), quantity units, and generic per-category extra fields.
// Hierarchy: parent mains (parent_id null, have children) → leaf subs; items live on leaves (and "other").
const { FIELD_DEFS, FIELD_KEYS, UNITS, ICONS, OTHER_ID } = require('./catalog');

module.exports = function setup({ app, db, auth, adminOnly, str, bad, HttpError, now, getItem, itemOut, recordEvent, fmtNum }) {
  const catRow = id => (id ? db.prepare('SELECT * FROM categories WHERE id = ?').get(String(id)) : null);
  const parseFields = s => { try { const f = JSON.parse(s || '[]'); return Array.isArray(f) ? f.filter(k => FIELD_KEYS.includes(k)) : []; } catch (e) { return []; } };
  const childCount = id => db.prepare('SELECT COUNT(*) n FROM categories WHERE parent_id = ?').get(id).n;
  const catOut = c => ({
    id: c.id, name: c.name, icon: c.icon, sort: c.sort, hidden: !!c.hidden,
    fields: parseFields(c.fields), parentId: c.parent_id || null,
    isParent: childCount(c.id) > 0
  });
  const allCats = () => db.prepare('SELECT * FROM categories ORDER BY sort, name COLLATE NOCASE').all().map(catOut);
  const parseExtra = s => { try { const e = JSON.parse(s || '{}'); return e && typeof e === 'object' ? e : {}; } catch (e) { return {}; } };

  function cleanFields(list) {
    if (!Array.isArray(list)) return [];
    return FIELD_KEYS.filter(k => list.includes(k)); // keep the standard order
  }
  // Read extra field values from a request, keeping only the fields the category has.
  function readExtra(raw, fields) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    for (const k of fields) {
      const def = FIELD_DEFS[k];
      if (def.kind === 'length') {
        if (raw.length === undefined || raw.length === null || raw.length === '') continue;
        const n = Number(raw.length);
        if (!Number.isFinite(n) || n < 0 || n > 1e7) throw bad('Length must be a number (0 or more).');
        out.length = Math.round(n * 100) / 100;
        out.lengthUnit = raw.lengthUnit === 'm' ? 'm' : 'ft';
      } else {
        const v = str(raw[k], { max: 40, label: def.label });
        if (v) out[k] = v;
      }
    }
    return out;
  }
  // Category, unit and extra values for a material (null for tools/equipment).
  // Items belong on leaves (or top-level "other"); if a parent is picked, refuse.
  function readMaterial(body, type, old) {
    if (type !== 'material') return null;
    let cat = catRow(body.categoryId !== undefined ? body.categoryId : old && old.category_id);
    if (!cat) cat = catRow(OTHER_ID) || { id: OTHER_ID, fields: '[]', parent_id: null };
    if (childCount(cat.id) > 0) throw bad('Pick a subcategory, not a main group.');
    const unit = UNITS.includes(body.unit) ? body.unit : (body.unit === undefined && old ? (old.unit || 'each') : 'each');
    const extra = readExtra(body.extra !== undefined ? body.extra : parseExtra(old && old.extra), parseFields(cat.fields));
    return { categoryId: cat.id, unit, extra };
  }
  function applyMaterial(id, mx) {
    if (!mx) return;
    db.prepare('UPDATE items SET category_id = ?, unit = ?, extra = ? WHERE id = ?').run(mx.categoryId, mx.unit, JSON.stringify(mx.extra), id);
  }
  const fmtLen = e => (e && e.length != null ? `${fmtNum(e.length)} ${e.lengthUnit || 'ft'}` : '(none)');
  function materialChanges(old, mx) {
    if (!mx) return [];
    const ch = [];
    if (mx.categoryId !== old.category_id) ch.push(`category ${(catRow(old.category_id) || {}).name || '(none)'} → ${(catRow(mx.categoryId) || {}).name}`);
    if (mx.unit !== (old.unit || 'each')) ch.push(`unit ${old.unit || 'each'} → ${mx.unit}`);
    const oe = parseExtra(old.extra), ne = mx.extra;
    if (fmtLen(oe) !== fmtLen(ne)) ch.push(`length ${fmtLen(oe)} → ${fmtLen(ne)}`);
    for (const k of FIELD_KEYS) if (k !== 'length' && (oe[k] || '') !== (ne[k] || '')) ch.push(`${FIELD_DEFS[k].label.toLowerCase()} ${oe[k] || '(none)'} → ${ne[k] || '(none)'}`);
    return ch;
  }
  function materialOut(r) {
    if (r.type !== 'material') return {};
    const c = catRow(r.category_id) || catRow(OTHER_ID);
    return { categoryId: c ? c.id : OTHER_ID, categoryName: c ? c.name : 'Other / Uncategorized', categoryIcon: c ? c.icon : '📦', unit: r.unit || 'each', extra: parseExtra(r.extra) };
  }

  function resolveParentId(raw, selfId) {
    if (raw === undefined) return undefined;
    if (raw === null || raw === '' || raw === false) return null;
    const pid = String(raw);
    if (selfId && pid === selfId) throw bad("A category can't be its own parent.");
    const p = catRow(pid);
    if (!p) throw bad('That parent category was not found.');
    if (p.parent_id) throw bad('Pick a main group as the parent (only two levels).');
    if (selfId && childCount(selfId) > 0) throw bad("A main group with subcategories can't be moved under another group.");
    if (pid === OTHER_ID) throw bad('"Other / Uncategorized" can\'t be a parent.');
    return pid;
  }

  // ----- API -----
  app.get('/api/categories', auth, (req, res) => res.json({ categories: allCats(), fieldDefs: FIELD_DEFS, units: UNITS, icons: ICONS }));

  function readCatBody(b, existingId) {
    const name = str(b.name, { max: 60, required: true, label: 'Name' });
    const dupe = db.prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND id != ?').get(name, existingId || '');
    if (dupe) throw bad('There is already a category with that name.');
    const icon = str(b.icon, { max: 16 }) || '📦';
    return { name, icon, fields: cleanFields(b.fields) };
  }
  app.post('/api/categories', adminOnly, (req, res) => {
    const v = readCatBody(req.body);
    let base = v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'category', id = base, n = 2;
    while (catRow(id)) id = `${base}-${n++}`;
    const parentId = resolveParentId(req.body.parentId === undefined ? null : req.body.parentId, null);
    // New categories go just above "Other / Uncategorized".
    const other = catRow(OTHER_ID);
    const maxSort = db.prepare('SELECT MAX(sort) m FROM categories WHERE id != ?').get(OTHER_ID).m || 0;
    db.prepare('INSERT INTO categories (id, name, icon, sort, hidden, fields, created_at, parent_id) VALUES (?,?,?,?,0,?,?,?)')
      .run(id, v.name, v.icon, maxSort + 10, JSON.stringify(v.fields), now(), parentId);
    if (other && other.sort <= maxSort + 10) db.prepare('UPDATE categories SET sort = ? WHERE id = ?').run(maxSort + 20, OTHER_ID);
    res.status(201).json({ category: catOut(catRow(id)), categories: allCats() });
  });
  app.put('/api/categories/:id', adminOnly, (req, res) => {
    const c = catRow(req.params.id);
    if (!c) throw new HttpError(404, 'That category was not found.');
    const v = readCatBody({ name: req.body.name ?? c.name, icon: req.body.icon ?? c.icon, fields: req.body.fields ?? parseFields(c.fields) }, c.id);
    const hidden = req.body.hidden === undefined ? !!c.hidden : !!req.body.hidden;
    if (hidden && c.id === OTHER_ID) throw bad('"Other / Uncategorized" can\'t be hidden: it catches everything without a category.');
    let parentId = c.parent_id || null;
    if (req.body.parentId !== undefined) {
      if (c.id === OTHER_ID) throw bad('"Other / Uncategorized" stays at the top level.');
      parentId = resolveParentId(req.body.parentId, c.id);
    }
    db.prepare('UPDATE categories SET name = ?, icon = ?, fields = ?, hidden = ?, parent_id = ? WHERE id = ?')
      .run(v.name, v.icon, JSON.stringify(v.fields), hidden ? 1 : 0, parentId, c.id);
    res.json({ category: catOut(catRow(c.id)), categories: allCats() });
  });
  app.post('/api/categories/order', adminOnly, (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : null;
    if (!ids) throw bad('Bad order.');
    const known = new Set(db.prepare('SELECT id FROM categories').all().map(r => r.id));
    const list = ids.filter(id => known.has(id));
    for (const id of known) if (!list.includes(id)) list.push(id);
    db.transaction(() => list.forEach((id, i) => db.prepare('UPDATE categories SET sort = ? WHERE id = ?').run((i + 1) * 10, id)))();
    res.json({ categories: allCats() });
  });

  // Quick "used some / got more" for length (wire, cable, pipe). Done on the server so two people at once don't overwrite each other.
  app.post('/api/items/:id/length', auth, (req, res) => {
    const delta = Number(req.body.delta);
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1e7) throw bad('Type how much, as a number.');
    const old = getItem(req.params.id);
    if (!old || old.type !== 'material') throw new HttpError(404, 'That item was not found. It may have been deleted.');
    const fields = parseFields((catRow(old.category_id) || {}).fields);
    if (!fields.includes('length')) throw bad('This category has no length.');
    const e = parseExtra(old.extra);
    const from = e.length || 0, to = Math.max(0, Math.round((from + delta) * 100) / 100);
    e.length = to; e.lengthUnit = e.lengthUnit || 'ft';
    db.prepare('UPDATE items SET extra = ?, updated_at = ?, updated_by = ?, updated_by_name = ? WHERE id = ?').run(JSON.stringify(e), now(), req.user.id, req.user.name, old.id);
    const row = getItem(old.id);
    if (to !== from) recordEvent('qty', row, req.user, { field: 'length', from, to, unit: e.lengthUnit });
    res.json({ item: itemOut(row) });
  });

  // ----- backup / restore -----
  const exportCats = () => db.prepare('SELECT * FROM categories ORDER BY sort').all().map(c => ({ ...catOut(c) }));
  function importCats(list) {
    let n = 0;
    for (const c of Array.isArray(list) ? list : []) {
      try {
        if (!c || !c.id) continue;
        const id = String(c.id).slice(0, 60);
        const name = str(c.name, { max: 60, required: true, label: 'Name' });
        const clash = db.prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND id != ?').get(name, id);
        if (clash) continue;
        let parentId = null;
        if (c.parentId) {
          const p = String(c.parentId).slice(0, 60);
          // Parent may be imported in the same batch; allow the id even if not yet present.
          parentId = p === id ? null : p;
        }
        db.prepare(`INSERT INTO categories (id, name, icon, sort, hidden, fields, created_at, parent_id) VALUES (?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, icon=excluded.icon, sort=excluded.sort, hidden=excluded.hidden, fields=excluded.fields, parent_id=excluded.parent_id`)
          .run(id, name, str(c.icon, { max: 16 }) || '📦', Number(c.sort) || 0, c.hidden && id !== OTHER_ID ? 1 : 0, JSON.stringify(cleanFields(c.fields)), now(), parentId);
        n++;
      } catch (e) { if (!(e instanceof HttpError)) throw e; }
    }
    return n;
  }

  return { allCats, catRow, readMaterial, applyMaterial, materialChanges, materialOut, exportCats, importCats, parseExtra, FIELD_DEFS, UNITS, ICONS };
};
