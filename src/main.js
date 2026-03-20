const { app, BrowserWindow, globalShortcut, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { exec } = require("child_process");

let win = null;
let cachedApps = [];

function createWindow() {
  win = new BrowserWindow({
    width: 920,
    height: 620,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    center: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile("index.html");

  win.on("blur", () => {
    if (win && win.isVisible()) {
      win.hide();
      win.webContents.send("launcher-hidden");
    }
  });
}

function toggleWindow() {
  if (!win) return;

  if (win.isVisible()) {
    win.hide();
    win.webContents.send("launcher-hidden");
  } else {
    win.show();
    win.focus();
    win.webContents.send("launcher-shown");
  }
}

function runCommand(command) {
  exec(command, { windowsHide: true }, (error) => {
    if (error) {
      console.error("Command error:", error.message);
    }
  });
}

function scanDirectoryRecursive(dir, results = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDirectoryRecursive(fullPath, results);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === ".lnk" || ext === ".exe" || ext === ".url") {
          results.push(fullPath);
        }
      }
    }
  } catch (err) {
    console.error("Scan error:", dir, err.message);
  }

  return results;
}

function cleanAppName(filename) {
  return path
    .basename(filename, path.extname(filename))
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildKeywords(name) {
  const normalized = name.toLowerCase();
  const parts = normalized.split(/\s+/).filter(Boolean);
  return Array.from(new Set([normalized, ...parts]));
}

function getSystemApps() {
  return [
    { name: "Explorateur Windows", path: "C:\\Windows\\explorer.exe" },
    { name: "Bloc-notes", path: "C:\\Windows\\System32\\notepad.exe" },
    { name: "Calculatrice", path: "C:\\Windows\\System32\\calc.exe" },
    { name: "Invite de commandes", path: "C:\\Windows\\System32\\cmd.exe" },
    { name: "PowerShell", path: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" },
    { name: "Regedit", path: "C:\\Windows\\regedit.exe" },
    { name: "Task Manager", path: "C:\\Windows\\System32\\Taskmgr.exe" }
  ].filter(item => fs.existsSync(item.path));
}

function scanInstalledApps() {
  const startMenuPaths = [
    "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
    path.join(os.homedir(), "AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs")
  ];

  const rawFiles = [];
  for (const dir of startMenuPaths) {
    if (fs.existsSync(dir)) {
      scanDirectoryRecursive(dir, rawFiles);
    }
  }

  const found = rawFiles.map(filePath => {
    const name = cleanAppName(filePath);

    return {
      title: name,
      subtitle: filePath,
      type: "App",
      icon: "🪟",
      keywords: buildKeywords(name),
      action: {
        type: "open-file",
        value: filePath
      }
    };
  });

  const systemApps = getSystemApps().map(item => ({
    title: item.name,
    subtitle: item.path,
    type: "App",
    icon: "⚙️",
    keywords: buildKeywords(item.name),
    action: {
      type: "app",
      value: item.path
    }
  }));

  const map = new Map();

  [...systemApps, ...found].forEach(item => {
    const key = item.title.toLowerCase();
    if (!map.has(key)) map.set(key, item);
  });

  return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
}

function getStaticCommands() {
  return [
    {
      title: "Recherche Windows native",
      subtitle: "Ouvrir la recherche intégrée Windows",
      type: "System",
      icon: "🔎",
      keywords: ["recherche", "search", "windows", "search windows"],
      action: { type: "search-ms", value: "search-ms:" }
    },
    {
      title: "Éteindre le PC",
      subtitle: "Shutdown immédiat",
      type: "Action",
      icon: "⏻",
      keywords: ["shutdown", "eteindre", "off", "power"],
      action: { type: "shell", value: "shutdown /s /t 0" }
    },
    {
      title: "Redémarrer le PC",
      subtitle: "Restart immédiat",
      type: "Action",
      icon: "🔄",
      keywords: ["restart", "redemarrer", "reboot"],
      action: { type: "shell", value: "shutdown /r /t 0" }
    },
    {
      title: "Verrouiller la session",
      subtitle: "Lock Windows",
      type: "Action",
      icon: "🔒",
      keywords: ["lock", "verrouiller", "session"],
      action: { type: "shell", value: "rundll32.exe user32.dll,LockWorkStation" }
    },
    {
      title: "Ouvrir Paramètres Windows",
      subtitle: "Settings",
      type: "System",
      icon: "🛠️",
      keywords: ["settings", "parametres", "options", "configuration"],
      action: { type: "shell", value: 'start "" ms-settings:' }
    }
  ];
}

app.whenReady().then(() => {
  cachedApps = scanInstalledApps();
  createWindow();

  globalShortcut.register("Control+Space", () => {
    toggleWindow();
  });

  ipcMain.handle("launch-action", async (_event, payload) => {
    const { type, value } = payload || {};

    try {
      switch (type) {
        case "app":
          runCommand(`start "" "${value}"`);
          return { ok: true };

        case "open-file":
          await shell.openPath(value);
          return { ok: true };

        case "shell":
          runCommand(value);
          return { ok: true };

        case "url":
          await shell.openExternal(value);
          return { ok: true };

        case "search-ms":
          runCommand('start "" "search-ms:"');
          return { ok: true };

        default:
          return { ok: false, error: "Unknown action type" };
      }
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("hide-launcher", async () => {
    if (win) {
      win.hide();
      win.webContents.send("launcher-hidden");
    }
    return { ok: true };
  });

  ipcMain.handle("get-apps", async () => {
    return {
      ok: true,
      apps: cachedApps,
      commands: getStaticCommands()
    };
  });

  ipcMain.handle("refresh-apps", async () => {
    cachedApps = scanInstalledApps();
    return {
      ok: true,
      apps: cachedApps,
      commands: getStaticCommands()
    };
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});