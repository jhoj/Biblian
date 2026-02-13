const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let controlWindow = null;
let displayWindow = null;

function createControlWindow() {
  controlWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Biblían - Stýring',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
  const externalDisplay = displays.find(
    (d) => d.bounds.x !== 0 || d.bounds.y !== 0
  );

  const targetDisplay = externalDisplay || displays[0];

  displayWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
    fullscreen: !!externalDisplay,
    frame: false,
    title: 'Biblían - Skíggi',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  displayWindow.loadFile(
    path.join(__dirname, '..', 'renderer', 'display.html')
  );

  if (!externalDisplay) {
    displayWindow.setPosition(
      targetDisplay.bounds.x + 50,
      targetDisplay.bounds.y + 50
    );
    displayWindow.setSize(800, 600);
  }

  displayWindow.on('closed', () => {
    displayWindow = null;
  });
}

app.whenReady().then(() => {
  createControlWindow();
  createDisplayWindow();
  setupDisplayResizeForward();
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

// IPC: Move display to chosen screen
ipcMain.on('move-display', (_event, displayId) => {
  if (!displayWindow) return;
  const displays = screen.getAllDisplays();
  const target = displays.find((d) => d.id === displayId);
  if (target) {
    displayWindow.setBounds(target.bounds);
    displayWindow.setFullScreen(true);
  }
});
