package model

import "time"

type Game struct {
	ID           int64      `db:"id" json:"id"`
	Name         string     `db:"name" json:"name"`
	GamePath     string     `db:"game_path" json:"game_path"`
	BackupRoot   string     `db:"backup_root" json:"backup_root"`
	LastBackupAt *time.Time `db:"last_backup_at" json:"last_backup_at"`
	CreatedAt    time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt    time.Time  `db:"updated_at" json:"updated_at"`
}
