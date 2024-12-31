const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
} = require("../../helpers/responseHelper");

exports.fetchAttendance = async (req, res) => {
  try {
    const currentTime = new Date();
    const cutoffTime = new Date();
    cutoffTime.setHours(13, 30, 0, 0); // 1:30 PM cutoff
    const today = new Date().toISOString().split("T")[0];
    const { user_id } = req.query;

    if (!user_id) {
      return errorResponse(res, null, "User ID is required", 400);
    }

    // Check if the user exists
    const [userCheck] = await db.query(
      "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
      [user_id]
    );

    if (userCheck.length === 0) {
      return errorResponse(res, null, "User Not Found", 400);
    }

    // Fetch teams for the reporting user
    const [teamResult] = await db.query(
      "SELECT id FROM teams WHERE reporting_user_id = ? AND deleted_at IS NULL",
      [user_id]
    );

    if (teamResult.length === 0) {
      return res
        .status(404)
        .json({ message: "No teams found for the given user_id" });
    }

    const teamIds = teamResult.map((team) => team.id);

    // Get total team strength
    const [totalStrengthResult] = await db.query(
      "SELECT COUNT(*) AS total_strength FROM users WHERE team_id IN (?) AND deleted_at IS NULL",
      [teamIds]
    );
    const totalStrength = totalStrengthResult[0]?.total_strength || 0;

    // Fetch absent employees
    const [absentEmployees] = await db.query(
      `
        SELECT e.user_id AS employee_id, u.employee_id AS employeeId,
               COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS full_name
        FROM employee_leave e
        JOIN users u ON e.user_id = u.id
        WHERE DATE(e.date) = ?
          AND (
            e.day_type = 1
            OR (e.day_type = 2 AND e.half_type = 1 AND ? < ?)
          )
          AND u.team_id IN (?)
          AND u.deleted_at IS NULL
          AND e.deleted_at IS NULL
      `,
      [today, currentTime, cutoffTime, teamIds]
    );

    const absentEmployeeIds = absentEmployees.map((emp) => emp.employee_id);
    const absentEmployeeIdsCondition =
      absentEmployeeIds.length > 0 ? `AND id NOT IN (?)` : "";

    // Fetch present employees
    const [presentEmployees] = await db.query(
      `
        SELECT id AS user_id,employee_id AS employeeId, 
               COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS full_name
        FROM users
        WHERE team_id IN (?) 
          AND deleted_at IS NULL
          ${absentEmployeeIdsCondition}
      `,
      absentEmployeeIds.length > 0 ? [teamIds, absentEmployeeIds] : [teamIds]
    );

    // Combine attendance data
    const attendanceList = [
      ...absentEmployees.map((emp) => ({
        employee_id: emp.employeeId,
        user_id: emp.employee_id,
        full_name: emp.full_name,
        status: "Absent",
      })),
      ...presentEmployees.map((emp) => ({
        employee_id: emp.employeeId,
        user_id: emp.user_id,
        full_name: emp.full_name,
        status: "Present",
      })),
    ];

    // Add initials to attendance data
    const attendanceWithInitials = attendanceList.map((employee) => {
      const nameParts = employee.full_name
        ? employee.full_name.split(" ").filter((part) => part.trim() !== "")
        : [];

      let initials = "";

      if (nameParts.length > 1) {
        initials =
          (nameParts[0][0]?.toUpperCase() || "") +
          (nameParts[1][0]?.toUpperCase() || "");
      } else if (nameParts.length === 1) {
        initials = nameParts[0].slice(0, 2).toUpperCase();
      } else {
        initials = "NA";
      }

      return {
        ...employee,
        initials,
      };
    });

    // Calculate attendance percentages
    const totalAbsentEmployees = absentEmployees.length;
    const totalPresentEmployees = presentEmployees.length;
    const presentPercentage = totalStrength
      ? Math.round((totalPresentEmployees / totalStrength) * 100)
      : 0;
    const absentPercentage = totalStrength
      ? Math.round((totalAbsentEmployees / totalStrength) * 100)
      : 0;

    // Return the response
    return res.status(200).json({
      message: "Attendance data fetched successfully",
      data: {
        total_strength: totalStrength,
        total_present_employees: totalPresentEmployees,
        total_absent_employees: totalAbsentEmployees,
        present_percentage: presentPercentage,
        absent_percentage: absentPercentage,
        attendance_list: attendanceWithInitials,
      },
    });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    return res.status(500).json({
      message: "Error fetching attendance",
      error: error.message,
    });
  }
};

