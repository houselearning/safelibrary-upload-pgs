const userId = auth.currentUser.uid;

// Fetch user sites
async function loadSites() {
  const sitesRef = db.collection('sites').doc(userId).collection('userSites');
  const snapshot = await sitesRef.get();
  const container = document.getElementById('sites-list');
  container.innerHTML = '';
  snapshot.forEach(doc => {
    const data = doc.data();
    const div = document.createElement('div');
    div.innerHTML = `<strong>${data.name}</strong> - <button onclick="editSite('${doc.id}')">Edit</button>`;
    container.appendChild(div);
  });
}

// Create new site
async function createSite(name) {
  const sitesRef = db.collection('sites').doc(userId).collection('userSites');
  const snapshot = await sitesRef.get();
  if(snapshot.size >= 5) {
    alert("Limit reached: max 5 sites");
    return;
  }
  const newSiteRef = sitesRef.doc();
  await newSiteRef.set({ name: name, created: firebase.firestore.FieldValue.serverTimestamp() });
  loadSites();
}
