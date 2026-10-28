# Job Site Inventory (v2.4.0): materials by main/subcategory, tools, and equipment & maintenance

A simple app for keeping track of **Materials**, **Tools** and **Equipment & Maintenance**: the name, how many there are, where they are, a photo, and notes.
Everyone on the crew sees the same list. People sign in with a username and password.
It works in the browser on iPhone, Android, Windows and Mac, and can be installed to the home screen.

- **Frontend**: plain HTML/CSS/JS in `public/`. It's an installable PWA with a service worker, so the app opens even with no signal.
- **Backend**: Node.js 22, Express and SQLite (`better-sqlite3`), in `server/`. Photos are saved as files and only signed-in people can see them.
- **v1** (the offline-only version that stored everything on each device) is kept under git tag `v1`, v2 before notifications is under tag `v2`, v2.1 (before Equipment) under tag `v2.1`, v2.2 (before material categories) under tag `v2.2`, and v2.3 (flat categories) under tag `v2.3`.

## Who can do what
| | Crew | Admin |
|---|---|---|
| See, search, add, edit (all fields, including replacing or removing the photo) and delete items | ✓ | ✓ |
| Equipment: update hours/miles, add maintenance/repair records, **ask to change** a locked record, **request a repair** | ✓ | ✓ |
| See the answers to your own requests (bell → **My requests**) | ✓ | ✓ |
| Get notifications (bell + phone/desktop alerts) for approvals, repair requests, adds and deletes | | ✓ |
| Approve/deny record changes, edit or delete records directly, set repair request status | | ✓ |
| Restore a deleted item | | ✓ |
| Add people (as Crew or Admin), make someone Admin or Crew, reset passwords, turn sign-in off or on, remove people | | ✓ |
| Add, rename, re-icon, reorder, hide material categories, set parent (main group), and choose their extra fields | | ✓ |
| Download backup / restore (including old v1 backup files) | | ✓ |
| Change own password | ✓ | ✓ |

- There's no public sign-up. The first time the app runs, it asks someone to **create the admin account**.
- There can be several admins. There must always be at least one active admin: the last admin can't change themselves to Crew,
  remove themselves, or turn off their own account. Someone who is made admin (or made admin again) starts with an empty, all-read bell.
- New people get a temporary password and must pick their own the first time they sign in.
- Each device stays signed in for 30 days, renewed while it's in use.
- Every item shows who last changed it and when, e.g. "Updated by Mike, Oct 3, 2:15 PM".
- Delete always asks first. Deleted items are hidden, not destroyed. Admins can **restore** them from Notifications for
  90 days (`DELETED_KEEP_DAYS`), after which the item and its photo are removed for good.

## Material categories (v2.4 hierarchy)
Tapping **Materials** shows **Search all materials** and a grid of **main groups**. Tap a main group to see its **subcategories**,
then open a subcategory for its item list (own search box, location filter, **Add** pre-filled for that leaf).
Breadcrumbs show Materials › Main › Sub. **Other / Uncategorized** stays top-level (no parent).
The item form **Category** dropdown is grouped by main. **Counted in** units: each, pieces, bags, boxes, bundles, rolls, sheets,
pallets, buckets, tubes, ft, sq ft, tons, cubic yards, gallons, lbs (default "each").

Starting tree (parents → leaves):
1. **Site, Dirt & Landscaping** → Site Work, Earthwork & Aggregates · Erosion Control & Geotextiles · Landscaping
2. **Concrete, Masonry & Metals** → Concrete, Cement & Masonry · Rebar & Reinforcing · Structural Steel & Metals
3. **Roads, Paving & Traffic** → Asphalt & Paving · Traffic Control & Signage
4. **Underground Utilities** → Drainage, Storm & Sewer · Water & Underground Utilities
5. **Building Structure & Shell** → Framing, Lumber & Sheathing · Roofing · Siding & Exterior Finishes · Insulation & Weatherproofing · Doors & Windows
6. **Interior Finishes** → Drywall & Interior Finishes · Flooring & Tile · Paint, Caulk & Adhesives
7. **MEP** → Plumbing · HVAC & Ductwork · Electrical · Low Voltage, Data & Communications · Fire Protection & Life Safety
8. **Hardware & Safety** → Fasteners, Anchors & Hardware · Safety & PPE
9. **Other / Uncategorized** (top-level)

