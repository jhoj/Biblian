// All data and search is exposed via the preload script (window.biblian)
const bibleData = biblian.getBibleData();

// DOM elements
const navColumn = document.getElementById('nav-column');
const readingPane = document.getElementById('reading-pane');
const miniPreviewDisplay = document.getElementById('mini-preview-display');
const miniRef = document.getElementById('mini-ref');
const miniText = document.getElementById('mini-text');
const fontSizeSlider = document.getElementById('font-size');
const fontSizeVal = document.getElementById('font-size-val');
const bgColorPicker = document.getElementById('bg-color');
const textColorPicker = document.getElementById('text-color');
const screenSelect = document.getElementById('screen-select');
const btnFullscreen = document.getElementById('btn-fullscreen');
const chkHideText = document.getElementById('chk-hide-text');
const chkDirect = document.getElementById('chk-direct');
const btnSearch = document.getElementById('btn-search');
const shortcutHints = document.getElementById('shortcut-hints');
const searchHintsEl = document.getElementById('search-hints');
const capacityVal = document.getElementById('capacity-val');
const charcountVal = document.getElementById('charcount-val');
const searchOverlay = document.getElementById('search-overlay');
const searchBackdrop = document.getElementById('search-backdrop');
const searchInput = document.getElementById('search-input');
const searchResultsList = document.getElementById('search-results');

let selectedBookIndex = -1;
let selectedChapter = -1;
let navState = 'books'; // 'books' | 'chapters' | 'verses'
let navFocusIndex = -1; // focused item in book/chapter lists

// --- State for reading pane verses ---
let readingVerses = []; // { el, data } for each verse span in reading pane
let focusedIndex = -1;
let multiSelected = new Set();
let liveIndices = new Set(); // verse indices currently shown on live display
let directMode = false;

// --- State for search overlay ---
let displayTextHidden = false;
let searchOpen = false;
let searchMode = 'verse'; // 'verse' | 'book'
let searchItems = []; // { el, data } for search results
let searchFocusedIndex = -1;
let bookChapterInput = ''; // digits typed while book result is focused

// --- Capacity calculation (mirrors display.js logic) ---

const _canvas = document.createElement('canvas');
const _ctx = _canvas.getContext('2d');
const _sampleText = 'Tí so elskaði Guð heiminn, at hann gav son sín, tann einborna, fyri at hvør ið trýr á hann, ikki skal týnast, men hava eyvigt lív.';

function getCharWidthRatio() {
  const refSize = 48;
  _ctx.font = `400 ${refSize}px sans-serif`;
  const measured = _ctx.measureText(_sampleText);
  return measured.width / _sampleText.length / refSize;
}

const charWidthRatio = getCharWidthRatio();
let displaySize = null;
let maxFontSize = 56;

function calcCapacity(fontSize, dispSize) {
  if (!dispSize) return 0;
  const availableWidth = (dispSize.width - 160) * 0.9;
  const availableHeight = dispSize.height - 120;
  const charsPerLine = Math.floor(availableWidth / (fontSize * charWidthRatio));
  const lineHeight = fontSize * 1.4;
  const maxLines = Math.floor(availableHeight / lineHeight);
  return charsPerLine * maxLines;
}

