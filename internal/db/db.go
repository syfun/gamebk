package db

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/jmoiron/sqlx"
	_ "github.com/mattn/go-sqlite3"

	"gamebk/internal/config"
)

func Open(cfg config.Config) (*sqlx.DB, error) {
	if cfg.DBPath == "" {
		return nil, fmt.Errorf("db path is empty")
	}

	if err := ensureDir(cfg.DBPath); err != nil {
		return nil, err
	}

	dsn := DSN(cfg)
	db, err := sqlx.Open("sqlite3", dsn)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}

	return db, nil
}

func DSN(cfg config.Config) string {
	return fmt.Sprintf("file:%s?_pragma=foreign_keys(ON)&_busy_timeout=5000", cfg.DBPath)
}

func ensureDir(dbPath string) error {
	dir := filepath.Dir(dbPath)
	if dir == "." || dir == "" {
		return nil
	}
	return os.MkdirAll(dir, 0o755)
}