Upgrades from v2.3 merge leftover flat categories into leaves: Aggregates → Site Work, Earthwork & Aggregates;
Concrete & Cement → Concrete, Cement & Masonry; Roads & Bridges → Asphalt & Paving (those old ids stay hidden).

- **Extra fields per category.** Some categories ask for more details (all optional):
  - **Electrical**: Length of wire (number + ft/m), Wire size/gauge (14 AWG … 4/0 … 500 kcmil) and Wire type (THHN/THWN-2, Romex/NM-B, MC, UF-B, XHHW-2, SER …).
  - **Low Voltage, Data & Communications**: Cable length and Cable type (Cat6, Cat6A, coax, fiber, alarm …).
  - **Plumbing**, **Drainage, Storm & Sewer**, **Water & Underground Utilities**: Pipe length, Pipe size and Pipe material (PVC, PEX, copper, HDPE, ductile iron, RCP …).
  - Dropdowns have an **Other (type it)** choice for anything not listed.
  - Cards show the length prominently ("Length: 500 ft") plus size/type ("12 AWG · Romex / NM-B"). Search finds these too ("12 awg", "500 ft", "romex").
  - The details page has a **Used / Added** box: type how much (e.g. 50) and tap **− Used** or **+ Added**. Admins see "Length 250 → 200 ft" in Notifications.
  - The system is generic: an admin can turn any of these fields on for any category (Manage categories → Extra fields).
- **Manage categories** (admins: Materials → Manage categories): add a category (name, icon, parent main group, extra fields), rename,
  change the icon, move up/down with the arrows, or hide it. Hidden categories don't show on the Materials page or in the Add form; if items
  are still in a hidden category it keeps showing (marked "hidden") so nothing gets lost. "Other / Uncategorized" can't be hidden. Categories are not deleted.
- **Search**: the home search and "Search all materials" also match category names (e.g. "electrical", "asphalt").
- **Notifications** name the category, e.g. "12/2 Romex (Electrical) — Qty 3 rolls — 250 ft — Truck 2"; edits list category/unit/length changes.
- **Backup/restore** (backup version 5) includes the category list (names, icons, order, hidden, parent, extra fields) and each item's category, unit and extra fields.
  Older backups restore into "Other / Uncategorized" (v4 backups keep flat categories; reopen the app once so schema v5 applies hierarchy).
- **Upgrading** from v2.3: schema version 5 adds `parent_id`, inserts main groups, renames/merges leaves as above. From v2.2: schema 4 then 5;
  existing materials go to **Other / Uncategorized** with unit "each" until moved.

## Equipment & Maintenance (v2.2)
A third big green button on the home page. Machines have the same fields as materials and tools (name, quantity, location,
photo, description; anyone can add, edit or delete; deletes can be restored by an admin; home search and location filter work), plus:

- **Hours / Miles meter.** Each machine is measured in Hours or Miles (picked when adding it; can be changed in Edit).
  The details page shows the reading in big numbers, when it was last updated and by whom, and a big **Update hours/miles** button
  that opens a large number entry. A **History** list shows the last 20 readings with who/when.
  If a new reading is **lower** than the last one, the app asks "Save anyway?"; if saved, it is marked "Lower than before"
  in the history and admins get a **Meter lower than before** notification (no phone alert).
