const userSockets = {};
const registerSocket = (userId, socketId) => {
  if (!userSockets[userId]) {
    userSockets[userId] = [];
  }
  if (!userSockets[userId].includes(socketId)) {
    userSockets[userId].push(socketId);
    console.log(`Registering notification for user ${userId} with socket ID ${socketId}`);
    console.log(`Current socket IDs for user ${userId}:`, userSockets[userId]);
  } else {
    console.log(`Socket ID ${socketId} is already registered for user ${userId}`);
  }
};
const unregisterSocket = (userId, socketId) => {
  if (userSockets[userId]) {
    userSockets[userId] = userSockets[userId].filter(id => id !== socketId);
    if (userSockets[userId].length === 0) {
      delete userSockets[userId];
    }
    console.log(`User ${userId} disconnected.`);
    console.log(`Remaining socket IDs for user ${userId}:`, userSockets[userId] || []);
  }
};
module.exports = {
  userSockets,
  registerSocket,
  unregisterSocket,
};
