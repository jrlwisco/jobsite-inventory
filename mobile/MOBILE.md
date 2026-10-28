# Submit Job Site Inventory to the App Stores

Plain-English checklist. The mobile project is already created; you finish signing and upload on a Mac (Apple) or with Android Studio (Google).

---

## Part A — Apple App Store (iPhone)

### 1. Pay for Apple Developer ($99/year)
1. On a Mac or iPhone, go to https://developer.apple.com/programs/
2. Enroll with the Apple ID you want as the publisher (Joseph’s business or personal).
3. Complete identity verification. Wait until the account shows **Active**.

### 2. Put this project on the Mac
- Clone the GitHub repo and open the `jobsite-inventory-mobile` folder, **or**
- Copy the whole `jobsite-inventory-mobile` folder onto the Mac.

```bash
cd jobsite-inventory-mobile
npm install          # needs Node 20+ (Node 22 preferred)
npx cap sync ios
cd ios/App
pod install          # if CocoaPods is installed; Xcode may prompt otherwise
cd ../..
npx cap open ios
```

**Open in Xcode:** prefer `ios/App/App.xcworkspace` (after pods), or use `npx cap open ios`.

### 3. Sign the app in Xcode
1. Left sidebar → click the blue **App** project → target **App**.
2. Tab **Signing & Capabilities**.
3. Check **Automatically manage signing**.
4. **Team:** pick your Apple Developer team.
5. Confirm **Bundle Identifier** is `com.jrlwisco.jobsiteinventory`  
   (If Apple says it’s taken, change it once in `capacitor.config.json` and in Xcode, then `npx cap sync ios`.)

### 4. Test on a phone
1. Connect an iPhone with a cable, trust the computer.
2. At the top of Xcode, select your iPhone.
3. Press **Run** (▶).
4. On the phone: Settings → General → VPN & Device Management → trust your developer certificate if asked.
5. Confirm the app opens and shows the Job Site Inventory login (loads https://jobsite-inventory.onrender.com).

### 5. Create the app record in App Store Connect
1. Go to https://appstoreconnect.apple.com
2. **My Apps** → **+** → **New App**.
3. Platforms: **iOS**.
4. Name: **Job Site Inventory**.
5. Primary language: English (U.S.).
6. Bundle ID: select `com.jrlwisco.jobsiteinventory` (create it under Certificates, Identifiers & Profiles first if needed).
7. SKU: e.g. `jobsite-inventory-ios`.
8. User Access: Full Access.

Fill in:
- Privacy Policy URL (required) — you need a simple web page stating you store inventory/login data on your server.
- Screenshots for iPhone (required sizes — Xcode Simulator can capture them).
- Description, keywords, support URL, category (e.g. Business / Productivity).
- Age rating questionnaire.

### 6. Archive and upload (TestFlight → App Store)
1. In Xcode: set destination to **Any iOS Device (arm64)**.
2. Menu **Product → Archive**.
3. When the Organizer window appears → **Distribute App** → **App Store Connect** → Upload.
4. Wait for processing in App Store Connect (email/notification).
5. **TestFlight** tab → add yourself / crew as internal testers → install via the TestFlight app.
6. When happy: **App Store** tab → select the build → **Add for Review** → **Submit**.

Apple review often takes 24–48 hours. Fix any rejection notes and resubmit.

### 7. After approval
The app appears on the App Store. Crew searches **Job Site Inventory** (or use your direct App Store link) and taps **Get**. That is a normal App Store install — not a home-screen bookmark.

---

## Part B — Google Play (Android) — short path

1. Create a Play Console account: https://play.google.com/console/ ($25 one-time).
2. On a computer with Android Studio:

```bash
cd jobsite-inventory-mobile
npm install
npx cap sync android
npx cap open android
```

3. In Android Studio: **Build → Generate Signed Bundle / APK** → **Android App Bundle**.
4. Create a keystore (save the passwords somewhere safe — you need them forever for updates).
5. Upload the `.aab` in Play Console → create the store listing (title, screenshots, privacy policy) → send to **Internal testing**, then **Production**.

Application ID: `com.jrlwisco.jobsiteinventory`.

---

## Part C — What this machine already did / blockers

| Item | Status |
|------|--------|
| Capacitor project with live HTTPS URL | Done |
| App name + bundle id | Done |
| `ios/` Xcode project | Generated (run `pod install` on a Mac) |
| `android/` Android Studio project | Generated |
| Icons (green branded) | Placed in iOS AppIcon + Android mipmaps |
| Camera / photo permission strings | Added (for item photos) |
| Compile iOS `.ipa` here | **Blocked** — this is Linux; **no Xcode** |
| CocoaPods / `pod install` here | **Blocked** — not installed on this box |
| Apple Developer / Play fees | **You** must enroll |

---

## Privacy policy (required by both stores)

Before submit, host a short privacy page (even a Google Doc or a `/privacy` route on the Render site) that says roughly:

- The app is for job-site materials/tools/equipment inventory.
- Accounts and inventory data are stored on your server (Render).
- Photos users attach are stored on that server.
- You don’t sell personal data.
- Contact email for data requests.

Point App Store Connect and Play Console at that URL.

---

## Updating the app later

1. Change the website on Render as usual — **phones pick up web UI changes automatically** because the app loads the live URL.
2. Only rebuild/resubmit the native app when you change Capacitor config, icons, permissions, or native plugins — or when Apple/Google require a new binary.
