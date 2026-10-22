# Installing 7 Studios on your Mac

About 20 minutes the first time, most of it waiting for downloads. You need macOS 12 or later, an internet connection for the setup, and at least 10 GB of free space (renders and footage need more over time).

There are two ways. **The easy way** is all double-clicks, for MacBooks with an Apple chip (late 2020 onwards). **The Terminal way** works on any Mac.

To check your chip: click the  menu → **About This Mac**. If it says **Chip: Apple M1** (or M2, M3, M4…), use the easy way. If it says **Processor: Intel**, use the Terminal way.

---

# The easy way

## A. Install Homebrew (once per Mac)

Homebrew installs the two tools the studio needs: **Node** (runs the app) and **ffmpeg** (video).

1. Go to **https://github.com/Homebrew/brew/releases/latest**.
2. Under **Assets**, click the file ending in **.pkg** (for example `Homebrew-7.0.1.pkg`).
3. Open it from **Downloads** and click **Continue**, **Agree** and **Install**.
4. When macOS asks for your password, it's a normal box: type your **Mac login password** (you'll see dots) or use **Touch ID**.

If a box asks to install the **command line developer tools**, click **Install** and wait for it to finish.

## B. Unzip the project

1. Double-click **7-studios-project.zip** in **Downloads**. A folder called **7-studios** appears.
2. Drag the **7-studios** folder into **Documents**. Keep it there: the studio's jobs and renders live inside it.

## C. Double-click the installer

1. Open the **7-studios** folder.
2. **Right-click** (or Control-click) **Install 7 Studios.command** → **Open** → **Open**.
   - If macOS says it can't be opened: go to  → **System Settings** → **Privacy & Security**, scroll down, click **Open Anyway** next to "Install 7 Studios.command", and confirm.
3. A Terminal window opens and does everything by itself (10 to 20 minutes): Node, ffmpeg, the studio's packages, a check of the whole setup, the **7 Studios** app in Launchpad, and then it opens 7 Studios in your browser.

**Keep that window open while you use the app.** Close it to stop 7 Studios.

From then on, open **7 Studios** from Launchpad or Spotlight. To keep it in the Dock: while it's open, right-click its Dock icon → **Options → Keep in Dock**.

---

# The Terminal way

You'll type a few lines into **Terminal**, the Mac's command window. Copy each grey line, paste it into Terminal with ⌘V and press Return.

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

If it prints a version number, skip to step 4. If it says `command not found`, paste this and press Return (on an Apple-chip Mac you can use the **.pkg** installer from the easy way instead):

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

Open **7 Studios** from Launchpad, Spotlight or the Dock, or double-click **7 Studios.command** in the folder, or in Terminal:

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
| "… can't be opened" for **Install 7 Studios.command** or **7 Studios.command** | Right-click it → **Open** → **Open**. If that's not offered:  → System Settings → **Privacy & Security** → **Open Anyway**. Or use the Terminal way |
| Nothing shows when you type your password in Terminal | Normal: Terminal hides it completely. Type it and press Return. Or use the **.pkg** installer (the easy way), which shows dots |
| "Port 7777 is in use" | 7 Studios is already open: go to http://127.0.0.1:7777. Or start a second copy with `npm run app -- --port=7778` |
| The first render takes a while to start | It's downloading its own headless Chrome (once, about 100 MB) |
| Renders are slow | Normal on a MacBook Air for 4K: use the **draft** or **review** quality while you work, keep it plugged in, and render 4K at the end |
| The check says **ffmpeg: missing drawtext** | Homebrew's standard ffmpeg leaves out text drawing. Double-click **Install 7 Studios.command** again: it installs **ffmpeg-full** and uses it from then on |
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
