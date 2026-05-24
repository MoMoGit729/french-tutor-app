# French Tutor

A personal French tutor app using the Paul Noble method, powered by the Anthropic API.

## Setup

### 1. Install Node.js
Download and install from https://nodejs.org (LTS version).

### 2. Get your Anthropic API key
Go to https://console.anthropic.com and copy your API key.

### 3. Create your `.env` file
In the `french-tutor-app` folder, create a file called `.env` (copy from `.env.example`):

```
ANTHROPIC_API_KEY=your_actual_key_here
PORT=3000
```

### 4. Install dependencies
Open a terminal in the `french-tutor-app` folder and run:

```
npm install
```

### 5. Start the app

```
npm start
```

Then open your browser to **http://localhost:3000**

---

## How it works

- Click **Start Lesson** to begin. The tutor orients you briefly, then drills one prompt at a time.
- Type your French answer and press Enter (or click the arrow), or press the **microphone button** to speak.
- Click the **speaker icon** in the header to mute/unmute the tutor's voice.
- Click the **menu icon** (top left) to open the lesson state panel, where you can see all patterns and their status. Click any pattern to edit its status or add notes.
- Click **End lesson & save** when you're done. The tutor outputs a checkpoint, the app updates your state automatically, and your progress is saved to `data/state.json`.

## Files

- `data/state.json` — all your lesson state, patterns, and history. Back this up if you want to preserve progress.
- `.env` — your API key. Never share this file.
- `server.js` — the local server (Express + Anthropic API).
- `public/` — the app UI (HTML, CSS, JS).
