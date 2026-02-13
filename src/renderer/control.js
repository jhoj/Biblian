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
const btnClear = document.getElementById('btn-clear');
const btnSearch = document.getElementById('btn-search');
const capacityVal = document.getElementById('capacity-val');
const charcountVal = document.getElementById('charcount-val');
const searchOverlay = document.getElementById('search-overlay');
const searchBackdrop = document.getElementById('search-backdrop');
const searchInput = document.getElementById('search-input');
const searchResultsList = document.getElementById('search-results');

let selectedBookIndex = -1;
let selectedChapter = -1;
let navState = 'books'; // 'books' | 'chapters' | 'verses'

// --- State for reading pane verses ---
let readingVerses = []; // { el, data } for each verse span in reading pane
let focusedIndex = -1;
let multiSelected = new Set();

// --- State for search overlay ---
let searchOpen = false;
let searchItems = []; // { el, data } for search results
let searchFocusedIndex = -1;

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
  readingVerses[index].el.classList.add('focused');
  readingVerses[index].el.scrollIntoView({ block: 'nearest' });
  // Also highlight in left nav verse numbers
  updateVerseNumberHighlights();
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
  const btns = navColumn.querySelectorAll('.verse-numbers button');
  btns.forEach((btn, i) => {
    btn.classList.toggle('active', i === focusedIndex);
    btn.classList.toggle('multi-selected', multiSelected.has(i));
  });
}

// --- Display / preview ---

function displayCurrentSelection() {
  const text = getSelectedText();
  const ref = getSelectedReference();
  if (!text) return;

  biblian.displayVerse({ reference: ref, text: text });
  updateMiniPreview(ref, text);
  updateCapacityDisplay();

  // Mark displayed items as 'selected' visually
  readingVerses.forEach((item) => item.el.classList.remove('selected'));
  if (multiSelected.size > 0) {
    multiSelected.forEach((i) => readingVerses[i].el.classList.add('selected'));
  } else if (focusedIndex >= 0) {
    readingVerses[focusedIndex].el.classList.add('selected');
  }
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
}

function selectBook(index) {
  selectedBookIndex = index;
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

  // Chapter button grid
  const content = document.createElement('div');
  content.className = 'nav-content';

  const grid = document.createElement('div');
  grid.className = 'chapter-buttons';

  book.chapters.forEach((ch) => {
    const btn = document.createElement('button');
    btn.textContent = ch.chapter;
    btn.addEventListener('click', () => selectChapter(index, ch.chapter));
    grid.appendChild(btn);
  });

  content.appendChild(grid);
  navColumn.appendChild(content);

  // Clear reading pane
  readingPane.innerHTML = '<div class="reading-placeholder">Vel eitt kapittul</div>';
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

  // Verse number grid
  const content = document.createElement('div');
  content.className = 'nav-content';

  const grid = document.createElement('div');
  grid.className = 'verse-numbers';

  chapter.verses.forEach((v, i) => {
    const btn = document.createElement('button');
    btn.textContent = v.verse;
    btn.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        setFocus(i);
        toggleMultiSelect(i);
      } else {
        clearMultiSelect();
        setFocus(i);
      }
    });
    grid.appendChild(btn);
  });

  content.appendChild(grid);
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
        displayCurrentSelection();
      }
    });

    readingVerses.push({ el: span, data: data });
    readingPane.appendChild(span);
  });

  updateCapacityDisplay();
}

// --- Search overlay ---

function openSearch() {
  searchOpen = true;
  searchOverlay.style.display = '';
  searchInput.value = '';
  searchResultsList.innerHTML = '';
  searchItems = [];
  searchFocusedIndex = -1;
  searchInput.focus();
}

function closeSearch() {
  searchOpen = false;
  searchOverlay.style.display = 'none';
  searchInput.value = '';
  searchResultsList.innerHTML = '';
  searchItems = [];
  searchFocusedIndex = -1;
}

function navigateToSearchResult(item) {
  // Find the book index
  const bookIndex = bibleData.books.findIndex((b) => b.name === item.book);
  if (bookIndex < 0) return;

  selectBook(bookIndex);
  selectChapter(bookIndex, item.chapter);

  // Focus the specific verse
  const verseIndex = readingVerses.findIndex(
    (rv) => rv.data.verse === item.verse
  );
  if (verseIndex >= 0) {
    clearMultiSelect();
    setFocus(verseIndex);
  }

  closeSearch();
}

btnSearch.addEventListener('click', () => openSearch());
searchBackdrop.addEventListener('click', () => closeSearch());

let searchTimeout = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const query = searchInput.value.trim();

  if (query.length < 2) {
    searchResultsList.innerHTML = '';
    searchItems = [];
    searchFocusedIndex = -1;
    return;
  }

  searchTimeout = setTimeout(() => performSearch(query), 80);
});

