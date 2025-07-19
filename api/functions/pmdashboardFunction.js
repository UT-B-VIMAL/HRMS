const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
} = require("../../helpers/responseHelper");
const {
  getColorForProduct,
  getTeamuserids,
} = require("../../api/functions/commonFunction");
const {getUserIdFromAccessToken} = require("../../api/utils/tokenUtils");

const { hasPermission } = require("../../controllers/permissionController");

exports.fetchProducts = async (payload, res) => {
  try {
    // Step 1: Get products
    const productsQuery = "SELECT * FROM products WHERE deleted_at IS NULL";
    const [products] = await db.query(productsQuery);

    const result = await Promise.all(
      products.map(async (product) => {
        const tasksQuery =
          "SELECT * FROM tasks WHERE product_id = ? AND deleted_at IS NULL";
        const [tasks] = await db.query(tasksQuery, [product.id]);

        let totalItems = 0;
        let completedItems = 0;
        let workingEmployees = new Set();

        for (const task of tasks) {
          // Fetch subtasks associated with the task
          const subtasksQuery = `
            SELECT * FROM sub_tasks 
            WHERE task_id = ? AND deleted_at IS NULL
          `;
          const [subtasks] = await db.query(subtasksQuery, [task.id]);

          if (subtasks.length > 0) {
            // If task has subtasks, count only the subtasks
            totalItems += subtasks.length;
            completedItems += subtasks.filter(
              (subtask) => subtask.status === 3
            ).length;

            for (const subtask of subtasks) {
              if (subtask.user_id) {
                const [userCheck] = await db.query(
                  "SELECT 1 FROM users WHERE id = ? AND deleted_at IS NULL",
                  [subtask.user_id]
                );
                if (userCheck.length > 0) {
                  workingEmployees.add(subtask.user_id);
                }
              }
            }
          } else {
            // If task has no subtasks, count the task itself
            totalItems += 1;
            if (task.status === 3) completedItems += 1;

            if (task.user_id) {
              const [userCheck] = await db.query(
                "SELECT 1 FROM users WHERE id = ? AND deleted_at IS NULL",
                [task.user_id]
              );
              if (userCheck.length > 0) {
                workingEmployees.add(task.user_id);
              }
            }
          }
        }

        const completionPercentage =
          totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

        let employeeList = [];
        if (workingEmployees.size > 0) {
          const employeeDetailsQuery = `
            SELECT id, 
                   COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS full_name 
            FROM users 
            WHERE id IN (?) AND deleted_at IS NULL
          `;
          const [employees] = await db.query(employeeDetailsQuery, [
            Array.from(workingEmployees),
          ]);

          employeeList = employees.map((user) => {
            const nameParts = user.full_name ? user.full_name.split(" ") : [];
            const firstInitial =
              nameParts[0] && nameParts[0][0]
                ? nameParts[0][0].toUpperCase()
                : "";
            const secondInitial =
              nameParts[1] && nameParts[1][0]
                ? nameParts[1][0].toUpperCase()
                : "";

            const initials =
              firstInitial + secondInitial ||
              (nameParts[0] || "").slice(0, 2).toUpperCase();

            return {
              employee_name: user.full_name || "N/A",
              employee_id: user.id || "N/A",
              initials: initials,
            };
          });
        }

        return {
          product_id: product.id,
          product_name: product.name,
          total_tasks: totalItems, // Corrected total task count logic
          completed_percentage: completionPercentage,
          completed_items: completedItems,
          employee_count: workingEmployees.size,
          employees: employeeList,
        };
      })
    );

    return successResponse(
      res,
      {
        total_products: products.length,
        product_data: result,
      },
      "Products retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Error fetching products:", error);
    return errorResponse(res, error.message, "Error fetching products", 500);
  }
};

exports.fetchUtilization = async (req, res) => {
  try {
    const { team_id } = req.query;

    if (team_id) {
      const [rows] = await db.query(
        "SELECT id FROM teams WHERE id = ? AND deleted_at IS NULL",
        [team_id]
      );

      // Check if no rows are returned
      if (rows.length === 0) {
        return errorResponse(res, null, "Team Not Found", 400);
      }
    }

    // Step 1: Get total strength grouped by team, including team name
    const totalStrengthQuery = `
      SELECT 
        t.id AS team_id, 
        t.name AS team_name, 
        COUNT(u.id) AS total_strength 
      FROM teams t
      LEFT JOIN users u ON t.id = u.team_id 
      WHERE t.deleted_at IS NULL AND u.deleted_at IS NULL
      ${team_id ? "AND t.id = ?" : ""}
      GROUP BY t.id
    `;
    const [totalStrengthData] = await db.query(
      totalStrengthQuery,
      team_id ? [team_id] : []
    );

    const totalStrength = totalStrengthData.reduce((acc, row) => {
      acc[row.team_id] = {
        team_id: row.team_id,
        team_name: row.team_name || "Unknown Team",
        total_strength: row.total_strength,
      };
      return acc;
    }, {});

    // Step 2: Get working employees grouped by team, including team name
    const workingEmployeesQuery = `
  SELECT 
    u.id AS user_id,
    COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS employee_name,
    u.employee_id AS employee_id,
    u.team_id AS team_id,
    t.name AS team_name
  FROM (
    SELECT user_id, MIN(start_time) AS start_time
    FROM sub_tasks_user_timeline
    WHERE DATE(start_time) = CURDATE()
    GROUP BY user_id
  ) stut
  JOIN users u ON stut.user_id = u.id
  JOIN teams t ON u.team_id = t.id
  LEFT JOIN employee_leave el 
    ON el.user_id = u.id 
    AND DATE(el.date) = CURDATE()
  WHERE u.deleted_at IS NULL 
    AND t.deleted_at IS NULL
    ${team_id ? "AND t.id = ?" : ""}
    AND (
      el.id IS NULL
      OR (el.day_type = 2 AND el.half_type = 1 AND HOUR(CONVERT_TZ(stut.start_time, '+00:00', '+05:30')) >= 12)
      OR (el.day_type = 2 AND el.half_type = 2 AND HOUR(CONVERT_TZ(stut.start_time, '+00:00', '+05:30')) < 12)
    )
`;

    const [workingEmployeesData] = await db.query(
      workingEmployeesQuery,
      team_id ? [team_id] : []
    );

    const workingEmployees = workingEmployeesData.reduce((acc, user) => {
      if (!acc[user.team_id]) {
        acc[user.team_id] = {
          team_name: user.team_name || "Unknown Team",
          working_count: 0,
          working_employees: [],
        };
      }
      acc[user.team_id].working_count++;
      acc[user.team_id].working_employees.push({
        name: user.employee_name || "N/A",
        employee_id: user.employee_id || "N/A",
      });
      return acc;
    }, {});

    // Step 3: Combine totalStrength and workingEmployees into utilization data
    const utilization = Object.keys(totalStrength).map((teamId) => {
      const team = totalStrength[teamId];
      const working = workingEmployees[teamId] || {
        team_name: team.team_name,
        working_count: 0,
        working_employees: [],
      };

      return {
        team_id: teamId,
        team_name: team.team_name,
        total_strength:
          team.total_strength < 10
            ? `0${team.total_strength}`
            : `${team.total_strength}`,
        working_count:
          working.working_count < 10
            ? `0${working.working_count}`
            : `${working.working_count}`,
        working_employees: working.working_employees,
      };
    });

    // Step 4: Return final response
    return successResponse(
      res,
      {
        utilization,
      },
      "Utilization data retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Error fetching utilization data:", error);
    return errorResponse(
      res,
      error.message,
      "Error fetching utilization data",
      500
    );
  }
};

