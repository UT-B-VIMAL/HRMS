const { registerSocket, unregisterSocket, userSockets } = require('../helpers/notificationHelper');
const db = require('../config/db');
module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`Connected User for Notifications: ${socket.id}`);
    socket.on('register_notification', ({ userId }) => {
      registerSocket(userId, socket.id);
    });
    socket.on('disconnect', (reason) => {
      console.log(`User disconnected: ${socket.id} Reason: ${reason}`);
      for (const userId in userSockets) {
        if (userSockets[userId].includes(socket.id)) {
          unregisterSocket(userId, socket.id);
          break;
        }
      }
    });
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
    socket.on('connect_error', (error) => {
      console.error('Socket connect error:', error);
    });
  });
};