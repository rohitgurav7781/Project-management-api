let mongoose = require("mongoose");

let subDistrictSchema = mongoose.Schema(
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
    district_code: {
      type: String,
      default: "",
    },
    district_name_english: {
      type: String,
      default: "",
    },
    district_name_local: {
      type: String,
      default: "",
    },
    district_census2011_code: {
      type: String,
      default: "",
    },
    subdistrict_code: {
      type: String,
      default: "",
    },
    subdistrict_name_english: {
      type: String,
      default: "",
    },
    subdistrict_name_local: {
      type: String,
      default: "",
    },
    subdistrict_census2011_code: {
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
    collection: "sub_districts",
  }
);
module.exports = mongoose.model("SubDistrict", subDistrictSchema);
