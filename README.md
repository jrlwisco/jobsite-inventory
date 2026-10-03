# Job Site Inventory (v2): shared and with sign-in

A simple app for keeping track of **Materials** and **Tools**: the name, how many there are, where they are, a photo, and notes.
Everyone on the crew sees the same list. People sign in with a username and password.
It works in the browser on iPhone, Android, Windows and Mac, and can be installed to the home screen.

- **Frontend**: plain HTML/CSS/JS in `public/`. It's an installable PWA with a service worker, so the app opens even with no signal.
- **Backend**: Node.js 22, Express and SQLite (`better-sqlite3`), in `server/`. Photos are saved as files and only signed-in people can see them.
- **v1** (the offline-only version that stored everything on each device) is kept under git tag `v1` (`git checkout v1`).

## Who can do what
| | Crew | Admin |
|---|---|---|
| See, search, add and edit items, change quantities | ✓ | ✓ |
| Delete items | only if the admin turns on "Crew members can delete items" | ✓ |
| Add people, reset passwords, turn sign-in off or on, remove people | | ✓ |
| Download backup / restore (including old v1 backup files) | | ✓ |
| Change own password | ✓ | ✓ |

- There's no public sign-up. The first time the app runs, it asks someone to **create the admin account**.
- New people get a temporary password and must pick their own the first time they sign in.
- Each device stays signed in for 30 days, renewed while it's in use.
- Every item shows who last changed it and when, e.g. "Updated by Mike, Oct 3, 2:15 PM".

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
| `TRUST_PROXY` | `1` | Number of proxies in front of the app (Render/Railway/Fly have 1). Set `false` if the app is exposed directly. |
| `ALLOWED_ORIGINS` | (none) | Extra allowed origins, comma-separated (rarely needed) |
| `MAX_RESTORE_SIZE` | `500mb` | Largest backup file that can be restored |

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
3. When asked, type a `SETUP_CODE` (any secret phrase).
4. Open the `https://…onrender.com` address, enter the setup code, and create the admin account.
5. Optional: add your own domain under Settings → Custom Domains.

Cost: about **$7/month** (Starter) plus **$0.25/GB-month** for the disk, so roughly **$7.25/month**.
A disk means one instance, and each update causes a few seconds of downtime.

### Railway
New Project → Deploy from GitHub repo (it uses the `Dockerfile`). Add a **Volume** mounted at `/data`,
set the variable `SETUP_CODE`, then Settings → Networking → Generate Domain.
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
    server/   server.js (API + static), db.js (schema), reset-password.js
    Dockerfile, docker-entrypoint.sh, render.yaml, .env.example
    screenshots/   example screens (sample data)
    dev/make_icons.py   (draws the icons; not needed to run)
