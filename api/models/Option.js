let mongoose = require("mongoose");

let optionSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
    },
    options: [
      {
        value: {
          type: String,
          default: "",
        },
        display: {
          type: String,
          default: "",
        },
        active: {
          type: Boolean,
          default: true,
        },
        logo: {
          type: String,
          default: "",
        },
        createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        operatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        createdAt: {
          type: Number,
          default: () => Math.floor(Date.now() / 1000),
        },
        updatedAt: {
          type: Number,
          default: () => Math.floor(Date.now() / 1000),
        },
      },
    ],
  },
  {
    // this block will use when do we need to specify collection name. collection name should be case sensitive
    //otherwise model plural name consider as collection name
    collection: "options",
  },
);
optionSchema.index({ "options.value": 1 });
module.exports = mongoose.model("Option", optionSchema);