function calcFittingFontSize(textLength, dispSize) {
  if (!dispSize || textLength === 0) return maxFontSize;
  if (calcCapacity(maxFontSize, dispSize) >= textLength) return maxFontSize;
  let lo = 16;
  let hi = maxFontSize;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (calcCapacity(mid, dispSize) >= textLength) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

function updateCapacityDisplay() {
  if (!displaySize) {
    capacityVal.textContent = '—';
    charcountVal.textContent = '0';
    return;
  }

  const capacity = calcCapacity(maxFontSize, displaySize);
  capacityVal.textContent = capacity;

  const text = getSelectedText();
  const charCount = text.length;
  charcountVal.textContent = charCount;

  if (charCount > capacity) {
    charcountVal.classList.add('over-capacity');
  } else {
    charcountVal.classList.remove('over-capacity');
  }
}

async function initDisplaySize() {
  displaySize = await biblian.getDisplaySize();
  updateCapacityDisplay();
}

biblian.onDisplayResize((size) => {
  displaySize = size;
  updateCapacityDisplay();
});

// --- Selection helpers ---

function getSelectedText() {
  if (multiSelected.size > 0) {
    const indices = Array.from(multiSelected).sort((a, b) => a - b);
    return indices.map((i) => readingVerses[i].data.text).join(' ');
  }
  if (focusedIndex >= 0 && focusedIndex < readingVerses.length) {
    return readingVerses[focusedIndex].data.text;
  }
  return '';
}

function getSelectedVerses() {
  if (multiSelected.size > 0) {
    const indices = Array.from(multiSelected).sort((a, b) => a - b);
    return indices.map((i) => ({
      verse: readingVerses[i].data.verse,
      text: readingVerses[i].data.text,
    }));
  }
  if (focusedIndex >= 0 && focusedIndex < readingVerses.length) {
    return [{
      verse: readingVerses[focusedIndex].data.verse,
      text: readingVerses[focusedIndex].data.text,
    }];
  }
  return [];
}

function getSelectedReference() {
  if (multiSelected.size > 0) {
    const indices = Array.from(multiSelected).sort((a, b) => a - b);
    const first = readingVerses[indices[0]].data;
    const last = readingVerses[indices[indices.length - 1]].data;
    if (first.abbrev === last.abbrev && first.chapter === last.chapter) {
      return first.abbrev + ' ' + first.chapter + ':' + first.verse + '-' + last.verse;
    }
    return indices.map((i) => {
      const d = readingVerses[i].data;
      return d.abbrev + ' ' + d.chapter + ':' + d.verse;
    }).join('; ');
  }
  if (focusedIndex >= 0 && focusedIndex < readingVerses.length) {
    const d = readingVerses[focusedIndex].data;
    return d.abbrev + ' ' + d.chapter + ':' + d.verse;
  }
  return '';
}

// --- Focus / multi-select for reading pane ---

function clearFocus() {
  readingVerses.forEach((item) => item.el.classList.remove('focused'));
  focusedIndex = -1;
}

function setFocus(index) {
  if (index < 0 || index >= readingVerses.length) return;
  clearFocus();
  focusedIndex = index;
  if (!directMode) {
    readingVerses[index].el.classList.add('focused');
  }
  readingVerses[index].el.scrollIntoView({ block: 'nearest' });
  updateVerseNumberHighlights();
  if (directMode) {
    displayCurrentSelection();
  }
}

function clearMultiSelect() {
  multiSelected.clear();
  readingVerses.forEach((item) => item.el.classList.remove('multi-selected'));
  updateVerseNumberHighlights();
  updateCapacityDisplay();
}

function toggleMultiSelect(index) {
  if (index < 0 || index >= readingVerses.length) return;
  if (multiSelected.has(index)) {
    multiSelected.delete(index);
    readingVerses[index].el.classList.remove('multi-selected');
  } else {
    multiSelected.add(index);
    readingVerses[index].el.classList.add('multi-selected');
  }
  updateVerseNumberHighlights();
  updateCapacityDisplay();
}

function updateVerseNumberHighlights() {
  if (navState !== 'verses') return;
  const items = navColumn.querySelectorAll('.verse-list li');
  items.forEach((el, i) => {
    el.classList.toggle('active', i === focusedIndex);
    el.classList.toggle('multi-selected', multiSelected.has(i));
    el.classList.toggle('live', liveIndices.has(i));
  });
}

// --- Display / preview ---

function displayCurrentSelection() {
  const text = getSelectedText();
  const ref = getSelectedReference();
  if (!text) return;

  biblian.displayVerse({ reference: ref, text: text, verses: getSelectedVerses() });
  updateMiniPreview(ref, text);
  updateCapacityDisplay();

  // Track and mark live items
  readingVerses.forEach((item) => item.el.classList.remove('live'));
  liveIndices = new Set();
  if (multiSelected.size > 0) {
    multiSelected.forEach((i) => {
      liveIndices.add(i);
      readingVerses[i].el.classList.add('live');
    });
  } else if (focusedIndex >= 0) {
    liveIndices.add(focusedIndex);
    readingVerses[focusedIndex].el.classList.add('live');
  }
  updateVerseNumberHighlights();
}

function clearLiveDisplay() {
  biblian.clearDisplay();
  clearMiniPreview();
  readingVerses.forEach((item) => item.el.classList.remove('live'));
  liveIndices = new Set();
  updateCapacityDisplay();
  updateVerseNumberHighlights();
}

function isSelectionLive() {
  if (liveIndices.size === 0) return false;
  if (multiSelected.size > 0) {
    if (multiSelected.size !== liveIndices.size) return false;
    for (const i of multiSelected) {
      if (!liveIndices.has(i)) return false;
    }
    return true;
  }
  if (focusedIndex >= 0) {
    return liveIndices.size === 1 && liveIndices.has(focusedIndex);
  }
  return false;
}

function updateMiniPreview(ref, text) {
  miniRef.textContent = ref;
  miniText.textContent = text;
  // Respect current style colors
  miniPreviewDisplay.style.backgroundColor = bgColorPicker.value;
  miniRef.style.color = textColorPicker.value;
  miniText.style.color = textColorPicker.value;
}

function clearMiniPreview() {
  miniRef.textContent = '';
  miniText.textContent = '';
}

// --- Drill-down navigation ---

// --- Nav list focus helpers ---

function getNavListItems() {
  if (navState === 'books') return navColumn.querySelectorAll('.book-list li');
  if (navState === 'chapters') return navColumn.querySelectorAll('.chapter-list li');
  return [];
}

function setNavFocus(index) {
  const items = getNavListItems();
  if (items.length === 0) return;
  // Clamp
  if (index < 0) index = 0;
  if (index >= items.length) index = items.length - 1;
  // Clear old
  items.forEach((el) => el.classList.remove('nav-focused'));
  navFocusIndex = index;
  items[index].classList.add('nav-focused');
  items[index].scrollIntoView({ block: 'nearest' });
}

function confirmNavFocus() {
  if (navFocusIndex < 0) return;
  if (navState === 'books') {
    selectBook(navFocusIndex);
  } else if (navState === 'chapters') {
    const book = bibleData.books[selectedBookIndex];
    if (navFocusIndex < book.chapters.length) {
      selectChapter(selectedBookIndex, book.chapters[navFocusIndex].chapter);
    }
  }
}

function renderBookList() {
  navState = 'books';
  navColumn.innerHTML = '';

  const content = document.createElement('div');
  content.className = 'nav-content';

  const ul = document.createElement('ul');
  ul.className = 'book-list';

  bibleData.books.forEach((book, i) => {
    const li = document.createElement('li');
    li.textContent = book.name;
    if (i === selectedBookIndex) li.classList.add('active');
    li.addEventListener('click', () => selectBook(i));
    ul.appendChild(li);
  });

  content.appendChild(ul);
  navColumn.appendChild(content);

  // Focus the previously selected book
  navFocusIndex = selectedBookIndex >= 0 ? selectedBookIndex : 0;
  if (navFocusIndex >= 0) setNavFocus(navFocusIndex);
}

function selectBook(index) {
  selectedBookIndex = index;
  const prevChapter = selectedChapter;
  selectedChapter = -1;
  navState = 'chapters';
  const book = bibleData.books[index];

  navColumn.innerHTML = '';

  // Back header
  const back = document.createElement('div');
  back.className = 'nav-back';
  back.innerHTML = '<span class="nav-back-arrow">\u2190</span>';
  back.appendChild(document.createTextNode(book.name));
  back.addEventListener('click', () => renderBookList());
  navColumn.appendChild(back);

  // Chapter list
  const content = document.createElement('div');
  content.className = 'nav-content';

  const ul = document.createElement('ul');
  ul.className = 'chapter-list';

  book.chapters.forEach((ch) => {
    const li = document.createElement('li');
    li.textContent = 'Kapittul ' + ch.chapter;
    if (ch.chapter === prevChapter) li.classList.add('active');
    li.addEventListener('click', () => selectChapter(index, ch.chapter));
    ul.appendChild(li);
  });

  content.appendChild(ul);
  navColumn.appendChild(content);

  // Focus the previously selected chapter
  const chFocusIdx = prevChapter >= 0
    ? book.chapters.findIndex((c) => c.chapter === prevChapter)
    : 0;
  navFocusIndex = chFocusIdx >= 0 ? chFocusIdx : 0;
  setNavFocus(navFocusIndex);

  // Clear reading pane
  readingPane.innerHTML = '<div class="reading-placeholder">Vel kapittul</div>';
  readingVerses = [];
  focusedIndex = -1;
  multiSelected.clear();
}

// --- Chapter & verse navigation ---

function renderVersesNav(bookIndex, chapterNum, chapter) {
  navState = 'verses';
  const book = bibleData.books[bookIndex];
  navColumn.innerHTML = '';

  // Back header
  const back = document.createElement('div');
  back.className = 'nav-back';
  back.innerHTML = '<span class="nav-back-arrow">\u2190</span>';
  back.appendChild(document.createTextNode(book.abbrev + ' ' + chapterNum));
  back.addEventListener('click', () => selectBook(bookIndex));
  navColumn.appendChild(back);

  // Verse list
  const content = document.createElement('div');
  content.className = 'nav-content';

  const ul = document.createElement('ul');
  ul.className = 'verse-list';

  chapter.verses.forEach((v, i) => {
    const li = document.createElement('li');
    li.textContent = v.verse + '. ' + v.text.substring(0, 30) + (v.text.length > 30 ? '...' : '');
    li.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        setFocus(i);
        toggleMultiSelect(i);
      } else {
        clearMultiSelect();
        setFocus(i);
      }
    });
    ul.appendChild(li);
  });

  content.appendChild(ul);
  navColumn.appendChild(content);
}

