package main

import (
	"log"

	"gamebk/internal/config"
	"gamebk/internal/db"
	"gamebk/internal/router"
)

func main() {
	cfg := config.Load()

	if err := db.Migrate(cfg, "migrations"); err != nil {
		log.Fatalf("db migrate failed: %v", err)
	}

	dbConn, err := db.Open(cfg)
	if err != nil {
		log.Fatalf("db open failed: %v", err)
	}
	defer func() {
		if err := dbConn.Close(); err != nil {
			log.Printf("db close failed: %v", err)
		}
	}()

	r := router.New(cfg, dbConn)

	addr := cfg.Addr()
	log.Printf("server listening on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatalf("server stopped: %v", err)
	}
}
