const db = require("../../config/db");
const { successResponse, errorResponse } = require("../../helpers/responseHelper");

exports.fetchPendingTask = async (req, res) => {
    try {
      const userId = req.query.user_id; // Assuming user ID is passed as a query parameter
      if (!userId) {
        return errorResponse(res, null, 'User ID is required', 400);
      }
  
      const timeToSeconds = (time) => {
        if (!time) return 0;
        const [hours, minutes, seconds = 0] = time.split(":").map(Number);
        return (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0);
      };
  
      // Fetch tasks
      const tasksQuery = `
        SELECT 
          t.id AS task_id,
          t.name AS task_name,
          t.estimated_hours,
          t.total_hours_worked,
          t.extended_hours,
          t.user_id AS task_user_id,
          t.status AS task_status,
          p.name AS project_name
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.status != 3 AND t.deleted_at IS NULL
      `;
      const [tasks] = await db.query(tasksQuery);
  
      const result = await Promise.all(
        tasks.map(async (task) => {
          const subtasksQuery = `
            SELECT 
              st.id AS subtask_id,
              st.name AS subtask_name,
              st.estimated_hours,
              st.total_hours_worked,
              st.extended_hours,
              st.status AS subtask_status,
              st.user_id AS subtask_user_id
            FROM sub_tasks st
            WHERE st.task_id = ? AND st.deleted_at IS NULL
          `;
          const [subtasks] = await db.query(subtasksQuery, [task.task_id]);
  
          const pendingTaskResult = [];
  
          if (subtasks.length > 0) {
            subtasks.forEach((subtask) => {
              if (subtask.subtask_user_id === parseInt(userId) && subtask.subtask_status !== 3) {
                const estimatedSeconds = timeToSeconds(subtask.estimated_hours);
                const workedSeconds = timeToSeconds(subtask.total_hours_worked);
                const extendedSeconds = timeToSeconds(subtask.extended_hours);
  
                const remainingSeconds = estimatedSeconds - workedSeconds;
  
                const workedPercentage = estimatedSeconds
                  ? Math.round((workedSeconds / estimatedSeconds) * 100 * 100) / 100
                  : 0;
  
                const remainingPercentage = estimatedSeconds
                  ? Math.round((Math.max(0, remainingSeconds) / estimatedSeconds) * 100 * 100) / 100
                  : 0;
  
                const remainingHours =
                  extendedSeconds > estimatedSeconds
                    ? "00:00"
                    : new Date(Math.max(0, remainingSeconds) * 1000)
                        .toISOString()
                        .slice(11, 16);
  
                pendingTaskResult.push({
                  project_name: task.project_name || "N/A",
                  task_name: task.task_name,
                  subtask_name: subtask.subtask_name,
                  remaining_hours: remainingHours,
                  worked_percentage: workedPercentage,
                  remaining_percentage: remainingPercentage,
                  type: "subtask",
                });
              }
            });
          } else if (task.task_user_id === parseInt(userId)) {
            const estimatedSeconds = timeToSeconds(task.estimated_hours);
            const workedSeconds = timeToSeconds(task.total_hours_worked);
            const extendedSeconds = timeToSeconds(task.extended_hours);
  
            const remainingSeconds = estimatedSeconds - workedSeconds;
  
            const workedPercentage = estimatedSeconds
              ? Math.round((workedSeconds / estimatedSeconds) * 100 * 100) / 100
              : 0;
  
            const remainingPercentage = estimatedSeconds
              ? Math.round((Math.max(0, remainingSeconds) / estimatedSeconds) * 100 * 100) / 100
              : 0;
  
            const remainingHours =
              extendedSeconds > estimatedSeconds
                ? "00:00"
                : new Date(Math.max(0, remainingSeconds) * 1000)
                    .toISOString()
                    .slice(11, 16);
  
            pendingTaskResult.push({
              project_name: task.project_name || "N/A",
              task_name: task.task_name,
              remaining_hours: remainingHours,
              worked_percentage: workedPercentage,
              remaining_percentage: remainingPercentage,
              type: "task",
            });
          }
  
          return pendingTaskResult;
        })
      );
  
      const flatResult = result.flat();
      return successResponse(
        res,
        flatResult,
        "Employee Pending tasks retrieved successfully",
        200
      );
    } catch (error) {
        console.error("Error fetching pending task:", error);
        return errorResponse(res, error.message, "Error fetching pending task", 500);
    }
};
exports.fetchDailybreakdown = async (req, res) => {
  try {
    const userId = req.query.user_id; // Assuming user ID is passed as a query parameter
    if (!userId) {
      return errorResponse(res, null, "User ID is required", 400);
    }

    // Fetch SubTaskUserTimeline with project, subtask, and task data
    const query = `
      SELECT 
        sut.start_time,
        sut.end_time,
        p.name AS project_name,
        t.name AS task_name,
        st.name AS subtask_name,
        st.id AS subtask_id
      FROM sub_tasks_user_timeline sut
      LEFT JOIN tasks t ON sut.task_id = t.id
      LEFT JOIN sub_tasks st ON sut.subtask_id = st.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE sut.user_id = ? AND DATE(sut.start_time) = CURDATE() AND sut.deleted_at IS NULL
    `;

    const [rows] = await db.query(query, [userId]);

    let totalDurationInSeconds = 0;

    // Process the results
    const dailyBreakdown = rows.map((record) => {
      const startTime = new Date(record.start_time);
      const endTime = record.end_time ? new Date(record.end_time) : null;

      // Format times as h:i A
      const formattedStartTime = startTime.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      const formattedEndTime = endTime
        ? endTime.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        : "-";

      // Calculate the duration and format as HH:MM:SS
      const durationInSeconds = Math.max((endTime - startTime) / 1000, 0);
      totalDurationInSeconds += durationInSeconds;

      const hours = Math.floor(durationInSeconds / 3600);
      const minutes = Math.floor((durationInSeconds % 3600) / 60);
      const seconds = Math.floor(durationInSeconds % 60);
      const formattedDuration = `${String(hours).padStart(2, "0")}:${String(
        minutes
      ).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

      // Determine if the record is a Task or Subtask
      const type = record.subtask_id ? "Subtask" : "Task";

      return {
        startTime: formattedStartTime,
        endTime: formattedEndTime,
        project_name: record.project_name || "N/A",
        name: record.subtask_id ? record.subtask_name : record.task_name || "N/A",
        duration: formattedDuration,
        type: type, // New field added for type
      };
    });

    // Calculate total duration in HH:MM:SS format
    const totalHours = Math.floor(totalDurationInSeconds / 3600);
    const totalMinutes = Math.floor((totalDurationInSeconds % 3600) / 60);
    const totalSeconds = Math.floor(totalDurationInSeconds % 60);
    const totalDurationFormatted = `${String(totalHours).padStart(2, "0")}:${String(
      totalMinutes
    ).padStart(2, "0")}:${String(totalSeconds).padStart(2, "0")}`;

    // Calculate percentage based on 8 hours (8 * 3600 seconds)
    const totalDurationPercentage = Math.min(
      Math.round((totalDurationInSeconds / (8 * 3600)) * 100),
      100
    );

    return successResponse(
      res,
      {
        dailyBreakdown,
        totalDuration: totalDurationFormatted,
        percentage: totalDurationPercentage,
      },
      "Daily breakdown retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Error fetching daily breakdown:", error);
    return errorResponse(res, error.message, "Error fetching daily breakdown", 500);
  }
};


exports.fetchStatistics = async (req, res) => {
    try {
        const userId = req.query.user_id; 
        if (!userId) {
          return errorResponse(res, null, 'User ID is required', 400);
        }

        const currentMonth = new Date().getMonth() + 1; 

        // Fetch all tasks for the user regardless of creation date
        const tasksQuery = `
            SELECT id, name, status, active_status, reopen_status, created_at 
            FROM tasks 
            WHERE user_id = ? AND deleted_at IS NULL
        `;
        const [tasks] = await db.query(tasksQuery, [userId]);

        let totalTaskCount = 0;
        let completedTaskCount = 0;
        let inProgressTaskCount = 0;
        let todoTaskCount = 0;

        for (const task of tasks) {
            // Fetch subtasks for each task created in the current month and not deleted
            const subtasksQuery = `
                SELECT id, status, active_status, reopen_status, created_at 
                FROM sub_tasks 
                WHERE task_id = ? AND user_id = ? AND deleted_at IS NULL
            `;
            const [subtasks] = await db.query(subtasksQuery, [task.id, userId]);

            const isTaskInCurrentMonth = new Date(task.created_at).getMonth() + 1 === currentMonth;
            const subtasksInCurrentMonth = subtasks.filter(subtask => new Date(subtask.created_at).getMonth() + 1 === currentMonth);

            if (subtasks.length === 0) {
              
                // If there are no subtasks, apply the current month condition to the task
                if (isTaskInCurrentMonth) {
                  if((task.status === 1 || task.active_status === 1) || task.status === 3 || (task.status === 0 && task.reopen_status === 0 && task.active_status === 0)){
                    totalTaskCount++;
                }

                    if (task.status === 1 || task.active_status === 1) {
                        inProgressTaskCount++;
                    } else if (task.status === 3) {
                        completedTaskCount++;
                    } else if (task.status === 0 && task.reopen_status === 0 && task.active_status === 0) {
                        todoTaskCount++;
                    }
                }
            } else {
                // Apply the current month condition only to subtasks
                if (subtasksInCurrentMonth.length > 0) {
                  if((task.status === 1 || task.active_status === 1) || task.status === 3 || (task.status === 0 && task.reopen_status === 0 && task.active_status === 0)){

                    totalTaskCount++;
                }

                    const allCompleted = subtasksInCurrentMonth.every(subtask => subtask.status === 3);
                    const allTodo = subtasksInCurrentMonth.every(subtask => subtask.status === 0 && subtask.reopen_status === 0 && subtask.active_status === 0);
                    const inprogressTodo = subtasksInCurrentMonth.every(subtask => subtask.status === 1 || subtask.active_status === 1);

                    if (allCompleted) {
                        completedTaskCount++;
                    } else if (allTodo) {
                        todoTaskCount++;
                    } else if(inprogressTodo) {
                        inProgressTaskCount++;
                    }
                }
            }
        }

        // Calculate percentages
        const completedPercentage = totalTaskCount > 0 ? (completedTaskCount / totalTaskCount) * 100 : 0;
        const todoPercentage = totalTaskCount > 0 ? (todoTaskCount / totalTaskCount) * 100 : 0;
        const inProgressPercentage = totalTaskCount > 0 ? (inProgressTaskCount / totalTaskCount) * 100 : 0;

        // Build the result
        const statisticsResult = {
            total_task_count: totalTaskCount,
            completed_task_count: completedTaskCount,
            completed_percentage: Math.round(completedPercentage),
            todo_task_count: todoTaskCount,
            todo_percentage: Math.round(todoPercentage),
            in_progress_task_count: inProgressTaskCount,
            in_progress_percentage: Math.round(inProgressPercentage),
        };
        return successResponse(
          res,
          statisticsResult,
          "Task statistics retrieved successfully",
          200
        );
    } catch (error) {
        console.error("Error fetching statistics:", error);
        return errorResponse(res, error.message, "Error fetching statistics", 500);
    }
};
exports.fetchStatisticschart = async (req, res) => {
  try {
    const userId = req.query.user_id;
    if (!userId) {
      return errorResponse(res, null, 'User ID is required', 400);
    }

    const currentMonth = new Date().getMonth() + 1;
    const totalDaysInMonth = new Date(new Date().getFullYear(), currentMonth, 0).getDate();
    const weeksInMonth = Math.ceil(totalDaysInMonth / 7);

    // Initialize week statistics
    const weekTaskCounts = Array.from({ length: weeksInMonth }, (_, i) => ({
      week: `week_${i + 1}`,
      total_task_count: 0,
      in_progress_task_count: 0,
      completed_task_count: 0,
      todo_task_count: 0,
      in_progress_percentage: 0,
      completed_percentage: 0,
      todo_percentage: 0,
    }));

    // Fetch all tasks for the user
    const tasksQuery = `
      SELECT id, name, status, active_status, reopen_status, created_at 
      FROM tasks 
      WHERE user_id = ? AND deleted_at IS NULL
    `;
    const [tasks] = await db.query(tasksQuery, [userId]);

    for (const task of tasks) {
      // Fetch subtasks for the task
      const subtasksQuery = `
        SELECT id, status, active_status, reopen_status, created_at 
        FROM sub_tasks 
        WHERE task_id = ? AND user_id = ? AND deleted_at IS NULL
      `;
      const [subtasks] = await db.query(subtasksQuery, [task.id, userId]);

      // Determine the week of the month based on created_at date
      const taskWeek = Math.ceil(new Date(task.created_at).getDate() / 7);

      if (taskWeek < 1 || taskWeek > weeksInMonth) {
        console.warn(`Task with ID ${task.id} has an invalid week: ${taskWeek}`);
        continue; // Skip invalid week data
      }

      const weekData = weekTaskCounts[taskWeek - 1];

      if (subtasks.length === 0) {
        // No subtasks, count the task itself if it falls in the current month
        const isTaskInCurrentMonth = new Date(task.created_at).getMonth() + 1 === currentMonth;

        if (isTaskInCurrentMonth) {
          if((task.status === 1 || task.active_status === 1) || task.status === 3 || (task.status === 0 && task.reopen_status === 0 && task.active_status === 0)){
            weekData.total_task_count++;
        }
          

          if (task.status === 1 || task.active_status === 1) {
            weekData.in_progress_task_count++;
          } else if (task.status === 3) {
            weekData.completed_task_count++;
          } else if (task.status === 0 && task.reopen_status === 0 && task.active_status === 0) {
            weekData.todo_task_count++;
          }
        }
      } else {
        // Subtasks exist, count only subtasks in the current month
        const subtasksInCurrentMonth = subtasks.filter(
          subtask => new Date(subtask.created_at).getMonth() + 1 === currentMonth
        );

        subtasksInCurrentMonth.forEach(subtask => {
          const subtaskWeek = Math.ceil(new Date(subtask.created_at).getDate() / 7);

          if (subtaskWeek < 1 || subtaskWeek > weeksInMonth) {
            console.warn(`Subtask with ID ${subtask.id} has an invalid week: ${subtaskWeek}`);
            return; // Skip invalid week data
          }

          const subtaskWeekData = weekTaskCounts[subtaskWeek - 1];
          if((subtask.status === 1 || subtask.active_status === 1) || subtask.status === 3 || (subtask.status === 0 && subtask.reopen_status === 0 && subtask.active_status === 0)){
            subtaskWeekData.total_task_count++;
        }
          

          if (subtask.status === 1 || subtask.active_status === 1) {
            subtaskWeekData.in_progress_task_count++;
          } else if (subtask.status === 3) {
            subtaskWeekData.completed_task_count++;
          } else if (subtask.status === 0 && subtask.reopen_status === 0 && subtask.active_status === 0) {
            subtaskWeekData.todo_task_count++;
          }
        });
      }
    }

    // Recalculate percentages for each week
    weekTaskCounts.forEach(weekData => {
      if (weekData.total_task_count > 0) {
        weekData.in_progress_percentage = (weekData.in_progress_task_count / weekData.total_task_count) * 100;
        weekData.completed_percentage = (weekData.completed_task_count / weekData.total_task_count) * 100;
        weekData.todo_percentage = (weekData.todo_task_count / weekData.total_task_count) * 100;
      }
    });

    return successResponse(
      res,
      weekTaskCounts,
      'Weekly task statistics retrieved successfully',
      200
    );
  } catch (error) {
    console.error('Error fetching statistics:', error);
    return errorResponse(res, error.message, 'Error fetching statistics', 500);
  }
};

exports.fetchRatings = async (req, res) => {
  try {
      const userId = req.query.user_id;
      if (!userId) {
          return errorResponse(res, null, 'User ID is required', 400);
      }

      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7); // Format: YYYY-MM
      const currentYear = now.getFullYear(); // Get current year
      const monthName = now.toLocaleString('en-US', { month: 'short' }).toUpperCase(); // Get abbreviated month name

      // Query for current month's rating
      const ratingQuery = `
    SELECT SUM(average) AS total_average
    FROM ratings 
    WHERE user_id = ? AND month = ?
`;

const [ratingRecords] = await db.query(ratingQuery, [userId, currentMonth]);

const totalAverage = ratingRecords[0]?.total_average || 0;

      // Query for yearly average calculation (excluding month filter)
      const yearAvgQuery = `
    SELECT SUM(average) AS total_average, COUNT(*) AS record_count
    FROM ratings 
    WHERE user_id = ? AND month LIKE ?
`;

const [yearlyAvgRecord] = await db.query(yearAvgQuery, [userId, `${currentYear}-%`]);

const totalAverages = yearlyAvgRecord[0]?.total_average || 0; // Sum of all averages
const recordCount = yearlyAvgRecord[0]?.record_count || 1; // Avoid division by zero

// Step 1: Divide total average by 2 first
const adjustedTotal = Math.round(recordCount / 2);



// Step 2: Use adjustedTotal to calculate yearly average dynamically
const yearlyAverage = totalAverages / adjustedTotal;


      let empRating;

      if (totalAverage) {
          const ratingValue = (totalAverage || 0); // Sum of rating and average for current month
          const averageValue = yearlyAverage; // Yearly average

          const ratingPercentage = (ratingValue / 10) * 100;
          const averagePercentage = (averageValue / 10) * 100;

          empRating = {
              month: monthName,
              rating_value: ratingValue,
              average_value: parseFloat(averageValue.toFixed(2)), // Yearly average rounded to 2 decimal places
              rating_percentage: parseFloat(ratingPercentage.toFixed(2)), 
              average_percentage: parseFloat(averagePercentage.toFixed(2)),
          };
      } else {
          empRating = {
              month: monthName,
              rating_value: 0,
              average_value: parseFloat(yearlyAverage.toFixed(2)),
              rating_percentage: 0,
              average_percentage: parseFloat(((yearlyAverage / 10) * 100).toFixed(2)),
          };
      }

      return successResponse(res, empRating, "Ratings retrieved successfully", 200);
  } catch (error) {
      console.error("Error fetching ratings:", error);
      return errorResponse(res, error.message, "Error fetching ratings", 500);
  }
};
exports.logincheck = async (req, res) => {
  try {
       const email = "pm@gmail.com";
      const ratingQuery = `
    SELECT *
    FROM users 
    WHERE email = ?
`;

const [ratingRecords] = await db.query(ratingQuery, [email]);
if(ratingRecords.length != 0){

  return successResponse(res, ratingRecords, "Data fetched", 200);
}else{

  return errorResponse(res, 'failed', "Failed to fetch", 500);
}

  } catch (error) {
      console.error("Error fetching ratings:", error);
  }
};




  
  

  
  
  