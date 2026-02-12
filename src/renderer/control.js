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

let selectedBookIndex = -1;
let selectedChapter = -1;

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

  chapter.verses.forEach((v) => {
    const div = document.createElement('div');
    div.className = 'verse-item';
    div.innerHTML =
      '<span class="verse-num">' + v.verse + '</span>' +
      '<span class="verse-text">' + escapeHtml(v.text) + '</span>';
    div.addEventListener('click', () => {
      sendVerse(book.name, chapterNum, v.verse, v.text);
      verseList.querySelectorAll('.verse-item').forEach((el) =>
        el.classList.remove('selected')
      );
      div.classList.add('selected');
    });
    verseList.appendChild(div);
  });
}

function sendVerse(bookName, chapter, verse, text) {
  const ref = bookName + ' ' + chapter + ':' + verse;
  preview.textContent = ref + ' — ' + text;
  biblian.displayVerse({ reference: ref, text: text });
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
    li.addEventListener('click', () => {
      sendVerse(item.book, item.chapter, item.verse, item.text);
      resultsList.querySelectorAll('li').forEach((el) =>
        el.classList.remove('selected')
      );
      li.classList.add('selected');
    });
    resultsList.appendChild(li);
  });
}

function hideAllPanels() {
  chapterNav.style.display = 'none';
  searchResults.style.display = 'none';
  versePanel.style.display = 'none';
}

// --- Style controls ---

fontSizeSlider.addEventListener('input', () => {
  fontSizeVal.textContent = fontSizeSlider.value + 'px';
  biblian.updateStyle({ fontSize: fontSizeSlider.value + 'px' });
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
  verseList.querySelectorAll('.verse-item').forEach((el) =>
    el.classList.remove('selected')
  );
  resultsList.querySelectorAll('li').forEach((el) =>
    el.classList.remove('selected')
  );
});

// --- Keyboard shortcuts ---

document.addEventListener('keydown', (e) => {
  if (
    (e.ctrlKey && e.key === 'f') ||
    (e.key === '/' && document.activeElement !== searchInput)
  ) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
  if (e.key === 'Escape') {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
    searchInput.blur();
  }
  if (e.key === 'F11') {
    e.preventDefault();
    biblian.toggleFullscreen();
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
