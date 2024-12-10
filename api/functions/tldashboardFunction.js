const db = require("../../config/db");
const { successResponse, errorResponse } = require("../../helpers/responseHelper");

exports.fetchAttendance = async (req, res) => {
  try {
    const currentTime = new Date();
    const cutoffTime = new Date();
    cutoffTime.setHours(13, 30, 0, 0); // 1:30 PM cutoff
    const today = new Date().toISOString().split("T")[0];
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ message: "user_id is required" });
    }

    // Fetch team IDs for the reporting user
    const [teamResult] = await db.query(
      "SELECT id FROM teams WHERE reporting_user_id = ?",
      [user_id]
    );

    if (teamResult.length === 0) {
      return res.status(404).json({ message: "No teams found for the given user_id" });
    }

    const teamIds = teamResult.map((team) => team.id);

    // Get total team strength
    const [totalStrengthResult] = await db.query(
      "SELECT COUNT(*) AS total_strength FROM users WHERE team_id IN (?)",
      [teamIds]
    );
    const totalStrength = totalStrengthResult[0]?.total_strength || 0;

    // Fetch absent employees
    const [absentEmployees] = await db.query(
      `
        SELECT e.user_id, 
               COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS full_name, 
               'Absent' AS status
        FROM employee_leave e
        JOIN users u ON e.user_id = u.id
        WHERE DATE(e.date) = ?
          AND (
            e.day_type = 1
            OR (e.day_type = 2 AND e.half_type = 1 AND ? < ?)
          )
          AND u.team_id IN (?)
      `,
      [today, currentTime, cutoffTime, teamIds]
    );

    const absentEmployeeIds = absentEmployees.map((emp) => emp.user_id);
    const absentEmployeeIdsCondition = absentEmployeeIds.length > 0 ? `AND id NOT IN (?)` : "";

    // Fetch present employees
    const [presentEmployees] = await db.query(
      `
        SELECT id, 
               COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS full_name
        FROM users
        WHERE team_id IN (?)
        ${absentEmployeeIdsCondition}
      `,
      absentEmployeeIds.length > 0 ? [teamIds, absentEmployeeIds] : [teamIds]
    );

    // Combine attendance data
    const attendanceList = [
      ...absentEmployees,
      ...presentEmployees.map((emp) => ({
        employee_id: emp.id,
        employee_name: emp.full_name,
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
      const nameParts = employee.employee_name.split(" ");
      let initials = "";
      if (nameParts.length > 1) {
        initials = nameParts[0][0].toUpperCase() + nameParts[1][0].toUpperCase();
      } else {
        initials = nameParts[0].slice(0, 2).toUpperCase();
      }
      return {
        ...employee,
        initials,
      };
    });

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
      return res.status(400).json({ message: "user_id is required" });
    }

    // Fetch team IDs
    const [teamResult] = await db.query(
      "SELECT id FROM teams WHERE reporting_user_id = ?",
      [user_id]
    );

    if (teamResult.length === 0) {
      return res.status(404).json({ message: "No teams found for the given user_id" });
    }

    const teamIds = teamResult.map((team) => team.id);

    // Fetch team members with concatenated full name
    const [teamMembers] = await db.query(
      `SELECT id, COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS full_name 
       FROM users WHERE team_id IN (?)`,
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
      const nameParts = member.full_name.split(' ');
      const initials =
        nameParts.length > 1
          ? nameParts[0][0].toUpperCase() + nameParts[1][0].toUpperCase()
          : nameParts[0].slice(0, 2).toUpperCase();

      const ratingRecord = ratingsMap.get(member.id) || { rating: 0, average: 0 };

      return {
        employee_name: member.full_name,
        employee_id: member.id,
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
      const { user_id } = req.query;
  
      if (!user_id) {
        return res.status(400).json({ message: 'user_id is required' });
      }
  
      // Fetch team IDs
      const [teamResult] = await db.query("SELECT id FROM teams WHERE reporting_user_id = ?", [user_id]);
      if (teamResult.length === 0) {
        return res.status(404).json({ message: 'No teams found for the given user_id' });
      }
      const teamIds = teamResult.map(team => team.id);
  
      // Fetch all products
      const productsQuery = "SELECT * FROM products";
      const [products] = await db.query(productsQuery);
  
      const result = await Promise.all(
        products.map(async (product) => {
          // Fetch tasks associated with the product and team
          const tasksQuery = `
            SELECT * FROM tasks 
            WHERE product_id = ? AND team_id IN (?)
          `;
          const [tasks] = await db.query(tasksQuery, [product.id, teamIds]);
  
          let totalItems = 0;
          let completedItems = 0;
          let workingEmployees = new Set();
  
          for (const task of tasks) {
            // Fetch subtasks associated with the task
            const subtasksQuery = `
              SELECT * FROM sub_tasks 
              WHERE task_id = ? AND team_id IN (?)
            `;
            const [subtasks] = await db.query(subtasksQuery, [task.id, teamIds]);
  
            if (subtasks.length > 0) {
              totalItems += subtasks.length;
              completedItems += subtasks.filter(subtask => subtask.status === 3).length;
  
              subtasks.forEach(subtask => {
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
  
          // Fetch employee details for working employees
          let employeeList = [];
          if (workingEmployees.size > 0) {
            const employeeDetailsQuery = `
              SELECT id, 
                     COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS full_name 
              FROM users 
              WHERE id IN (?) AND team_id IN (?)
            `;
            const [employees] = await db.query(employeeDetailsQuery, [Array.from(workingEmployees), teamIds]);
  
            employeeList = employees.map(user => {
              const words = user.full_name ? user.full_name.split(" ") : [];
              const initials =
                words.length > 1
                  ? words.map(word => word[0].toUpperCase()).join("")
                  : (words[0] || "").slice(0, 2).toUpperCase();
  
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
      return res.status(400).json({ message: 'user_id is required' });
    }

    // Fetch team IDs
    const [teamResult] = await db.query("SELECT id FROM teams WHERE reporting_user_id = ?", [user_id]);
    if (teamResult.length === 0) {
      return res.status(404).json({ message: 'No teams found for the given user_id' });
    }
    const teamIds = teamResult.map(team => team.id);

    // Get the current date and handle employee leave logic
    const today = new Date().toISOString().split('T')[0]; // Current date in YYYY-MM-DD format
    const [absentEmployees] = await db.query(`
      SELECT user_id 
      FROM employee_leave 
      WHERE date = ? AND user_id IN (SELECT id FROM users WHERE team_id IN (?))
    `, [today, teamIds]);

    const absentEmployeeIds = absentEmployees.map(emp => emp.user_id);

    // If there are no absent employees, set absentEmployeeIds to a value that does not affect the query
    const absentEmployeeCondition = absentEmployeeIds.length > 0 ? `AND id NOT IN (?)` : '';

    // Calculate total users (not absent)
    const [totalUsers] = await db.query(`
      SELECT COUNT(*) as total_count 
      FROM users 
      WHERE team_id IN (?) ${absentEmployeeCondition}
    `, absentEmployeeIds.length > 0 ? [teamIds, absentEmployeeIds] : [teamIds]);

    const totalCount = totalUsers[0].total_count;

    let allocatedCount = 0;
    let employeeDetails = [];

    const allocatedEmployees = new Set();

    // Step 1: Get all tasks with subtasks
    const [tasks] = await db.query(`
      SELECT id, user_id
      FROM tasks
      WHERE team_id IN (?) ${absentEmployeeCondition} AND status != 3
    `, absentEmployeeIds.length > 0 ? [teamIds, absentEmployeeIds] : [teamIds]);

    const taskIds = tasks.map(task => task.id);

    // Step 2: Get subtasks for the tasks
    const [subtasks] = await db.query(`
      SELECT task_id, user_id
      FROM sub_tasks
      WHERE task_id IN (?) AND status != 3
    `, [taskIds]);

    const allocatedTaskUsers = new Set();

    // Step 3: Add users from subtasks first
    subtasks.forEach(subtask => {
      allocatedTaskUsers.add(subtask.user_id);
    });

    // Step 4: If no subtasks, add users from the task itself
    tasks.forEach(task => {
      if (!allocatedTaskUsers.has(task.user_id)) {
        allocatedTaskUsers.add(task.user_id);
      }
    });

    // Step 5: Get details of allocated users
    if (allocatedTaskUsers.size > 0) {
      const [allocatedEmployeeDetailsData] = await db.query(`
        SELECT id, 
               COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS employee_name
        FROM users 
        WHERE id IN (?) AND team_id IN (?)
      `, [Array.from(allocatedTaskUsers), teamIds]);

      allocatedEmployeeDetailsData.forEach(user => {
        employeeDetails.push({
          employee_name: user.employee_name,
          status: 'Allocated', // These employees are allocated tasks/subtasks
        });
      });
    }

    // Step 6: Get all users in the team (excluding absentees) and check for non-allocated employees
    const [allEmployeesData] = await db.query(`
      SELECT id, 
             COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS employee_name
      FROM users 
      WHERE team_id IN (?) ${absentEmployeeCondition}
    `, absentEmployeeIds.length > 0 ? [teamIds, absentEmployeeIds] : [teamIds]);

    // Add non-allocated employees
    allEmployeesData.forEach(user => {
      if (!allocatedTaskUsers.has(user.id)) {
        employeeDetails.push({
          employee_name: user.employee_name,
          status: 'Not Allocated', // These employees are not allocated any tasks
        });
      }
    });

    // Calculate percentages
    allocatedCount = employeeDetails.filter(emp => emp.status === 'Allocated').length;
    const nonAllocatedCount = totalCount - allocatedCount;
    const allocatedPercentage = totalCount > 0 ? Math.round((allocatedCount / totalCount) * 100) : 0;
    const nonAllocatedPercentage = 100 - allocatedPercentage;

    const allottedData = {
      total: totalCount,
      Allocated: allocatedCount,
      nonAllocated: nonAllocatedCount,
      AllocatedPercentage: allocatedPercentage,
      notAllocatedPercentage: nonAllocatedPercentage
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
    return errorResponse(res, error.message, "Error fetching resource allocation data", 500);
  }
};

exports.fetchTLdatas = async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ message: "user_id is required" });
    }

    // Fetch team IDs for the reporting user
    const [teamResult] = await db.query("SELECT id FROM teams WHERE reporting_user_id = ?", [user_id]);

    if (teamResult.length === 0) {
      return res.status(404).json({ message: "No teams found for the given user_id" });
    }

    const teamIds = teamResult.map((team) => team.id);

    // ========================= Fetch Attendance ========================
    const currentTime = new Date();
    const cutoffTime = new Date();
    cutoffTime.setHours(13, 30, 0, 0); // 1:30 PM cutoff
    const today = new Date().toISOString().split("T")[0];

    // Get total team strength
    const [totalStrengthResult] = await db.query("SELECT COUNT(*) AS total_strength FROM users WHERE team_id IN (?)", [teamIds]);
    const totalStrength = totalStrengthResult[0]?.total_strength || 0;

    // Fetch absent employees
    const [absentEmployees] = await db.query(`
      SELECT e.user_id, 
             COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS full_name, 
             'Absent' AS status
      FROM employee_leave e
      JOIN users u ON e.user_id = u.id
      WHERE DATE(e.date) = ? AND (
        e.day_type = 1
        OR (e.day_type = 2 AND e.half_type = 1 AND ? < ?)
      ) AND u.team_id IN (?)
    `, [today, currentTime, cutoffTime, teamIds]);

    const absentEmployeeIds = absentEmployees.map((emp) => emp.user_id);
    const absentEmployeeIdsCondition = absentEmployeeIds.length > 0 ? `AND id NOT IN (?)` : "";

    // Fetch present employees
    const [presentEmployees] = await db.query(`
      SELECT id, COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS full_name
      FROM users WHERE team_id IN (?) ${absentEmployeeIdsCondition}
    `, absentEmployeeIds.length > 0 ? [teamIds, absentEmployeeIds] : [teamIds]);

    // Combine attendance data
    const attendanceList = [
      ...absentEmployees,
      ...presentEmployees.map((emp) => ({
        employee_id: emp.id,
        employee_name: emp.full_name,
        status: "Present",
      })),
    ];

    const totalAbsentEmployees = absentEmployees.length;
    const totalPresentEmployees = presentEmployees.length;
    const presentPercentage = totalStrength ? Math.round((totalPresentEmployees / totalStrength) * 100) : 0;
    const absentPercentage = totalStrength ? Math.round((totalAbsentEmployees / totalStrength) * 100) : 0;

    // Add initials for each employee
    const attendanceWithInitials = attendanceList.map((employee) => {
      const nameParts = employee.employee_name.split(" ");
      let initials = "";
      if (nameParts.length > 1) {
        initials = nameParts[0][0].toUpperCase() + nameParts[1][0].toUpperCase();
      } else {
        initials = nameParts[0].slice(0, 2).toUpperCase();
      }
      return { ...employee, initials };
    });

    // ========================= Fetch Team Ratings ========================
    const currentMonth = new Date().toISOString().slice(0, 7); // Format YYYY-MM
    const [teamMembers] = await db.query(`
      SELECT id, COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS full_name
      FROM users WHERE team_id IN (?)
    `, [teamIds]);

    const [ratingsResult] = await db.query(
      "SELECT user_id, rating, average FROM ratings WHERE user_id IN (?) AND month = ?",
      [teamMembers.map((member) => member.id), currentMonth]
    );

    const ratingsMap = new Map();
    ratingsResult.forEach((rating) => {
      ratingsMap.set(rating.user_id, rating);
    });

    const finalRatingResult = teamMembers.map((member) => {
      const nameParts = member.full_name.split(' ');
      const initials = nameParts.length > 1
        ? nameParts[0][0].toUpperCase() + nameParts[1][0].toUpperCase()
        : nameParts[0].slice(0, 2).toUpperCase();

      const ratingRecord = ratingsMap.get(member.id) || { rating: 0, average: 0 };
      return {
        employee_name: member.full_name,
        employee_id: member.id,
        initials,
        rating_value: ratingRecord.rating,
        average_value: ratingRecord.average,
      };
    });

    // ========================= Fetch Products ========================
    const [products] = await db.query("SELECT * FROM products");
    const productResults = await Promise.all(products.map(async (product) => {
      const [tasks] = await db.query(`
        SELECT * FROM tasks WHERE product_id = ? AND team_id IN (?)
      `, [product.id, teamIds]);

      let totalItems = 0;
      let completedItems = 0;
      let workingEmployees = new Set();

      for (const task of tasks) {
        const [subtasks] = await db.query(`
          SELECT * FROM sub_tasks WHERE task_id = ? AND team_id IN (?)
        `, [task.id, teamIds]);

        if (subtasks.length > 0) {
          totalItems += subtasks.length;
          completedItems += subtasks.filter(subtask => subtask.status === 3).length;
          subtasks.forEach(subtask => {
            if (subtask.user_id) workingEmployees.add(subtask.user_id);
          });
        } else {
          totalItems += 1;
          if (task.status === 3) completedItems += 1;
          if (task.user_id) workingEmployees.add(task.user_id);
        }
      }

      const completionPercentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

      let employeeList = [];
      if (workingEmployees.size > 0) {
        const [employees] = await db.query(`
          SELECT id, COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS full_name
          FROM users WHERE id IN (?) AND team_id IN (?)
        `, [Array.from(workingEmployees), teamIds]);

        employeeList = employees.map(user => {
          const words = user.full_name ? user.full_name.split(" ") : [];
          const initials = words.length > 1 ? words.map(word => word[0].toUpperCase()).join("") : (words[0] || "").slice(0, 2).toUpperCase();
          return { employee_name: user.full_name || "N/A", employee_id: user.id || "N/A", initials };
        });
      }

      return {
        product_id: product.id,
        product_name: product.name,
        completed_percentage: completionPercentage,
        employee_count: workingEmployees.size,
        employees: employeeList,
      };
    }));

    // ========================= Fetch Resource Allotment ========================
    const [absentEmployeesForAllocation] = await db.query(`
      SELECT user_id FROM employee_leave WHERE date = ? AND user_id IN (SELECT id FROM users WHERE team_id IN (?))
    `, [today, teamIds]);

    const absentEmployeeIdsForAllocation = absentEmployeesForAllocation.map((emp) => emp.user_id);
    const absentEmployeeConditionForAllocation = absentEmployeeIdsForAllocation.length > 0 ? `AND id NOT IN (?)` : "";

    const [totalUsersData] = await db.query(`
      SELECT COUNT(*) as total_count FROM users WHERE team_id IN (?) ${absentEmployeeConditionForAllocation}
    `, absentEmployeeIdsForAllocation.length > 0 ? [teamIds, absentEmployeeIdsForAllocation] : [teamIds]);

    const totalCountForAllocation = totalUsersData[0].total_count;
    let allocatedCountForAllocation = 0;
    const allocatedTaskUsers = new Set();

    const [tasksForAllocation] = await db.query(`
      SELECT id, user_id FROM tasks WHERE team_id IN (?) ${absentEmployeeConditionForAllocation} AND status != 3
    `, absentEmployeeIdsForAllocation.length > 0 ? [teamIds, absentEmployeeIdsForAllocation] : [teamIds]);

    const taskIdsForAllocation = tasksForAllocation.map((task) => task.id);

    const [subtasksForAllocation] = await db.query(`
      SELECT task_id, user_id FROM sub_tasks WHERE task_id IN (?) AND status != 3
    `, [taskIdsForAllocation]);

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
      const [allocatedEmployeeDetails] = await db.query(`
        SELECT id, COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS employee_name
        FROM users WHERE id IN (?) AND team_id IN (?)
      `, [Array.from(allocatedTaskUsers), teamIds]);

      allocatedEmployeeDetails.forEach(user => {
        employeeDetailsForAllocation.push({
          employee_name: user.employee_name,
          status: 'Allocated',
        });
      });
    }

    const [allEmployeesForAllocation] = await db.query(`
      SELECT id, COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS employee_name
      FROM users WHERE team_id IN (?) ${absentEmployeeConditionForAllocation}
    `, absentEmployeeIdsForAllocation.length > 0 ? [teamIds, absentEmployeeIdsForAllocation] : [teamIds]);

    allEmployeesForAllocation.forEach(user => {
      if (!allocatedTaskUsers.has(user.id)) {
        employeeDetailsForAllocation.push({
          employee_name: user.employee_name,
          status: 'Not Allocated',
        });
      }
    });

    allocatedCountForAllocation = employeeDetailsForAllocation.filter(emp => emp.status === 'Allocated').length;
    const nonAllocatedCount = totalCountForAllocation - allocatedCountForAllocation;
    const allocatedPercentage = totalCountForAllocation > 0 ? Math.round((allocatedCountForAllocation / totalCountForAllocation) * 100) : 0;
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













  
  
  
  
  
  
  
  
  
  
  
  