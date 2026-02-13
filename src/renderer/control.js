// All data and search is exposed via the preload script (window.biblian)
const bibleData = biblian.getBibleData();

// DOM elements
const searchInput = document.getElementById('search-input');
const bookList = document.getElementById('book-list');
const chapterNav = document.getElementById('chapter-nav');
const chapterButtons = document.getElementById('chapter-buttons');
const currentBookTitle = document.getElementById('current-book-title');
const searchResults = document.getElementById('search-results');
const resultsList = document.getElementById('results-list');
const versePanel = document.getElementById('verse-panel');
const versePanelTitle = document.getElementById('verse-panel-title');
const verseList = document.getElementById('verse-list');
const preview = document.getElementById('preview');
const fontSizeSlider = document.getElementById('font-size');
const fontSizeVal = document.getElementById('font-size-val');
const bgColorPicker = document.getElementById('bg-color');
const textColorPicker = document.getElementById('text-color');
const screenSelect = document.getElementById('screen-select');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnClear = document.getElementById('btn-clear');
const capacityVal = document.getElementById('capacity-val');
const charcountVal = document.getElementById('charcount-val');

let selectedBookIndex = -1;
let selectedChapter = -1;

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

  // Calculate character count from current selection
  const text = getSelectedText();
  const charCount = text.length;
  charcountVal.textContent = charCount;

  // Highlight if over capacity
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

// --- Keyboard navigation state ---

// Each navigable list (search results, verse list) tracks its own data.
// `activeList` points to whichever is currently visible.
let focusedIndex = -1;
let activeListItems = []; // array of { el, data } where data has verse info
let multiSelected = new Set(); // indices into activeListItems

function getActiveListContainer() {
  if (searchResults.style.display !== 'none') return resultsList;
  if (versePanel.style.display !== 'none') return verseList;
  return null;
}

function clearFocus() {
  activeListItems.forEach((item) => item.el.classList.remove('focused'));
  focusedIndex = -1;
}

function setFocus(index) {
  if (index < 0 || index >= activeListItems.length) return;
  clearFocus();
  focusedIndex = index;
  activeListItems[index].el.classList.add('focused');
  activeListItems[index].el.scrollIntoView({ block: 'nearest' });
}

function clearMultiSelect() {
  multiSelected.clear();
  activeListItems.forEach((item) => item.el.classList.remove('multi-selected'));
  updateCapacityDisplay();
}

function toggleMultiSelect(index) {
  if (index < 0 || index >= activeListItems.length) return;
  if (multiSelected.has(index)) {
    multiSelected.delete(index);
    activeListItems[index].el.classList.remove('multi-selected');
  } else {
    multiSelected.add(index);
    activeListItems[index].el.classList.add('multi-selected');
  }
  updateCapacityDisplay();
}

function getSelectedText() {
  if (multiSelected.size > 0) {
    const indices = Array.from(multiSelected).sort((a, b) => a - b);
    return indices.map((i) => activeListItems[i].data.text).join(' ');
  }
  if (focusedIndex >= 0 && focusedIndex < activeListItems.length) {
    return activeListItems[focusedIndex].data.text;
  }
  return '';
}

function getSelectedReference() {
  if (multiSelected.size > 0) {
    const indices = Array.from(multiSelected).sort((a, b) => a - b);
    const first = activeListItems[indices[0]].data;
    const last = activeListItems[indices[indices.length - 1]].data;
    if (first.abbrev === last.abbrev && first.chapter === last.chapter) {
      return first.abbrev + ' ' + first.chapter + ':' + first.verse + '-' + last.verse;
    }
    return indices.map((i) => {
      const d = activeListItems[i].data;
      return d.abbrev + ' ' + d.chapter + ':' + d.verse;
    }).join('; ');
  }
  if (focusedIndex >= 0 && focusedIndex < activeListItems.length) {
    const d = activeListItems[focusedIndex].data;
    return d.abbrev + ' ' + d.chapter + ':' + d.verse;
  }
  return '';
}

function displayCurrentSelection() {
  const text = getSelectedText();
  const ref = getSelectedReference();
  if (!text) return;

  preview.textContent = ref + ' — ' + text;
  biblian.displayVerse({ reference: ref, text: text });
  updateCapacityDisplay();

  // Mark the displayed items as 'selected' visually
  activeListItems.forEach((item) => item.el.classList.remove('selected'));
  if (multiSelected.size > 0) {
    multiSelected.forEach((i) => activeListItems[i].el.classList.add('selected'));
  } else if (focusedIndex >= 0) {
    activeListItems[focusedIndex].el.classList.add('selected');
  }
}

// --- Book list ---

function renderBookList() {
  bookList.innerHTML = '';
  bibleData.books.forEach((book, i) => {
    const li = document.createElement('li');
    li.textContent = book.name;
    li.addEventListener('click', () => selectBook(i));
    bookList.appendChild(li);
  });
}

function selectBook(index) {
  selectedBookIndex = index;
  selectedChapter = -1;
  const book = bibleData.books[index];

  bookList.querySelectorAll('li').forEach((li, i) =>
    li.classList.toggle('active', i === index)
  );

  hideAllPanels();
  chapterNav.style.display = 'block';
  currentBookTitle.textContent = book.name;
  chapterButtons.innerHTML = '';

  book.chapters.forEach((ch) => {
    const btn = document.createElement('button');
    btn.textContent = ch.chapter;
    btn.addEventListener('click', () => selectChapter(index, ch.chapter));
    chapterButtons.appendChild(btn);
  });
}

