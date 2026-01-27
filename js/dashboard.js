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
  const saveFileBtn = document.getElementById("save-file-btn");

  // State
  let currentUser = null;
  let currentSite = null;
  let currentFiles = [];

  // Basic UI safety
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
      // ensureUserDoc is defined in api.js
      if (typeof ensureUserDoc === "function") {
        await ensureUserDoc(user);
      } else {
        console.warn("ensureUserDoc not found; continuing");
      }
      await loadSites();
    } catch (err) {
      console.error("Auth state handler error", err);
    }
  });

  // Load user's sites
  async function loadSites() {
    try {
      if (!currentUser || !currentUser.uid) throw new Error("No current user");
      const sites = typeof getUserSites === "function" ? await getUserSites(currentUser.uid) : [];
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
    try {
      currentSite = site || null;
      if (!currentSite || !currentSite.siteId) {
        alert("Invalid site selected");
        return;
      }

      // UI
      if (treePanel) treePanel.classList.remove("hidden");
      if (editorPanel) editorPanel.classList.add("hidden");
      if (deployBtn) deployBtn.disabled = true;
      if (deployStatus) deployStatus.textContent = "Loading files...";

      // Load files
      if (!currentUser || !currentUser.uid) throw new Error("No current user");
      currentFiles = typeof getSiteFiles === "function" ? await getSiteFiles(currentUser.uid, currentSite.siteId) : [];
      if (!Array.isArray(currentFiles)) currentFiles = [];

      renderFileTree();
      if (deployBtn) deployBtn.disabled = false;
      if (deployStatus) deployStatus.textContent = "";
    } catch (err) {
      console.error("openSite error", err);
      if (deployStatus) deployStatus.textContent = "Failed to load files";
      if (deployBtn) deployBtn.disabled = true;
    }
  }

  // Build and render tree
  function buildTree(files) {
    const root = {};
    (files || []).forEach((f) => {
      const parts = (f.path || "").split("/").filter(Boolean);
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
    if (!fileTree) return;
    fileTree.innerHTML = "";
    const tree = buildTree(currentFiles);
    renderTree(tree, fileTree, openFileEditor);
  }

  // Editor
  function openFileEditor(file) {
    if (!file) return;
    if (editorPanel) editorPanel.classList.remove("hidden");
    if (editorFilename) editorFilename.textContent = file.path;
    if (editorContent) editorContent.value = file.content || "";
  }

  // Save file locally and to Firestore
  if (saveFileBtn) {
    saveFileBtn.addEventListener("click", async () => {
      try {
        const path = editorFilename && editorFilename.textContent;
        if (!path) {
          alert("No file selected");
          return;
        }
        const content = editorContent && editorContent.value;
        // Replace or add in current local state
        currentFiles = currentFiles.filter((f) => f.path !== path);
        currentFiles.push({ path, content, contentType: "text/plain" });
        
        if (!currentUser || !currentUser.uid) throw new Error("Not authenticated");
        
        if (typeof saveSiteFiles === "function") {
          await saveSiteFiles(currentUser.uid, currentSite.siteId, currentFiles);
          renderFileTree();
          if (deployStatus) deployStatus.textContent = "Saved";
          setTimeout(() => {
            if (deployStatus) deployStatus.textContent = "";
          }, 1500);
        } else {
          console.warn("saveSiteFiles not defined; skipping save");
        }
      } catch (err) {
        console.error("save file error", err);
        if (deployStatus) deployStatus.textContent = "Save failed";
      }
    });
  }

  // FIXED DEPLOY BUTTON: Now uses dispatchDeploy from api.js
  if (deployBtn) {
    deployBtn.addEventListener("click", async () => {
      if (!currentSite || !currentUser) {
        alert("Please select a site first.");
        return;
      }

      console.log("--- DEPLOY START ---");
      console.log("Site Name:", currentSite.name);
      console.log("Site ID:", currentSite.siteId);

      try {
        deployStatus.textContent = "Deploying...";
        deployBtn.disabled = true;

        // Uses the function in api.js which handles the Apps Script connection [cite: 5]
        const result = await dispatchDeploy(currentUser.uid, currentSite.siteId, currentFiles);
        
        console.log("Deploy Success:", result);
        const siteUrl = `https://pages.houselearning.org/`;
        deployStatus.textContent = "Deployed successfully!";
        deployStatus.innerHTML = `Deployed successfully! <br> <a href="${siteUrl}" target="_blank" style="color: blue; text-decoration: underline;">View Live Site</a>`;
      } catch (err) {
        console.error("Deploy Error:", err);
        deployStatus.textContent = "Deploy failed: " + err.message;
      } finally {
        deployBtn.disabled = false;
      }
    });
  }

  // Create site button
  if (createSiteBtn) {
    createSiteBtn.addEventListener("click", async () => {
      const name = prompt("Site name");
      if (!name) return;
      try {
        if (!currentUser || !currentUser.uid) throw new Error("Not authenticated");
        if (typeof createSite !== "function") throw new Error("createSite not defined");
        const { siteId } = await createSite(currentUser.uid, name);
        await loadSites();
        // Auto-open new site
        const sites = typeof getUserSites === "function" ? await getUserSites(currentUser.uid) : [];
        const newSite = sites.find((s) => s.siteId === siteId);
        if (newSite) openSite(newSite);
      } catch (err) {
        console.error("create site error", err);
        alert("Failed to create site: " + err.message);
      }
    });
  }

  // Upload files
  if (fileInput) {
    fileInput.addEventListener("change", async (ev) => {
      try {
        const files = Array.from(ev.target.files || []);
        for (const f of files) {
          const relPath = f.webkitRelativePath || f.name;
          const text = await f.text();
          currentFiles = currentFiles.filter((x) => x.path !== relPath);
          currentFiles.push({ path: relPath, content: text, contentType: f.type || "application/octet-stream" });
        }
        if (!currentUser || !currentUser.uid) throw new Error("Not authenticated");
        if (typeof saveSiteFiles === "function") {
          await saveSiteFiles(currentUser.uid, currentSite.siteId, currentFiles);
        }
        renderFileTree();
      } catch (err) {
        console.error("file upload error", err);
        if (deployStatus) deployStatus.textContent = "Upload failed";
      }
    });
  }
});
