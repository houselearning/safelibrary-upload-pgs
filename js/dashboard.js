// dashboard.js
document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const sitesList = document.getElementById("sites-list");
  const treePanel = document.getElementById("tree-panel");
  const fileTree = document.getElementById("file-tree");
  const editorPanel = document.getElementById("editor-panel");
  const editorFilename = document.getElementById("editor-filename");
  const editorContent = document.getElementById("editor-content");
  const deployBtn = document.getElementById("deploy-btn");
  const deployStatus = document.getElementById("deploy-status");
  const createSiteBtn = document.getElementById("create-site-btn");
  const fileInput = document.getElementById("file-input");
  const saveFileBtn = document.getElementById("save-file-btn");
  const uploadFilesBtn = document.getElementById("upload-files-btn");
  const newFolderBtn = document.getElementById("new-folder-btn");
  
  // Progress Elements
  const progressContainer = document.getElementById("progress-container");
  const progressBar = document.getElementById("progress-bar");

  // Settings Elements
  const settingsBtn = document.getElementById("settings-btn");
  const settingsModal = document.getElementById("settings-modal");
  const closeModal = document.getElementById("close-modal");
  const renameSlugInput = document.getElementById("rename-slug-input");
  const saveSlugBtn = document.getElementById("save-slug-btn");
  const slugStatus = document.getElementById("slug-status");
  const deleteSiteBtn = document.getElementById("delete-site-btn");

  let currentUser = null;
  let currentSite = null;
  let currentFiles = [];

  function resetUI() {
    treePanel.classList.add("hidden");
    editorPanel.classList.add("hidden");
    deployBtn.disabled = true;
    deployStatus.textContent = "";
    fileTree.innerHTML = "";
    progressContainer.style.display = "none";
  }

  // --- AUTH & LOADING ---
  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    currentUser = user;
    document.getElementById("user-email").textContent = user.email;
    if (typeof ensureUserDoc === "function") await ensureUserDoc(user);
    await loadSites();
  });

  async function loadSites() {
    const sites = typeof getUserSites === "function" ? await getUserSites(currentUser.uid) : [];
    sitesList.innerHTML = sites.length ? "" : "<li>No sites yet</li>";
    sites.forEach(site => {
      const li = document.createElement("li");
      li.textContent = site.name || site.siteId;
      li.onclick = () => openSite(site);
      sitesList.appendChild(li);
    });
  }

  async function openSite(site) {
    currentSite = site;
    treePanel.classList.remove("hidden");
    editorPanel.classList.add("hidden");
    deployStatus.textContent = "Loading...";
    currentFiles = typeof getSiteFiles === "function" ? await getSiteFiles(currentUser.uid, site.siteId) : [];
    renderFileTree();
    deployBtn.disabled = false;
    deployStatus.textContent = "";
    document.getElementById("site-title").textContent = site.name;
    const displayId = site.customSlug || site.siteId;
    document.getElementById("site-url").textContent = `pages.houselearning.org/${displayId}/`;
  }

  // --- PROGRESS BAR LOGIC ---
  function updateProgress(percent) {
    progressContainer.style.display = "block";
    progressBar.style.width = percent + "%";
    progressBar.textContent = Math.round(percent) + "%";
    if (percent >= 100) {
      setTimeout(() => { progressContainer.style.display = "none"; }, 1500);
    }
  }

  // --- UPLOAD & FOLDER ACTION WIRING ---
  uploadFilesBtn.onclick = () => fileInput.click();

  fileInput.addEventListener("change", async (ev) => {
    const files = Array.from(ev.target.files || []);
    if (files.length === 0) return;

    deployStatus.textContent = "Uploading folder...";
    let processed = 0;

    for (const f of files) {
      const relPath = f.webkitRelativePath || f.name;
      const text = await f.text();
      
      currentFiles = currentFiles.filter(x => x.path !== relPath);
      currentFiles.push({ path: relPath, content: text, contentType: f.type || "text/plain" });
      
      processed++;
      updateProgress((processed / files.length) * 100);
    }

    await saveCurrentWebsite();
    renderFileTree();
    deployStatus.textContent = "Upload complete!";
  });

  newFolderBtn.onclick = async () => {
    const folderName = prompt("Enter folder name:");
    if (!folderName) return;
    currentFiles.push({ path: `${folderName}/.keep`, content: "Folder index", contentType: "text/plain" });
    await saveCurrentWebsite();
    renderFileTree();
  };

  // --- SETTINGS MODAL ---
  settingsBtn.onclick = () => {
    settingsModal.style.display = "block";
    renameSlugInput.value = currentSite.customSlug || "";
  };
  closeModal.onclick = () => settingsModal.style.display = "none";
  window.onclick = (e) => { if (e.target == settingsModal) settingsModal.style.display = "none"; };

  saveSlugBtn.onclick = async () => {
    const newSlug = renameSlugInput.value.trim().replace(/[^a-zA-Z0-9-]/g, "");
    if (!newSlug) return;
    const db = firebase.firestore();
    await db.collection("users").doc(currentUser.uid).collection("sites").doc(currentSite.siteId).update({ customSlug: newSlug });
    currentSite.customSlug = newSlug;
    document.getElementById("site-url").textContent = `pages.houselearning.org/${newSlug}/`;
    alert("URL Updated!");
  };

  deleteSiteBtn.onclick = async () => {
    if (!confirm("Delete site?")) return;
    const db = firebase.firestore();
    await db.collection("siteFiles").doc(`${currentUser.uid}_${currentSite.siteId}`).delete();
    await db.collection("users").doc(currentUser.uid).collection("sites").doc(currentSite.siteId).delete();
    resetUI();
    await loadSites();
    settingsModal.style.display = "none";
  };

  // --- SAVE & DEPLOY ---
  async function saveCurrentWebsite() {
    if (!currentSite || !currentUser) return false;
    const path = editorFilename.textContent;
    if (path && editorPanel.offsetParent !== null) {
      const content = editorContent.value;
      currentFiles = currentFiles.filter(f => f.path !== path);
      currentFiles.push({ path, content, contentType: "text/plain" });
    }
    if (typeof saveSiteFiles === "function") {
      await saveSiteFiles(currentUser.uid, currentSite.siteId, currentFiles);
      return true;
    }
    return false;
  }

  saveFileBtn.onclick = async () => {
    deployStatus.textContent = "Saving...";
    if (await saveCurrentWebsite()) {
      deployStatus.textContent = "Saved!";
      renderFileTree();
    }
  };

  deployBtn.onclick = async () => {
    deployBtn.disabled = true;
    deployStatus.textContent = "Saving and Deploying...";
    if (await saveCurrentWebsite()) {
      await dispatchDeploy(currentUser.uid, currentSite.siteId, currentFiles);
      const displayId = currentSite.customSlug || currentSite.siteId;
      const url = `https://pages.houselearning.org/${displayId}/`;
      deployStatus.innerHTML = `Deployed! <br> <a href="${url}" target="_blank">View Site</a>`;
    }
    deployBtn.disabled = false;
  };

  // --- TREE HELPERS ---
  function renderFileTree() {
    fileTree.innerHTML = "";
    const tree = buildTree(currentFiles);
    renderTree(tree, fileTree, (file) => {
      editorPanel.classList.remove("hidden");
      editorFilename.textContent = file.path;
      editorContent.value = file.content || "";
    });
  }

  function buildTree(files) {
    const root = {};
    files.forEach(f => {
      const parts = f.path.split("/").filter(Boolean);
      let node = root;
      parts.forEach((part, idx) => {
        if (!node[part]) node[part] = { __isFile: idx === parts.length - 1, __data: idx === parts.length - 1 ? f : null, children: {} };
        node = node[part].children;
      });
    });
    return root;
  }

  function renderTree(node, parentEl, onFileClick) {
    Object.keys(node).sort().forEach(name => {
      const item = node[name];
      const li = document.createElement("li");
      if (item.__isFile) {
        li.textContent = name;
        li.style.cursor = "pointer";
        li.onclick = () => onFileClick(item.__data);
      } else {
        li.textContent = "📁 " + name;
        const ul = document.createElement("ul");
        renderTree(item.children, ul, onFileClick);
        li.appendChild(ul);
      }
      parentEl.appendChild(li);
    });
  }

  createSiteBtn.onclick = async () => {
    const name = prompt("Site name");
    if (name) { await createSite(currentUser.uid, name); await loadSites(); }
  };
});
