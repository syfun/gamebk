package router

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"

	"gamebk/internal/config"
	"gamebk/internal/handler"
)

func New(cfg config.Config, db *sqlx.DB) *gin.Engine {
	r := gin.Default()

	r.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	h := handler.New(db)
	api := r.Group("/api/v1")
	{
		api.POST("/games", h.CreateGame)
		api.PATCH("/games/:id", h.UpdateGame)
		api.POST("/games/:id/backup", h.BackupGame)
		api.POST("/games/:id/restore/latest", h.RestoreLatest)
		api.POST("/games/:id/restore/:backupId", h.RestoreByID)
		api.GET("/games", h.ListGames)
		api.GET("/games/:id/backups", h.ListBackups)
	}

	return r
}
