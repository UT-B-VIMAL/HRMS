const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
} = require("../../helpers/responseHelper");

exports.fetchPendingTask = async (req, res) => {
  try {
    const userId = req.query.user_id; // Assuming user ID is passed as a query parameter
    if (!userId) {
      return errorResponse(res, null, "User ID is required", 400);
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
          t.reopen_status AS task_reopen_status,
          p.name AS project_name
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.deleted_at IS NULL
      `;
    const [tasks] = await db.query(tasksQuery);

    const result = await Promise.all(
      tasks.map(async (task) => {
        console.log(task.task_id);

        // Fetch subtasks for each task
        const subtasksQuery = `
            SELECT 
              st.id AS subtask_id,
              st.name AS subtask_name,
              st.estimated_hours,
              st.total_hours_worked,
              st.extended_hours,
              st.status AS subtask_status,
              st.reopen_status AS subtask_reopen_status,
              st.user_id AS subtask_user_id
            FROM sub_tasks st
            WHERE st.task_id = ? AND st.deleted_at IS NULL
          `;
        const [subtasks] = await db.query(subtasksQuery, [task.task_id]);

        const pendingTaskResult = [];

        if (subtasks.length > 0) {
          // If subtasks exist, apply condition check for subtasks
          subtasks.forEach((subtask) => {
            if (
              subtask.subtask_user_id === parseInt(userId) &&
              subtask.subtask_status !== 3 &&
              !(
                subtask.subtask_status === 2 &&
                subtask.subtask_reopen_status === 0
              ) // Check the subtask status and reopen_status
            ) {
              const estimatedSeconds = timeToSeconds(subtask.estimated_hours);
              const workedSeconds = timeToSeconds(subtask.total_hours_worked);
              const extendedSeconds = timeToSeconds(subtask.extended_hours);

              const remainingSeconds = estimatedSeconds - workedSeconds;

              const workedPercentage = estimatedSeconds
                ? Math.round((workedSeconds / estimatedSeconds) * 100 * 100) /
                  100
                : 0;

              const remainingPercentage = estimatedSeconds
                ? Math.round(
                    (Math.max(0, remainingSeconds) / estimatedSeconds) *
                      100 *
                      100
                  ) / 100
                : 0;

              const remainingHours =
                extendedSeconds > estimatedSeconds
                  ? "00:00:00"
                  : new Date(Math.max(0, remainingSeconds) * 1000)
                      .toISOString()
                      .slice(11, 19);

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
          // If no subtasks, apply the condition check for the task itself
          if (
            task.task_status !== 3 &&
            !(task.task_status === 2 && task.task_reopen_status === 0) // Check the task status and reopen_status
          ) {
            const estimatedSeconds = timeToSeconds(task.estimated_hours);
            const workedSeconds = timeToSeconds(task.total_hours_worked);
            const extendedSeconds = timeToSeconds(task.extended_hours);

            const remainingSeconds = estimatedSeconds - workedSeconds;

            const workedPercentage = estimatedSeconds
              ? Math.round((workedSeconds / estimatedSeconds) * 100 * 100) / 100
              : 0;

            const remainingPercentage = estimatedSeconds
              ? Math.round(
                  (Math.max(0, remainingSeconds) / estimatedSeconds) * 100 * 100
                ) / 100
              : 0;

            const remainingHours =
              extendedSeconds > estimatedSeconds
                ? "00:00:00"
                : new Date(Math.max(0, remainingSeconds) * 1000)
                    .toISOString()
                    .slice(11, 19);

            pendingTaskResult.push({
              project_name: task.project_name || "N/A",
              task_name: task.task_name,
              remaining_hours: remainingHours,
              worked_percentage: workedPercentage,
              remaining_percentage: remainingPercentage,
              type: "task",
            });
          }
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
    return errorResponse(
      res,
      error.message,
      "Error fetching pending task",
      500
    );
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
      const startTimeUTC = new Date(record.start_time);
      const endTimeUTC = record.end_time ? new Date(record.end_time) : null;

      // Convert to IST (UTC+5:30)
      const startTimeIST = new Date(
        startTimeUTC.getTime() + 5.5 * 60 * 60 * 1000
      );
      const endTimeIST = endTimeUTC
        ? new Date(endTimeUTC.getTime() + 5.5 * 60 * 60 * 1000)
        : null;

      // Format times as h:i A (12-hour format)
      const formattedStartTime = startTimeIST.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      const formattedEndTime = endTimeIST
        ? endTimeIST.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        : "-";

      // Calculate the duration and format as HH:MM:SS
      const durationInSeconds = Math.max((endTimeIST - startTimeIST) / 1000, 0);
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
        name: record.subtask_id
          ? record.subtask_name
          : record.task_name || "N/A",
        duration: formattedDuration,
        type: type, // New field added for type
      };
    });

    // Calculate total duration in HH:MM:SS format
    const totalHours = Math.floor(totalDurationInSeconds / 3600);
    const totalMinutes = Math.floor((totalDurationInSeconds % 3600) / 60);
    const totalSeconds = Math.floor(totalDurationInSeconds % 60);
    const totalDurationFormatted = `${String(totalHours).padStart(
      2,
      "0"
    )}:${String(totalMinutes).padStart(2, "0")}:${String(totalSeconds).padStart(
      2,
      "0"
    )}`;

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
    return errorResponse(
      res,
      error.message,
      "Error fetching daily breakdown",
      500
    );
  }
};

exports.fetchStatistics = async (req, res) => {
  try {
    const user_id = req.query.user_id;
    const date = req.query.date;

    if (!user_id) {
      return errorResponse(res, null, "User ID is required", 400);
    }

    let selectedMonth, selectedYear;

    if (date) {
      const monthYearRegex =
        /^(0[1-9]|1[0-2])[\s_](\d{4})$|^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\s_](\d{4})$/;

      if (!monthYearRegex.test(date)) {
        return errorResponse(
          res,
          null,
          "Invalid date format. Use 'MMM YYYY' (e.g., 'Feb 2025'), 'MM YYYY' (e.g., '02 2025'), or 'MM_YYYY' (e.g., '03_2024').",
          400
        );
      }

      const dateParts = date.split(/[\s_]/);

      if (isNaN(dateParts[0])) {
        selectedMonth =
          new Date(`${dateParts[0]} 1, ${dateParts[1]}`).getMonth() + 1;
      } else {
        selectedMonth = parseInt(dateParts[0], 10);
      }

      selectedYear = parseInt(dateParts[1], 10);
    } else {
      const currentDate = new Date();
      selectedMonth = currentDate.getMonth() + 1;
      selectedYear = currentDate.getFullYear();
    }

    const tasksQuery = `
      SELECT id, name, status, active_status, reopen_status, created_at 
      FROM tasks 
      WHERE user_id = ? AND deleted_at IS NULL
    `;
    const [tasks] = await db.query(tasksQuery, [user_id]);

    let totalTaskCount = 0;
    let completedTaskCount = 0;
    let inProgressTaskCount = 0;
    let todoTaskCount = 0;

    for (const task of tasks) {
      const allSubtasksQuery = `
        SELECT id, status, active_status, reopen_status, created_at, user_id 
        FROM sub_tasks 
        WHERE task_id = ? AND deleted_at IS NULL
      `;
      const [allSubtasks] = await db.query(allSubtasksQuery, [task.id]);

      const userSubtasks = allSubtasks.filter(
        (subtask) => subtask.user_id === parseInt(user_id)
      );

      if (allSubtasks.length > 0 && userSubtasks.length === 0) {
        continue; // Skip if no matching user_id in subtasks
      }

      const taskDate = new Date(task.created_at);
      const isTaskInMonthYear =
        taskDate.getMonth() + 1 === selectedMonth &&
        taskDate.getFullYear() === selectedYear;

      const subtasksInMonthYear = userSubtasks.filter((subtask) => {
        const subtaskDate = new Date(subtask.created_at);
        return (
          subtaskDate.getMonth() + 1 === selectedMonth &&
          subtaskDate.getFullYear() === selectedYear
        );
      });

      if (userSubtasks.length === 0) {
        if (isTaskInMonthYear) {
          if (
            (task.status === 1 && task.active_status === 1) ||
            task.status === 3 ||
            (task.status === 0 &&
              task.reopen_status === 0 &&
              task.active_status === 0)
          ) {
            totalTaskCount++;
          }

          if (task.status === 1 && task.active_status === 1) {
            inProgressTaskCount++;
          } else if (task.status === 3) {
            completedTaskCount++;
          } else if (
            task.status === 0 &&
            task.reopen_status === 0 &&
            task.active_status === 0
          ) {
            todoTaskCount++;
          }
        }
      } else {
        if (subtasksInMonthYear.length > 0) {
          if (
            (task.status === 1 && task.active_status === 1) ||
            task.status === 3 ||
            (task.status === 0 &&
              task.reopen_status === 0 &&
              task.active_status === 0)
          ) {
            totalTaskCount++;
          }

          const allCompleted = subtasksInMonthYear.every(
            (subtask) => subtask.status === 3
          );
          const allTodo = subtasksInMonthYear.every(
            (subtask) =>
              subtask.status === 0 &&
              subtask.reopen_status === 0 &&
              subtask.active_status === 0
          );
          const inProgress = subtasksInMonthYear.some(
            (subtask) =>
              subtask.status === 1 && subtask.active_status === 1
          );

          if (allCompleted) {
            completedTaskCount++;
          } else if (allTodo) {
            todoTaskCount++;
          } else if (inProgress) {
            inProgressTaskCount++;
          }
        }
      }
    }

    const totalTaskCounts =
      completedTaskCount + todoTaskCount + inProgressTaskCount;

    const completedPercentage =
      totalTaskCounts > 0 ? (completedTaskCount / totalTaskCounts) * 100 : 0;
    const todoPercentage =
      totalTaskCounts > 0 ? (todoTaskCount / totalTaskCounts) * 100 : 0;
    const inProgressPercentage =
      totalTaskCounts > 0 ? (inProgressTaskCount / totalTaskCounts) * 100 : 0;

    const statisticsResult = {
      total_task_count: totalTaskCounts,
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
    const user_id = req.query.user_id;
    const date = req.query.date;

    if (!user_id) {
      return errorResponse(res, null, "User ID is required", 400);
    }

    let selectedMonth, selectedYear;

    if (date) {
      const monthYearRegex =
        /^(0[1-9]|1[0-2])[\s_](\d{4})$|^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\s_](\d{4})$/;

      if (!monthYearRegex.test(date)) {
        return errorResponse(
          res,
          null,
          "Invalid date format. Use 'MMM YYYY' (e.g., 'Feb 2025'), 'MM YYYY' (e.g., '02 2025'), or 'MM_YYYY' (e.g., '03_2024').",
          400
        );
      }

      const dateParts = date.split(/[\s_]/);

      if (dateParts.length !== 2) {
        return errorResponse(
          res,
          null,
          "Invalid date format. Use 'MMM YYYY', 'MM YYYY', or 'MM_YYYY'",
          400
        );
      }

      if (isNaN(dateParts[0])) {
        selectedMonth =
          new Date(`${dateParts[0]} 1, ${dateParts[1]}`).getMonth() + 1;
      } else {
        selectedMonth = parseInt(dateParts[0], 10);
      }

      selectedYear = parseInt(dateParts[1], 10);
    } else {
      const currentDate = new Date();
      selectedMonth = currentDate.getMonth() + 1;
      selectedYear = currentDate.getFullYear();
    }

    const totalDaysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

    const weekDays = [0, 0, 0, 0, 0];
    let weekIndex = 0;

    for (let day = 1; day <= totalDaysInMonth; day++) {
      weekDays[weekIndex]++;
      if (new Date(selectedYear, selectedMonth - 1, day).getDay() === 6) {
        weekIndex++;
      }
    }

    const weeksInMonth = weekDays.filter((week) => week > 0).length;

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

    const tasksQuery = `
      SELECT id, name, status, active_status, reopen_status, created_at 
      FROM tasks 
      WHERE user_id = ? AND deleted_at IS NULL
    `;
    const [tasks] = await db.query(tasksQuery, [user_id]);

    for (const task of tasks) {
      const allSubtasksQuery = `
        SELECT id, status, active_status, reopen_status, created_at, user_id 
        FROM sub_tasks 
        WHERE task_id = ? AND deleted_at IS NULL
      `;
      const [allSubtasks] = await db.query(allSubtasksQuery, [task.id]);

      const userSubtasks = allSubtasks.filter(
        (sub) => sub.user_id === parseInt(user_id)
      );

      if (allSubtasks.length > 0 && userSubtasks.length === 0) {
        continue; // Skip task if no user's subtasks
      }

      const taskDate = new Date(task.created_at);
      if (
        taskDate.getMonth() + 1 !== selectedMonth ||
        taskDate.getFullYear() !== selectedYear
      ) {
        continue;
      }

      const taskWeek = Math.floor((taskDate.getDate() - 1) / 7);
      if (taskWeek >= weeksInMonth) continue;

      if (userSubtasks.length === 0) {
        const weekData = weekTaskCounts[taskWeek];

        if (
          (task.status === 1 && task.active_status === 1) ||
          task.status === 3 ||
          (task.status === 0 &&
            task.reopen_status === 0 &&
            task.active_status === 0)
        ) {
          weekData.total_task_count++;
        }

        if (task.status === 1 && task.active_status === 1) {
          weekData.in_progress_task_count++;
        } else if (task.status === 3) {
          weekData.completed_task_count++;
        } else if (
          task.status === 0 &&
          task.reopen_status === 0 &&
          task.active_status === 0
        ) {
          weekData.todo_task_count++;
        }
      } else {
        for (const subtask of userSubtasks) {
          const subtaskDate = new Date(subtask.created_at);
          if (
            subtaskDate.getMonth() + 1 !== selectedMonth ||
            subtaskDate.getFullYear() !== selectedYear
          ) {
            continue;
          }

          const subtaskWeek = Math.floor((subtaskDate.getDate() - 1) / 7);
          if (subtaskWeek >= weeksInMonth) continue;

          const subtaskWeekData = weekTaskCounts[subtaskWeek];

          if (
            (subtask.status === 1 && subtask.active_status === 1) ||
            subtask.status === 3 ||
            (subtask.status === 0 &&
              subtask.reopen_status === 0 &&
              subtask.active_status === 0)
          ) {
            subtaskWeekData.total_task_count++;
          }

          if (subtask.status === 1 && subtask.active_status === 1) {
            subtaskWeekData.in_progress_task_count++;
          } else if (subtask.status === 3) {
            subtaskWeekData.completed_task_count++;
          } else if (
            subtask.status === 0 &&
            subtask.reopen_status === 0 &&
            subtask.active_status === 0
          ) {
            subtaskWeekData.todo_task_count++;
          }
        }
      }
    }

    weekTaskCounts.forEach((weekData) => {
      if (weekData.total_task_count > 0) {
        weekData.in_progress_percentage = Math.round(
          (weekData.in_progress_task_count / weekData.total_task_count) * 100
        );
        weekData.completed_percentage = Math.round(
          (weekData.completed_task_count / weekData.total_task_count) * 100
        );
        weekData.todo_percentage = Math.round(
          (weekData.todo_task_count / weekData.total_task_count) * 100
        );
      }
    });

    return successResponse(
      res,
      weekTaskCounts,
      "Weekly task statistics retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Error fetching statistics:", error);
    return errorResponse(res, error.message, "Error fetching statistics", 500);
  }
};


exports.fetchRatings = async (req, res) => {
  try {
    const userId = req.query.user_id;
    if (!userId) {
      return errorResponse(res, null, "User ID is required", 400);
    }

    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7); // Format: YYYY-MM
    const currentYear = now.getFullYear(); // Get current year
    const monthName = now
      .toLocaleString("en-US", { month: "short" })
      .toUpperCase(); // Get abbreviated month name

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

    const [yearlyAvgRecord] = await db.query(yearAvgQuery, [
      userId,
      `${currentYear}-%`,
    ]);

    const totalAverages = yearlyAvgRecord[0]?.total_average || 0; // Sum of all averages
    const recordCount = yearlyAvgRecord[0]?.record_count || 1; // Avoid division by zero

    // Step 1: Divide total average by 2 first
    const adjustedTotal = Math.round(recordCount / 2);

    // Step 2: Use adjustedTotal to calculate yearly average dynamically
    const yearlyAverage = totalAverages / adjustedTotal;

    let empRating;

    if (totalAverage) {
      const ratingValue = totalAverage || 0; // Sum of rating and average for current month
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

    return successResponse(
      res,
      empRating,
      "Ratings retrieved successfully",
      200
    );
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
    if (ratingRecords.length != 0) {
      return res.status(200).json({
        status: 200,
        success: true,
        message: "Content fetched",
        data: ratingRecords[0],
      });
    } else {
      return errorResponse(res, "failed", "Failed to fetch", 500);
    }
  } catch (error) {
    console.error("Error fetching ratings:", error);
  }
};
