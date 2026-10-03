'use strict';
/*
 * Equipment & Maintenance:
 *  - hours/miles readings (history, warning when lower)
 *  - maintenance & repair records: LOCKED once saved; crew ask for changes, an admin approves or denies; audit trail
 *  - repair requests with urgency and status
 */
const crypto = require('node:crypto');

module.exports = function equipment(ctx) {
  const { app, db, auth, adminOnly, str, bad, HttpError, now, savePhotos, removePhotoFiles, photoToDataUrl, getItem, itemOut, recordEvent, fmtNum } = ctx;
  const uuid = () => crypto.randomUUID();
  const UNIT = u => (u === 'miles' ? 'miles' : 'hours');
  const MAX_RECORD_PHOTOS = 4;

  function meterNum(v) {
    const n = Number(v);
    if (v === '' || v === null || !Number.isFinite(n) || n < 0 || n > 1e8) throw bad('Hours/miles must be a number, 0 or more.');
    return Math.round(n * 10) / 10;
  }
  function optMeter(v) { return v === undefined || v === null || v === '' ? null : meterNum(v); }
  function optCost(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(String(v).replace(/[$,\s]/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > 1e8) throw bad('Cost must be a number (like 125.50).');
    return Math.round(n * 100) / 100;
  }
  function validDate(v) {
    const s = String(v || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + 'T12:00:00Z'))) throw bad('Please pick the date it was done.');
    if (Date.parse(s + 'T00:00:00Z') > Date.now() + 2 * 86400000) throw bad('The date can not be in the future.');
    return s;
  }
  function equipmentItem(id) {
    const it = getItem(id);
    if (!it || it.type !== 'equipment') throw new HttpError(404, 'That machine was not found. It may have been deleted.');
    return it;
  }
  const photoUrls = list => (list || []).map(p => ({ photoUrl: 'api/photos/' + p.photo, thumbUrl: 'api/photos/' + p.thumb }));
  function saveNewPhotos(arr) {
    if (arr === undefined || arr === null) return [];
    if (!Array.isArray(arr)) throw bad('Photos are not valid.');
    if (arr.length > MAX_RECORD_PHOTOS) throw bad(`Up to ${MAX_RECORD_PHOTOS} photos per entry.`);
    const out = [];
    try { for (const p of arr) out.push(savePhotos(p && p.photo, p && p.thumb)); }
    catch (e) { out.forEach(f => removePhotoFiles(f.photo, f.thumb)); throw e; }
    return out;
  }

  // ---------- hours / miles ----------
  function addReading(itemId, value, unit, user, item) {
    const it = item || db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
    const previous = it && it.meter_value != null ? it.meter_value : null;
    const lower = previous != null && value < previous && (it.meter_unit || 'hours') === unit;
    const t = now();
    db.prepare('INSERT INTO meter_readings (id, item_id, value, unit, created_at, user_id, user_name, lower, previous) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(uuid(), itemId, value, unit, t, user.id, user.name, lower ? 1 : 0, previous);
    db.prepare('UPDATE items SET meter_value = ?, meter_unit = ?, meter_updated_at = ?, meter_updated_by_name = ? WHERE id = ?').run(value, unit, t, user.name, itemId);
    return { lower, previous };
  }
  app.post('/api/items/:id/meter', auth, (req, res) => {
    const it = equipmentItem(req.params.id);
    const value = meterNum(req.body.value);
    const unit = UNIT(it.meter_unit);
    const r = db.transaction(() => addReading(it.id, value, unit, req.user, it))();
    if (r.lower) recordEvent('meter_low', getItem(it.id), req.user, { from: r.previous, to: value, unit });
    res.json({ item: itemOut(getItem(it.id)), lower: r.lower, previous: r.previous });
  });

  // ---------- maintenance & repair records ----------
  const FIELDS = ['kind', 'doneDate', 'meter', 'work', 'performedBy', 'cost'];
  function readRecordFields(b) {
    return {
      kind: b.kind === 'repair' ? 'repair' : b.kind === 'maintenance' ? 'maintenance' : (() => { throw bad('Pick Maintenance or Repair.'); })(),
      doneDate: validDate(b.doneDate),
      meter: optMeter(b.meter),
      work: str(b.work, { max: 2000, required: true, label: 'What was done' }),
      performedBy: str(b.performedBy, { max: 120, label: 'Who did it' }),
      cost: optCost(b.cost)
    };
  }
  const recFields = r => ({ kind: r.kind, doneDate: r.done_date, meter: r.meter, work: r.work, performedBy: r.performed_by, cost: r.cost });
  function fmtDate(s) { if (!s) return '(none)'; const d = new Date(s + 'T12:00:00'); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function fieldText(k, v, unit) {
    if (v === null || v === undefined || v === '') return '(none)';
    if (k === 'kind') return v === 'repair' ? 'Repair' : 'Maintenance';
    if (k === 'doneDate') return fmtDate(v);
    if (k === 'meter') return `${fmtNum(v)} ${unit || 'hours'}`;
    if (k === 'cost') return '$' + Number(v).toFixed(2);
    return String(v);
  }
  const LABELS = { kind: 'type', doneDate: 'date', meter: 'hours/miles', work: 'what was done', performedBy: 'done by', cost: 'cost' };
  function diff(a, b, unit) {
    const out = [];
    for (const k of FIELDS) {
      if ((a[k] ?? null) !== (b[k] ?? null)) out.push(k === 'work' ? 'what was done' : `${LABELS[k]} ${fieldText(k, a[k], unit)} → ${fieldText(k, b[k], unit)}`);
    }
    return out;
  }
  function audit(recordId, action, byName, opts) {
    opts = opts || {};
    db.prepare('INSERT INTO record_audit (id, record_id, at, action, by_name, approved_by_name, details, note) VALUES (?,?,?,?,?,?,?,?)')
      .run(uuid(), recordId, now(), action, byName, opts.approvedBy || null, opts.details ? JSON.stringify(opts.details) : null, opts.note || null);
  }
  function crOut(c) {
    const old = JSON.parse(c.old), proposed = c.proposed ? JSON.parse(c.proposed) : null;
    return {
      id: c.id, recordId: c.record_id, itemId: c.item_id, kind: c.kind, old, proposed, reason: c.reason, status: c.status,
      requestedByName: c.requested_by_name, createdAt: c.created_at, decidedByName: c.decided_by_name, decidedAt: c.decided_at, decisionNote: c.decision_note,
      changes: proposed ? diff(old, proposed, old.meterUnit) : []
    };
  }
  function recordOut(r) {
    const pending = db.prepare("SELECT * FROM change_requests WHERE record_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1").get(r.id);
    return {
      id: r.id, itemId: r.item_id, ...recFields(r), meterUnit: r.meter_unit || 'hours', photos: photoUrls(JSON.parse(r.photos || '[]')),
      repairRequestId: r.repair_request_id, createdAt: r.created_at, createdByName: r.created_by_name, updatedAt: r.updated_at,
      audit: db.prepare('SELECT * FROM record_audit WHERE record_id = ? ORDER BY at').all(r.id).map(a => ({
        at: a.at, action: a.action, byName: a.by_name, approvedByName: a.approved_by_name, details: a.details ? JSON.parse(a.details) : null, note: a.note
      })),
      pending: pending ? crOut(pending) : null
    };
  }
  function repairOut(r, withItem) {
    const out = {
      id: r.id, itemId: r.item_id, problem: r.problem, urgency: r.urgency,
      photoUrl: r.photo ? 'api/photos/' + r.photo : '', thumbUrl: r.thumb ? 'api/photos/' + r.thumb : '',
      meter: r.meter, meterUnit: r.meter_unit || 'hours', status: r.status, requestedByName: r.requested_by_name,
      createdAt: r.created_at, updatedAt: r.updated_at, statusByName: r.status_by_name, statusNote: r.status_note, recordId: r.record_id
    };
    if (withItem) {
      const it = db.prepare('SELECT name, thumb, deleted_at FROM items WHERE id = ?').get(r.item_id) || {};
      out.itemName = it.name || '(removed)'; out.itemThumbUrl = it.thumb ? 'api/photos/' + it.thumb : ''; out.itemDeleted = !!it.deleted_at;
    }
    return out;
  }
  const getRecord = id => db.prepare('SELECT * FROM maint_records WHERE id = ? AND deleted_at IS NULL').get(String(id));
  function liveRecord(id) {
    const r = getRecord(id);
    if (!r) throw new HttpError(404, 'That record was not found. It may have been deleted.');
    return r;
  }

  app.get('/api/equipment/:id/log', auth, (req, res) => {
    const it = equipmentItem(req.params.id);
    res.json({
      readings: db.prepare('SELECT * FROM meter_readings WHERE item_id = ? ORDER BY created_at DESC LIMIT 20').all(it.id)
        .map(r => ({ value: r.value, unit: r.unit, at: r.created_at, byName: r.user_name, lower: !!r.lower, previous: r.previous })),
      records: db.prepare('SELECT * FROM maint_records WHERE item_id = ? AND deleted_at IS NULL ORDER BY done_date DESC, created_at DESC').all(it.id).map(recordOut),
      repairs: db.prepare("SELECT * FROM repair_requests WHERE item_id = ? ORDER BY CASE WHEN status IN ('open','in_progress') THEN 0 ELSE 1 END, created_at DESC LIMIT 30").all(it.id).map(r => repairOut(r))
    });
  });
  app.get('/api/records/:id', auth, (req, res) => res.json({ record: recordOut(liveRecord(req.params.id)) }));

  app.post('/api/items/:id/records', auth, (req, res) => {
    const it = equipmentItem(req.params.id);
    const f = readRecordFields(req.body);
    let rr = null;
    if (req.body.repairRequestId) {
      rr = db.prepare('SELECT * FROM repair_requests WHERE id = ? AND item_id = ?').get(String(req.body.repairRequestId), it.id);
      if (!rr) throw bad('That repair request was not found.');
    }
    const photos = saveNewPhotos(req.body.photos);
    const id = uuid(), t = now();
    try {
      db.transaction(() => {
        db.prepare(`INSERT INTO maint_records (id, item_id, kind, done_date, meter, meter_unit, work, performed_by, cost, photos, repair_request_id, created_at, created_by, created_by_name, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, it.id, f.kind, f.doneDate, f.meter, UNIT(it.meter_unit), f.work, f.performedBy, f.cost, JSON.stringify(photos), rr ? rr.id : null, t, req.user.id, req.user.name, t);
        audit(id, 'created', req.user.name);
        if (rr) db.prepare('UPDATE repair_requests SET record_id = ? WHERE id = ?').run(id, rr.id);
      })();
    } catch (e) { photos.forEach(p => removePhotoFiles(p.photo, p.thumb)); throw e; }
    recordEvent('record', it, req.user, { kind: f.kind, work: f.work.slice(0, 140) }, { refId: id });
    res.status(201).json({ record: recordOut(getRecord(id)) });
  });

  // Admins may change a record directly; it is still written to the audit trail.
  app.put('/api/records/:id', adminOnly, (req, res) => {
    const r = liveRecord(req.params.id);
    const f = readRecordFields(req.body);
    const oldPhotos = JSON.parse(r.photos || '[]');
    const keep = Array.isArray(req.body.keepPhotos) ? oldPhotos.filter(p => req.body.keepPhotos.includes('api/photos/' + p.photo)) : oldPhotos;
    if (keep.length + (req.body.newPhotos || []).length > MAX_RECORD_PHOTOS) throw bad(`Up to ${MAX_RECORD_PHOTOS} photos per entry.`);
    const added = saveNewPhotos(req.body.newPhotos);
    const changes = diff(recFields(r), f, r.meter_unit);
    if (added.length) changes.push(added.length === 1 ? 'added a photo' : `added ${added.length} photos`);
    if (keep.length < oldPhotos.length) changes.push('removed a photo');
    if (!changes.length) return res.json({ record: recordOut(r) });
    db.transaction(() => {
      db.prepare('UPDATE maint_records SET kind=?, done_date=?, meter=?, work=?, performed_by=?, cost=?, photos=?, updated_at=? WHERE id=?')
        .run(f.kind, f.doneDate, f.meter, f.work, f.performedBy, f.cost, JSON.stringify(keep.concat(added)), now(), r.id);
      audit(r.id, 'changed', req.user.name, { details: { changes, direct: true } });
    })();
    oldPhotos.filter(p => !keep.includes(p)).forEach(p => removePhotoFiles(p.photo, p.thumb));
    const it = db.prepare('SELECT * FROM items WHERE id = ?').get(r.item_id);
    recordEvent('record_edit', it, req.user, { kind: f.kind, changes }, { refId: r.id });
    res.json({ record: recordOut(getRecord(r.id)) });
  });
  app.delete('/api/records/:id', adminOnly, (req, res) => {
    const r = liveRecord(req.params.id);
    db.transaction(() => {
      db.prepare('UPDATE maint_records SET deleted_at = ?, deleted_by_name = ? WHERE id = ?').run(now(), req.user.name, r.id);
      db.prepare("UPDATE change_requests SET status = 'denied', decided_by_name = ?, decided_at = ?, decision_note = 'Record was deleted' WHERE record_id = ? AND status = 'pending'").run(req.user.name, now(), r.id);
      audit(r.id, 'deleted', req.user.name, { details: { direct: true } });
    })();
    res.json({ ok: true });
  });

  // ---------- change requests (crew → admins) ----------
  app.post('/api/records/:id/change-requests', auth, (req, res) => {
    const r = liveRecord(req.params.id);
    const it = equipmentItem(r.item_id);
    if (db.prepare("SELECT 1 FROM change_requests WHERE record_id = ? AND status = 'pending'").get(r.id))
      throw new HttpError(409, 'A change for this entry is already waiting for approval.');
    const kind = req.body.kind === 'delete' ? 'delete' : 'edit';
    const reason = str(req.body.reason, { max: 500, required: true, label: 'Reason' });
    const old = { ...recFields(r), meterUnit: r.meter_unit || 'hours' };
    let proposed = null, changes = [];
    if (kind === 'edit') {
      proposed = { ...readRecordFields(req.body.proposed || {}), meterUnit: old.meterUnit };
      changes = diff(old, proposed, old.meterUnit);
      if (!changes.length) throw bad('Nothing was changed. Change at least one thing, or ask to delete instead.');
    }
    const id = uuid();
    db.prepare(`INSERT INTO change_requests (id, record_id, item_id, kind, old, proposed, reason, requested_by, requested_by_name, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, r.id, it.id, kind, JSON.stringify(old), proposed ? JSON.stringify(proposed) : null, reason, req.user.id, req.user.name, now());
    recordEvent('approval', it, req.user, { kind, changes, reason, summary: `${fieldText('kind', old.kind)} on ${fmtDate(old.doneDate)}: ${old.work.slice(0, 80)}` }, { refId: id });
    res.status(201).json({ request: crOut(db.prepare('SELECT * FROM change_requests WHERE id = ?').get(id)) });
  });

  app.post('/api/change-requests/:id/decide', adminOnly, (req, res) => {
    const c = db.prepare('SELECT * FROM change_requests WHERE id = ?').get(String(req.params.id));
    if (!c) throw new HttpError(404, 'Request not found.');
    if (c.status !== 'pending') throw new HttpError(409, `This request was already ${c.status} by ${c.decided_by_name || 'someone'}.`);
    const approve = !!req.body.approve;
    const note = str(req.body.note, { max: 500, label: 'Note' });
    const r = getRecord(c.record_id);
    if (approve && !r) throw new HttpError(409, 'That record no longer exists.');
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(c.item_id);
    const out = crOut(c);
    db.transaction(() => {
      db.prepare('UPDATE change_requests SET status = ?, decided_by_name = ?, decided_at = ?, decision_note = ? WHERE id = ?')
        .run(approve ? 'approved' : 'denied', req.user.name, now(), note || null, c.id);
      if (!approve) {
        audit(c.record_id, 'change_denied', c.requested_by_name, { approvedBy: req.user.name, details: { kind: c.kind, changes: out.changes }, note: note || null });
      } else if (c.kind === 'delete') {
        db.prepare('UPDATE maint_records SET deleted_at = ?, deleted_by_name = ? WHERE id = ?').run(now(), c.requested_by_name, r.id);
        audit(r.id, 'deleted', c.requested_by_name, { approvedBy: req.user.name, note: c.reason });
      } else {
        // Apply only what the person asked to change (keeps other updates made since the request).
        const cur = recFields(r), next = { ...cur };
        for (const k of FIELDS) if ((out.old[k] ?? null) !== (out.proposed[k] ?? null)) next[k] = out.proposed[k];
        db.prepare('UPDATE maint_records SET kind=?, done_date=?, meter=?, work=?, performed_by=?, cost=?, updated_at=? WHERE id=?')
          .run(next.kind, next.doneDate, next.meter, next.work, next.performedBy, next.cost, now(), r.id);
        audit(r.id, 'changed', c.requested_by_name, { approvedBy: req.user.name, details: { changes: out.changes }, note: c.reason });
      }
    })();
    if (c.requested_by && c.requested_by !== req.user.id)
      recordEvent('request_result', item, req.user, { approved: approve, note, kind: c.kind, changes: out.changes }, { recipientId: c.requested_by, refId: c.id });
    res.json({ request: crOut(db.prepare('SELECT * FROM change_requests WHERE id = ?').get(c.id)) });
  });

  // ---------- repair requests ----------
  const URGENCY = ['can_wait', 'soon', 'down'];
  app.post('/api/items/:id/repairs', auth, (req, res) => {
    const it = equipmentItem(req.params.id);
    const problem = str(req.body.problem, { max: 2000, required: true, label: "What's wrong" });
    if (!URGENCY.includes(req.body.urgency)) throw bad('Pick how urgent it is.');
    const meter = optMeter(req.body.meter);
    const files = req.body.photo ? savePhotos(req.body.photo, req.body.thumb) : { photo: null, thumb: null };
    const id = uuid(), t = now();
    db.prepare(`INSERT INTO repair_requests (id, item_id, problem, urgency, photo, thumb, meter, meter_unit, requested_by, requested_by_name, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, it.id, problem, req.body.urgency, files.photo, files.thumb, meter, UNIT(it.meter_unit), req.user.id, req.user.name, t, t);
    // A new reading taken with the request also updates the machine.
    if (meter !== null && (it.meter_value == null || meter >= it.meter_value)) addReading(it.id, meter, UNIT(it.meter_unit), req.user, it);
    recordEvent('repair', getItem(it.id), req.user, { urgency: req.body.urgency, problem: problem.slice(0, 200) }, { refId: id });
    res.status(201).json({ repair: repairOut(db.prepare('SELECT * FROM repair_requests WHERE id = ?').get(id)), item: itemOut(getItem(it.id)) });
  });
  app.post('/api/repairs/:id/status', adminOnly, (req, res) => {
    const r = db.prepare('SELECT * FROM repair_requests WHERE id = ?').get(String(req.params.id));
    if (!r) throw new HttpError(404, 'Repair request not found.');
    const status = req.body.status;
    if (!['open', 'in_progress', 'done', 'declined'].includes(status)) throw bad('Bad status.');
    const note = str(req.body.note, { max: 500, label: 'Note' });
    if (status === 'declined' && !note) throw bad('Please write a short note saying why.');
    db.prepare('UPDATE repair_requests SET status = ?, status_by_name = ?, status_note = ?, updated_at = ? WHERE id = ?').run(status, req.user.name, note || null, now(), r.id);
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(r.item_id);
    if (r.requested_by && r.requested_by !== req.user.id)
      recordEvent('repair_status', item, req.user, { status, note, problem: r.problem.slice(0, 120) }, { recipientId: r.requested_by, refId: r.id });
    res.json({ repair: repairOut(db.prepare('SELECT * FROM repair_requests WHERE id = ?').get(r.id), true), item: item && !item.deleted_at ? itemOut(item) : null });
  });

  // ---------- "Needs your OK" (admins) and "My requests" (everyone) ----------
  function inboxCounts() {
    return {
      approvals: db.prepare("SELECT COUNT(*) c FROM change_requests WHERE status = 'pending'").get().c,
      repairs: db.prepare("SELECT COUNT(*) c FROM repair_requests r JOIN items i ON i.id = r.item_id WHERE r.status IN ('open','in_progress') AND i.deleted_at IS NULL").get().c,
      down: db.prepare("SELECT COUNT(*) c FROM repair_requests r JOIN items i ON i.id = r.item_id WHERE r.status IN ('open','in_progress') AND r.urgency = 'down' AND i.deleted_at IS NULL").get().c
    };
  }
  function withItemName(o) {
    const it = db.prepare('SELECT name, thumb, deleted_at FROM items WHERE id = ?').get(o.itemId) || {};
    return { ...o, itemName: it.name || '(removed)', itemThumbUrl: it.thumb ? 'api/photos/' + it.thumb : '', itemDeleted: !!it.deleted_at };
  }
  app.get('/api/inbox', adminOnly, (req, res) => {
    res.json({
      approvals: db.prepare("SELECT * FROM change_requests WHERE status = 'pending' ORDER BY created_at").all().map(c => withItemName(crOut(c))),
      repairs: db.prepare(`SELECT r.* FROM repair_requests r JOIN items i ON i.id = r.item_id WHERE r.status IN ('open','in_progress') AND i.deleted_at IS NULL
        ORDER BY CASE r.urgency WHEN 'down' THEN 0 WHEN 'soon' THEN 1 ELSE 2 END, r.created_at`).all().map(r => repairOut(r, true)),
      counts: inboxCounts()
    });
  });
  app.get('/api/my/requests', auth, (req, res) => {
    res.json({
      changeRequests: db.prepare('SELECT * FROM change_requests WHERE requested_by = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id).map(c => withItemName(crOut(c))),
      repairs: db.prepare('SELECT * FROM repair_requests WHERE requested_by = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id).map(r => repairOut(r, true))
    });
  });

  // ---------- backup / restore ----------
  function exportData() {
    return {
      readings: db.prepare('SELECT * FROM meter_readings').all(),
      records: db.prepare('SELECT * FROM maint_records WHERE deleted_at IS NULL').all().map(r => ({
        ...r, photos: JSON.parse(r.photos || '[]').map(p => ({ photo: photoToDataUrl(p.photo), thumb: photoToDataUrl(p.thumb) }))
      })),
      audit: db.prepare('SELECT * FROM record_audit').all(),
      changeRequests: db.prepare('SELECT * FROM change_requests').all(),
      repairs: db.prepare('SELECT * FROM repair_requests').all().map(r => ({ ...r, photo: photoToDataUrl(r.photo), thumb: photoToDataUrl(r.thumb) }))
    };
  }
  // Called inside the restore transaction. Rows are matched by id (restoring twice does not duplicate).
  function importData(eq, written) {
    if (!eq || typeof eq !== 'object') return { records: 0, repairs: 0 };
    const S = v => (v === undefined || v === null ? null : String(v).slice(0, 4000));
    const N = v => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    let records = 0, repairs = 0;
    const hasItem = id => !!db.prepare('SELECT 1 FROM items WHERE id = ?').get(String(id));
    const hasRec = id => !!db.prepare('SELECT 1 FROM maint_records WHERE id = ?').get(String(id));
    for (const r of Array.isArray(eq.readings) ? eq.readings : []) {
      if (!r || !r.id || !r.item_id || N(r.value) === null || !hasItem(r.item_id)) continue;
      db.prepare('INSERT OR REPLACE INTO meter_readings (id, item_id, value, unit, created_at, user_id, user_name, lower, previous) VALUES (?,?,?,?,?,NULL,?,?,?)')
        .run(S(r.id), S(r.item_id), N(r.value), UNIT(r.unit), N(r.created_at) || now(), S(r.user_name) || '?', r.lower ? 1 : 0, N(r.previous));
    }
    for (const r of Array.isArray(eq.records) ? eq.records : []) {
      try {
        if (!r || !r.id || !r.item_id || !hasItem(r.item_id)) continue;
        const kind = r.kind === 'repair' ? 'repair' : 'maintenance';
        const photos = [];
        for (const p of (Array.isArray(r.photos) ? r.photos : []).slice(0, MAX_RECORD_PHOTOS)) if (p && p.photo) { const f = savePhotos(p.photo, p.thumb); written.push(f.photo, f.thumb); photos.push(f); }
        const old = db.prepare('SELECT photos FROM maint_records WHERE id = ?').get(S(r.id));
        db.prepare(`INSERT OR REPLACE INTO maint_records (id, item_id, kind, done_date, meter, meter_unit, work, performed_by, cost, photos, repair_request_id, created_at, created_by, created_by_name, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?)`).run(S(r.id), S(r.item_id), kind, validDate(r.done_date), N(r.meter), UNIT(r.meter_unit),
          str(r.work, { max: 2000, required: true, label: 'Work' }), S(r.performed_by) || '', N(r.cost), JSON.stringify(photos), S(r.repair_request_id),
          N(r.created_at) || now(), S(r.created_by_name) || '?', N(r.updated_at) || now());
        if (old) JSON.parse(old.photos || '[]').forEach(p => removePhotoFiles(p.photo, p.thumb));
        records++;
      } catch (e) { if (!(e instanceof HttpError)) throw e; }
    }
    for (const a of Array.isArray(eq.audit) ? eq.audit : []) {
      if (!a || !a.id || !a.record_id || !hasRec(a.record_id)) continue;
      db.prepare('INSERT OR REPLACE INTO record_audit (id, record_id, at, action, by_name, approved_by_name, details, note) VALUES (?,?,?,?,?,?,?,?)')
        .run(S(a.id), S(a.record_id), N(a.at) || now(), S(a.action) || 'changed', S(a.by_name) || '?', S(a.approved_by_name), S(a.details), S(a.note));
    }
    for (const c of Array.isArray(eq.changeRequests) ? eq.changeRequests : []) {
      if (!c || !c.id || !c.record_id || !['pending', 'approved', 'denied'].includes(c.status) || !hasRec(c.record_id) || !hasItem(c.item_id)) continue;
      db.prepare(`INSERT OR REPLACE INTO change_requests (id, record_id, item_id, kind, old, proposed, reason, status, requested_by, requested_by_name, created_at, decided_by_name, decided_at, decision_note)
        VALUES (?,?,?,?,?,?,?,?,NULL,?,?,?,?,?)`).run(S(c.id), S(c.record_id), S(c.item_id), c.kind === 'delete' ? 'delete' : 'edit', S(c.old) || '{}', S(c.proposed),
        S(c.reason) || '', c.status, S(c.requested_by_name) || '?', N(c.created_at) || now(), S(c.decided_by_name), N(c.decided_at), S(c.decision_note));
    }
    for (const r of Array.isArray(eq.repairs) ? eq.repairs : []) {
      try {
        if (!r || !r.id || !r.item_id || !URGENCY.includes(r.urgency) || !hasItem(r.item_id)) continue;
        let f = { photo: null, thumb: null };
        if (r.photo) { f = savePhotos(r.photo, r.thumb); written.push(f.photo, f.thumb); }
        const status = ['open', 'in_progress', 'done', 'declined'].includes(r.status) ? r.status : 'open';
        db.prepare(`INSERT OR REPLACE INTO repair_requests (id, item_id, problem, urgency, photo, thumb, meter, meter_unit, status, requested_by, requested_by_name, created_at, updated_at, status_by_name, status_note, record_id)
          VALUES (?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?)`).run(S(r.id), S(r.item_id), str(r.problem, { max: 2000, required: true, label: 'Problem' }), r.urgency, f.photo, f.thumb,
          N(r.meter), UNIT(r.meter_unit), status, S(r.requested_by_name) || '?', N(r.created_at) || now(), N(r.updated_at) || now(), S(r.status_by_name), S(r.status_note), S(r.record_id));
        repairs++;
      } catch (e) { if (!(e instanceof HttpError)) throw e; }
    }
    return { records, repairs };
  }

  return { addReading, meterNum, inboxCounts, exportData, importData };
};
