const userSockets = {}; // Store user socket connections

const sendNotificationToAdmins = (io, message) => {
  io.emit('admin_notification', { message });
};

const registerUserSocket = (userId, socketId) => {
  userSockets[userId] = socketId;
};

const unregisterUserSocket = (socketId) => {
  for (const userId in userSockets) {
    if (userSockets[userId] === socketId) {
      delete userSockets[userId];
      break;
    }
  }
};

module.exports = {
  sendNotificationToAdmins,
  registerUserSocket,
  unregisterUserSocket,
  userSockets,
};
