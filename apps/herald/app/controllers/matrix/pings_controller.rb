module Matrix
  class PingsController < BaseController
    def create
      ack :ok
    end
  end
end
