class CreateInviteLinks < ActiveRecord::Migration[8.1]
  def change
    create_table :invite_links do |t|
      t.string :code, null: false
      t.string :space_mxid, null: false
      t.string :creator_mxid, null: false
      t.integer :max_uses
      t.integer :use_count, null: false, default: 0
      t.datetime :expires_at

      t.timestamps
    end
    add_index :invite_links, :code, unique: true
  end
end
