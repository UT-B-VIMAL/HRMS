const cron = require('node-cron');
const db = require('../config/db');
const { userSockets } = require('../helpers/notificationHelper');

const sendDailyAttendanceNotification = async () => {
  try {
    // Fetch all reporting_user_id from the teams table where reporting_user_id is not null
    const query = `
      SELECT DISTINCT reporting_user_id 
      FROM teams 
      WHERE deleted_at IS NULL 
      AND reporting_user_id IS NOT NULL
    `;
    const [results] = await db.query(query);

    if (results.length === 0) {
      console.log('No reporting users found.');
      return;
    }

    // Notification payload
    const notificationPayload = {
      title: 'Team Attendance Update Required',
      body: 'Please update the attendance records for your team.',
    };

    // Send notification to each reporting user
    for (const row of results) {
      const reportingUserId = row.reporting_user_id;
      const socketIds = userSockets[reportingUserId];

      if (Array.isArray(socketIds)) {
        socketIds.forEach((socketId) => {
          req.io.of('/notifications').to(socketId).emit('push_notification', notificationPayload);
        });
      }

      await db.execute(
        'INSERT INTO notifications (user_id, title, body, read_status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
        [reportingUserId, notificationPayload.title, notificationPayload.body, 0]
      );
    }

    console.log('Daily attendance notifications sent successfully.');
  } catch (error) {
    console.error('Error sending daily attendance notifications:', error.message);
  }
};

// Schedule the cron job to run every day at 9:30 AM except on Sundays and even Saturdays
cron.schedule('30 9 * * 1-5,7', async () => {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const dayOfWeek = now.getDay();

  // Skip even Saturdays
  if (dayOfWeek === 6 && dayOfMonth % 2 === 0) {
    return;
  }

  await sendDailyAttendanceNotification();
});