exports.fetchAttendance = async (payload, res) => {
  try {
    // Step 1: Get total strength of all users
    const totalStrengthQuery = `SELECT COUNT(*) AS total_strength FROM users WHERE deleted_at IS NULL AND role_id != 1`;
    const [[{ total_strength: totalStrength }]] = await db.query(
      totalStrengthQuery
    );

    // Step 2: Calculate total absent employees
    const currentTime = new Date();
    const cutoffTime = new Date();
    cutoffTime.setHours(13, 0, 0); // 1:00 PM cutoff

    const totalAbsentQuery = `
      SELECT COUNT(*) AS total_absent 
      FROM employee_leave WHERE deleted_at IS NULL
      AND DATE(date) = CURDATE() 
        AND (
          day_type = 1 OR 
          (day_type = 2 AND half_type = 1 AND ? < ?) OR 
          (day_type = 2 AND half_type = 2 AND ? >= ?)
        )
    `;
    const [[{ total_absent: totalAbsentEmployees }]] = await db.query(
      totalAbsentQuery,
      [currentTime, cutoffTime, currentTime, cutoffTime]
    );

    const totalPresentEmployees = totalStrength - totalAbsentEmployees;

    const totalPresentPercentage =
      totalStrength > 0
        ? Math.round((totalPresentEmployees / totalStrength) * 100)
        : 0;
    const totalAbsentPercentage =
      totalStrength > 0
        ? Math.round((totalAbsentEmployees / totalStrength) * 100)
        : 0;

    // Step 3: Get team-wise attendance details
    const teamWiseAttendanceQuery = `
      SELECT 
        t.id AS team_id,
        t.name AS team_name,
        u.id AS user_id,
        u.employee_id AS employee_id,
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS employee_name,
        el.day_type,
        el.half_type 
      FROM teams t
      LEFT JOIN users u ON t.id = u.team_id
      LEFT JOIN employee_leave el ON u.id = el.user_id AND DATE(el.date) = CURDATE()  WHERE 
    t.deleted_at IS NULL 
    AND (u.deleted_at IS NULL OR u.deleted_at IS NULL) 
    AND (el.deleted_at IS NULL OR el.deleted_at IS NULL)
    `;
    const [teamWiseAttendanceData] = await db.query(teamWiseAttendanceQuery);

    const teamWiseAttendance = teamWiseAttendanceData.reduce((acc, row) => {
      const {
        team_id,
        team_name,
        user_id,
        employee_id,
        employee_name,
        day_type,
        half_type,
      } = row;

      if (!acc[team_id]) {
        acc[team_id] = {
          team_id,
          team_name: team_name || "Unknown Team",
          total_team_count: 0,
          team_absent_count: 0,
          team_present_count: 0,
          absent_employees: [],
          present_employees: [],
        };
      }

      // Check if the current row has no employee (user_id is null)
      if (!user_id) {
        return acc;
      }

      if (user_id) {
        acc[team_id].total_team_count++;

        const isAbsent =
          day_type === 1 ||
          (day_type === 2 && half_type === 1 && currentTime < cutoffTime) ||
          (day_type === 2 && half_type === 2 && currentTime >= cutoffTime);

        if (isAbsent) {
          acc[team_id].team_absent_count++; // Increment absent count
          acc[team_id].absent_employees.push({
            user_id,
            employee_id,
            employee_name,
          });
        } else {
          acc[team_id].team_present_count++; // Increment present count
          acc[team_id].present_employees.push({
            user_id,
            employee_id,
            employee_name,
          });
        }
      }

      return acc;
    }, {});

    const pad = (num) => num.toString().padStart(2, "0");
    const teamWiseAttendanceArray = Object.values(teamWiseAttendance).map(
      (team) => ({
        ...team,
        total_team_count: pad(team.total_team_count),
        team_absent_count: pad(team.team_absent_count),
        team_present_count: pad(team.team_present_count),
      })
    );

    // Step 4: Combine attendance results
    const result = {
      total_strength: pad(totalStrength),
      total_present_employees: pad(totalPresentEmployees),
      total_absent_employees: pad(totalAbsentEmployees),
      total_present_percentage: totalPresentPercentage,
      total_absent_percentage: totalAbsentPercentage,
      team_wise_attendance: teamWiseAttendanceArray,
    };

    // Step 5: Return response
    return successResponse(
      res,
      result,
      "Attendance data retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Error fetching attendance data:", error);
    return errorResponse(
      res,
      error.message,
      "Error fetching attendance data",
      500
    );
  }
};
exports.fetchPmviewproductdata = async (req, res) => {
  try {
    const { product_id, project_id, team_id, date, search } = req.query;

    const accessToken = req.headers.authorization?.split(" ")[1];
    if (!accessToken) {
      return errorResponse(res, "Access token is required", 401);
    }
    const user_id = await getUserIdFromAccessToken(accessToken);

    // Validate if product_id exists
    if (!product_id) {
      console.log("Missing product_id in query parameters");
      return errorResponse(
        res,
        "Product ID is required",
        "Missing product_id in query parameters",
        400
      );
    }
    if (!user_id) {
      console.log("Missing user_id in query parameters");
      return errorResponse(
        res,
        "user_id is required",
        "Missing user_id in query parameters",
        400
      );
    }

    // Validate product existence
    const [rows] = await db.query(
      "SELECT id FROM products WHERE id = ? AND deleted_at IS NULL",
      [product_id]
    );

    if (rows.length === 0) {
      return errorResponse(res, null, "Product Not Found", 400);
    }

    const productQuery = `
      SELECT id, name
      FROM products
      WHERE id = ? AND deleted_at IS NULL
    `;
    const [productRows] = await db.query(productQuery, [product_id]);
    const product = productRows[0] || { name: "N/A", id: "N/A" };

    // Base query for tasks and subtasks
    let baseQuery = `
      SELECT 
        t.id AS task_id,
        t.name AS task_name,
        t.status AS task_status,
        t.active_status AS task_active_status,
        t.reopen_status AS task_reopen_status,
        t.start_date AS task_date,
        t.priority AS task_priority,
        t.estimated_hours AS task_estimation_hours,
        t.description AS task_description,
        t.assigned_user_id AS task_assigned_user_id,
        t.updated_at AS task_updated_at,
        s.id AS subtask_id,
        s.name AS subtask_name,
        s.status AS subtask_status,
        s.active_status AS subtask_active_status,
        s.reopen_status AS subtask_reopen_status,
        s.estimated_hours AS subtask_estimation_hours,
        s.description AS subtask_description,
        s.assigned_user_id AS subtask_assigned_user_id,
        s.updated_at AS subtask_updated_at,
        te.name AS team_name,
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS employee_name,
        p.name AS project_name
      FROM tasks t
      LEFT JOIN sub_tasks s 
        ON t.id = s.task_id 
        AND s.deleted_at IS NULL
      LEFT JOIN teams te 
        ON t.team_id = te.id
        AND te.deleted_at IS NULL
      LEFT JOIN users u 
        ON t.user_id = u.id
        AND u.deleted_at IS NULL
      LEFT JOIN projects p 
        ON t.project_id = p.id
        AND p.deleted_at IS NULL
      WHERE t.product_id = ? 
        AND t.deleted_at IS NULL
    `;

    const params = [product_id];

    if (project_id) {
      baseQuery += ` AND t.project_id = ?`;
      params.push(project_id);
    }

    if (team_id) {
      baseQuery += ` AND t.team_id = ?`;
      params.push(team_id);
    }

    if (date) {
      baseQuery += ` AND DATE(t.start_date) = ?`;
      params.push(date);
    }

    if (search) {
      const searchTerm = `%${search}%`;
      baseQuery += `
        AND (
          COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) LIKE ? OR
          p.name LIKE ? OR
          te.name LIKE ? OR
          t.name LIKE ? OR
          t.priority LIKE ? OR
          s.name LIKE ?
        )
      `;
      params.push(
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm
      );
    }

    baseQuery += `
      ORDER BY 
        (t.assigned_user_id = ?) DESC,
        t.updated_at DESC,
        (s.assigned_user_id = ?) DESC,
        s.updated_at DESC
    `;
    params.push(user_id, user_id);

    // Execute the query for tasks
    const [taskRows] = await db.query(baseQuery, params);

    const isValidSubtask = (item, status) => {
      // Determine if the item is a task or a subtask
      const isTask = !item.hasOwnProperty("subtask_id");

      // Task or subtask validation
      if (isTask) {
        switch (status) {
          case "Pending":
            return (
              item.active_status === 0 &&
              item.status === 0 &&
              item.reopen_status === 0
            );
          case "In Progress":
            return item.active_status === 1 && item.status === 1;
          case "In Review":
            return item.reopen_status === 0 && item.status === 2;
          case "On Hold":
            return (
              item.active_status === 0 &&
              item.status === 1 &&
              item.reopen_status === 0
            );
          case "Done":
            return item.status === 3;
          case "Re Open":
            return item.reopen_status === 1;
          default:
            return false;
        }
      } else {
        // This is for subtasks
        switch (status) {
          case "Pending":
            return (
              item.active_status === 0 &&
              item.status === 0 &&
              item.reopen_status === 0
            );
          case "In Progress":
            return item.active_status === 1 && item.status === 1;
          case "In Review":
            return item.reopen_status === 0 && item.status === 2;
          case "On Hold":
            return (
              item.active_status === 0 &&
              item.status === 1 &&
              item.reopen_status === 0
            );
          case "Done":
            return item.status === 3;
          case "Re Open":
            return item.reopen_status === 1;
          default:
            return false;
        }
      }
    };

    // Helper function to format tasks and subtasks
    const formatTask = (task, subtasks, status) => {
      const validSubtasks = [];
      let totalSubtasks = 0;
      let completedSubtasks = 0;

      // Collect and validate subtask details
      subtasks.forEach((subtask) => {
        if (isValidSubtask(subtask, status)) {
          validSubtasks.push({
            SubtaskId: subtask.id || "N/A",
            SubtaskName: subtask.name || "N/A",
            SubtaskEstimationHours: subtask.estimated_hours || "N/A",
            SubtaskDescription: subtask.description || "N/A",
            SubtaskActiveStatus: subtask.subtask_active_status || "N/A",
            SubtaskStatus: subtask.status || "N/A",
            AssignedUserId: subtask.assigned_user_id || "N/A",
          });
        }
        totalSubtasks++;
        if (subtask.status === 3) {
          completedSubtasks++;
        }
      });

      // Calculate completion percentage
      const completionPercentage =
        totalSubtasks > 0
          ? Math.round((completedSubtasks / totalSubtasks) * 100)
          : task.status === 3
            ? 100
            : 0;

      // Return the formatted task object
      return {
        Date: task.date
          ? new Date(task.date).toISOString().split("T")[0]
          : "N/A",
        Team: task.team_name || "N/A",
        EmployeeName: task.employee_name || "N/A",
        Priority: task.priority || "N/A",
        ProjectName: task.project_name || "N/A",
        projectColor: getColorForProduct(task.project_name),
        TaskName: task.name || "N/A",
        TaskId: task.id || "N/A",
        TotalSubtaskCount: totalSubtasks,
        CompletedSubtaskCount: completedSubtasks,
        EstimationHours: task.estimation_hours || "N/A",
        Description: task.description || "N/A",
        AssignedUserId: task.assigned_user_id || "N/A",
        Subtasks: validSubtasks,
        CompletionPercentage: completionPercentage,
        Status: status,
      };
    };

    // Group tasks by status
    const groupedTasks = {
      Pending: [],
      "In Progress": [],
      "In Review": [],
      "On Hold": [],
      Done: [],
      "Re Open": [],
    };

    // Track added task IDs for each section
    const addedTaskIds = {
      Pending: [],
      "In Progress": [],
      "In Review": [],
      "On Hold": [],
      Done: [],
      "Re Open": [],
    };

    // Process each row and categorize tasks
    taskRows.forEach((row) => {
      const task = {
        id: row.task_id,
        name: row.task_name,
        status: row.task_status,
        active_status: row.task_active_status,
        reopen_status: row.task_reopen_status,
        priority: row.task_priority,
        date: row.task_date,
        estimation_hours: row.task_estimation_hours,
        description: row.task_description,
        team_name: row.team_name,
        employee_name: row.employee_name,
        project_name: row.project_name,
        project_color: getColorForProduct(row.project_name),
        assigned_user_id: row.task_assigned_user_id,
      };

      // Create subtask if applicable
      const subtask = row.subtask_id
        ? {
          id: row.subtask_id,
          name: row.subtask_name,
          status: row.subtask_status,
          active_status: row.subtask_active_status,
          reopen_status: row.subtask_reopen_status,
          estimated_hours: row.subtask_estimation_hours,
          description: row.subtask_description,
          assigned_user_id: row.subtask_assigned_user_id,
        }
        : null;

      // Find category based on task's subtask or status
      const category = Object.keys(groupedTasks).find((status) =>
        isValidSubtask(subtask || task, status)
      );

      // Only add task if it hasn't been added to that category already
      if (category) {
        const existingTaskIndex = groupedTasks[category].findIndex(
          (t) => t.TaskId === task.id
        );

        if (existingTaskIndex === -1) {
          // Task does not exist in the section, so push the task with its subtask
          groupedTasks[category].push(
            formatTask(task, subtask ? [subtask] : [], category)
          );
        } else {
          // Task exists, so add the subtask to the existing task
          const existingTask = groupedTasks[category][existingTaskIndex];

          // Add the new subtask to the existing task
          existingTask.Subtasks.push({
            SubtaskId: subtask.id || "N/A",
            SubtaskName: subtask.name || "N/A",
            SubtaskEstimationHours: subtask.estimated_hours || "N/A",
            SubtaskDescription: subtask.description || "N/A",
            SubtaskActiveStatus: subtask.active_status || "N/A",
            SubtaskStatus: subtask.status || "N/A",
            AssignedUserId: subtask.assigned_user_id || "N/A",
          });

          // Update the counts for subtasks
          existingTask.TotalSubtaskCount++; // Increment total subtasks count
          if (subtask.status === 3) {
            existingTask.CompletedSubtaskCount++; // Increment completed subtasks count
          }

          // Recalculate completion percentage
          const completionPercentage =
            existingTask.TotalSubtaskCount > 0
              ? Math.round(
                (existingTask.CompletedSubtaskCount /
                  existingTask.TotalSubtaskCount) *
                100
              )
              : 0;

          existingTask.CompletionPercentage = completionPercentage;
        }
      }
    });
    // Calculate task counts and overall completion percentage
    const taskCount = taskRows.length;
    // Track totals for tasks and subtasks
    let totalItems = 0;
    let completedItems = 0;

    Object.keys(groupedTasks).forEach((status) => {
      groupedTasks[status].forEach((task) => {
        // If the task has subtasks, count the subtasks
        if (task.Subtasks.length > 0) {
          task.Subtasks.forEach((subtask) => {
            totalItems++;
            if (subtask.SubtaskStatus === 3) {
              // Assuming 3 is the "Done" status
              completedItems++;
            }
          });
        } else {
          // Otherwise, count the task itself
          totalItems++;
          if (task.CompletionPercentage === 100) {
            completedItems++;
          }
        }
      });
    });

    // Calculate overall completion based on total task and subtask counts
    const overallCompletionPercentage =
      totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    const result = {
      PendingTasks: groupedTasks["Pending"],
      InProgressTasks: groupedTasks["In Progress"],
      InReviewTasks: groupedTasks["In Review"],
      OnHoldTasks: groupedTasks["On Hold"],
      DoneTasks: groupedTasks["Done"],
      ReOpenTasks: groupedTasks["Re Open"],
      TodoCount: groupedTasks["Pending"].length,
      InProgressCount: groupedTasks["In Progress"].length,
      InReviewCount: groupedTasks["In Review"].length,
      OnHoldCount: groupedTasks["On Hold"].length,
      DoneCount: groupedTasks["Done"].length,
      ReOpenCount: groupedTasks["Re Open"].length,
      TaskCount: taskCount,
      OverallCompletionPercentage: overallCompletionPercentage,
      productname: product.name,
      productid: product.id,
    };

    // Send the success response with the result
    return successResponse(
      res,
      result,
      "Product details retrieved successfully",
      200
    );
    // Send response with grouped tasks
    // return successResponse(res, groupedTasks);
  } catch (error) {
    console.error(error);
    return errorResponse(
      res,
      "Error fetching product task data",
      error.message,
      500
    );
  }
};

