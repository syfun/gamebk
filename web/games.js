const gamesTable = document.getElementById("gamesTable");
const healthStatus = document.getElementById("healthStatus");
const modalGame = document.getElementById("modalGame");
const modalClose = document.getElementById("modalClose");
const modalTitle = document.getElementById("modalTitle");
const modalSubmit = document.getElementById("modalSubmit");
const formGame = document.getElementById("formGame");

function apiUrl(path) {
  return `${window.location.origin}${path}`;
}

async function request(method, path, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const res = await fetch(apiUrl(path), options);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}


function renderTable(target, rows, columns) {
  if (!rows || rows.length === 0) {
    target.innerHTML = '<div class="helper">No records.</div>';
    return;
  }
  const thead = columns.map((c) => `<th>${c.label}</th>`).join("");
  const tbody = rows
    .map((row) =>
      `<tr>${columns
        .map((c) => `<td>${row[c.key] ?? ""}</td>`)
        .join("")}</tr>`
    )
    .join("");
  target.innerHTML = `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
}

function getField(form, name) {
  return form.querySelector(`[name="${name}"]`);
}

function openModal(mode, game) {
  formGame.reset();
  getField(formGame, "mode").value = mode;
  getField(formGame, "id").value = game?.id ?? "";
  getField(formGame, "name").value = game?.name ?? "";
  getField(formGame, "game_path").value = game?.game_path ?? "";
  getField(formGame, "backup_root").value = game?.backup_root ?? "";
  modalTitle.textContent = mode === "create" ? "新建游戏" : "编辑游戏";
  modalSubmit.textContent = mode === "create" ? "创建" : "更新";
  modalGame.classList.add("show");
  modalGame.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modalGame.classList.remove("show");
  modalGame.setAttribute("aria-hidden", "true");
}

async function handleSubmitGame(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const mode = getField(form, "mode").value;
  const id = getField(form, "id").value.trim();
  const payload = {
    name: getField(form, "name").value.trim(),
    game_path: getField(form, "game_path").value.trim(),
    backup_root: getField(form, "backup_root").value.trim(),
  };
  let res;
  if (mode === "create") {
    res = await request("POST", "/api/v1/games", payload);
  } else {
    const patch = {};
    if (payload.name) patch.name = payload.name;
    if (payload.game_path) patch.game_path = payload.game_path;
    if (payload.backup_root) patch.backup_root = payload.backup_root;
    if (Object.keys(patch).length === 0) {
      return;
    }
    res = await request("PATCH", `/api/v1/games/${id}`, patch);
  }
  if (res.ok) {
    form.reset();
    closeModal();
    await fetchGames();
  }
}

async function fetchGames() {
  const res = await request("GET", "/api/v1/games");
  if (res.ok && res.data && res.data.data) {
    const rows = res.data.data.map((g) => ({
      ...g,
      actions: `<button class="btn-inline" data-open="${g.id}">打开</button> <button class="btn-inline" data-edit="${g.id}">编辑</button>`,
    }));
    renderTable(gamesTable, rows, [
      { key: "id", label: "ID" },
      { key: "name", label: "名称" },
      { key: "game_path", label: "存档路径" },
      { key: "backup_root", label: "备份根目录" },
      { key: "last_backup_at", label: "最近备份时间" },
      { key: "actions", label: "操作" },
    ]);
    wireLinks(res.data.data);
  } else {
    renderTable(gamesTable, []);
  }
}

function wireLinks(games) {
  gamesTable.querySelectorAll("button[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-open");
      window.location.href = `game.html?id=${id}`;
    });
  });
  gamesTable.querySelectorAll("button[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-edit");
      const game = games.find((g) => String(g.id) === String(id));
      if (game) openModal("update", game);
    });
  });
}

async function handleHealth() {
  const res = await request("GET", "/healthz");
  if (res.ok) {
    healthStatus.textContent = "OK";
    healthStatus.style.color = "#7CFF6B";
  } else {
    healthStatus.textContent = `ERR ${res.status}`;
    healthStatus.style.color = "#ff5f5f";
  }
}

function wire() {
  document.getElementById("btnNewGame").addEventListener("click", () => openModal("create"));
  formGame.addEventListener("submit", handleSubmitGame);
  modalClose.addEventListener("click", closeModal);
  modalGame.querySelector("[data-close=\"1\"]").addEventListener("click", closeModal);
  document.getElementById("btnListGames").addEventListener("click", fetchGames);
  document.getElementById("btnPing").addEventListener("click", handleHealth);
}

wire();
