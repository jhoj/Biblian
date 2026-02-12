const display = document.getElementById('display');
const referenceEl = document.getElementById('reference');
const verseTextEl = document.getElementById('verse-text');

biblian.onShowVerse((data) => {
  // Fade out, then update and fade in
  display.classList.remove('fade-in');
  display.classList.add('fade-out');

  setTimeout(() => {
    referenceEl.textContent = data.reference;
    verseTextEl.textContent = data.text;
    display.classList.remove('fade-out');
    display.classList.add('fade-in');
  }, 300);
});

biblian.onClear(() => {
  display.classList.remove('fade-in');
  display.classList.add('fade-out');

  setTimeout(() => {
    referenceEl.textContent = '';
    verseTextEl.textContent = '';
    display.classList.remove('fade-out');
  }, 300);
});

biblian.onUpdateStyle((style) => {
  if (style.fontSize) {
    verseTextEl.style.fontSize = style.fontSize;
  }
  if (style.backgroundColor) {
    display.style.backgroundColor = style.backgroundColor;
  }
  if (style.color) {
    display.style.color = style.color;
    referenceEl.style.color = style.color;
  }
});