function selectChapter(bookIndex, chapterNum) {
  selectedBookIndex = bookIndex;
  selectedChapter = chapterNum;
  const book = bibleData.books[bookIndex];
  const chapter = book.chapters.find((c) => c.chapter === chapterNum);
  if (!chapter) return;

  // Render verse nav
  renderVersesNav(bookIndex, chapterNum, chapter);

  // Render reading pane with full chapter text
  renderReadingPane(book, chapter, chapterNum);
}

function renderReadingPane(book, chapter, chapterNum) {
  readingPane.innerHTML = '';
  readingVerses = [];
  focusedIndex = -1;
  multiSelected.clear();
  liveIndices = new Set();

  chapter.verses.forEach((v) => {
    const span = document.createElement('span');
    span.className = 'reading-verse';

    const sup = document.createElement('sup');
    sup.className = 'verse-sup';
    sup.textContent = v.verse;
    span.appendChild(sup);

    span.appendChild(document.createTextNode(v.text + ' '));

    const data = {
      book: book.name,
      abbrev: book.abbrev,
      chapter: chapterNum,
      verse: v.verse,
      text: v.text,
    };

    const itemIndex = readingVerses.length;
    span.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        setFocus(itemIndex);
        toggleMultiSelect(itemIndex);
      } else {
        clearMultiSelect();
        setFocus(itemIndex);
      }
    });
    span.addEventListener('dblclick', () => {
      if (isSelectionLive()) {
        clearLiveDisplay();
      } else {
        displayCurrentSelection();
      }
    });

    readingVerses.push({ el: span, data: data });
    readingPane.appendChild(span);
  });

  updateCapacityDisplay();
}

