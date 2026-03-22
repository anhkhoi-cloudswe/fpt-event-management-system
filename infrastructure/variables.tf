# =============================================================================
# Shared variables — infrastructure root
# =============================================================================

variable "cors_allowed_origins" {
  type        = list(string)
  description = "Allowed browser origins for API Gateway HTTP API CORS (no wildcards when using credentials)."
  default = [
    "http://localhost:3000",
    "http://localhost:5173",
  ]
}
