// ===============================
// api.js - Firestore helpers + JSONP deploy (Apps Script JSONP endpoint)
// Drop this into public/js/api.js and update DEPLOY_ENDPOINT if needed.
// ===============================

// -------------------------------
// Configuration
// -------------------------------
const DEPLOY_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbyZeFj_fXBJAlF0Oa7wHqt8vpLTAkpLpw7WhRzNs4Ttx3df6ld0qhgnfVvVf8LIxQsN/exec";

// -------------------------------
// Firestore helpers
// -------------------------------

// Ensure user document exists
async function ensureUserDoc(user) {
  const ref = db.collection("users").doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      email: user.email || null,
      displayName: user.displayName || null,
      siteCount: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
  return ref;
}

// Fetch all sites for a user
async function getUserSites(uid) {
  const snap = await db
    .collection("sites")
    .where("uid", "==", uid)
    .orderBy("createdAt", "asc")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Create a new site (max 5 per user enforced in transaction)
async function createSite(uid, name) {
  const userRef = db.collection("users").doc(uid);
  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new Error("User doc missing");
    const data = userSnap.data();
    if ((data.siteCount || 0) >= 5) throw new Error("Site limit reached");

    const siteId = db.collection("_").doc().id;
    const siteDocId = `${uid}_${siteId}`;
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "site";

    const siteRef = db.collection("sites").doc(siteDocId);
    tx.set(siteRef, {
      uid,
      siteId,
      name,
      slug,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastDeployedAt: null,
    });

    tx.update(userRef, { siteCount: (data.siteCount || 0) + 1 });

    return { siteId, siteDocId, slug };
  });
}

// Get stored site files
async function getSiteFiles(uid, siteId) {
  const docId = `${uid}_${siteId}`;
  const ref = db.collection("siteFiles").doc(docId);
  const snap = await ref.get();
  if (!snap.exists) return [];
  return snap.data().files || [];
}

// Save site files
async function saveSiteFiles(uid, siteId, files) {
  const docId = `${uid}_${siteId}`;
  const ref = db.collection("siteFiles").doc(docId);
  await ref.set(
    {
      uid,
      siteId,
      files,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

// -------------------------------
// JSONP deploy helper
// -------------------------------
// Uses the Apps Script JSONP endpoint. Encodes payload as base64url and injects a <script> tag.
// Returns a Promise that resolves with the JSON result or rejects on error.

function base64UrlEncode(str) {
  // UTF-8 safe base64
  const utf8 = unescape(encodeURIComponent(str));
  const b64 = btoa(utf8);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// -------------------------------
// dispatchDeploy: save files then call JSONP endpoint with tiny payload
// -------------------------------
async function dispatchDeploy(uid, siteId, files) {
  if (!auth.currentUser) throw new Error("Not authenticated");

  // 1) Save files to Firestore so Apps Script can fetch them server-side
  await saveSiteFiles(uid, siteId, files);

  // 2) Build tiny payload (idToken, uid, siteId)
  const idToken = await auth.currentUser.getIdToken();
  const payloadObj = { idToken, uid, siteId };
  const json = JSON.stringify(payloadObj);
  const encoded = base64UrlEncode(json);

  // 3) JSONP call
  return new Promise((resolve, reject) => {
    const callbackName = "hlp_cb_" + Math.random().toString(36).slice(2);
    const url = `${DEPLOY_ENDPOINT}?callback=${callbackName}&payload=${encodeURIComponent(encoded)}`;

    // timeout
    const timeoutMs = 30000;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      cleanup();
      reject(new Error("Deploy timed out"));
    }, timeoutMs);

    // define callback
    window[callbackName] = function (result) {
      if (timedOut) return;
      clearTimeout(timeoutId);
      cleanup();
      if (result && result.success) resolve(result);
      else reject(new Error(result && result.error ? result.error : "Unknown deploy error"));
    };

    // create script tag
    const script = document.createElement("script");
    script.src = url;
    script.id = callbackName;
    script.onerror = function () {
      if (timedOut) return;
      clearTimeout(timeoutId);
      cleanup();
      reject(new Error("JSONP script load error"));
    };

    function cleanup() {
      try { delete window[callbackName]; } catch (e) {}
      const s = document.getElementById(callbackName);
      if (s) s.remove();
    }

    document.head.appendChild(script);
  });
}

// -------------------------------
// Exported for dashboard usage
// -------------------------------
// The dashboard code expects these functions to exist globally:
// ensureUserDoc, getUserSites, createSite, getSiteFiles, saveSiteFiles, dispatchDeploy
// They are defined above and available in this file.
