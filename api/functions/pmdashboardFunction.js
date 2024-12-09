const db = require("../../config/db");
const { successResponse, errorResponse } = require("../../helpers/responseHelper");

exports.fetchProducts = async (payload, res) => {
  try {
    // Step 1: Get products
    const productsQuery = "SELECT * FROM products";
    const [products] = await db.query(productsQuery);

    const result = await Promise.all(
      products.map(async (product) => {
        const tasksQuery = "SELECT * FROM tasks WHERE product_id = ?";
        const [tasks] = await db.query(tasksQuery, [product.id]);

        let totalItems = 0;
        let completedItems = 0;
        let workingEmployees = new Set(); 

        for (const task of tasks) {
          const subtasksQuery = "SELECT * FROM sub_tasks WHERE task_id = ?";
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
          const employeeDetailsQuery = "SELECT * FROM users WHERE id IN (?)";
          const [employees] = await db
            
            .query(employeeDetailsQuery, [Array.from(workingEmployees)]);

          employeeList = employees.map((user) => {
            const words = user.name ? user.name.split(" ") : [];
            const initials =
              words.length > 1
                ? words.map((word) => word[0].toUpperCase()).join("")
                : (words[0] || "").slice(0, 2).toUpperCase();

            return {
              employee_name: user.name || "N/A",
              employee_id: user.employee_id || "N/A",
              initials: initials,
            };
          });
        }

        return {
          product_id: product.id,
          product_name: product.name,
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
exports.fetchUtilization = async (payload, res) => {
  try {
    // Step 1: Get total strength grouped by team, including team name
    const totalStrengthQuery = `
      SELECT 
        t.id AS team_id, 
        t.name AS team_name, 
        COUNT(u.id) AS total_strength 
      FROM teams t
      LEFT JOIN users u ON t.id = u.team_id
      GROUP BY t.id
    `;
    const [totalStrengthData] = await db.query(totalStrengthQuery);

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
        u.name AS employee_name,
        u.employee_id AS employee_id,
        u.team_id AS team_id,
        t.name AS team_name
      FROM sub_tasks_user_timeline stut
      JOIN users u ON stut.user_id = u.id
      JOIN teams t ON u.team_id = t.id
      WHERE DATE(stut.start_time) = CURDATE()
    `;
    const [workingEmployeesData] = await db.query(workingEmployeesQuery);

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
    return errorResponse(res, error.message, "Error fetching utilization data", 500);
  }
};
exports.fetchAttendance = async (payload, res) => {
  try {
    // Step 1: Get total strength of all users
    const totalStrengthQuery = `SELECT COUNT(*) AS total_strength FROM users`;
    const [[{ total_strength: totalStrength }]] = await db.query(totalStrengthQuery);

    // Step 2: Calculate total absent employees
    const currentTime = new Date();
    const cutoffTime = new Date();
    cutoffTime.setHours(13, 0, 0); // 1:00 PM cutoff

    const totalAbsentQuery = `
      SELECT COUNT(*) AS total_absent 
      FROM employee_leave 
      WHERE DATE(date) = CURDATE() 
        AND (
          day_type = 1 OR 
          (day_type = 2 AND half_type = 1 AND ? < ?) OR 
          (day_type = 2 AND half_type = 2 AND ? >= ?)
        )
    `;
    const [[{ total_absent: totalAbsentEmployees }]] = await db.query(totalAbsentQuery, [
      currentTime,
      cutoffTime,
      currentTime,
      cutoffTime,
    ]);

    const totalPresentEmployees = totalStrength - totalAbsentEmployees;

    const totalPresentPercentage = totalStrength > 0
      ? Math.round((totalPresentEmployees / totalStrength) * 100)
      : 0;
    const totalAbsentPercentage = totalStrength > 0
      ? Math.round((totalAbsentEmployees / totalStrength) * 100)
      : 0;

    // Step 3: Get team-wise attendance details
    const teamWiseAttendanceQuery = `
      SELECT 
        t.id AS team_id,
        t.name AS team_name,
        u.id AS employee_id,
        u.name AS employee_name,
        el.day_type,
        el.half_type 
      FROM teams t
      LEFT JOIN users u ON t.id = u.team_id
      LEFT JOIN employee_leave el ON u.id = el.user_id AND DATE(el.date) = CURDATE()
    `;
    const [teamWiseAttendanceData] = await db.query(teamWiseAttendanceQuery);

    const teamWiseAttendance = teamWiseAttendanceData.reduce((acc, row) => {
      const { team_id, team_name, employee_id, employee_name, day_type, half_type } = row;

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
    return errorResponse(res, error.message, "Error fetching attendance data", 500);
  }
};
exports.fetchPmdatas = async (payload, res) => {
  try {
    // Step 1: Fetch products data
    const productsQuery = "SELECT * FROM products";
    const [products] = await db.query(productsQuery);

    const productData = await Promise.all(
      products.map(async (product) => {
        const tasksQuery = "SELECT * FROM tasks WHERE product_id = ?";
        const [tasks] = await db.query(tasksQuery, [product.id]);

        let totalItems = 0;
        let completedItems = 0;
        let workingEmployees = new Set();

        for (const task of tasks) {
          const subtasksQuery = "SELECT * FROM sub_tasks WHERE task_id = ?";
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
          const employeeDetailsQuery = "SELECT * FROM users WHERE id IN (?)";
          const [employees] = await db
            
            .query(employeeDetailsQuery, [Array.from(workingEmployees)]);

          employeeList = employees.map((user) => {
            const words = user.name ? user.name.split(" ") : [];
            const initials =
              words.length > 1
                ? words.map((word) => word[0].toUpperCase()).join("")
                : (words[0] || "").slice(0, 2).toUpperCase();

            return {
              employee_name: user.name || "N/A",
              employee_id: user.employee_id || "N/A",
              initials: initials,
            };
          });
        }

        return {
          product_id: product.id,
          product_name: product.name,
          completed_percentage: completionPercentage,
          employee_count: workingEmployees.size,
          employees: employeeList,
        };
      })
    );

    // Step 2: Fetch utilization data
    const totalStrengthQuery = `
      SELECT 
        t.id AS team_id, 
        t.name AS team_name, 
        COUNT(u.id) AS total_strength 
      FROM teams t
      LEFT JOIN users u ON t.id = u.team_id
      GROUP BY t.id
    `;
    const [totalStrengthData] = await db.query(totalStrengthQuery);

    const totalStrength = totalStrengthData.reduce((acc, row) => {
      acc[row.team_id] = {
        team_id: row.team_id,
        team_name: row.team_name || "Unknown Team",
        total_strength: row.total_strength,
      };
      return acc;
    }, {});

    const workingEmployeesQuery = `
      SELECT 
        u.id AS user_id,
        u.name AS employee_name,
        u.employee_id AS employee_id,
        u.team_id AS team_id,
        t.name AS team_name
      FROM sub_tasks_user_timeline stut
      JOIN users u ON stut.user_id = u.id
      JOIN teams t ON u.team_id = t.id
      WHERE DATE(stut.start_time) = CURDATE()
    `;
    const [workingEmployeesData] = await db.query(workingEmployeesQuery);

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

    const utilization = Object.keys(totalStrength).map((teamId) => {
      const team = totalStrength[teamId];
      const working = workingEmployees[teamId] || {
        team_name: team.team_name,
        working_count: 0,
        working_employees: [],
      };

      return {
        team_name: team.team_name,
        total_strength: team.total_strength,
        working_count: working.working_count,
        working_employees: working.working_employees,
      };
    });

    // Step 3: Fetch attendance data
    const totalStrengthQueryAttendance = `SELECT COUNT(*) AS total_strength FROM users`;
    const [[{ total_strength: totalStrengthAttendance }]] = await db.query(totalStrengthQueryAttendance);

    const currentTime = new Date();
    const cutoffTime = new Date();
    cutoffTime.setHours(13, 0, 0);

    const totalAbsentQuery = `
      SELECT COUNT(*) AS total_absent 
      FROM employee_leave 
      WHERE DATE(date) = CURDATE() 
        AND (
          day_type = 1 OR 
          (day_type = 2 AND half_type = 1 AND ? < ?) OR 
          (day_type = 2 AND half_type = 2 AND ? >= ?)
        )
    `;
    const [[{ total_absent: totalAbsentEmployees }]] = await db.query(totalAbsentQuery, [
      currentTime,
      cutoffTime,
      currentTime,
      cutoffTime,
    ]);

    const totalPresentEmployees = totalStrengthAttendance - totalAbsentEmployees;

    const totalPresentPercentage = totalStrengthAttendance > 0
      ? Math.round((totalPresentEmployees / totalStrengthAttendance) * 100)
      : 0;
    const totalAbsentPercentage = totalStrengthAttendance > 0
      ? Math.round((totalAbsentEmployees / totalStrengthAttendance) * 100)
      : 0;

    const teamWiseAttendanceQuery = `
      SELECT 
        t.id AS team_id,
        t.name AS team_name,
        u.id AS employee_id,
        u.name AS employee_name,
        el.day_type,
        el.half_type 
      FROM teams t
      LEFT JOIN users u ON t.id = u.team_id
      LEFT JOIN employee_leave el ON u.id = el.user_id AND DATE(el.date) = CURDATE()
    `;
    const [teamWiseAttendanceData] = await db.query(teamWiseAttendanceQuery);

    const teamWiseAttendance = teamWiseAttendanceData.reduce((acc, row) => {
      const { team_id, team_name, employee_id, employee_name, day_type, half_type } = row;

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
    return successResponse(
      res,
      result,
      "PM data retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Error fetching PM data:", error);
    return errorResponse(res, error.message, "Error fetching PM data", 500);
  }
};



