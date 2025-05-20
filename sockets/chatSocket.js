const db = require('../config/db');
const moment = require('moment-timezone');
const connectedUsers = {};

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('Connected User for Chat:', socket.id);

    socket.on('register', async (data) => {
      const { ticket_id, id } = data;
      const key = `${ticket_id}_${id}`;

      if (connectedUsers[key]) {
        console.log(`User ${key} is already connected with socket ID ${connectedUsers[key]}. Rejecting new connection.`);
        socket.emit('error', 'User is already connected on another socket.');
        socket.disconnect();
        return;
      }

      try {
        if (id != 0) {
          const [results] = await db.execute('SELECT id FROM users WHERE id = ?', [id]);
          if (results.length > 0) {
            connectedUsers[key] = socket.id;
            console.log(`User ${key} registered with socket ID ${socket.id}`);
            socket.emit('register', `User ${key} registered with socket ID ${socket.id}`);
          } else {
            console.log(`User ID ${id} not found.`);
            socket.emit('error', `User ID ${id} not found.`);
          }
        } else {
          connectedUsers[key] = socket.id;
          console.log(`User ${key} registered with socket ID ${socket.id}`);
          socket.emit('register', `User ${key} registered with socket ID ${socket.id}`);
        }
      } catch (err) {
        console.error('Error fetching user:', err);
        socket.emit('error', 'Error during registration.');
      }
    });

    socket.on('read type', async (data) => {
      try {
        const { ticket_id, user_id } = data;

        const [result] = await db.execute(
          `UPDATE ticket_comments SET type = 1 WHERE receiver_id = ? AND ticket_id = ?`,
          [user_id, ticket_id]
        );

        if (result.affectedRows > 0) {
          console.log(`Updated ${result.affectedRows} record(s) in ticket_comments.`);
          socket.emit('msg', 'Message marked as read.');
        } else {
          console.log('No records updated.');
          socket.emit('msg', 'No matching records found.');
        }
      } catch (error) {
        console.error('Error updating message type:', error);
      }
    });

    socket.on('load messages', async (ticket_id) => {
      try {
        const [comments] = await db.execute(
          `SELECT 
            tc.id,
            tc.ticket_id,
            tc.sender_id,
            tc.receiver_id,
            tc.comments,
            CASE 
              WHEN tc.sender_id = 0 THEN 'Anonymous'
              ELSE CONCAT(COALESCE(sender.first_name, ''), ' ', COALESCE(NULLIF(sender.last_name, ''), '')) 
            END AS sender_name,
            CASE 
              WHEN tc.receiver_id = 0 THEN 'Anonymous'
              ELSE CONCAT(COALESCE(receiver.first_name, ''), ' ', COALESCE(NULLIF(receiver.last_name, ''), '')) 
            END AS receiver_name,
            tc.created_at
          FROM ticket_comments tc
          LEFT JOIN users sender ON tc.sender_id = sender.id AND tc.sender_id != 0
          LEFT JOIN users receiver ON tc.receiver_id = receiver.id AND tc.receiver_id != 0
          WHERE tc.ticket_id = ? AND tc.deleted_at IS NULL
          ORDER BY tc.created_at ASC`,
          [ticket_id]
        );

        socket.emit('load messages', comments);
      } catch (error) {
        console.error('Error fetching ticket history:', error.message);
      }
    });

    socket.on('chat message', async (data) => {
      try {
        const { ticket_id, sender_id, receiver_id, comments, datetime } = data;

        console.log('Received data:', data);

        socket.emit('values', `ticket_id:${ticket_id}-sender_id:${sender_id}-receiver_id:${receiver_id}-comments:${comments}`);
        // const istTime = moment().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
        // console.log("isttime",istTime);
        
        const [result] = await db.execute(
          `INSERT INTO ticket_comments (ticket_id, sender_id, receiver_id, comments, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, NULL)`,
          [ticket_id, sender_id, receiver_id, comments, datetime, datetime]
        );

        console.log(`Message inserted into ticket_comments with ID: ${result.insertId}`);
        socket.emit('datas', result.insertId);

        const [resultData] = await db.execute(
          `SELECT 
            tc.id,
            tc.ticket_id,
            tc.sender_id,
            tc.receiver_id,
            tc.comments,
            CASE 
              WHEN tc.sender_id = 0 THEN 'Anonymous'
              ELSE CONCAT(COALESCE(sender.first_name, ''), ' ', COALESCE(NULLIF(sender.last_name, ''), '')) 
            END AS sender_name,
            CASE 
              WHEN tc.receiver_id = 0 THEN 'Anonymous'
              ELSE CONCAT(COALESCE(receiver.first_name, ''), ' ', COALESCE(NULLIF(receiver.last_name, ''), '')) 
            END AS receiver_name,
            tc.created_at
          FROM ticket_comments tc
          LEFT JOIN users sender ON tc.sender_id = sender.id AND tc.sender_id != 0
          LEFT JOIN users receiver ON tc.receiver_id = receiver.id AND tc.receiver_id != 0
          WHERE tc.id = ? AND tc.deleted_at IS NULL`, 
          [result.insertId]
        );
        const key = `${ticket_id}_${receiver_id}`;

        const recipientSocketId = connectedUsers[key];
        if (recipientSocketId) {
          console.log("socketmsgdata",{ ...resultData[0] });
          
          io.to(recipientSocketId).emit('chat message', { ...resultData[0] });
          socket.emit('msg', 'Msg sended.');
        }
      } catch (error) {
        console.error('Error saving message:', error);
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);

      let disconnectedUser = null;
      Object.keys(connectedUsers).forEach((key) => {
        if (connectedUsers[key] === socket.id) {
          disconnectedUser = key;
          delete connectedUsers[key];
        }
      });

      if (disconnectedUser) {
        socket.broadcast.emit('user_disconnected', { user_id: disconnectedUser, socket_id: socket.id, message: 'disconnected' });
      }
    });
  });
};
