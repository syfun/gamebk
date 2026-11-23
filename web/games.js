import { request, responseError } from "./api.js";

const gamesTable = document.getElementById("gamesTable");
const gamesCards = document.getElementById("gamesCards");
const gamesLoading = document.getElementById("gamesLoading");
const gamesEmpty = document.getElementById("gamesEmpty");
const gamesError = document.getElementById("gamesError");
const gamesErrorMessage = document.getElementById("gamesErrorMessage");
const moreGames = document.getElementById("btnMoreGames");
const gamesActions = document.getElementById("gamesActions");
const healthStatus = document.getElementById("healthStatus");
const gamesSaveStatus = document.getElementById("gamesSaveStatus");
const modalGame = document.getElementById("modalGame");
const modalClose = document.getElementById("modalClose");
const modalTitle = document.getElementById("modalTitle");
const modalSubmit = document.getElementById("modalSubmit");
const formGame = document.getElementById("formGame");
const gameFormStatus = document.getElementById("gameFormStatus");
const gameFormError = document.getElementById("gameFormError");
const verifyGamesButton = document.getElementById("btnVerifyGames");
const resumeGameButton = document.getElementById("btnResumeGame");
const gameInputs = formGame.querySelectorAll("input:not([type=hidden])");

let listVersion = 0;
let savingGame = false;

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
  gameFormError.textContent = "";
  verifyGamesButton.hidden = true;
  resumeGameButton.hidden = true;
  gamesSaveStatus.textContent = "";
  getField(formGame, "mode").value = mode;
  getField(formGame, "id").value = game?.id ?? "";
  getField(formGame, "name").value = game?.name ?? "";
  getField(formGame, "game_path").value = game?.game_path ?? "";
  getField(formGame, "backup_root").value = game?.backup_root ?? "";
  modalTitle.textContent = mode === "create" ? "新建游戏" : "编辑游戏";
  modalSubmit.textContent = mode === "create" ? "创建" : "更新";
  modalGame.showModal();
}

function closeModal() {
  if (!savingGame) modalGame.close();
}

function setGameFormStatus(action) {
  savingGame = Boolean(action);
  modalClose.disabled = savingGame;
  modalSubmit.disabled = savingGame;
  for (const input of gameInputs) input.readOnly = savingGame;
  gameFormStatus.textContent = action;
  if (savingGame) gameFormStatus.scrollIntoView({ block: "nearest" });
}

async function verifyGames() {
  closeModal();
  gamesSaveStatus.textContent = "保存结果待核对。请检查刷新后的游戏列表。";
  resumeGameButton.hidden = false;
  resumeGameButton.focus();
  await fetchGames();
}

async function handleSubmitGame(e) {
  e.preventDefault();
  if (savingGame) return;
  const form = e.currentTarget;
  const creating = getField(form, "mode").value === "create";
  const id = getField(form, "id").value;
  const payload = {
    name: getField(form, "name").value.trim(),
    game_path: getField(form, "game_path").value.trim(),
    backup_root: getField(form, "backup_root").value.trim(),
  };
  const changes = creating ? payload : Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value),
  );
  if (!Object.keys(changes).length) {
    gameFormError.textContent = "请填写要更新的游戏配置。";
    return;
  }

  gameFormError.textContent = "";
  gamesSaveStatus.textContent = "";
  verifyGamesButton.hidden = true;
  resumeGameButton.hidden = true;
  const action = creating ? "创建游戏" : "更新游戏配置";
  setGameFormStatus(`正在${action}…`);
  const res = creating
    ? await request("POST", "/api/v1/games", changes)
    : await request("PATCH", `/api/v1/games/${id}`, changes);
  setGameFormStatus("");
  if (!res.ok) {
    gameFormError.textContent = res.networkError
      ? "无法连接服务，保存结果待核对。请刷新列表核对。"
      : `无法${action}。${responseError(res)}`;
    verifyGamesButton.hidden = !res.networkError;
    gameFormError.scrollIntoView({ block: "nearest" });
    return;
  }

  form.reset();
  closeModal();
  gamesSaveStatus.textContent = creating ? "已创建游戏。" : "已更新游戏配置。";
  await fetchGames();
}

