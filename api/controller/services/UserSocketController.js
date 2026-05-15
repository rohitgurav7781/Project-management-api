var io = null;
const User = require("../../models/User");

module.exports = {
  initSocket: async function (ioObj) {
    try {
      console.log("initSocket function");
      io = ioObj;

      io.on("connection", function (socket) {
        socket.on("updateSocketId", function (userId) {
          console.log("on updateSocketId");
          module.exports.updateUserSocketId(userId, socket.id);
        });

        socket.on("new_client", function (username) {
          //username = ent.encode(username);
          console.log("new connection");
          console.log(username);
          console.log(socket.id);
        });

        socket.on("message", function (message) {
          console.log(" current socket id");
          console.log(socket.id);
        });
      });
    } catch (err) {
      console.error(err);
    }
  },
  updateUserSocketId: async function (userId, socketId) {
    console.log(socketId);
    try {
      var result = await User.findByIdAndUpdate(userId, {
        socketId: socketId,
      });
      io.to(socketId).emit("updateSocketId", {
        status: "success",
        code: 1,
        message: "User Socket IO is updated sucessfully",
      });
    } catch (err) {
      console.error(err);
      io.to(socketId).emit("updateSocketId", {
        status: "failure",
        code: 6,
        message: "User Socket IO is not updated sucessfully",
      });
    }
  },
  //use this method to notify the particular user regarding changes in live data. so user will be in synchronous
  sendInfo2User: async function (senderId, clientMessageType, dataObj) {
    console.log("sendInfo2User");
    try {
      //  socket.to(senderId).emit(clientMessageType, dataObj);
      io.to(senderId).emit(clientMessageType, dataObj);
      console.log(senderId);
      console.log("sendInfo2User done");
    } catch (err) {
      console.error(err);
    }
  },
};
