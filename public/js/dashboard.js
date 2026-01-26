document.addEventListener("DOMContentLoaded", () => {
  const sitesList = document.getElementById("sites-list");
  const treePanel = document.getElementById("tree-panel");
  const fileTree = document.getElementById("file-tree");
  const editorPanel = document.getElementById("editor-panel");
  const editorFilename = document.getElementById("editor-filename");
  const editorContent = document.getElementById("editor-content");

  let currentUser = null;
  let currentSite = null;
  let currentFiles = [];

  auth.onAuthStateChanged(async user => {
    if (!user) return (window.location.href = "index.html");
    currentUser = user;
    document.getElementById("user-email").textContent = user.email;
    await ensureUserDoc(user);
    loadSites();
  });

  async function loadSites() {
    const sites = await getUserSites(currentUser.uid);
    sitesList.innerHTML = "";

    sites.forEach(site => {
      const li = document.createElement("li");
      li.textContent = site.name;
      li.onclick = () => openSite(site);
      sitesList.appendChild(li);
    });
  }

  async function openSite(site) {
    currentSite = site;
    treePanel.classList.remove("hidden");

    document.getElementById("site-title").textContent = site.name;
    document.getElementById("site-url").textContent =
      `${window.location.origin}/sites/${currentUser.uid}/${site.siteId}/`;

    currentFiles = await getSiteFiles(currentUser.uid, site.siteId);

    renderFileTree();
  }

  function renderFileTree() {
    fileTree.innerHTML = "";
    const tree = buildTree(currentFiles);
    renderTree(tree, fileTree, openFileEditor);
  }

  function openFileEditor(file) {
    editorPanel.classList.remove("hidden");
    editorFilename.textContent = file.path;
    editorContent.value = file.content;
  }

  document.getElementById("save-file-btn").onclick = async () => {
    const path = editorFilename.textContent;
    const content = editorContent.value;

    currentFiles = currentFiles.filter(f => f.path !== path);
    currentFiles.push({ path, content, contentType: "text/plain" });

    await saveSiteFiles(currentUser.uid, currentSite.siteId, currentFiles);
    renderFileTree();
  };

  document.getElementById("deploy-btn").onclick = async () => {
    document.getElementById("deploy-status").textContent = "Deploying...";
    try {
      await dispatchDeploy(currentUser.uid, currentSite.siteId, currentFiles);
      document.getElementById("deploy-status").textContent =
        "Deployment triggered!";
    } catch (err) {
      document.getElementById("deploy-status").textContent = err.message;
    }
  };
});
