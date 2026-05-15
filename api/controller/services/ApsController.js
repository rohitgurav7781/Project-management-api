var apn = require('apn');
var path = require('path');
var conf = require('../../../apn/credential').credential;
// sandbox or production APN service

// configuring APN with credentials
const apnOptions = {
  token: {
    key: path.join(__dirname, '../../../', 'apn', 'AuthKey_N2RUQD469C.p8'),
    keyId: conf.apnKeyId,
    teamId: conf.apnTeamId,
  },
  production: true,
};

var apnProvider = new apn.Provider(apnOptions);

module.exports = {
  sendApsNotification: async function (fcmId, notification) {
    console.log(notification);
    let notification1 = new apn.Notification({
      alert: {
        title: notification.title,
        body: notification.body,
      },
      topic: 'com.neopaed.medimall',
      sound: 'default',
      payload: {
        title: notification.title,
        body: notification.body,
        icon:
          'https://ovaltine.s3.ap-south-1.amazonaws.com/LOGO_Ovantine-compressed.jpg',
        poster: notification.poster,
        type: notification.type,
        actionId: notification.actionId,
        actionTitle: notification.actionTitle,
        url: notification.url,
      },
      pushType: 'background',
    });
    apnProvider.send(notification1, [fcmId]).then((response) => {
      // successful device tokens
      console.log(response.sent);
      // failed device tokens
      console.log(response.failed);
    });
  },
};
