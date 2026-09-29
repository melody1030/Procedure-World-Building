# Firebase: A Beginner's Guide

Firebase is Google's platform for building web and mobile apps without running your own server. This tutorial walks through the four Firebase services used by this project, in the order I set them up:

- **Part A: Hosting.** Put the site online at a public URL.
- **Part B: Authentication.** Let people sign in with their Google account.
- **Part C: Cloud Firestore.** Save and load each signed-in user's own data.
- **Part D: Storage.** Store files such as images, and why this project doesn't use it on the free plan.

It assumes you have a React + Vite project (see the [React tutorial](react-install-tutorial.md)). Everything except Part D works on Firebase's free **Spark** plan.

The finished result is live at [procedural-worlds-d79be.web.app](https://procedural-worlds-d79be.web.app): sign in, adjust any week, and use **Configurations → Save** to keep the setup in your account and **Load** to bring it back.

---

## Part 0: What Is Firebase?

Firebase is a collection of services that all live under one **project**:

| Service | What it does | Used here for |
|---|---|---|
| **Hosting** | Serves your built website over HTTPS | The site itself |
| **Authentication** | Signs users in (Google, email, GitHub…) | "Sign in with Google" in the top bar |
| **Cloud Firestore** | A NoSQL database of *documents* inside *collections* | Each user's saved configurations |
| **Storage** | Stores files such as images and video | Not used on Spark (see Part D) |

You work with Firebase from two places:

- **The Firebase console** ([console.firebase.google.com](https://console.firebase.google.com)): a website for creating projects, turning services on, and viewing data.
- **The Firebase CLI** (`firebase` command): a terminal tool for deploying the site and the database rules.

---

## Part 1: One-Time Setup

### 1. Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in.
2. Click **Create a project**, give it a name (I used `procedural-worlds`), and note the **project ID** Firebase generates (mine is `procedural-worlds-d79be`). The ID becomes your site's address and can't be changed.
3. Turn Google Analytics off (not needed) and click **Create project**.
4. Leave the project on the free **Spark** plan.

### 2. Install the Firebase CLI and Log In

```bash
npm install -g firebase-tools
```

```bash
firebase --version
```

```bash
firebase login
```

`firebase login` opens your browser to sign in. Then check the CLI can see your project:

```bash
firebase projects:list
```

> **Lesson learned: use the same Google account everywhere.** My CLI was logged in with a personal Gmail account, but I had created the project with my Cornell account, so every command failed with `HTTP Error: 403, The caller does not have permission`. The fix is to add the right account and tell the CLI to use it for this folder:
>
> ```bash
> firebase login:add
> ```
>
> ```bash
> firebase login:use you@cornell.edu
> ```
>
> `firebase login:list` shows which accounts are signed in.

---

## Part A: Hosting

Hosting uploads the built site (plain HTML, JS and CSS files) and serves it at `https://<project-id>.web.app`.

### 1. Build the Site

From the folder that contains `package.json` (in this repo, `site/`):

```bash
npm run build
```

Vite writes the finished site to `dist/`.

### 2. Configure Hosting

You can run `firebase init hosting` and answer its questions, or write the two files it would create yourself. I wrote them by hand in `site/`:

**`.firebaserc`** links the folder to the project:

```json
{
  "projects": {
    "default": "procedural-worlds-d79be"
  }
}
```

**`firebase.json`** tells Hosting what to upload:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}
```

- `"public": "dist"`: upload Vite's build folder (the default, `public`, is wrong for Vite).
- `rewrites`: send every URL to `index.html`, so a React app's own pages work.

> If you use `firebase init hosting` instead, answer **No** to "File dist/index.html already exists. Overwrite?". Saying yes replaces your real site with a placeholder page.

### 3. Deploy

```bash
firebase deploy --only hosting
```

It ends with `Hosting URL: https://procedural-worlds-d79be.web.app`. Every later update is the same two commands:

```bash
npm run build
```

```bash
firebase deploy --only hosting
```

Always build first: the deploy uploads whatever is in `dist/` at that moment.

---

## Part B: Authentication

### 1. Register a Web App

The browser code needs a small config object to know which project to talk to. The CLI can create it:

```bash
firebase apps:create WEB "procedural-worlds-web"
```

```bash
firebase apps:sdkconfig WEB <the App ID printed by the previous command>
```

The second command prints the `firebaseConfig` values. I copied them into `site/.env.local`:

```bash
VITE_FIREBASE_API_KEY=AIza…
VITE_FIREBASE_AUTH_DOMAIN=procedural-worlds-d79be.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=procedural-worlds-d79be
VITE_FIREBASE_STORAGE_BUCKET=procedural-worlds-d79be.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=404401985158
VITE_FIREBASE_APP_ID=1:404401985158:web:…
```

- Vite only exposes variables that start with `VITE_`, and only reads `.env.local` when `npm run dev` or `npm run build` starts.
- `.env.local` is ignored by Git (`*.local` in `.gitignore`). These values are **not secret** (they end up in the deployed JavaScript anyway); what protects the data is the Firestore rules in Part C. Keeping them out of the code just makes the project easy to point elsewhere.

### 2. Turn On Google Sign-In (console)

1. In the console, open **Build → Authentication** and click **Get started**.
2. On the **Sign-in method** tab, choose **Google**, switch it to **Enable**, pick a support email, and click **Save**.

`localhost` and your `.web.app` / `.firebaseapp.com` addresses are allowed to use sign-in by default (**Authentication → Settings → Authorized domains**).

> Until this step is done, signing in fails with `auth/configuration-not-found`.

### 3. Install the SDK and Connect

```bash
npm install firebase
```

[`site/src/firebase/firebase.ts`](../../site/src/firebase/firebase.ts) starts Firebase once and exports the services:

```typescript
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
```

(The real file also checks that `.env.local` exists, so a fresh clone without it still runs, just without sign-in.)

TypeScript needs to be told about `import.meta.env`. That's what [`site/src/vite-env.d.ts`](../../site/src/vite-env.d.ts) is for.

### 4. Sign In, Sign Out, and Know Who's Signed In

From [`site/src/firebase/useAuth.ts`](../../site/src/firebase/useAuth.ts):

```typescript
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";

// Opens Google's sign-in window.
await signInWithPopup(auth, googleProvider);

// Signs out.
await signOut(auth);

// Runs now and again every time someone signs in or out.
onAuthStateChanged(auth, (user) => {
  // user is null when signed out; user.uid is their unique ID when signed in.
});
```

The `useAuth()` hook wraps `onAuthStateChanged` so any React component can read the current `user`. After signing in, the app also writes the user's name, email and photo to `users/{uid}` in Firestore.

The **`uid`** is the key idea: it's a permanent, unique ID for each account, and everything a user saves is stored under it.

---

## Part C: Cloud Firestore

### 1. The Data Model

Firestore stores **documents** (like JSON objects) inside **collections**, and documents can hold their own sub-collections. Everything for one user lives under their `uid`:

```
users (collection)
 └── {uid} (document)                 ← profile: displayName, email, photoURL, lastSignInAt
      └── configs (collection)
           ├── {configId} (document)  ← one saved configuration
           │     name:      "Stormy canyon"
           │     weekId:    "week02"
           │     dataJson:  "{\"noiseType\":\"perlin\",\"scale\":3.2, …}"
           │     thumbnail: "data:image/jpeg;base64,…"
           │     createdAt: <server time>
           └── …
```

- **`weekId`** says which week the settings belong to, so each week only lists its own saves.
- **`dataJson`** is the week's settings as a JSON string. Firestore rejects `undefined` values and arrays placed directly inside arrays, and the week settings can contain both, so a string is the safe choice.
- **`thumbnail`** is a small JPEG of the 3D view (see Part D for why it's here and not in Storage).

### 2. Write the Security Rules First

A new database refuses everything until you publish rules. Mine are in [`site/firestore.rules`](../../site/firestore.rules):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isOwner(uid) {
      return request.auth != null && request.auth.uid == uid;
    }

    match /users/{uid} {
      allow read, write: if isOwner(uid);

      match /configs/{configId} {
        allow read, delete: if isOwner(uid);
        allow create: if isOwner(uid) && validConfig(request.resource.data);
        allow update: if false;
      }
    }

    function validConfig(data) {
      return data.keys().hasOnly(['name', 'weekId', 'dataJson', 'thumbnail', 'createdAt'])
        && data.name is string && data.name.size() > 0 && data.name.size() <= 80
        && data.weekId in ['week01', 'week02', 'week03']
        && data.dataJson is string && data.dataJson.size() < 500000
        && data.thumbnail is string && data.thumbnail.size() < 200000
        && data.createdAt == request.time;
    }
  }
}
```

In plain words:

- `request.auth.uid == uid`: you can only touch documents under **your own** `uid`. Nobody can read another person's saves, even if they guess the ID.
- `validConfig`: a save must have exactly the expected fields, with sensible types and sizes, and a server-set time.
- `allow update: if false`: saves never change; you make a new one instead.

Point `firebase.json` at the rules file by adding a `firestore` section next to `hosting`:

```json
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "hosting": { "…": "as in Part A" }
}
```

### 3. Create the Database and Deploy the Rules

```bash
firebase deploy --only firestore:rules
```

> **Lesson learned:** on a brand-new project, `firebase firestore:databases:create "(default)" --location nam5` failed because the Firestore API was switched off. Deploying the rules first switched the API on and created the default database, after which `firebase firestore:databases:list` showed it. You can also create it in the console under **Build → Firestore Database → Create database**. Pick the location carefully (I used `nam5`, United States): it can't be changed later.

### 4. Check the Rules Work

Anyone can call Firestore's web API directly, without the app. A request with no sign-in should be refused:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://firestore.googleapis.com/v1/projects/procedural-worlds-d79be/databases/(default)/documents/users/someone/configs?key=<your apiKey>"
```

