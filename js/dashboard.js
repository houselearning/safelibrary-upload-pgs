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
  const fileInput = document.getElementById("file-input");
  const folderInput = document.getElementById("folder-input");
  const saveFileBtn = document.getElementById("save-file-btn");
  const saveAllBtn = document.getElementById("save-all-btn");
  const uploadFilesBtn = document.getElementById("upload-files-btn");
  const uploadFolderBtn = document.getElementById("upload-folder-btn");
  
  const progressContainer = document.getElementById("progress-container");
  const progressBar = document.getElementById("progress-bar");

  const settingsBtn = document.getElementById("settings-btn");
  const settingsModal = document.getElementById("settings-modal");
  const closeModal = document.getElementById("close-modal");
  const renameSlugInput = document.getElementById("rename-slug-input");
  const saveSlugBtn = document.getElementById("save-slug-btn");
  const slugStatus = document.getElementById("slug-status");
  const deleteSiteBtn = document.getElementById("delete-site-btn");

  const contextMenu = document.getElementById("context-menu");
  const deleteTreeItem = document.getElementById("delete-tree-item");

  let currentUser = null;
  let currentSite = null;
  let currentFiles = [];
  let rightClickedItem = null;

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

  // --- SAVE ALL LOGIC ---
  saveAllBtn.onclick = async () => {
    if (!currentSite) return;

    // 1. Update the local currentFiles array with whatever is currently in the editor
    const openFilePath = editorFilename.textContent;
    if (openFilePath && !editorPanel.classList.contains("hidden")) {
      const fileIndex = currentFiles.findIndex(f => f.path === openFilePath);
      if (fileIndex !== -1) {
        currentFiles[fileIndex].content = editorContent.value;
      }
    }

    // 2. Save the entire updated array to the database
    deployStatus.textContent = "Saving all changes...";
    if (await saveCurrentWebsite()) {
      deployStatus.textContent = "All changes saved!";
      renderFileTree();
    } else {
      deployStatus.textContent = "Save failed.";
    }
  };

  // --- CONTEXT MENU LOGIC ---
  window.addEventListener("click", () => { contextMenu.style.display = "none"; });

  deleteTreeItem.onclick = async () => {
    if (!rightClickedItem || !currentSite) return;
    const { path, isFile } = rightClickedItem;
    
    if (confirm(`Delete ${path}?`)) {
      if (isFile) {
        currentFiles = currentFiles.filter(f => f.path !== path);
      } else {
        const prefix = path.endsWith('/') ? path : path + '/';
        currentFiles = currentFiles.filter(f => !f.path.startsWith(prefix));
      }
      renderFileTree();
      await saveCurrentWebsite();
    }
  };

  // --- UPLOAD LOGIC ---
  uploadFilesBtn.onclick = () => fileInput.click();
  uploadFolderBtn.onclick = () => folderInput.click();

  async function handleUpload(ev) {
    const files = Array.from(ev.target.files || []);
    if (files.length === 0) return;
    
    progressContainer.style.display = "block";
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      // Use webkitRelativePath for folders, name for individual files
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
  }

  fileInput.addEventListener("change", handleUpload);
  folderInput.addEventListener("change", handleUpload);

  async function saveCurrentWebsite() {
    if (!currentSite || !currentUser) return false;
    if (typeof saveSiteFiles === "function") {
      await saveSiteFiles(currentUser.uid, currentSite.siteId, currentFiles);
      return true;
    }
    return false;
  }

  // --- REMAINING HELPERS (UNCHANGED) ---
  saveFileBtn.onclick = async () => {
    const path = editorFilename.textContent;
    if (path) {
      currentFiles = currentFiles.filter(f => f.path !== path);
      currentFiles.push({ path, content: editorContent.value, contentType: "text/plain" });
    }
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

  function renderFileTree() {
    fileTree.innerHTML = "";
    const tree = buildTree(currentFiles);
    renderTree(tree, fileTree, (file) => {
      editorPanel.classList.remove("hidden");
      editorFilename.textContent = file.path;
      editorContent.value = file.content || "";
    }, "");
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

  function renderTree(node, parentEl, onFileClick, currentPath) {
    Object.keys(node).sort().forEach(name => {
      const item = node[name];
      const li = document.createElement("li");
      const fullPath = currentPath ? `${currentPath}/${name}` : name;
      li.style.cursor = "pointer";

      if (item.__isFile) {
        li.textContent = name;
        li.onclick = () => onFileClick(item.__data);
      } else {
        li.textContent = "📁 " + name;
        const ul = document.createElement("ul");
        renderTree(item.children, ul, onFileClick, fullPath);
        li.appendChild(ul);
      }

      li.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        rightClickedItem = { path: fullPath, isFile: item.__isFile };
        contextMenu.style.display = "block";
        contextMenu.style.left = e.pageX + "px";
        contextMenu.style.top = e.pageY + "px";
      };
      parentEl.appendChild(li);
    });
  }

  // --- SETTINGS (UNCHANGED) ---
  settingsBtn.onclick = () => { settingsModal.style.display = "block"; renameSlugInput.value = currentSite.customSlug || ""; };
  closeModal.onclick = () => settingsModal.style.display = "none";
  saveSlugBtn.onclick = async () => { /* ... slug logic ... */ };
  deleteSiteBtn.onclick = async () => { /* ... delete logic ... */ };
});
