class InviteLink < ApplicationRecord
  CODE_FORMAT = /\A[a-zA-Z0-9\-]{3,32}\z/
  GENERATED_CODE_LENGTH = 8

  attribute :creator_mxid, default: -> { Current.mxid }

  validates :code, presence: true, uniqueness: true, format: { with: CODE_FORMAT }
  validates :space_mxid, :creator_mxid, presence: true

  before_validation :generate_code, on: :create, if: -> { code.blank? }

  scope :not_expired, -> { where(expires_at: nil).or(where(expires_at: Time.current..)) }
  scope :not_maxed_out, -> { where(max_uses: nil).or(where(arel_table[:use_count].lt(arel_table[:max_uses]))) }
  scope :active, -> { not_expired.not_maxed_out }

  def expired? = expires_at.present? && expires_at <= Time.current

  def maxed_out? = max_uses.present? && use_count >= max_uses

  def active? = !expired? && !maxed_out?

  private

  def generate_code
    self.code = Nanoid.generate(size: GENERATED_CODE_LENGTH)
  end
end