- **Maintenance & Repair Record** (on each machine, newest first). Anyone can add an entry: Maintenance or Repair, date done,
  hours/miles at the time (filled in from the current reading), what was done, who did it / shop, optional cost, and up to 4 photos (receipts).
  - Once saved, an entry is **locked**. Crew can't change or delete it. Instead they tap **Ask to change**, fix the fields
    (or switch on "Ask to delete this entry instead") and say why. This sends **Approval needed** to every admin (Notifications + phone alert).
    The entry shows **"Change waiting for approval"** until an admin decides; only one request per entry can be waiting.
  - The admin sees **Now** and **Change to** side by side for each changed field, with big **Approve** / **Deny** buttons and an optional note.
    Only on Approve does the record change. The person who asked gets an in-app notice either way.
  - Every entry keeps an **audit trail**, e.g. "Changed on Oct 5, asked by Mike Torres, approved by Sara Lopez: cost $89.50 → $95.00"
    or "Change asked by Mike on Oct 5 was not approved by Joseph: 'We need this for the warranty'".
  - **Admins can edit or delete entries directly** (including adding/removing photos). This is also written to the audit trail
    ("Changed on Oct 5 by Joseph (admin)"). Deleted entries stay in the database (hidden) for the record.
  - Crew change requests cover the text fields and deletion; photos on a saved entry can only be changed by an admin.
- **Repair requests.** A big red **Request a repair** button on each machine: what's wrong, how urgent (**Can wait / Soon / DOWN — not usable**),
  an optional photo, and the current hours/miles. All admins get a notification + phone alert.
  - The machine shows a badge on its card and details page: red **DOWN — not usable**, orange **Repair requested**, or **Repair in progress**.
  - Admins mark a request **In progress**, **Done** or **Declined** (a note is required to decline). **Done** offers to add a Repair entry
    to the record, already filled in (type Repair, the problem, the hours/miles). The requester is notified of each change.
  - The Equipment list has a **Needs repair only** filter. The home page shows admins how many machines need repair, and a
    **Needs your OK** banner with the number of changes to approve and open repair requests.
- **Notifications.** The admin Notifications page starts with a **Needs your OK** section (all waiting approvals and open repair requests,
  with their buttons right there), then the feed. New kinds: Approval needed, Repair request, Meter lower than before, Record added/changed.
  Filters: **Important / Everything**, and **All / Approvals / Repairs / Meter / Items**. Phone alerts are sent for approvals and repair requests
  (plus adds, deletes and restores as before).
- **Crew notifications.** Crew now have a bell too. It opens **My requests**: new answers at the top, then their repair requests and change requests
  with the status (Waiting / Approved by … / Not approved / In progress / Done / Declined) and any note. Crew don't get phone alerts.
- **Backup/restore** (backup file version 3) includes machines, meter readings, maintenance records with photos, audit trails,
  change requests and repair requests. Older backup files still restore.
- **Upgrading** from v2.1: the database is migrated automatically on first start (schema version 3). Existing items, people,
  notifications and push subscriptions are kept. Back up `DATA_DIR` first, as always.

## Notifications (admins)
- **Bell in the top bar** with a count of unread notifications. Each admin has their own read/unread state.
  Tapping a notification marks it read and opens the item. There's also a **Mark all read** button.
- Each entry looks like: "**Mike Torres** added **Concrete mix 80 lb bags** — Qty 24 — Truck 2 — Oct 3, 4:14 PM", with the photo.
- **Deleted** entries show what was deleted (name, quantity, location, description, photo) and a big **Restore** button.
- A filter switches between **Important** (the default: adds, deletes, restores, approvals, repair requests, low meter readings, answers) and **Everything** (also edits, quantity changes and record entries).
  Edits list what changed. Many +/− taps by one person on one item within 10 minutes count as one entry ("24 → 27").
  The unread count follows the filter you picked. Your own actions never count as unread.
- **Phone/desktop alerts (Web Push)**: on the home screen or the Notifications page, tap **Turn on notifications on this device**.
  Alerts are sent for approvals needed, repair requests, adds, deletes and restores (not for edits or quantity changes, to keep it quiet).
  The app icon badge shows the unread count where the device supports it.
  - **iPhone/iPad:** this only works when the app has been **added to the Home Screen** (Safari → Share → Add to Home Screen)
    on **iOS/iPadOS 16.4 or newer**, and is opened from there. In a normal Safari tab the app shows these steps instead of the button.
  - Android (Chrome), Windows/Mac (Chrome, Edge, Firefox) and Mac Safari 16+ work in the browser or installed.
  - Push needs **https** (or `localhost` for testing).
