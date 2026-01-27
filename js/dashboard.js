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
  
  const progressContainer = document.getElementById("progress-container");
  const progressBar = document.getElementById("progress-bar");

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
    if (progressContainer) progressContainer.style.display = "none";
  }

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
    currentSite = site; // Sets the global state so settings work
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

  // --- SETTINGS LOGIC ---
  settingsBtn.onclick = () => {
    if (!currentSite) return alert("Select a site first");
    settingsModal.style.display = "block";
    renameSlugInput.value = currentSite.customSlug || "";
    slugStatus.textContent = "";
  };

  closeModal.onclick = () => settingsModal.style.display = "none";

  saveSlugBtn.onclick = async () => {
    if (!currentSite) return alert("No active site");
    const newSlug = renameSlugInput.value.trim().replace(/[^a-zA-Z0-9-]/g, "");
    if (!newSlug) return alert("Invalid slug");
    
    slugStatus.textContent = "Checking availability...";
    
    try {
      const db = firebase.firestore();
      // Global check
      const snapshot = await db.collection("sites").where("customSlug", "==", newSlug).get();
      if (!snapshot.empty && snapshot.docs[0].id !== currentSite.siteId) {
        slugStatus.textContent = "Error: Name taken.";
        slugStatus.style.color = "red";
        return;
      }

      // Use .set with merge to prevent "No document to update" error
      await db.collection("users").doc(currentUser.uid).collection("sites").doc(currentSite.siteId).set({
        customSlug: newSlug,
        uid: currentUser.uid
      }, { merge: true });
      
      currentSite.customSlug = newSlug;
      slugStatus.textContent = "Updated!";
      slugStatus.style.color = "green";
      document.getElementById("site-url").textContent = `pages.houselearning.org/${newSlug}/`;
    } catch (err) {
      slugStatus.textContent = "Failed: " + err.message;
    }
  };

  deleteSiteBtn.onclick = async () => {
    if (!currentSite || !confirm("Delete site?")) return;
    const db = firebase.firestore();
    await db.collection("siteFiles").doc(`${currentUser.uid}_${currentSite.siteId}`).delete();
    await db.collection("users").doc(currentUser.uid).collection("sites").doc(currentSite.siteId).delete();
    resetUI();
    await loadSites();
    settingsModal.style.display = "none";
  };

  // --- UPLOAD LOGIC ---
  uploadFilesBtn.onclick = () => fileInput.click();

  fileInput.addEventListener("change", async (ev) => {
    const files = Array.from(ev.target.files || []);
    if (files.length === 0) return;
    
    progressContainer.style.display = "block";
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const relPath = f.webkitRelativePath || f.name;
      const text = await f.text();
      currentFiles = currentFiles.filter(x => x.path !== relPath);
      currentFiles.push({ path: relPath, content: text, contentType: f.type || "text/plain" });
      
      const percent = ((i + 1) / files.length) * 100;
      progressBar.style.width = percent + "%";
      progressBar.textContent = Math.round(percent) + "%";
    }
    
    await saveCurrentWebsite();
    renderFileTree();
    setTimeout(() => { progressContainer.style.display = "none"; }, 1000);
  });

  // --- SAVE & DEPLOY ---
  async function saveCurrentWebsite() {
    if (!currentSite || !currentUser) return false;
    if (typeof saveSiteFiles === "function") {
      await saveSiteFiles(currentUser.uid, currentSite.siteId, currentFiles);
      return true;
    }
    return false;
  }

  saveFileBtn.onclick = async () => {
    const path = editorFilename.textContent;
    if (path) {
      currentFiles = currentFiles.filter(f => f.path !== path);
      currentFiles.push({ path, content: editorContent.value, contentType: "text/plain" });
    }
    deployStatus.textContent = "Saving...";
    if (await saveCurrentWebsite()) {
      deployStatus.textContent = "Saved!";
      renderFileTree();
    }
  };

  deployBtn.onclick = async () => {
    deployBtn.disabled = true;
    deployStatus.textContent = "Deploying...";
    await saveCurrentWebsite();
    await dispatchDeploy(currentUser.uid, currentSite.siteId, currentFiles);
    const displayId = currentSite.customSlug || currentSite.siteId;
    deployStatus.innerHTML = `Deployed! <a href="https://pages.houselearning.org/${displayId}/" target="_blank">View</a>`;
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
});
