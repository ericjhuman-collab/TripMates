# TripMates — Onboarding for New Contributors

Welcome! This guide walks you through everything you need to start working on **TripMates**, the React + TypeScript + Firebase travel app. Written for someone with no prior coding experience — go slowly, copy commands exactly, and ask Eric if anything feels unclear.

**You will need a Mac** for iOS work. Android can be done on Mac or Windows, but since we're targeting both iOS and Android, a Mac is required.

---

## Part 1 — Install the tools (one-time setup, ~1 hour)

Open the **Terminal** app on your Mac (press `Cmd + Space`, type "Terminal", press Enter). You'll type commands in here throughout this guide. To run a command, **paste it and press Enter**.

### 1.1 Install Homebrew (the Mac package manager)
Paste this:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
It will ask for your Mac password (the one you use at the login screen). Type it — **the password is hidden as you type, that's normal** — and press Enter. This takes a few minutes.

When done, follow any instructions it prints at the end (usually it tells you to run two extra commands — copy-paste them too).

### 1.2 Install Node.js
```bash
brew install node
```
Verify with:
```bash
node -v
npm -v
```
Both should print a version number.

### 1.3 Install Git
```bash
brew install git
```
Verify:
```bash
git --version
```

### 1.4 Install GitHub Desktop (easy visual interface for Git)
Download from **https://desktop.github.com** → run the installer → drag the app into Applications → open it. You'll use this instead of Git commands in Terminal for most things.

### 1.5 Install Xcode (required for iOS builds — this is big, ~15 GB)
1. Open the **App Store** app on your Mac
2. Search for **Xcode**
3. Click **Get** / **Install**
4. This takes 30–60 minutes depending on your internet
5. After install, open Xcode once — it will prompt to install extra components, say **Install**

### 1.6 Install CocoaPods (iOS dependency manager)
After Xcode finishes:
```bash
sudo gem install cocoapods
```
Enter your Mac password when prompted.

### 1.7 Install Android Studio (for Android builds)
Download from **https://developer.android.com/studio** → install → open it → go through the first-time setup wizard (accept all defaults).

### 1.8 Install the Firebase command-line tool
```bash
sudo npm install -g firebase-tools
```

---

## Part 2 — Create your GitHub account and get access to the code

### 2.1 Create a GitHub account
1. Go to **https://github.com/signup**
2. Use your work email (or personal, your choice)
3. Pick a username (this will be public — e.g., `eric-j-human`)
4. Choose the free plan
5. Verify your email when GitHub sends the confirmation

### 2.2 Tell Eric your GitHub username
Send it to him. He'll add you as a collaborator on the TripMates repository.

### 2.3 Accept the invitation
You'll get an email from GitHub saying "Eric invited you to TripMates". Click the link and accept.

### 2.4 Clone the repository using GitHub Desktop
1. Open **GitHub Desktop** (the app you installed in step 1.4)
2. Sign in with your GitHub account
3. Go to **File → Clone repository**
4. Click the **URL** tab
5. Paste: `https://github.com/ericjhuman-collab/TripMates.git`
6. For "Local path", choose a folder on your Mac (e.g., `~/Documents/TripMates`) — remember this location
7. Click **Clone**

The code is now on your computer.

---

## Part 3 — Run the app on your computer

### 3.1 Open the project in Terminal
In Terminal:
```bash
cd ~/Documents/TripMates
```
(Replace `~/Documents/TripMates` with wherever you chose in step 2.4.)

### 3.2 Install the project's dependencies
```bash
npm install
```
This downloads all the packages the app needs. Takes ~1 minute. Expect to see some warnings — that's normal.

### 3.3 Run the app
```bash
npm run dev
```
You should see something like:
```
  VITE v8.0.1  ready in 500 ms

  ➜  Local:   http://localhost:5173/
```
Open your browser and go to **http://localhost:5173**. You'll see the TripMates login page.

**To stop the app:** go back to Terminal and press `Ctrl + C`.

### 3.4 Try logging in
- Click **Sign up** and create a test account, OR
- Ask Eric for an existing test account

---

## Part 4 — Firebase access (when Eric grants it)

Firebase is where the app stores data (users, trips, photos). You need to be invited separately from GitHub.

### 4.1 Eric invites you
He'll add your Google account to the Firebase project. You'll get an email from Firebase.