// --- Search overlay ---

const searchTabs = document.querySelectorAll('.search-tab');

function openSearch() {
  searchOpen = true;
  searchOverlay.style.display = '';
  searchInput.value = '';
  searchResultsList.innerHTML = '';
  searchItems = [];
  searchFocusedIndex = -1;
  setSearchMode('verse');
  searchInput.focus();
}

function closeSearch() {
  searchOpen = false;
  searchOverlay.style.display = 'none';
  searchInput.value = '';
  searchResultsList.innerHTML = '';
  searchItems = [];
  searchFocusedIndex = -1;
  bookChapterInput = '';
}

function setSearchMode(mode) {
  searchMode = mode;
  bookChapterInput = '';
  searchTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });
  searchInput.placeholder = mode === 'verse'
    ? 'Leita í versum... (t.d. \'sælir eru\' ella \'Jóh 3:16\')'
    : 'Leita eftir bók... (t.d. \'annað\')';
  // Re-run search with current input
  const query = searchInput.value.trim();
  searchResultsList.innerHTML = '';
  searchItems = [];
  searchFocusedIndex = -1;
  if (query.length >= 1 && mode === 'book') {
    performBookSearch(query);
  } else if (query.length >= 2 && mode === 'verse') {
    performVerseSearch(query);
  }
}

searchTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    setSearchMode(tab.dataset.mode);
    searchInput.focus();
  });
});

function navigateToVerseResult(item) {
  const bookIndex = bibleData.books.findIndex((b) => b.name === item.book);
  if (bookIndex < 0) return;

  selectBook(bookIndex);
  selectChapter(bookIndex, item.chapter);

  const verseIndex = readingVerses.findIndex(
    (rv) => rv.data.verse === item.verse
  );
  if (verseIndex >= 0) {
    clearMultiSelect();
    setFocus(verseIndex);
  }

  closeSearch();
}

function navigateToBookResult(bookIndex) {
  selectBook(bookIndex);
  const book = bibleData.books[bookIndex];
  if (book.chapters.length > 0) {
    // Use typed chapter number, or default to first chapter
    let targetChapter = book.chapters[0].chapter;
    if (bookChapterInput) {
      const typed = parseInt(bookChapterInput);
      const found = book.chapters.find((c) => c.chapter === typed);
      if (found) {
        targetChapter = found.chapter;
      }
    }
    selectChapter(bookIndex, targetChapter);
    if (readingVerses.length > 0) {
      clearMultiSelect();
      setFocus(0);
    }
  }

  closeSearch();
}

