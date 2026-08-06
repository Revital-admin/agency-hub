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
