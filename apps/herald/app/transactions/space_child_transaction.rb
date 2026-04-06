class SpaceChildTransaction < ApplicationTransaction
  def process
    return if child_room_id.blank?
    return if content["via"].blank?

    matrix_client.joined_members(space_id).each do |user_id|
      next if user_id == sender

      matrix_client.join_room(child_room_id, as_user: user_id)
    rescue Faraday::Error => e
      Rails.logger.warn("[SpaceChildTransaction] Failed to join #{user_id} to #{child_room_id}: #{e.message}")
    end
  end

  private

  def space_id = @event["room_id"]
  def child_room_id = @event["state_key"]
  def sender = @event["sender"]
  def content = @event.fetch("content", {})
end
