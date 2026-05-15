let mongoose = require("mongoose");

let stateSchema = mongoose.Schema(
  {
    _state_code_: {
      type: String,
      default: "",
    },
    state_name_english: {
      type: String,
      default: "",
    },
    state_name_local: {
      type: String,
      default: "",
    },
    state_census2011_code: {
      type: String,
      default: "",
    },
    state_or_ut: {
      type: String,
      default: "",
    },
    last_updated: {
      type: String,
      default: "",
    },
  },
  {
    // this block will use when do we need to specify collection name. collection name should be case sensitive
    //otherwise model plural name consider as collection name
    collection: "states",
  }
);
module.exports = mongoose.model("State", stateSchema);
