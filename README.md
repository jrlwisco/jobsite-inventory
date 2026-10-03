# Job Site Inventory (v1)

A simple app to keep track of **Materials** and **Tools**: name, how many, where it is, a photo, and notes.
Works in any modern browser on iPhone, Android, Windows and Mac, and can be installed to the home screen / desktop.
Works with no internet after the first visit.

## Files
- `index.html` – the page
- `styles.css` – look and feel (big text, big buttons, high contrast)
- `app.js` – screens, search, photos, backup
- `db.js` – saves data on the device (IndexedDB)
- `sw.js` – service worker (offline). **Change `VERSION` in this file whenever you update the app** so phones pick up the new files.
- `manifest.json`, `icons/` – install-to-home-screen info and icons
- `dev/make_icons.py` – optional helper used to draw the icons (not needed to run the app)
- `screenshots/` – example screenshots (sample data)

## Run it
It is just static files. Any web server works, e.g.:

    python3 -m http.server 8080
    # open http://localhost:8080

Installing and offline mode need **https** (or `localhost`).

## Install on a device
- **iPhone/iPad (Safari):** Share button → *Add to Home Screen*.
- **Android (Chrome):** menu ⋮ → *Install app* / *Add to Home screen*.
- **Windows/Mac (Chrome or Edge):** install icon in the address bar. (Mac Safari 17+: File → *Add to Dock*.)

## Important: data stays on each device
There is no server in v1. Each phone/computer has its own list. Use **Backup & Restore** on the home screen
to save a backup file (includes photos) and to move a list to another device.
