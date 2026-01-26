// api.js (only the dispatchDeploy and helper shown; keep your other Firestore helpers)
const DEPLOY_ENDPOINT = "https://script.google.com/macros/s/AKfycbx09yF4Sb41VFexpIa2_yIEyJk_jce4fPShHv0bdB65VCwxctx_1nOWWe90IqJg8qU/exec";
// api.js — add near the top (after firebase-init.js is loaded)
async function ensureUserDoc(user) {
  if (!user || !user.uid) {
    console.warn('ensureUserDoc called without user');
    return null;
  }

  try {
    const ref = firebase.firestore().collection('users').doc(user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      const data = {
        email: user.email || null,
        displayName: user.displayName || null,
        siteCount: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await ref.set(data);
      return ref;
    }
    return ref;
  } catch (err) {
    console.error('ensureUserDoc error', err);
    throw err;
  }
}

// base64url encode
function base64UrlEncode(str) {
  const utf8 = unescape(encodeURIComponent(str));
  const b64 = btoa(utf8);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// dispatchDeploy: save files to Firestore then call Apps Script JSONP with tiny payload
async function dispatchDeploy(uid, siteId, files) {
  if (!auth.currentUser) throw new Error("Not authenticated");
  if (!uid || !siteId) throw new Error("Missing uid or siteId");

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
