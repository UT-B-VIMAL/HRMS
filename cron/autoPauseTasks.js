const cron = require('node-cron');
const db = require('../config/db');

const moment = require('moment-timezone');
const db = require('./db');

const autoPauseUnpausedTasks = async () => {
  try {
    const now = moment.utc(); // 🕒 Keep it UTC
    const currentDate = now.format('YYYY-MM-DD');
    const currentDateTime = now.format('YYYY-MM-DD HH:mm:ss');

    const query = `
      SELECT * FROM sub_tasks_user_timeline 
      WHERE end_time IS NULL 
      AND DATE(start_time) = ?
      AND deleted_at IS NULL
    `;
    const [rows] = await db.query(query, [currentDate]);

    for (const row of rows) {
      const startTime = moment.utc(row.start_time); // ⏱ UTC
      const endTime = now.clone();

      const timeDiffSeconds = endTime.diff(startTime, 'seconds');
      if (timeDiffSeconds < 0) continue; // safety

      const hours = String(Math.floor(timeDiffSeconds / 3600)).padStart(2, '0');
      const minutes = String(Math.floor((timeDiffSeconds % 3600) / 60)).padStart(2, '0');
      const seconds = String(timeDiffSeconds % 60).padStart(2, '0');
      const timeDiffFormatted = `${hours}:${minutes}:${seconds}`;

      // Update timeline end_time
      await db.execute(
        `UPDATE sub_tasks_user_timeline SET end_time = ?, updated_at = NOW() WHERE id = ?`,
        [currentDateTime, row.id]
      );

      // Update worked hours
      if (row.subtask_id) {
        await db.execute(
          `UPDATE sub_tasks SET active_status = 0, total_hours_worked = ADDTIME(IFNULL(total_hours_worked, '00:00:00'), ?) WHERE id = ?`,
          [timeDiffFormatted, row.subtask_id]
        );
      } else {
        await db.execute(
          `UPDATE tasks SET active_status = 0, total_hours_worked = ADDTIME(IFNULL(total_hours_worked, '00:00:00'), ?) WHERE id = ?`,
          [timeDiffFormatted, row.task_id]
        );
      }
    }

    console.log(`[${currentDateTime}] Auto-paused ${rows.length} task(s)/subtask(s).`);
  } catch (error) {
    console.error('Error in autoPauseUnpausedTasks:', error.message);
  }
};


// Schedule the cron job to run daily at 6:30 PM
cron.schedule('30 18 * * *', async () => {
  await autoPauseUnpausedTasks();
}, {
  timezone: 'Asia/Kolkata'
});
