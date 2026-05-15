const mongoose = require("mongoose");
const Schema = mongoose.Schema;
groupSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      //required: true,
    },
    memberId: [  //members
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    profileImage: {
      type: String,
      default: "",
    },
    active: {
      type: Boolean,
      default: true,
    },
    
   
    createdAt: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
    },
    updatedAt: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { collection: "groups" },
);
groupSchema.index({ active: 1 });

module.exports = mongoose.model("Group", groupSchema);
