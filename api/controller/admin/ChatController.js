const Chat = require("../../models/Chat");
const RealtimeChatService = require("../services/RealtimeChatService");
const UtilController = require("../services/UtilController");
const Notification = require("../../models/Notification");
const User = require("../../models/User");

module.exports = {
  // ensure a chat document exists for a given session id
  ensureSession: async (req, res, next) => {
    try {
      const sessionId = req.body?.sessionId;

      if (UtilController.isEmpty(sessionId)) {
        return UtilController.sendError(req, res, next, {
          message: "sessionId is required",
        });
      }

      const now = Math.floor(Date.now() / 1000);
      const chatDoc = await Chat.findOneAndUpdate(
        { sessionId },
        { $setOnInsert: { createdAt: now, updatedAt: now } },
        { upsert: true, new: true },
      );

      UtilController.sendSuccess(req, res, next, {
        sessionId,
        chatId: chatDoc?._id,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
  getChatMediaBySession: async (req, res, next) => {
    try {
      const { sessionId } = req.body;

      const chatData = await Chat.findOne({ sessionId });

      if (UtilController.isEmpty(sessionId)) {
        return UtilController.sendError(req, res, next, {
          message: "sessionId  required",
        });
      }

      const response = {
        audio: [],
        video: [],
        images: [],
        links: [],
        docs: [],
      };

      chatData.chat.forEach(msg => {
        // Images
        if (msg.messageType === "image" && msg.fileUrl) {
          response.images.push(msg.fileUrl);
        }

        // Videos
        else if (msg.messageType === "video" && msg.fileUrl) {
          response.video.push(msg.fileUrl);
        }

        // Audio
        else if (msg.messageType === "audio" && msg.fileUrl) {
          response.audio.push(msg.fileUrl);
        }

        // Documents (pdf, doc, etc.)
        else if (["pdf", "doc", "docx", "xls", "xlsx"].includes(msg.messageType) && msg.fileUrl) {
          response.docs.push(msg.fileUrl);
        }

        // Links (detect from text messages)
        else if (msg.messageType === "text" && msg.message) {
          const urlRegex = /(https?:\/\/[^\s]+)/g;
          const matches = msg.message.match(urlRegex);

          if (matches) {
            matches.forEach(url => {
              response.links.push(url);
            });
          }
        }
      });

      UtilController.sendSuccess(req, res, next, {
        response,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  deleteForMe: async (req, res, next) => {
    try {
      const { chatId, messageId, userId } = req.body;

      const chat = await Chat.findOneAndUpdate(
        {
          _id: chatId,
          "chat._id": messageId,
        },
        {
          $addToSet: {
            "chat.$.deletedFor": userId,
          },
        },
        { new: true },
      );

      UtilController.sendSuccess(req, res, next, {
        data: chat,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  deleteForEveryone: async (req, res, next) => {
    try {
      const { chatId, messageId, userId } = req.body;

      const chat = await Chat.findOne({
        _id: chatId,
        "chat._id": messageId,
      });

      if (!chat) {
        return res.status(404).json({ message: "Chat not found" });
      }

      const message = chat.chat.id(messageId);

      // Only sender can delete for everyone
      if (message.sender.toString() !== userId) {
        return res.status(403).json({
          message: "Only sender can delete this message for everyone",
        });
      }

      message.isDeletedForEveryone = true;
      message.message = "This message was deleted";
      message.fileUrl = "";

      await chat.save();

      // Emit realtime event so all participants update UI without refresh
      const io = req.app.get("io");
      if (io && chat.sessionId) {
        io.to(String(chat.sessionId)).emit("chat:deletedForEveryone", {
          sessionId: String(chat.sessionId),
          messageId: String(messageId),
        });
      }

      UtilController.sendSuccess(req, res, next, {
        data: chat,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  listMessages: async (req, res, next) => {
    try {
      const { sessionId, userId } = req.body || {};

      if (UtilController.isEmpty(sessionId)) {
        return UtilController.sendError(req, res, next, {
          message: "sessionId is required",
        });
      }

      const chatDoc = await Chat.findOne({ sessionId })
        .populate("chat.sender", "fname lname profileImage isOnline lastSeen")
        .populate("chat.receiver", "fname lname profileImage isOnline lastSeen");

      const chatId = chatDoc?._id || null;
      let messages = chatDoc?.chat || [];

      // If a userId is provided, filter out messages that were deleted for this user
      if (!UtilController.isEmpty(userId)) {
        const uid = String(userId);
        messages = messages.filter(m => {
          if (!m) return false;
          const deletedFor = Array.isArray(m.deletedFor)
            ? m.deletedFor.map(x => (x && x.toString ? x.toString() : String(x)))
            : [];
          return !deletedFor.includes(uid);
        });
      }

      UtilController.sendSuccess(req, res, next, {
        sessionId,
        chatId,
        messages,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  sendMessage: async (req, res, next) => {
    console.log("sendMessage called");
    try {
      const { sessionId, message, userType, sender, receiver, replyTo } = req.body;
      const file = req.file;

      if (UtilController.isEmpty(sessionId)) {
        return UtilController.sendError(req, res, next, {
          message: "sessionId is required",
        });
      }

      let messageType = "text";
      let fileUrl = null;

      if (file) {
        fileUrl = `/uploads/chat/${file.filename}`;

        if (file.mimetype.startsWith("image")) {
          messageType = "image";
        } else if (file.mimetype.startsWith("video")) {
          messageType = "video";
        } else if (file.mimetype.startsWith("audio")) {
          messageType = "audio";
        } else if (file.mimetype === "application/pdf") {
          messageType = "pdf";
        } else {
          messageType = "file";
        }
      }

      if (!message && !file) {
        return UtilController.sendError(req, res, next, {
          message: "Message or file is required",
        });
      }

      // Persist message to DB
      const { chatDoc, message: savedMessage } = await RealtimeChatService.persistMessage(sessionId, {
        message: message || "",
        fileUrl,
        messageType,
        userType,
        sender,
        receiver,
        replyTo: replyTo || null,
      });

      // Populate sender information before emitting
      let messageToEmit = savedMessage;
      if (savedMessage && savedMessage.sender) {
        const populatedMessage = await Chat.findOne({ _id: chatDoc._id, "chat._id": savedMessage._id }, { "chat.$": 1 })
          .populate("chat.sender", "fname lname profileImage isOnline lastSeen")
          .lean();

        if (populatedMessage?.chat?.[0]) {
          messageToEmit = populatedMessage.chat[0];
        }
      }

      // Emit socket event for real-time message delivery
      const io = req.app.get("io");
      const senderId = sender ? String(sender) : "";

      // Build receiver ID list
      let receiverIds = [];
      if (receiver) {
        receiverIds = [String(receiver)];
      } else if (typeof sessionId === "string" && sessionId.startsWith("chat:")) {
        const parts = sessionId.split(":");
        if (parts.length >= 3) receiverIds = [parts[1], parts[2]];
      }

      const finalReceiverIds = receiverIds
        .map(x => String(x))
        .filter(Boolean)
        .filter(uid => !senderId || uid !== senderId)
        .filter((uid, idx, arr) => arr.indexOf(uid) === idx);

      if (io && messageToEmit) {
        // Broadcast to the chat room (users with chat open)
        io.to(sessionId).emit("chat:newMessage", {
          sessionId,
          message: messageToEmit,
        });

        // Broadcast to each receiver's personal room
        finalReceiverIds.forEach(uid => {
          io.to(`user:${uid}`).emit("chat:newMessage", {
            sessionId,
            message: messageToEmit,
          });
        });
      }

      // Create notifications for receivers (same pattern as LeaveRequest)
      if (finalReceiverIds.length > 0) {
        // Fetch sender name once
        let senderName = "Someone";
        if (senderId) {
          try {
            const senderUser = await User.findById(senderId).select("fname lname");
            if (senderUser) {
              senderName = `${senderUser.fname || ""} ${senderUser.lname || ""}`.trim() || "Someone";
            }
          } catch (err) {
            console.error("Error fetching sender info:", err);
          }
        }

        const isGroupChat = !sessionId.startsWith("chat:");

        // Determine notification body based on message type
        let notifBody;
        if (file) {
          if (messageType === "image") notifBody = "📷 Sent a photo";
          else if (messageType === "video") notifBody = "🎥 Sent a video";
          else if (messageType === "audio") notifBody = "🎵 Sent an audio";
          else if (messageType === "pdf") notifBody = "📄 Sent a document";
          else notifBody = "📎 Sent a file";
        } else {
          notifBody = (message || "").length > 80 ? message.slice(0, 80) + "..." : message || "";
        }

        for (const uid of finalReceiverIds) {
          try {
            const receiverUser = await User.findById(uid).select("userType organizationId");
            if (!receiverUser) continue;

            const notifTitle = isGroupChat ? `New group message` : `New message from ${senderName}`;

            // Save to Notification collection (appears in notification bell)
            await Notification.create({
              userId: uid,
              senderId: sender || null,
              organizationId: receiverUser.organizationId || null,
              title: notifTitle,
              body: notifBody,
              type: "chat",
              userType: receiverUser.userType?.toLowerCase() || "employee",
              read: false,
              visibleOnHome: true,
              actionUrl: `/chat?session=${sessionId}`,
              recordId: chatDoc._id,
            });

            // Emit notification:new so frontend plays sound + shows toast
            if (io) {
              io.to(`user:${uid}`).emit("notification:new", {
                title: notifTitle,
                body: notifBody,
                type: "chat",
                sessionId,
                senderId: senderId || null,
                senderName,
              });
            }
          } catch (notifErr) {
            console.error(`Error creating notification for user ${uid}:`, notifErr);
          }
        }
      }

      UtilController.sendSuccess(req, res, next, {
        sessionId,
        message: savedMessage,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },

  addReaction: async (req, res, next) => {
    try {
      const { sessionId, messageId, userId, reaction } = req.body;

      if (UtilController.isEmpty(sessionId) || UtilController.isEmpty(messageId)) {
        return UtilController.sendError(req, res, next, {
          message: "sessionId and messageId are required",
        });
      }

      // Find the chat and update the specific message's reactions
      const chatDoc = await Chat.findOne({ sessionId });
      if (!chatDoc) {
        return UtilController.sendError(req, res, next, {
          message: "Chat session not found",
        });
      }

      const message = chatDoc.chat.find(m => String(m._id) === String(messageId));
      if (!message) {
        return UtilController.sendError(req, res, next, {
          message: "Message not found",
        });
      }

      // Initialize reactions array if it doesn't exist
      if (!message.reactions) {
        message.reactions = [];
      }

      // Check if user already reacted with this emoji
      const existingReactionIndex = message.reactions.findIndex(
        r => String(r.userId) === String(userId) && r.reaction === reaction
      );

      if (existingReactionIndex > -1) {
        // Remove the reaction if it already exists (toggle)
        message.reactions.splice(existingReactionIndex, 1);
      } else {
        // Remove any previous reaction from this user and add the new one
        message.reactions = message.reactions.filter(r => String(r.userId) !== String(userId));
        message.reactions.push({
          userId,
          reaction,
        });
      }

      // Save the updated chat document
      await chatDoc.save();

      // Emit socket event for real-time reaction update
      const io = req.app.get("io");
      if (io) {
        io.to(sessionId).emit("chat:reactionUpdate", {
          sessionId,
          messageId,
          reactions: message.reactions,
        });
      }

      UtilController.sendSuccess(req, res, next, {
        sessionId,
        messageId,
        reactions: message.reactions,
      });
    } catch (err) {
      UtilController.sendError(req, res, next, err);
    }
  },
};