This prints `403`: refused, as intended.

### 5. Save and Load Configurations

The Firestore code is in [`site/src/firebase/configs.ts`](../../site/src/firebase/configs.ts):

```typescript
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, where } from "firebase/firestore";

const configsOf = (uid: string) => collection(db, "users", uid, "configs");

// Save: add a new document with an auto-generated ID.
await addDoc(configsOf(user.uid), {
  name,
  weekId,
  dataJson: JSON.stringify(settings),
  thumbnail,
  createdAt: serverTimestamp(),
});

// Load: listen to this week's saves. The callback runs again whenever one is added or deleted,
// so the list updates by itself.
const stop = onSnapshot(query(configsOf(user.uid), where("weekId", "==", weekId)), (snapshot) => {
  const saves = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
});

// Delete one save.
await deleteDoc(doc(configsOf(user.uid), configId));
```

- `serverTimestamp()` uses Google's clock, not the visitor's, which is why the rule can check `createdAt == request.time`.
- The list is sorted newest-first in the browser. Doing it in the query with `orderBy` alongside `where` would need a separate **composite index** in Firestore.

### 6. Connecting It to the Weeks

Each week's settings live inside that week's React component, but the **Configurations** menu is in the top bar. [`site/src/firebase/weekConfig.tsx`](../../site/src/firebase/weekConfig.tsx) connects them: each week calls

