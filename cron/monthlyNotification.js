const cron = require('node-cron');
const db = require('../config/db');
const { userSockets } = require('../helpers/notificationHelper');

const sendMonthlyNotification = async () => {
  try {
    // Get the current month in YYYY-MM format
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Fetch all reporting_user_id from the teams table where reporting_user_id is not null
    const query = `
      SELECT DISTINCT reporting_user_id ,id
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
      title: 'Rating Update Required',
      body: 'Please update the rating records for your team.',
    };

    // Send notification to each reporting user if any team member's ratings have not been updated
    for (const row of results) {
      const reportingUserId = row.reporting_user_id;
      const TeamId = row.id;

      // Fetch all users in the team
      const teamUsersQuery = `
        SELECT id 
        FROM users 
        WHERE team_id = ? 
        AND id != ? 
        AND deleted_at IS NULL
      `;
      const [teamUsers] = await db.query(teamUsersQuery, [TeamId, reportingUserId]);

      let allRatingsUpdated = true;

      for (const user of teamUsers) {
        const userId = user.id;

        // Check if ratings have been updated for the current month
        const ratingCheckQuery = `
          SELECT COUNT(*) AS count 
          FROM ratings 
          WHERE user_id = ? 
          AND SUBSTRING(month, 1, 7) = ?
        `;
        const [ratingCheckResult] = await db.query(ratingCheckQuery, [userId, currentMonth]);

        if (ratingCheckResult[0].count === 0) {
          allRatingsUpdated = false;
          break;
        }
      }

      if (!allRatingsUpdated) {
        const socketIds = userSockets[reportingUserId];

        if (Array.isArray(socketIds)) {
          socketIds.forEach((socketId) => {
            console.log(`Sending notification to user ${reportingUserId} with socket ID ${socketId}`);
            req.io.of('/notifications').emit('push_notification', notificationPayload);
          });
        }

        await db.execute(
          'INSERT INTO notifications (user_id, title, body, read_status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
          [reportingUserId, notificationPayload.title, notificationPayload.body, 0]
        );
      }
    }

    console.log('Monthly notifications sent successfully.');
  } catch (error) {
    console.error('Error sending monthly notifications:', error.message);
  }
};

// Schedule the cron job to run at 9:30 AM on the last day of every month
cron.schedule('30 9 28-31 * *', async () => {
  let now = new Date();
  let lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let notificationDate = new Date(now.getFullYear(), now.getMonth(), lastDayOfMonth);

  // Check if the last day of the month is a Sunday or an even Saturday
  if (notificationDate.getDay() === 0 || (notificationDate.getDay() === 6 && lastDayOfMonth % 2 === 0)) {
    notificationDate.setDate(notificationDate.getDate() - 1);
  }

  // Check if today is the adjusted notification date
  if (now.getDate() === notificationDate.getDate()) {
    await sendMonthlyNotification();
  }
});