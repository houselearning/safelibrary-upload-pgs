// api.js — Firestore + deploy helpers
// Requires firebase-init.js to be loaded first

const DEPLOY_ENDPOINT = "https://script.google.com/macros/s/AKfycbzOTXm323qY2smxIKAEmiTL8YcyEo6gDnzlJZCZOunb5FPo83PSeVqED_09RkVjs6HN/exec";

/* -------------------------
   Auth helper
   ------------------------- */
function getCurrentUser() {
  return (window.auth && window.auth.currentUser) || (firebase && firebase.auth && firebase.auth().currentUser) || null;
}
window.getCurrentUser = getCurrentUser;

/* -------------------------
   Firestore helpers
   ------------------------- */

// Ensure user doc exists
async function ensureUserDoc(user) {
  if (!user || !user.uid) return null;
  const ref = firebase.firestore().collection("users").doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      email: user.email || null,
      displayName: user.displayName || null,
      siteCount: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
  return ref;
}
window.ensureUserDoc = ensureUserDoc;

// Get all sites for a user
async function getUserSites(uid) {
  if (!uid) throw new Error("getUserSites: missing uid");
  const q = await firebase.firestore()
    .collection("sites")
    .where("uid", "==", uid)
    .orderBy("createdAt", "asc")
    .get();
  return q.docs.map(d => {
    const data = d.data();
    return {
      siteId: data.siteId || (d.id.split("_")[1] || null),
      name: data.name || data.slug || `site-${d.id}`,
      slug: data.slug || null,
      docId: d.id,
      ...data
    };
  });
}
window.getUserSites = getUserSites;

// Create a new site
async function createSite(uid, name) {
  if (!uid) throw new Error("createSite: missing uid");
  const slug = (name || "site").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";
  const siteId = firebase.firestore().collection("_").doc().id;
  const docId = `${uid}_${siteId}`;
  await firebase.firestore().collection("sites").doc(docId).set({
    uid,
    siteId,
    name,
    slug,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return { siteId, docId, slug };
}
window.createSite = createSite;

// Save site files
async function saveSiteFiles(uid, siteId, files) {
  if (!uid || !siteId) throw new Error("saveSiteFiles: missing uid or siteId");
  const docId = `${uid}_${siteId}`;
  await firebase.firestore().collection("siteFiles").doc(docId).set({
    uid,
    siteId,
    files,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}
window.saveSiteFiles = saveSiteFiles;

// Get site files
async function getSiteFiles(uid, siteId) {
  if (!uid || !siteId) return [];
  const docId = `${uid}_${siteId}`;
  const snap = await firebase.firestore().collection("siteFiles").doc(docId).get();
  if (!snap.exists) return [];
  const data = snap.data();
  return data.files || [];
}
window.getSiteFiles = getSiteFiles;

/* -------------------------
   JSONP deploy helper
   ------------------------- */

// base64url encode
function base64UrlEncode(str) {
  const utf8 = unescape(encodeURIComponent(str));
  const b64 = btoa(utf8);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// dispatchDeploy: saves files then calls Apps Script JSONP
async function dispatchDeploy(uid, siteId, files) {
  const currentUser = getCurrentUser();
  if (!currentUser) throw new Error("Not authenticated");
  if (!uid || !siteId) throw new Error("Missing uid or siteId");

  // Save files first
  await saveSiteFiles(uid, siteId, files);

  // Build payload
  const idToken = await currentUser.getIdToken();
  const payloadObj = { idToken, uid, siteId };
  const json = JSON.stringify(payloadObj);
  const encoded = base64UrlEncode(json);

  // JSONP call
  return new Promise((resolve, reject) => {
    const callbackName = "hlp_cb_" + Math.random().toString(36).slice(2);
    const url = `${DEPLOY_ENDPOINT}?callback=${callbackName}&payload=${encodeURIComponent(encoded)}`;

    console.log("Dispatching deploy:", { url, payloadObj });

    const timeoutMs = 30000;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      cleanup();
      reject(new Error("Deploy timed out"));
    }, timeoutMs);

    window[callbackName] = function (result) {
      if (timedOut) return;
      clearTimeout(timeoutId);
      cleanup();
      if (result && result.success) resolve(result);
      else reject(new Error(result && result.error ? result.error : "Unknown deploy error"));
    };

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
window.dispatchDeploy = dispatchDeploy;
