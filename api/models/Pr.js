const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    content: { type: String, required: true },
    workAllocationId: { type: String, required: true },
  },
  { collection: "document", timestamps: true },
);

module.exports = mongoose.model("Document", documentSchema);
