import { request, responseError } from "./api.js";

const gameId = new URLSearchParams(window.location.search).get("id");
const gameTitle = document.getElementById("gameTitle");
const gameMenu = document.getElementById("gameMenu");
const gameLoading = document.getElementById("gameLoading");
const gameError = document.getElementById("gameError");
const retryGame = document.getElementById("btnRetryGame");
const restoreLatest = document.getElementById("btnRestoreLatest");
const deleteAll = document.getElementById("btnDeleteAllBackups");
const refreshHistory = document.getElementById("btnListBackups");
const historyLoading = document.getElementById("historyLoading");
const historyError = document.getElementById("historyError");
const historyErrorMessage = document.getElementById("historyErrorMessage");
const historyEmpty = document.getElementById("historyEmpty");
const historyRecords = document.getElementById("historyRecords");
const backupCards = document.getElementById("backupCards");
const backupCardTemplate = document.getElementById("backupCardTemplate");
const backupsTable = document.getElementById("backupsTable");
const backupActionDialog = document.getElementById("backupActionDialog");
const backupDialog = document.getElementById("backupDialog");
const formBackup = document.getElementById("formBackup");
const gameConfigDialog = document.getElementById("gameConfigDialog");
const formGameConfig = document.getElementById("formGameConfig");
const gameConfigReview = document.getElementById("gameConfigReview");
const writeFeedback = document.getElementById("writeFeedback");
const writeMessage = document.getElementById("writeMessage");
const refreshAfterWrite = document.getElementById("refreshAfterWrite");
const dismissFeedback = document.getElementById("dismissFeedback");

const backupTimeFormat = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const byteFormat = new Intl.NumberFormat("zh-CN");

let selectedGame = null;
let backupRecords = null;
let readingGame = false;
let readingLatest = false;
let writing = false;
let historyVersion = 0;

function syncControls() {
  const writeDisabled = !selectedGame || readingGame || readingLatest || writing;
  for (const control of document.querySelectorAll("[data-game-write]")) {
    control.disabled = writeDisabled;
  }
  restoreLatest.disabled = writeDisabled || !backupRecords?.length;
  deleteAll.disabled = writeDisabled || !backupRecords?.length;
  refreshHistory.disabled = writeDisabled || Boolean(historyLoading.textContent);
}

function showFeedback(message, state, canRefresh = state === "unknown") {
  writeFeedback.dataset.state = state;
  writeFeedback.hidden = false;
  writeMessage.textContent = message;
  refreshAfterWrite.hidden = !canRefresh;
  dismissFeedback.hidden = state === "pending";
}

function wireWriteDialog(dialog) {
  dialog.querySelector("[data-close-dialog]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", (event) => {
    if (writing) event.preventDefault();
  });
  dialog.addEventListener("close", () => {
    if (writeFeedback.parentElement === dialog) document.body.append(writeFeedback);
  });
}

async function runGameWrite({
  method, path, body, pending, failure, onSuccess, reloadHistory = false, dialog,
}) {
  if (!selectedGame || readingGame || readingLatest || writing) return;
  writing = true;
  syncControls();
  const feedbackContainer = dialog ?? document.body;
  if (writeFeedback.parentElement !== feedbackContainer) feedbackContainer.append(writeFeedback);
  showFeedback(pending, "pending");
  let succeeded = false;
  const reviewTarget = dialog === gameConfigDialog ? "配置" : "记录";
  try {
    const result = await request(method, `/api/v1/games/${selectedGame.id}${path}`, body);
    if (result.networkError) {
      showFeedback(`连接中断，操作结果待核对。请刷新数据并核对${reviewTarget}。`, "unknown");
    } else if (!result.ok) {
      const backupMissing = result.status === 404 && result.data?.message === "backup not found";
      const reason = backupMissing ? "所选备份已不存在。请刷新数据并重新选择。" : responseError(result);
      showFeedback(`${failure}。${reason}`, "error", backupMissing);
    } else if (!result.data?.data) {
      showFeedback(`服务响应无法读取，操作结果待核对。请刷新数据并核对${reviewTarget}。`, "unknown");
    } else {
      showFeedback(onSuccess(result.data.data), "success");
      succeeded = true;
    }
  } finally {
    writing = false;
    syncControls();
  }

  if (succeeded) {
    dialog?.close();
    if (reloadHistory) void fetchBackups();
  }
}

function createBackup(name, dialog) {
  return runGameWrite({
    method: "POST",
    path: "/backup",
    body: { name },
    pending: "正在创建备份…",
    failure: "备份失败",
    reloadHistory: true,
    dialog,
    onSuccess: (backup) => `备份成功：${backup.name}`,
  });
}

