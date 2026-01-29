package repository

import "go.etcd.io/bbolt"

type Repository struct {
	DB      *bbolt.DB
	Games   *GameRepository
	Backups *BackupRepository
}

func New(db *bbolt.DB) *Repository {
	return &Repository{
		DB:      db,
		Games:   &GameRepository{db: db},
		Backups: &BackupRepository{db: db},
	}
}
