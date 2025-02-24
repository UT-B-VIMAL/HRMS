const userSockets = {};

const registerUserSocket = (userId, socketId) => {
  if (!userSockets[userId]) {
    userSockets[userId] = [];
  }
  userSockets[userId].push(socketId);
};

const unregisterUserSocket = (socketId) => {
  Object.keys(userSockets).forEach((userId) => {
    const index = userSockets[userId].indexOf(socketId);
    if (index !== -1) {
      userSockets[userId].splice(index, 1);
      if (userSockets[userId].length === 0) {
        delete userSockets[userId];
      }
    }
  });
};

module.exports = {
  registerUserSocket,
  unregisterUserSocket,
  userSockets,
};
