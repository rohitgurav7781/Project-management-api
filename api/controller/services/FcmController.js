var request = require("request");
const { fcm } = require("../../../config/connection");

module.exports = {
  sendFcmNotification: async function (fcmId, notification) {
    // this is to send fcm notification, start here
    let fcmData = {};
    let sound = "default";
    if (notification.type == "poster") {
      sound = "clock_alarm";
    }
    try {
      fcmData = {
        title: notification.title,
        sound: sound,
        body: notification.body,
        userType: notification.userType,
        subject: notification.subject,
        recordId: notification.recordId,
        poster: notification.poster,
        type: notification.type,
        actionId: notification.actionId,
        actionTitle: notification.actionTitle,
        isScheduled: notification.isScheduled,
        scheduledTime: notification.scheduledTime,
        url: notification.url,
        isScheduled: notification.isScheduled,
        scheduledTime: notification.scheduledTime,
      };
      console.log("fcmData--", fcmData);
      console.log("fcmId--", fcmId);
      console.log("fcmData.sound", fcmData.sound);
      // }
      var optionsFcm = {
        url: "https://fcm.googleapis.com/fcm/send",
        method: "POST",
        headers: {
          "User-Agent": "Super Agent/0.0.1",
          "Content-Type": "application/json",
          Authorization: "key=" + fcm.serverKey,
        },
        body: JSON.stringify({
          notification: {
            title: notification.title,
            body: notification.body,
            sound: fcmData.sound,
            id: Math.floor(Math.random() * 100 + 1),
          },
          data: fcmData,
          to: fcmId,
        }),
      };

      request(optionsFcm, function (error, response, body) {
        console.log("FCM message response", body);
        if (!error && response.statusCode == 200) {
        }
      });
    } catch (error) {
      console.error(error);
    }
    // end here
  },
  sendFcmToAll: async function (notification, fcm_tokens = []) {
    try {
      let fcmData = {};
      let sound = "default";

      if (fcm_tokens.length <= 0) {
        return;
      }

      fcmData = {
        title: notification.title,
        sound: sound,
        body: notification.body,
        subject: notification.subject,
        recordId: notification.recordId,
        poster: notification.poster,
        type: notification.type,
        actionId: notification.actionId,
        actionTitle: notification.actionTitle,
        isScheduled: notification.isScheduled,
        scheduledTime: notification.scheduledTime,
        url: notification.url,
      };

      var optionsFcm = {
        url: "https://fcm.googleapis.com/fcm/send",
        method: "POST",
        headers: {
          "User-Agent": "Super Agent/0.0.1",
          "Content-Type": "application/json",
          Authorization: "key=" + fcm.serverKey,
        },
        body: JSON.stringify({
          notification: {
            title: notification.title,
            body: notification.body,
            sound: fcmData.sound,
            id: Math.floor(Math.random() * 100 + 1),
          },
          data: fcmData,
          registration_ids: fcm_tokens,
        }),
      };

      request(optionsFcm, function (error, response, body) {
        console.log("FCM message response", body);
        if (!error && response.statusCode == 200) {
        }
      });
    } catch (error) {
      console.log(error);
    }
  },
};
