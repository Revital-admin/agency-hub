/* ============================================================
   SHARED NUMBER FORMATTING HELPER
   Adds live thousands-separator commas (50000 -> 50,000) to money
   inputs across the Hub. Shared here (same pattern as
   shared-dropzone.js) so the formatting/parsing logic lives in one
   place instead of being copy-pasted per tool.

   Browsers refuse to let a comma be typed into a real
   <input type="number"> field, so any field this is attached to needs
   to be type="text" inputmode="decimal" instead - that keeps the
   numeric keyboard on mobile without the native number-input
   restriction. The underlying value is always parseable back to a
   clean number via parseFormattedNumber() below; anywhere currently
   doing parseInt(el.value)/parseFloat(el.value) on a field this is
   attached to needs to switch to parseFormattedNumber(el.value)
   instead, since parseInt("50,000") silently returns 50, not 50000.
   ============================================================ */

// Formats a raw number or in-progress-typing string into a
// comma-separated display string. Tolerant of partial input (a lone
// "-", a trailing ".", commas already present from a previous format
// pass) so it's safe to call on every keystroke.
function formatNumberWithCommas(rawValue) {
  if (rawValue === null || rawValue === undefined) return '';
  let str = String(rawValue).trim();
  if (str === '') return '';

  const negative = str.charAt(0) === '-';
  if (negative) str = str.slice(1);

  // Strip everything except digits and dots, then collapse to at most
  // one decimal point (typing a second "." is a no-op, not an error).
  str = str.replace(/[^0-9.]/g, '');
  const firstDot = str.indexOf('.');
  if (firstDot !== -1) {
    str = str.slice(0, firstDot + 1) + str.slice(firstDot + 1).replace(/\./g, '');
  }
  if (str === '' || str === '.') return negative ? '-' : '';

  let [intPart, decPart] = str.split('.');
  intPart = (intPart || '').replace(/^0+(?=\d)/, ''); // trim leading zeros, keep a lone "0"
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  let result = withCommas;
  if (decPart !== undefined) result += '.' + decPart.slice(0, 2); // cents-level precision is plenty for every field this attaches to
  return (negative ? '-' : '') + result;
}

