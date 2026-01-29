const backupsTable = document.getElementById("backupsTable");
const gameDetailInfo = document.getElementById("gameDetailInfo");
const restoreFeedback = document.getElementById("restoreFeedback");  // 弹框反馈元素

let selectedGame = null;

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

async function handleBackup(e) {
  e.preventDefault();
  if (!selectedGame) {
    showNotification("未选择游戏。", "error");
    showNotification("Missing game selection.", "error");
    return;
  }
  const form = e.currentTarget;
  const nameInput = getField(form, "name").value;
  const payload = { name: null };
  if (nameInput.trim() !== "") {
    payload.name = nameInput.trim();
  }
  showNotification("正在创建备份...", "pending");
  try {
    const res = await request("POST", `/api/v1/games/${selectedGame.id}/backup`, payload);
  if (res.ok) {
      form.reset();
      await fetchBackups();
      showNotification("备份创建成功！", "success");
    } else {
      showNotification(`备份失败：${res.data?.message || "未知错误"}`, "error");
    }
  } catch (err) {
    showNotification(`备份失败：${err?.message || "网络错误"}`, "error");
  }
}

async function handleRestoreLatest(e) {
  e.preventDefault();
  if (!selectedGame) return;
  
  showNotification("正在恢复最新备份...", "pending");
  
  const res = await request("POST", `/api/v1/games/${selectedGame.id}/restore/latest`);
  // 根据响应显示成功或失败的消息
  if (res.ok) {
    showNotification("最新备份恢复成功！", "success");
  } else {
    showNotification(`恢复最新备份失败：${res.data?.message || "未知错误"}`, "error");
  }
}

async function handleRestoreById(backupId) {
  if (!selectedGame) return;
  
  showNotification(`正在恢复备份 ID：${backupId}...`, "pending");
  
  const res = await request("POST", `/api/v1/games/${selectedGame.id}/restore/${backupId}`);
  // 根据响应显示成功或失败的消息
  if (res.ok) {
    showNotification("备份恢复成功！", "success");
  } else {
    showNotification(`恢复备份失败：${res.data?.message || "未知错误"}`, "error");
  }
}

async function handleDeleteBackup(backupId) {
  if (!selectedGame) return;
  if (!window.confirm("确认删除该备份？将同时删除备份文件与记录。")) {
    return;
  }
  showNotification(`正在删除备份 ID：${backupId}...`, "pending");
  const res = await request("DELETE", `/api/v1/games/${selectedGame.id}/backups/${backupId}`);
  if (res.ok) {
    showNotification("备份已删除。", "success");
    await fetchBackups();
  } else {
    showNotification(`删除失败：${res.data?.message || "未知错误"}`, "error");
  }
}

// 显示通知弹框的函数
function showNotification(message, type) {
  // 如果已有通知则先移除
  if (restoreFeedback.firstChild) {
    restoreFeedback.removeChild(restoreFeedback.firstChild);
  }
  
  // 创建通知元素
  const notification = document.createElement('div');
  notification.className = `feedback ${type}`;
  
  // 添加内容
  notification.innerHTML = `
    <span>${message}</span>
    <button class="close-btn">&times;</button>
  `;
  
  // 添加到容器
  restoreFeedback.appendChild(notification);
  restoreFeedback.style.display = 'block';
  
  // 绑定关闭事件
  const closeBtn = notification.querySelector('.close-btn');
  closeBtn.addEventListener('click', () => {
    hideNotification();
  });
  
  // 如果是成功或错误类型，3秒后自动隐藏
  if (type === 'success' || type === 'error') {
    setTimeout(() => {
      hideNotification();
    }, 3000);
  }
}

// 隐藏通知弹框
function hideNotification() {
  restoreFeedback.style.display = 'none';
  if (restoreFeedback.firstChild) {
    restoreFeedback.removeChild(restoreFeedback.firstChild);
  }
}

async function fetchGame(id) {
  const res = await request("GET", "/api/v1/games");
  if (!res.ok || !res.data || !res.data.data) return null;
  return res.data.data.find((g) => String(g.id) === String(id)) || null;
}

async function fetchBackups() {
  if (!selectedGame) return;
  const res = await request("GET", `/api/v1/games/${selectedGame.id}/backups`);
  if (res.ok && res.data && res.data.data) {
    const rows = res.data.data.map((b) => ({
      ...b,
      actions: `<button class="btn-inline" data-restore="${b.id}">恢复</button> <button class="btn-inline danger" data-delete="${b.id}">删除</button>`,
    }));
    renderTable(backupsTable, rows, [
      { key: "id", label: "ID" },
      { key: "name", label: "名称" },
      { key: "backup_path", label: "备份路径" },
      { key: "created_at", label: "创建时间" },
      { key: "size_bytes", label: "大小" },
      { key: "actions", label: "操作" },
    ]);
    wireRestoreButtons(rows);
    wireDeleteButtons(rows);
  } else {
    renderTable(backupsTable, []);
  }
}



function setGameDetail(game) {
  selectedGame = game;
  if (!game) {
    gameDetailInfo.textContent = "Game not found.";
    return;
  }
  gameDetailInfo.innerHTML = `
    <div><strong>ID:</strong> ${game.id}</div>
    <div><strong>Name:</strong> ${game.name}</div>
    <div><strong>Game Path:</strong> ${game.game_path}</div>
    <div><strong>Backup Root:</strong> ${game.backup_root}</div>
    <div><strong>Last Backup:</strong> ${game.last_backup_at ?? "-"}</div>
    <div class="pill">Selected</div>
  `;
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  if (!id) {
    gameDetailInfo.textContent = "Missing game id in URL.";
    return;
  }
  const game = await fetchGame(id);
  setGameDetail(game);
  await fetchBackups();
}

function wire() {
  document.getElementById("formBackup").addEventListener("submit", handleBackup);
  document.getElementById("formRestoreLatest").addEventListener("submit", handleRestoreLatest);
  document.getElementById("btnListBackups").addEventListener("click", fetchBackups);
  document.getElementById("btnBack").addEventListener("click", () => {
    window.location.href = "games.html";
  });
}

wire();
init();

function wireRestoreButtons(rows) {
  backupsTable.querySelectorAll("button[data-restore]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-restore");
      handleRestoreById(id);
    });
  });
}

function wireDeleteButtons(rows) {
  backupsTable.querySelectorAll("button[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-delete");
      handleDeleteBackup(id);
    });
  });
}