- Web Push keys (VAPID) are generated on first start and stored in `DATA_DIR/vapid.json` (readable only by the owner). They are never in the code.
  If that file is lost, every device has to turn notifications on again. Set `VAPID_SUBJECT` to `mailto:you@yourcompany.com`
  (Apple's push service wants a real contact address).

## Run it on a Windows laptop (double-click, no hosting)
Download **Jobsite-Inventory-Windows.zip** from the GitHub Releases page, right-click it, choose
**Extract All...**, then follow `READ ME FIRST.txt` in the "Jobsite Inventory" folder. In short:
install Node.js LTS from nodejs.org (accept the defaults), then double-click **Start Inventory**.

- The first run installs the app's parts once (internet needed). better-sqlite3 ships ready-made Windows
  binaries and `.npmrc` sets `ignore-scripts=true`, so nothing is ever compiled (no Visual Studio needed).
- The browser opens `http://localhost:3000` (or 3001... if 3000 is busy). The window shows the address
  phones on the same Wi-Fi can use, e.g. `http://192.168.1.23:3000`. Closing the window stops the app.
- Data is kept in `%LOCALAPPDATA%\JobsiteInventory\data`, **outside** the app folder, so replacing the
  folder with a newer version never touches the data.
- The first admin account can only be created from the laptop itself (`SETUP_LOCAL_ONLY=1`); no setup code.
- **Backup Inventory** writes `Documents\Inventory Backups\Inventory Backup YYYY-MM-DD HHMM.zip`
  (safe while the app runs). Optional: **Start automatically when Windows starts** / **Stop starting automatically**.
- Phones use plain http on the Wi-Fi: sign-in, photos and everything else work, but phone push alerts,
  offline mode and "install to home screen" need https, so they are off there (the bell still shows news).
  The laptop itself (localhost) is a secure context, so those work on it.
- To build the zip: `python3 dev/build_windows.py` (files are in `windows/`).

| Variable (launcher) | Default | What it does |
|---|---|---|
| `INVENTORY_DATA_DIR` | `%LOCALAPPDATA%\JobsiteInventory\data` | Where the data is kept |
| `INVENTORY_PORT` | first free of 3000-3020 | Fixed port |
| `INVENTORY_NO_BROWSER` | (off) | `1` = don't open the browser (also `--startup`) |
| `SETUP_LOCAL_ONLY` | `1` in the launcher, off on servers | Only allow creating the first admin from localhost |

## Run it on your computer
Requires Node.js 22 or newer.

    npm install
    npm start                     # http://localhost:3000
    # or with settings:
    PORT=8080 DATA_DIR=/path/to/data npm start

The data (`inventory.db` plus `photos/`) is saved in `DATA_DIR`, which defaults to `./data`.
**Back up that folder** or use the in-app Backup button.

### Settings (environment variables)
| Variable | Default | What it does |
|---|---|---|
| `PORT` | 3000 | Web port |
| `HOST` | 0.0.0.0 | Address to listen on |
| `DATA_DIR` | `./data` | Where the database and photos are stored. Put this on a persistent disk. |
| `SETUP_CODE` | (none) | **Set this on a public server.** It's needed to create the first admin account, so a stranger can't do it first. |
| `COOKIE_SECURE` | `auto` | `auto` marks cookies Secure when the request came over https |
| `SETUP_LOCAL_ONLY` | (off) | `1` = the first admin account can only be created from the computer running the app (localhost) |
| `TRUST_PROXY` | `1` | Number of proxies in front of the app (Render/Railway/Fly have 1). Set `false` if the app is exposed directly. |
| `ALLOWED_ORIGINS` | (none) | Extra allowed origins, comma-separated (rarely needed) |
| `MAX_RESTORE_SIZE` | `500mb` | Largest backup file that can be restored |
| `VAPID_SUBJECT` | `mailto:admin@example.com` | Contact for push services. **Set it to your email.** |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | (generated) | Optional: provide your own push keys instead of the generated `vapid.json` |
| `DELETED_KEEP_DAYS` | 90 | How long deleted items can still be restored |

See `.env.example`. Never commit real secrets. `.env` and `data/` are git-ignored.

### Locked out?
If the only admin forgets their password, run this on the server:

    DATA_DIR=/data node server/reset-password.js admin NewTempPass123

## Deploy (with a persistent disk)
The app needs **one small always-on server plus a persistent disk** (SQLite and the photos live on the disk).
Free tiers that wipe the disk on restart will lose data.

### Render (recommended, point and click)
1. Put this folder in a **private** GitHub repository.
2. In Render: **New + → Blueprint**, pick the repo. `render.yaml` creates a *Starter* web service with a 1 GB disk mounted at `/data`.
3. When asked, type a `SETUP_CODE` (any secret phrase) and set `VAPID_SUBJECT` to `mailto:` plus your email.
4. Open the `https://…onrender.com` address, enter the setup code, and create the admin account.
5. Optional: add your own domain under Settings → Custom Domains.

Cost: about **$7/month** (Starter) plus **$0.25/GB-month** for the disk, so roughly **$7.25/month**.
A disk means one instance, and each update causes a few seconds of downtime.

### Railway
New Project → Deploy from GitHub repo (it uses the `Dockerfile`). Add a **Volume** mounted at `/data`,
set the variables `SETUP_CODE` and `VAPID_SUBJECT`, then Settings → Networking → Generate Domain.
The Hobby plan is $5/month and includes $5 of usage, which normally covers this app. Volumes cost $0.15/GB-month.

### Fly.io
Uses the command line:

    fly launch --no-deploy
    fly volumes create data --size 1
    # in fly.toml add:  [mounts] source="data" destination="/data"
    fly secrets set SETUP_CODE=...
    fly deploy

It's pay-as-you-go, roughly $2–5/month for a small machine plus a 1 GB volume.

### Docker anywhere

    docker build -t jobsite-inventory .
    docker run -d -p 3000:3000 -v inventory-data:/data -e SETUP_CODE=change-me jobsite-inventory

Put it behind https, for example with Caddy. Installing to the home screen and secure cookies need https.

## Security notes
- Passwords are hashed with bcrypt (cost 12). Sessions are random tokens, and only a SHA-256 hash of each is stored.
- Cookies are `HttpOnly; SameSite=Lax`, plus `Secure` over https.
- Sign-in is rate-limited: 8 failed tries per username and 30 per IP address in 15 minutes.
- CSRF: changes must be JSON requests from the same origin (the Origin / Sec-Fetch-Site headers are checked).
- Uploads: only JPEG, PNG or WebP files are accepted (the file contents are checked, not just the name), up to 4 MB per photo and an 8 MB request.
  Photos are resized on the phone to about 1024 px before upload.
- A Content-Security-Policy and other security headers are set. Photos and the API need a signed-in session.
- Backup files contain password hashes, so keep them private.

## Offline
The app itself opens with no signal and shows the last lists and items that device saw (read-only).
A yellow banner says **"No connection — changes can't be saved right now."** Saving shows a clear error
and keeps what was typed on the screen. Changes are not queued for later.

## Files
    public/   index.html, app.js, styles.css, sw.js, manifest.json, icons/
    server/   server.js (API, notifications, push, static files), equipment.js (meter, records, approvals, repair requests),
              categories.js + catalog.js (material categories, units, extra fields),
              db.js (schema + migrations), reset-password.js
    windows/  Windows launcher (launcher.js, backup.js) + the .bat files and READ ME FIRST.txt for the zip
    Dockerfile, docker-entrypoint.sh, render.yaml, .env.example
    screenshots/   example screens (sample data)
    dev/make_icons.py   (draws the icons; not needed to run), dev/build_windows.py (builds the Windows zip)