// Strips commas and parses back to a clean number - use this anywhere
// a formatted field's .value is read, instead of parseInt/parseFloat.
// Always returns a number (0 for empty/invalid input, never NaN), same
// contract as the `parseInt(x) || 0` pattern already used everywhere
// in this codebase.
function parseFormattedNumber(rawValue) {
  if (rawValue === null || rawValue === undefined) return 0;
  const cleaned = String(rawValue).replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// Sets a formatted field's value from a plain number - use this
// instead of `el.value = someNumber` when populating a comma-formatted
// field from saved/loaded state, since a direct assignment doesn't
// fire the 'input' event this relies on for live formatting.
function setFormattedValue(inputEl, rawNumber) {
  if (!inputEl) return;
  inputEl.value = (rawNumber === '' || rawNumber === null || rawNumber === undefined)
    ? ''
    : formatNumberWithCommas(rawNumber);
}

// Wires live comma formatting onto a text input. Call once per field,
// right after the field exists in the DOM (works fine on both static
// inputs and ones just inserted via innerHTML). Preserves cursor
// position across reformatting by tracking distance from the *end* of
// the string rather than the start - stable here since only digits/
// commas/one dot are ever inserted or removed by this function, so a
// user typing in the middle of "12,000" and turning it into "12,500"
// keeps their cursor sitting after the digit they just typed either way.
//
// opts.allowDecimal (default true): pass false for whole-dollar-only
// fields to strip any decimal point the moment it's typed.
// opts.onChange(rawNumber): optional callback fired after each
// reformat with the parsed numeric value, for callers that want to
// recalculate immediately rather than relying on their own separate
// 'input' listener also attached to the same field.
function attachCommaFormatting(inputEl, opts) {
  if (!inputEl) return;
  opts = opts || {};
  const allowDecimal = opts.allowDecimal !== false;

  function reformat() {
    const before = inputEl.value;
    const caretFromEnd = before.length - (inputEl.selectionEnd === null ? before.length : inputEl.selectionEnd);
    let formatted = formatNumberWithCommas(before);
    if (!allowDecimal) formatted = formatted.split('.')[0];
    if (formatted !== before) {
      inputEl.value = formatted;
      const newPos = Math.max(0, formatted.length - caretFromEnd);
      try { inputEl.setSelectionRange(newPos, newPos); } catch (e) { /* not all input states support this */ }
    }
    if (typeof opts.onChange === 'function') opts.onChange(parseFormattedNumber(inputEl.value));
  }

  inputEl.addEventListener('input', reformat);
  if (inputEl.value) reformat(); // format whatever's already there (e.g. a server-rendered default)
}

// Adds custom up/down increment buttons to a comma-formatted field.
// Native <input type="number"> spinner arrows aren't available once a
// field is switched to type="text" for comma formatting (see the file
// header above) - this rebuilds the same up/down convenience with
// buttons styled to match the Hub's theme (.number-spinner-wrap /
// .number-spinner-btn in style.css) instead of the browser's unstyled
// default.
//
// Wraps inputEl in a positioning div and appends the two buttons -
// call once per field, same as attachCommaFormatting (and typically
// paired with it). Safe to call on a field that's about to be thrown
// away and re-created by a full innerHTML re-render (e.g. a table row
// rebuilt on every edit) since nothing here persists outside the DOM
// node itself - just call it again on the fresh element next render.
//
// opts.step (default 1): amount added/subtracted per click. Pass the
// field's old native `step` attribute value here to preserve whatever
// increment made sense before the field switched off type="number".
// opts.min (default 0), opts.max (default none).
function attachSpinnerButtons(inputEl, opts) {
  if (!inputEl || !inputEl.parentNode) return;
  opts = opts || {};
  const step = typeof opts.step === 'number' && !isNaN(opts.step) ? opts.step : 1;
  const min = typeof opts.min === 'number' && !isNaN(opts.min) ? opts.min : 0;
  const max = typeof opts.max === 'number' && !isNaN(opts.max) ? opts.max : Infinity;

  const wrap = document.createElement('div');
  wrap.className = 'number-spinner-wrap';

  // Carry over any inline flex/width sizing so the wrapper - not the
  // now-nested input - participates correctly in whatever flex row
  // layout the input used to sit in directly (e.g. a "Price ($)" field
  // with an inline flex:1 next to another field in the same row).
  ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'width'].forEach(function (prop) {
    if (inputEl.style[prop]) {
      wrap.style[prop] = inputEl.style[prop];
      inputEl.style[prop] = '';
    }
  });

  inputEl.parentNode.insertBefore(wrap, inputEl);
  wrap.appendChild(inputEl);

  const btns = document.createElement('div');
  btns.className = 'number-spinner-btns';

  function step_(dir) {
    const current = parseFormattedNumber(inputEl.value);
    let next = current + (dir === 'up' ? step : -step);
    if (next < min) next = min;
    if (next > max) next = max;
    setFormattedValue(inputEl, next);
    // Both events, since some fields recalc on 'input' (most calculators)
    // and others only on 'change' (e.g. Service Pricing Admin's table
    // rows) - dispatching both means either listener style picks this up.
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function makeBtn(dir) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'number-spinner-btn';
    btn.setAttribute('aria-label', dir === 'up' ? 'Increase' : 'Decrease');
    btn.tabIndex = -1; // keyboard flow stays on the input itself, not these
    btn.innerHTML = dir === 'up'
      ? '<svg viewBox="0 0 10 6" fill="currentColor"><polygon points="5,0 10,6 0,6"></polygon></svg>'
      : '<svg viewBox="0 0 10 6" fill="currentColor"><polygon points="0,0 10,0 5,6"></polygon></svg>';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      step_(dir);
    });
    return btn;
  }

  btns.appendChild(makeBtn('up'));
  btns.appendChild(makeBtn('down'));
  wrap.appendChild(btns);
}
