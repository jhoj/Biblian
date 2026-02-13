const display = document.getElementById('display');
const referenceEl = document.getElementById('reference');
const verseTextEl = document.getElementById('verse-text');

let maxFontSize = 56; // default, updated by style controls

// Measure average character width ratio (avg char width / font size) using canvas
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

function calcCapacity(fontSize) {
  // Match CSS: padding 60px top/bottom, 80px left/right; verse max-width 90%
  const availableWidth = (window.innerWidth - 160) * 0.9;
  const availableHeight = window.innerHeight - 120;
  const charsPerLine = Math.floor(availableWidth / (fontSize * charWidthRatio));
  const lineHeight = fontSize * 1.4;
  const maxLines = Math.floor(availableHeight / lineHeight);
  return charsPerLine * maxLines;
}

function fitText() {
  const text = verseTextEl.textContent;
  if (!text) return;

  const minSize = 16;

  // If text fits at max size, use it
  if (calcCapacity(maxFontSize) >= text.length) {
    verseTextEl.style.fontSize = maxFontSize + 'px';
    return;
  }

  // Binary search for largest font size that fits
  let lo = minSize;
  let hi = maxFontSize;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (calcCapacity(mid) >= text.length) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  verseTextEl.style.fontSize = lo + 'px';
}

biblian.onShowVerse((data) => {
  display.classList.remove('fade-in');
  display.classList.add('fade-out');

  setTimeout(() => {
    referenceEl.textContent = data.reference;
    verseTextEl.textContent = data.text;
    fitText();
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
    maxFontSize = parseInt(style.fontSize);
    // Re-fit if there's text showing
    if (verseTextEl.textContent) {
      fitText();
    }
  }
  if (style.backgroundColor) {
    display.style.backgroundColor = style.backgroundColor;
  }
  if (style.color) {
    display.style.color = style.color;
    referenceEl.style.color = style.color;
  }
});

// Re-fit on window resize (e.g. moving to different screen)
window.addEventListener('resize', () => {
  if (verseTextEl.textContent) {
    fitText();
  }
});
