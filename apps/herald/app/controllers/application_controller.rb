class ApplicationController < ActionController::Base
  allow_browser versions: :modern
  stale_when_importmap_changes

  around_action :set_current_attributes

  private

  def set_current_attributes(&)
    Current.set(matrix_client: MatrixClient.new, &)
  end
end
