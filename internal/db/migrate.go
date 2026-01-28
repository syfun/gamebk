package db

import (
	"database/sql"
	"fmt"
	"path/filepath"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/sqlite3"
	_ "github.com/golang-migrate/migrate/v4/source/file"

	"gamebk/internal/config"
)

// Migrate applies all migrations in the directory using golang-migrate.
func Migrate(cfg config.Config, dir string) error {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return err
	}

	if err := ensureDir(cfg.DBPath); err != nil {
		return err
	}

	db, err := sql.Open("sqlite3", DSN(cfg))
	if err != nil {
		return err
	}
	defer func() {
		_ = db.Close()
	}()

	driver, err := sqlite3.WithInstance(db, &sqlite3.Config{})
	if err != nil {
		return err
	}
	fmt.Printf("migrate dir: %s\n", abs)

	sourceURL := "file://" + filepath.ToSlash(abs)
	m, err := migrate.NewWithDatabaseInstance(sourceURL, "sqlite3", driver)
	if err != nil {
		return err
	}
	defer func() {
		_, _ = m.Close()
	}()

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("migrate up failed: %w", err)
	}
	return nil
}
