/* ============================================================
   shared/agency-tracker.js
   ============================================================
   Shared data-layer + form-CRUD scaffolding for the Hub's "agency-wide
   flat-list tracker" tools (Shot List Builder, Permit Tracker, Wrap
   Report, Release Forms Tracker, Call Sheet Builder). Each of these was
   built by copy-pasting the same ~80 lines of load/persist/uid/datalist/
   form-CRUD plumbing into a new file and swapping field names - which
   meant a fix to that shared skeleton (e.g. the optimistic-concurrency
   version guard in persist()) had to be hand-applied in five places.
   This module is that skeleton, extracted once, following the same
   "pull the identical part into shared/, leave the file-specific part
   alone" approach already used for shared/pdf-report.js.

   What's intentionally NOT here: renderTable()/renderSummary() and any
   other on-screen rendering. Every one of these tools displays its data
   completely differently (different columns, different "needs
   attention" logic, Permit Tracker's isExpiringSoon flag, Shot List's
   PDF export) - generalizing that would make the abstraction worse than
   the duplication it replaces. Each tool still owns 100% of its own
   rendering; this only owns the boring, identical-everywhere plumbing
   underneath it: talking to Firestore, the uid() format, the client
   datalist, and the add/edit/remove form lifecycle.

   Usage (see shot-list-builder/js/app.js for the full worked example
   this was extracted from):

     const tracker = AgencyTracker.create({
       docName: 'shotList',              // Firestore doc: agency/<docName>
       localStorageKey: 'shot-list-builder-list',
       idPrefix: 'sh',                   // uid() -> "sh-<timestamp>-<rand>"
       formFields: ['clientName', 'projectTitle', 'shotNumber', ...],
       saveButtonId: 'saveEntryBtn',
       addLabel: 'Add Shot',
       updateLabel: 'Update Shot',
     });

     document.addEventListener('DOMContentLoaded', async () => {
       tracker.populateClientDatalist('clientOptions');
       tracker.resetForm();
       await tracker.loadEntries();
       renderTable();                    // tool's own - reads tracker.entries

       el('saveEntryBtn').addEventListener('click', () => {
         tracker.saveEntry({
           validate: () => {
             if (!el('clientName').value.trim()) return 'Client name is required.';
             if (!el('shotDescription').value.trim()) return 'Shot description is required.';
           },
           onSuccess: (entry) => {
             tracker.populateClientDatalist('clientOptions');
             renderTable();
             if (window.parent.showBanner) window.parent.showBanner('success', `Added shot for ${entry.clientName}.`);
           },
         });
       });

       el('filterClientInput').addEventListener('input', renderTable);
       tracker.pollForClients('clientOptions');
     });

     // elsewhere, in a row's Edit/Remove buttons:
     tracker.startEdit(id);
     tracker.removeEntry(id, {
       confirmMessage: (entry) => `Remove shot ${entry.shotNumber} — ${entry.shotDescription}?`,
       onSuccess: renderTable,
     });

   `tracker.entries` is the live array - read it directly from your own
   renderTable()/renderSummary(), exactly like the old inline `entries`
   variable each tool used to declare for itself.
   ============================================================ */