function openGameConfig() {
  if (!selectedGame || readingGame || writing) return;
  if (gameConfigReview.hidden) {
    for (const field of ["name", "game_path", "backup_root"]) {
      formGameConfig.elements[field].value = selectedGame[field];
    }
  }
  gameConfigReview.hidden = true;
  gameMenu.open = false;
  gameMenu.querySelector("summary").focus();
  gameConfigDialog.showModal();
}

function saveGameConfig(event) {
  event.preventDefault();
  return runGameWrite({
    method: "PATCH",
    path: "",
    body: Object.fromEntries(new FormData(formGameConfig)),
    pending: "正在保存配置…",
    failure: "保存配置失败",
    dialog: gameConfigDialog,
    onSuccess: (game) => {
      renderGame(game);
      return "配置已保存。";
    },
  });
}

function openBackupActionDialog(backup, { title, impact, confirmLabel, danger = false, ...write }) {
  if (!selectedGame || readingGame || writing || backupActionDialog.open) return;
  document.getElementById("backupActionTitle").textContent = title;
  document.getElementById("backupActionGame").textContent = selectedGame.name;
  document.getElementById("backupActionImpact").textContent = impact;
  for (const field of backupActionDialog.querySelectorAll("[data-backup-detail]")) {
    field.hidden = !backup;
  }
  if (backup) {
    document.getElementById("backupActionName").textContent = backup.name;
    document.getElementById("backupActionTime").replaceChildren(backupTime(backup.created_at));
  }
  const confirm = document.getElementById("confirmBackupAction");
  confirm.textContent = confirmLabel;
  confirm.className = danger ? "ghost danger" : "";
  confirm.onclick = () => {
    if (backupActionDialog.open) void runGameWrite({ ...write, dialog: backupActionDialog });
  };
  backupActionDialog.showModal();
}

function restoreBackup(backup) {
  if (!backup) return;
  openBackupActionDialog(backup, {
    title: "恢复备份",
    impact: "整个存档目录将被替换。",
    confirmLabel: "确认恢复",
    method: "POST",
    path: `/restore/${backup.id}`,
    pending: "正在恢复备份…",
    failure: "恢复备份失败",
    onSuccess: () => `已恢复备份「${backup.name}」。`,
  });
}

async function restoreLatestBackup() {
  if (restoreLatest.disabled) return;
  readingLatest = true;
  let records;
  try {
    records = await fetchBackups();
  } finally {
    readingLatest = false;
    syncControls();
  }
  if (!records?.length) return;
  // 历史接口按完整的创建时间倒序返回。
  restoreLatest.focus();
  restoreBackup(records[0]);
}

function deleteBackup(backup) {
  openBackupActionDialog(backup, {
    title: "删除备份",
    impact: "这份备份的文件和记录都将被删除。",
    confirmLabel: "确认删除",
    danger: true,
    method: "DELETE",
    path: `/backups/${backup.id}`,
    pending: "正在删除备份…",
    failure: "删除备份失败",
    reloadHistory: true,
    onSuccess: () => `已删除备份「${backup.name}」。`,
  });
}

function deleteAllBackups() {
  openBackupActionDialog(null, {
    title: "删除全部备份",
    impact: "该游戏的所有备份文件和记录都将被删除。",
    confirmLabel: "确认删除",
    danger: true,
    method: "DELETE",
    path: "/backups",
    pending: "正在删除全部备份…",
    failure: "删除全部备份失败",
    reloadHistory: true,
    onSuccess: (result) => `已删除 ${result.deleted_backups} 份备份。`,
  });
}

function backupButton(label, action, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = danger ? "ghost danger" : "ghost";
  button.textContent = label;
  button.dataset.gameWrite = "";
  button.addEventListener("click", action);
  return button;
}

function formatBackupTime(value) {
  return backupTimeFormat.format(Date.parse(value));
}

function backupTime(value) {
  const time = document.createElement("time");
  time.dateTime = value;
  time.textContent = formatBackupTime(value);
  return time;
}

function backupSize(bytes) {
  return `${byteFormat.format(bytes)} B`;
}

function backupCard(backup) {
  const card = backupCardTemplate.content.firstElementChild.cloneNode(true);
  const heading = card.querySelector("h3");
  heading.id = `backup-title-${backup.id}`;
  heading.textContent = backup.name;
  card.setAttribute("aria-labelledby", heading.id);
  card.querySelector("time").replaceWith(backupTime(backup.created_at));
  card.querySelector(".backup-size").textContent = backupSize(backup.size_bytes);
  card.querySelector(".backup-path").textContent = backup.backup_path;
  card.querySelector(".backup-card-actions").prepend(backupButton("恢复", () => restoreBackup(backup)));
  card.querySelector(".backup-more-content").append(backupButton("删除", () => deleteBackup(backup), true));
  return card;
}

