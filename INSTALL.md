# Installing 7 Studios on your Mac

About 20 minutes the first time, most of it waiting for downloads. You need macOS 12 or later, an internet connection for the setup, and at least 10 GB of free space (renders and footage need more over time).

You'll type a few lines into **Terminal**, the Mac's command window. Copy each grey line, paste it into Terminal with ⌘V and press Return.

---

## 1. Unzip the project

1. Download **7-studios-project.zip**. It lands in your **Downloads** folder.
2. Double-click it. A folder called **7-studios** appears.
3. Drag the **7-studios** folder into **Documents**. Keep it there: the studio's jobs and renders live inside it.

## 2. Open Terminal

Press **⌘ Space**, type **Terminal**, press Return.

## 3. Install Homebrew (once per Mac)

Homebrew installs the two tools the studio needs: **Node** (runs the app) and **ffmpeg** (video).

Check whether you already have it:

```bash
brew --version
```

If it prints a version number, skip to step 4. If it says `command not found`, paste this and press Return:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

- It asks for your **Mac password**. Nothing shows while you type: that's normal. Press Return.
- It asks you to press **Return** to continue, and may install Apple's "Command Line Tools" (a few minutes).
- When it finishes, **quit Terminal (⌘Q) and open it again**.

## 4. Go to the project folder

Type `cd` and a space, then **drag the 7-studios folder from Finder onto the Terminal window** and press Return. Or paste:

```bash
cd ~/Documents/7-studios
```

## 5. Run the installer

```bash
bash scripts/install.sh
```

It installs Node and ffmpeg, the studio's packages, the sound-effects pack and a `.env` file for your keys, then checks the whole setup. It's safe to run again any time.

At the end you'll see a checklist:

| Mark | Means |
|---|---|
| ✅ | Ready |
| ⚠️ | Optional, or sets itself up later: the ElevenLabs key, Python (for cut-outs and face tracking), cloud rendering, the demo engine, a git backup |
| ❌ | Needs fixing: the line tells you how |

## 6. Open 7 Studios

```bash
npm run app
```

The first time, it builds the interface (about a minute). Then your browser opens at **http://127.0.0.1:7777** with the logo animation and the motto.

- **Keep the Terminal window open** while you use the app. To stop it, click Terminal and press **Ctrl C**.
- The app only runs on this Mac: nobody else can reach it.

## 7. Put it in your Dock (optional)

```bash
bash scripts/make-mac-app.sh
```

Now **7 Studios** is in Launchpad and Spotlight. Open it, then right-click its Dock icon → **Options → Keep in Dock**. Run this line again if you ever move the folder.

---

## Every time after that

Click **7 Studios** in the Dock, or double-click **7 Studios.command** in the folder, or in Terminal:

```bash
cd ~/Documents/7-studios && npm run app
```

## Adding your keys (optional)

The app works without any keys: the **Demo** engine makes placeholders so you can try everything. For real AI images, video or ElevenLabs transcription:

- In the app: **Settings → Keys**, paste the key, **Save**. It's written to the `.env` file on your Mac and never shown again.
- Never paste a key into a chat, including with Claude.

## Using it with Claude

Open the **7-studios** folder in Claude Code (desktop app or terminal) and describe what you want, for example *"Make a 20-second 9:16 lyric video for this song."* Claude uses the same files as the app.

## If something goes wrong

| You see | Do this |
|---|---|
| `command not found: brew` after installing Homebrew | Quit Terminal (⌘Q), open it again, and run step 4 and 5 again |
| `command not found: npm` | Run `bash scripts/install.sh` again: it installs Node |
| `xcrun: error: invalid active developer path` | Run `xcode-select --install`, click Install, then run step 5 again |
| "7 Studios.command can't be opened because it's from an unidentified developer" | Right-click it → **Open** → **Open**. Or use `npm run app` instead |
| "Port 7777 is in use" | 7 Studios is already open: go to http://127.0.0.1:7777. Or start a second copy with `npm run app -- --port=7778` |
| The first render takes a while to start | It's downloading its own headless Chrome (once, about 100 MB) |
| Renders are slow | Normal on a MacBook Air for 4K: use the **draft** or **review** quality while you work, keep it plugged in, and render 4K at the end |
| Anything else | Run `npm run doctor`: it lists what's missing and the fix for each |

## Getting updates from GitHub (optional)

If you'd rather keep the project linked to your GitHub backup, install it this way instead of the zip (steps 3, 5 and 6 are the same):

```bash
cd ~/Documents
git clone https://github.com/GODCLASS7/7-Studios-.git 7-studios
cd 7-studios
bash scripts/install.sh
```

Later, `git pull` in that folder brings in any changes pushed to GitHub.

## On Windows

Unzip, open **PowerShell** in the folder (Shift + right-click → "Open PowerShell window here"), then:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
npm run app
```
