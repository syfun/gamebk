package repository

import (
	"context"
	"time"

	"github.com/jmoiron/sqlx"

	"gamebk/internal/model"
)

type GameRepository struct {
	db *sqlx.DB
}

func (r *GameRepository) Create(ctx context.Context, g *model.Game) error {
	q := `
		INSERT INTO games (name, game_path, backup_root, last_backup_at)
		VALUES (:name, :game_path, :backup_root, :last_backup_at)
	`
	res, err := r.db.NamedExecContext(ctx, q, g)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	g.ID = id
	return nil
}

func (r *GameRepository) List(ctx context.Context) ([]model.Game, error) {
	q := `
		SELECT id, name, game_path, backup_root, last_backup_at, created_at, updated_at
		FROM games
		ORDER BY id DESC
	`
	var games []model.Game
	if err := r.db.SelectContext(ctx, &games, q); err != nil {
		return nil, err
	}
	return games, nil
}

func (r *GameRepository) GetByID(ctx context.Context, id int64) (*model.Game, error) {
	q := `
		SELECT id, name, game_path, backup_root, last_backup_at, created_at, updated_at
		FROM games
		WHERE id = ?
	`
	var g model.Game
	if err := r.db.GetContext(ctx, &g, q, id); err != nil {
		return nil, err
	}
	return &g, nil
}

func (r *GameRepository) UpdateLastBackupAt(ctx context.Context, gameID int64, t time.Time) error {
	q := `
		UPDATE games
		SET last_backup_at = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`
	_, err := r.db.ExecContext(ctx, q, t, gameID)
	return err
}

func (r *GameRepository) Update(ctx context.Context, g *model.Game) error {
	q := `
		UPDATE games
		SET name = ?, game_path = ?, backup_root = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`
	_, err := r.db.ExecContext(ctx, q, g.Name, g.GamePath, g.BackupRoot, g.ID)
	return err
}
