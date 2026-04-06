class ApplicationTransaction
  def initialize(event)
    @event = event
  end

  def process
    raise NotImplementedError
  end

  def self.dispatch(events)
    events.each do |event|
      handler = handler_for(event["type"])
      handler&.new(event)&.process
    end
  end

  private

  def matrix_client = Current.matrix_client

  HANDLER_CACHE = {}

  def self.handler_for(event_type)
    return HANDLER_CACHE[event_type] if HANDLER_CACHE.key?(event_type)

    class_name = event_type
      .delete_prefix("m.")
      .tr(".", "_")
      .classify
      .concat("Transaction")

    HANDLER_CACHE[event_type] = class_name.safe_constantize
  end
end