exports.fetchTlrating = async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return errorResponse(res, null, "User ID is required", 400);
    }
    const [rows] = await db.query(
      "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
      [user_id]
    );

    // Check if no rows are returned
    if (rows.length === 0) {
      return errorResponse(res, null, "User Not Found", 400);
    }

    // Fetch team IDs
    const [teamResult] = await db.query(
      "SELECT id FROM teams WHERE reporting_user_id = ? AND deleted_at IS NULL",
      [user_id]
    );

    if (teamResult.length === 0) {
      return res
        .status(404)
        .json({ message: "No teams found for the given user_id" });
    }

    const teamIds = teamResult.map((team) => team.id);

    // Fetch team members with concatenated full name
    const [teamMembers] = await db.query(
      `SELECT id, COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS full_name 
       FROM users WHERE team_id IN (?) AND deleted_at IS NULL`,
      [teamIds]
    );

    // Fetch ratings for the current month
    const currentMonth = new Date().toISOString().slice(0, 7); // Format YYYY-MM
    const [ratingsResult] = await db.query(
      "SELECT user_id, rating, average FROM ratings WHERE user_id IN (?) AND month = ?",
      [teamMembers.map((member) => member.id), currentMonth]
    );

    // Create a map for easy access to ratings
    const ratingsMap = new Map();
    ratingsResult.forEach((rating) => {
      ratingsMap.set(rating.user_id, rating);
    });

    // Process team members
    const finalRatingResult = teamMembers.map((member) => {
      const nameParts = member.full_name
        ? member.full_name.split(" ").filter((part) => part.trim() !== "") // Filter out empty parts
        : []; // Safely handle missing or invalid full_name

      let initials = "";

      if (nameParts.length > 1) {
        // Use first letters of the two name parts
        initials =
          (nameParts[0][0]?.toUpperCase() || "") +
          (nameParts[1][0]?.toUpperCase() || "");
      } else if (nameParts.length === 1) {
        // Use the first two letters of the single part
        initials = nameParts[0].slice(0, 2).toUpperCase();
      } else {
        // Fallback for empty or missing names
        initials = "NA";
      }

      const ratingRecord = ratingsMap.get(member.id) || {
        rating: 0,
        average: 0,
      };

      return {
        employee_name: member.full_name || "N/A",
        employee_id: member.id || "N/A",
        initials,
        rating_value: ratingRecord.rating,
        average_value: ratingRecord.average,
      };
    });

    // If no team members are found, add a placeholder entry
    if (finalRatingResult.length === 0) {
      finalRatingResult.push({
        employee_name: "N/A",
        employee_id: 0,
        initials: "NA",
        rating_value: 0,
        average_value: 0,
      });
    }

    return res.status(200).json({
      message: "Team ratings fetched successfully",
      tl_ratings: finalRatingResult,
    });
  } catch (error) {
    console.error("Error fetching Team ratings:", error);
    return res.status(500).json({
      message: "Error fetching Team ratings",
      error: error.message,
    });
  }
};

