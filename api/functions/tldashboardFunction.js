const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
} = require("../../helpers/responseHelper");
const {
  getColorForProduct, getUserIdFromAccessToken
} = require("../../api/functions/commonFunction");

exports.fetchAttendance = async (req, res) => {
  try {
    const currentTimeUTC = new Date();
    const currentTime = new Date(currentTimeUTC.getTime() + 5.5 * 60 * 60 * 1000);
    const cutoffTime = new Date();
    cutoffTime.setHours(13, 30, 0, 0); 
    const today = new Date().toISOString().split("T")[0];
    const { employee_id } = req.query;

    const accessToken = req.headers.authorization?.split(' ')[1];
    if (!accessToken) {
      return errorResponse(res, 'Access token is required', 401);
    }

    const user_id = await getUserIdFromAccessToken(accessToken);
    if (!user_id) {
      return errorResponse(res, null, "User ID is required", 400);
    }

    const [userCheck] = await db.query(
      "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
      [user_id]
    );
    if (userCheck.length === 0) {
      return errorResponse(res, null, "User Not Found", 400);
    }

    const [teamResult] = await db.query(
      "SELECT id FROM teams WHERE reporting_user_id = ? AND deleted_at IS NULL",
      [user_id]
    );
    if (teamResult.length === 0) {
      return errorResponse(
        res,
        null,
        "You are not currently assigned a reporting TL for your team.",
        404
      );
    }

    const teamIds = teamResult.map((team) => team.id);

    const [totalStrengthResult] = await db.query(
      "SELECT COUNT(*) AS total_strength FROM users WHERE team_id IN (?) AND role_id = 4 AND deleted_at IS NULL",
      [teamIds]
    );
    const totalStrength = totalStrengthResult[0]?.total_strength || 0;

    // Fetch today's leave records
    const [leaveRecords] = await db.query(
      `
        SELECT e.user_id AS employee_id, u.employee_id AS employeeId, u.role_id, u.designation_id,
               COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS full_name,
               e.day_type, e.half_type
        FROM employee_leave e
        JOIN users u ON e.user_id = u.id
        WHERE DATE(e.date) = ?
          AND u.team_id IN (?)
          AND u.deleted_at IS NULL
          AND u.role_id = 4
          AND e.deleted_at IS NULL
          ${employee_id ? "AND u.employee_id = ?" : ""}
      `,
      employee_id ? [today, teamIds, employee_id] : [today, teamIds]
    );

    const absentEmployees = [];
    const leaveEmployeeIds = [];

    for (const emp of leaveRecords) {
      const { day_type, half_type } = emp;
      let isAbsent = false;

      if (day_type === 1) {
        isAbsent = true;
      } else if (day_type === 2) {
        if (half_type === 1 && currentTime <= cutoffTime) {
          isAbsent = true; // first half leave before 1:30
        } else if (half_type === 2 && currentTime > cutoffTime) {
          isAbsent = true; // second half leave after 1:30
        }
      }

      if (isAbsent) {
        absentEmployees.push(emp);
        leaveEmployeeIds.push(emp.employee_id);
      }
    }

    // Fetch present employees excluding absent ones
    const leaveCondition = leaveEmployeeIds.length > 0 ? `AND id NOT IN (?)` : "";

    const [presentEmployees] = await db.query(
      `
        SELECT id AS user_id, employee_id AS employeeId, role_id ,designation_id,
               COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS full_name,
               NULL AS day_type,
               NULL AS half_type
        FROM users
        WHERE team_id IN (?) 
          AND deleted_at IS NULL
          AND role_id = 4
          ${leaveCondition}
          ${employee_id ? "AND employee_id = ?" : ""}
      `,
      leaveEmployeeIds.length > 0
        ? [teamIds, leaveEmployeeIds, employee_id || []]
        : [teamIds, employee_id || []]
    );

    // Combine attendance data
    const attendanceList = [
      ...absentEmployees.map((emp) => ({
        employee_id: emp.employeeId,
        user_id: emp.employee_id,
        full_name: emp.full_name,
        role_id: emp.role_id,
        designation_id: emp.designation_id,
        status: "Absent",
        day_type: emp.day_type,
        half_type: emp.half_type,
      })),
      ...presentEmployees.map((emp) => ({
        employee_id: emp.employeeId,
        user_id: emp.user_id,
        full_name: emp.full_name,
        role_id: emp.role_id,
        designation_id: emp.designation_id,
        status: "Present",
        day_type: emp.day_type,
        half_type: emp.half_type,
      })),
    ];

    // Add initials
    const attendanceWithInitials = attendanceList.map((employee) => {
      const nameParts = employee.full_name
        ? employee.full_name.split(" ").filter((part) => part.trim() !== "")
        : [];
      let initials = "NA";

      if (nameParts.length > 1) {
        initials =
          (nameParts[0][0]?.toUpperCase() || "") +
          (nameParts[1][0]?.toUpperCase() || "");
      } else if (nameParts.length === 1) {
        initials = nameParts[0].slice(0, 2).toUpperCase();
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
    // const { user_id } = req.query;
    const accessToken = req.headers.authorization?.split(' ')[1];
            if (!accessToken) {
                return errorResponse(res, 'Access token is required', 401);
            }
        const user_id = await getUserIdFromAccessToken(accessToken);

    if (!user_id) {
      return errorResponse(res, null, "User ID is required", 400);
    }

    const [rows] = await db.query(
      "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
      [user_id]
    );

    if (rows.length === 0) {
      return errorResponse(res, null, "User Not Found", 400);
    }

    // Fetch team IDs
    const [teamResult] = await db.query(
      "SELECT id FROM teams WHERE reporting_user_id = ? AND deleted_at IS NULL",
      [user_id]
    );

    if (teamResult.length === 0) {
      return errorResponse(
        res,
        null,
        "You are not currently assigned a reporting TL for your team.",
        404
      );
    }

    const teamIds = teamResult.map((team) => team.id);

    // Fetch team members with concatenated full name
    const [teamMembers] = await db.query(
      `SELECT id, role_id ,designation_id, COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS full_name 
       FROM users WHERE team_id IN (?) AND role_id = 4 AND deleted_at IS NULL`,
      [teamIds]
    );

    // Fetch summed ratings for the current month
    const currentMonth = new Date().toISOString().slice(0, 7); // Format YYYY-MM
    const [ratingsResult] = await db.query(
      `SELECT user_id, SUM(average) AS total_average 
       FROM ratings 
       WHERE user_id IN (?) AND month = ?
       GROUP BY user_id`,
      [teamMembers.map((member) => member.id), currentMonth]
    );

    // Create a map for easy access to summed ratings
    const ratingsMap = new Map();
    ratingsResult.forEach((rating) => {
      ratingsMap.set(rating.user_id, rating.total_average);
    });

    // Process team members
    const finalRatingResult = teamMembers.map((member) => {
      const nameParts = member.full_name
        ? member.full_name.split(" ").filter((part) => part.trim() !== "")
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
        employee_name: member.full_name || "N/A",
        role_id: member.role_id || "N/A",
        designation_id: member.designation_id || "N/A",
        employee_id: member.id || "N/A",
        initials,
        rating_value: ratingsMap.get(member.id) || 0, // Use summed average
        average_value: ratingsMap.get(member.id) || 0, // Keep the same for now
      };
    });

    if (finalRatingResult.length === 0) {
      finalRatingResult.push({
        employee_name: "N/A",
        role_id: "N/A",
        designation_id: "N/A",
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
    const { product_id } = req.query;
    const accessToken = req.headers.authorization?.split(' ')[1];
            if (!accessToken) {
                return errorResponse(res, 'Access token is required', 401);
            }
        const user_id = await getUserIdFromAccessToken(accessToken);

    if (!user_id) {
      return errorResponse(res, null, "User ID is required", 400);
    }

    const [userRows] = await db.query(
      "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
      [user_id]
    );
    if (userRows.length === 0) {
      return errorResponse(res, null, "User Not Found", 400);
    }

    const [teamResult] = await db.query(
      "SELECT id FROM teams WHERE reporting_user_id = ? AND deleted_at IS NULL",
      [user_id]
    );
    if (teamResult.length === 0) {
      return errorResponse(
        res,
        null,
        "You are not currently assigned a reporting TL for your team.",
        404
      );
    }
    const teamIds = teamResult.map((team) => team.id);

    let productIds = [];
    if (product_id) {
      productIds = product_id.split(",").map((id) => parseInt(id.trim(), 10));
    }

    let productFilterQuery = `
  SELECT DISTINCT p.* 
  FROM products p
  LEFT JOIN tasks t ON t.product_id = p.id AND t.deleted_at IS NULL
  LEFT JOIN sub_tasks s ON s.task_id = t.id AND s.deleted_at IS NULL
  LEFT JOIN users tu ON t.user_id = tu.id AND tu.deleted_at IS NULL
  LEFT JOIN users su ON s.user_id = su.id AND su.deleted_at IS NULL
  WHERE p.deleted_at IS NULL
    AND (
      (tu.team_id IN (?) AND t.id IS NOT NULL)
      OR
      (su.team_id IN (?) AND s.id IS NOT NULL)
    )
`;

    const queryValues = [teamIds, teamIds];

    if (productIds.length) {
      productFilterQuery += ` AND p.id IN (?)`;
      queryValues.push(productIds);
    }

    const [products] = await db.query(productFilterQuery, queryValues);
    if (products.length === 0) {
      return res.status(404).json({ message: "No products found" });
    }

    const result = await Promise.all(
      products.map(async (product) => {
        const tasksQuery = `
          SELECT t.* 
          FROM tasks t
          JOIN users u ON t.user_id = u.id AND u.deleted_at IS NULL
          WHERE t.product_id = ? 
            AND u.team_id IN (?) 
            AND t.deleted_at IS NULL
        `;
        const [tasks] = await db.query(tasksQuery, [product.id, teamIds]);

        let totalItems = 0;
        let completedItems = 0;
        let workingEmployees = new Set();

        for (const task of tasks) {
          // Step 1: Get subtasks for this task (only user_id NOT NULL)
          const [rawSubtasks] = await db.query(
            `SELECT * FROM sub_tasks WHERE task_id = ? AND deleted_at IS NULL AND user_id IS NOT NULL`,
            [task.id]
          );

          if (rawSubtasks.length > 0) {
            // Step 2: Get valid user_ids who are in our team
            const userIds = rawSubtasks.map((s) => s.user_id);
            const [validUsers] = await db.query(
              `SELECT id FROM users WHERE id IN (?) AND team_id IN (?) AND deleted_at IS NULL`,
              [userIds, teamIds]
            );
            const validUserIds = new Set(validUsers.map((u) => u.id));

            const validSubtasks = rawSubtasks.filter((s) =>
              validUserIds.has(s.user_id)
            );

            if (validSubtasks.length > 0) {
              // ✅ Subtasks with valid users exist → count only subtasks
              totalItems += validSubtasks.length;
              completedItems += validSubtasks.filter(
                (s) => s.status == 3
              ).length;
              validSubtasks.forEach((s) => workingEmployees.add(s.user_id));
            } else {
              // ❌ Subtasks exist, but none valid → OMIT task
              continue;
            }
          } else {
            // No subtasks at all → count the task if task user is in team
            if (task.user_id) {
              const [userCheck] = await db.query(
                `SELECT id FROM users WHERE id = ? AND team_id IN (?) AND deleted_at IS NULL`,
                [task.user_id, teamIds]
              );
              if (userCheck.length > 0) {
                totalItems += 1;
                if (task.status == 3) completedItems += 1;
                workingEmployees.add(task.user_id);
              }
            }
          }
        }

        const completionPercentage =
          totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

        // Fetch employee details
        let employeeList = [];
        if (workingEmployees.size > 0) {
          const [employees] = await db.query(
            `SELECT id, employee_id, first_name, last_name
             FROM users 
             WHERE id IN (?) AND team_id IN (?) AND deleted_at IS NULL`,
            [Array.from(workingEmployees), teamIds]
          );

          employeeList = employees.map((user) => {
            const firstName = user.first_name || "";
            const lastName = user.last_name || "";
            const initials =
              (firstName.split(" ")[0]?.[0] || "").toUpperCase() +
              (lastName?.[0] || "").toUpperCase();

            return {
              employee_name: `${firstName} ${lastName}`.trim() || "N/A",
              employee_id: user.employee_id || "N/A",
              initials: initials || "NA",
            };
          });
        }

        return {
          product_id: product.id,
          product_name: product.name,
          task_count: tasks.length,
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

exports.fetchTLresourceallotment = async (req, res) => {
  try {
    // const { user_id } = req.query;
    const accessToken = req.headers.authorization?.split(' ')[1];
            if (!accessToken) {
                return errorResponse(res, 'Access token is required', 401);
            }
        const user_id = await getUserIdFromAccessToken(accessToken);

    if (!user_id) {
      return errorResponse(res, null, "User ID is required", 400);
    }

    const [rows] = await db.query(
      "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
      [user_id]
    );

    if (rows.length === 0) {
      return errorResponse(res, null, "User Not Found", 400);
    }

    // Fetch team IDs
    const [teamResult] = await db.query(
      "SELECT id FROM teams WHERE reporting_user_id = ? AND deleted_at IS NULL",
      [user_id]
    );

    if (teamResult.length === 0) {
      return errorResponse(
        res,
        null,
        "You are not currently assigned a reporting TL for your team.",
        404
      );
    }

    const teamIds = teamResult.map((team) => team.id);
    const today = new Date().toISOString().split("T")[0];

    // Fetch absent employees
    const [absentEmployees] = await db.query(
      `SELECT user_id FROM employee_leave 
       WHERE date = ? 
       AND user_id IN (SELECT id FROM users WHERE team_id IN (?) AND role_id NOT IN (1, 2, 3) AND deleted_at IS NULL) 
       AND deleted_at IS NULL`,
      [today, teamIds]
    );

    const absentEmployeeIds = absentEmployees.map((emp) => emp.user_id);
    const absentEmployeeCondition =
      absentEmployeeIds.length > 0 ? `AND id NOT IN (?)` : "";

    // Get total team users excluding absentees and role_id = 3
    const [totalUsers] = await db.query(
      `SELECT COUNT(*) as total_count 
       FROM users 
       WHERE deleted_at IS NULL 
       AND role_id NOT IN (1, 2, 3) 
       AND team_id IN (?) ${absentEmployeeCondition}`,
      absentEmployeeIds.length > 0 ? [teamIds, absentEmployeeIds] : [teamIds]
    );

    const totalCount = totalUsers[0].total_count;
    let allocatedCount = 0;
    let employeeDetails = [];
    const allocatedTaskUsers = new Set();

    // Fetch tasks
    const [tasks] = await db.query(
      `SELECT id, user_id 
       FROM tasks 
       WHERE deleted_at IS NULL 
       AND team_id IN (?) 
       AND status NOT IN (2, 3) 
       AND user_id IN (SELECT id FROM users WHERE role_id NOT IN (1, 2, 3)) ${absentEmployeeCondition}`,
      absentEmployeeIds.length > 0 ? [teamIds, absentEmployeeIds] : [teamIds]
    );

    const taskIds = tasks.map((task) => task.id);

    if (taskIds.length > 0) {
      // Fetch subtasks only if taskIds exist
      const [subtasks] = await db.query(
        `SELECT task_id, user_id 
         FROM sub_tasks 
         WHERE task_id IN (${taskIds.map(() => "?").join(",")}) 
         AND status NOT IN (2, 3) 
         AND deleted_at IS NULL`,
        taskIds
      );

      // Add users from subtasks first
      subtasks.forEach((subtask) => {
        allocatedTaskUsers.add(subtask.user_id);
      });

      // Add users from tasks (only if they are not already in subtasks)
      tasks.forEach((task) => {
        if (!allocatedTaskUsers.has(task.user_id)) {
          allocatedTaskUsers.add(task.user_id);
        }
      });
    }

    // Fetch employee details of allocated users
    if (allocatedTaskUsers.size > 0) {
      const [allocatedEmployeeDetails] = await db.query(
        `SELECT id, role_id, designation_id, 
                COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS employee_name 
         FROM users 
         WHERE id IN (?) AND role_id NOT IN (1, 2, 3) 
         AND team_id IN (?) ${absentEmployeeCondition} 
         AND deleted_at IS NULL`,
        absentEmployeeIds.length > 0
          ? [Array.from(allocatedTaskUsers), teamIds, absentEmployeeIds]
          : [Array.from(allocatedTaskUsers), teamIds]
      );

      allocatedEmployeeDetails.forEach((user) => {
        employeeDetails.push({
          employee_name: user.employee_name,
          employee_role: user.role_id,
          employee_designation: user.designation_id,
          status: "Allocated",
        });
      });
    }

    // Fetch all employees in the team (excluding absentees & role_id = 3)
    const [allEmployees] = await db.query(
      `SELECT id, role_id, designation_id,
              COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS employee_name 
       FROM users 
       WHERE deleted_at IS NULL 
       AND role_id NOT IN (1, 2, 3) 
       AND team_id IN (?) ${absentEmployeeCondition}`,
      absentEmployeeIds.length > 0 ? [teamIds, absentEmployeeIds] : [teamIds]
    );

    // Add non-allocated employees
    allEmployees.forEach((user) => {
      if (!allocatedTaskUsers.has(user.id)) {
        employeeDetails.push({
          employee_name: user.employee_name,
          employee_role: user.role_id,
          employee_designation: user.designation_id,
          status: "Not Allocated",
        });
      }
    });

    // Calculate allocation percentages
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
      { allotted_data: allottedData, employee_details: employeeDetails },
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
    // const { user_id } = req.query;
    const accessToken = req.headers.authorization?.split(' ')[1];
            if (!accessToken) {
                return errorResponse(res, 'Access token is required', 401);
            }
        const user_id = await getUserIdFromAccessToken(accessToken);

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
      return errorResponse(
        res,
        null,
        "You are not currently assigned a reporting TL for your team.",
        404
      );
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
          const employeeDetailsQuery = `
                        SELECT id, employee_id, 
                               COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS full_name 
                        FROM users 
                        WHERE id IN (?) AND team_id IN (?) AND deleted_at IS NULL
                    `;
          const [employees] = await db.query(employeeDetailsQuery, [
            Array.from(workingEmployees),
            teamIds,
          ]);

          employeeList = employees.map((user) => {
            const fullName = user.full_name || "N/A";
            const words = fullName.split(" ");
            const initials =
              words.length > 1
                ? words.map((word) => (word[0] || "").toUpperCase()).join("")
                : fullName.slice(0, 2).toUpperCase();

            return {
              employee_name: fullName,
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
    const { product_id, project_id, date, search } = req.query;
    const accessToken = req.headers.authorization?.split(' ')[1];
            if (!accessToken) {
                return errorResponse(res, 'Access token is required', 401);
            }
        const user_id = await getUserIdFromAccessToken(accessToken);

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

    if (rows.length === 0) {
      return errorResponse(res, null, "User Not Found", 400);
    }

    const [teamResult] = await db.query(
      "SELECT id FROM teams WHERE reporting_user_id = ? AND deleted_at IS NULL",
      [user_id]
    );

    if (teamResult.length === 0) {
      return errorResponse(
        res,
        null,
        "You are not currently assigned a reporting TL for your team.",
        404
      );
    }

    const teamIds = teamResult.map((team) => team.id);

    const [rowss] = await db.query(
      "SELECT id FROM products WHERE id = ? AND deleted_at IS NULL",
      [product_id]
    );

    if (rowss.length === 0) {
      return errorResponse(res, null, "Product Not Found", 400);
    }

    const [productRows] = await db.query(
      "SELECT id, name FROM products WHERE id = ? AND deleted_at IS NULL",
      [product_id]
    );

    const product = productRows[0] || { name: "N/A", id: "N/A" };

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
        ON t.id = s.task_id AND s.deleted_at IS NULL AND s.user_id IS NOT NULL
      LEFT JOIN users task_user 
        ON t.user_id = task_user.id AND task_user.deleted_at IS NULL
      LEFT JOIN users subtask_user 
        ON s.user_id = subtask_user.id AND subtask_user.deleted_at IS NULL
      LEFT JOIN teams te 
        ON t.team_id = te.id AND te.deleted_at IS NULL
      LEFT JOIN users u 
        ON t.user_id = u.id AND u.deleted_at IS NULL
      LEFT JOIN projects p 
        ON t.project_id = p.id AND p.deleted_at IS NULL
      WHERE t.product_id = ? AND t.deleted_at IS NULL
    `;

    const params = [product_id];

    if (teamIds.length > 0) {
      const escapedTeamIds = teamIds.map((id) => db.escape(id)).join(",");
      baseQuery += `
    AND task_user.team_id IN (${escapedTeamIds})
    AND (
      subtask_user.id IS NULL
      OR subtask_user.team_id IN (${escapedTeamIds})
    )
  `;
    }

    if (project_id) {
      baseQuery += ` AND t.project_id = ?`;
      params.push(project_id);
    }

    if (date) {
      baseQuery += ` AND DATE(t.created_at) = ?`;
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

    const [taskRows] = await db.query(baseQuery, params);

    const isValidSubtask = (item, status) => {
      const isTask = !item.hasOwnProperty("subtask_id");

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

    const formatTask = (task, subtasks, status) => {
      const validSubtasks = [];
      let totalSubtasks = 0;
      let completedSubtasks = 0;

      subtasks.forEach((subtask) => {
        if (isValidSubtask(subtask, status)) {
          validSubtasks.push({
            SubtaskId: subtask.id || "N/A",
            SubtaskName: subtask.name || "N/A",
            SubtaskEstimationHours: subtask.estimated_hours || "N/A",
            SubtaskDescription: subtask.description || "N/A",
            SubtaskActiveStatus: subtask.subtask_active_status || "N/A",
            SubtaskStatus: subtask.status || "N/A",
          });
        }
        totalSubtasks++;
        if (subtask.status === 3) {
          completedSubtasks++;
        }
      });

      const completionPercentage =
        totalSubtasks > 0
          ? Math.round((completedSubtasks / totalSubtasks) * 100)
          : task.status === 3
          ? 100
          : 0;

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
        Subtasks: validSubtasks,
        CompletionPercentage: completionPercentage,
        Status: status,
      };
    };

    const groupedTasks = {
      Pending: [],
      "In Progress": [],
      "In Review": [],
      "On Hold": [],
      Done: [],
      "Re Open": [],
    };

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

      const category = Object.keys(groupedTasks).find((status) =>
        isValidSubtask(subtask || task, status)
      );

      if (category) {
        const existingTaskIndex = groupedTasks[category].findIndex(
          (t) => t.TaskId === task.id
        );

        if (existingTaskIndex === -1) {
          groupedTasks[category].push(
            formatTask(task, subtask ? [subtask] : [], category)
          );
        } else if (subtask) {
          const existingTask = groupedTasks[category][existingTaskIndex];
          existingTask.Subtasks.push({
            SubtaskId: subtask.id || "N/A",
            SubtaskName: subtask.name || "N/A",
            SubtaskEstimationHours: subtask.estimated_hours || "N/A",
            SubtaskDescription: subtask.description || "N/A",
            SubtaskActiveStatus: subtask.active_status || "N/A",
            SubtaskStatus: subtask.status || "N/A",
          });
          existingTask.TotalSubtaskCount++;
          if (subtask.status === 3) {
            existingTask.CompletedSubtaskCount++;
          }
          existingTask.CompletionPercentage = Math.round(
            (existingTask.CompletedSubtaskCount /
              existingTask.TotalSubtaskCount) *
              100
          );
        }
      }
    });

    let totalItems = 0;
    let completedItems = 0;

    Object.keys(groupedTasks).forEach((status) => {
      groupedTasks[status].forEach((task) => {
        if (task.Subtasks.length > 0) {
          console.log("subtasktask", task.TaskId);
          task.Subtasks.forEach((subtask) => {
            totalItems++;
            if (subtask.SubtaskStatus === 3) {
              // console.log(subtask.SubtaskId);

              completedItems++;
            }
          });
        } else {
          console.log("task", task.TaskId);
          totalItems++;
          if (task.CompletionPercentage === 100) {
            // console.log("task",task.TaskId);
            completedItems++;
          }
        }
      });
    });

    const overallCompletionPercentage =
      totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    console.log(overallCompletionPercentage, completedItems, totalItems);

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
      TaskCount: taskRows.length,
      OverallCompletionPercentage: overallCompletionPercentage,
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
    console.error(error);
    return errorResponse(
      res,
      "Error fetching product task data",
      error.message,
      500
    );
  }
};