(function (global) {
  const SANDBOX_NAME = "Quick Sandbox (One-Offs)";

  // How long a Remove has to be undone before it's actually persisted.
  const UNDO_WINDOW_MS = 6000;

  // Self-contained floating toast - builds its own DOM/styles on demand,
  // so adding the undo safety net didn't require touching any of the five
  // tools' own index.html/CSS. Resolves true if the user clicked Undo
  // before the window closed, false if it just timed out.
  function showUndoToast(win, message) {
    return new Promise((resolve) => {
      const doc = win.document;
      let wrap = doc.getElementById('agencyTrackerUndoToast');
      if (!wrap) {
        wrap = doc.createElement('div');
        wrap.id = 'agencyTrackerUndoToast';
        wrap.style.cssText = 'position:fixed; bottom:24px; right:24px; z-index:9999; display:flex; flex-direction:column; gap:8px; align-items:flex-end; pointer-events:none;';
        doc.body.appendChild(wrap);
      }

      const toast = doc.createElement('div');
      toast.style.cssText = 'pointer-events:auto; background:#201d17; border:1px solid rgba(255,255,255,0.12); color:#f5f1e8; font-family:"DM Sans",-apple-system,sans-serif; font-size:13px; padding:10px 14px; border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,0.4); display:flex; align-items:center; gap:14px; min-width:220px; animation:none;';

      const msgSpan = doc.createElement('span');
      msgSpan.textContent = message;
      msgSpan.style.cssText = 'flex:1;';

      const undoBtn = doc.createElement('button');
      undoBtn.textContent = 'Undo';
      undoBtn.type = 'button';
      undoBtn.style.cssText = 'background:none; border:none; color:#f68d5f; font-weight:700; font-size:13px; cursor:pointer; padding:0; font-family:inherit;';

      toast.appendChild(msgSpan);
      toast.appendChild(undoBtn);
      wrap.appendChild(toast);

      let done = false;
      const finish = (undone) => {
        if (done) return;
        done = true;
        toast.remove();
        resolve(undone);
      };

      const timer = win.setTimeout(() => finish(false), UNDO_WINDOW_MS);
      undoBtn.addEventListener('click', () => { win.clearTimeout(timer); finish(true); });
    });
  }

  function create(opts) {
    opts = opts || {};
    const docName = opts.docName;
    const localStorageKey = opts.localStorageKey;
    const idPrefix = opts.idPrefix;
    const formFields = opts.formFields || [];
    const saveButtonId = opts.saveButtonId;
    const addLabel = opts.addLabel || 'Add';
    const updateLabel = opts.updateLabel || 'Update';

    if (!docName || !localStorageKey || !idPrefix) {
      throw new Error('AgencyTracker.create requires docName, localStorageKey, and idPrefix.');
    }

    function el(id) { return document.getElementById(id); }

    let isEmbedded = false;
    try {
      if (global.parent && typeof global.parent.firebaseDb === 'object') {
        isEmbedded = true;
      }
    } catch (e) {
      console.warn(`AgencyTracker(${docName}): CORS prevented parent access:`, e);
    }

    const state = {
      entries: [],
      editingId: null,
      docVersion: 0, // optimistic-concurrency guard, see persist() below
    };

    function getDocRef() {
      if (!isEmbedded || !global.parent.firebaseDoc || !global.parent.firebaseDb) return null;
      return global.parent.firebaseDoc(global.parent.firebaseDb, "agency", docName);
    }

    async function loadEntries() {
      if (isEmbedded && global.parent.firebaseGetDoc) {
        try {
          const ref = getDocRef();
          const snap = await global.parent.firebaseGetDoc(ref);
          const data = snap && snap.exists ? snap.data() : null;
          state.entries = (data && data.list) || [];
          state.docVersion = (data && data.version) || 0;
          return;
        } catch (e) {
          console.error(`AgencyTracker(${docName}): couldn't load from the cloud:`, e);
          if (global.parent.showBanner) global.parent.showBanner('error', "Couldn't load: " + e.message);
          state.entries = [];
          return;
        }
      }
      try {
        const saved = localStorage.getItem(localStorageKey);
        state.entries = saved ? JSON.parse(saved) : [];
      } catch (e) { state.entries = []; }
    }

    // Optimistic-concurrency guard, same pattern every one of these
    // trackers used inline: re-check the doc's version right before
    // writing and refuse to clobber a newer save made elsewhere meanwhile.
    async function persist() {
      if (isEmbedded && global.parent.saveVersionedAgencyDoc) {
        const result = await global.parent.saveVersionedAgencyDoc({
          docRef: getDocRef(),
          currentVersion: state.docVersion,
          buildPayload: (v) => ({ list: state.entries, version: v }),
        });
        if (!result.ok) {
          if (result.reason === 'error') console.error(`AgencyTracker(${docName}): couldn't save:`, result.error);
          if (global.parent.showBanner) {
            global.parent.showBanner('error', result.reason === 'conflict'
              ? "Someone else updated this list while you had it open. Reload the page to see their changes, then redo your edit."
              : "Couldn't save — your change may be lost: " + result.error.message);
          }
          return false;
        }
        state.docVersion = result.version;
        return true;
      }
      try { localStorage.setItem(localStorageKey, JSON.stringify(state.entries)); } catch (e) {}
      return true;
    }

    function uid() { return idPrefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); }

    function getClients() {
      if (isEmbedded && typeof global.parent.getAllClients === 'function') {
        try { return global.parent.getAllClients() || {}; } catch (e) { return {}; }
      }
      return {};
    }

    function populateClientDatalist(datalistId) {
      const list = el(datalistId);
      if (!list) return;
      const clients = getClients();
      list.innerHTML = Object.keys(clients).filter(name => name !== SANDBOX_NAME).sort().map(name => `<option value="${name}">`).join('');
    }

    // Client list often isn't loaded yet the instant a tool's iframe boots
    // (it comes from the parent Hub asynchronously) - poll briefly rather
    // than leaving the datalist empty until the next unrelated re-render.
    function pollForClients(datalistId, maxAttempts) {
      let pollAttempts = 0;
      const limit = maxAttempts || 30;
      const pollTimer = setInterval(() => {
        pollAttempts++;
        if (Object.keys(getClients()).length > 0) {
          populateClientDatalist(datalistId);
          clearInterval(pollTimer);
        } else if (pollAttempts >= limit) {
          clearInterval(pollTimer);
        }
      }, 250);
      return pollTimer;
    }

    function resetForm() {
      state.editingId = null;
      formFields.forEach(id => {
        const field = el(id);
        if (!field) return;
        if (field.tagName === 'SELECT') field.value = field.options[0].value;
        else field.value = '';
      });
      const btn = el(saveButtonId);
      if (btn) btn.textContent = addLabel;
    }

    function gatherForm() {
      const entry = { id: state.editingId || uid() };
      formFields.forEach(id => {
        const field = el(id);
        entry[id] = field ? field.value.trim() : '';
      });
      return entry;
    }

    function startEdit(id) {
      const entry = state.entries.find(e => e.id === id);
      if (!entry) return null;
      state.editingId = id;
      formFields.forEach(fieldId => {
        const field = el(fieldId);
        if (field) field.value = entry[fieldId] || '';
      });
      const btn = el(saveButtonId);
      if (btn) btn.textContent = updateLabel;
      global.scrollTo({ top: 0, behavior: 'smooth' });
      return entry;
    }

    // `validate()` runs first and returns an error string (or nothing) -
    // matches every tool's existing "clientName + one other field
    // required" check, shown via showBanner exactly like before. The
    // mutate-then-persist-then-roll-back-on-failure shape is the same
    // two-phase pattern every tool already hand-wrote inline.
    async function saveEntry(cfg) {
      cfg = cfg || {};
      if (cfg.validate) {
        const error = cfg.validate();
        if (error) {
          if (global.parent && global.parent.showBanner) global.parent.showBanner('error', error);
          return false;
        }
      }

      const entry = gatherForm();
      const previous = state.entries.slice();
      if (state.editingId) {
        const idx = state.entries.findIndex(e => e.id === state.editingId);
        if (idx >= 0) state.entries[idx] = entry;
      } else {
        state.entries.unshift(entry);
      }

      const ok = await persist();
      if (!ok) {
        state.entries = previous; // roll back so the failed save doesn't linger in memory as if it stuck
        if (cfg.onFailure) cfg.onFailure(entry);
        return false;
      }
      resetForm();
      if (cfg.onSuccess) cfg.onSuccess(entry);
      return true;
    }

    // Remove used to be instant and permanent the moment you clicked past
    // the confirm() dialog - no trash, no version history, nothing to
    // recover from if it was the wrong row. confirm() still asks "are you
    // sure" up front; this adds the other half - a few seconds afterward
    // to catch "confirmed correctly, then realized it was wrong."
    // cfg.onSuccess (every tool already passes `() => renderTable()`) is
    // reused as the re-render callback for both the optimistic removal AND
    // a restore, so no call-site changes were needed in any of the five
    // tools when this was added - they already re-render off tracker.entries.
    async function removeEntry(id, cfg) {
      cfg = cfg || {};
      const entry = state.entries.find(e => e.id === id);
      if (!entry) return false;
      if (cfg.confirmMessage && !confirm(cfg.confirmMessage(entry))) return false;

      const originalIndex = state.entries.indexOf(entry);
      state.entries = state.entries.filter(e => e.id !== id);
      if (state.editingId === id) resetForm();
      if (cfg.onSuccess) cfg.onSuccess(entry); // optimistic re-render with the row gone

      const undone = await showUndoToast(global, cfg.undoMessage ? cfg.undoMessage(entry) : 'Entry removed.');
      if (undone) {
        state.entries.splice(originalIndex, 0, entry); // put it back where it was
        if (cfg.onSuccess) cfg.onSuccess(entry); // re-render with the row restored
        // In case something else saved to Firestore while the undo window
        // was open (e.g. an edit to a different row), make sure the
        // restored row actually makes it back into that saved state too,
        // not just the in-memory array.
        await persist();
        return false;
      }

      const ok = await persist();
      if (!ok) {
        // Persist failed after the undo window closed - put the row back
        // so the failed delete doesn't silently stick as if it succeeded.
        state.entries.splice(originalIndex, 0, entry);
        if (cfg.onSuccess) cfg.onSuccess(entry);
        return false;
      }
      return true;
    }

    return {
      get isEmbedded() { return isEmbedded; },
      get entries() { return state.entries; },
      set entries(v) { state.entries = v; },
      get editingId() { return state.editingId; },
      uid: uid,
      getClients: getClients,
      populateClientDatalist: populateClientDatalist,
      pollForClients: pollForClients,
      loadEntries: loadEntries,
      persist: persist,
      resetForm: resetForm,
      gatherForm: gatherForm,
      startEdit: startEdit,
      saveEntry: saveEntry,
      removeEntry: removeEntry,
    };
  }

  global.AgencyTracker = { create: create };
})(window);
