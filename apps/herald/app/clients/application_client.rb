class ApplicationClient
  def initialize(base_url:)
    @connection = Faraday.new(url: base_url) do |f|
      f.request :json
      f.response :json
      f.response :raise_error
    end
  end
end
