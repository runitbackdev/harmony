Rails.application.config.matrix = {
  homeserver_url: ENV.fetch("MATRIX_HOMESERVER_URL", "http://localhost:8008"),
  as_token: ENV.fetch("MATRIX_AS_TOKEN", "herald-dev-as-token"),
  hs_token: ENV.fetch("MATRIX_HS_TOKEN", "herald-dev-hs-token")
}
