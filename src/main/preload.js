const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

// Load Bible data in the preload (has Node access)
const fs = require('fs');
const bibleJsonStr = fs.readFileSync(
  path.join(__dirname, '..', 'data', 'bible.json'),
  'utf-8'
);
const bibleData = JSON.parse(bibleJsonStr);

// Initialize WASM search engine
const wasmSearch = require('../search-pkg/biblian_search.js');
wasmSearch.init(bibleJsonStr);

contextBridge.exposeInMainWorld('biblian', {
  // Bible data
  getBibleData: () => JSON.parse(JSON.stringify(bibleData)),
  search: (query, limit) => {
    return wasmSearch.search(query, limit || 50);
  },

  // IPC to main process
  displayVerse: (data) => ipcRenderer.send('display-verse', data),
  clearDisplay: () => ipcRenderer.send('clear-display'),
  updateStyle: (style) => ipcRenderer.send('update-style', style),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  getScreens: () => ipcRenderer.invoke('get-screens'),
  moveDisplay: (displayId) => ipcRenderer.send('move-display', displayId),
  toggleDisplayText: () => ipcRenderer.send('toggle-display-text'),
  getDisplaySize: () => ipcRenderer.invoke('get-display-size'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.send('save-settings', settings),

  // IPC from main process (for display window)
  onShowVerse: (callback) =>
    ipcRenderer.on('show-verse', (_event, data) => callback(data)),
  onClear: (callback) => ipcRenderer.on('clear', () => callback()),
  onUpdateStyle: (callback) =>
    ipcRenderer.on('update-style', (_event, style) => callback(style)),
  onToggleDisplayText: (callback) =>
    ipcRenderer.on('toggle-display-text', () => callback()),
  onDisplayResize: (callback) =>
    ipcRenderer.on('display-resized', (_event, size) => callback(size)),
});
