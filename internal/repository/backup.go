package repository

import (
	"context"

	"github.com/jmoiron/sqlx"

	"gamebk/internal/model"
)

type BackupRepository struct {
	db *sqlx.DB
}

func (r *BackupRepository) Create(ctx context.Context, b *model.Backup) error {
	q := `
		INSERT INTO backups (game_id, name, backup_path, size_bytes)
		VALUES (:game_id, :name, :backup_path, :size_bytes)
	`
	res, err := r.db.NamedExecContext(ctx, q, b)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	b.ID = id
	return nil
}

func (r *BackupRepository) ListByGameID(ctx context.Context, gameID int64) ([]model.Backup, error) {
	q := `
		SELECT id, game_id, name, backup_path, created_at, size_bytes
		FROM backups
		WHERE game_id = ?
		ORDER BY created_at DESC
	`
	var backups []model.Backup
	if err := r.db.SelectContext(ctx, &backups, q, gameID); err != nil {
		return nil, err
	}
	return backups, nil
}

func (r *BackupRepository) GetByID(ctx context.Context, id int64) (*model.Backup, error) {
	q := `
		SELECT id, game_id, name, backup_path, created_at, size_bytes
		FROM backups
		WHERE id = ?
	`
	var b model.Backup
	if err := r.db.GetContext(ctx, &b, q, id); err != nil {
		return nil, err
	}
	return &b, nil
}

func (r *BackupRepository) GetLatestByGameID(ctx context.Context, gameID int64) (*model.Backup, error) {
	q := `
		SELECT id, game_id, name, backup_path, created_at, size_bytes
		FROM backups
		WHERE game_id = ?
		ORDER BY created_at DESC
		LIMIT 1
	`
	var b model.Backup
	if err := r.db.GetContext(ctx, &b, q, gameID); err != nil {
		return nil, err
	}
	return &b, nil
}