exports.fetchTLproducts = async (req, res) => {
  try {
    const { user_id, product_id } = req.query;

    if (!user_id) {
      return errorResponse(res, null, "User ID is required", 400);
    }
    const [rows] = await db.query(
      "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
      [user_id]
    );

    // Check if no rows are returned
    if (rows.length === 0) {
      return errorResponse(res, null, "User Not Found", 400);
    }

    // Fetch team IDs
    const [teamResult] = await db.query(
      "SELECT id FROM teams WHERE reporting_user_id = ? AND deleted_at IS NULL",
      [user_id]
    );
    if (teamResult.length === 0) {
      return res
        .status(404)
        .json({ message: "No teams found for the given user_id" });
    }
    const teamIds = teamResult.map((team) => team.id);

    let productIds = [];
    if (product_id) {
      productIds = product_id.split(",").map((id) => parseInt(id.trim(), 10));
    }
    // Fetch products (filtered by product_id if provided)
    const productsQuery = productIds.length
      ? "SELECT * FROM products WHERE id IN (?) AND deleted_at IS NULL"
      : "SELECT * FROM products WHERE deleted_at IS NULL";
    const [products] = await db.query(productsQuery, productIds.length ? [productIds] : []);

    if (products.length === 0) {
      return res.status(404).json({ message: "No products found" });
    }

    const result = await Promise.all(
      products.map(async (product) => {
        // Fetch tasks associated with the product and team
        const tasksQuery = `
                  SELECT * FROM tasks 
                  WHERE product_id = ? AND team_id IN (?) AND deleted_at IS NULL
              `;
        const [tasks] = await db.query(tasksQuery, [product.id, teamIds]);

        let totalItems = 0;
        let completedItems = 0;
        let workingEmployees = new Set();

        for (const task of tasks) {
          // Fetch subtasks associated with the task
          const subtasksQuery = `
            SELECT * FROM sub_tasks 
            WHERE task_id = ? AND team_id IN (?) AND deleted_at IS NULL
          `;
          const [subtasks] = await db.query(subtasksQuery, [task.id, teamIds]);

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

        // Fetch employee details for working employees
        let employeeList = [];
        if (workingEmployees.size > 0) {
          const employeeDetailsQuery = `
                      SELECT id,employee_id, 
                             COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS full_name 
                      FROM users 
                      WHERE id IN (?) AND team_id IN (?) AND deleted_at IS NULL
                  `;
          const [employees] = await db.query(employeeDetailsQuery, [
            Array.from(workingEmployees),
            teamIds,
          ]);

          employeeList = employees.map((user) => {
            const words = user.full_name ? user.full_name.split(" ") : [];
            const initials =
              words.length > 1
                ? words.map((word) => word[0].toUpperCase()).join("")
                : (words[0] || "").slice(0, 2).toUpperCase();

            return {
              employee_name: user.full_name || "N/A",
              employee_id: user.employee_id || "N/A",
              initials: initials,
            };
          });
        }

        return {
          product_id: product.id,
          product_name: product.name,
          task_count: tasks.length,
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

exports.fetchTLresourceallotment = async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return errorResponse(res, null, "User ID is required", 400);
    }
    const [rows] = await db.query(
      "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
      [user_id]
    );

    // Check if no rows are returned
    if (rows.length === 0) {
      return errorResponse(res, null, "User Not Found", 400);
    }

    // Fetch team IDs
    const [teamResult] = await db.query(
      "SELECT id FROM teams WHERE reporting_user_id = ? AND deleted_at IS NULL",
      [user_id]
    );
    if (teamResult.length === 0) {
      return res
        .status(404)
        .json({ message: "No teams found for the given user_id" });
    }
    const teamIds = teamResult.map((team) => team.id);

    // Get the current date and handle employee leave logic
    const today = new Date().toISOString().split("T")[0]; // Current date in YYYY-MM-DD format
    const [absentEmployees] = await db.query(
      `
      SELECT user_id 
      FROM employee_leave 
      WHERE date = ? AND user_id IN (SELECT id FROM users WHERE team_id IN (?) AND deleted_at IS NULL) AND deleted_at IS NULL
    `,
      [today, teamIds]
    );

    const absentEmployeeIds = absentEmployees.map((emp) => emp.user_id);

    // If there are no absent employees, set absentEmployeeIds to a value that does not affect the query
    const absentEmployeeCondition =
      absentEmployeeIds.length > 0 ? `AND id NOT IN (?)` : "";

    // Calculate total users (not absent)
    const [totalUsers] = await db.query(
      `
      SELECT COUNT(*) as total_count 
      FROM users 
      WHERE deleted_at IS NULL AND team_id IN (?) ${absentEmployeeCondition}
    `,
      absentEmployeeIds.length > 0 ? [teamIds, absentEmployeeIds] : [teamIds]
    );

    const totalCount = totalUsers[0].total_count;

    let allocatedCount = 0;
    let employeeDetails = [];

    const allocatedEmployees = new Set();

    // Step 1: Get all tasks with subtasks
    const [tasks] = await db.query(
      `
      SELECT id, user_id
      FROM tasks
      WHERE deleted_at IS NULL AND team_id IN (?) ${absentEmployeeCondition} AND status != 3
    `,
      absentEmployeeIds.length > 0 ? [teamIds, absentEmployeeIds] : [teamIds]
    );

    const taskIds = tasks.map((task) => task.id);

    // Step 2: Get subtasks for the tasks
    const [subtasks] = await db.query(
      `
      SELECT task_id, user_id
      FROM sub_tasks
      WHERE task_id IN (?) AND status != 3 AND deleted_at IS NULL
    `,
      [taskIds]
    );

    const allocatedTaskUsers = new Set();

    // Step 3: Add users from subtasks first
    subtasks.forEach((subtask) => {
      allocatedTaskUsers.add(subtask.user_id);
    });

    // Step 4: If no subtasks, add users from the task itself
    tasks.forEach((task) => {
      if (!allocatedTaskUsers.has(task.user_id)) {
        allocatedTaskUsers.add(task.user_id);
      }
    });

    // Step 5: Get details of allocated users
    if (allocatedTaskUsers.size > 0) {
      const [allocatedEmployeeDetailsData] = await db.query(
        `
        SELECT id, 
               COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS employee_name
        FROM users 
        WHERE id IN (?) AND team_id IN (?) ${absentEmployeeCondition} AND deleted_at IS NULL
      `,
        absentEmployeeIds.length > 0
          ? [Array.from(allocatedTaskUsers), teamIds, absentEmployeeIds]
          : [Array.from(allocatedTaskUsers), teamIds]
      );
    
      allocatedEmployeeDetailsData.forEach((user) => {
        employeeDetails.push({
          employee_name: user.employee_name,
          status: "Allocated", // These employees are allocated tasks/subtasks
        });
      });
    }
    // Step 6: Get all users in the team (excluding absentees) and check for non-allocated employees
    const [allEmployeesData] = await db.query(
      `
      SELECT id, 
             COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS employee_name
      FROM users 
      WHERE deleted_at IS NULL AND team_id IN (?) ${absentEmployeeCondition}
    `,
      absentEmployeeIds.length > 0 ? [teamIds, absentEmployeeIds] : [teamIds]
    );

    // Add non-allocated employees
    allEmployeesData.forEach((user) => {
      if (!allocatedTaskUsers.has(user.id)) {
        employeeDetails.push({
          employee_name: user.employee_name,
          status: "Not Allocated", // These employees are not allocated any tasks
        });
      }
    });

    // Calculate percentages
    allocatedCount = employeeDetails.filter(
      (emp) => emp.status === "Allocated"
    ).length;
    const nonAllocatedCount = totalCount - allocatedCount;
    const allocatedPercentage =
      totalCount > 0 ? Math.round((allocatedCount / totalCount) * 100) : 0;
    const nonAllocatedPercentage = 100 - allocatedPercentage;

    const allottedData = {
      total: totalCount,
      Allocated: allocatedCount,
      nonAllocated: nonAllocatedCount,
      AllocatedPercentage: allocatedPercentage,
      notAllocatedPercentage: nonAllocatedPercentage,
    };

    return successResponse(
      res,
      {
        allotted_data: allottedData,
        employee_details: employeeDetails,
      },
      "Resource allocation data fetched successfully",
      200
    );
  } catch (error) {
    console.error("Error fetching resource allocation data:", error);
    return errorResponse(
      res,
      error.message,
      "Error fetching resource allocation data",
      500
    );
  }
};

exports.fetchTLdatas = async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return errorResponse(res, null, "User ID is required", 400);
    }
    const [rows] = await db.query(
      "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
      [user_id]
    );

    // Check if no rows are returned
    if (rows.length === 0) {
      return errorResponse(res, null, "User Not Found", 400);
    }
    // Fetch team IDs for the reporting user
    const [teamResult] = await db.query(
      "SELECT id FROM teams WHERE reporting_user_id = ? AND deleted_at IS NULL",
      [user_id]
    );

    if (teamResult.length === 0) {
      return res
        .status(404)
        .json({ message: "No teams found for the given user_id" });
    }

    const teamIds = teamResult.map((team) => team.id);

    // ========================= Fetch Attendance ========================
    const currentTime = new Date();
    const cutoffTime = new Date();
    cutoffTime.setHours(13, 30, 0, 0); // 1:30 PM cutoff
    const today = new Date().toISOString().split("T")[0];

    // Get total team strength
    const [totalStrengthResult] = await db.query(
      "SELECT COUNT(*) AS total_strength FROM users WHERE team_id IN (?) AND deleted_at IS NULL",
      [teamIds]
    );
    const totalStrength = totalStrengthResult[0]?.total_strength || 0;

    // Fetch absent employees
    const [absentEmployees] = await db.query(
      `
        SELECT e.user_id AS employee_id,employee_id AS employeeId,  
               COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS full_name, 
               'Absent' AS status
        FROM employee_leave e
        JOIN users u ON e.user_id = u.id
        WHERE DATE(e.date) = ? AND (
          e.day_type = 1
          OR (e.day_type = 2 AND e.half_type = 1 AND ? < ?)
        ) AND u.team_id IN (?) AND u.deleted_at IS NULL AND e.deleted_at IS NULL
      `,
      [today, currentTime, cutoffTime, teamIds]
    );

    const absentEmployeeIds = absentEmployees.map((emp) => emp.employee_id);
    const absentEmployeeIdsCondition =
      absentEmployeeIds.length > 0 ? `AND id NOT IN (?)` : "";

    // Fetch present employees
    const [presentEmployees] = await db.query(
      `
        SELECT id AS employee_id,employee_id AS employeeId,  
               COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS full_name
        FROM users 
        WHERE team_id IN (?) AND deleted_at IS NULL 
        ${absentEmployeeIdsCondition}
      `,
      absentEmployeeIds.length > 0 ? [teamIds, absentEmployeeIds] : [teamIds]
    );

    // Combine attendance data
    const attendanceList = [
      ...absentEmployees.map((emp) => ({
        employee_id: emp.employeeId,
        user_id: emp.employee_id,
        full_name: emp.full_name,
        status: "Absent",
      })),
      ...presentEmployees.map((emp) => ({
        employee_id: emp.employeeId,
        user_id: emp.employee_id,
        full_name: emp.full_name,
        status: "Present",
      })),
    ];

    const totalAbsentEmployees = absentEmployees.length;
    const totalPresentEmployees = presentEmployees.length;
    const presentPercentage = totalStrength
      ? Math.round((totalPresentEmployees / totalStrength) * 100)
      : 0;
    const absentPercentage = totalStrength
      ? Math.round((totalAbsentEmployees / totalStrength) * 100)
      : 0;

    // Add initials for each employee
    const attendanceWithInitials = attendanceList.map((employee) => {
      const nameParts = employee.full_name
        ? employee.full_name.split(" ").filter((part) => part.trim() !== "") // Filter out empty parts
        : []; // Safely handle missing or invalid full_name

      let initials = "";

      if (nameParts.length > 1) {
        // Use first letters of the two name parts
        initials =
          (nameParts[0][0]?.toUpperCase() || "") +
          (nameParts[1][0]?.toUpperCase() || "");
      } else if (nameParts.length === 1) {
        // Use the first two letters of the single part
        initials = nameParts[0].slice(0, 2).toUpperCase();
      } else {
        // Fallback for empty or missing names
        initials = "NA";
      }

      return {
        ...employee,
        initials,
      };
    });

    // ========================= Fetch Team Ratings ========================
    const currentMonth = new Date().toISOString().slice(0, 7); // Format YYYY-MM
    const [teamMembers] = await db.query(
      `
      SELECT id, COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS full_name
      FROM users WHERE team_id IN (?) AND deleted_at IS NULL
    `,
      [teamIds]
    );

    const [ratingsResult] = await db.query(
      "SELECT user_id, rating, average FROM ratings WHERE user_id IN (?) AND month = ?",
      [teamMembers.map((member) => member.id), currentMonth]
    );

    const ratingsMap = new Map();
    ratingsResult.forEach((rating) => {
      ratingsMap.set(rating.user_id, rating);
    });

    const finalRatingResult = teamMembers.map((member) => {
      const nameParts = member.full_name
        ? member.full_name.split(" ").filter((part) => part.trim() !== "") // Filter out empty parts
        : []; // Safely handle missing or invalid full_name

      let initials = "";

      if (nameParts.length > 1) {
        // Use first letters of the two name parts
        initials =
          (nameParts[0][0]?.toUpperCase() || "") +
          (nameParts[1][0]?.toUpperCase() || "");
      } else if (nameParts.length === 1) {
        // Use the first two letters of the single part
        initials = nameParts[0].slice(0, 2).toUpperCase();
      } else {
        // Fallback for empty or missing names
        initials = "NA";
      }

      const ratingRecord = ratingsMap.get(member.id) || {
        rating: 0,
        average: 0,
      };

      return {
        employee_name: member.full_name || "N/A",
        employee_id: member.id || "N/A",
        initials,
        rating_value: ratingRecord.rating,
        average_value: ratingRecord.average,
      };
    });

    // ========================= Fetch Products ========================
    const [products] = await db.query("SELECT * FROM products");
    const productResults = await Promise.all(
      products.map(async (product) => {
        const [tasks] = await db.query(
          `
        SELECT * FROM tasks WHERE product_id = ? AND team_id IN (?) AND deleted_at IS NULL
      `,
          [product.id, teamIds]
        );

        let totalItems = 0;
        let completedItems = 0;
        let workingEmployees = new Set();

        for (const task of tasks) {
          // Fetch subtasks associated with the task
          const subtasksQuery = `
            SELECT * FROM sub_tasks 
            WHERE task_id = ? AND team_id IN (?) AND deleted_at IS NULL
          `;
          const [subtasks] = await db.query(subtasksQuery, [task.id, teamIds]);

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
          const [employees] = await db.query(
            `
          SELECT id,employee_id, COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS full_name
          FROM users WHERE id IN (?) AND team_id IN (?) AND deleted_at IS NULL
        `,
            [Array.from(workingEmployees), teamIds]
          );

          employeeList = employees.map((user) => {
            const words = user.full_name ? user.full_name.split(" ") : [];
            const initials =
              words.length > 1
                ? words.map((word) => word[0].toUpperCase()).join("")
                : (words[0] || "").slice(0, 2).toUpperCase();
            return {
              employee_name: user.full_name || "N/A",
              employee_id: user.employee_id || "N/A",
              initials,
            };
          });
        }

        return {
          product_id: product.id,
          product_name: product.name,
          task_count: tasks.length,
          completed_percentage: completionPercentage,
          employee_count: workingEmployees.size,
          employees: employeeList,
        };
      })
    );

    // ========================= Fetch Resource Allotment ========================
    const [absentEmployeesForAllocation] = await db.query(
      `
      SELECT user_id FROM employee_leave WHERE date = ? AND user_id IN (SELECT id FROM users WHERE team_id IN (?) AND deleted_at IS NULL) AND deleted_at IS NULL
    `,
      [today, teamIds]
    );

    const absentEmployeeIdsForAllocation = absentEmployeesForAllocation.map(
      (emp) => emp.user_id
    );
    const absentEmployeeConditionForAllocation =
      absentEmployeeIdsForAllocation.length > 0 ? `AND id NOT IN (?)` : "";

    const [totalUsersData] = await db.query(
      `
      SELECT COUNT(*) as total_count FROM users WHERE deleted_at IS NULL AND team_id IN (?) ${absentEmployeeConditionForAllocation}
    `,
      absentEmployeeIdsForAllocation.length > 0
        ? [teamIds, absentEmployeeIdsForAllocation]
        : [teamIds]
    );

    const totalCountForAllocation = totalUsersData[0].total_count;
    let allocatedCountForAllocation = 0;
    const allocatedTaskUsers = new Set();

    const [tasksForAllocation] = await db.query(
      `
      SELECT id, user_id FROM tasks WHERE deleted_at IS NULL AND team_id IN (?) ${absentEmployeeConditionForAllocation} AND status != 3
    `,
      absentEmployeeIdsForAllocation.length > 0
        ? [teamIds, absentEmployeeIdsForAllocation]
        : [teamIds]
    );

    const taskIdsForAllocation = tasksForAllocation.map((task) => task.id);

    const [subtasksForAllocation] = await db.query(
      `
      SELECT task_id, user_id FROM sub_tasks WHERE task_id IN (?) AND status != 3 AND deleted_at IS NULL
    `,
      [taskIdsForAllocation]
    );

    subtasksForAllocation.forEach((subtask) => {
      allocatedTaskUsers.add(subtask.user_id);
    });

    tasksForAllocation.forEach((task) => {
      if (!allocatedTaskUsers.has(task.user_id)) {
        allocatedTaskUsers.add(task.user_id);
      }
    });

    let employeeDetailsForAllocation = [];
    if (allocatedTaskUsers.size > 0) {
      const [allocatedEmployeeDetailsData] = await db.query(
        `
        SELECT id, 
               COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS employee_name
        FROM users 
        WHERE id IN (?) AND team_id IN (?) ${absentEmployeeConditionForAllocation} AND deleted_at IS NULL
      `,
        absentEmployeeIds.length > 0
          ? [Array.from(allocatedTaskUsers), teamIds, absentEmployeeIds]
          : [Array.from(allocatedTaskUsers), teamIds]
      );
    
      allocatedEmployeeDetailsData.forEach((user) => {
        employeeDetailsForAllocation.push({
          employee_name: user.employee_name,
          status: "Allocated", // These employees are allocated tasks/subtasks
        });
      });
    }
    const [allEmployeesForAllocation] = await db.query(
      `
      SELECT id, COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS employee_name
      FROM users WHERE deleted_at IS NULL AND team_id IN (?) ${absentEmployeeConditionForAllocation}
    `,
      absentEmployeeIdsForAllocation.length > 0
        ? [teamIds, absentEmployeeIdsForAllocation]
        : [teamIds]
    );

    allEmployeesForAllocation.forEach((user) => {
      if (!allocatedTaskUsers.has(user.id)) {
        employeeDetailsForAllocation.push({
          employee_name: user.employee_name,
          status: "Not Allocated",
        });
      }
    });

    allocatedCountForAllocation = employeeDetailsForAllocation.filter(
      (emp) => emp.status === "Allocated"
    ).length;
    const nonAllocatedCount =
      totalCountForAllocation - allocatedCountForAllocation;
    const allocatedPercentage =
      totalCountForAllocation > 0
        ? Math.round(
            (allocatedCountForAllocation / totalCountForAllocation) * 100
          )
        : 0;
    const nonAllocatedPercentage = 100 - allocatedPercentage;

    const allottedData = {
      total: totalCountForAllocation,
      Allocated: allocatedCountForAllocation,
      nonAllocated: nonAllocatedCount,
      AllocatedPercentage: allocatedPercentage,
      notAllocatedPercentage: nonAllocatedPercentage,
    };

    // Final response
    return res.status(200).json({
      message: "Team data fetched successfully",
      data: {
        attendance: {
          total_strength: totalStrength,
          total_present_employees: totalPresentEmployees,
          total_absent_employees: totalAbsentEmployees,
          present_percentage: presentPercentage,
          absent_percentage: absentPercentage,
          attendance_list: attendanceWithInitials,
        },
        tl_ratings: finalRatingResult,
        products: productResults,
        resource_allotment: {
          allotted_data: allottedData,
          employee_details: employeeDetailsForAllocation,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching TL data:", error);
    return res.status(500).json({
      message: "Error fetching TL data",
      error: error.message,
    });
  }
};

exports.fetchTlviewproductdata = async (req, res) => {
  try {
    const { user_id, product_id, project_id, date, search } = req.query;

    if (!product_id) {
      return errorResponse(res, null, "Product ID is required", 400);
    }
    if (!user_id) {
      return errorResponse(res, null, "User ID is required", 400);
    }
    const [rows] = await db.query(
      "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
      [user_id]
    );

    // Check if no rows are returned
    if (rows.length === 0) {
      return errorResponse(res, null, "User Not Found", 400);
    }

    // Fetch team IDs for the reporting user
    const [teamResult] = await db.query(
      "SELECT id FROM teams WHERE reporting_user_id = ? AND deleted_at IS NULL",
      [user_id]
    );

    if (teamResult.length === 0) {
      return res
        .status(404)
        .json({ message: "No teams found for the given user_id" });
    }

    const teamIds = teamResult.map((team) => team.id);

    // Build dynamic SQL query for product details
    const productQuery = `
      SELECT id, name
      FROM products
      WHERE id = ? AND deleted_at IS NULL
    `;
    const [productRows] = await db.query(productQuery, [product_id]);
    const product = productRows[0] || { name: "N/A", id: "N/A" };

    // Build dynamic query for tasks and subtasks
    // Build dynamic query for tasks and subtasks
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
  s.estimated_hours AS subtask_estimation_hours,
  s.description AS subtask_description,
  te.name AS team_name,
  COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS employee_name,
  p.name AS project_name
FROM tasks t
LEFT JOIN sub_tasks s ON t.id = s.task_id
LEFT JOIN teams te ON t.team_id = te.id
LEFT JOIN users u ON t.user_id = u.id
LEFT JOIN projects p ON t.project_id = p.id
WHERE t.product_id = ?
AND t.deleted_at IS NULL
AND s.deleted_at IS NULL
AND te.deleted_at IS NULL
AND p.deleted_at IS NULL
AND u.deleted_at IS NULL
`;

    // Filter by team_ids based on reporting_user_id
    if (teamIds.length > 0) {
      tasksQuery += ` AND t.team_id IN (${teamIds
        .map((id) => db.escape(id))
        .join(",")})`;
    }

    // Add other filters as necessary
    if (project_id) {
      tasksQuery += ` AND t.project_id = ${db.escape(project_id)}`;
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
      s.name LIKE ${db.escape("%" + search + "%")}
    )
  `;
    }

    // Execute the query
    const [taskRows] = await db.query(tasksQuery, [product_id]);

    // Helper function to validate subtask inclusion based on status
    const isValidSubtask = (subtask, status) => {
      switch (status) {
        case "Pending":
          return subtask.active_status === 0 && subtask.status === 0 && subtask.reopenStatus === 0;
        case "In Progress":
          return subtask.active_status === 1 && subtask.status === 1 && subtask.reopenStatus === 0;
        case "In Review":
          return subtask.status === 2 && subtask.reopenStatus === 0;
        case "On Hold":
          return subtask.active_status === 0 && subtask.status === 1 && subtask.reopenStatus === 0;
        case "Done":
          return subtask.status === 3;
        default:
          return false;
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
            SubtaskActiveStatus: subtask.active_status || "N/A",
            SubtaskStatus: subtask.status || "N/A",
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
        TaskName: task.name || "N/A",
        TaskId: task.id || "N/A",
        TotalSubtaskCount: totalSubtasks,
        CompletedSubtaskCount: completedSubtasks,
        EstimationHours: task.estimation_hours || "N/A",
        Description: task.description || "N/A",
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
    };

    // Track added task IDs for each section
    const addedTaskIds = {
      Pending: [],
      "In Progress": [],
      "In Review": [],
      "On Hold": [],
      Done: [],
    };

    // Process each row and categorize tasks
    taskRows.forEach((row) => {
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
            estimated_hours: row.subtask_estimation_hours,
            description: row.subtask_description,
          }
        : null;

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
          groupedTasks[category][existingTaskIndex].Subtasks.push({
            SubtaskId: subtask.id || "N/A",
            SubtaskName: subtask.name || "N/A",
            SubtaskEstimationHours: subtask.estimated_hours || "N/A",
            SubtaskDescription: subtask.description || "N/A",
            SubtaskActiveStatus: subtask.active_status || "N/A",
            SubtaskStatus: subtask.status || "N/A",
          });
        }
      }
    });

    // Calculate the overall completion percentage
    let totalTasksAndSubtasks = 0;
    let completedTasksAndSubtasks = 0;

    // Loop through all task groups and count
    Object.keys(groupedTasks).forEach((status) => {
      groupedTasks[status].forEach((task) => {
        if (task.Subtasks.length > 0) {
          // If the task has subtasks, count only the subtasks
          task.Subtasks.forEach((subtask) => {
            totalTasksAndSubtasks++;
            if (subtask.SubtaskStatus === 3) {
              completedTasksAndSubtasks++;
            }
          });
        } else {
          // If the task has no subtasks, count the task itself
          totalTasksAndSubtasks++;
          if (task.Status === "Done") {
            completedTasksAndSubtasks++;
          }
        }
      });
    });

    const OverallCompletionPercentage =
      totalTasksAndSubtasks > 0
        ? Math.round((completedTasksAndSubtasks / totalTasksAndSubtasks) * 100)
        : 0;

    const taskCountQuery = `
    SELECT COUNT(*) AS task_count
    FROM tasks
    WHERE product_id = ? 
      AND team_id IN (?) 
      AND deleted_at IS NULL
  `;

    const [taskCountResult] = await db.query(taskCountQuery, [
      product_id,
      teamIds,
    ]);

    // Access the task count
    const taskCount = taskCountResult[0]?.task_count || 0;

    // Prepare the response
    const result = {
      PendingTasks: groupedTasks["Pending"],
      InProgressTasks: groupedTasks["In Progress"],
      InReviewTasks: groupedTasks["In Review"],
      OnHoldTasks: groupedTasks["On Hold"],
      DoneTasks: groupedTasks["Done"],
      TodoCount: groupedTasks["Pending"].length,
      InProgressCount: groupedTasks["In Progress"].length,
      InReviewCount: groupedTasks["In Review"].length,
      OnHoldCount: groupedTasks["On Hold"].length,
      DoneCount: groupedTasks["Done"].length,
      TaskCount: taskCount,
      OverallCompletionPercentage: OverallCompletionPercentage,
      productname: product.name,
      productid: product.id,
    };

    return successResponse(
      res,
      result,
      "TL Product details retrieved successfully",
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
