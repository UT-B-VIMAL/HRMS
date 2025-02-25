const { registerUserSocket, unregisterUserSocket, userSockets } = require('../helpers/notificationHelper');
const db = require('../config/db');

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('Connected User for Notifications:', socket.id);

    socket.on('register_notification', async (data) => {
      const { userId } = data;
      console.log(`Registering notification for user ${userId} with socket ID ${socket.id}`);
      if (!userSockets[userId]) {
        userSockets[userId] = [];
      }
      if (!userSockets[userId].includes(socket.id)) {
        userSockets[userId].push(socket.id); // Add the socket ID to the array
        console.log(`Current socket IDs for user ${userId}:`, userSockets[userId]);
      }

      try {
        const [results] = await db.execute('SELECT id FROM users WHERE id = ?', [userId]);
        if (results.length > 0) {
          registerUserSocket(userId, socket.id); // Register the user socket
          console.log(`User ${userId} registered with socket ID ${socket.id}`);
          socket.emit('register', `User ${userId} registered with socket ID ${socket.id}`);
        } else {
          console.log(`User ID ${userId} not found.`);
          socket.emit('error', `User ID ${userId} not found.`);
        }
      } catch (err) {
        console.error('Error fetching user:', err);
        socket.emit('error', 'Error during registration.');
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('User disconnected:', socket.id, 'Reason:', reason);

      // Find the user ID associated with this socket ID
      let disconnectedUser = null;
      Object.keys(userSockets).forEach((userId) => {
        const index = userSockets[userId].indexOf(socket.id);
        if (index !== -1) {
          userSockets[userId].splice(index, 1); // Remove the socket ID from the array
          if (userSockets[userId].length === 0) {
            delete userSockets[userId]; // Remove the user if no sockets are left
          }
          disconnectedUser = userId;
        }
      });

      if (disconnectedUser) {
        console.log(`User ${disconnectedUser} disconnected.`);
        console.log(`Remaining socket IDs for user ${disconnectedUser}:`, userSockets[disconnectedUser]);
        unregisterUserSocket(socket.id);
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
