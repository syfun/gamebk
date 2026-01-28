package model

import "time"

type Backup struct {
	ID         int64     `db:"id" json:"id"`
	GameID     int64     `db:"game_id" json:"game_id"`
	Name       string    `db:"name" json:"name"`
	BackupPath string    `db:"backup_path" json:"backup_path"`
	CreatedAt  time.Time `db:"created_at" json:"created_at"`
	SizeBytes  int64     `db:"size_bytes" json:"size_bytes"`
}