exports.fetchPmdatas = async (req, res) => {
  try {
    // Step 1: Fetch products data
    const productsQuery = "SELECT * FROM products WHERE deleted_at IS NULL";
    const [products] = await db.query(productsQuery);

    const productData = await Promise.all(
      products.map(async (product) => {
        const tasksQuery =
          "SELECT * FROM tasks WHERE product_id = ? AND deleted_at IS NULL";
        const [tasks] = await db.query(tasksQuery, [product.id]);

        let totalItems = 0;
        let completedItems = 0;
        let workingEmployees = new Set();

        for (const task of tasks) {
          const subtasksQuery =
            "SELECT * FROM sub_tasks WHERE task_id = ? AND deleted_at IS NULL";
          const [subtasks] = await db.query(subtasksQuery, [task.id]);

          if (subtasks.length > 0) {
            totalItems += subtasks.length;
            completedItems += subtasks.filter(
              (subtask) => subtask.status === 3
            ).length;

            subtasks.forEach((subtask) => {
              if (subtask.user_id) workingEmployees.add(subtask.user_id);
            });
          } else {
            totalItems += 1;
            if (task.status === 3) completedItems += 1;

            if (task.user_id) workingEmployees.add(task.user_id);
          }
        }

        const completionPercentage =
          totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

        let employeeList = [];
        if (workingEmployees.size > 0) {
          const employeeDetailsQuery = `
            SELECT id, 
                   COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS full_name 
            FROM users 
            WHERE id IN (?) AND deleted_at IS NULL
          `;
          const [employees] = await db.query(employeeDetailsQuery, [
            Array.from(workingEmployees),
          ]);

          employeeList = employees.map((user) => {
            const nameParts = user.full_name ? user.full_name.split(" ") : [];
            const firstInitial =
              nameParts[0] && nameParts[0][0]
                ? nameParts[0][0].toUpperCase()
                : "";
            const secondInitial =
              nameParts[1] && nameParts[1][0]
                ? nameParts[1][0].toUpperCase()
                : "";

            const initials =
              firstInitial + secondInitial ||
              (nameParts[0] || "").slice(0, 2).toUpperCase();

            return {
              employee_name: user.full_name || "N/A",
              employee_id: user.id || "N/A",
              initials: initials,
            };
          });
        }

        return {
          product_id: product.id,
          product_name: product.name,
          total_tasks: tasks.length,
          completed_percentage: completionPercentage,
          employee_count: workingEmployees.size,
          employees: employeeList,
        };
      })
    );

    // Step 2: Fetch utilization data
    const { team_id } = req.query;

    if (team_id) {
      const [rows] = await db.query(
        "SELECT id FROM teams WHERE id = ? AND deleted_at IS NULL",
        [team_id]
      );

      // Check if no rows are returned
      if (rows.length === 0) {
        return errorResponse(res, null, "Team Not Found", 400);
      }
    }

    // Step 1: Get total strength grouped by team, including team name
    const totalStrengthQuery = `
      SELECT 
        t.id AS team_id, 
        t.name AS team_name, 
        COUNT(u.id) AS total_strength 
      FROM teams t
      LEFT JOIN users u ON t.id = u.team_id 
      WHERE t.deleted_at IS NULL AND u.deleted_at IS NULL
      ${team_id ? "AND t.id = ?" : ""}
      GROUP BY t.id
    `;
    const [totalStrengthData] = await db.query(
      totalStrengthQuery,
      team_id ? [team_id] : []
    );

    const totalStrength = totalStrengthData.reduce((acc, row) => {
      acc[row.team_id] = {
        team_id: row.team_id,
        team_name: row.team_name || "Unknown Team",
        total_strength: row.total_strength,
      };
      return acc;
    }, {});

    // Step 2: Get working employees grouped by team, including team name
    const workingEmployeesQuery = `
      SELECT 
        u.id AS user_id,
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS employee_name,
        u.employee_id AS employee_id,
        u.team_id AS team_id,
        t.name AS team_name
      FROM sub_tasks_user_timeline stut
      JOIN users u ON stut.user_id = u.id
      JOIN teams t ON u.team_id = t.id
      WHERE DATE(stut.start_time) = CURDATE() 
        AND u.deleted_at IS NULL 
        AND t.deleted_at IS NULL
        ${team_id ? "AND t.id = ?" : ""}
    `;
    const [workingEmployeesData] = await db.query(
      workingEmployeesQuery,
      team_id ? [team_id] : []
    );

    const workingEmployees = workingEmployeesData.reduce((acc, user) => {
      if (!acc[user.team_id]) {
        acc[user.team_id] = {
          team_name: user.team_name || "Unknown Team",
          working_count: 0,
          working_employees: [],
        };
      }
      acc[user.team_id].working_count++;
      acc[user.team_id].working_employees.push({
        name: user.employee_name || "N/A",
        employee_id: user.employee_id || "N/A",
      });
      return acc;
    }, {});

    // Step 3: Combine totalStrength and workingEmployees into utilization data
    const utilization = Object.keys(totalStrength).map((teamId) => {
      const team = totalStrength[teamId];
      const working = workingEmployees[teamId] || {
        team_name: team.team_name,
        working_count: 0,
        working_employees: [],
      };

      return {
        team_id: teamId,
        team_name: team.team_name,
        total_strength: team.total_strength,
        working_count: working.working_count,
        working_employees: working.working_employees,
      };
    });

    // Step 3: Fetch attendance data
    const totalStrengthQueryAttendance = `SELECT COUNT(*) AS total_strength FROM users WHERE deleted_at IS NULL`;
    const [[{ total_strength: totalStrengthAttendance }]] = await db.query(
      totalStrengthQueryAttendance
    );

    const currentTime = new Date();
    const cutoffTime = new Date();
    cutoffTime.setHours(13, 0, 0);

    const totalAbsentQuery = `
      SELECT COUNT(*) AS total_absent 
      FROM employee_leave 
      WHERE deleted_at IS NULL
      AND DATE(date) = CURDATE() 
        AND (
          day_type = 1 OR 
          (day_type = 2 AND half_type = 1 AND ? < ?) OR 
          (day_type = 2 AND half_type = 2 AND ? >= ?)
        )
    `;
    const [[{ total_absent: totalAbsentEmployees }]] = await db.query(
      totalAbsentQuery,
      [currentTime, cutoffTime, currentTime, cutoffTime]
    );

    const totalPresentEmployees =
      totalStrengthAttendance - totalAbsentEmployees;

    const totalPresentPercentage =
      totalStrengthAttendance > 0
        ? Math.round((totalPresentEmployees / totalStrengthAttendance) * 100)
        : 0;
    const totalAbsentPercentage =
      totalStrengthAttendance > 0
        ? Math.round((totalAbsentEmployees / totalStrengthAttendance) * 100)
        : 0;

    const teamWiseAttendanceQuery = `
      SELECT 
        t.id AS team_id,
        t.name AS team_name,
        u.id AS employee_id,
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS employee_name,
        el.day_type,
        el.half_type 
      FROM teams t
      LEFT JOIN users u ON t.id = u.team_id
      LEFT JOIN employee_leave el ON u.id = el.user_id AND DATE(el.date) = CURDATE() AND t.deleted_at IS NULL AND u.deleted_at IS NULL AND el.deleted_at IS NULL
    `;
    const [teamWiseAttendanceData] = await db.query(teamWiseAttendanceQuery);

    const teamWiseAttendance = teamWiseAttendanceData.reduce((acc, row) => {
      const {
        team_id,
        team_name,
        employee_id,
        employee_name,
        day_type,
        half_type,
      } = row;

      if (!acc[team_id]) {
        acc[team_id] = {
          team_id,
          team_name: team_name || "Unknown Team",
          total_team_count: 0,
          team_absent_count: 0,
          team_present_count: 0,
          absent_employees: [],
          present_employees: [],
        };
      }

      const isAbsent =
        day_type === 1 ||
        (day_type === 2 && half_type === 1 && currentTime < cutoffTime) ||
        (day_type === 2 && half_type === 2 && currentTime >= cutoffTime);

      if (isAbsent) {
        acc[team_id].team_absent_count++;
        acc[team_id].absent_employees.push({
          employee_id,
          employee_name,
        });
      } else {
        acc[team_id].team_present_count++;
        acc[team_id].present_employees.push({
          employee_id,
          employee_name,
        });
      }

      acc[team_id].total_team_count++;
      return acc;
    }, {});

    const teamWiseAttendanceArray = Object.values(teamWiseAttendance);

    // Step 4: Combine all results
    const result = {
      products: {
        total_products: products.length,
        product_data: productData,
      },
      utilization,
      attendance: {
        total_strength: totalStrengthAttendance,
        total_present_employees: totalPresentEmployees,
        total_absent_employees: totalAbsentEmployees,
        total_present_percentage: totalPresentPercentage,
        total_absent_percentage: totalAbsentPercentage,
        team_wise_attendance: teamWiseAttendanceArray,
      },
    };

    // Step 5: Return response
    return successResponse(res, result, "PM data retrieved successfully", 200);
  } catch (error) {
    console.error("Error fetching PM data:", error);
    return errorResponse(res, error.message, "Error fetching PM data", 500);
  }
};

