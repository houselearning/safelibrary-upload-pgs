// api.js - Firestore helpers + JSONP deploy helper
// Requires firebase-init.js (compat SDK) to be loaded first.
// Update DEPLOY_ENDPOINT with your Apps Script /exec URL.

const DEPLOY_ENDPOINT = "https://script.google.com/macros/s/AKfycbx09yF4Sb41VFexpIa2_yIEyJk_jce4fPShHv0bdB65VCwxctx_1nOWWe90IqJg8qU/exec";

/* -------------------------
   Utility: safe current user
   ------------------------- */
function getCurrentUser() {
  // Support either a global `auth` or firebase.auth()
  return (window.auth && window.auth.currentUser) || (firebase && firebase.auth && firebase.auth().currentUser) || null;
}
window.getCurrentUser = getCurrentUser;

/* -------------------------
   Firestore helpers
   ------------------------- */

/**
 * Ensure a user document exists under collection "users"
 * Returns the DocumentReference
 */
async function ensureUserDoc(user) {
  if (!user || !user.uid) {
    console.warn("ensureUserDoc called without user");
    return null;
  }
  try {
    const ref = firebase.firestore().collection("users").doc(user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      const data = {
        email: user.email || null,
        displayName: user.displayName || null,
        siteCount: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      await ref.set(data);
    }
    return ref;
  } catch (err) {
    console.error("ensureUserDoc error", err);
    throw err;
  }
}
window.ensureUserDoc = ensureUserDoc;

/**
 * Get all sites for a user.
 * Returns array of normalized site objects.
 */
async function getUserSites(uid) {
  if (!uid) throw new Error("getUserSites: missing uid");
  try {
    const q = await firebase
      .firestore()
      .collection("sites")
      .where("uid", "==", uid)
      .orderBy("createdAt", "asc")
      .get();

    return q.docs.map((d) => {
      const data = d.data() || {};
      return {
        siteId: data.siteId || (d.id && d.id.split("_")[1]) || null,
        name: data.name || data.slug || `site-${d.id}`,
        slug: data.slug || null,
        docId: d.id,
        ...data,
      };
    });
  } catch (err) {
    console.error("getUserSites error", err);
    throw err;
  }
}
window.getUserSites = getUserSites;

/**
 * Create a new site for a user.
 * Returns { siteId, siteDocId, slug }.
 */
async function createSite(uid, name) {
  if (!uid) throw new Error("createSite: missing uid");
  const slug =
    (name || "site")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "site";

  const siteId = firebase.firestore().collection("_").doc().id;
  const siteDocId = `${uid}_${siteId}`;

  try {
    await firebase.firestore().collection("sites").doc(siteDocId).set({
      uid,
      siteId,
      name,
      slug,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastDeployedAt: null,
    });
    // Optionally increment user's siteCount elsewhere
    return { siteId, siteDocId, slug };
  } catch (err) {
    console.error("createSite error", err);
    throw err;
  }
}
window.createSite = createSite;

/**
 * Save site files to Firestore under docId = `${uid}_${siteId}`
 * files: array of { path, content, contentType }
 */
async function saveSiteFiles(uid, siteId, files) {
  if (!uid || !siteId) throw new Error("saveSiteFiles: missing uid or siteId");
  try {
    const docId = `${uid}_${siteId}`;
    const ref = firebase.firestore().collection("siteFiles").doc(docId);
    await ref.set(
      {
        uid,
        siteId,
        files,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.error("saveSiteFiles error", err);
    throw err;
  }
}
window.saveSiteFiles = saveSiteFiles;

/**
 * Read site files from Firestore doc
 */
async function getSiteFiles(uid, siteId) {
  if (!uid || !siteId) return [];
  try {
    const docId = `${uid}_${siteId}`;
    const snap = await firebase.firestore().collection("siteFiles").doc(docId).get();
    if (!snap.exists) return [];
    const data = snap.data() || {};
    return data.files || [];
  } catch (err) {
    console.error("getSiteFiles error", err);
    throw err;
  }
}
window.getSiteFiles = getSiteFiles;

/* -------------------------
   JSONP deploy helper
   ------------------------- */

/**
 * base64url encode (UTF-8 safe)
 */
function base64UrlEncode(str) {
  const utf8 = unescape(encodeURIComponent(str));
  const b64 = btoa(utf8);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * dispatchDeploy:
 * 1) saves files to Firestore (so Apps Script can read them server-side)
 * 2) sends a tiny JSONP GET to DEPLOY_ENDPOINT with { idToken, uid, siteId }
 *
 * Note: DEPLOY_ENDPOINT must be your Apps Script /exec URL.
 */
async function dispatchDeploy(uid, siteId, files) {
  const currentUser = getCurrentUser();
  if (!currentUser) throw new Error("Not authenticated");
  if (!uid || !siteId) throw new Error("Missing uid or siteId");

  // 1) Save files to Firestore
  await saveSiteFiles(uid, siteId, files);

  // 2) Build tiny payload and call JSONP endpoint
  const idToken = await currentUser.getIdToken();
  const payloadObj = { idToken, uid, siteId };
  const json = JSON.stringify(payloadObj);
  const encoded = base64UrlEncode(json);

  return new Promise((resolve, reject) => {
    const callbackName = "hlp_cb_" + Math.random().toString(36).slice(2);
    const url = `${DEPLOY_ENDPOINT}?callback=${callbackName}&payload=${encodeURIComponent(encoded)}`;

    const timeoutMs = 30000;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      cleanup();
      reject(new Error("Deploy timed out"));
    }, timeoutMs);

    // Define global callback
    window[callbackName] = function (result) {
      if (timedOut) return;
      clearTimeout(timeoutId);
      cleanup();
      if (result && result.success) resolve(result);
      else reject(new Error(result && result.error ? result.error : "Unknown deploy error"));
    };

    // Create script tag
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
      try {
        delete window[callbackName];
      } catch (e) {}
      const s = document.getElementById(callbackName);
      if (s) s.remove();
    }

    document.head.appendChild(script);
  });
}
window.dispatchDeploy = dispatchDeploy;

/* -------------------------
   End of api.js
   ------------------------- */
