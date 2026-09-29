# Installing React: A Beginner's Guide (with Terminal Basics)

This tutorial assumes you've never used the terminal before. We'll start there, then install React and get a website running on your computer.

---

## Part 1: Terminal Basics

The **terminal** (also called "command line" or "shell") is a text-based way to talk to your computer. Instead of clicking icons, you type commands.

### Opening the Terminal

- **Mac**: Press `Cmd + Space`, type `Terminal`, press `Enter`.
- **Windows**: Press `Win`, type `Terminal` (or `PowerShell`), press `Enter`.

You'll see a window with a blinking cursor waiting for input, something like:

```
yourname@computer ~ %
```

That's called the **prompt**. Everything you type after it is a command. Press `Enter` to run it.

### Essential Navigation Commands

Your terminal always has a "current location" — a folder you're inside of, just like double-clicking into folders in Finder/File Explorer, except invisible.

| Command | What it does | Example |
|---|---|---|
| `pwd` | **P**rint **w**orking **d**irectory — shows where you currently are | `pwd` |
| `ls` | **L**ist the files/folders in your current location | `ls` |
| `cd <folder>` | **C**hange **d**irectory — move into a folder | `cd Desktop` |
| `cd ..` | Move **up** one folder (to the parent) | `cd ..` |
| `cd ~` | Jump straight to your home folder | `cd ~` |
| `mkdir <name>` | Make a new folder | `mkdir my-website` |

### Try It Yourself

Type each line below, pressing `Enter` after each one, and watch what happens:

```bash
pwd
```
Shows your current folder (probably your home folder, like `/Users/yourname`).

```bash
ls
```
Lists what's inside that folder — you should recognize things like `Desktop`, `Documents`, `Downloads`.

```bash
cd Desktop
```
Moves you into the Desktop folder.

```bash
pwd
```
Confirms you're now inside Desktop.

**Tips:**
- Press the `Tab` key while typing a folder name to auto-complete it — saves typing and avoids typos.
- Press the `↑` (up arrow) to bring back your previous command instead of retyping it.
- If a folder name has spaces, wrap it in quotes: `cd "My Folder"`.

---

## Part 2: Install Node.js (Required Before React)

React runs on top of **Node.js**, a program that lets JavaScript run outside a web browser. You need it to create and run a React project.

1. Go to [nodejs.org](https://nodejs.org).
2. Download the **LTS** version (the stable, recommended one).
3. Run the installer and follow the prompts (default options are fine).

### Verify It Installed

Back in your terminal, type:

```bash
node -v
```

You should see a version number, like `v20.11.0`. This confirms Node.js is installed.

Also check `npm` (Node Package Manager, installed alongside Node.js — it's what downloads React for you):

```bash
npm -v
```

You should see a version number here too, like `10.2.4`.

> If you see something like `command not found: node`, the installation didn't complete correctly — try reinstalling from nodejs.org, then close and reopen your terminal.

---

## Part 3: Navigate to Where You Want Your Project

Decide where on your computer you want your website's folder to live — for example, your Desktop.

```bash
cd ~
cd Desktop
```

(`cd ~` first ensures you start from your home folder, then `cd Desktop` moves into Desktop from there.)

Confirm you're in the right place:

```bash
pwd
```

You should see something ending in `.../Desktop`.

---

## Part 4: Create Your React Project

We'll use **Vite**, the modern, fast, and recommended way to start a React project (it replaces the older `create-react-app`).

Type this command (replace `my-website` with whatever you want to name your project):

```bash
npm create vite@latest my-website -- --template react
```

- It may ask **"Need to install the following packages: create-vite. Ok to proceed?"** — type `y` and press `Enter`.
- This creates a new folder called `my-website` with all the starter files for a React app.

### Move Into Your New Project Folder

```bash
cd my-website
```

### Install the Project's Dependencies

This downloads all the code libraries your React project needs to run:

```bash
npm install
```

Wait for it to finish — you'll see a progress bar and then the prompt returns.

---

## Part 5: Run Your Website Locally

Start the development server:

```bash
npm run dev
```

You'll see output like:

```
  VITE v5.x.x  ready in 320 ms

  ➜  Local:   http://localhost:5173/
```

Open that `http://localhost:5173/` link in your web browser (Cmd/Ctrl + click it, or copy-paste it into your browser). You should see your new React website running!

### Stopping the Server

Click back into the terminal window and press:

```
Ctrl + C
```

This stops the local server. (The website is only visible while this is running.)

---

## Part 6: Making Changes

1. Open the `my-website` folder in a code editor (e.g., [VS Code](https://code.visualstudio.com/)).
2. Open `src/App.jsx` — this is the main page of your website.
3. Edit some text and save the file.
4. If `npm run dev` is still running, your browser will automatically update to show the change (this is called **hot reload**).

---

## Quick Reference: Full Setup From Scratch

```bash
cd ~/Desktop                                          # navigate to Desktop
npm create vite@latest my-website -- --template react # create the project
cd my-website                                          # enter the project folder
npm install                                             # install dependencies
npm run dev                                             # start the website locally
```

## Common Terminal Commands Recap

| Command | Meaning |
|---|---|
| `pwd` | Where am I? |
| `ls` | What's here? |
| `cd folder-name` | Go into a folder |
| `cd ..` | Go up one level |
| `mkdir name` | Create a new folder |
| `Ctrl + C` | Stop a running command |
| `↑` | Recall the previous command |
| `Tab` | Auto-complete a name |

## Troubleshooting

- **`command not found: node` or `npm`**: Node.js isn't installed or your terminal needs to be restarted after installing it.
- **`npm run dev` shows a blank page**: Make sure you opened the exact `localhost` URL shown in the terminal.
- **Stuck / want to start over**: Press `Ctrl + C` to stop any running process, then re-run the commands from Part 4.
