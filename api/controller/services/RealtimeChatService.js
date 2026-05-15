const Chat = require("../../models/Chat");
const User = require("../../models/User");
const Notification = require("../../models/Notification");

async function createChatNotification({
  io,
  receiverId,
  senderId,
  senderName,
  sessionId,
  messageText,
  chatDocId,
  isGroupChat,
  groupName,
}) {
  try {
    const receiver = await User.findById(receiverId).select("userType organizationId");
    if (!receiver) return;

    const title = isGroupChat ? `New message in ${groupName || "group"}` : `New message from ${senderName}`;

    const body = messageText?.length > 80 ? messageText.slice(0, 80) + "..." : messageText || "Sent an attachment";

    await Notification.create({
      userId: receiverId,
      senderId: senderId || null,
      organizationId: receiver.organizationId || null,
      title,
      body,
      type: "chat",
      userType: receiver.userType?.toLowerCase() || "employee",
      read: false,
      visibleOnHome: true,
      actionUrl: `/chat?session=${sessionId}`,
      recordId: chatDocId,
    });

    if (io) {
      io.to(`user:${String(receiverId)}`).emit("notification:new", {
        title,
        body,
        type: "chat",
        sessionId,
        senderId: senderId ? String(senderId) : null,
        senderName,
      });
    }
  } catch (err) {
    console.error("createChatNotification error:", err);
  }
}

const buildMessage = payload => ({
  message: payload?.message || "",
  fileUrl: payload?.fileUrl || "",
  linkUrl: payload?.linkUrl || "",
  messageType: payload?.messageType || "text",
  userType: payload?.userType || "sender",
  sender: payload?.sender || null,
  receiver: payload?.receiver || null,
  updatedAt: Math.floor(Date.now() / 1000),
});

async function persistMessage(sessionId, payload = {}) {
  const now = Math.floor(Date.now() / 1000);
  const messageDoc = buildMessage(payload);

  const chatDoc = await Chat.findOneAndUpdate(
    { sessionId },
    {
      $setOnInsert: { createdAt: now },
      $set: { updatedAt: now },
      $push: { chat: messageDoc },
    },
    { new: true, upsert: true },
  );

  const savedMessage = chatDoc.chat[chatDoc.chat.length - 1];

  return {
    chatDoc,
    message: savedMessage,
  };
}

module.exports = {
  register: io => {
    if (!io) return;

    io.on("connection", socket => {
      socket.on("user:register", async ({ userId }) => {
        if (userId) socket.join(`user:${userId}`);
        await User.findByIdAndUpdate(userId, { isOnline: true });
      });

      socket.on("chat:join", async payload => {
        try {
          const sessionId = payload?.sessionId;
          if (!sessionId) return;
          socket.join(sessionId);
          const chatDoc = await Chat.findOne({ sessionId });
          socket.emit("chat:history", {
            sessionId,
            messages: chatDoc?.chat || [],
          });
        } catch (err) {
          console.error("chat:join error", err);
        }
      });

      socket.on("chat:message", async payload => {
        try {
          const sessionId = payload?.sessionId;
          if (!sessionId || !payload?.message) return;

          const { chatDoc, message } = await persistMessage(sessionId, payload);

          // Populate sender
          let messageToEmit = message;
          if (message && message.sender) {
            const populatedChat = await Chat.findOne({ _id: chatDoc._id, "chat._id": message._id }, { "chat.$": 1 })
              .populate("chat.sender", "fname lname profileImage isOnline lastSeen")
              .populate("chat.receiver", "fname lname profileImage isOnline lastSeen")
              .lean();

            if (populatedChat?.chat?.[0]) {
              messageToEmit = populatedChat.chat[0];
            }
          }

          io.to(sessionId).emit("chat:newMessage", { sessionId, message: messageToEmit });

          const senderId = payload?.sender ? String(payload.sender) : "";
          let receiverIds = [];

          if (payload?.receiver) {
            receiverIds = [String(payload.receiver)];
          } else if (typeof sessionId === "string" && sessionId.startsWith("chat:")) {
            const parts = sessionId.split(":");
            if (parts.length >= 3) receiverIds = [parts[1], parts[2]];
          }

          const finalReceiverIds = receiverIds
            .map(x => String(x))
            .filter(Boolean)
            .filter(uid => !senderId || uid !== senderId)
            .filter((uid, idx, arr) => arr.indexOf(uid) === idx);

          // Fetch sender name once
          let senderName = "Someone";
          if (senderId) {
            const senderUser = await User.findById(senderId).select("fname lname");
            if (senderUser) {
              senderName = `${senderUser.fname || ""} ${senderUser.lname || ""}`.trim() || "Someone";
            }
          }

          const isGroupChat = !sessionId.startsWith("chat:");

          for (const uid of finalReceiverIds) {
            io.to(`user:${uid}`).emit("chat:newMessage", { sessionId, message: messageToEmit });

            await createChatNotification({
              io,
              receiverId: uid,
              senderId,
              senderName,
              sessionId,
              messageText: payload.message,
              chatDocId: chatDoc._id,
              isGroupChat,
              groupName: null,
            });
          }
        } catch (err) {
          console.error("chat:message error", err);
        }
      });

      socket.on("disconnect", async () => {
        console.log("Socket disconnected:", socket.id);
      });
    });
  },

  persistMessage,
};