btnSearch.addEventListener('click', () => openSearch());
searchBackdrop.addEventListener('click', () => closeSearch());

let searchTimeout = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  bookChapterInput = '';
  updateChapterBadge();
  const query = searchInput.value.trim();

  if (searchMode === 'book') {
    if (query.length < 1) {
      searchResultsList.innerHTML = '';
      searchItems = [];
      searchFocusedIndex = -1;
      return;
    }
    searchTimeout = setTimeout(() => performBookSearch(query), 50);
  } else {
    if (query.length < 2) {
      searchResultsList.innerHTML = '';
      searchItems = [];
      searchFocusedIndex = -1;
      return;
    }
    searchTimeout = setTimeout(() => performVerseSearch(query), 80);
  }
});

function performVerseSearch(query) {
  const results = biblian.search(query, 50);
  showVerseSearchResults(results, query);
}

function performBookSearch(query) {
  const q = query.toLowerCase();
  const matches = [];
  bibleData.books.forEach((book, i) => {
    if (book.name.toLowerCase().includes(q) || book.abbrev.toLowerCase().includes(q)) {
      matches.push({ name: book.name, abbrev: book.abbrev, index: i });
    }
  });
  showBookSearchResults(matches, query);
}

function highlightMatches(text, query) {
  const words = query.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return escapeHtml(text);
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp('(' + escaped.join('|') + ')', 'gi');
  return text.replace(pattern, (match) => '<mark>' + escapeHtml(match) + '</mark>');
}

function showVerseSearchResults(results, query) {
  searchResultsList.innerHTML = '';
  searchItems = [];
  searchFocusedIndex = -1;

  if (results.length === 0) {
    const li = document.createElement('li');
    li.className = 'no-results';
    li.textContent = 'Einki funnið';
    searchResultsList.appendChild(li);
    return;
  }

  results.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML =
      '<div class="result-ref">' + escapeHtml(item.ref) + '</div>' +
      '<div class="result-text">' + highlightMatches(item.text, query) + '</div>';

    const data = {
      book: item.book,
      abbrev: item.abbrev,
      chapter: item.chapter,
      verse: item.verse,
      text: item.text,
    };

    li.addEventListener('click', () => navigateToVerseResult(data));
    searchItems.push({ el: li, data: data });
    searchResultsList.appendChild(li);
  });

  if (searchItems.length > 0) {
    setSearchFocus(0);
  }
}

function showBookSearchResults(results, query) {
  searchResultsList.innerHTML = '';
  searchItems = [];
  searchFocusedIndex = -1;

  if (results.length === 0) {
    const li = document.createElement('li');
    li.className = 'no-results';
    li.textContent = 'Einki funnið';
    searchResultsList.appendChild(li);
    return;
  }

  results.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML =
      '<div class="result-ref">' + highlightMatches(item.name, query) + '</div>' +
      '<div class="result-text">' + escapeHtml(item.abbrev) + '</div>';

    li.addEventListener('click', () => navigateToBookResult(item.index));
    searchItems.push({ el: li, data: item });
    searchResultsList.appendChild(li);
  });

  if (searchItems.length > 0) {
    setSearchFocus(0);
  }
}

function updateChapterBadge() {
  // Reset all book result subtexts to their abbreviation
  if (searchMode === 'book') {
    searchItems.forEach((item) => {
      const sub = item.el.querySelector('.result-text');
      if (sub) sub.innerHTML = escapeHtml(item.data.abbrev);
    });
  }
  if (searchMode !== 'book' || !bookChapterInput || searchFocusedIndex < 0) return;
  const focused = searchItems[searchFocusedIndex];
  if (!focused) return;
  const sub = focused.el.querySelector('.result-text');
  if (!sub) return;
  const book = bibleData.books[focused.data.index];
  const typed = parseInt(bookChapterInput);
  const valid = book.chapters.some((c) => c.chapter === typed);
  const cls = valid ? 'chapter-num valid' : 'chapter-num invalid';
  sub.innerHTML = escapeHtml(focused.data.abbrev) +
    ' <span class="' + cls + '">kap. ' + escapeHtml(bookChapterInput) + '</span>';
}

