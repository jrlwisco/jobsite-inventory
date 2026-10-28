# Job Site Inventory — Mobile App (App Store / Google Play)

This folder is a **Capacitor** native wrapper around the live web app:

**https://jobsite-inventory.onrender.com**

It is a **real iPhone/Android app** you install from the Apple App Store or Google Play — not “Add to Home Screen.”

| Setting | Value |
|--------|--------|
| App name | Job Site Inventory |
| Bundle ID / Application ID | `com.jrlwisco.jobsiteinventory` |
| Live URL loaded in the app | `https://jobsite-inventory.onrender.com` |
| Capacitor | 7.x |
| Platforms | `ios/` and `android/` (already generated) |

## What you need (one-time)

### For iPhone (Apple App Store)
1. A **Mac** with **Xcode** (from the Mac App Store).
2. An **Apple Developer Program** membership — **$99 / year**  
   https://developer.apple.com/programs/
3. This project folder on the Mac (clone from GitHub or copy the `jobsite-inventory-mobile` folder).

### For Android (Google Play)
1. Any computer with **Android Studio**.
2. A **Google Play Console** developer account — one-time fee (currently $25)  
   https://play.google.com/console/

> This Linux build machine **cannot** compile the final iOS `.ipa` (no Xcode).  
> Open the project on a Mac for App Store submission. See **MOBILE.md** for the full click-by-click path.

## Quick start on a Mac (iOS)

```bash
cd jobsite-inventory-mobile
npm install
npx cap sync ios
npx cap open ios
```

That opens **Xcode**. Then:

1. Select the **App** target → **Signing & Capabilities** → choose your Team (Apple ID / Developer account).
2. Plug in an iPhone or pick a simulator → press **Run** (▶) to test.
3. When ready for TestFlight / App Store: **Product → Archive**, then distribute. Full steps in **MOBILE.md**.

## Quick start (Android)

```bash
cd jobsite-inventory-mobile
npm install
npx cap sync android
npx cap open android
```

Opens **Android Studio**. Build a release AAB and upload in Play Console (see **MOBILE.md**).

## Project layout

```
jobsite-inventory-mobile/
  capacitor.config.json   # app id, name, live URL
  www/                    # local fallback page (app mainly loads the live URL)
  resources/              # source icon + splash
  ios/                    # Xcode project (open ios/App/App.xcworkspace after pod install)
  android/                # Android Studio project
  MOBILE.md               # App Store + Play Store checklist
  README.md               # this file
```

## Changing the live URL later

Edit `capacitor.config.json` → `server.url`, then run:

```bash
npx cap sync
```

## Notes for App Review

The app is a WebView that loads your hosted inventory site (login, materials, tools, equipment). Apple sometimes asks why it is not “just a website.” Be ready to explain: crew uses it as a native install for job-site inventory with photos, shared login, and push-style alerts — and that the same secure backend serves the phone apps. If review pushes back, we can later **bundle** the `public/` files into the app for offline and add more native plugins.

## Related

- Web app repo / code: `/workspace/construction-inventory` (or GitHub `jrlwisco/jobsite-inventory`)
- Live site: https://jobsite-inventory.onrender.com
