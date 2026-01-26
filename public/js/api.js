// Firestore collections:
// users/{uid}
// sites/{uid}_{siteId}
// siteFiles/{uid}_{siteId}

async function ensureUserDoc(user) {
  const ref = db.collection('users').doc(user.uid);
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

async function getUserSites(uid) {
  const snap = await db.collection('sites')
    .where('uid', '==', uid)
    .orderBy('createdAt', 'asc')
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function createSite(uid, name) {
  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new Error('User doc missing');
    const data = userSnap.data();
    if ((data.siteCount || 0) >= 5) {
      throw new Error('Site limit reached');
    }
    const siteId = db.collection('_').doc().id;
    const siteDocId = `${uid}_${siteId}`;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';

    const siteRef = db.collection('sites').doc(siteDocId);
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

async function getSiteFiles(uid, siteId) {
  const docId = `${uid}_${siteId}`;
  const ref = db.collection('siteFiles').doc(docId);
  const snap = await ref.get();
  if (!snap.exists) return [];
  return snap.data().files || [];
}

async function saveSiteFiles(uid, siteId, files) {
  const docId = `${uid}_${siteId}`;
  const ref = db.collection('siteFiles').doc(docId);
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

async function dispatchDeploy(uid, siteId, files) {
  // This uses GitHub REST API from the client.
  // You should proxy this through a Cloud Function or Apps Script if you don't
  // want to expose tokens. For now, this is a placeholder.
  //
  // Recommended: create a tiny HTTPS endpoint that calls repository_dispatch
  // with a server-side secret.

  const endpoint = 'https://api.github.com/repos/YOUR_OWNER/YOUR_REPO/dispatches';

  const payload = {
    event_type: 'deploy-user-site',
    client_payload: {
      uid,
      siteId,
      files,
    },
  };

  // You MUST NOT ship a PAT in client code.
  // This is just a structural placeholder.
  throw new Error('dispatchDeploy must be implemented via a secure backend (Cloud Function / Apps Script).');
}
