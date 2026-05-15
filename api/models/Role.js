let mongoose = require("mongoose");

let roleSchema = mongoose.Schema(
  {
    name: String,
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
    },
    active: {
      type: Boolean,
      default: true,
    },
    roleTagId: {
      type: String,
      default: "",
    },
    permission: [
      {
        label: {
          type: String,
          required: true,
        },
        enable: {
          type: Boolean,
          required: true,
        },
        isParent: {
          // this is for the child structure, menus --> submenu's
          type: Boolean,
          default: false,
        },
        parentId: {
          type: String,
          default: "",
        },
        buttons: [
          {
            label: {
              type: String,
              required: true,
            },
            enable: {
              type: Boolean,
              required: true,
            },
          },
        ],
      },
    ], // this

    // owner: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "User",
    // },
    owner: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    operatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedAt: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
    },
    createdAt: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
    },
  },
  /*{
  // this block will use when do we need to specify collection name. collection name should be case sensitive
  otherwise model plural name consider as collection name
    collection: 'workCenters'
  }*/
);
module.exports = mongoose.model("Role", roleSchema);
