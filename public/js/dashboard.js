// dashboard.js
// Assumes firebase-init.js loaded and firebase compat SDK available
document.addEventListener("DOMContentLoaded", () => {
  // UI elements
  const sitesList = document.getElementById("sites-list");
  const treePanel = document.getElementById("tree-panel");
  const fileTree = document.getElementById("file-tree");
  const editorPanel = document.getElementById("editor-panel");
  const editorFilename = document.getElementById("editor-filename");
  const editorContent = document.getElementById("editor-content");
  const deployBtn = document.getElementById("deploy-btn");
  const deployStatus = document.getElementById("deploy-status");
  const createSiteBtn = document.getElementById("create-site-btn");
  const newFolderBtn = document.getElementById("new-folder-btn");
  const uploadFilesBtn = document.getElementById("upload-files-btn");
  const fileInput = document.getElementById("file-input");

  // State
  let currentUser = null;
  let currentSite = null;
  let currentFiles = [];

  // Basic UI safety
  function resetUI() {
    treePanel.classList.add("hidden");
    editorPanel.classList.add("hidden");
    deployBtn.disabled = true;
    deployStatus.textContent = "";
    fileTree.innerHTML = "";
  }

  resetUI();

  // Auth observer
  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    currentUser = user;
    await ensureUserDoc(user);
    await loadSites();
  });

  // Load user's sites
  async function loadSites() {
    try {
      const sites = await getUserSites(currentUser.uid);
      sitesList.innerHTML = "";
      if (!sites || sites.length === 0) {
        const li = document.createElement("li");
        li.textContent = "No sites yet";
        sitesList.appendChild(li);
        return;
      }
      sites.forEach((site) => {
        const li = document.createElement("li");
        li.textContent = site.name || site.slug || site.siteId;
        li.dataset.siteId = site.siteId;
        li.onclick = () => openSite(site);
        sitesList.appendChild(li);
      });
    } catch (err) {
      console.error("loadSites error", err);
    }
  }

  // Open a site: set currentSite immediately, then load files
async function openSite(site) {
  currentSite = site || null;
  if (!currentSite || !currentSite.siteId) {
    alert('Invalid site selected');
    return;
  }
  deployBtn.disabled = true;
  deployStatus.textContent = 'Loading files...';
  currentFiles = await getSiteFiles(currentUser.uid, currentSite.siteId);
  renderFileTree();
  deployBtn.disabled = false;
  deployStatus.textContent = '';
}


      // UI
      treePanel.classList.remove("hidden");
      editorPanel.classList.add("hidden");
      deployBtn.disabled = true;
      deployStatus.textContent = "Loading files...";

      // Load files
      currentFiles = await getSiteFiles(currentUser.uid, currentSite.siteId);
      if (!Array.isArray(currentFiles)) currentFiles = [];

      renderFileTree();
      deployBtn.disabled = false;
      deployStatus.textContent = "";
    } catch (err) {
      console.error("openSite error", err);
      deployStatus.textContent = "Failed to load files";
      deployBtn.disabled = true;
    }
  }

  // Build and render tree
  function buildTree(files) {
    const root = {};
    files.forEach((f) => {
      const parts = f.path.split("/").filter(Boolean);
      let node = root;
      parts.forEach((part, idx) => {
        if (!node[part]) {
          node[part] = { __isFile: idx === parts.length - 1, __data: idx === parts.length - 1 ? f : null, children: {} };
        }
        node = node[part].children;
      });
    });
    return root;
  }

  function renderTree(node, parentEl, onFileClick) {
    Object.keys(node)
      .sort()
      .forEach((name) => {
        const item = node[name];
        const li = document.createElement("li");
        if (item.__isFile) {
          li.classList.add("file");
          li.textContent = name;
          li.onclick = (e) => {
            e.stopPropagation();
            onFileClick(item.__data);
          };
        } else {
          li.classList.add("folder");
          const span = document.createElement("span");
          span.textContent = name;
          span.classList.add("folder-label");
          li.appendChild(span);

          const ul = document.createElement("ul");
          ul.classList.add("nested");
          renderTree(item.children, ul, onFileClick);
          li.appendChild(ul);

          span.onclick = (e) => {
            e.stopPropagation();
            ul.classList.toggle("active");
          };
        }
        parentEl.appendChild(li);
      });
  }

  function renderFileTree() {
    fileTree.innerHTML = "";
    const tree = buildTree(currentFiles);
    renderTree(tree, fileTree, openFileEditor);
  }

  // Editor
  function openFileEditor(file) {
    if (!file) return;
    editorPanel.classList.remove("hidden");
    editorFilename.textContent = file.path;
    editorContent.value = file.content || "";
  }

  // Save file
  document.getElementById("save-file-btn").addEventListener("click", async () => {
    try {
      const path = editorFilename.textContent;
      if (!path) {
        alert("No file selected");
        return;
      }
      const content = editorContent.value;
      // Replace or add
      currentFiles = currentFiles.filter((f) => f.path !== path);
      currentFiles.push({ path, content, contentType: "text/plain" });
      await saveSiteFiles(currentUser.uid, currentSite.siteId, currentFiles);
      renderFileTree();
      deployStatus.textContent = "Saved";
      setTimeout(() => (deployStatus.textContent = ""), 1500);
    } catch (err) {
      console.error("save file error", err);
      deployStatus.textContent = "Save failed";
    }
  });

  // Deploy
  deployBtn.addEventListener("click", async () => {
    try {
      if (!auth.currentUser) throw new Error("Not authenticated");
      if (!currentSite || !currentSite.siteId) {
        alert("Select a site before deploying.");
        return;
      }
      deployBtn.disabled = true;
      deployStatus.textContent = "Deploying...";
      // Ensure latest files saved
      await saveSiteFiles(currentUser.uid, currentSite.siteId, currentFiles);
      const res = await dispatchDeploy(currentUser.uid, currentSite.siteId, currentFiles);
      deployStatus.textContent = res && res.message ? res.message : "Deployment triggered";
    } catch (err) {
      console.error("deploy error", err);
      deployStatus.textContent = err.message || "Deploy failed";
    } finally {
      deployBtn.disabled = false;
    }
  });

  // Create site button (simple prompt)
  createSiteBtn && createSiteBtn.addEventListener("click", async () => {
    const name = prompt("Site name");
    if (!name) return;
    try {
      const { siteId } = await createSite(currentUser.uid, name);
      await loadSites();
      // auto-open new site
      const sites = await getUserSites(currentUser.uid);
      const newSite = sites.find((s) => s.siteId === siteId);
      if (newSite) openSite(newSite);
    } catch (err) {
      console.error("create site error", err);
      alert("Failed to create site: " + err.message);
    }
  });

  // Upload files via file input (simple)
  fileInput && fileInput.addEventListener("change", async (ev) => {
    const files = Array.from(ev.target.files || []);
    for (const f of files) {
      const relPath = f.webkitRelativePath || f.name;
      const text = await f.text();
      // replace or add
      currentFiles = currentFiles.filter((x) => x.path !== relPath);
      currentFiles.push({ path: relPath, content: text, contentType: f.type || "application/octet-stream" });
    }
    await saveSiteFiles(currentUser.uid, currentSite.siteId, currentFiles);
    renderFileTree();
  });
});
