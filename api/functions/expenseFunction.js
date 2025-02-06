const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
  getPagination,
} = require("../../helpers/responseHelper");
const { uploadexpenseFileToS3, deleteFileFromS3 } = require("../../config/s3");

// Insert Expense
exports.createexpense = async (req, res) => {
  const {
    date,
    category,
    amount,
    project_id,
    user_id,
    description,
    created_by,
  } = req.body;
  const allowedExtensions = ["jpg", "jpeg", "png", "pdf", "doc", "docx"];
  const missingFields = [];
  if (!category) missingFields.push("category");
  if (!date) missingFields.push("date");
  if (!amount) missingFields.push("amount");
  if (!project_id) missingFields.push("project_id");
  if (!user_id) missingFields.push("user_id");
  if (!description) missingFields.push("description");
  if (!req.files?.file) missingFields.push("file");

  // If any field is missing, return an error response
  if (missingFields.length > 0) {
    return errorResponse(
      res,
      `Missing required fields: ${missingFields.join(", ")}`,
      "Validation Error",
      400
    );
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!date.match(dateRegex) || isNaN(Date.parse(date))) {
    return errorResponse(
      res,
      "Invalid date format. Expected format: YYYY-MM-DD",
      "Validation Error",
      400
    );
  }
  let fileUrl = null;
  if (req.files && req.files.file) {
    const file = req.files.file;
    const fileBuffer = file.data;
    const originalFileName = file.name;
    const fileExtension = originalFileName.split(".").pop().toLowerCase();

    // Check if extension is allowed
    if (!allowedExtensions.includes(fileExtension)) {
      return errorResponse(
        res,
        `Invalid file type. Allowed types: ${allowedExtensions.join(", ")}`,
        "Validation Error",
        400
      );
    }
    const uniqueFileName = `${Date.now()}_${originalFileName}`;
    fileUrl = await uploadexpenseFileToS3(fileBuffer, uniqueFileName);
  }

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
    
    if (userResult.length === 0) {
      return errorResponse(
        res,
        "User not found or deleted",
        "Error creating OT",
        404
      );
    }
    const { team_id,role_id } = userResult[0];
    let tl_status = (role_id == 2) ? 2 : 0;

    const insertQuery = `
        INSERT INTO expense_details (
          user_id, category, product_id, project_id, team_id, description, expense_amount, date, file, tl_status, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
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
      tl_status,
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
      200
    );
  } catch (error) {
    console.error("Error inserting Expense detail:", error.message);
    return errorResponse(
      res,
      error.message,
      "Error inserting Expense detail",
      500
    );
  }
};
// Show Expense
exports.getexpense = async (id, res) => {
  try {
    const expensedetailQuery = `
        SELECT 
    ed.id, 
    DATE_FORMAT(ed.date, '%Y-%m-%d') AS date,
    ed.description, 
    ed.product_id, 
    ed.project_id,
    ed.user_id,
    ed.status,
    ed.tl_status,
    ed.pm_status,
    ed.expense_amount,
    ed.category AS categoryID,
    CASE 
        WHEN ed.category = 1 THEN 'food'
        WHEN ed.category = 2 THEN 'travel'
        WHEN ed.category = 3 THEN 'others'
        ELSE 'unknown' 
    END AS category,
    ed.file,
    p.name AS product_name,
    pr.name AS project_name
FROM 
    expense_details ed
JOIN 
    products p ON ed.product_id = p.id
JOIN 
    projects pr ON ed.project_id = pr.id
WHERE 
    ed.id = ? 
    AND ed.deleted_at IS NULL;
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
    return errorResponse(
      res,
      error.message,
      "Error retrieving expense detail",
      500
    );
  }
};
// Show All Expense
exports.getAllexpense = async (req, res) => {
  try {
    const {
      user_id,
      status,
      search,
      page = 1,
      perPage = 10,
      project_id,
    } = req.query;

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
      expenseConditions.length > 0
        ? `WHERE ${expenseConditions.join(" AND ")}`
        : "";

    // Main query
    const expenseQuery = `
      SELECT 
        pr.name AS project_name,
        DATE_FORMAT(et.date, '%Y-%m-%d') AS date,
        et.expense_amount,
        et.description,
        et.category,
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
      AND et.deleted_at IS NULL
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
      AND et.deleted_at IS NULL
    `;
    const [totalRecordsResult] = await db.query(
      countQuery,
      expenseValues.slice(0, -2)
    );
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
      category: row.category,
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
  const {
    date,
    category,
    amount,
    project_id,
    user_id,
    description,
    updated_by,
  } = req.body;

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
    return errorResponse(
      res,
      error.message,
      "Error updating expense detail",
      500
    );
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
    return errorResponse(
      res,
      error.message,
      "Error deleting Expense detail",
      500
    );
  }
};

