// dashboard.js
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
  const fileInput = document.getElementById("file-input");
  const saveFileBtn = document.getElementById("save-file-btn");

  // State
  let currentUser = null;
  let currentSite = null;
  let currentFiles = [];

  function resetUI() {
    if (treePanel) treePanel.classList.add("hidden");
    if (editorPanel) editorPanel.classList.add("hidden");
    if (deployBtn) deployBtn.disabled = true;
    if (deployStatus) deployStatus.textContent = "";
    if (fileTree) fileTree.innerHTML = "";
  }

  resetUI();

  // Auth observer
  firebase.auth().onAuthStateChanged(async (user) => {
    try {
      if (!user) {
        window.location.href = "index.html";
        return;
      }
      currentUser = user;
      document.getElementById("user-email").textContent = user.email;
      if (typeof ensureUserDoc === "function") {
        await ensureUserDoc(user);
      }
      await loadSites();
    } catch (err) {
      console.error("Auth error", err);
    }
  });

  async function loadSites() {
    try {
      const sites = typeof getUserSites === "function" ? await getUserSites(currentUser.uid) : [];
      sitesList.innerHTML = "";
      if (sites.length === 0) {
        sitesList.innerHTML = "<li>No sites yet</li>";
        return;
      }
      sites.forEach((site) => {
        const li = document.createElement("li");
        li.textContent = site.name || site.siteId;
        li.onclick = () => openSite(site);
        sitesList.appendChild(li);
      });
    } catch (err) {
      console.error("loadSites error", err);
    }
  }

  async function openSite(site) {
    try {
      currentSite = site;
      treePanel.classList.remove("hidden");
      editorPanel.classList.add("hidden");
      deployStatus.textContent = "Loading files...";
      
      currentFiles = typeof getSiteFiles === "function" ? await getSiteFiles(currentUser.uid, site.siteId) : [];
      renderFileTree();
      
      deployBtn.disabled = false;
      deployStatus.textContent = "";
      document.getElementById("site-title").textContent = site.name;
      document.getElementById("site-url").textContent = `pages.houselearning.org/${site.siteId}/`;
    } catch (err) {
      console.error("openSite error", err);
      deployStatus.textContent = "Failed to load files";
    }
  }

  // --- SAVE LOGIC ---
  async function saveCurrentWebsite() {
    if (!currentSite || !currentUser) return false;
    try {
      // Capture current editor content if a file is open
      const path = editorFilename.textContent;
      if (path && editorPanel.offsetParent !== null) {
        const content = editorContent.value;
        currentFiles = currentFiles.filter((f) => f.path !== path);
        currentFiles.push({ path, content, contentType: "text/plain" });
      }

      if (typeof saveSiteFiles === "function") {
        await saveSiteFiles(currentUser.uid, currentSite.siteId, currentFiles);
        renderFileTree();
        return true;
      }
      return false;
    } catch (err) {
      console.error("Save error", err);
      return false;
    }
  }

  if (saveFileBtn) {
    saveFileBtn.addEventListener("click", async () => {
      deployStatus.textContent = "Saving...";
      const ok = await saveCurrentWebsite();
      deployStatus.textContent = ok ? "Saved successfully!" : "Save failed.";
      setTimeout(() => { if (deployStatus.textContent.includes("Saved")) deployStatus.textContent = ""; }, 2000);
    });
  }

  // --- DEPLOY LOGIC (WITH AUTO-SAVE) ---
  if (deployBtn) {
    deployBtn.addEventListener("click", async () => {
      try {
        deployBtn.disabled = true;
        deployStatus.textContent = "Saving latest changes...";
        
        const saveOk = await saveCurrentWebsite();
        if (!saveOk) throw new Error("Could not save files before deployment.");

        deployStatus.textContent = "Triggering deployment...";
        await dispatchDeploy(currentUser.uid, currentSite.siteId, currentFiles);
        
        const siteUrl = `https://pages.houselearning.org/${currentSite.siteId}/`;
        deployStatus.innerHTML = `Deployed successfully! <br> <a href="${siteUrl}" target="_blank" style="color: blue; text-decoration: underline;">View Live Site</a>`;
      } catch (err) {
        deployStatus.textContent = "Deploy failed: " + err.message;
      } finally {
        deployBtn.disabled = false;
      }
    });
  }

  // --- FILE TREE & EDITOR ---
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
    files.forEach((f) => {
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
    Object.keys(node).sort().forEach((name) => {
      const item = node[name];
      const li = document.createElement("li");
      if (item.__isFile) {
        li.textContent = name;
        li.className = "file-item";
        li.onclick = () => onFileClick(item.__data);
      } else {
        li.textContent = "[Folder] " + name;
        const ul = document.createElement("ul");
        renderTree(item.children, ul, onFileClick);
        li.appendChild(ul);
      }
      parentEl.appendChild(li);
    });
  }

  // Create site and File upload listeners (Keep as they were)
  if (createSiteBtn) {
    createSiteBtn.addEventListener("click", async () => {
      const name = prompt("Site name");
      if (name) {
        const { siteId } = await createSite(currentUser.uid, name);
        await loadSites();
      }
    });
  }

  document.getElementById("upload-files-btn").onclick = () => fileInput.click();
  fileInput.addEventListener("change", async (ev) => {
    const files = Array.from(ev.target.files);
    for (const f of files) {
      const text = await f.text();
      const path = f.webkitRelativePath || f.name;
      currentFiles = currentFiles.filter(x => x.path !== path);
      currentFiles.push({ path, content: text });
    }
    await saveCurrentWebsite();
  });
});
