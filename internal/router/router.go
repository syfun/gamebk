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

	entries, err := fs.ReadDir(webui.FS, ".")
	if err != nil {
		panic(err)
	}
	files := http.FS(webui.FS)
	r.StaticFileFS("/", "games.html", files)
	// 逐一注册静态资源，避免根路径的通配路由占用 API 路径。
	for _, entry := range entries {
		if !entry.IsDir() {
			r.StaticFileFS("/"+entry.Name(), entry.Name(), files)
		}
	}
	r.GET("/ui", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/ui/")
	})
	r.StaticFS("/ui", files)

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
		api.DELETE("/games/:id/backups", h.DeleteAllBackups)
	}

	return r
}