```typescript
useWeekConfig("week01", () => state, (saved) => setState(withDefaults(defaultState, saved)));
```

- The second argument hands over the current settings when you press **Save**.
- The third argument applies saved settings when you press **Load**.
- `withDefaults` fills in any setting added after a configuration was saved, so old saves keep loading.

What each week saves:

| Week | Saved settings |
|---|---|
| Week 1: Three.js Basics | Shape and its parameters, colour, material, roughness/metalness/shininess, light type and intensity, shadows, wireframe, auto-rotate |
| Week 2: Noise Grid | Noise type, scale, octaves, persistence, seed, resolution, shaping, view mode, erosion parameters |
| Week 3: Voxels & Volumes | The open tab, plus the settings of all four tabs, including the whole CSG shape tree |

The menu itself is [`site/src/components/AccountMenu.tsx`](../../site/src/components/AccountMenu.tsx).

### 7. Try It

1. Open the site and click **Sign in with Google**.
2. Pick a week and change some settings.
3. Click **Configurations**, type a name, and click **Save**. The save appears in the list with a thumbnail.
4. Change the settings again, then click **Load** on your save: everything returns to how it was.
5. In the console, open **Firestore Database → Data** to see the documents under `users/<your uid>/configs`.

---

## Part D: Storage (and Why This Project Doesn't Use It)