### 4.2 Accept and explore
1. Click the link in the email
2. Go to **https://console.firebase.google.com** — you should see the **TripMates** project (internal ID `alen-8797d`)
3. Explore:
   - **Authentication** → see all user accounts
   - **Firestore Database** → see all trips, expenses, etc.
   - **Storage** → see uploaded profile pictures and trip photos

### 4.3 Connect Firebase CLI on your Mac
In Terminal (anywhere):
```bash
firebase login
```
A browser opens — log in with the Google account Eric invited. Then:
```bash
cd ~/Documents/TripMates
firebase use alen-8797d
```

You're now set up to deploy rule changes if needed.

---

## Part 5 — Your job: iOS + Android beta setup

You are the point person for publishing the beta. Here's the big picture of what's ahead.

### 5.1 Decide on names (with Eric)
- **Bundle ID / Package name** — a reverse-DNS identifier used by both stores. Something like `app.tripmates` or `com.tripmates.app`. **This is permanent** — once registered with Apple/Google, it can't be changed. Agree on this with Eric before doing anything else.
- **App display name** — `TripMates`

### 5.2 Apple side (iOS / TestFlight)
Since you applied for the Apple Developer Program, make sure:
1. Your Apple Developer account is **approved** (you should have received confirmation)
2. You can log into **https://developer.apple.com/account** and **https://appstoreconnect.apple.com**

**The workflow once approved:**
1. We'll install **Capacitor** (a tool that wraps our web app in a real iOS app) — Eric can guide
2. This creates a real iOS Xcode project in the repo
3. You register the app in App Store Connect with the agreed bundle ID
4. You download **GoogleService-Info.plist** from Firebase Console and place it in the iOS project
5. You set your Apple Developer Team in Xcode (for signing)
6. Archive and upload via Xcode to App Store Connect
7. In App Store Connect → TestFlight tab → add internal testers (up to 100 Apple IDs, no Apple review needed) or external testers (up to 10,000, requires a ~24h Apple review)
8. Testers install the **TestFlight** app on their iPhone and get the beta

### 5.3 Google side (Android / Closed Testing)
Similar workflow for Android:
1. Make sure your **Google Play Console** account is active (25 USD one-time fee)
2. Use Capacitor to generate an Android Studio project
3. Register the app in Play Console with the agreed package name
4. Download **google-services.json** from Firebase Console and place it in the Android project
5. Build a signed `.aab` file in Android Studio
6. Upload to Play Console → **Testing → Closed testing → Create new release**
7. Add tester emails (no Google review for closed testing)

### 5.4 Timeline estimate
If you follow this guide and Xcode + Android Studio are installed, Eric can walk you through the Capacitor setup in about an hour. After that, the beta submission is another hour per platform. First beta users can be testing within a day.

---

## Part 6 — Day-to-day workflow

### Making changes
1. Open GitHub Desktop → click **"Current branch: main"** → **"New branch"** → give it a name like `fix-login-button`
2. Make your code changes in your editor (VS Code is free: **https://code.visualstudio.com**)
3. In GitHub Desktop you'll see the changed files → write a short summary → click **Commit to <your-branch>**
4. Click **Publish branch**
5. Click **Create pull request** → GitHub opens in your browser → tag Eric for review
6. Eric reviews and merges — or asks for changes

### Pulling latest changes
In GitHub Desktop: click **"Fetch origin"** at the top. If there are new changes, click **"Pull origin"**.

### Don't commit these
- `.env.local` (has secrets)
- `node_modules/` (huge folder of downloaded libraries)
- Anything in `.claude/` or `ios/App/Pods/` or `android/.gradle/`

The `.gitignore` file handles all of the above automatically.

---

## Troubleshooting

**`npm install` errors with `EACCES`** → Run with `sudo`: `sudo npm install`

**`firebase login` says "already logged in as someone else"** → `firebase logout` then `firebase login`

**App runs but shows a blank screen in the browser** → Check Terminal for errors. Usually a missing `npm install`.

**"command not found: npm"** → Node.js isn't installed or Terminal was opened before install finished. Close and reopen Terminal.

**Something else** → Ask Eric or paste the full error message into a new chat with an AI assistant.

---

## Key contacts & resources

- **Code repository**: https://github.com/ericjhuman-collab/TripMates
- **Firebase Console**: https://console.firebase.google.com (after Eric invites you)
- **App Store Connect**: https://appstoreconnect.apple.com
- **Google Play Console**: https://play.google.com/console
- **Eric**: your primary contact for anything unclear

Welcome aboard!
