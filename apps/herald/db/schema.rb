# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_03_22_001302) do
  create_table "invite_links", force: :cascade do |t|
    t.string "code", null: false
    t.datetime "created_at", null: false
    t.string "creator_mxid", null: false
    t.datetime "expires_at"
    t.integer "max_uses"
    t.string "space_mxid", null: false
    t.datetime "updated_at", null: false
    t.integer "use_count", default: 0, null: false
    t.index ["code"], name: "index_invite_links_on_code", unique: true
  end

  create_table "processed_transactions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "txn_mxid", null: false
    t.datetime "updated_at", null: false
    t.index ["txn_mxid"], name: "index_processed_transactions_on_txn_mxid", unique: true
  end
end
