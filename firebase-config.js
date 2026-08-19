/* ============================================================
   firebase-config.js
   Firebase init + the window.firebase* compatibility shims app.js and
   every tool iframe use to talk to Firestore.

   Extracted out of an inline <script> in index.html's <head> (Aug 2026,
   perf fix) so it can be loaded with `defer` alongside the Firebase SDK
   scripts, data-store.js, and app.js. An inline script can't be
   deferred - it always runs immediately at its position in the
   document, blocking HTML parsing right there - so as long as this
   lived inline, none of the four <script src> tags around it could be
   deferred either without breaking initialization order (a deferred
   Firebase SDK script wouldn't have run yet by the time a non-deferred
   inline script tried to call firebase.initializeApp()). As its own
   `defer`red file, it now executes in the same relative order as
   before (after the 3 Firebase SDK scripts, before data-store.js and
   app.js - see index.html's <head>), it just no longer blocks the
   browser from parsing/painting the rest of the page while all of this
   downloads first.
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyDszpFkygCjr8ktkPe0ILxbLNHxRkb0bIY",
  authDomain: "revitalhub-895c1.firebaseapp.com",
  projectId: "revitalhub-895c1",
  storageBucket: "revitalhub-895c1.firebasestorage.app",
  messagingSenderId: "501330884945",
  appId: "1:501330884945:web:7f94e80c49036d9f2b3b70",
  measurementId: "G-8SLZMJG18S"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Map compat functions to window for app.js to use synchronously
window.firebaseDb = db;
// options is only forwarded when actually provided - passing an
// explicit `undefined` as the 2nd arg to the real Firestore .set()
// is NOT the same as omitting it (the SDK validates whatever is in
// that argument slot), so every existing 2-argument call across the
// Hub must still resolve to the plain docRef.set(data) form.
window.firebaseSetDoc = function(docRef, data, options) {
  return options !== undefined ? docRef.set(data, options) : docRef.set(data);
};
// Tool iframes (Client Portal Manager, SOP Wiki, etc.) run in their own
// browsing context with their own separate Object/JSON/Array globals.
// An object literal built inside an iframe and handed straight to
// firebaseSetDoc above gets rejected by the Firestore SDK ("a custom
// Object object") because it doesn't recognize a plain object from a
// different JS realm as one of its own - even though it looks
// identical. Passing a JSON string instead and parsing it here, in the
// parent's own realm, produces a plain object native to this page that
// Firestore accepts normally. Iframes needing to write cross-boundary
// objects should use this instead of firebaseSetDoc directly.
window.firebaseSetDocFromJSON = function(docRef, jsonString) {
  return docRef.set(JSON.parse(jsonString));
};
window.firebaseDoc = function(db, collectionPath, docPath) { return db.collection(collectionPath).doc(docPath); };
window.firebaseOnSnapshot = function(docRef, callback, errorCallback) { return docRef.onSnapshot(callback, errorCallback); };
window.firebaseGetDoc = function(docRef) { return docRef.get(); };
// Subcollection helpers (Aug 2026 storage-scaling work) - everything
// above this predates any tool storing one-document-per-record;
// every existing agency/* doc packs a growing list into a single
// document instead. New tools that need per-record documents (so a
// growing collection never risks Firestore's ~1MB single-document
// limit the way clientsDb once did - see data-loss-prevention-plan.md)
// should use these instead of the list-in-one-doc pattern.
window.firebaseCollection = function(db, ...pathSegments) { return db.collection(pathSegments.join('/')); };
// Returns a plain array of {id, ...data()} objects rather than the
// raw QuerySnapshot - every caller just wants the records, and this
// keeps the shape consistent with the {list: [...]} arrays every
// other agency doc already hands back, so existing render logic
// barely has to change when a tool migrates to this pattern.
window.firebaseGetDocs = function(collectionRef) {
  return collectionRef.get().then(snap => snap.docs.map(d => Object.assign({ id: d.id }, d.data())));
};
window.firebaseDeleteDoc = function(docRef) { return docRef.delete(); };
