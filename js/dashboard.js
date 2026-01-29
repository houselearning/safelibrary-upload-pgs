document.addEventListener("DOMContentLoaded", () => {
  // --- UI Elements ---
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
  const renameTreeItem = document.getElementById("rename-tree-item");

  // --- Icon & Storage UI Elements ---
  const iconInput = document.getElementById("icon-input");
  const saveIconBtn = document.getElementById("save-icon-btn");
  const iconStatus = document.getElementById("icon-status");
  const clearIconBtn = document.getElementById("clear-icon-btn");
  const storageBar = document.getElementById("storage-bar");
  const storageText = document.getElementById("storage-text");

  // --- State Variables ---
  let currentUser = null;
  let currentSite = null;
  let currentFiles = [];
  let rightClickedItem = null;
  let pendingIcon = null;
  const STORAGE_LIMIT_MIB = 1;
  const STORAGE_LIMIT_BYTES = STORAGE_LIMIT_MIB * 1024 * 1024;
  // --- Site Creation Button ---
const newSiteBtn = document.getElementById("create-site-btn");

// --- Add this to your Site Management section ---
if (newSiteBtn) {
  newSiteBtn.onclick = async () => {
    const siteName = prompt("Enter a name for your new site:");
    
    // Basic validation
    if (!siteName || siteName.trim() === "") return;

    // Create a unique ID (random string)
    const siteId = "site-" + Math.random().toString(36).substring(2, 9);

    const newSiteData = {
      siteId: siteId,
      name: siteName.trim(),
      customSlug: "",
      createdAt: new Date().toISOString()
    };

    try {
      // 1. Save to database (Assuming your helper function exists)
      if (typeof createSite === "function") {
      // Change this line in your dashboard.js:
      await createSite(currentUser.uid, siteName.trim());
      } else {
        console.warn("createSite function not found. Site saved locally only.");
      }

      // 2. Refresh the list and automatically open the new site
      await loadSites();
      openSite(newSiteData);
      
      alert(`Site "${siteName}" created successfully!`);
    } catch (error) {
      console.error("Error creating site:", error);
      alert("Failed to create site. Please try again.");
    }
  };
}
  // --- Authentication ---
  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) { 
      window.location.href = "index.html"; 
      return; 
    }
    currentUser = user;
    document.getElementById("user-email").textContent = user.email;
    if (typeof ensureUserDoc === "function") await ensureUserDoc(user);
    await loadSites();
  });

  // --- Utility: Storage Calculation ---
  function updateStorageUI() {
    let totalBytes = 0;
    currentFiles.forEach(file => {
      // Approximate byte size based on content length
      if (file.content) {
        totalBytes += new Blob([file.content]).size;
      }
    });

    const usedMiB = (totalBytes / (1024 * 1024)).toFixed(2);
    const percent = Math.min((totalBytes / STORAGE_LIMIT_BYTES) * 100, 100);

    if (storageBar) storageBar.style.width = percent + "%";
    if (storageText) storageText.textContent = `${usedMiB} / ${STORAGE_LIMIT_MIB} MiB`;

    // Visual warning if storage is over 90%
    if (storageBar) {
      storageBar.style.backgroundColor = percent > 90 ? "#f44336" : "#2196F3";
    }
  }

  // --- Site Management ---
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
    updateStorageUI();
    
    deployBtn.disabled = false;
    deployStatus.textContent = "";
    document.getElementById("site-title").textContent = site.name;
    const displayId = site.customSlug || site.siteId;
    document.getElementById("site-url").textContent = `pages.houselearning.org/${displayId}/`;
  }

  // --- Persistence Logic ---
  async function saveCurrentWebsite() {
    if (!currentSite || !currentUser) return false;
    updateStorageUI();
    if (typeof saveSiteFiles === "function") {
      await saveSiteFiles(currentUser.uid, currentSite.siteId, currentFiles);
      return true;
    }
    return false;
  }

  const performSaveAll = async () => {
    if (!currentSite) return;

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
  saveFileBtn.onclick = performSaveAll;

  // Keyboard shortcut Ctrl+S
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      performSaveAll();
    }
  });

  // --- Icon Logic ---
  iconInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      pendingIcon = {
        path: "favicon.ico",
        content: event.target.result,
        contentType: file.type
      };
      saveIconBtn.disabled = false;
      iconStatus.textContent = `Selected: ${file.name} (Click Save)`;
    };
    reader.readAsDataURL(file);
  };

  saveIconBtn.onclick = async () => {
    if (!pendingIcon || !currentSite) return;

    // Remove existing favicon.ico if it exists and add the new one
    currentFiles = currentFiles.filter(f => f.path !== "favicon.ico");
    currentFiles.push(pendingIcon);

    if (await saveCurrentWebsite()) {
      saveIconBtn.disabled = true;
      iconStatus.textContent = "Icon saved! Deploy to publish.";
      clearIconBtn.style.display = "inline-block";
      pendingIcon = null;
      renderFileTree();
    }
  };

  clearIconBtn.onclick = async () => {
    if (confirm("Reset to browser default icon?")) {
      currentFiles = currentFiles.filter(f => f.path !== "favicon.ico");
      if (await saveCurrentWebsite()) {
        clearIconBtn.style.display = "none";
        iconStatus.textContent = "Icon cleared. Reverted to default.";
        iconInput.value = "";
        renderFileTree();
      }
    }
  };

  // --- Context Menu Actions ---
  window.addEventListener("click", () => { contextMenu.style.display = "none"; });

  renameTreeItem.onclick = async () => {
    if (!rightClickedItem || !currentSite) return;
    const { path, isFile } = rightClickedItem;

    if (path === "favicon.ico") {
      alert("The website icon cannot be renamed.");
      return;
    }

    const parts = path.split('/');
    const oldName = parts.pop();
    const parentPath = parts.join('/');

    const newName = prompt(`Rename "${oldName}" to:`, oldName);
    if (newName && newName !== oldName) {
      const newPath = parentPath ? `${parentPath}/${newName}` : newName;
      
      if (isFile) {
        currentFiles = currentFiles.map(f => f.path === path ? { ...f, path: newPath } : f);
      } else {
        const oldPrefix = path + "/";
        const newPrefix = newPath + "/";
        currentFiles = currentFiles.map(f => {
          if (f.path === path) return { ...f, path: newPath };
          if (f.path.startsWith(oldPrefix)) return { ...f, path: f.path.replace(oldPrefix, newPrefix) };
          return f;
        });
      }
      renderFileTree();
      await saveCurrentWebsite();
    }
  };

  deleteTreeItem.onclick = async () => {
    if (!rightClickedItem || !currentSite) return;
    const { path, isFile } = rightClickedItem;
    
    // User must use the "Clear Icon" button in settings to remove the favicon
    if (path === "favicon.ico") {
      alert("To delete the icon, please use the 'Clear Icon' button in Site Settings.");
      return;
    }

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

  // --- Drag & Drop Core Logic ---
  async function moveItem(oldPath, targetFolder, isFile) {
    const fileName = oldPath.split('/').pop();
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

  if (treeRootDrop) {
    treeRootDrop.ondragover = (e) => { e.preventDefault(); treeRootDrop.classList.add("drag-over"); };
    treeRootDrop.ondragleave = () => treeRootDrop.classList.remove("drag-over");
    treeRootDrop.ondrop = (e) => {
      e.preventDefault();
      treeRootDrop.classList.remove("drag-over");
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      moveItem(data.path, "", data.isFile);
    };
  }

  // --- Upload Handlers ---
  uploadFilesBtn.onclick = () => fileInput.click();
  if (uploadFolderBtn) uploadFolderBtn.onclick = () => folderInput.click();

  async function handleUpload(ev) {
    const files = Array.from(ev.target.files || []);
    if (files.length === 0) return;

    progressContainer.style.display = "block";

    const uploadPromises = files.map((f, i) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const content = e.target.result;
          const relPath = f.webkitRelativePath || f.name;

          currentFiles = currentFiles.filter((x) => x.path !== relPath);
          currentFiles.push({
            path: relPath,
            content: content,
            contentType: f.type || "text/plain",
          });

          const percent = ((i + 1) / files.length) * 100;
          progressBar.style.width = percent + "%";
          progressBar.textContent = Math.round(percent) + "%";
          resolve();
        };

        if (f.type.startsWith("image/")) {
          reader.readAsDataURL(f);
        } else {
          reader.readAsText(f);
        }
      });
    });

    await Promise.all(uploadPromises);
    await saveCurrentWebsite();
    renderFileTree();

    setTimeout(() => {
      progressContainer.style.display = "none";
      progressBar.style.width = "0%";
    }, 1000);
  }

  fileInput.addEventListener("change", handleUpload);
  if (folderInput) folderInput.addEventListener("change", handleUpload);

  // --- Tree View Rendering ---
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
        if (fullPath === "favicon.ico") {
          // Grayed out styling with (ico) italic label
          li.style.color = "#888";
          li.innerHTML = `<i style="font-size: 0.9em; margin-right: 5px;">(ico)</i> ${name}`;
        } else {
          li.textContent = name;
        }
        li.onclick = () => onFileClick(item.__data);
      } else {
        li.textContent = "📁 " + name;
        const ul = document.createElement("ul");
        renderTree(item.children, ul, onFileClick, fullPath);
        li.appendChild(ul);

        li.ondragover = (e) => { 
          e.preventDefault(); 
          e.stopPropagation(); 
          li.classList.add("drag-over"); 
        };
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

  // --- Deployment & Settings ---
  deployBtn.onclick = async () => {
    deployBtn.disabled = true;
    deployStatus.textContent = "Deploying...";
    await performSaveAll();
    await dispatchDeploy(currentUser.uid, currentSite.siteId, currentFiles);
    const displayId = currentSite.customSlug || currentSite.siteId;
    deployStatus.innerHTML = `Deployed! <a href="https://pages.houselearning.org/${displayId}/" target="_blank">View</a>`;
    deployBtn.disabled = false;
  };

  settingsBtn.onclick = () => { 
    settingsModal.style.display = "block"; 
    renameSlugInput.value = currentSite.customSlug || ""; 
    
    // Update Storage UI in settings
    updateStorageUI();

    // Check if favicon exists to toggle "Clear" button
    const hasIcon = currentFiles.some(f => f.path === "favicon.ico");
    clearIconBtn.style.display = hasIcon ? "inline-block" : "none";
    iconStatus.textContent = hasIcon ? "Current icon: favicon.ico" : "No custom icon set.";
    saveIconBtn.disabled = true;
    iconInput.value = "";
  };

  closeModal.onclick = () => {
    settingsModal.style.display = "none";
    pendingIcon = null;
  };
});
