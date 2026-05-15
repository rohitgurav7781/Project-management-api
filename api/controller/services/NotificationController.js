// this is controller is created to handle all user notification related request,
// this controller will decide what ara all methods used to send notification like email, sms etc
var request = require("request");
let mongoose = require("mongoose");
const connection = require("./../../../config/connection");
const EmailController = require("./EmailController");
const SmsController = require("./SmsController");
const UserSocketController = require("./UserSocketController");
const User = require("./../../models/User");
const Notification = require("./../../models/Notification");
const NotificationTemplate = require("./../../models/NotificationTemplate");
const UtilController = require("./../services/UtilController");
const FcmController = require("./../services/FcmController");

let hostName = connection.hostName;
module.exports = {
  replaceDynamicVariable: async (notificationData, notification) => {
    let data = notificationData;

    try {
      for (keys in notification.data) {
        let tempRep = new RegExp("<%" + keys + "%>", "g");

        data = data.replace(tempRep, notification.data[keys]);
      }
    } catch (err) {
      console.error(err);
    }
    return data;
  },
  replaceTemplateDynamicVariable: async notification => {
    let data = "";
    let templateSubject = "";
    try {
      let template = await NotificationTemplate.findOne({
        title: notification.title,
        active: true,
        publish: true,
        notificationType: notification.type,
      });
      if (!UtilController.isEmpty(template)) {
        data = template.content;
        if (notification.type === "email") {
          templateSubject = template.subject;
        } else if (notification.type === "notice") {
          templateSubject = template.subject;
        } else if (notification.type === "notification") {
          templateSubject = template.subject;
        }
        let keys,
          values = "";
        let tempRep;
        if (notification.data["draftLink"]) {
          notification.data["draftLink"] = notification.data["draftLink"].map(url => `${url}`).join("\n");
        }

        if (notification.data["finalDesignLink"]) {
          notification.data["finalDesignLink"] = notification.data["finalDesignLink"].map(url => `${url}`).join("\n");
        }
        for (let i = 0; i < template.dynamicVariable.length; i++) {
          keys = template.dynamicVariable[i].label;
          tempRep = new RegExp("<%" + keys + "%>", "g");
          values = notification.data[keys];

          if (values !== undefined && values.length > template.dynamicVariable[i].contentLength) {
            values = values.substr(0, template.dynamicVariable[i].contentLength);
          }

          data = data.replace(tempRep, values);
          templateSubject = templateSubject.replace(tempRep, values); // this is for the email subject, if it contain dynamicVariable then needs to replace
        }
      }
    } catch (err) {
      console.error(err);
    }
    let returnData = {
      content: data,
      subject: templateSubject,
    };
    return returnData;
  },
  // replaceTemplateDynamicVariable: async (notification, userType) => {
  //   let data = "";
  //   let templateSubject = "";
  //   let templateTitle = "";
  //   try {
  //     let template = await NotificationTemplate.findOne({
  //       title: notification.title,
  //       userType: userType,
  //       active: true,
  //       publish: true,
  //       //  areaId: mongoose.Types.ObjectId(notification.areaId),
  //       notificationType: notification.notificationType,
  //     });
  //     // console.log('inisde dynamic temple', template)
  //     if (!UtilController.isEmpty(template)) {
  //       data = template.content;
  //       templateTitle = template.title;
  //       if (notification.notificationType === "email") {
  //         // Create a buffer from the string
  //         let bufferObj = Buffer.from(template.content, "base64");
  //         // Encode the Buffer as a utf8 string
  //         let decodedContent = bufferObj.toString("utf8");
  //         data = decodedContent;
  //         templateSubject = template.subject;
  //       } else if (notification.notificationType === "notice") {
  //         templateSubject = template.subject;
  //       } else {
  //         templateSubject = template.subject;
  //       }
  //       let keys,
  //         values = "";
  //       let tempRep;
  //       for (let i = 0; i < template.dynamicVariable.length; i++) {
  //         keys = template.dynamicVariable[i].label;
  //         tempRep = new RegExp("<%" + keys + "%>", "g");

  //         values = notification.data[keys];

  //         if (
  //           values !== undefined &&
  //           values.length > template.dynamicVariable[i].contentLength
  //         ) {
  //           values = values.substr(
  //             0,
  //             template.dynamicVariable[i].contentLength
  //           );
  //         }

  //         data = data.replace(tempRep, values);
  //         templateSubject = templateSubject.replace(tempRep, values); // this is for the email subject, if it contain dynamicVariable then needs to replace
  //         templateTitle = templateTitle.replace(tempRep, values);
  //       }
  //     }
  //   } catch (err) {
  //     console.error(err);
  //   }
  //   let returnData = {
  //     content: data,
  //     subject: templateSubject,
  //     title: templateTitle,
  //   };
  //   return returnData;
  // },
  userMobileNoOtp: async notification => {
    try {
      notification["title"] = "loginOTP";
      notification["notificationType"] = "sms";
      let notifyTemplate = {};
      notifyTemplate = await module.exports.replaceTemplateDynamicVariable(notification);
      SmsController.sendCustomerSMS({
        mobileNo: notification.mobileNo,
        message: notifyTemplate.content,
        otp: notification.otp,
        hashCode: notification.hashCode,
        templateId: connection.smsGateway.otpTemplateId,
        //areaId:notification.areaId
      });
    } catch (err) {
      console.error(err);
    }
  },
  sendUserOtp: async notification => {
    try {
      notification["title"] = "loginOTP";
      notification["notificationType"] = "sms";
      let notifyTemplate = {};
      notifyTemplate = await module.exports.replaceTemplateDynamicVariable(notification);
      let defaultNumber = [8948080894, 7989527468, 7307134521, 9100766889, 9566593919, 8686200686];
      if (!defaultNumber.includes(parseInt(notification.mobileNo))) {
        SmsController.sendCustomerSMS({
          mobileNo: notification.mobileNo,
          message: notifyTemplate.content,
          otp: notification.otp,
          hashCode: notification.hashCode,
          templateId: connection.smsGateway.otpTemplateId,
          //  areaId:notification.areaId
        });
      }
      // notification["notificationType"] = "email";
      // notifyTemplate = await module.exports.replaceTemplateDynamicVariable(
      //   notification
      // );

      // notifyTemplate["toAddresses"] = notification.email;

      // EmailController.sendCustomMail(notifyTemplate);
    } catch (err) {
      console.error(err);
    }
  },
  replaceTemplateDynamicVariable: async (notification, userType) => {
    // console.log(notification.data);
    let templateContent = "";
    let templateSubject = "";
    let templateTitle = "";
    try {
      let template = await NotificationTemplate.findOne({
        subject: notification.subject,
        userType: { $regex: userType, $options: "i" },
        active: true,
      });
      if (!UtilController.isEmpty(template)) {
        templateContent = template.content;
        templateTitle = template.title;
        if (notification.notificationType === "email" || notification.notificationType === "inapp") {
          // Create a buffer from the string
          let bufferObj = Buffer.from(template.content, "base64");
          // Encode the Buffer as a utf8 string
          let decodedContent = bufferObj.toString("utf8");
          data = decodedContent;
          templateSubject = template.subject;
        } else if (notification.notificationType === "notice") {
          templateSubject = template.subject;
        } else {
          templateSubject = template.subject;
        }
        let keys;
        let values = "";
        let tempRep;
        for (let i = 0; i < template.dynamicVariable.length; i++) {
          keys = template.dynamicVariable[i].label;
          tempRep = new RegExp("<%" + keys + "%>", "g");

          values = notification.data[keys];

          if (values !== undefined && values.length > template.dynamicVariable[i].contentLength) {
            values = values.substr(0, template.dynamicVariable[i].contentLength);
          }

          templateContent = templateContent.replace(tempRep, values);
          templateTitle = templateTitle.replace(tempRep, values);
          templateSubject = templateSubject.replace(tempRep, values); // this is for the email subject, if it contain dynamicVariable then needs to replace
        }
      }
    } catch (err) {
      console.error(err);
    }
    let returnData = {
      content: templateContent,
      subject: templateSubject,
      title: templateTitle,
    };
    return returnData;
  },
  createNotificationObj: async (notifyTemplate, notification) => {
    try {
      notifyTemplate["subject"] = notifyTemplate?.subject;
      notifyTemplate["body"] = notifyTemplate?.content;
      notifyTemplate["title"] = notifyTemplate?.title;
      notifyTemplate["userId"] = notification?.userId;
      notifyTemplate["notificationType"] = notification?.notificationType;
      notifyTemplate["userType"] = notification?.userType;
      notifyTemplate["actionUrl"] = notification?.actionUrl;
      notifyTemplate["recordId"] = notification?.recordId;
      notifyTemplate["loginAlertCount"] = notification?.loginAlertCount;
      notifyTemplate["organizationId"] = notification?.organizationId;
      notifyTemplate["type"] = notification?.type;

      let result = await module.exports.addToNotification(notifyTemplate);
        // console.log(result,"from notification")
      let fcmId = notification?.fcmId;
      // if (!UtilController.isEmpty(fcmId)) {
      //   FcmController.sendFcmNotification(fcmId, notifyTemplate);
      // }
      return result;
    } catch (error) {
      console.log("error--", error);
    }
  },
  sendDeliveryOtp: async notification => {
    try {
      notification["title"] = "deliveryOTP";
      notification["notificationType"] = "sms";
      let notifyTemplate = {};
      notifyTemplate = await module.exports.replaceTemplateDynamicVariable(notification);
      SmsController.sendCustomerSMS({
        mobileNo: notification.mobileNo,
        message: notifyTemplate.content,
        otp: notification.otp,
        hashCode: notification.hashCode,
        templateId: connection.smsGateway.templateId,
        //  areaId:notification.areaId
      });
    } catch (err) {
      console.error(err);
    }
  },
  userRegistration: async function (notification) {
    let emailObj = {
      data: {
        unsubscribe: hostName + "/user/unsubscribe/" + notification.emailId,
      },
      toAddresses: notification.emailId,
      //receiverName: notification.receiverName,
      emailSubject: "Welcome to the world of Policies",
    };
    EmailController.sendUserMail("./templates/email/registration.html", emailObj);
  },
  emailVerification: async function (notification) {
    let token = Math.random().toString(36).slice(-10);
    let emailObj = {
      data: {
        unsubscribe: hostName + "/user/unsubscribe/" + notification.emailId,
        //confirmation: hostName + "/user/email/confirmation?email=" + notification.emailId + "&category=" + notification.userType + "&token=" + token,
        confirmation:
          hostName + "/#/email/confirmation/" + notification.emailId + "/" + notification.userType + "/" + token,
        toAddresses: notification.emailId,
        receiverName: notification.receiverName,
      },
      toAddresses: notification.emailId,
      receiverName: notification.receiverName,
      emailSubject: "Confirm The Policy Table Account",
    };
    EmailController.sendUserMail("./templates/email/confirmation.html", emailObj);
  },
  notifyUserRegistration: async function (notification) {
    let emailObj = {
      data: {
        unsubscribe: hostName + "/user/unsubscribe/" + notification.emailId,
        name: notification.name,
        email: notification.email,
        mobileNo: notification.mobileNo,
        organisation: notification.organization,
        industryType: notification.industryType,
        headCount: notification.headCount,
      },
      toAddresses: notification.emailId,
      //receiverName: notification.receiverName,
      emailSubject: notification.name + " is registed on The Policy Table",
    };
    EmailController.sendUserMail("./templates/email/notifyUserRegistrationToPimarq.html", emailObj);
  },
  forgotPassword: async function (notification) {
    // Read the email template from database
    notification["data"] = {
      receiverName: notification.receiverName,
      password: notification.password,
      unsubscribe: hostName + "/admin/unsubscribe/" + notification.emailId,
      toAddresses: notification.emailId,
      resetLink: hostName + "/#/user/password/generate?token=" + notification.password,
    };
    notification["title"] = "resetPassword";
    notification["notificationType"] = "email";
    notifyTemplate = await module.exports.replaceTemplateDynamicVariable(notification);

    notifyTemplate["toAddresses"] = notification.emailId;
    EmailController.sendCustomMail(notifyTemplate);
  },
  newRegistration: async function (notification) {
    // Read the email template from database
    notification["data"] = {
      receiverName: notification.receiverName,
      confirmation: hostName + "/#/register/admin?ui=" + notification.confirmation,
      unsubscribe: hostName + "/admin/unsubscribe/" + notification.emailId,
      toAddresses: notification.emailId,
      resetLink: hostName + "/#/registration/admin?ui=" + notification.password,
    };
    notification["title"] = "newRegistration";
    notification["notificationType"] = "email";
    notifyTemplate = await module.exports.replaceTemplateDynamicVariable(notification);

    notifyTemplate["toAddresses"] = notification.emailId;
    EmailController.sendCustomMail(notifyTemplate);
  },
  generatedPassword: async function (notification) {
    // Old code

    // let emailObj = {
    //   data: {
    //     receiverName: notification.receiverName,
    //     password: notification.password,
    //     unsubscribe: hostName + "/admin/unsubscribe/" + notification.emailId,
    //     toAddresses: notification.emailId,
    //   },
    //   toAddresses: notification.emailId,
    //   emailSubject: "Your new password for Admin account login",
    // };
    // EmailController.sendUserMail(
    //   "./templates/email/generatedPassword.html",
    //   emailObj
    // );

    notification["data"] = {
      receiverName: notification.receiverName,
      password: notification.password,
      unsubscribe: hostName + "/admin/unsubscribe/" + notification.emailId,
      toAddresses: notification.emailId,
    };
    notification["title"] = "newPassword";
    notification["notificationType"] = "email";
    notifyTemplate = await module.exports.replaceTemplateDynamicVariable(notification);

    notifyTemplate["toAddresses"] = notification.emailId;

    EmailController.sendCustomMail(notifyTemplate);
  },
  userCredentials: async notification => {
    try {
      console.log("notification", notification);
      notification["title"] = "userCredentials";
      notification["notificationType"] = "email";
      let notifyTemplate = await module.exports.replaceTemplateDynamicVariable(notification);
      //notifyTemplate['areaId']=notification.areaId;
      notifyTemplate["toAddresses"] = notification.email;
      EmailController.sendCustomMail(notifyTemplate);
      // let userResult = await User.findById(notification.userId);
      // let emailObj = {
      //   data: {
      //     date: module.exports.getformatedDate(Math.floor(Date.now() / 1000)),
      //     receiverName: userResult.name,
      //     organization: userResult.organisation,
      //     password: notification.password,
      //     userName: notification.userName,
      //     unsubscribe: hostName + "/user/unsubscribe/" + userResult.email,
      //     toAddresses: userResult.email,
      //   },
      //   toAddresses: userResult.email,
      //   emailSubject: "Your login credentials for The Policy Table",
      // };
      // EmailController.sendUserMail(
      //   "./templates/email/userCredentials.html",
      //   emailObj
      // );
    } catch (err) {
      console.error(err);
    }
  },
  addToNotification: async notification => {
    try {
      notification["createdAt"] = Math.floor(Date.now() / 1000);
      const result = await Notification.create(notification);
      return result;
    } catch (err) {
      console.error(err);
    }
  },
  sendFcmMessage: async (fcmId, notification) => {
    try {
      await module.exports.addToNotification(notification);

      FcmController.sendFcmNotification(fcmId, notification);
    } catch (err) {
      console.error(err);
    }
  },
  getformatedDate: function (unix_timestamp) {
    if (unix_timestamp == "" || unix_timestamp == undefined) {
      return "-";
    }
    var a = new Date(unix_timestamp * 1000);
    //var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    var year = a.getFullYear();
    var month = months[a.getMonth()];
    var date = a.getDate();
    var hour = a.getHours();
    var min = a.getMinutes();
    var sec = a.getSeconds();
    //var time = pad(date, 2) + '-' +  pad(month, 2) + '-' + year + ' ' + pad(hour, 2) + ':' + pad(min, 2) + ':' + pad(sec, 2);
    var time = module.exports.pad(date, 2) + "-" + module.exports.pad(month, 2) + "-" + year;
    return time;
  },
  pad: function (num, size) {
    var s = num + "";
    while (s.length < size) s = "0" + s;
    return s;
  },
  sendFcmNotification: async notification => {
    try {
      let userResult = {};
      let userType = "";
      let fcmId = "";
      notification["subject"] = notification.status;
      notification["notificationType"] = "notification";

      if (!UtilController.isEmpty(notification.userId)) {
        userResult = await User.findById(notification.userId);
        fcmId = userResult.fcmToken;
        userType = userResult.userType;
        notification["data"] = {
          userName: userResult["fname"],
        };
      }

      let notifyTemplate = await module.exports.replaceTemplateDynamicVariable(notification, userType);
      // console.log('notifyTemplate--', notifyTemplate);

      notifyTemplate["body"] = notifyTemplate["content"];
      notifyTemplate["userId"] = notification["userId"];
      notifyTemplate["type"] = notification["type"];
      notifyTemplate["userType"] = notification["userType"];
      notifyTemplate["recordId"] = notification["recordId"];

      if (!UtilController.isEmpty(notifyTemplate.subject)) {
        // console.log('add to notification coll--')
        await module.exports.addToNotification(notifyTemplate);
        FcmController.sendFcmNotification(fcmId, notifyTemplate);
      }
    } catch (error) {
      console.error(error);
    }
  },
  sendInAppNotification: async function sendNotification(notification) {
    const notificationData = {
      userType: notification?.userType,
      recordId: notification?.recordId,
      userId: notification?.userId,
      actionUrl: notification?.actionUrl,
      subject: notification?.subject,
      notificationType: notification?.notificationType,
      data: notification?.data,
      loginAlertCount:notification?.loginAlertCount,
      organizationId:notification?.organizationId
    };

    const notifyTemplate = await module.exports.replaceTemplateDynamicVariable(
      notificationData,
      notificationData?.userType,
    );
    await module.exports.createNotificationObj(notifyTemplate, notificationData);
  },
};
