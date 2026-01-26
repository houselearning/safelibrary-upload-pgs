// ===============================
// Firestore Helpers
// ===============================

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

// Create a new site
async function createSite(uid, name) {
  const userRef = db.collection("users").doc(uid);

  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new Error("User doc missing");

    const data = userSnap.data();
    if ((data.siteCount || 0) >= 5) {
      throw new Error("Site limit reached");
    }

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

// ===============================
// Deployment via Apps Script Backend
// ===============================

const DEPLOY_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbzQU6jIE9gQ008Z-5uMkxUvpEQAMg7tGsXGEQgUh3lR8OBzM-pOJ9qfxwiPRy40j9NE/exec";

// Trigger deployment
async function dispatchDeploy(uid, siteId, files) {
  const idToken = await auth.currentUser.getIdToken();

  const res = await fetch(DEPLOY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idToken,
      uid,
      siteId,
      files,
    }),
  });

  const data = await res.json();

  if (!data.success) {
    throw new Error(data.error || "Deployment failed");
  }

  return true;
}
