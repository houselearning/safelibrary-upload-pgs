document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const sitesList = document.getElementById("sites-list");
  const treePanel = document.getElementById("tree-panel");
  const fileTree = document.getElementById("file-tree");
  const treeRootDrop = document.getElementById("tree-root-drop");
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

  // --- AUTH & INITIALIZATION ---
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

  // --- SAVE ALL LOGIC (With Textbox Sync) ---
  const performSaveAll = async () => {
    if (!currentSite) return;

    // Sync editor content into the array
    const openFilePath = editorFilename.textContent;
    if (openFilePath && !editorPanel.classList.contains("hidden")) {
      const fileIndex = currentFiles.findIndex(f => f.path === openFilePath);
      if (fileIndex !== -1) {
        currentFiles[fileIndex].content = editorContent.value;
      }
    }

    deployStatus.textContent = "Saving all files...";
    if (await saveCurrentWebsite()) {
      deployStatus.textContent = "All changes saved!";
      renderFileTree();
    } else {
      deployStatus.textContent = "Save failed.";
    }
  };

  saveAllBtn.onclick = performSaveAll;

  // Keyboard shortcut Ctrl+S
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      performSaveAll();
    }
  });

  // --- CONTEXT MENU & DELETION ---
  window.addEventListener("click", () => { contextMenu.style.display = "none"; });

  deleteTreeItem.onclick = async () => {
    if (!rightClickedItem || !currentSite) return;
    const { path, isFile } = rightClickedItem;
    
    if (confirm(`Are you sure you want to delete ${path}?`)) {
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

  // --- DRAG & DROP LOGIC ---
  async function moveItem(oldPath, targetFolder, isFile) {
    const fileName = oldPath.split('/').pop();
    // If target folder is empty string (root), path is just fileName
    const newPath = targetFolder ? `${targetFolder}/${fileName}` : fileName;

    if (newPath === oldPath) return;

    if (isFile) {
      currentFiles = currentFiles.map(f => f.path === oldPath ? { ...f, path: newPath } : f);
    } else {
      const oldPrefix = oldPath + "/";
      const newPrefix = newPath + "/";
      currentFiles = currentFiles.map(f => {
        if (f.path === oldPath) return { ...f, path: newPath };
        if (f.path.startsWith(oldPrefix)) return { ...f, path: f.path.replace(oldPrefix, newPrefix) };
        return f;
      });
    }

    renderFileTree();
    await saveCurrentWebsite();
  }

  // Root drop target setup
  treeRootDrop.ondragover = (e) => { e.preventDefault(); treeRootDrop.classList.add("drag-over"); };
  treeRootDrop.ondragleave = () => treeRootDrop.classList.remove("drag-over");
  treeRootDrop.ondrop = (e) => {
    e.preventDefault();
    treeRootDrop.classList.remove("drag-over");
    const data = JSON.parse(e.dataTransfer.getData("application/json"));
    moveItem(data.path, "", data.isFile);
  };

  // --- UPLOAD HANDLERS ---
  uploadFilesBtn.onclick = () => fileInput.click();
  uploadFolderBtn.onclick = () => folderInput.click();

  async function handleUpload(ev) {
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

  // --- TREE VIEW RENDERING ---
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
      li.setAttribute("draggable", "true");

      if (item.__isFile) {
        li.textContent = name;
        li.onclick = () => onFileClick(item.__data);
      } else {
        li.textContent = "📁 " + name;
        const ul = document.createElement("ul");
        renderTree(item.children, ul, onFileClick, fullPath);
        li.appendChild(ul);

        // Folders are drop targets
        li.ondragover = (e) => { e.preventDefault(); e.stopPropagation(); li.classList.add("drag-over"); };
        li.ondragleave = () => li.classList.remove("drag-over");
        li.ondrop = (e) => {
          e.preventDefault();
          e.stopPropagation();
          li.classList.remove("drag-over");
          const data = JSON.parse(e.dataTransfer.getData("application/json"));
          if (fullPath.startsWith(data.path)) return alert("Cannot move folder into itself.");
          moveItem(data.path, fullPath, data.isFile);
        };
      }

      li.ondragstart = (e) => {
        e.stopPropagation();
        e.dataTransfer.setData("application/json", JSON.stringify({ path: fullPath, isFile: item.__isFile }));
        li.style.opacity = "0.5";
      };
      li.ondragend = () => li.style.opacity = "1";

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

  // --- BUTTON ACTIONS ---
  saveFileBtn.onclick = performSaveAll;
  deployBtn.onclick = async () => {
    deployBtn.disabled = true;
    deployStatus.textContent = "Deploying...";
    await performSaveAll();
    await dispatchDeploy(currentUser.uid, currentSite.siteId, currentFiles);
    const displayId = currentSite.customSlug || currentSite.siteId;
    deployStatus.innerHTML = `Deployed! <a href="https://pages.houselearning.org/${displayId}/" target="_blank">View</a>`;
    deployBtn.disabled = false;
  };

  settingsBtn.onclick = () => { settingsModal.style.display = "block"; renameSlugInput.value = currentSite.customSlug || ""; };
  closeModal.onclick = () => settingsModal.style.display = "none";
});
