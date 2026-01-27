// dashboard.js
document.addEventListener("DOMContentLoaded", () => {
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

  // --- SETTINGS LOGIC ---
  settingsBtn.onclick = () => {
    settingsModal.style.display = "block";
    renameSlugInput.value = currentSite.customSlug || "";
    slugStatus.textContent = "";
  };
  
  closeModal.onclick = () => settingsModal.style.display = "none";
  window.onclick = (e) => { if (e.target == settingsModal) settingsModal.style.display = "none"; };

  saveSlugBtn.onclick = async () => {
    const newSlug = renameSlugInput.value.trim().replace(/[^a-zA-Z0-9-]/g, "");
    if (!newSlug) return alert("Please enter a valid slug");
    
    slugStatus.textContent = "Checking availability...";
    
    try {
      // Check if slug is taken by someone else
      const db = firebase.firestore();
      const snapshot = await db.collection("sites").where("customSlug", "==", newSlug).get();
      
      if (!snapshot.empty && snapshot.docs[0].id !== currentSite.siteId) {
        slugStatus.textContent = "Error: That name is already taken.";
        slugStatus.style.color = "red";
        return;
      }

      // Update the record
      await db.collection("users").doc(currentUser.uid).collection("sites").doc(currentSite.siteId).update({
        customSlug: newSlug
      });
      
      currentSite.customSlug = newSlug;
      slugStatus.textContent = "Slug updated successfully!";
      slugStatus.style.color = "green";
      document.getElementById("site-url").textContent = `pages.houselearning.org/${newSlug}/`;
    } catch (err) {
      slugStatus.textContent = "Update failed: " + err.message;
    }
  };

  deleteSiteBtn.onclick = async () => {
    if (!confirm("Are you absolutely sure? This cannot be undone.")) return;
    try {
      const db = firebase.firestore();
      // 1. Delete site files record
      await db.collection("siteFiles").doc(`${currentUser.uid}_${currentSite.siteId}`).delete();
      // 2. Delete site metadata
      await db.collection("users").doc(currentUser.uid).collection("sites").doc(currentSite.siteId).delete();
      
      alert("Site deleted.");
      settingsModal.style.display = "none";
      resetUI();
      await loadSites();
    } catch (err) { alert("Delete failed: " + err.message); }
  };

  // --- SAVE & DEPLOY LOGIC ---
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
      renderFileTree();
      return true;
    }
    return false;
  }

  saveFileBtn.onclick = async () => {
    deployStatus.textContent = "Saving...";
    if (await saveCurrentWebsite()) {
      deployStatus.textContent = "Saved!";
      setTimeout(() => deployStatus.textContent = "", 2000);
    }
  };

  deployBtn.onclick = async () => {
    deployBtn.disabled = true;
    deployStatus.textContent = "Saving...";
    if (await saveCurrentWebsite()) {
      deployStatus.textContent = "Deploying...";
      // Pass the customSlug if it exists so GitHub builds into the right folder
      const deployFolder = currentSite.customSlug || currentSite.siteId;
      await dispatchDeploy(currentUser.uid, currentSite.siteId, currentFiles);
      const url = `https://pages.houselearning.org/${deployFolder}/`;
      deployStatus.innerHTML = `Success! <br> <a href="${url}" target="_blank">View Site</a>`;
    }
    deployBtn.disabled = false;
  };

  // --- TREE VIEW ---
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
        li.textContent = "[Folder] " + name;
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
// 1. Make the 'Upload Files' button open the hidden file input
if (uploadFilesBtn) {
  uploadFilesBtn.addEventListener("click", () => {
    fileInput.click(); 
  });
}

// 2. Handle 'New Folder' button
if (newFolderBtn) {
  newFolderBtn.addEventListener("click", () => {
    const folderName = prompt("Enter folder name:");
    if (!folderName) return;

    // To create a folder in this system, we create a 'dummy' file 
    // inside it so the path exists in Firestore.
    const path = `${folderName}/.keep`;
    currentFiles.push({ 
      path: path, 
      content: "This file keeps the folder active.", 
      contentType: "text/plain" 
    });
    
    renderFileTree();
    saveCurrentWebsite(); // Save the new folder structure to Firestore
  });
}