function clearSearchFocus() {
  searchItems.forEach((item) => item.el.classList.remove('focused'));
  searchFocusedIndex = -1;
}

function setSearchFocus(index) {
  if (index < 0 || index >= searchItems.length) return;
  clearSearchFocus();
  searchFocusedIndex = index;
  searchItems[index].el.classList.add('focused');
  searchItems[index].el.scrollIntoView({ block: 'nearest' });
  updateChapterBadge();
}

// --- Style controls ---

function saveCurrentSettings() {
  biblian.saveSettings({
    fontSize: parseInt(fontSizeSlider.value),
    backgroundColor: bgColorPicker.value,
    color: textColorPicker.value,
    navColumnWidth: Math.round(navColumn.getBoundingClientRect().width),
    previewColumnWidth: Math.round(previewColumn.getBoundingClientRect().width),
  });
}

fontSizeSlider.addEventListener('input', () => {
  maxFontSize = parseInt(fontSizeSlider.value);
  fontSizeVal.textContent = fontSizeSlider.value + 'px';
  biblian.updateStyle({ fontSize: fontSizeSlider.value + 'px' });
  updateCapacityDisplay();
  saveCurrentSettings();
});

bgColorPicker.addEventListener('input', () => {
  biblian.updateStyle({ backgroundColor: bgColorPicker.value });
  miniPreviewDisplay.style.backgroundColor = bgColorPicker.value;
  saveCurrentSettings();
});

textColorPicker.addEventListener('input', () => {
  biblian.updateStyle({ color: textColorPicker.value });
  miniRef.style.color = textColorPicker.value;
  miniText.style.color = textColorPicker.value;
  saveCurrentSettings();
});

// --- Screen selection ---

async function loadScreens() {
  const screens = await biblian.getScreens();
  const settings = await biblian.getSettings();
  screenSelect.innerHTML = '';
  screens.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.label + (s.isPrimary ? ' (Høvuðsskíggur)' : '');
    if (settings.displayScreenId != null && s.id === settings.displayScreenId) {
      opt.selected = true;
    }
    screenSelect.appendChild(opt);
  });
}

screenSelect.addEventListener('change', () => {
  const id = parseInt(screenSelect.value);
  if (id) biblian.moveDisplay(id);
});

// --- Buttons ---

btnFullscreen.addEventListener('click', () => biblian.toggleFullscreen());

function toggleHideText() {
  displayTextHidden = !displayTextHidden;
  chkHideText.checked = displayTextHidden;
  biblian.toggleDisplayText();
}

chkHideText.addEventListener('change', () => {
  displayTextHidden = chkHideText.checked;
  biblian.toggleDisplayText();
});

function toggleDirectMode() {
  directMode = !directMode;
  chkDirect.checked = directMode;
  // Clear green preview highlight when entering direct mode
  if (directMode) {
    readingVerses.forEach((item) => item.el.classList.remove('focused'));
  } else if (focusedIndex >= 0) {
    readingVerses[focusedIndex].el.classList.add('focused');
  }
}

chkDirect.addEventListener('change', () => {
  directMode = chkDirect.checked;
  if (directMode) {
    readingVerses.forEach((item) => item.el.classList.remove('focused'));
  } else if (focusedIndex >= 0) {
    readingVerses[focusedIndex].el.classList.add('focused');
  }
});

// --- Keyboard shortcuts ---