// PM Employee Expense Details
exports.getAllpmemployeexpense = async (req, res) => {
  try {
    const {
      team_id,
      date,
      status,
      search,
      category,
      page = 1,
      perPage = 10,
    } = req.query;

    // Ensure status is provided
    if (!status) {
      return errorResponse(
        res,
        "status is required",
        "Error fetching Expense details",
        400
      );
    }

    const offset = (page - 1) * perPage;

    const otConditions = [];
    const otValues = [];

    // Filter by team_id
    if (team_id) {
      const teamIds = team_id.split(",");
      otConditions.push("et.team_id IN (?)");
      otValues.push(teamIds);
    }

    // Filter by category
    if (category) {
      const categoryMapping = {
        food: "1",
        travel: "2",
        others: "3",
      };
      const categoryIds = category
        .split(",")
        .map((cat) => categoryMapping[cat.toLowerCase()] || cat);
      otConditions.push("et.category IN (?)");
      otValues.push(categoryIds);
    }

    // Filter by date
    if (date) {
      otConditions.push("DATE(et.date) = ?");
      otValues.push(date);
    }

    // Handle search term
    if (search) {
      const searchTerm = `%${search}%`;
      otConditions.push(
        "(tm.name LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR pr.name LIKE ? OR et.description LIKE ? OR et.expense_amount LIKE ? OR et.category LIKE ?)"
      );
      otValues.push(
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm
      );
    }

    // Handle status conditions
    switch (status) {
      case "0":
        otConditions.push("et.tl_status != 0 AND et.pm_status = 0");
        break;
      case "1":
        otConditions.push(
          "(et.tl_status = 1 OR et.tl_status = 2) AND et.pm_status = 0"
        );
        break;
      case "2":
        otConditions.push(
          "et.pm_status = 2 AND et.tl_status = 2 AND et.status = 2"
        );
        break;
      default:
        return errorResponse(
          res,
          "Invalid status value.",
          "Error fetching Expense details",
          400
        );
    }

    // Combine all conditions into a WHERE clause
    const otWhereClause =
      otConditions.length > 0 ? `WHERE ${otConditions.join(" AND ")}` : "";

    // Prepare the query to fetch expense details
    const otQuery = `
      SELECT 
        pr.name AS project_name,
        DATE_FORMAT(et.date, '%Y-%m-%d') AS date,
        et.description,
        et.expense_amount AS amount,
        et.status,
        et.category,
        et.tl_status,
        et.pm_status,
        et.file,
        et.id AS et_id,
        et.user_id,
        u.first_name AS user_first_name,
        u.last_name AS user_last_name,
        u.employee_id,
        tm.name AS team_name,
        d.name AS designation
      FROM 
        expense_details et
      LEFT JOIN 
        projects pr ON pr.id = et.project_id
      LEFT JOIN 
        users u ON u.id = et.user_id
      LEFT JOIN 
        teams tm ON u.team_id = tm.id
      LEFT JOIN 
        designations d ON d.id = u.designation_id
      ${otWhereClause}
      AND et.deleted_at IS NULL
      ORDER BY 
        et.id
    `;

    // Execute the query
    const [ots] = await db.query(otQuery, otValues);

    // Pagination logic
    const totalRecords = ots.length;
    const paginatedData = ots.slice(offset, offset + parseInt(perPage));
    const pagination = getPagination(page, perPage, totalRecords);

    // Format data for the response
    const formattedData = paginatedData.map((row, index) => ({
      s_no: offset + index + 1,
      id: row.et_id,
      user_id: row.user_id,
      employee_name: `${row.user_first_name} ${row.user_last_name}`,
      employee_id: row.employee_id,
      designation: row.designation,
      date: row.date,
      category: row.category,
      project_name: row.project_name,
      team_name: row.team_name,
      task_name: row.task_name,
      description: row.description,
      amount: row.amount,
      file: row.file,
      status: row.status,
      tlstatus: row.tl_status,
      pmstatus: row.pm_status,
    }));

    // Send success response
    successResponse(
      res,
      formattedData,
      formattedData.length === 0
        ? "No Expense details found"
        : "Expense details retrieved successfully",
      200,
      pagination
    );
  } catch (error) {
    console.error("Error fetching Expense details:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};

// Approve or reject
exports.approve_reject_expense = async (payload, res) => {
  const { id, user_id, status, updated_by, role } = payload;

  try {
    // Validate required fields
    if (!id) {
      return errorResponse(
        res,
        "Expense ID is required",
        "Error updating expense details",
        400
      );
    }
    if (!status) {
      return errorResponse(
        res,
        "Status is required",
        "Error updating expense details",
        400
      );
    }
    if (!role) {
      return errorResponse(
        res,
        "Role is required",
        "Error updating expense details",
        400
      );
    }
    if (!updated_by) {
      return errorResponse(
        res,
        "Updated_by is required",
        "Error updating expense details",
        400
      );
    }

    // Verify the expense exists
    const expenseQuery = `
      SELECT id FROM expense_details 
      WHERE deleted_at IS NULL AND id = ?
    `;
    const [expenseResult] = await db.query(expenseQuery, [id]);

    if (expenseResult.length === 0) {
      return errorResponse(
        res,
        "Expense not found or deleted",
        "Error fetching expense details",
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
        "Error fetching expense details",
        404
      );
    }

    // Build the update query based on role
    let updateQuery = `
      UPDATE expense_details
      SET status = ?, updated_by = ?, updated_at = NOW(),`;

    if (role === "tl") {
      updateQuery += ` tl_status = ? `;
    } else if (role === "pm") {
      updateQuery += ` pm_status = ? `;
    } else {
      return errorResponse(
        res,
        "Invalid role",
        "Error updating expense details",
        400
      );
    }

    updateQuery += ` WHERE id = ? AND deleted_at IS NULL`;

    const values = [status, updated_by, status, id];

    // Execute the query
    const [result] = await db.query(updateQuery, values);

    // Check if any records were updated
    if (result.affectedRows === 0) {
      return errorResponse(
        res,
        "No records updated, ensure the expense record exists and matches the criteria",
        "Error updating expense details",
        400
      );
    }

    // Return success response
    return successResponse(
      res,
      status === 2
        ? "Expense Approved successfully"
        : "Expense Rejected successfully",
      200
    );
  } catch (error) {
    console.error(
      "Error approving or rejecting expense details:",
      error.message
    );
    return errorResponse(
      res,
      error.message,
      "Error updating expense details",
      500
    );
  }
};

// TL Employee Expense Details
exports.getAlltlemployeeexpense = async (req, res) => {
  try {
    const {
      user_id,
      date,
      status,
      search,
      category,
      page = 1,
      perPage = 10,
    } = req.query;

    // Validate user_id
    if (!user_id) {
      return errorResponse(res, null, "User ID is required", 400);
    }

    // Check if user exists and is not deleted
    const [rows] = await db.query(
      "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
      [user_id]
    );
    if (rows.length === 0) {
      return errorResponse(res, null, "User not found", 400);
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

    // Validate status
    if (!status) {
      return errorResponse(res, null, "Status is required", 400);
    }
    if (status.includes(",")) {
      return errorResponse(
        res,
        null,
        "Only a single status value is allowed",
        400
      );
    }

    const offset = (page - 1) * perPage;
    const otConditions = [];
    const otValues = [];

    // Base condition for team filtering
    otConditions.push(`et.team_id IN (?)`);
    otValues.push(teamIds);

    // Filter by category
    if (category) {
      const categoryMapping = {
        food: "1",
        travel: "2",
        others: "3",
      };
      const categoryIds = category
        .split(",")
        .map((cat) => categoryMapping[cat.toLowerCase()] || cat);
      otConditions.push("et.category IN (?)");
      otValues.push(categoryIds);
    }

    // Filter by date
    if (date) {
      otConditions.push("DATE(et.date) = ?");
      otValues.push(date);
    }

    // Search term filter
    if (search) {
      const searchTerm = `%${search}%`;
      otConditions.push(
        "(u.first_name LIKE ? OR u.last_name LIKE ? OR pr.name LIKE ? OR et.description LIKE ? OR et.expense_amount LIKE ? OR et.category LIKE ?)"
      );
      otValues.push(
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm
      );
    }

    // Status-based filtering
    switch (status) {
      case "0": // All statuses must be 0
        otConditions.push("et.status = 0 AND et.tl_status = 0");
        break;
      case "1": // et.status must be 1, and at least one of tl_status or pm_status must be 1
        otConditions.push("(et.tl_status = 1 OR et.pm_status = 1)");
        break;
      case "2": // All statuses must be 2
        otConditions.push("et.tl_status = 2");
        break;
      default:
        return errorResponse(
          res,
          "Invalid status value",
          "Error fetching expenses",
          400
        );
    }

    // Build the WHERE clause
    const otWhereClause =
      otConditions.length > 0 ? `WHERE ${otConditions.join(" AND ")}` : "";

    // Query to fetch expenses
    const otQuery = `
      SELECT 
        pr.name AS project_name,
        DATE_FORMAT(et.date, '%Y-%m-%d') AS date,
        et.status,
        et.tl_status,
        et.pm_status,
        et.id AS et_id,
        et.user_id,
        u.first_name AS user_first_name,
        u.last_name AS user_last_name,
        u.employee_id,
        d.name AS designation,
        et.category,
        et.description,
        et.expense_amount AS amount,
        et.file
      FROM 
        expense_details et
      LEFT JOIN 
        projects pr ON pr.id = et.project_id
      LEFT JOIN 
        users u ON u.id = et.user_id
      LEFT JOIN 
        designations d ON d.id = u.designation_id
      ${otWhereClause}
      AND et.deleted_at IS NULL
      ORDER BY 
        et.id
    `;

    const [ots] = await db.query(otQuery, otValues);

    // Pagination logic
    const totalRecords = ots.length;
    const paginatedData = ots.slice(offset, offset + parseInt(perPage));
    const pagination = getPagination(page, perPage, totalRecords);

    // Format data for response
    const formattedData = paginatedData.map((row, index) => ({
      s_no: offset + index + 1,
      id: row.et_id,
      user_id: row.user_id,
      employee_name: `${row.user_first_name} ${row.user_last_name}`.trim(),
      employee_id: row.employee_id,
      designation: row.designation,
      date: row.date,
      category: row.category,
      project_name: row.project_name,
      description: row.description,
      amount: row.amount,
      file: row.file,
      status: row.status,
      tlstatus: row.tl_status,
      pmstatus: row.pm_status,
    }));

    // Response with data and pagination
    return successResponse(
      res,
      {
        totalRecords,
        data: formattedData,
        pagination,
      },
      formattedData.length === 0
        ? "No expense details found"
        : "Expense details retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Error fetching expense details:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};
exports.getExpenseReport = async (queryParams, res) => {
  try {
    const {
      from_date,
      to_date,
      category,
      search,
      page = 1,
      perPage = 10,
      export_status,
    } = queryParams.query;

    // Get the current date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];

    // If dates are not provided, use the current date
    const fromDate = from_date ? new Date(from_date).toISOString().split("T")[0] : today;
    const toDate = to_date ? new Date(to_date).toISOString().split("T")[0] : today;

    // Base query with filters
    const baseQuery = `
      SELECT 
         DATE_FORMAT(expenses.date, '%d-%m-%Y') AS expense_date,
         expenses.expense_amount,
         expenses.description AS reason,
         expenses.file AS proof,
         CASE 
            WHEN expenses.category = 1 THEN 'Food'
            WHEN expenses.category = 2 THEN 'Travel'
            WHEN expenses.category = 3 THEN 'Others'
            ELSE 'Unknown'
         END AS category,
         users.first_name,
         users.employee_id AS employee_id
      FROM 
         expense_details AS expenses
      LEFT JOIN users ON users.id = expenses.user_id
      WHERE 
         expenses.deleted_at IS NULL AND
         users.deleted_at IS NULL
         AND expenses.pm_status = 2
         AND (STR_TO_DATE(expenses.date, '%Y-%m-%d') BETWEEN ? AND ?)
         ${search ? "AND (users.first_name LIKE ? OR users.employee_id LIKE ? OR expenses.date LIKE ?)" : ""}
         ${category ? "AND expenses.category IN (?)" : ""}
      ORDER BY 
         expenses.date DESC
      ${
        export_status === "1" ? "" : "LIMIT ? OFFSET ?"
      };
    `;

    // Prepare query params
    let params = [fromDate, toDate];
    if (search) params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    if (category) {
      const categoryArray = Array.isArray(category) ? category : category.split(",");
      params.push(categoryArray);
    }

    // Add pagination only if export_status is not "1"
    if (export_status !== "1") {
      const offset = (page - 1) * perPage;
      params.push(parseInt(perPage, 10), parseInt(offset, 10));
    }

    // Debugging logs
    console.log("Executing SQL Query:", baseQuery);
    console.log("With Parameters:", params);

    // Execute main query
    const [results] = await db.query(baseQuery, params);

    // Handle export case
    if (export_status === "1") {
      const { Parser } = require("json2csv");
      const json2csvParser = new Parser();
      const csv = json2csvParser.parse(results);

      res.header("Content-Type", "text/csv");
      res.attachment("expense_report.csv");
      return res.send(csv);
    }

    // Standard paginated response for normal requests
    const totalRecordsQuery = `
      SELECT COUNT(*) AS total
      FROM expense_details AS expenses
      LEFT JOIN users ON users.id = expenses.user_id
      WHERE 
         expenses.deleted_at IS NULL AND
         users.deleted_at IS NULL
         AND (STR_TO_DATE(expenses.date, '%Y-%m-%d') BETWEEN ? AND ?)
         ${search ? "AND (users.first_name LIKE ? OR users.employee_id LIKE ? OR expenses.date LIKE ?)" : ""}
         ${category ? "AND expenses.category IN (?)" : ""}
    `;

    const [totalRecordsResult] = await db.query(
      totalRecordsQuery,
      params.slice(0, params.length - 2)
    );
    const totalRecords = totalRecordsResult[0].total || 0;

    const pagination = getPagination(page, perPage, totalRecords);
    successResponse(
      res,
      results,
      results.length === 0 ? "No expenses found" : "Expenses retrieved successfully",
      200,
      pagination
    );
  } catch (error) {
    console.error("Error retrieving expenses:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};

