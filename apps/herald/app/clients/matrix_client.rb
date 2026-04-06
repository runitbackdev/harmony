class MatrixClient < ApplicationClient
  def initialize
    super(base_url: Rails.application.config.matrix[:homeserver_url])
    @as_token = Rails.application.config.matrix[:as_token]
  end

  def whoami(access_token)
    response = @connection.get("/_matrix/client/v3/account/whoami") do |req|
      req.headers["Authorization"] = "Bearer #{access_token}"
    end

    response.body["user_id"]
  end

  def space_preview(room_id, as_user:)
    response = @connection.get("/_matrix/client/unstable/im.nheko.summary/summary/#{CGI.escape(room_id)}") do |req|
      req.headers["Authorization"] = "Bearer #{@as_token}"
      req.params["user_id"] = as_user
    end

    room = response.body
    { name: room&.dig("name") || "Unknown Space", member_count: room&.dig("num_joined_members") || 0 }
  end

  def joined_members(room_id)
    response = @connection.get("/_matrix/client/v3/rooms/#{CGI.escape(room_id)}/joined_members") do |req|
      req.headers["Authorization"] = "Bearer #{@as_token}"
    end

    response.body.dig("joined")&.keys || []
  end

  def join_room(room_id, as_user:)
    @connection.post("/_matrix/client/v3/join/#{CGI.escape(room_id)}") do |req|
      req.headers["Authorization"] = "Bearer #{@as_token}"
      req.params["user_id"] = as_user
      req.body = {}
    end
  end

  def invite_to_room(room_id, user_id, as_user:)
    @connection.post("/_matrix/client/v3/rooms/#{CGI.escape(room_id)}/invite") do |req|
      req.headers["Authorization"] = "Bearer #{@as_token}"
      req.params["user_id"] = as_user
      req.body = { user_id: user_id }
    end
  end
end
