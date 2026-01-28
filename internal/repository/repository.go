package repository

import "github.com/jmoiron/sqlx"

type Repository struct {
	DB *sqlx.DB
	Games   *GameRepository
	Backups *BackupRepository
}

func New(db *sqlx.DB) *Repository {
	return &Repository{
		DB:      db,
		Games:   &GameRepository{db: db},
		Backups: &BackupRepository{db: db},
	}
}