function performSearch(query) {
  // Try to parse as a reference like "Jóh 3:16" or "Matt 5"
  const refMatch = query.match(/^(\S+)\s+(\d+)(?::(\d+))?$/);
  if (refMatch) {
    const bookQuery = refMatch[1];
    const chapNum = parseInt(refMatch[2]);
    const verseNum = refMatch[3] ? parseInt(refMatch[3]) : null;

    const book = biblian.findBook(bookQuery);
    if (book) {
      const chapter = book.chapters.find((c) => c.chapter === chapNum);
      if (chapter) {
        if (verseNum) {
          const verse = chapter.verses.find((v) => v.verse === verseNum);
          if (verse) {
            showSearchResults([
              {
                item: {
                  book: book.name,
                  abbrev: book.abbrev,
                  chapter: chapNum,
                  verse: verseNum,
                  text: verse.text,
                  ref: book.name + ' ' + chapNum + ':' + verseNum,
                },
              },
            ]);
            return;
          }
        } else {
          const results = chapter.verses.map((v) => ({
            item: {
              book: book.name,
              abbrev: book.abbrev,
              chapter: chapNum,
              verse: v.verse,
              text: v.text,
              ref: book.name + ' ' + chapNum + ':' + v.verse,
            },
          }));
          showSearchResults(results);
          return;
        }
      }
    }
  }

  // Fuzzy search via preload
  const results = biblian.search(query, 50);
  showSearchResults(results);
}

function showSearchResults(results) {
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

  results.forEach((result) => {
    const item = result.item;
    const li = document.createElement('li');
    li.innerHTML =
      '<div class="result-ref">' + escapeHtml(item.ref) + '</div>' +
      '<div class="result-text">' + escapeHtml(item.text) + '</div>';

    const data = {
      book: item.book,
      abbrev: item.abbrev,
      chapter: item.chapter,
      verse: item.verse,
      text: item.text,
    };

    const itemIndex = searchItems.length;
    li.addEventListener('click', () => navigateToSearchResult(data));

    searchItems.push({ el: li, data: data });
    searchResultsList.appendChild(li);
  });

  // Auto-focus first result
  if (searchItems.length > 0) {
    setSearchFocus(0);
  }
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
}

// --- Style controls ---

function saveCurrentSettings() {
  biblian.saveSettings({
    fontSize: parseInt(fontSizeSlider.value),
    backgroundColor: bgColorPicker.value,
    color: textColorPicker.value,
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
  screenSelect.innerHTML = '';
  screens.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.label + (s.isPrimary ? ' (Høvuðsskíggur)' : '');
    screenSelect.appendChild(opt);
  });
}

screenSelect.addEventListener('change', () => {
  const id = parseInt(screenSelect.value);
  if (id) biblian.moveDisplay(id);
});

// --- Buttons ---

btnFullscreen.addEventListener('click', () => biblian.toggleFullscreen());

btnClear.addEventListener('click', () => {
  biblian.clearDisplay();
  clearMiniPreview();
  clearMultiSelect();
  readingVerses.forEach((item) => item.el.classList.remove('selected'));
  updateCapacityDisplay();
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
        navigateToSearchResult(searchItems[searchFocusedIndex].data);
      }
      return;
    }

    // Let other keys pass through to the search input
    return;
  }

  // Open search: Ctrl+S or Ctrl+F
  if ((e.ctrlKey && (e.key === 's' || e.key === 'f')) ||
      (e.key === '/' && document.activeElement.tagName !== 'INPUT')) {
    e.preventDefault();
    openSearch();
    return;
  }

  // Escape: clear selection
  if (e.key === 'Escape') {
    clearMultiSelect();
    clearFocus();
    return;
  }

  // Fullscreen
  if (e.key === 'F11') {
    e.preventDefault();
    biblian.toggleFullscreen();
    return;
  }

  // Arrow key navigation in reading pane
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (readingVerses.length === 0) return;
    e.preventDefault();

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
      setFocus(newIndex);
      if (!multiSelected.has(newIndex)) {
        toggleMultiSelect(newIndex);
      }
    } else {
      setFocus(newIndex);
      if (multiSelected.size === 0) {
        updateCapacityDisplay();
      }
    }
    return;
  }

  // Enter: display current selection
  if (e.key === 'Enter') {
    if (readingVerses.length === 0) return;
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      if (focusedIndex >= 0) {
        toggleMultiSelect(focusedIndex);
      }
    } else {
      if (focusedIndex < 0 && multiSelected.size === 0) return;
      displayCurrentSelection();
    }
    return;
  }
});

// --- Helpers ---

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Init ---

async function initSettings() {
  const settings = await biblian.getSettings();

  fontSizeSlider.value = settings.fontSize;
  fontSizeVal.textContent = settings.fontSize + 'px';
  maxFontSize = settings.fontSize;

  bgColorPicker.value = settings.backgroundColor;
  textColorPicker.value = settings.color;

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
