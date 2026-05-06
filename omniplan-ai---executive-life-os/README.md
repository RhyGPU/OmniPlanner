# OmniPlan AI

OmniPlan AI is a desktop-first planning workspace for weekly planning, goals, calendar blocks, habits, email, and optional AI assistance.

## Launch On Windows

1. Install [Node.js](https://nodejs.org/) if it is not already installed.
2. Double-click `run.bat`.
3. To create a desktop shortcut, double-click `create-shortcut.bat`.

The launcher installs dependencies on first run, builds the app if needed, then opens the Electron desktop app.

## Developer Commands

```bash
npm install
npm run build
npm run launch
```

Use `npm run dev` for the Vite web dev server, or `npm run start` to build and start Electron directly.

## Notes

- App data is stored locally on the device.
- Desktop shortcuts point to `run.bat`, so moving this folder after creating a shortcut requires recreating the shortcut.
- Packaged Windows builds run as the current user and do not require administrator elevation.
