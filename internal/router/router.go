package router

import (
	"io/fs"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.etcd.io/bbolt"

	"gamebk/internal/config"
	"gamebk/internal/handler"
	webui "gamebk/web"
)

func New(cfg config.Config, db *bbolt.DB) *gin.Engine {
	r := gin.Default()

	sub, err := fs.Sub(webui.FS, ".")
	if err != nil {
		panic(err)
	}
	r.GET("/ui", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/ui/")
	})
	r.StaticFS("/ui", http.FS(sub))

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
		api.DELETE("/games/:id/backups/:backupId", h.DeleteBackup)
	}

	return r
}
