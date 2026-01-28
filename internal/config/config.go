package config

import (
	"os"
)

type Config struct {
	Host   string
	Port   string
	DBPath string
}

func Load() Config {
	return Config{
		Host:   envOrDefault("GAMEBK_HOST", "0.0.0.0"),
		Port:   envOrDefault("GAMEBK_PORT", "8080"),
		DBPath: envOrDefault("GAMEBK_DB_PATH", "./data/gamebk.db"),
	}
}

func (c Config) Addr() string {
	return c.Host + ":" + c.Port
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
