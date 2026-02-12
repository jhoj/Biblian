const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const Fuse = require('fuse.js');

// Load Bible data in the preload (has Node access)
const bibleData = require(path.join(__dirname, '..', 'data', 'bible.json'));

// Build flat verse index for searching
const allVerses = [];
for (const book of bibleData.books) {
  for (const chapter of book.chapters) {
    for (const v of chapter.verses) {
      allVerses.push({
        book: book.name,
        abbrev: book.abbrev,
        chapter: chapter.chapter,
        verse: v.verse,
        text: v.text,
        ref: `${book.name} ${chapter.chapter}:${v.verse}`,
        shortRef: `${book.abbrev} ${chapter.chapter}:${v.verse}`,
      });
    }
  }
}

// Initialize Fuse.js
const fuse = new Fuse(allVerses, {
  keys: [
    { name: 'text', weight: 0.6 },
    { name: 'ref', weight: 0.3 },
    { name: 'shortRef', weight: 0.1 },
  ],
  threshold: 0.4,
  includeMatches: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
});

contextBridge.exposeInMainWorld('biblian', {
  // Bible data
  getBibleData: () => JSON.parse(JSON.stringify(bibleData)),
  search: (query, limit) => {
    const results = fuse.search(query, { limit: limit || 50 });
    return JSON.parse(JSON.stringify(results));
  },
  findBook: (bookQuery) => {
    const book = bibleData.books.find(
      (b) =>
        b.abbrev.toLowerCase() === bookQuery.toLowerCase() ||
        b.name.toLowerCase().startsWith(bookQuery.toLowerCase())
    );
    return book ? JSON.parse(JSON.stringify(book)) : null;
  },

  // IPC to main process
  displayVerse: (data) => ipcRenderer.send('display-verse', data),
  clearDisplay: () => ipcRenderer.send('clear-display'),
  updateStyle: (style) => ipcRenderer.send('update-style', style),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  getScreens: () => ipcRenderer.invoke('get-screens'),
  moveDisplay: (displayId) => ipcRenderer.send('move-display', displayId),

  // IPC from main process (for display window)
  onShowVerse: (callback) =>
    ipcRenderer.on('show-verse', (_event, data) => callback(data)),
  onClear: (callback) => ipcRenderer.on('clear', () => callback()),
  onUpdateStyle: (callback) =>
    ipcRenderer.on('update-style', (_event, style) => callback(style)),
});
