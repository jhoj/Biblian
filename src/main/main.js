const { app, BrowserWindow, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// --- Settings persistence ---

const defaultSettings = {
  fontSize: 56,
  backgroundColor: '#000000',
  color: '#ffffff',
  displayScreenId: null,
  navColumnWidth: 180,
  previewColumnWidth: 250,
};

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const data = fs.readFileSync(getSettingsPath(), 'utf-8');
    return { ...defaultSettings, ...JSON.parse(data) };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings(settings) {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
}

let controlWindow = null;
let displayWindow = null;

function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Biblían - Stýring',
    icon: appIcon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-control.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  controlWindow.loadFile(path.join(__dirname, '..', 'renderer', 'control.html'));

  controlWindow.on('closed', () => {
    controlWindow = null;
    if (displayWindow) {
      displayWindow.close();
    }
    app.quit();
  });
}

function createDisplayWindow() {
  const displays = screen.getAllDisplays();
  const settings = loadSettings();

  // Primary is the display at origin; all others are external
  const primaryDisplay = displays.find(
    (d) => d.bounds.x === 0 && d.bounds.y === 0
  ) || displays[0];
  const externalDisplays = displays.filter((d) => d !== primaryDisplay);

  // Use saved screen only if it exists AND is not the primary display
  let targetDisplay = null;
  if (settings.displayScreenId != null) {
    const saved = displays.find((d) => d.id === settings.displayScreenId);
    if (saved && saved !== primaryDisplay) {
      targetDisplay = saved;
    }
  }
  if (!targetDisplay) {
    targetDisplay = externalDisplays[0] || primaryDisplay;
  }

  const isExternal = targetDisplay !== primaryDisplay;

  displayWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
    frame: false,
    show: false,
    title: 'Biblían - Skíggi',
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload-display.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  displayWindow.loadFile(
    path.join(__dirname, '..', 'renderer', 'display.html')
  );

  if (isExternal) {
    // frame:false + exact display bounds is visually fullscreen without OS fullscreen.
    // setBounds is called before and after show for reliable positioning on Windows.
    displayWindow.setBounds(targetDisplay.bounds);
    displayWindow.show();
    displayWindow.setBounds(targetDisplay.bounds);
  } else {
    // Single screen: open as a windowed preview
    displayWindow.setPosition(
      targetDisplay.bounds.x + 50,
      targetDisplay.bounds.y + 50
    );
    displayWindow.setSize(800, 600);
    displayWindow.show();
  }

  displayWindow.on('closed', () => {
    displayWindow = null;
    if (controlWindow) {
      controlWindow.webContents.send('display-window-state', false);
    }
  });
}

const appIcon = nativeImage.createFromPath(
  path.join(__dirname, '..', '..', 'build', 'icons', '512x512.png')
);

app.whenReady().then(() => {
  createControlWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});

// IPC: Send verse to display window
ipcMain.on('display-verse', (_event, data) => {
  if (displayWindow) {
    displayWindow.webContents.send('show-verse', data);
  }
});

// IPC: Clear display
ipcMain.on('clear-display', () => {
  if (displayWindow) {
    displayWindow.webContents.send('clear');
  }
});

// IPC: Update display style
ipcMain.on('update-style', (_event, style) => {
  if (displayWindow) {
    displayWindow.webContents.send('update-style', style);
  }
});

// IPC: Toggle display fullscreen
ipcMain.on('toggle-fullscreen', () => {
  if (displayWindow) {
    displayWindow.setFullScreen(!displayWindow.isFullScreen());
  }
});

// IPC: Get available screens
ipcMain.handle('get-screens', () => {
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: `Skíggi ${i + 1} (${d.bounds.width}x${d.bounds.height})`,
    bounds: d.bounds,
    isPrimary: d.bounds.x === 0 && d.bounds.y === 0,
  }));
});

// IPC: Get display window content size
ipcMain.handle('get-display-size', () => {
  if (!displayWindow) return null;
  const [width, height] = displayWindow.getContentSize();
  return { width, height };
});

// Forward display window resize to control window
function setupDisplayResizeForward() {
  if (!displayWindow) return;
  displayWindow.on('resize', () => {
    if (controlWindow) {
      const [width, height] = displayWindow.getContentSize();
      controlWindow.webContents.send('display-resized', { width, height });
    }
  });
}

// IPC: Get saved settings
ipcMain.handle('get-settings', () => {
  return loadSettings();
});

// IPC: Save settings
ipcMain.on('save-settings', (_event, settings) => {
  saveSettings(settings);
});

// IPC: Move display to chosen screen
ipcMain.on('move-display', (_event, displayId) => {
  if (!displayWindow) return;
  const displays = screen.getAllDisplays();
  const target = displays.find((d) => d.id === displayId);
  if (target) {
    displayWindow.setBounds(target.bounds);
    // No setFullScreen — same reason as createDisplayWindow
    const settings = loadSettings();
    settings.displayScreenId = displayId;
    saveSettings(settings);
  }
});

// IPC: Toggle display text visibility
ipcMain.on('toggle-display-text', () => {
  if (displayWindow) {
    displayWindow.webContents.send('toggle-display-text');
  }
});

// IPC: Toggle display window visibility
ipcMain.on('toggle-display-window', () => {
  if (!displayWindow) {
    // First open: create and show the window
    createDisplayWindow();
    setupDisplayResizeForward();
    if (controlWindow) {
      controlWindow.webContents.send('display-window-state', true);
    }
    return;
  }
  const visible = displayWindow.isVisible();
  if (visible) {
    displayWindow.hide();
  } else {
    displayWindow.show();
  }
  if (controlWindow) {
    controlWindow.webContents.send('display-window-state', !visible);
  }
});

// IPC: Query display window visibility
ipcMain.handle('get-display-visible', () => {
  return displayWindow ? displayWindow.isVisible() : false;
});