exports.fetchUserTasksByProduct = async (req, res) => {
  const accessToken = req.headers.authorization?.split(" ")[1];
  if (!accessToken) {
    return errorResponse(res, "Access token is required", 401);
  }

  const login_id = await getUserIdFromAccessToken(accessToken);

  try {
    // Get role and team of logged-in user
    const [[loggedInUser]] = await db.query(
      `SELECT id, role_id FROM users WHERE id = ? AND deleted_at IS NULL`,
      [login_id]
    );

    if (!loggedInUser) {
      return errorResponse(res, null, "User not found", 404);
    }

    let userIdsFilter = []; // filter list
    if (await hasPermission("dashboard.team_product_graph", accessToken)) {

      userIdsFilter = await getTeamuserids(login_id);

      if (userIdsFilter.length === 0) {
        return successResponse(res, [], "No team members found", 200);
      }
    } else if (await hasPermission("dashboard.user_product_graph", accessToken)) {
      userIdsFilter = [login_id];
    }

    // --- Continue with Product ID Validation ---
    const productIdString = req.query.product_id || "";
    const productIds = productIdString
      .split(",")
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => !isNaN(id));

    if (productIds.length < 1 || productIds.length > 4) {
      return errorResponse(
        res,
        null,
        "Please provide minimum 1 product and maximum 4 product IDs",
        400
      );
    }

    const [products] = await db.query(
      `SELECT DISTINCT id, name FROM products WHERE deleted_at IS NULL AND id IN (?)`,
      [productIds]
    );

    const result = await Promise.all(
      products.map(async (product) => {
        let inProgressCount = 0;
        let completedCount = 0;
        let pendingCount = 0;

        // Prepare user filter condition
        const userFilterSql =
          userIdsFilter.length > 0
            ? `AND t.user_id IN (${userIdsFilter.join(",")})`
            : "";
        const subUserFilterSql =
          userIdsFilter.length > 0
            ? `AND st.user_id IN (${userIdsFilter.join(",")})`
            : "";

        // Tasks without subtasks
        const [soloTasks] = await db.query(
          `SELECT t.status, t.active_status, t.reopen_status
           FROM tasks t
           LEFT JOIN sub_tasks st ON st.task_id = t.id AND st.deleted_at IS NULL
           WHERE t.product_id = ?
             AND t.deleted_at IS NULL
             AND st.id IS NULL
             ${userFilterSql}`,
          [product.id]
        );

        soloTasks.forEach((task) => {
          if (task.status === 3) {
            completedCount++;
          } else if (
            (task.status === 1 &&
              task.active_status === 1 &&
              task.reopen_status === 0) ||
            (task.status === 2 && task.reopen_status === 0)
          ) {
            inProgressCount++;
          } else if (
            (task.status === 0 &&
              task.active_status === 0 &&
              task.reopen_status === 0) ||
            (task.status === 1 &&
              task.active_status === 0 &&
              task.reopen_status === 0) ||
            task.reopen_status === 1
          ) {
            pendingCount++;
          }
        });

        // Subtasks
        const [subTasks] = await db.query(
          `SELECT st.status, st.active_status, st.reopen_status
           FROM sub_tasks st
           JOIN tasks t ON t.id = st.task_id AND t.deleted_at IS NULL
           WHERE st.deleted_at IS NULL
             AND t.product_id = ?
             ${subUserFilterSql}`,
          [product.id]
        );

        subTasks.forEach((subtask) => {
          if (subtask.status === 3) {
            completedCount++;
          } else if (
            (subtask.status === 1 &&
              subtask.active_status === 1 &&
              subtask.reopen_status === 0) ||
            (subtask.status === 2 && subtask.reopen_status === 0)
          ) {
            inProgressCount++;
          } else if (
            (subtask.status === 0 &&
              subtask.active_status === 0 &&
              subtask.reopen_status === 0) ||
            (subtask.status === 1 &&
              subtask.active_status === 0 &&
              subtask.reopen_status === 0) ||
            subtask.reopen_status === 1
          ) {
            pendingCount++;
          }
        });

        const total = inProgressCount + completedCount + pendingCount;
        const inProgressPercent =
          total > 0 ? Math.round((inProgressCount / total) * 100) : 0;
        const completedPercent =
          total > 0 ? Math.round((completedCount / total) * 100) : 0;
        const pendingPercent =
          total > 0 ? Math.round((pendingCount / total) * 100) : 0;

        return {
          product_id: product.id,
          product_name: product.name,
          inprogress_count: inProgressCount,
          inprogress_percentage: inProgressPercent,
          completed_count: completedCount,
          completed_percentage: completedPercent,
          pending_count: pendingCount,
          pending_percentage: pendingPercent,
        };
      })
    );

    return successResponse(
      res,
      result,
      "Task data retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Error fetching task data:", error);
    return errorResponse(res, error.message, "Error fetching task data", 500);
  }
};

