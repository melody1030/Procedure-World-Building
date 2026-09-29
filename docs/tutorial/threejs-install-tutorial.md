# Installing Three.js: A Beginner's Guide

Three.js is a JavaScript library for creating 3D graphics in the browser. This tutorial covers two ways to install it: inside an existing project (like the React app from the [React tutorial](react-install-tutorial.md)), or as a quick standalone HTML page with no setup at all.

---

## Option A: Add Three.js to an Existing Project (Recommended)

Use this if you already have a project set up with `npm` (for example, the React + Vite project from [react-install-tutorial.md](react-install-tutorial.md)).

### 1. Open Your Terminal and Navigate to Your Project

```bash
cd ~/Desktop/my-website
```

Confirm you're in the right place:

```bash
pwd
```

You should see the path ending in `.../my-website` (or whatever you named your project).

> New to the terminal? See the [React tutorial](react-install-tutorial.md) Part 1 for a refresher on `cd`, `pwd`, and `ls`.

### 2. Install Three.js

```bash
npm install three
```

This downloads the Three.js library into your project's `node_modules` folder and adds it to `package.json`.

### 3. Verify the Install

```bash
npm list three
```

You should see output like:

```
my-website@0.0.0 /Users/you/Desktop/my-website
└── three@0.16x.x
```

### 4. Use It in Your Code

Open your project in a code editor and import Three.js at the top of any JavaScript/JSX file:

```javascript
import * as THREE from 'three';
```

#### Minimal Example (plain JS file, e.g. `src/main.js`)

```javascript
import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ color: 0x44aa88 });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(2, 2, 2);
scene.add(light);

camera.position.z = 3;

function animate() {
  requestAnimationFrame(animate);
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
}
animate();
```

### 5. Run Your Project

```bash
npm run dev
```

Open the `localhost` link shown in your terminal — you should see a spinning green cube.

> **Using React?** You'll likely also want [`@react-three/fiber`](https://docs.pmnd.rs/react-three-fiber), a React wrapper for Three.js. Install it with `npm install @react-three/fiber @react-three/drei` — but plain `three` (above) works fine on its own too.

---

## Option B: No Setup — Single HTML File

If you just want to experiment without creating a project, you can load Three.js directly from a CDN.

### 1. Create a Folder and File

In your terminal:

```bash
cd ~/Desktop
mkdir threejs-test
cd threejs-test
```

Open this folder in a code editor (e.g., VS Code), and create a file named `index.html`.

### 2. Add This Code

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Three.js Test</title>
  <style>
    body { margin: 0; overflow: hidden; }
  </style>
</head>
<body>
  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js"
      }
    }
  </script>
  <script type="module">
    import * as THREE from 'three';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x44aa88 });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(2, 2, 2);
    scene.add(light);

    camera.position.z = 3;

    function animate() {
      requestAnimationFrame(animate);
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;
      renderer.render(scene, camera);
    }
    animate();
  </script>
</body>
</html>
```

### 3. Open It in a Browser

Because this uses `type="module"`, most browsers won't let you just double-click the file (it'll be blocked by security restrictions on `file://` URLs). You need a tiny local server. The easiest way:

```bash
npx serve .
```

- The first time, it may ask to install the `serve` package — type `y` and press `Enter`.
- It will print a URL like `http://localhost:3000` — open that in your browser.

You should see the same spinning green cube as Option A.

---

## Quick Reference

| Command | What it does |
|---|---|
| `npm install three` | Adds Three.js to your current project |
| `npm list three` | Confirms which version is installed |
| `import * as THREE from 'three'` | Imports Three.js in your code |
| `npx serve .` | Starts a quick local server for a plain HTML file |

## Troubleshooting

- **`npm install` fails / "no package.json found"**: You're not inside a project folder. Run `pwd` to check where you are, and `cd` into your project first (see [react-install-tutorial.md](react-install-tutorial.md) if you don't have one yet).
- **Blank page, no cube**: Open your browser's developer console (`Cmd+Option+J` on Mac, `Ctrl+Shift+J` on Windows/Chrome) and check for red error messages — usually a typo in the import path or a missing `three` install.
- **`file://` page won't load the script**: You need to serve the file over `http://`, not open it directly — use `npx serve .` as shown in Option B.
