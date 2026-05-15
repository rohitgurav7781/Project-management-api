const mongoose = require("mongoose");

const pieceCountSchema = new mongoose.Schema({
  quoteId: { type: mongoose.Schema.Types.ObjectId, ref: "Quote", required: true },
  sheetNo: String,
  assembly: String,
  profile: String,
  lengthFt: String,
  lengthIn: String,
  qty: String,
  unitWeight: String,
  totalWeight: String,
});

module.exports = mongoose.model("PieceCount", pieceCountSchema);
