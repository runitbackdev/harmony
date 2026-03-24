class CreateProcessedTransactions < ActiveRecord::Migration[8.1]
  def change
    create_table :processed_transactions do |t|
      t.string :txn_mxid, null: false

      t.timestamps
    end
    add_index :processed_transactions, :txn_mxid, unique: true
  end
end
