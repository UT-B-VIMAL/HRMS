const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
  getPagination,
} = require("../../helpers/responseHelper");
const { uploadexpenseFileToS3, deleteFileFromS3  } = require('../../config/s3');


// Insert Expense
exports.createexpense = async (req, res) => {
  const { date, category, amount, project_id, user_id, description, created_by } = req.body;
  try {
    const projectQuery = `
        SELECT product_id 
        FROM projects 
        WHERE deleted_at IS NULL AND id = ?
      `;
    const [projectResult] = await db.query(projectQuery, [project_id]);

    if (projectResult.length === 0) {
      return errorResponse(
        res,
        "Project not found or deleted",
        "Error creating OT",
        404
      );
    }
    const { product_id } = projectResult[0];

    const productQuery = `
        SELECT id 
        FROM products 
        WHERE deleted_at IS NULL AND id = ?
      `;
    const [productResult] = await db.query(productQuery, [product_id]);

    if (productResult.length === 0) {
      return errorResponse(
        res,
        "Product not found or deleted",
        "Error creating OT",
        404
      );
    }

    const userQuery = `
        SELECT id,team_id 
        FROM users 
        WHERE deleted_at IS NULL AND id = ?
      `;
    const [userResult] = await db.query(userQuery, [user_id]);
    const { team_id } = userResult[0];

    if (userResult.length === 0) {
      return errorResponse(
        res,
        "User not found or deleted",
        "Error creating OT",
        404
      );
    }

    let fileUrl = null;
      if (req.files && req.files.file) {
              const file = req.files.file;
              const fileBuffer = file.data;  
              const originalFileName = file.name;
              const uniqueFileName = `${Date.now()}_${originalFileName}`;  
             fileUrl = await uploadexpenseFileToS3(fileBuffer, uniqueFileName);
            }

    const insertQuery = `
        INSERT INTO expense_details (
          user_id, category, product_id, project_id, team_id, description, expense_amount, date, file, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;
    const values = [
      user_id,
      category,
      product_id,
      project_id,
      team_id,
      description,
      amount,
      date,
      fileUrl,
      created_by,
      created_by,
    ];

    const [result] = await db.query(insertQuery, values);
    const selectQuery = `
      SELECT status 
      FROM expense_details 
      WHERE id = ?
    `;
    const [statusResult] = await db.query(selectQuery, [result.insertId]);

    const status = statusResult.length > 0 ? statusResult[0].status : 0;

    // Return success response
    return successResponse(
      res,
      {
        id: result.insertId,
        project_id,
        product_id,
        status,
        user_id,
        created_by,
      },
      "Expense detail added successfully",
      201
    );
  } catch (error) {
    console.error("Error inserting Expense detail:", error.message);
    return errorResponse(res, error.message, "Error inserting Expense detail", 500);
  }
};
// Show Expense
exports.getexpense = async (id, res) => {
  try {
    const expensedetailQuery = `
        SELECT 
          id, 
          DATE_FORMAT(date, '%Y-%m-%d') AS date,
          description, 
          product_id, 
          project_id,
          user_id,
          status,
          tl_status,
          pm_status,
          file
        FROM 
          expense_details
        WHERE 
          id = ?
          AND deleted_at IS NULL;
      `;
    const [expensedetail] = await db.query(expensedetailQuery, [id]);

    if (!expensedetail || expensedetail.length === 0) {
      return errorResponse(
        res,
        "Expense detail not found",
        "Error retrieving Expense detail",
        404
      );
    }

    const result = expensedetail[0];

    return successResponse(
      res,
      result,
      "Expense detail retrieved successfully",
      200
    );
  } catch (error) {
    return errorResponse(res, error.message, "Error retrieving expense detail", 500);
  }
};
// Show All Expense
exports.getAllexpense = async (req, res) => {
  try {
    const { user_id, status, search, page = 1, perPage = 10, project_id } = req.query;

    if (!user_id) {
      return errorResponse(
        res,
        "user_id is required",
        "Error fetching expense details",
        400
      );
    }
    if (!status) {
      return errorResponse(
        res,
        "status is required",
        "Error fetching expense details",
        400
      );
    }

    // Validate user existence
    const [userCheck] = await db.query(
      "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
      [user_id]
    );
    if (userCheck.length === 0) {
      return errorResponse(
        res,
        "User not found or deleted",
        "Error fetching expense details",
        404
      );
    }

    const offset = (page - 1) * perPage;

    // Query filters
    const expenseConditions = [];
    const expenseValues = [];

    if (project_id) {
      const projectIds = project_id.split(",");
      expenseConditions.push(`et.project_id IN (?)`);
      expenseValues.push(projectIds);
    }
    if (user_id) {
      expenseConditions.push("et.user_id = ?");
      expenseValues.push(user_id);
    }
    if (search) {
      const searchTerm = `%${search}%`;
      expenseConditions.push(
        `(pr.name LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR et.description LIKE ?)`
      );
      expenseValues.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    if (status) {
      const statusArray = status.split(",");
      expenseConditions.push(`et.status IN (?)`);
      expenseValues.push(statusArray);
    }

    const expenseWhereClause =
      expenseConditions.length > 0 ? `WHERE ${expenseConditions.join(" AND ")}` : "";

    // Main query
    const expenseQuery = `
      SELECT 
        pr.name AS project_name,
        DATE_FORMAT(et.date, '%Y-%m-%d') AS date,
        et.expense_amount,
        et.description,
        et.status,
        et.tl_status,
        et.pm_status,
        et.id AS expense_id,
        et.user_id,
        et.file,
        u.first_name AS user_first_name,
        u.last_name AS user_last_name
      FROM 
        expense_details et
      LEFT JOIN 
        projects pr ON pr.id = et.project_id
      LEFT JOIN 
        users u ON u.id = et.user_id
      ${expenseWhereClause}
      ORDER BY 
        et.id
      LIMIT ?, ?
    `;

    expenseValues.push(offset, parseInt(perPage));

    const [expenses] = await db.query(expenseQuery, expenseValues);

    // Pagination
    const countQuery = `
      SELECT COUNT(*) AS total 
      FROM expense_details et
      LEFT JOIN projects pr ON pr.id = et.project_id
      LEFT JOIN users u ON u.id = et.user_id
      ${expenseWhereClause}
    `;
    const [totalRecordsResult] = await db.query(countQuery, expenseValues.slice(0, -2));
    const totalRecords = totalRecordsResult[0]?.total || 0;

    const pagination = getPagination(page, perPage, totalRecords);

    // Format response data
    const data = expenses.map((row, index) => ({
      s_no: offset + index + 1,
      id: row.expense_id,
      user_id: row.user_id,
      date: row.date,
      expense_amount: row.expense_amount,
      project_name: row.project_name,
      description: row.description,
      file: row.file,
      status: row.status,
      tl_status: row.tl_status,
      pm_status: row.pm_status,
      user_name: `${row.user_first_name} ${row.user_last_name}`,
    }));

    successResponse(
      res,
      data,
      data.length === 0
        ? "No expense details found"
        : "Expense details retrieved successfully",
      200,
      pagination
    );
  } catch (error) {
    console.error("Error fetching expense details:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};

// Update Expense
exports.updateexpenses = async (id, req, res) => {
  const { date, category, amount, project_id, user_id, description, updated_by } = req.body;

  try {
    const expenseQuery = `
      SELECT id 
      FROM expense_details 
      WHERE deleted_at IS NULL AND id = ?
    `;
    const [expenseResult] = await db.query(expenseQuery, [id]);

    if (expenseResult.length === 0) {
      return errorResponse(
        res,
        "Expense record not found or deleted",
        "Error updating expense details",
        404
      );
    }

    // Fetch project details
    const projectQuery = `
      SELECT product_id 
      FROM projects 
      WHERE deleted_at IS NULL AND id = ?
    `;
    const [projectResult] = await db.query(projectQuery, [project_id]);

    if (projectResult.length === 0) {
      return errorResponse(
        res,
        "Project not found or deleted",
        "Error updating expense details",
        404
      );
    }
    const { product_id } = projectResult[0];

    // Fetch product details
    const productQuery = `
      SELECT id 
      FROM products 
      WHERE deleted_at IS NULL AND id = ?
    `;
    const [productResult] = await db.query(productQuery, [product_id]);

    if (productResult.length === 0) {
      return errorResponse(
        res,
        "Product not found or deleted",
        "Error updating expense details",
        404
      );
    }

    // Fetch user details
    const userQuery = `
      SELECT id, team_id 
      FROM users 
      WHERE deleted_at IS NULL AND id = ?
    `;
    const [userResult] = await db.query(userQuery, [user_id]);

    if (userResult.length === 0) {
      return errorResponse(
        res,
        "User not found or deleted",
        "Error updating expense details",
        404
      );
    }

    const { team_id } = userResult[0];

    // Handle file upload if present
    let fileUrl = null;
    if (req.files && req.files.file) {
      const file = req.files.file;
      const fileBuffer = file.data;
      const originalFileName = file.name;
      const uniqueFileName = `${Date.now()}_${originalFileName}`;
      fileUrl = await uploadexpenseFileToS3(fileBuffer, uniqueFileName);
    }

    // Construct the update query
    const updateQuery = `
      UPDATE expense_details 
      SET 
        user_id = ?, 
        category = ?, 
        product_id = ?, 
        project_id = ?, 
        team_id = ?, 
        description = ?, 
        expense_amount = ?, 
        date = ?, 
        file = ?, 
        updated_by = ?, 
        updated_at = NOW() 
      WHERE id = ? AND deleted_at IS NULL
    `;

    const values = [
      user_id,
      category,
      product_id,
      project_id,
      team_id,
      description,
      amount,
      date,
      fileUrl,
      updated_by,
      id,
    ];

    // Execute the update query
    const [result] = await db.query(updateQuery, values);

    // Check if any rows were updated
    if (result.affectedRows === 0) {
      return errorResponse(
        res,
        "Failed to update expense details",
        "Error updating expense details",
        400
      );
    }

    // Return success response
    return successResponse(
      res,
      {
        id,
        project_id,
        product_id,
        user_id,
        updated_by,
      },
      "Expense detail updated successfully",
      200
    );
  } catch (error) {
    console.error("Error updating expense detail:", error.message);
    return errorResponse(res, error.message, "Error updating expense detail", 500);
  }
};

// Delete Expense
exports.deleteExpense = async (id, res) => {
  try {
    // Check if the expense record exists and retrieve the file key
    const checkQuery = `
      SELECT id, file 
      FROM expense_details 
      WHERE id = ? AND deleted_at IS NULL
    `;
    const [existingExpense] = await db.query(checkQuery, [id]);

    if (existingExpense.length === 0) {
      return errorResponse(
        res,
        null,
        "Expense detail not found or already deleted",
        404
      );
    }

    const fileUrl = existingExpense[0].file;

    // Delete the file from the S3 bucket if it exists
    if (fileUrl) {
      await deleteFileFromS3(fileUrl);
    }

    // Soft delete the expense record
    const updateQuery = `
      UPDATE expense_details 
      SET deleted_at = NOW() 
      WHERE id = ? AND deleted_at IS NULL
    `;
    const [result] = await db.query(updateQuery, [id]);

    if (result.affectedRows === 0) {
      return errorResponse(
        res,
        null,
        "Expense detail not found or already deleted",
        204
      );
    }

    return successResponse(res, null, "Expense detail deleted successfully");
  } catch (error) {
    console.error("Error deleting expense detail:", error.message);
    return errorResponse(res, error.message, "Error deleting Expense detail", 500);
  }
};

// PM Employee Expense Details
exports.getAllpmemployeeOts = async (req, res) => {
  try {
    const {
      team_id,
      start_date,
      end_date,
      status,
      search,
      page = 1,
      perPage = 10,
    } = req.query;

    // Ensure status is provided
    if (!status) {
      return errorResponse(
        res,
        "status is required",
        "Error fetching OT details",
        400
      );
    }

    const offset = (page - 1) * perPage;

    const otConditions = [];
    const otValues = [];

    if (team_id) {
      const teamIds = team_id.split(",");
      if (teamIds.length > 0) {
        otConditions.push("ot.team_id IN (?)");
        otValues.push(teamIds);
      }
    }
    // Handle date filters
    if (start_date && end_date) {
      const startDate = new Date(start_date);
      const endDate = new Date(end_date);

      if (endDate < startDate) {
        return errorResponse(
          res,
          "End date cannot be earlier than start date.",
          "Error fetching OT details",
          400
        );
      }
      // Both dates are provided; filter by range
      otConditions.push("DATE(ot.date) BETWEEN ? AND ?");
      otValues.push(start_date, end_date);
    } else if (start_date) {
      // Only start_date is provided; fetch data from start_date onward
      otConditions.push("DATE(ot.date) >= ?");
      otValues.push(start_date);
    } else if (end_date) {
      // Only end_date is provided; fetch all data up to and including end_date
      otConditions.push("DATE(ot.date) <= ?");
      otValues.push(end_date);
    }

    // Handle search term
    if (search) {
      const searchTerm = `%${search}%`;
      otConditions.push(
        `(t.name LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR pr.name LIKE ? OR ot.comments LIKE ?)`
      );
      otValues.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Handle status conditions based on the provided status
    if (status) {
      if (status.includes(",")) {
        return errorResponse(
          res,
          "Only a single status value is allowed.",
          "Error fetching OT details",
          400
        );
      }

      switch (status) {
        case "0":
          // All statuses must be 0
          otConditions.push("ot.tl_status != 0 AND ot.pm_status = 0");
          break;

        case "1":
          // ot.status must be 1, and at least one of tl_status or pm_status must be 1
          otConditions.push(
            "AND (ot.tl_status = 1 OR ot.pm_status = 1)"
          );
          break;

        case "2":
          // All statuses must be 2
          otConditions.push("ot.pm_status = 2 AND (ot.tl_status = 2 OR ot.status = 2)");
          break;

        default:
          return errorResponse(
            res,
            "Invalid status value.",
            "Error fetching OT details",
            400
          );
      }
    }

    // Combine all conditions into a WHERE clause
    const otWhereClause =
      otConditions.length > 0 ? `WHERE ${otConditions.join(" AND ")}` : "";

    // Prepare the query to fetch OT details
    const otQuery = `
        SELECT 
          pr.name AS project_name,
          t.name AS task_name,
          DATE_FORMAT(ot.date, '%Y-%m-%d') AS date,
          ot.time AS employee_time,
          ot.comments,
          ot.status,
          ot.tl_status,
          ot.pm_status,
          ot.tledited_time AS tl_time,
          ot.pmedited_time AS pm_time,
          ot.id AS ot_id,
          ot.user_id,
          u.first_name AS user_first_name,
          u.last_name AS user_last_name,
          u.employee_id,
          d.name AS designation
        FROM 
          ot_details ot
        LEFT JOIN 
          tasks t ON t.id = ot.task_id
        LEFT JOIN 
          projects pr ON pr.id = ot.project_id
        LEFT JOIN 
          users u ON u.id = ot.user_id
        LEFT JOIN 
          designations d ON d.id = u.designation_id
        ${otWhereClause}
        ORDER BY 
          ot.id
      `;

    // Execute the query
    const [ots] = await db.query(otQuery, otValues);

    // Pagination logic
    const totalRecords = ots.length;
    const paginatedData = ots.slice(offset, offset + parseInt(perPage));
    const pagination = getPagination(page, perPage, totalRecords);

    // Group the data by user_id and calculate pending counts for status 0
    const data = Object.values(
      paginatedData.reduce((acc, row, index) => {
        const userId = row.user_id;

        // Initialize user group if not already present
        if (!acc[userId]) {
          if (row.status === 0) {
            acc[userId] = {
              employee_name: `${row.user_first_name} ${row.user_last_name}`,
              employee_id: row.employee_id,
              designation: row.designation,
              pending_counts: 0,
              details: [],
            };
          } else {
            acc[userId] = {
              employee_name: `${row.user_first_name} ${row.user_last_name}`,
              employee_id: row.employee_id,
              designation: row.designation,
              details: [],
            };
          }
        }

        // Increment pending count if status is 0
        if (row.status === 0) {
          acc[userId].pending_counts += 1;
        }

        // Add individual OT details
        acc[userId].details.push({
          s_no: offset + index + 1,
          id: row.ot_id,
          user_id: row.user_id,
          date: row.date,
          employee_time: row.employee_time || "00:00:00",
          tl_time: row.tl_time || "00:00:00",
          pm_time: row.pm_time || "00:00:00",
          project_name: row.project_name,
          task_name: row.task_name,
          comments: row.comments,
          status: row.status,
          tlstatus: row.tl_status,
          pmstatus: row.pm_status,
        });

        return acc;
      }, {})
    );
    const totalPendingCounts = Object.values(data).reduce((sum, user) => sum + user.pending_counts, 0);

    // Format the data for the response
    const formattedData = data.map((group) => ({
      employee_name: group.employee_name,
      employee_id: group.employee_id,
      designation: group.designation,
      pending_counts: group.pending_counts,
      details: group.details,
    }));

    // Send success response with formatted data and pagination
    successResponse(
      res,
      formattedData,
      formattedData.length === 0
        ? "No OT details found"
        : "OT details retrieved successfully",
      200,
      pagination,
      totalPendingCounts  // Include the totalPendingCounts in the response
    );
  } catch (error) {
    console.error("Error fetching OT details:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};

// Approve or reject
exports.approve_reject_OT = async (payload, res) => {
  const { user_id, status, updated_by, role } = payload;

  try {
    // Validate required fields
    if (!status) {
      return errorResponse(
        res,
        "Status is required",
        "Error updating OT details",
        400
      );
    }
    if (!role) {
      return errorResponse(
        res,
        "Role is required",
        "Error updating OT details",
        400
      );
    }
    if (!updated_by) {
      return errorResponse(
        res,
        "Updated_by is required",
        "Error updating OT details",
        400
      );
    }

    // Verify the user exists
    const userQuery = `
      SELECT id FROM users 
      WHERE deleted_at IS NULL AND id = ?
    `;
    const [userResult] = await db.query(userQuery, [user_id]);

    if (userResult.length === 0) {
      return errorResponse(
        res,
        "User not found or deleted",
        "Error fetching OT details",
        404
      );
    }

    // Verify the updating user exists
    const updatedByQuery = `
      SELECT id FROM users 
      WHERE deleted_at IS NULL AND id = ?
    `;
    const [updatedByResult] = await db.query(updatedByQuery, [updated_by]);

    if (updatedByResult.length === 0) {
      return errorResponse(
        res,
        "Updated_by user not found or deleted",
        "Error fetching OT details",
        404
      );
    }

    // Build the update query based on role
    let updateQuery = `
      UPDATE ot_details
      SET status = ?, updated_by = ?, updated_at = NOW(),`;

    if (role === "tl") {
      updateQuery += ` tl_status = ? `;
      updateQuery += ` WHERE user_id = ? AND status = 0 AND deleted_at IS NULL`;
    } else if (role === "pm") {
      updateQuery += ` pm_status = ? `;
      updateQuery += ` WHERE user_id = ? AND tl_status != 0 AND deleted_at IS NULL`;
    } else {
      return errorResponse(res, "Invalid role", "Error updating OT details", 400);
    }

    const values = [status, updated_by, status, user_id];

    // Execute the query
    const [result] = await db.query(updateQuery, values);

    // Check if any records were updated
    if (result.affectedRows === 0) {
      return errorResponse(
        res,
        "No OT records found with status 0 for this user",
        "Error updating OT status",
        400
      );
    }

    // Return success response
    return successResponse(
      res,
      status === 2
        ? "OT Approved successfully"
        : "OT Rejected successfully",
      200
    );
  } catch (error) {
    console.error("Error approving or rejecting OT details:", error.message);
    return errorResponse(res, error.message, "Error updating OT details", 500);
  }
};


// TL Employee Expense Details
exports.getAlltlemployeeOts = async (req, res) => {
  try {
    const {
      user_id,
      start_date,
      end_date,
      status,
      search,
      page = 1,
      perPage = 10,
    } = req.query;


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
    // Ensure status is provided
    if (!status) {
      return errorResponse(
        res,
        "status is required",
        "Error fetching OT details",
        400
      );
    }

    const offset = (page - 1) * perPage;

    const otConditions = [];
    const otValues = [];


    otConditions.push(`ot.team_id IN (?)`);
    otValues.push(teamIds);


    // Handle date filters
    if (start_date && end_date) {
      const startDate = new Date(start_date);
      const endDate = new Date(end_date);

      if (endDate < startDate) {
        return errorResponse(
          res,
          "End date cannot be earlier than start date.",
          "Error fetching OT details",
          400
        );
      }
      // Both dates are provided; filter by range
      otConditions.push("DATE(ot.date) BETWEEN ? AND ?");
      otValues.push(start_date, end_date);
    } else if (start_date) {
      // Only start_date is provided; fetch data from start_date onward
      otConditions.push("DATE(ot.date) >= ?");
      otValues.push(start_date);
    } else if (end_date) {
      // Only end_date is provided; fetch all data up to and including end_date
      otConditions.push("DATE(ot.date) <= ?");
      otValues.push(end_date);
    }

    // Handle search term
    if (search) {
      const searchTerm = `%${search}%`;
      otConditions.push(
        `(t.name LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR pr.name LIKE ? OR ot.comments LIKE ?)`
      );
      otValues.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Handle status conditions based on the provided status
    if (status) {
      if (status.includes(",")) {
        return errorResponse(
          res,
          "Only a single status value is allowed.",
          "Error fetching OT details",
          400
        );
      }

      switch (status) {
        case "0":
          // All statuses must be 0
          otConditions.push("ot.status = 0 AND ot.tl_status = 0");
          break;

        case "1":
          // ot.status must be 1, and at least one of tl_status or pm_status must be 1
          otConditions.push(
            "ot.tl_status = 1 OR ot.pm_status = 1"
          );
          break;

        case "2":
          // All statuses must be 2
          otConditions.push("ot.tl_status = 2");
          break;

        default:
          return errorResponse(
            res,
            "Invalid status value.",
            "Error fetching OT details",
            400
          );
      }
    }

    // Combine all conditions into a WHERE clause
    const otWhereClause =
      otConditions.length > 0 ? `WHERE ${otConditions.join(" AND ")}` : "";

    // Prepare the query to fetch OT details
    const otQuery = `
        SELECT 
          pr.name AS project_name,
          t.name AS task_name,
          DATE_FORMAT(ot.date, '%Y-%m-%d') AS date,
          ot.time AS employee_time,
          ot.comments,
          ot.status,
          ot.tl_status,
          ot.pm_status,
          ot.tledited_time AS tl_time,
          ot.id AS ot_id,
          ot.user_id,
          u.first_name AS user_first_name,
          u.last_name AS user_last_name,
          u.employee_id,
          d.name AS designation
        FROM 
          ot_details ot
        LEFT JOIN 
          tasks t ON t.id = ot.task_id
        LEFT JOIN 
          projects pr ON pr.id = ot.project_id
        LEFT JOIN 
          users u ON u.id = ot.user_id
        LEFT JOIN 
          designations d ON d.id = u.designation_id
        ${otWhereClause}
        ORDER BY 
          ot.id
      `;

    // Execute the query
    const [ots] = await db.query(otQuery, otValues);

    // Pagination logic
    const totalRecords = ots.length;
    const paginatedData = ots.slice(offset, offset + parseInt(perPage));
    const pagination = getPagination(page, perPage, totalRecords);

    // Group the data by user_id and calculate pending counts for status 0
    const data = Object.values(
      paginatedData.reduce((acc, row, index) => {
        const userId = row.user_id;

        // Initialize user group if not already present
        if (!acc[userId]) {
          if (row.status === 0) {
            acc[userId] = {
              employee_name: `${row.user_first_name} ${row.user_last_name}`,
              employee_id: row.employee_id,
              designation: row.designation,
              pending_counts: 0,
              details: [],
            };
          } else {
            acc[userId] = {
              employee_name: `${row.user_first_name} ${row.user_last_name}`,
              employee_id: row.employee_id,
              designation: row.designation,
              details: [],
            };
          }
        }

        // Increment pending count if status is 0
        if (row.status === 0) {
          acc[userId].pending_counts += 1;
        }

        // Add individual OT details
        acc[userId].details.push({
          s_no: offset + index + 1,
          id: row.ot_id,
          user_id: row.user_id,
          date: row.date,
          employee_time: row.employee_time || "00:00:00",
          tl_time: row.tl_time || "00:00:00",
          project_name: row.project_name,
          task_name: row.task_name,
          comments: row.comments,
          status: row.status,
          tlstatus: row.tl_status,
          pmstatus: row.pm_status,
        });

        return acc;
      }, {})
    );
    const totalPendingCounts = Object.values(data).reduce((sum, user) => sum + user.pending_counts, 0);

    // Format the data for the response
    const formattedData = data.map((group) => ({
      employee_name: group.employee_name,
      employee_id: group.employee_id,
      designation: group.designation,
      pending_counts: group.pending_counts,
      details: group.details,
    }));

    // Send success response with formatted data and pagination
    successResponse(
      res,
      formattedData,
      formattedData.length === 0
        ? "No OT details found"
        : "OT details retrieved successfully",
      200,
      pagination,
      totalPendingCounts  // Include the totalPendingCounts in the response
    );
  } catch (error) {
    console.error("Error fetching OT details:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};

