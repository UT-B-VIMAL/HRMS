const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
  getPagination,
} = require("../../helpers/responseHelper");
const moment = require("moment");

// Insert OT
exports.createOt = async (payload, res) => {
  const { date, time, project_id, task_id, user_id, comments, created_by } =
    payload;

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

    const taskQuery = `
        SELECT id 
        FROM tasks 
        WHERE deleted_at IS NULL AND id = ? AND project_id = ?
      `;
    const [taskResult] = await db.query(taskQuery, [task_id, project_id]);

    if (taskResult.length === 0) {
      return errorResponse(
        res,
        "Task not found or does not belong to the specified project",
        "Error creating OT",
        404
      );
    }

    const userQuery = `
        SELECT id 
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

    const insertQuery = `
        INSERT INTO ot_details (
          user_id, product_id, project_id, task_id, comments, date, time, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;
    const values = [
      user_id,
      product_id,
      project_id,
      task_id,
      comments,
      date,
      time,
      created_by,
      created_by,
    ];

    const [result] = await db.query(insertQuery, values);
    const selectQuery = `
      SELECT status 
      FROM ot_details 
      WHERE id = ?
    `;
    const [statusResult] = await db.query(selectQuery, [result.insertId]);

    const status = statusResult.length > 0 ? statusResult[0].status : 0;

    // Return success response
    return successResponse(
      res,
      {
        id: result.insertId,
        task_id,
        project_id,
        product_id,
        status,
        user_id,
        created_by,
      },
      "OT detail added successfully",
      201
    );
  } catch (error) {
    console.error("Error inserting OT detail:", error.message);
    return errorResponse(res, error.message, "Error inserting OT detail", 500);
  }
};
// Show OT
exports.getOt = async (id, res) => {
  try {
    const otdetailQuery = `
        SELECT 
          id, 
          DATE_FORMAT(date, '%Y-%m-%d') AS date, 
          time, 
          comments, 
          product_id, 
          project_id, 
          task_id,
          user_id, 
          status
        FROM 
          ot_details
        WHERE 
          id = ?
          AND deleted_at IS NULL;
      `;
    const [otdetail] = await db.query(otdetailQuery, [id]);

    if (!otdetail || otdetail.length === 0) {
      return errorResponse(
        res,
        "OT detail not found",
        "Error retrieving OT detail",
        404
      );
    }

    const result = otdetail[0];

    return successResponse(
      res,
      result,
      "OT detail retrieved successfully",
      200
    );
  } catch (error) {
    return errorResponse(res, error.message, "Error retrieving OT detail", 500);
  }
};
// Show All OT
exports.getAllOts = async (req, res) => {
  try {
    const {
      project_id,
      user_id,
      date,
      status,
      product_id,
      search,
      page = 1,
      perPage = 10,
    } = req.query;

    if (!user_id) {
      return errorResponse(
        res,
        "user_id is required",
        "Error fetching OT details",
        400
      );
    }
    if (!status) {
      return errorResponse(
        res,
        "status is required",
        "Error fetching OT details",
        400
      );
    }

    const [userCheck] = await db.query(
      "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
      [user_id]
    );
    if (userCheck.length === 0) {
      return errorResponse(
        res,
        "User not found or deleted",
        "Error fetching OT details",
        404
      );
    }

    const offset = (page - 1) * perPage;

    const otConditions = [];
    const otValues = [];

    if (project_id) {
      const projectIds = project_id.split(",");
      otConditions.push(`ot.project_id IN (?)`);
      otValues.push(projectIds);
    }
    if (user_id) {
      otConditions.push("ot.user_id = ?");
      otValues.push(user_id);
    }
    if (date) {
      otConditions.push("DATE(ot.date) = ?");
      otValues.push(date);
    }
    if (product_id) {
      const productIds = product_id.split(",");
      otConditions.push(`ot.product_id IN (?)`);
      otValues.push(productIds);
    }
    if (search) {
      const searchTerm = `%${search}%`;
      otConditions.push(
        `(t.name LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR pr.name LIKE ? OR ot.comments LIKE ?)`
      );
      otValues.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (status) {
      const statusArray = status.split(",");
      otConditions.push(`ot.status IN (?)`);
      otValues.push(statusArray);
    }

    const otWhereClause =
      otConditions.length > 0 ? `WHERE ${otConditions.join(" AND ")}` : "";

    const otQuery = `
        SELECT 
          pr.name AS project_name,
          t.name AS task_name,
          DATE_FORMAT(ot.date, '%Y-%m-%d') AS date,
          ot.time,
          ot.comments,
          ot.status,
          ot.id AS ot_id,
          ot.user_id,
          u.first_name AS user_first_name,
          u.last_name AS user_last_name
        FROM 
          ot_details ot
        LEFT JOIN 
          tasks t ON t.id = ot.task_id
        LEFT JOIN 
          projects pr ON pr.id = ot.project_id
        LEFT JOIN 
          users u ON u.id = ot.user_id
        ${otWhereClause}
        ORDER BY 
          ot.id
      `;

    const [ots] = await db.query(otQuery, otValues);

    // Pagination logic
    const totalRecords = ots.length;
    const paginatedData = ots.slice(offset, offset + parseInt(perPage));
    const pagination = getPagination(page, perPage, totalRecords);

    // Add serial numbers and include id, user_id in the paginated data
    const data = paginatedData.map((row, index) => ({
      s_no: offset + index + 1,
      id: row.ot_id,
      user_id: row.user_id,
      date: row.date,
      time: row.time,
      project_name: row.project_name,
      task_name: row.task_name,
      comments: row.comments,
      status: row.status,
      user_name: `${row.user_first_name} ${row.user_last_name}`,
    }));

    successResponse(
      res,
      data,
      data.length === 0
        ? "No OT details found"
        : "OT details retrieved successfully",
      200,
      pagination
    );
  } catch (error) {
    console.error("Error fetching OT details:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};
// Update Task
exports.updateOt = async (id, payload, res) => {
  const { date, time, project_id, task_id, user_id, comments, updated_by } =
    payload;

  try {
    const checkQuery = `
        SELECT id 
        FROM ot_details 
        WHERE id = ? AND deleted_at IS NULL
      `;
    const [existingOt] = await db.query(checkQuery, [id]);

    if (existingOt.length === 0) {
      return errorResponse(
        res,
        "OT detail not found or already deleted",
        "Error updating OT",
        404
      );
    }

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
        "Error updating OT",
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
        "Error updating OT",
        404
      );
    }

    const taskQuery = `
        SELECT id 
        FROM tasks 
        WHERE deleted_at IS NULL AND id = ? AND project_id = ?
      `;
    const [taskResult] = await db.query(taskQuery, [task_id, project_id]);

    if (taskResult.length === 0) {
      return errorResponse(
        res,
        "Task not found or does not belong to the specified project",
        "Error updating OT",
        404
      );
    }

    const userQuery = `
        SELECT id 
        FROM users 
        WHERE deleted_at IS NULL AND id = ?
      `;
    const [userResult] = await db.query(userQuery, [user_id]);

    if (userResult.length === 0) {
      return errorResponse(
        res,
        "User not found or deleted",
        "Error updating OT",
        404
      );
    }

    const updateQuery = `
        UPDATE ot_details 
        SET 
          user_id = ?, 
          product_id = ?, 
          project_id = ?, 
          task_id = ?, 
          comments = ?, 
          date = ?, 
          time = ?, 
          updated_by = ?, 
          updated_at = NOW() 
        WHERE id = ? AND deleted_at IS NULL
      `;
    const values = [
      user_id,
      product_id,
      project_id,
      task_id,
      comments,
      date,
      time,
      updated_by,
      id,
    ];

    const [result] = await db.query(updateQuery, values);

    if (result.affectedRows === 0) {
      return errorResponse(
        res,
        "OT detail not found or no changes made",
        "Error updating OT",
        404
      );
    }

    const selectQuery = `
        SELECT status 
        FROM ot_details 
        WHERE id = ?
      `;
    const [statusResult] = await db.query(selectQuery, [id]);

    const status = statusResult.length > 0 ? statusResult[0].status : 0;

    return successResponse(
      res,
      {
        id,
        task_id,
        project_id,
        product_id,
        status,
        user_id,
        updated_by,
        date,
        time,
        comments,
      },
      "OT detail updated successfully",
      200
    );
  } catch (error) {
    console.error("Error updating OT detail:", error.message);
    return errorResponse(res, error.message, "Error updating OT detail", 500);
  }
};

// Delete Task
exports.deleteOt = async (id, res) => {
  try {
    const checkQuery =
      "SELECT id FROM ot_details WHERE id = ? AND deleted_at IS NULL";
    const [existingOt] = await db.query(checkQuery, [id]);

    if (existingOt.length === 0) {
      return errorResponse(
        res,
        null,
        "OT detail not found or already deleted",
        404
      );
    }

    const updateQuery =
      "UPDATE ot_details SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL";
    const [result] = await db.query(updateQuery, [id]);

    if (result.affectedRows === 0) {
      return errorResponse(
        res,
        null,
        "OT detail not found or already deleted",
        204
      );
    }

    return successResponse(res, null, "OT detail deleted successfully");
  } catch (error) {
    return errorResponse(res, error.message, "Error deleting OT detail", 500);
  }
};
