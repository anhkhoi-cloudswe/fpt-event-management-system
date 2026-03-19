package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func NewRouter(handler *Handler, jwtManager *JWTManager) *gin.Engine {
	router := gin.New()
	router.Use(gin.Recovery())

	handler.RegisterRoutes(router)

	protected := router.Group("/protected")
	protected.Use(AuthMiddleware(jwtManager))
	protected.GET("/me", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"user_id":  c.GetUint("user_id"),
			"username": c.GetString("username"),
		})
	})

	return router
}

// NewLoginOnlyRouter creates a Gin engine with only the /login endpoint
// Used for legacy /api/login route compatibility
func NewLoginOnlyRouter(handler *Handler) *gin.Engine {
	router := gin.New()
	router.Use(gin.Recovery())

	router.POST("/login", handler.Login)

	return router
}
