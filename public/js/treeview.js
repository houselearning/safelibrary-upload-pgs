function buildTree(files) {
  const root = {};

  files.forEach(f => {
    const parts = f.path.split("/");
    let current = root;

    parts.forEach((part, i) => {
      if (!current[part]) {
        current[part] = {
          __isFile: i === parts.length - 1,
          __data: i === parts.length - 1 ? f : null,
          children: {}
        };
      }
      current = current[part].children;
    });
  });

  return root;
}

function renderTree(node, parentEl, onFileClick) {
  Object.keys(node).forEach(name => {
    const item = node[name];
    const li = document.createElement("li");

    if (item.__isFile) {
      li.classList.add("file");
      li.textContent = name;
      li.onclick = () => onFileClick(item.__data);
    } else {
      li.classList.add("folder");
      li.textContent = name;

      const ul = document.createElement("ul");
      ul.classList.add("nested");

      renderTree(item.children, ul, onFileClick);

      li.appendChild(ul);
      li.onclick = e => {
        e.stopPropagation();
        ul.classList.toggle("active");
      };
    }

    parentEl.appendChild(li);
  });
}
