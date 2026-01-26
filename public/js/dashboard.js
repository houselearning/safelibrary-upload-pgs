document.addEventListener('DOMContentLoaded', () => {
  const userEmailSpan = document.getElementById('user-email');
  const logoutBtn = document.getElementById('logout-btn');
  const createSiteBtn = document.getElementById('create-site-btn');
  const siteLimitMsg = document.getElementById('site-limit-msg');
  const sitesList = document.getElementById('sites-list');

  const siteEditor = document.getElementById('site-editor');
  const siteTitle = document.getElementById('site-title');
  const siteIdSpan = document.getElementById('site-id');
  const siteUrlCode = document.getElementById('site-url');
  const fileInput = document.getElementById('file-input');
  const uploadFilesBtn = document.getElementById('upload-files-btn');
  const filesList = document.getElementById('files-list');
  const deployBtn = document.getElementById('deploy-btn');
  const deployStatus = document.getElementById('deploy-status');

  let currentUser = null;
  let currentSite = null;
  let currentFiles = [];

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    currentUser = user;
    userEmailSpan.textContent = user.email || user.uid;
    await ensureUserDoc(user);
    await loadSites();
  });

  logoutBtn.addEventListener('click', () => auth.signOut());

  async function loadSites() {
    sitesList.innerHTML = '';
    const sites = await getUserSites(currentUser.uid);
    if (sites.length >= 5) {
      siteLimitMsg.classList.remove('hidden');
    } else {
      siteLimitMsg.classList.add('hidden');
    }

    sites.forEach(site => {
      const li = document.createElement('li');
      li.textContent = `${site.name} (${site.slug})`;
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => openSite(site));
      sitesList.appendChild(li);
    });
  }

  createSiteBtn.addEventListener('click', async () => {
    const name = prompt('Site name:');
    if (!name) return;
    try {
      const { siteId, siteDocId, slug } = await createSite(currentUser.uid, name);
      await loadSites();
      const site = {
        uid: currentUser.uid,
        siteId,
        name,
        slug,
        id: siteDocId,
      };
      openSite(site);
    } catch (err) {
      alert(err.message);
    }
  });

  async function openSite(site) {
    currentSite = site;
    siteEditor.classList.remove('hidden');
    siteTitle.textContent = site.name;
    siteIdSpan.textContent = site.siteId;
    const url = `${window.location.origin}/sites/${currentUser.uid}/${site.siteId}/`;
    siteUrlCode.textContent = url;

    currentFiles = await getSiteFiles(currentUser.uid, site.siteId);
    renderFiles();
  }

  function renderFiles() {
    filesList.innerHTML = '';
    currentFiles.forEach(f => {
      const li = document.createElement('li');
      li.textContent = f.path;
      filesList.appendChild(li);
    });
  }

  uploadFilesBtn.addEventListener('click', async () => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;

    for (const file of files) {
      const text = await file.text();
      const path = file.webkitRelativePath || file.name;
      currentFiles = currentFiles.filter(f => f.path !== path);
      currentFiles.push({
        path,
        content: text,
        contentType: file.type || 'text/plain',
      });
    }

    await saveSiteFiles(currentUser.uid, currentSite.siteId, currentFiles);
    renderFiles();
    fileInput.value = '';
  });

  deployBtn.addEventListener('click', async () => {
    deployStatus.textContent = 'Deploying...';
    try {
      const files = await getSiteFiles(currentUser.uid, currentSite.siteId);
      if (!files.length) {
        deployStatus.textContent = 'No files to deploy.';
        return;
      }
      await dispatchDeploy(currentUser.uid, currentSite.siteId, files);
      deployStatus.textContent = 'Deployment triggered. GitHub Pages will update shortly.';
    } catch (err) {
      deployStatus.textContent = `Error: ${err.message}`;
    }
  });
});
