let mongoose = require("mongoose");

let chatSchema = mongoose.Schema(
  {
    sessionId: {
      type: String,
      default: "",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    title: {
      type: String,
      default: "",
    },
    chat: [
      {
        message: String,
        fileUrl: String,
        messageType: {
          type: String,
          default: "text",
        },
        userType: {
          type: String,
          default: "sender",
        },
        sender: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        receiver: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        deletedFor: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
        ],

        isDeletedForEveryone: {
          type: Boolean,
          default: false,
        },
        updatedAt: {
          type: Number,
          default: () => Math.floor(Date.now() / 1000),
        },
      },
    ],

    // operatedBy: {
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: "User",
    // },
    updatedAt: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
    },
    createdAt: {
      type: Number,
      default: () => Math.floor(Date.now() / 1000),
    },
  },
  {
    collection: "chats",
  },
);

module.exports = mongoose.model("Chat", chatSchema);
