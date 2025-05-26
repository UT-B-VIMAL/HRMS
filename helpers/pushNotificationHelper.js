const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = require('../config/firebaseServiceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const sendPushNotification = (deviceTokens, payload) => {
  const message = {
    notification: {
      title: payload.title,
      body: payload.body,
    },
    tokens: deviceTokens,
  };

  admin.messaging().sendMulticast(message)
    .then(response => {
      console.log('Successfully sent push notifications:', response);
    })
    .catch(error => {
      console.error('Error sending push notifications:', error);
    });
};

module.exports = {
  sendPushNotification,
};