**Cloud Storage for Firebase** holds files such as images, audio and video. The natural design here would have been to upload each thumbnail to `users/{uid}/thumbnails/{configId}.jpg` in Storage and keep only its path in Firestore.

**On the Spark plan that isn't possible for new projects.** Since late 2024, creating a Storage bucket requires the **Blaze** (pay-as-you-go) plan. Blaze still includes a free monthly allowance (5 GB stored in US regions), so a class project usually costs $0, but it needs a card on file. I chose to stay on Spark.

**What I did instead:** each thumbnail is a small JPEG (240 px wide, around 10–30 KB) stored as a text *data URL* in the configuration's `thumbnail` field in Firestore. That's fine at this size: a Firestore document can hold up to 1 MB, and the rules cap thumbnails at 200 KB. It would not work for large or many files, which is what Storage is for.

The thumbnail comes from the 3D canvas. One catch: WebGL clears the canvas right after each frame is shown, so reading it at a random moment gives a blank image. [`captureThumbnail`](../../site/src/firebase/configs.ts) waits for `requestAnimationFrame`, whose callback runs in the same frame just after the scene is drawn, and copies the canvas then.

**If the project moves to Blaze later,** switching to Storage takes these steps:

1. Upgrade the project to Blaze in the console (the **Upgrade** button next to the plan name), and set a budget alert (for example $1) in Google Cloud Billing.
2. Open **Build → Storage → Get started** and choose a US location.
3. Add `storage.rules` that only let a user write under their own `uid`:

   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /users/{uid}/{allPaths=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid
                            && (request.resource == null || request.resource.size < 1 * 1024 * 1024);
       }
     }
   }
   ```

4. Upload with `uploadString(ref(storage, `users/${uid}/thumbnails/${id}.jpg`), dataUrl, "data_url")` from `firebase/storage`, save the path in Firestore, and show it with `getDownloadURL`.

---

## Quick Reference

| Command | What it does |
|---|---|
| `npm install -g firebase-tools` | Installs the Firebase CLI |
| `firebase login` / `firebase login:add` | Signs the CLI in / adds another Google account |
| `firebase login:use you@example.com` | Picks which signed-in account this folder uses |
| `firebase login:list` | Shows signed-in accounts |
| `firebase projects:list` | Lists the projects the current account can access |
| `firebase apps:create WEB "name"` | Registers a web app in the project |
| `firebase apps:sdkconfig WEB <appId>` | Prints the web app's config values |
| `firebase deploy --only firestore:rules` | Publishes `firestore.rules` |
| `firebase firestore:databases:list` | Shows the project's Firestore databases |
| `npm run build` | Builds the site into `dist/` |
| `firebase deploy --only hosting` | Publishes `dist/` to the live site |

## Troubleshooting

- **`HTTP Error: 403, The caller does not have permission`** from the CLI: the CLI is signed in with a different Google account than the one that owns the project. Use `firebase login:add` and `firebase login:use` (Part 1).
- **`Cloud Firestore API has not been used in project … or it is disabled`**: run `firebase deploy --only firestore:rules`, or create the database in the console (Part C, step 3).
- **`auth/configuration-not-found`** or **`auth/operation-not-allowed`** when signing in: Authentication or the Google provider isn't turned on yet (Part B, step 2).
- **`auth/popup-blocked`**: the browser blocked the sign-in window. Allow pop-ups for the site and click again.
- **`Missing or insufficient permissions`** in the browser console: the Firestore rules refused the request. Either you aren't signed in, the path isn't under your own `uid`, or the data doesn't match `validConfig`.
- **`import.meta.env.VITE_…` is `undefined`**: the name must start with `VITE_`, the file must be `site/.env.local`, and the dev server must be restarted after editing it.
- **Blank thumbnails**: the canvas was read outside the frame it was drawn in (see Part D).
- **The live site doesn't show your change**: run `npm run build` before `firebase deploy`, then hard-refresh (`Cmd+Shift+R` / `Ctrl+Shift+R`).
