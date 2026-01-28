package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
)

func bindAndValidate(c *gin.Context, dst interface{}) bool {
	if err := c.ShouldBindJSON(dst); err != nil {
		var ve validator.ValidationErrors
		if errors.As(err, &ve) {
			respondError(c, http.StatusBadRequest, "validation_error", "invalid request", formatValidationErrors(ve))
			return false
		}
		respondError(c, http.StatusBadRequest, "bad_request", err.Error(), nil)
		return false
	}
	return true
}

func formatValidationErrors(ve validator.ValidationErrors) []map[string]string {
	out := make([]map[string]string, 0, len(ve))
	for _, fe := range ve {
		out = append(out, map[string]string{
			"field": fe.Field(),
			"tag":   fe.Tag(),
			"param": fe.Param(),
		})
	}
	return out
}
