const baseUrlInput = document.getElementById("baseUrl");
const responseBox = document.getElementById("responseBox");
const gamesTable = document.getElementById("gamesTable");
const backupsTable = document.getElementById("backupsTable");
const healthStatus = document.getElementById("healthStatus");
const gameDetailInfo = document.getElementById("gameDetailInfo");
const gameDetailPanel = document.getElementById("gameDetailPanel");

let selectedGame = null;

function detectBaseUrl() {
  const manual = baseUrlInput.value.trim();
  if (manual) return manual.replace(/\/$/, "");
  return window.location.origin;
}

function apiUrl(path) {
  return `${detectBaseUrl()}${path}`;
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

function showResponse(result) {
  responseBox.textContent = JSON.stringify(result, null, 2);
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

async function handleCreateGame(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const payload = {
    name: getField(form, "name").value.trim(),
    game_path: getField(form, "game_path").value.trim(),
    backup_root: getField(form, "backup_root").value.trim(),
  };
  const res = await request("POST", "/api/v1/games", payload);
  showResponse(res);
  if (res.ok) {
    form.reset();
    await fetchGames();
  }
}

async function handleUpdateGame(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const id = getField(form, "id").value.trim();
  const payload = {};
  const name = getField(form, "name").value.trim();
  const gamePath = getField(form, "game_path").value.trim();
  const backupRoot = getField(form, "backup_root").value.trim();
  if (name) payload.name = name;
  if (gamePath) payload.game_path = gamePath;
  if (backupRoot) payload.backup_root = backupRoot;
  if (Object.keys(payload).length === 0) {
    showResponse({ ok: false, status: 400, data: { error: "no fields to update" } });
    return;
  }
  const res = await request("PATCH", `/api/v1/games/${id}`, payload);
  showResponse(res);
  if (res.ok) {
    await fetchGames();
  }
}

async function handleBackup(e) {
  e.preventDefault();
  const form = e.currentTarget;
  if (!selectedGame) {
    showResponse({ ok: false, status: 400, data: { error: "select a game first" } });
    return;
  }
  const id = selectedGame.id;
  const nameInput = getField(form, "name").value;
  const payload = { name: null };
  if (nameInput.trim() !== "") {
    payload.name = nameInput.trim();
  }
  const res = await request("POST", `/api/v1/games/${id}/backup`, payload);
  showResponse(res);
  if (res.ok) {
    await fetchBackups(id);
  }
}

async function handleRestoreLatest(e) {
  e.preventDefault();
  if (!selectedGame) {
    showResponse({ ok: false, status: 400, data: { error: "select a game first" } });
    return;
  }
  const id = selectedGame.id;
  const res = await request("POST", `/api/v1/games/${id}/restore/latest`);
  showResponse(res);
}

async function handleRestoreById(e) {
  e.preventDefault();
  if (!selectedGame) {
    showResponse({ ok: false, status: 400, data: { error: "select a game first" } });
    return;
  }
  const form = e.currentTarget;
  const id = selectedGame.id;
  const backupId = getField(form, "backupId").value.trim();
  const res = await request("POST", `/api/v1/games/${id}/restore/${backupId}`);
  showResponse(res);
}

async function fetchGames() {
  const res = await request("GET", "/api/v1/games");
  showResponse(res);
  if (res.ok && res.data && res.data.data) {
    renderTable(gamesTable, res.data.data, [
      { key: "id", label: "ID" },
      { key: "name", label: "Name" },
      { key: "game_path", label: "Game Path" },
      { key: "backup_root", label: "Backup Root" },
      { key: "last_backup_at", label: "Last Backup" },
      { key: "actions", label: "Actions" },
    ]);
    wireGameRows(res.data.data);
  } else {
    renderTable(gamesTable, []);
  }
}

async function fetchBackups(gameId) {
  const res = await request("GET", `/api/v1/games/${gameId}/backups`);
  showResponse(res);
  if (res.ok && res.data && res.data.data) {
    renderTable(backupsTable, res.data.data, [
      { key: "id", label: "ID" },
      { key: "name", label: "Name" },
      { key: "backup_path", label: "Path" },
      { key: "created_at", label: "Created" },
      { key: "size_bytes", label: "Size" },
    ]);
  } else {
    renderTable(backupsTable, []);
  }
}

async function handleListBackups() {
  if (!selectedGame) return;
  await fetchBackups(selectedGame.id);
}

async function handleHealth() {
  const res = await request("GET", "/healthz");
  showResponse(res);
  if (res.ok) {
    healthStatus.textContent = "OK";
    healthStatus.style.color = "#7CFF6B";
  } else {
    healthStatus.textContent = `ERR ${res.status}`;
    healthStatus.style.color = "#ff5f5f";
  }
}

function wire() {
  document.getElementById("formCreateGame").addEventListener("submit", handleCreateGame);
  document.getElementById("formUpdateGame").addEventListener("submit", handleUpdateGame);
  document.getElementById("formBackup").addEventListener("submit", handleBackup);
  document.getElementById("formRestoreLatest").addEventListener("submit", handleRestoreLatest);
  document.getElementById("formRestoreById").addEventListener("submit", handleRestoreById);
  document.getElementById("btnListGames").addEventListener("click", fetchGames);
  document.getElementById("btnListBackups").addEventListener("click", handleListBackups);
  document.getElementById("btnPing").addEventListener("click", handleHealth);
}

wire();

function wireGameRows(rows) {
  const table = gamesTable.querySelector("table");
  if (!table) return;
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  Array.from(tbody.rows).forEach((tr, idx) => {
    const row = rows[idx];
    const actionCell = tr.lastElementChild;
    if (!actionCell) return;
    actionCell.innerHTML = `<button class="btn-inline" data-id="${row.id}">Select</button>`;
  });
  tbody.querySelectorAll(".btn-inline").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.currentTarget.getAttribute("data-id"));
      const game = rows.find((g) => g.id === id);
      if (!game) return;
      selectGame(game);
      await fetchBackups(game.id);
    });
  });
}

function selectGame(game) {
  selectedGame = game;
  gameDetailInfo.innerHTML = `
    <div><strong>ID:</strong> ${game.id}</div>
    <div><strong>Name:</strong> ${game.name}</div>
    <div><strong>Game Path:</strong> ${game.game_path}</div>
    <div><strong>Backup Root:</strong> ${game.backup_root}</div>
    <div><strong>Last Backup:</strong> ${game.last_backup_at ?? "-"}</div>
    <div class="pill">Selected</div>
  `;
  gameDetailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}
