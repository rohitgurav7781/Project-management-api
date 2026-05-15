const mongoose = require("mongoose");

const staticLocationData = mongoose.Schema(
  {},
  {
    strict: false,
  }
);

module.exports = mongoose.model(
  "locationdatas",
  staticLocationData,
  "locationdatas"
);