// --- Chapter & verse navigation ---

function selectChapter(bookIndex, chapterNum) {
  selectedChapter = chapterNum;
  const book = bibleData.books[bookIndex];
  const chapter = book.chapters.find((c) => c.chapter === chapterNum);
  if (!chapter) return;

  chapterButtons.querySelectorAll('button').forEach((btn) => {
    btn.classList.toggle('active', parseInt(btn.textContent) === chapterNum);
  });

  versePanel.style.display = 'block';
  versePanelTitle.textContent = book.name + ' ' + chapterNum;
  verseList.innerHTML = '';
  activeListItems = [];
  focusedIndex = -1;
  multiSelected.clear();

  chapter.verses.forEach((v) => {
    const div = document.createElement('div');
    div.className = 'verse-item';
    div.innerHTML =
      '<span class="verse-num">' + v.verse + '</span>' +
      '<span class="verse-text-content">' + escapeHtml(v.text) + '</span>';

    const data = {
      book: book.name,
      abbrev: book.abbrev,
      chapter: chapterNum,
      verse: v.verse,
      text: v.text,
    };

    const itemIndex = activeListItems.length;
    div.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        setFocus(itemIndex);
        toggleMultiSelect(itemIndex);
      } else {
        clearMultiSelect();
        setFocus(itemIndex);
        displayCurrentSelection();
      }
    });

    activeListItems.push({ el: div, data: data });
    verseList.appendChild(div);
  });

  updateCapacityDisplay();
}

// --- Search ---

let searchTimeout = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const query = searchInput.value.trim();

  if (query.length < 2) {
    searchResults.style.display = 'none';
    if (selectedBookIndex >= 0) {
      chapterNav.style.display = 'block';
      if (selectedChapter >= 0) {
        versePanel.style.display = 'block';
      }
    }
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
  hideAllPanels();
  searchResults.style.display = 'block';
  resultsList.innerHTML = '';
  activeListItems = [];
  focusedIndex = -1;
  multiSelected.clear();

  if (results.length === 0) {
    const li = document.createElement('li');
    li.style.color = '#666';
    li.style.padding = '12px';
    li.textContent = 'Einki funnið';
    resultsList.appendChild(li);
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

    const itemIndex = activeListItems.length;
    li.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        setFocus(itemIndex);
        toggleMultiSelect(itemIndex);
      } else {
        clearMultiSelect();
        setFocus(itemIndex);
        displayCurrentSelection();
      }
    });

    activeListItems.push({ el: li, data: data });
    resultsList.appendChild(li);
  });

  // Auto-focus first result
  if (activeListItems.length > 0) {
    setFocus(0);
    updateCapacityDisplay();
  }
}

function hideAllPanels() {
  chapterNav.style.display = 'none';
  searchResults.style.display = 'none';
  versePanel.style.display = 'none';
}

// --- Style controls ---

fontSizeSlider.addEventListener('input', () => {
  maxFontSize = parseInt(fontSizeSlider.value);
  fontSizeVal.textContent = fontSizeSlider.value + 'px';
  biblian.updateStyle({ fontSize: fontSizeSlider.value + 'px' });
  updateCapacityDisplay();
});

bgColorPicker.addEventListener('input', () => {
  biblian.updateStyle({ backgroundColor: bgColorPicker.value });
});

textColorPicker.addEventListener('input', () => {
  biblian.updateStyle({ color: textColorPicker.value });
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
  preview.textContent = 'Einki valt';
  clearMultiSelect();
  activeListItems.forEach((item) => item.el.classList.remove('selected'));
  updateCapacityDisplay();
});

// --- Keyboard shortcuts ---

document.addEventListener('keydown', (e) => {
  // Focus search
  if (
    (e.ctrlKey && e.key === 'f') ||
    (e.key === '/' && document.activeElement !== searchInput)
  ) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }

  // Escape: clear search
  if (e.key === 'Escape') {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
    searchInput.blur();
    clearMultiSelect();
    return;
  }

  // Fullscreen
  if (e.key === 'F11') {
    e.preventDefault();
    biblian.toggleFullscreen();
    return;
  }

  // Arrow key navigation in active list
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (activeListItems.length === 0) return;
    e.preventDefault();

    let newIndex;
    if (e.key === 'ArrowDown') {
      newIndex = focusedIndex < activeListItems.length - 1 ? focusedIndex + 1 : 0;
    } else {
      newIndex = focusedIndex > 0 ? focusedIndex - 1 : activeListItems.length - 1;
    }

    if (e.ctrlKey || e.metaKey) {
      // Ctrl+Arrow: move focus and toggle multi-select on new item
      setFocus(newIndex);
      toggleMultiSelect(newIndex);
    } else if (e.shiftKey) {
      // Shift+Arrow: extend selection
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
    if (activeListItems.length === 0) return;
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      // Ctrl+Enter: toggle multi-select on focused item
      if (focusedIndex >= 0) {
        toggleMultiSelect(focusedIndex);
      }
    } else {
      // Enter: display focused item or all multi-selected
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

renderBookList();
loadScreens();
initDisplaySize();
