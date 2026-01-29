package db

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"go.etcd.io/bbolt"

	"gamebk/internal/config"
)

const (
	bucketMeta    = "meta"
	bucketGames   = "games"
	bucketBackups = "backups"
)

func Open(cfg config.Config) (*bbolt.DB, error) {
	if cfg.DBPath == "" {
		return nil, fmt.Errorf("db path is empty")
	}
	if err := ensureDir(cfg.DBPath); err != nil {
		return nil, err
	}

	db, err := bbolt.Open(cfg.DBPath, 0o600, &bbolt.Options{Timeout: 1 * time.Second})
	if err != nil {
		return nil, err
	}

	if err := initBuckets(db); err != nil {
		_ = db.Close()
		return nil, err
	}

	return db, nil
}

func initBuckets(db *bbolt.DB) error {
	return db.Update(func(tx *bbolt.Tx) error {
		if _, err := tx.CreateBucketIfNotExists([]byte(bucketMeta)); err != nil {
			return err
		}
		if _, err := tx.CreateBucketIfNotExists([]byte(bucketGames)); err != nil {
			return err
		}
		if _, err := tx.CreateBucketIfNotExists([]byte(bucketBackups)); err != nil {
			return err
		}
		return nil
	})
}

func ensureDir(dbPath string) error {
	dir := filepath.Dir(dbPath)
	if dir == "." || dir == "" {
		return nil
	}
	return os.MkdirAll(dir, 0o755)
}