exports.fetchTeamUtilizationAndAttendance = async (req, res) => {
  const accessToken = req.headers.authorization?.split(" ")[1];
  if (!accessToken) {
    return errorResponse(res, "Access token is required", 401);
  }
  try {
    const { team_id, date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    const formattedDate = targetDate.toISOString().split("T")[0];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);

    if (target > today) {
      return errorResponse(res, null, "Future dates are not allowed", 400);
    }

    const exclusionChecks = {
      totalUsers: 'dashboard.exclude_from_total_users',
      associateUsers: 'dashboard.exclude_from_associates',
      attendanceUsers: 'dashboard.exclude_from_attendance'
    };
    const excludedRoleMap = {};

    for (const [key, permissionName] of Object.entries(exclusionChecks)) {
      const hasAccess = await hasPermission(permissionName, accessToken);
      if (hasAccess) {
        const [rows] = await db.query(`
          SELECT rhp.role_id
          FROM role_has_permissions rhp
          JOIN permissions p ON rhp.permission_id = p.id
          WHERE p.name = ?
        `, [permissionName]);
        excludedRoleMap[key] = rows.map(r => r.role_id);
      } else {
        excludedRoleMap[key] = [];
      }
    }

    // STEP 2: Query each user group with dynamic exclusions

    const buildWhereClause = (excludedRoles) => {
      return `
        u.deleted_at IS NULL AND t.deleted_at IS NULL
        AND DATE(u.created_at) <= ?
        ${team_id ? "AND u.team_id = ?" : ""}
        ${excludedRoles.length ? `AND u.role_id NOT IN (${excludedRoles.map(() => '?').join(',')})` : ''}
      `;
    };

    const buildParams = (excludedRoles) => {
      const params = team_id ? [formattedDate, team_id] : [formattedDate];
      return excludedRoles.length ? [...params, ...excludedRoles] : params;
    };
    console.log(buildParams(excludedRoleMap.totalUsers));

    // Total Users
    const [totalUsers] = await db.query(`
      SELECT u.id AS user_id, u.employee_id, u.team_id, u.role_id, t.name AS team_name,
             COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS employee_name
      FROM users u
      LEFT JOIN teams t ON u.team_id = t.id
      WHERE ${buildWhereClause(excludedRoleMap.totalUsers)}
    `, buildParams(excludedRoleMap.totalUsers));

    // Associates
    const [associateUsers] = await db.query(`
      SELECT u.id AS user_id, u.employee_id, u.team_id, u.role_id, t.name AS team_name,
             COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS employee_name
      FROM users u
      LEFT JOIN teams t ON u.team_id = t.id
      WHERE ${buildWhereClause(excludedRoleMap.associateUsers)}
    `, buildParams(excludedRoleMap.associateUsers));

    // Attendance Users
    const [attendanceUsers] = await db.query(`
      SELECT u.id AS user_id, u.employee_id, u.team_id, u.role_id, t.name AS team_name,
             COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS employee_name
      FROM users u
      LEFT JOIN teams t ON u.team_id = t.id
      WHERE ${buildWhereClause(excludedRoleMap.attendanceUsers)}
    `, buildParams(excludedRoleMap.attendanceUsers));

    if (
      associateUsers.length === 0 ||
      totalUsers.length === 0 ||
      attendanceUsers.length === 0
    ) {
      return errorResponse(res, null, "No users found", 404);
    }

    const associateIds = associateUsers.map((u) => u.user_id);
    const attendanceIds = attendanceUsers.map((u) => u.user_id);

    // Step 2: Fetch Leave Data
    const [leaveRows] = await db.query(
      `
      SELECT user_id, day_type, half_type
      FROM employee_leave
      WHERE deleted_at IS NULL AND DATE(date) = ?
        AND user_id IN (?)
    `,
      [formattedDate, attendanceIds]
    );
    const leaveMap = {};
    leaveRows.forEach(({ user_id, day_type, half_type }) => {
      leaveMap[user_id] = { day_type, half_type };
    });

    // Step 3: Working activity data
    let timelineQuery = `
  SELECT user_id
  FROM sub_tasks_user_timeline
  WHERE DATE(start_time) = ?
    AND user_id IN (?)
`;
    const isToday = formattedDate === new Date().toISOString().split("T")[0];

    if (isToday) {
      timelineQuery += ` AND end_time IS NULL`;
    }

    timelineQuery += ` GROUP BY user_id`;

    const [timelineRows] = await db.query(timelineQuery, [
      formattedDate,
      associateIds,
    ]);
    const workingUserIds = new Set(timelineRows.map((r) => r.user_id));

    // Step 4: Initialize result map
    const resultMap = {};
    const defaultGroupKey = team_id ? null : "overall";

    if (!team_id) {
      resultMap[defaultGroupKey] = {
        team_id: null,
        team_name: "All Teams",
        total_strength: 0,
        present_employees: [],
        absent_employees: [],
        active_employees: [],
        idle_employees: [],
        total_strength_employees: [],
      };
    }

    // Fill total strength first
    totalUsers.forEach((user) => {
      const groupKey = team_id ? user.team_id : defaultGroupKey;
      if (!resultMap[groupKey]) {
        resultMap[groupKey] = {
          team_id: user.team_id,
          team_name: user.team_name || "Unknown Team",
          total_strength: 0,
          present_employees: [],
          absent_employees: [],
          active_employees: [],
          idle_employees: [],
          total_strength_employees: [],
        };
      }

      const result = resultMap[groupKey];
      const employee = {
        user_id: user.user_id,
        employee_id: user.employee_id
          ? String(user.employee_id).padStart(3, "0")
          : "N/A",
        employee_name: user.employee_name || "N/A",
        team_name: user.team_name || "N/A",
      };

      result.total_strength_employees.push(employee);
      result.total_strength++;
    });

    // Attendance check (only for associate users)
    const currentTime = new Date();
    const cutoffTimeStart = new Date(targetDate);
    cutoffTimeStart.setHours(13, 30, 0);
    const cutoffTimeEnd = new Date(targetDate);
    cutoffTimeEnd.setHours(13, 31, 0);

    associateUsers.forEach((user) => {
      const groupKey = team_id ? user.team_id : defaultGroupKey;
      if (!resultMap[groupKey]) return;

      const result = resultMap[groupKey];
      const employee = {
        user_id: user.user_id,
        employee_id: user.employee_id
          ? String(user.employee_id).padStart(3, "0")
          : "N/A",
        employee_name: user.employee_name || "N/A",
        team_name: user.team_name || "N/A",
      };

      const leave = leaveMap[user.user_id];
      const isAbsent =
        leave &&
        (leave.day_type === 1 ||
          (leave.day_type === 2 &&
            leave.half_type === 1 &&
            currentTime < cutoffTimeStart) ||
          (leave.day_type === 2 &&
            leave.half_type === 2 &&
            currentTime >= cutoffTimeEnd));

      if (isAbsent) {
        result.absent_employees.push(employee);
      } else {
        result.present_employees.push(employee);
        if (workingUserIds.has(user.user_id)) {
          result.active_employees.push(employee);
        } else {
          result.idle_employees.push(employee);
        }
      }
    });

    // Step 5: Format response
    const pad = (num) => num.toString().padStart(2, "0");

    const finalOutput = Object.values(resultMap).map((group) => ({
      team_id: group.team_id,
      team_name: group.team_name,
      total_strength: pad(group.total_strength),
      total_present_count: pad(group.present_employees.length),
      total_absent_count: pad(group.absent_employees.length),
      total_active_count: pad(group.active_employees.length),
      total_idle_count: pad(group.idle_employees.length),
      total_strength_employees: group.total_strength_employees,
      present_employees: group.present_employees,
      absent_employees: group.absent_employees,
      active_employees: group.active_employees,
      idle_employees: group.idle_employees,
    }));

    return successResponse(
      res,
      {
        date: formattedDate,
        teams: finalOutput,
      },
      "Team utilization and attendance data retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Error:", error);
    return errorResponse(res, error.message, "Error fetching data", 500);
  }
};

