import { request, responseError } from "./api.js";

const gamesTable = document.getElementById("gamesTable");
const gamesLoading = document.getElementById("gamesLoading");
const gamesEmpty = document.getElementById("gamesEmpty");
const gamesError = document.getElementById("gamesError");
const gamesErrorMessage = document.getElementById("gamesErrorMessage");
const healthStatus = document.getElementById("healthStatus");
const modalGame = document.getElementById("modalGame");
const modalClose = document.getElementById("modalClose");
const modalTitle = document.getElementById("modalTitle");
const modalSubmit = document.getElementById("modalSubmit");
const formGame = document.getElementById("formGame");

let listVersion = 0;

function renderTable(target, rows, columns) {
  const table = document.createElement("table");
  const headings = table.createTHead().insertRow();
  for (const { label } of columns) {
    const heading = document.createElement("th");
    heading.scope = "col";
    heading.textContent = label;
    headings.append(heading);
  }

  const body = table.createTBody();
  for (const row of rows) {
    const tableRow = body.insertRow();
    for (const { key } of columns) {
      const cell = tableRow.insertCell();
      const value = row[key];
      if (value instanceof Node) cell.append(value);
      else cell.textContent = value ?? "";
    }
  }
  target.replaceChildren(table);
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
  const version = ++listVersion;
  gamesLoading.textContent = "正在加载游戏…";
  gamesEmpty.hidden = true;
  gamesError.hidden = true;
  gamesTable.hidden = true;

  const res = await request("GET", "/api/v1/games");
  if (version !== listVersion) return;
  gamesLoading.textContent = "";
  const games = res.data?.data;
  if (!res.ok || (games !== null && !Array.isArray(games))) {
    const reason = res.ok ? "服务返回了无效的列表" : responseError(res);
    gamesError.hidden = false;
    gamesErrorMessage.textContent = `无法加载游戏列表。${reason}`;
    return;
  }
  if (!games?.length) {
    gamesEmpty.hidden = false;
    return;
  }

  gamesTable.hidden = false;
  const rows = games.map((g) => ({
    ...g,
    actions: gameActions(g),
  }));
  renderTable(gamesTable, rows, [
    { key: "id", label: "ID" },
    { key: "name", label: "名称" },
    { key: "game_path", label: "存档路径" },
    { key: "backup_root", label: "备份根目录" },
    { key: "last_backup_at", label: "最近备份时间" },
    { key: "actions", label: "操作" },
  ]);
}

function tableButton(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn-inline";
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

function gameActions(game) {
  const actions = document.createDocumentFragment();
  const open = tableButton("打开", () => {
    const query = new URLSearchParams({ id: game.id });
    window.location.href = `game.html?${query}`;
  });
  const edit = tableButton("编辑", () => openModal("update", game));
  actions.append(open, " ", edit);
  return actions;
}

async function handleHealth() {
  const res = await request("GET", "/healthz");
  if (res.ok) {
    healthStatus.textContent = "OK";
    healthStatus.style.color = "#7CFF6B";
  } else {
    healthStatus.textContent = responseError(res);
    healthStatus.style.color = "#ff5f5f";
  }
}

function wire() {
  document.getElementById("btnNewGame").addEventListener("click", () => openModal("create"));
  document.getElementById("btnNewGameEmpty").addEventListener("click", () => openModal("create"));
  formGame.addEventListener("submit", handleSubmitGame);
  modalClose.addEventListener("click", closeModal);
  modalGame.querySelector("[data-close=\"1\"]").addEventListener("click", closeModal);
  document.getElementById("btnListGames").addEventListener("click", fetchGames);
  document.getElementById("btnRetryGames").addEventListener("click", fetchGames);
  document.getElementById("btnPing").addEventListener("click", handleHealth);
}

wire();
fetchGames();