document.addEventListener('keydown', (e) => {
  // Search overlay handling
  if (searchOpen) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
      return;
    }

    if (e.key === 'Alt') {
      e.preventDefault();
      showSearchHints();
      return;
    }

    // Left/Right arrow: switch search tabs when input is empty or cursor at edge
    if (e.key === 'ArrowRight') {
      const atEnd = searchInput.selectionStart === searchInput.value.length;
      if (atEnd && searchMode === 'verse') {
        e.preventDefault();
        setSearchMode('book');
        searchInput.focus();
        return;
      }
    }

    if (e.key === 'ArrowLeft') {
      const atStart = searchInput.selectionStart === 0;
      if (atStart && searchMode === 'book') {
        e.preventDefault();
        setSearchMode('verse');
        searchInput.focus();
        return;
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (searchItems.length === 0) return;
      const next = searchFocusedIndex < searchItems.length - 1
        ? searchFocusedIndex + 1
        : 0;
      setSearchFocus(next);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (searchItems.length === 0) return;
      const prev = searchFocusedIndex > 0
        ? searchFocusedIndex - 1
        : searchItems.length - 1;
      setSearchFocus(prev);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchFocusedIndex >= 0 && searchFocusedIndex < searchItems.length) {
        const item = searchItems[searchFocusedIndex].data;
        if (searchMode === 'book') {
          navigateToBookResult(item.index);
        } else {
          navigateToVerseResult(item);
        }
      }
      return;
    }

    // Book mode: capture digits as chapter number when a result is focused
    if (searchMode === 'book' && searchFocusedIndex >= 0) {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        bookChapterInput += e.key;
        updateChapterBadge();
        return;
      }
      if (e.key === 'Backspace' && bookChapterInput.length > 0) {
        e.preventDefault();
        bookChapterInput = bookChapterInput.slice(0, -1);
        updateChapterBadge();
        return;
      }
    }

    // Let other keys pass through to the search input
    return;
  }

  // Alt: show shortcut hints
  if (e.key === 'Alt') {
    e.preventDefault();
    showShortcutHints();
    return;
  }

  const notInput = document.activeElement.tagName !== 'INPUT';

  // Open search: L
  if (e.key === 'l' && notInput) {
    e.preventDefault();
    openSearch();
    return;
  }

  // Toggle hide text: F
  if (e.key === 'f' && notInput) {
    e.preventDefault();
    toggleHideText();
    return;
  }

  // Toggle direct mode: B
  if (e.key === 'b' && notInput) {
    e.preventDefault();
    toggleDirectMode();
    return;
  }

  // Focus font size slider: S
  if (e.key === 's' && notInput) {
    e.preventDefault();
    fontSizeSlider.focus();
    return;
  }

  // Open background color picker: M
  if (e.key === 'm' && notInput) {
    e.preventDefault();
    bgColorPicker.click();
    return;
  }

  // Open text color picker: T
  if (e.key === 't' && notInput) {
    e.preventDefault();
    textColorPicker.click();
    return;
  }

  // Escape: clear selection
  if (e.key === 'Escape') {
    clearMultiSelect();
    clearFocus();
    return;
  }

  // Backspace: navigate back in book menu
  if (e.key === 'Backspace' && notInput) {
    e.preventDefault();
    if (navState === 'verses') {
      selectBook(selectedBookIndex);
    } else if (navState === 'chapters') {
      renderBookList();
    }
    return;
  }

  // Fullscreen
  if (e.key === 'F11') {
    e.preventDefault();
    biblian.toggleFullscreen();
    return;
  }

  // Arrow key navigation
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();

    // Nav list navigation (books / chapters)
    if (navState === 'books' || navState === 'chapters') {
      const items = getNavListItems();
      if (items.length === 0) return;
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      let next = navFocusIndex + delta;
      if (next < 0) next = 0;
      if (next >= items.length) next = items.length - 1;
      setNavFocus(next);
      return;
    }

    // Verse navigation in reading pane
    if (readingVerses.length === 0) return;

    let newIndex;
    if (e.key === 'ArrowDown') {
      if (focusedIndex >= readingVerses.length - 1) {
        // Cross to next chapter
        if (selectedBookIndex >= 0 && selectedChapter >= 0) {
          const book = bibleData.books[selectedBookIndex];
          const chIdx = book.chapters.findIndex((c) => c.chapter === selectedChapter);
          if (chIdx >= 0 && chIdx < book.chapters.length - 1) {
            const nextChapter = book.chapters[chIdx + 1].chapter;
            selectChapter(selectedBookIndex, nextChapter);
            setFocus(0);
          }
        }
        return;
      }
      newIndex = focusedIndex + 1;
    } else {
      if (focusedIndex <= 0) {
        // Cross to previous chapter
        if (selectedBookIndex >= 0 && selectedChapter >= 0) {
          const book = bibleData.books[selectedBookIndex];
          const chIdx = book.chapters.findIndex((c) => c.chapter === selectedChapter);
          if (chIdx > 0) {
            const prevChapter = book.chapters[chIdx - 1].chapter;
            selectChapter(selectedBookIndex, prevChapter);
            setFocus(readingVerses.length - 1);
          }
        }
        return;
      }
      newIndex = focusedIndex - 1;
    }

    if (e.ctrlKey || e.metaKey) {
      setFocus(newIndex);
      toggleMultiSelect(newIndex);
    } else if (e.shiftKey) {
      // On first shift-select, include the starting verse
      if (multiSelected.size === 0 && focusedIndex >= 0) {
        toggleMultiSelect(focusedIndex);
      }
      if (!multiSelected.has(newIndex)) {
        toggleMultiSelect(newIndex);
      }
      setFocus(newIndex);
    } else {
      clearMultiSelect();
      setFocus(newIndex);
    }
    return;
  }

  // Enter: confirm nav selection or toggle live display
  if (e.key === 'Enter') {
    e.preventDefault();

    // Nav list: confirm selection
    if (navState === 'books' || navState === 'chapters') {
      confirmNavFocus();
      return;
    }

    // Verse: toggle live
    if (readingVerses.length === 0) return;
    if (e.ctrlKey || e.metaKey) {
      if (focusedIndex >= 0) {
        toggleMultiSelect(focusedIndex);
      }
    } else {
      if (focusedIndex < 0 && multiSelected.size === 0) return;
      if (isSelectionLive()) {
        clearLiveDisplay();
      } else {
        displayCurrentSelection();
      }
    }
    return;
  }
});