exports.getProjectCompletion = async (req, res) => {
  try {
    const { product_id, project_id, team_id, associate_id } = req.query;

    if (!product_id) {
      return errorResponse(res, null, "product_id is required", 400);
    }

    const accessToken = req.headers.authorization?.split(" ")[1];
    if (!accessToken) {
      return errorResponse(res, "Access token is required", 401);
    }

    const user_id = await getUserIdFromAccessToken(accessToken);

    const is_all_project_data = await hasPermission("dashboard.all_project_graph", accessToken);
    const is_team_project_data = await hasPermission("dashboard.team_project_graph", accessToken);
    const is_user_project_data = await hasPermission("dashboard.user_project_graph", accessToken);

    let teamIds = [];

    if (is_team_project_data) {
      const [userRow] = await db.query(
        `SELECT team_id FROM users WHERE id = ? AND deleted_at IS NULL`,
        [user_id]
      );

      if (userRow.length && userRow[0].team_id) {
        teamIds = userRow[0].team_id
          .split(',')
          .map(id => parseInt(id.trim()))
          .filter(id => !isNaN(id));
      }

      if (teamIds.length === 0) {
        return successResponse(res, {
          completed_tasks: project_id
            ? {
              pending_percentage: "0.00",
              inprogress_percentage: "0.00",
              completed_percentage: "0.00",
            }
            : [],
          team_utilization: [],
        });
      }
    }

    let teamFilterSql = "";
    let teamFilterParams = [];

    if (is_team_project_data) {
      const teamConditions = teamIds.map(() => `FIND_IN_SET(?, team_id)`).join(" OR ");
      teamFilterSql = `AND user_id IN (SELECT id FROM users WHERE ${teamConditions})`;
      teamFilterParams = [...teamIds];
    } else if (is_all_project_data) {
      if (team_id) {
        teamFilterSql = `AND user_id IN (SELECT id FROM users WHERE team_id = ?)`;
        teamFilterParams = [team_id];
      }
    } else if (is_user_project_data) {
      teamFilterSql = `AND user_id = ?`;
      teamFilterParams = [user_id];
    }

    if (associate_id) {
      teamFilterSql = `AND user_id = ?`;
      teamFilterParams = [associate_id];
      associateFilter = `AND u.id = ${associate_id}`;
    }

    const projectFilterSql = project_id ? `AND project_id = ?` : "";
    const projectFilterParams = project_id ? [project_id] : [];

    const completedTasksSql = `
      WITH all_tasks AS (
        SELECT t.id, t.project_id, t.status, t.reopen_status, t.active_status, t.user_id
        FROM tasks t
        WHERE t.product_id = ?
        ${projectFilterSql}
      ),
      all_subtasks AS (
        SELECT s.id, s.project_id, s.status, s.reopen_status, s.active_status, s.user_id, s.task_id
        FROM sub_tasks s
        WHERE s.product_id = ?
        ${projectFilterSql}
      ),
      tasks_with_subtasks AS (
        SELECT DISTINCT task_id FROM all_subtasks
      ),
      filtered_tasks AS (
        SELECT * FROM all_tasks
        WHERE 1=1
          ${teamFilterSql}
          AND id NOT IN (SELECT task_id FROM tasks_with_subtasks)
      ),
      filtered_subtasks AS (
        SELECT * FROM all_subtasks
        WHERE 1=1
          ${teamFilterSql}
      ),
      combined AS (
        SELECT project_id, status, reopen_status, active_status FROM filtered_subtasks
        UNION ALL
        SELECT project_id, status, reopen_status, active_status FROM filtered_tasks
      )
      SELECT
        fc.project_id,
        p.name as project_name,
        COUNT(*) AS total,
        SUM(CASE 
              WHEN fc.status = 0 AND fc.reopen_status = 0 AND fc.active_status = 0 THEN 1
              WHEN fc.status = 1 AND fc.reopen_status = 0 AND fc.active_status = 0 THEN 1
              WHEN fc.reopen_status = 1 AND fc.active_status = 0 THEN 1
              ELSE 0
            END) AS pending_count,
        SUM(CASE 
              WHEN fc.status = 1 AND fc.active_status = 1 THEN 1
              WHEN fc.status = 2 AND fc.reopen_status = 0 THEN 1
              ELSE 0
            END) AS inprogress_count,
        SUM(CASE 
              WHEN fc.status = 3 THEN 1
              ELSE 0
            END) AS completed_count
      FROM combined fc
      JOIN projects p ON p.id = fc.project_id
      GROUP BY fc.project_id, p.name
      ORDER BY fc.project_id
    `;

    const completedTasksParams = [
      product_id,
      ...projectFilterParams,
      product_id,
      ...projectFilterParams,
      ...teamFilterParams,
      ...teamFilterParams,
    ];

    const [resultsFromYourQuery] = await db.execute(
      completedTasksSql,
      completedTasksParams
    );

    // Step 1: Map raw rows with counts and percents included
    const completedTasksRows = resultsFromYourQuery.map((row) => {
      const total = parseInt(row.total, 10);
      const pending_count = parseInt(row.pending_count, 10);
      const inprogress_count = parseInt(row.inprogress_count, 10);
      const completed_count = parseInt(row.completed_count, 10);

      return {
        project_id: row.project_id,
        project_name: row.project_name,
        total,
        pending_count,
        inprogress_count,
        completed_count,
        pending_percent:
          total > 0
            ? parseFloat(((pending_count / total) * 100).toFixed(2))
            : 0,
        inprogress_percent:
          total > 0
            ? parseFloat(((inprogress_count / total) * 100).toFixed(2))
            : 0,
        completed_percent:
          total > 0
            ? parseFloat(((completed_count / total) * 100).toFixed(2))
            : 0,
      };
    });

    const MAX_VISIBLE_PROJECTS = 4;
    const visibleProjects = completedTasksRows.slice(0, MAX_VISIBLE_PROJECTS);
    const othersProjects = completedTasksRows.slice(MAX_VISIBLE_PROJECTS);

    // Aggregate for "Others" summary
    const othersTotal = othersProjects.reduce((sum, p) => sum + p.total, 0);
    const othersPendingCount = othersProjects.reduce(
      (sum, p) => sum + p.pending_count,
      0
    );
    const othersInprogressCount = othersProjects.reduce(
      (sum, p) => sum + p.inprogress_count,
      0
    );
    const othersCompletedCount = othersProjects.reduce(
      (sum, p) => sum + p.completed_count,
      0
    );

    const othersSummary = {
      project_id: 0,
      project_name: "Others",
      pending_percent:
        othersTotal > 0
          ? parseFloat(((othersPendingCount / othersTotal) * 100).toFixed(2))
          : 0,
      inprogress_percent:
        othersTotal > 0
          ? parseFloat(((othersInprogressCount / othersTotal) * 100).toFixed(2))
          : 0,
      completed_percent:
        othersTotal > 0
          ? parseFloat(((othersCompletedCount / othersTotal) * 100).toFixed(2))
          : 0,
    };

    // Final object
    const totalSum = completedTasksRows.reduce(
      (acc, p) => {
        acc.total += p.total;
        acc.pending_count += p.pending_count;
        acc.inprogress_count += p.inprogress_count;
        acc.completed_count += p.completed_count;
        return acc;
      },
      { total: 0, pending_count: 0, inprogress_count: 0, completed_count: 0 }
    );

    const total_completed_percent =
      totalSum.total > 0
        ? parseFloat(
          ((totalSum.completed_count / totalSum.total) * 100).toFixed(2)
        )
        : 0;

    const completed_tasks = {
      projects:
        othersProjects.length > 0
          ? [
            ...visibleProjects.map(
              ({
                project_id,
                project_name,
                pending_percent,
                inprogress_percent,
                completed_percent,
              }) => ({
                project_id,
                project_name,
                pending_percent,
                inprogress_percent,
                completed_percent,
              })
            ),
            othersSummary,
          ]
          : visibleProjects.map(
            ({
              project_id,
              project_name,
              pending_percent,
              inprogress_percent,
              completed_percent,
            }) => ({
              project_id,
              project_name,
              pending_percent,
              inprogress_percent,
              completed_percent,
            })
          ),
      others_list:
        othersProjects.length > 0
          ? othersProjects.map(
            ({
              project_id,
              project_name,
              pending_percent,
              inprogress_percent,
              completed_percent,
            }) => ({
              project_id,
              project_name,
              pending_percent,
              inprogress_percent,
              completed_percent,
            })
          )
          : [],
      total_completed_percent,
    };
    let teamUtilizationSql = "";
    let teamUtilizationParams = [];
    const productId = parseInt(product_id);
    const projectId = project_id ? parseInt(project_id) : null;

    if (is_team_project_data) {
      const teamConditions = teamIds.map(() => `FIND_IN_SET(?, u.team_id)`).join(" OR ");

    teamUtilizationSql = `
  WITH
  user_estimates AS (
    SELECT u.id AS user_id,
      SUM(CASE
        WHEN EXISTS (
          SELECT 1 FROM sub_tasks s WHERE s.task_id = t.id AND s.deleted_at IS NULL
        )
        THEN (
          SELECT SUM(TIME_TO_SEC(s2.estimated_hours))
          FROM sub_tasks s2
          WHERE s2.task_id = t.id AND s2.deleted_at IS NULL
        )
        ELSE TIME_TO_SEC(t.estimated_hours)
      END) AS total_est_seconds
    FROM tasks t
    JOIN users u ON u.id = t.user_id
    WHERE t.deleted_at IS NULL
      AND t.product_id = ?
      AND (? IS NULL OR t.project_id = ?)
      AND (${teamConditions})
      AND u.role_id IN (
        SELECT rp.role_id
        FROM role_has_permissions rp
        JOIN permissions p ON p.id = rp.permission_id
        WHERE p.name = 'dashboard.user_project_graph'
      )
    GROUP BY u.id
  ),
  worked_by_user AS (
    SELECT u.id AS user_id,
      SUM(TIMESTAMPDIFF(SECOND, st.start_time, IFNULL(st.end_time, CURRENT_TIMESTAMP))) AS total_work_seconds
    FROM sub_tasks_user_timeline st
    JOIN users u ON u.id = st.user_id
    WHERE st.deleted_at IS NULL
      AND st.product_id = ?
      AND (? IS NULL OR st.project_id = ?)
      AND (${teamConditions})
      AND u.role_id IN (
        SELECT rp.role_id
        FROM role_has_permissions rp
        JOIN permissions p ON p.id = rp.permission_id
        WHERE p.name = 'dashboard.user_project_graph'
      )
    GROUP BY u.id
  )
  SELECT u.first_name AS name,
    ROUND(COALESCE(ue.total_est_seconds, 0) / 3600, 2) AS total_estimated_hours,
    ROUND(COALESCE(wu.total_work_seconds, 0) / 3600, 2) AS total_worked_hours
  FROM users u
  LEFT JOIN user_estimates ue ON ue.user_id = u.id
  LEFT JOIN worked_by_user wu ON wu.user_id = u.id
  WHERE (${teamConditions})
    AND u.role_id IN (
      SELECT rp.role_id
      FROM role_has_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.name = 'dashboard.user_project_graph'
    )
    AND u.deleted_at IS NULL
    ${associateFilter || ""}
    AND (COALESCE(ue.total_est_seconds, 0) > 0 OR COALESCE(wu.total_work_seconds, 0) > 0)
  ORDER BY total_worked_hours DESC, total_estimated_hours DESC;
`;


      teamUtilizationParams = [
        productId,
        projectId,
        projectId,
        ...teamIds,
        productId,
        projectId,
        projectId,
        ...teamIds,
        ...teamIds,
      ];
    } else if (is_all_project_data) {
      // Admin or PM - single optional team_id filter
      if (team_id) {
        // team_id filter present
        teamUtilizationSql = `
        WITH
user_estimates AS (
  SELECT u.id AS user_id,
    SUM(CASE
      WHEN EXISTS (
        SELECT 1 FROM sub_tasks s WHERE s.task_id = t.id AND s.deleted_at IS NULL
      )
      THEN (
        SELECT SUM(TIME_TO_SEC(s2.estimated_hours))
        FROM sub_tasks s2
        WHERE s2.task_id = t.id AND s2.deleted_at IS NULL
      )
      ELSE TIME_TO_SEC(t.estimated_hours)
    END) AS total_est_seconds
  FROM tasks t
  JOIN users u ON u.id = t.user_id
  WHERE t.deleted_at IS NULL
    AND t.product_id = ?
    AND (? IS NULL OR t.project_id = ?)
    AND (${teamConditions})
    AND u.role_id IN (
      SELECT role_id
      FROM role_has_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
      WHERE p.name = 'dashboard.user_project_graph'
    )
  GROUP BY u.id
),
worked_by_user AS (
  SELECT u.id AS user_id,
    SUM(TIMESTAMPDIFF(SECOND, st.start_time, IFNULL(st.end_time, CURRENT_TIMESTAMP))) AS total_work_seconds
  FROM sub_tasks_user_timeline st
  JOIN users u ON u.id = st.user_id
  WHERE st.deleted_at IS NULL
    AND st.product_id = ?
    AND (? IS NULL OR st.project_id = ?)
    AND (${teamConditions})
    AND u.role_id IN (
      SELECT role_id
      FROM role_has_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
      WHERE p.name = 'dashboard.user_project_graph'
    )
  GROUP BY u.id
)
SELECT u.first_name AS name,
  ROUND(COALESCE(ue.total_est_seconds, 0) / 3600, 2) AS total_estimated_hours,
  ROUND(COALESCE(wu.total_work_seconds, 0) / 3600, 2) AS total_worked_hours
FROM users u
LEFT JOIN user_estimates ue ON ue.user_id = u.id
LEFT JOIN worked_by_user wu ON wu.user_id = u.id
WHERE (${teamConditions})
  AND u.role_id IN (
    SELECT role_id
    FROM role_has_permissions rp
    JOIN permissions p ON rp.permission_id = p.id
    WHERE p.name = 'dashboard.user_project_graph'
  )
  AND u.deleted_at IS NULL
  ${associateFilter || ""}
  AND (COALESCE(ue.total_est_seconds, 0) > 0 OR COALESCE(wu.total_work_seconds, 0) > 0)
ORDER BY total_worked_hours DESC, total_estimated_hours DESC;
        `;

        const teamIdInt = parseInt(team_id);

        teamUtilizationParams = [
          productId,
          projectId,
          projectId,
          teamIdInt,
          productId,
          projectId,
          projectId,
          teamIdInt,
          teamIdInt,
        ];
      } else {
        // No team_id filter for admin/pm, aggregate by team
        teamUtilizationSql = `
  WITH
  user_estimates AS (
    SELECT
      u.team_id,
      SUM(
        CASE
          WHEN EXISTS (
            SELECT 1 FROM sub_tasks s WHERE s.task_id = t.id AND s.deleted_at IS NULL
          )
          THEN (
            SELECT SUM(TIME_TO_SEC(s2.estimated_hours))
            FROM sub_tasks s2
            WHERE s2.task_id = t.id AND s2.deleted_at IS NULL
          )
          ELSE TIME_TO_SEC(t.estimated_hours)
        END
      ) AS total_est_seconds
    FROM tasks t
    JOIN users u ON u.id = t.user_id
    WHERE
      t.deleted_at IS NULL
      AND t.product_id = ?
      AND (? IS NULL OR t.project_id = ?)
      AND u.role_id IN (
        SELECT rp.role_id
        FROM role_has_permissions rp
        JOIN permissions p ON p.id = rp.permission_id
        WHERE p.name = 'dashboard.user_project_graph'
      )
    GROUP BY u.team_id
  ),
  worked_by_team AS (
    SELECT
      u.team_id,
      SUM(
        TIMESTAMPDIFF(
          SECOND,
          st.start_time,
          IFNULL(st.end_time, CURRENT_TIMESTAMP)
        )
      ) AS total_work_seconds
    FROM sub_tasks_user_timeline st
    JOIN users u ON u.id = st.user_id
    WHERE
      st.deleted_at IS NULL
      AND st.product_id = ?
      AND (? IS NULL OR st.project_id = ?)
      AND u.role_id IN (
        SELECT rp.role_id
        FROM role_has_permissions rp
        JOIN permissions p ON p.id = rp.permission_id
        WHERE p.name = 'dashboard.user_project_graph'
      )
    GROUP BY u.team_id
  )
  SELECT
    t.name AS team_name,
    t.short_name AS team_short_name,
    ROUND(COALESCE(ue.total_est_seconds, 0) / 3600, 2) AS total_estimated_hours,
    ROUND(COALESCE(wt.total_work_seconds, 0) / 3600, 2) AS total_worked_hours
  FROM teams t
  LEFT JOIN user_estimates ue ON ue.team_id = t.id
  LEFT JOIN worked_by_team wt ON wt.team_id = t.id
  WHERE t.deleted_at IS NULL
  HAVING total_estimated_hours > 0 OR total_worked_hours > 0
  ORDER BY total_worked_hours DESC, total_estimated_hours DESC;
`;


        teamUtilizationParams = [
          productId,
          projectId,
          projectId,
          productId,
          projectId,
          projectId,
        ];
      }
    } else if (is_user_project_data) {
      teamUtilizationSql = `
  WITH
  user_estimates AS (
    SELECT u.id AS user_id,
      SUM(CASE
        WHEN EXISTS (
          SELECT 1 FROM sub_tasks s WHERE s.task_id = t.id AND s.deleted_at IS NULL
        )
        THEN (
          SELECT SUM(TIME_TO_SEC(s2.estimated_hours))
          FROM sub_tasks s2
          WHERE s2.task_id = t.id AND s2.deleted_at IS NULL
        )
        ELSE TIME_TO_SEC(t.estimated_hours)
      END) AS total_est_seconds
    FROM tasks t
    JOIN users u ON u.id = t.user_id
    WHERE t.deleted_at IS NULL
      AND t.product_id = ?
      AND (? IS NULL OR t.project_id = ?)
      AND u.id = ?
    GROUP BY u.id
  ),
  worked_by_user AS (
    SELECT u.id AS user_id,
      pr.name AS project_name,
      SUM(TIMESTAMPDIFF(SECOND, st.start_time, IFNULL(st.end_time, CURRENT_TIMESTAMP))) AS total_work_seconds
    FROM sub_tasks_user_timeline st
    JOIN users u ON u.id = st.user_id
    JOIN projects pr ON pr.id = st.project_id
    WHERE st.deleted_at IS NULL
      AND st.product_id = ?
      AND (? IS NULL OR st.project_id = ?)
      AND u.id = ?
    GROUP BY u.id
  )
  SELECT u.first_name AS name,
    wu.project_name,
    ROUND(COALESCE(ue.total_est_seconds, 0) / 3600, 2) AS total_estimated_hours,
    ROUND(COALESCE(wu.total_work_seconds, 0) / 3600, 2) AS total_worked_hours
  FROM users u
  LEFT JOIN user_estimates ue ON ue.user_id = u.id
  LEFT JOIN worked_by_user wu ON wu.user_id = u.id
  WHERE u.id = ?
    AND u.role_id IN (
      SELECT rp.role_id
      FROM role_has_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE p.name = 'dashboard.user_project_graph'
    )
    AND u.deleted_at IS NULL
`;

      teamUtilizationParams = [
        productId,
        projectId,
        projectId,
        user_id,
        productId,
        projectId,
        projectId,
        user_id,
        user_id,
      ];
    }

    const [utilizationResults] = await db.execute(
      teamUtilizationSql,
      teamUtilizationParams
    );

    return successResponse(res, {
      completed_tasks: completed_tasks,
      team_utilization: utilizationResults,
    });
  } catch (err) {
    console.error(err);
    return errorResponse(res, err.message, "Something went wrong", 500);
  }
};
