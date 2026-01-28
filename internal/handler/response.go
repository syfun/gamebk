package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type ErrorResponse struct {
	Code    string      `json:"code"`
	Message string      `json:"message"`
	Details interface{} `json:"details,omitempty"`
}

type SuccessResponse struct {
	Data interface{} `json:"data"`
}

func respondOK(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, SuccessResponse{Data: data})
}

func respondCreated(c *gin.Context, data interface{}) {
	c.JSON(http.StatusCreated, SuccessResponse{Data: data})
}

func respondError(c *gin.Context, status int, code, message string, details interface{}) {
	c.JSON(status, ErrorResponse{Code: code, Message: message, Details: details})
}