// --- Shortcut hints (Alt overlay) ---

function showShortcutHints() {
  shortcutHints.innerHTML = '';
  shortcutHints.style.display = '';
  const items = document.querySelectorAll('[data-shortcut]');
  items.forEach((el) => {
    const key = el.dataset.shortcut;
    const badge = document.createElement('div');
    badge.className = 'shortcut-badge';
    badge.textContent = key;
    const rect = el.getBoundingClientRect();
    badge.style.left = rect.left + 'px';
    badge.style.top = (rect.top - 18) + 'px';
    shortcutHints.appendChild(badge);
  });
  // Also show search icon hint
  const searchRect = btnSearch.getBoundingClientRect();
  const searchBadge = document.createElement('div');
  searchBadge.className = 'shortcut-badge';
  searchBadge.textContent = 'l';
  searchBadge.style.left = searchRect.left + 'px';
  searchBadge.style.top = (searchRect.top - 18) + 'px';
  shortcutHints.appendChild(searchBadge);
}

function hideShortcutHints() {
  shortcutHints.style.display = 'none';
  shortcutHints.innerHTML = '';
}

function showSearchHints() {
  searchHintsEl.style.display = '';
}

function hideSearchHints() {
  searchHintsEl.style.display = 'none';
}

document.addEventListener('keyup', (e) => {
  if (e.key === 'Alt') {
    hideShortcutHints();
    hideSearchHints();
  }
});

// --- Helpers ---

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Column resizing ---

const resizeLeft = document.getElementById('resize-left');
const resizeRight = document.getElementById('resize-right');
const previewColumn = document.getElementById('preview-column');

function setupResize(handle, getTarget, direction) {
  let startX, startWidth;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const target = getTarget();
    startX = e.clientX;
    startWidth = target.getBoundingClientRect().width;
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMouseMove(e) {
      const delta = (e.clientX - startX) * direction;
      const newWidth = Math.max(60, startWidth + delta);
      target.style.width = newWidth + 'px';
    }

    function onMouseUp() {
      handle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      saveColumnWidths();
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

setupResize(resizeLeft, () => navColumn, 1);
setupResize(resizeRight, () => previewColumn, -1);

function saveColumnWidths() {
  const navW = Math.round(navColumn.getBoundingClientRect().width);
  const prevW = Math.round(previewColumn.getBoundingClientRect().width);
  biblian.saveSettings({
    fontSize: parseInt(fontSizeSlider.value),
    backgroundColor: bgColorPicker.value,
    color: textColorPicker.value,
    navColumnWidth: navW,
    previewColumnWidth: prevW,
  });
}

// --- Init ---

async function initSettings() {
  const settings = await biblian.getSettings();

  fontSizeSlider.value = settings.fontSize;
  fontSizeVal.textContent = settings.fontSize + 'px';
  maxFontSize = settings.fontSize;

  bgColorPicker.value = settings.backgroundColor;
  textColorPicker.value = settings.color;

  // Restore column widths
  if (settings.navColumnWidth) {
    navColumn.style.width = settings.navColumnWidth + 'px';
  }
  if (settings.previewColumnWidth) {
    previewColumn.style.width = settings.previewColumnWidth + 'px';
  }

  // Apply to display window
  biblian.updateStyle({
    fontSize: settings.fontSize + 'px',
    backgroundColor: settings.backgroundColor,
    color: settings.color,
  });

  // Apply to mini preview
  miniPreviewDisplay.style.backgroundColor = settings.backgroundColor;
  miniRef.style.color = settings.color;
  miniText.style.color = settings.color;
}

renderBookList();
loadScreens();
initDisplaySize();
initSettings();
