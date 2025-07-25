const cron = require('node-cron');
const db = require('../config/db');

const autoPauseUnpausedTasks = async () => {
  try {
    const now = new Date();
    const currentDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const currentDateTime = now.toISOString().slice(0, 19).replace('T', ' '); // YYYY-MM-DD HH:MM:SS

    // Fetch all timeline entries where end_time is null and start_time is today
    const query = `
      SELECT * FROM sub_tasks_user_timeline 
      WHERE end_time IS NULL 
      AND DATE(start_time) = ?
      AND deleted_at IS NULL
    `;
    const [rows] = await db.query(query, [currentDate]);

    for (const row of rows) {
      const timelineId = row.id;
      const startTime = new Date(row.start_time);
      const endTime = now;
      const userId = row.user_id;
      const taskId = row.task_id;
      const subtaskId = row.subtask_id;

      // Calculate time difference in seconds
      const timeDiffSeconds = Math.floor((endTime - startTime) / 1000);
      const hours = String(Math.floor(timeDiffSeconds / 3600)).padStart(2, '0');
      const minutes = String(Math.floor((timeDiffSeconds % 3600) / 60)).padStart(2, '0');
      const seconds = String(timeDiffSeconds % 60).padStart(2, '0');
      const timeDiffFormatted = `${hours}:${minutes}:${seconds}`;

      // Update sub_tasks_user_timeline with end_time
      await db.execute(
        `UPDATE sub_tasks_user_timeline SET end_time = ?, updated_at = NOW() WHERE id = ?`,
        [currentDateTime, timelineId]
      );

      // Update active_status = 0 in respective table
      if (subtaskId) {
        // Update sub_tasks
        await db.execute(
          `UPDATE sub_tasks SET active_status = 0, total_hours_worked = ADDTIME(IFNULL(total_hours_worked, '00:00:00'), ?) WHERE id = ?`,
          [timeDiffFormatted, subtaskId]
        );
      } else {
        // Update tasks
        await db.execute(
          `UPDATE tasks SET active_status = 0, total_hours_worked = ADDTIME(IFNULL(total_hours_worked, '00:00:00'), ?) WHERE id = ?`,
          [timeDiffFormatted, taskId]
        );
      }
    }

    console.log(`[${currentDateTime}] Auto-paused ${rows.length} task(s)/subtask(s).`);
  } catch (error) {
    console.error('Error in autoPauseUnpausedTasks:', error.message);
  }
};

// Schedule the cron job to run daily at 6:30 PM
cron.schedule('05 16 * * *', async () => {
  await autoPauseUnpausedTasks();
});
