package handler

import (
	"database/sql"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"gamebk/internal/backup"
	"gamebk/internal/model"
	"gamebk/internal/repository"
)

type Handler struct {
	Repo *repository.Repository
}

func New(db *sqlx.DB) *Handler {
	return &Handler{
		Repo: repository.New(db),
	}
}

func (h *Handler) CreateGame(c *gin.Context) {
	var req struct {
		Name       string `json:"name" binding:"required"`
		GamePath   string `json:"game_path" binding:"required"`
		BackupRoot string `json:"backup_root" binding:"required"`
	}
	if !bindAndValidate(c, &req) {
		return
	}

	game := &model.Game{
		Name:       req.Name,
		GamePath:   req.GamePath,
		BackupRoot: req.BackupRoot,
	}

	if err := h.Repo.Games.Create(c.Request.Context(), game); err != nil {
		respondError(c, http.StatusInternalServerError, "db_error", "failed to create game", err.Error())
		return
	}

	respondCreated(c, game)
}

func (h *Handler) UpdateGame(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		respondError(c, http.StatusBadRequest, "bad_request", "invalid game id", nil)
		return
	}

	var req struct {
		Name       *string `json:"name"`
		GamePath   *string `json:"game_path"`
		BackupRoot *string `json:"backup_root"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "bad_request", err.Error(), nil)
		return
	}
	if req.Name == nil && req.GamePath == nil && req.BackupRoot == nil {
		respondError(c, http.StatusBadRequest, "validation_error", "no fields to update", nil)
		return
	}

	existing, err := h.Repo.Games.GetByID(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(c, http.StatusNotFound, "not_found", "game not found", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "db_error", "failed to load game", err.Error())
		return
	}

	game := &model.Game{
		ID:         id,
		Name:       existing.Name,
		GamePath:   existing.GamePath,
		BackupRoot: existing.BackupRoot,
	}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			respondError(c, http.StatusBadRequest, "validation_error", "name cannot be empty", nil)
			return
		}
		game.Name = name
	}
	if req.GamePath != nil {
		gamePath := strings.TrimSpace(*req.GamePath)
		if gamePath == "" {
			respondError(c, http.StatusBadRequest, "validation_error", "game_path cannot be empty", nil)
			return
		}
		game.GamePath = gamePath
	}
	if req.BackupRoot != nil {
		backupRoot := strings.TrimSpace(*req.BackupRoot)
		if backupRoot == "" {
			respondError(c, http.StatusBadRequest, "validation_error", "backup_root cannot be empty", nil)
			return
		}
		game.BackupRoot = backupRoot
	}

	if err := h.Repo.Games.Update(c.Request.Context(), game); err != nil {
		respondError(c, http.StatusInternalServerError, "db_error", "failed to update game", err.Error())
		return
	}

	updated, err := h.Repo.Games.GetByID(c.Request.Context(), id)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "db_error", "failed to load game", err.Error())
		return
	}
	respondOK(c, updated)
}

func (h *Handler) BackupGame(c *gin.Context) {
	var payload map[string]*string
	if err := c.ShouldBindJSON(&payload); err != nil {
		respondError(c, http.StatusBadRequest, "bad_request", err.Error(), nil)
		return
	}
	namePtr, ok := payload["name"]
	if !ok {
		respondError(c, http.StatusBadRequest, "validation_error", "name is required", nil)
		return
	}

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		respondError(c, http.StatusBadRequest, "bad_request", "invalid game id", nil)
		return
	}

	game, err := h.Repo.Games.GetByID(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(c, http.StatusNotFound, "not_found", "game not found", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "db_error", "failed to load game", err.Error())
		return
	}

	if _, err := os.Stat(game.GamePath); err != nil {
		respondError(c, http.StatusBadRequest, "invalid_path", "game_path not found", err.Error())
		return
	}
	if err := os.MkdirAll(game.BackupRoot, 0o755); err != nil {
		respondError(c, http.StatusInternalServerError, "io_error", "failed to create backup root", err.Error())
		return
	}

	name := ""
	if namePtr != nil {
		name = strings.TrimSpace(*namePtr)
	}
	if name == "" {
		name = time.Now().Format("20060102_150405")
	}
	backupPath := filepath.Join(game.BackupRoot, name)

	size, err := backup.CopyDir(game.GamePath, backupPath)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "io_error", "backup failed", err.Error())
		return
	}

	b := &model.Backup{
		GameID:     game.ID,
		Name:       name,
		BackupPath: backupPath,
		SizeBytes:  size,
	}
	if err := h.Repo.Backups.Create(c.Request.Context(), b); err != nil {
		respondError(c, http.StatusInternalServerError, "db_error", "failed to save backup", err.Error())
		return
	}
	if err := h.Repo.Games.UpdateLastBackupAt(c.Request.Context(), game.ID, time.Now()); err != nil {
		respondError(c, http.StatusInternalServerError, "db_error", "failed to update game", err.Error())
		return
	}

	respondCreated(c, b)
}

func (h *Handler) RestoreLatest(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		respondError(c, http.StatusBadRequest, "bad_request", "invalid game id", nil)
		return
	}

	game, err := h.Repo.Games.GetByID(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(c, http.StatusNotFound, "not_found", "game not found", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "db_error", "failed to load game", err.Error())
		return
	}

	b, err := h.Repo.Backups.GetLatestByGameID(c.Request.Context(), game.ID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(c, http.StatusNotFound, "not_found", "backup not found", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "db_error", "failed to load backup", err.Error())
		return
	}

	if err := restoreBackupToGame(b.BackupPath, game.GamePath); err != nil {
		respondError(c, http.StatusInternalServerError, "io_error", "restore failed", err.Error())
		return
	}

	respondOK(c, b)
}

func (h *Handler) RestoreByID(c *gin.Context) {
	gameID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || gameID <= 0 {
		respondError(c, http.StatusBadRequest, "bad_request", "invalid game id", nil)
		return
	}
	backupID, err := strconv.ParseInt(c.Param("backupId"), 10, 64)
	if err != nil || backupID <= 0 {
		respondError(c, http.StatusBadRequest, "bad_request", "invalid backup id", nil)
		return
	}

	game, err := h.Repo.Games.GetByID(c.Request.Context(), gameID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(c, http.StatusNotFound, "not_found", "game not found", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "db_error", "failed to load game", err.Error())
		return
	}

	b, err := h.Repo.Backups.GetByID(c.Request.Context(), backupID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(c, http.StatusNotFound, "not_found", "backup not found", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "db_error", "failed to load backup", err.Error())
		return
	}
	if b.GameID != game.ID {
		respondError(c, http.StatusBadRequest, "bad_request", "backup does not belong to game", nil)
		return
	}

	if err := restoreBackupToGame(b.BackupPath, game.GamePath); err != nil {
		respondError(c, http.StatusInternalServerError, "io_error", "restore failed", err.Error())
		return
	}

	respondOK(c, b)
}

func restoreBackupToGame(backupPath, gamePath string) error {
	info, err := os.Stat(backupPath)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return errors.New("backup path is not a directory")
	}

	if err := os.MkdirAll(gamePath, 0o755); err != nil {
		return err
	}
	if err := backup.ClearDir(gamePath); err != nil {
		return err
	}
	_, err = backup.CopyDirInto(backupPath, gamePath)
	return err
}

func (h *Handler) ListGames(c *gin.Context) {
	games, err := h.Repo.Games.List(c.Request.Context())
	if err != nil {
		respondError(c, http.StatusInternalServerError, "db_error", "failed to list games", err.Error())
		return
	}
	respondOK(c, games)
}

func (h *Handler) ListBackups(c *gin.Context) {
	gameID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || gameID <= 0 {
		respondError(c, http.StatusBadRequest, "bad_request", "invalid game id", nil)
		return
	}

	_, err = h.Repo.Games.GetByID(c.Request.Context(), gameID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(c, http.StatusNotFound, "not_found", "game not found", nil)
			return
		}
		respondError(c, http.StatusInternalServerError, "db_error", "failed to load game", err.Error())
		return
	}

	backups, err := h.Repo.Backups.ListByGameID(c.Request.Context(), gameID)
	if err != nil {
		respondError(c, http.StatusInternalServerError, "db_error", "failed to list backups", err.Error())
		return
	}

	respondOK(c, backups)
}