function renderBackups(backups) {
  const cards = document.createDocumentFragment();
  for (const backup of backups) cards.append(backupCard(backup));
  backupCards.replaceChildren(cards);
  renderBackupTable(backups);
}

function renderBackupTable(backups) {
  const table = document.createElement("table");
  const headings = table.createTHead().insertRow();
  for (const label of ["ID", "名称", "备份路径", "创建时间", "大小", "操作"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    headings.append(cell);
  }

  const body = table.createTBody();
  for (const backup of backups) {
    const row = body.insertRow();
    for (const value of [backup.id, backup.name, backup.backup_path]) {
      row.insertCell().textContent = value;
    }
    row.insertCell().append(backupTime(backup.created_at));
    row.insertCell().textContent = backupSize(backup.size_bytes);
    const actions = row.insertCell();
    actions.append(
      backupButton("恢复", () => restoreBackup(backup)),
      backupButton("删除", () => deleteBackup(backup), true),
    );
  }
  backupsTable.replaceChildren(table);
}

async function fetchBackups() {
  if (!selectedGame) return null;
  const version = ++historyVersion;
  backupRecords = null;
  historyLoading.textContent = "正在加载备份历史…";
  historyError.hidden = true;
  historyEmpty.hidden = true;
  historyRecords.hidden = true;
  syncControls();

  const result = await request("GET", `/api/v1/games/${selectedGame.id}/backups`);
  if (version !== historyVersion) return null;
  historyLoading.textContent = "";
  const records = result.data?.data;
  if (!result.ok || (records !== null && !Array.isArray(records))) {
    const reason = result.ok ? "服务返回了无效的备份历史" : responseError(result);
    historyErrorMessage.textContent = `无法加载备份历史。${reason}`;
    historyError.hidden = false;
  } else {
    backupRecords = records ?? [];
    historyEmpty.hidden = backupRecords.length !== 0;
    if (backupRecords.length) {
      renderBackups(backupRecords);
      historyRecords.hidden = false;
    }
  }
  syncControls();
  return backupRecords;
}

function renderGame(game) {
  selectedGame = game;
  gameTitle.textContent = game.name;
  document.title = `GameBK - ${game.name}`;
  document.getElementById("gamePath").textContent = game.game_path;
  document.getElementById("backupRoot").textContent = game.backup_root;
  gameMenu.hidden = false;
}

async function loadGame() {
  if (readingGame || writing) return;
  gameError.hidden = true;
  retryGame.hidden = true;
  if (!gameId) {
    gameError.textContent = "缺少游戏编号。";
    gameError.hidden = false;
    return;
  }

  readingGame = true;
  gameLoading.textContent = "正在加载游戏…";
  syncControls();
  const result = await request("GET", "/api/v1/games");
  const games = result.data?.data;
  const game = Array.isArray(games) && games.find((entry) => String(entry.id) === gameId);
  readingGame = false;
  gameLoading.textContent = "";
  if (!result.ok || !game) {
    const reason = result.ok ? "找不到这个游戏" : responseError(result);
    gameError.textContent = `无法加载游戏。${reason}`;
    gameError.hidden = false;
    retryGame.hidden = false;
    syncControls();
    return;
  }

  renderGame(game);
  await fetchBackups();
}

document.getElementById("btnBackupNow").addEventListener("click", () => createBackup(null));
wireWriteDialog(backupDialog);
document.getElementById("btnBackupCustom").addEventListener("click", () => {
  formBackup.reset();
  backupDialog.showModal();
});
formBackup.addEventListener("submit", (event) => {
  event.preventDefault();
  createBackup(formBackup.elements.name.value.trim() || null, backupDialog);
});
wireWriteDialog(gameConfigDialog);
document.getElementById("btnEditGame").addEventListener("click", openGameConfig);
document.getElementById("resumeGameConfig").addEventListener("click", openGameConfig);
formGameConfig.addEventListener("submit", saveGameConfig);
wireWriteDialog(backupActionDialog);
restoreLatest.addEventListener("click", restoreLatestBackup);
deleteAll.addEventListener("click", deleteAllBackups);
refreshHistory.addEventListener("click", fetchBackups);
document.getElementById("btnRetryHistory").addEventListener("click", fetchBackups);
retryGame.addEventListener("click", loadGame);
refreshAfterWrite.addEventListener("click", () => {
  const dialog = writeFeedback.closest("dialog");
  dialog?.close();
  writeFeedback.hidden = true;
  if (dialog === gameConfigDialog) {
    gameConfigReview.hidden = false;
    gameConfigReview.querySelector("p").focus();
  }
  void loadGame();
});
dismissFeedback.addEventListener("click", () => { writeFeedback.hidden = true; });

loadGame();
