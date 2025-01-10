const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
} = require("../../helpers/responseHelper");

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
            totalItems += subtasks.length;
            completedItems += subtasks.filter(
              (subtask) => subtask.status === 3
            ).length;

            for (const subtask of subtasks) {
              if (subtask.user_id) {
                // Check if the user_id exists in the users table and is not deleted
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
            totalItems += 1;
            if (task.status === 3) completedItems += 1;

            if (task.user_id) {
              // Check if the user_id exists in the users table and is not deleted
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
          total_tasks: tasks.length,
          completed_percentage: completionPercentage,
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
        SELECT DISTINCT user_id FROM sub_tasks_user_timeline
        WHERE DATE(start_time) = CURDATE()
      ) stut
      JOIN users u ON stut.user_id = u.id
      JOIN teams t ON u.team_id = t.id
      WHERE u.deleted_at IS NULL 
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
    const totalStrengthQuery = `SELECT COUNT(*) AS total_strength FROM users WHERE deleted_at IS NULL`;
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
      LEFT JOIN employee_leave el ON u.id = el.user_id AND DATE(el.date) = CURDATE() AND t.deleted_at IS NULL AND u.deleted_at IS NULL AND el.deleted_at IS NULL
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

      const isAbsent =
        day_type === 1 ||
        (day_type === 2 && half_type === 1 && currentTime < cutoffTime) ||
        (day_type === 2 && half_type === 2 && currentTime >= cutoffTime);

      if (isAbsent) {
        acc[team_id].team_absent_count++;
        acc[team_id].absent_employees.push({
          user_id,
          employee_id,
          employee_name,
        });
      } else {
        acc[team_id].team_present_count++;
        acc[team_id].present_employees.push({
          user_id,
          employee_id,
          employee_name,
        });
      }

      acc[team_id].total_team_count++;
      return acc;
    }, {});

    const teamWiseAttendanceArray = Object.values(teamWiseAttendance);

    // Step 4: Combine attendance results
    const result = {
      total_strength: totalStrength,
      total_present_employees: totalPresentEmployees,
      total_absent_employees: totalAbsentEmployees,
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

    if (!product_id) {
      return errorResponse(res, null, "Product ID is required", 400);
    }

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

    let tasksQuery = `
      SELECT 
        t.id AS task_id,
        t.name AS task_name,
        t.status AS task_status,
        t.active_status AS task_active_status,
        t.created_at AS task_date,
        t.priority AS task_priority,
        t.estimated_hours AS task_estimation_hours,
        t.description AS task_description,
        s.id AS subtask_id,
        s.name AS subtask_name,
        s.status AS subtask_status,
        s.active_status AS subtask_active_status,
        s.reopen_status AS subtask_reopen_status,
        s.estimated_hours AS subtask_estimation_hours,
        s.description AS subtask_description,
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

    if (project_id) {
      tasksQuery += ` AND t.project_id = ${db.escape(project_id)}`;
    }

    if (team_id) {
      tasksQuery += ` AND t.team_id = ${db.escape(team_id)}`;
    }

    if (date) {
      tasksQuery += ` AND DATE(t.created_at) = ${db.escape(date)}`;
    }

    if (search) {
      tasksQuery += `
        AND (
          COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) LIKE ${db.escape(
            "%" + search + "%"
          )} OR
          p.name LIKE ${db.escape("%" + search + "%")} OR
          te.name LIKE ${db.escape("%" + search + "%")} OR
          t.name LIKE ${db.escape("%" + search + "%")}
        )
      `;
    }

    const [taskRows] = await db.query(tasksQuery, [product_id]);

    const groupedTasks = {
      Pending: [],
      "In Progress": [],
      "In Review": [],
      "On Hold": [],
      Done: [],
      "Re Open": [],
    };

    taskRows.forEach((row) => {
      const taskKey = row.task_id; // Unique identifier for tasks
      const task = {
        id: row.task_id,
        name: row.task_name,
        status: row.task_status,
        active_status: row.task_active_status,
        priority: row.task_priority,
        date: row.task_date,
        estimation_hours: row.task_estimation_hours,
        description: row.task_description,
        team_name: row.team_name,
        employee_name: row.employee_name,
        project_name: row.project_name,
      };
    
      const subtask = row.subtask_id
        ? {
            id: row.subtask_id,
            name: row.subtask_name,
            status: row.subtask_status,
            active_status: row.subtask_active_status,
            reopen_status: row.subtask_reopen_status,
            estimated_hours: row.subtask_estimation_hours,
            description: row.subtask_description,
          }
        : null;
    
      const statusCategory = Object.keys(groupedTasks).find(
        (status) =>
          (task.status === 0 && status === "Pending") ||
          (task.status === 1 && status === "In Progress") ||
          (task.status === 2 && status === "In Review") ||
          (task.status === 3 && status === "Done")
      );
    
      if (statusCategory) {
        let existingTask = groupedTasks[statusCategory].find(
          (t) => t.TaskId === taskKey
        );
    
        if (!existingTask) {
          existingTask = {
            TaskId: task.id,
            TaskName: task.name,
            Team: task.team_name,
            EmployeeName: task.employee_name,
            Priority: task.priority,
            ProjectName: task.project_name,
            Description: task.description,
            Subtasks: [],
          };
          groupedTasks[statusCategory].push(existingTask);
        }
    
        if (subtask) {
          existingTask.Subtasks.push({
            SubtaskId: subtask.id,
            SubtaskName: subtask.name,
            SubtaskStatus: subtask.status,
          });
        }
      }
    });
    
    const result = {
      PendingTasks: groupedTasks["Pending"],
      InProgressTasks: groupedTasks["In Progress"],
      InReviewTasks: groupedTasks["In Review"],
      OnHoldTasks: groupedTasks["On Hold"],
      DoneTasks: groupedTasks["Done"],
      ReOpenTasks: groupedTasks["Re Open"],
    };

    return successResponse(
      res,
      result,
      "Product details retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Error fetching product details:", error);
    return errorResponse(
      res,
      error.message,
      "Error fetching product details",
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
