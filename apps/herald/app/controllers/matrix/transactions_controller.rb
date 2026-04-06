module Matrix
  class TransactionsController < BaseController
    def update
      ApplicationTransaction.dispatch(params.fetch(:events, []))
      ack :ok
    end
  end
end