async function fetchGames() {
  const version = ++listVersion;
  gamesLoading.textContent = "正在加载游戏…";
  gamesEmpty.hidden = true;
  gamesError.hidden = true;
  gamesTable.hidden = true;
  gamesCards.hidden = true;

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

  gamesCards.replaceChildren(...games.map(gameCard));
  gamesCards.hidden = false;
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
  gamesTable.hidden = false;
}

function gameURL(game) {
  return `game.html?${new URLSearchParams({ id: game.id })}`;
}

function gameCard(game) {
  const card = document.createElement("li");
  const link = document.createElement("a");
  link.className = "game-card-link";
  link.href = gameURL(game);
  link.setAttribute("aria-label", game.name);

  const name = document.createElement("span");
  name.className = "game-card-name";
  name.textContent = game.name;

  const backup = document.createElement("span");
  backup.id = `game-card-backup-${game.id}`;
  backup.className = "game-card-backup";
  // 清空备份历史时，服务会把最近备份时间重置为 Go 零时间。
  const lastBackupAt = game.last_backup_at;
  backup.textContent = lastBackupAt && lastBackupAt !== "0001-01-01T00:00:00Z"
    ? `最近备份 ${new Date(lastBackupAt).toLocaleString("zh-CN")}`
    : "尚未备份";
  link.setAttribute("aria-describedby", backup.id);

  const arrow = document.createElement("span");
  arrow.className = "game-card-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "→";

  link.append(name, backup, arrow);
  card.append(link);
  return card;
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
    window.location.href = gameURL(game);
  });
  const edit = tableButton("编辑", () => openModal("update", game));
  actions.append(open, " ", edit);
  return actions;
}

async function handleHealth() {
  healthStatus.classList.remove("error-message");
  healthStatus.textContent = "正在执行健康检查…";
  const res = await request("GET", "/healthz");
  healthStatus.classList.toggle("error-message", !res.ok);
  healthStatus.textContent = res.ok ? "健康检查通过" : `健康检查失败。${responseError(res)}`;
}

function closeMoreActions() {
  if (moreGames.getAttribute("aria-expanded") !== "true") return;
  moreGames.setAttribute("aria-expanded", "false");
  moreGames.focus();
}

function wireMoreActions() {
  const toolbar = moreGames.parentElement;
  moreGames.addEventListener("click", () => {
    const expanded = moreGames.getAttribute("aria-expanded") === "true";
    moreGames.setAttribute("aria-expanded", String(!expanded));
  });
  gamesActions.addEventListener("click", closeMoreActions, { capture: true });
  toolbar.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMoreActions();
  });
  document.addEventListener("click", (event) => {
    if (!toolbar.contains(event.target)) {
      if (gamesActions.contains(document.activeElement)) closeMoreActions();
      else moreGames.setAttribute("aria-expanded", "false");
    }
  });
}

function wire() {
  wireMoreActions();
  document.getElementById("btnNewGame").addEventListener("click", () => openModal("create"));
  document.getElementById("btnNewGameEmpty").addEventListener("click", () => openModal("create"));
  formGame.addEventListener("submit", handleSubmitGame);
  verifyGamesButton.addEventListener("click", verifyGames);
  resumeGameButton.addEventListener("click", () => modalGame.showModal());
  modalClose.addEventListener("click", closeModal);
  modalGame.addEventListener("cancel", (event) => {
    if (savingGame) event.preventDefault();
  });
  modalGame.addEventListener("click", (event) => {
    if (event.target === modalGame) closeModal();
  });
  document.getElementById("btnListGames").addEventListener("click", fetchGames);
  document.getElementById("btnRetryGames").addEventListener("click", fetchGames);
  document.getElementById("btnPing").addEventListener("click", handleHealth);
}

wire();
fetchGames();
