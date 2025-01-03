const db = require('../../config/db');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');

exports.getAllData = async (payload, res) => {
    const { type, id, user_id } = payload;

    let query = "";
    let queryParams = [];

    // try {
        // Initialize queries based on type
        if (type === "teams") {
            query = "SELECT id, name FROM teams WHERE deleted_at IS NULL";
        } else if (type === "users") {
            query = "SELECT id, first_name AS name, employee_id, last_name FROM users WHERE deleted_at IS NULL";
        } else if (type === "products") {
            if(user_id){
            const users = await this.getAuthUserDetails(user_id, res);
            if (!users) return;
            if (users.role_id === 3) {
                const query1 = "SELECT id FROM teams WHERE deleted_at IS NULL AND reporting_user_id = ?";
                const [rows] = await db.query(query1, [user_id]);
                const teamIds = rows.map(row => row.id);

                const queryTasks = "SELECT DISTINCT product_id FROM tasks WHERE deleted_at IS NULL AND team_id IN (?)";
                const [taskRows] = await db.query(queryTasks, [teamIds]);

                const querySubtasks = "SELECT DISTINCT product_id FROM sub_tasks WHERE deleted_at IS NULL AND team_id IN (?)";
                const [subtaskRows] = await db.query(querySubtasks, [teamIds]);

                const productIds = [...new Set([...taskRows.map(row => row.product_id), ...subtaskRows.map(row => row.product_id)])];
                query = "SELECT id, name FROM products WHERE deleted_at IS NULL AND id IN (?)";
                queryParams.push(productIds);
            }else if(users.role_id === 4){
                const queryTasks = "SELECT DISTINCT product_id FROM tasks WHERE deleted_at IS NULL AND user_id=?";
                const [taskRows] = await db.query(queryTasks, [user_id]);

                const querySubtasks = "SELECT DISTINCT product_id FROM sub_tasks WHERE deleted_at IS NULL AND user_id=?";
                const [subtaskRows] = await db.query(querySubtasks, [user_id]);

                const productIds = [...new Set([...taskRows.map(row => row.product_id), ...subtaskRows.map(row => row.product_id)])];
                query = "SELECT id, name FROM products WHERE deleted_at IS NULL AND id IN (?)";
                queryParams.push(productIds);
            }else {
                query = "SELECT id, name FROM products WHERE deleted_at IS NULL";
            
            }
        }
        } else if (type === "projects") {
            if(user_id){
            const users = await this.getAuthUserDetails(user_id, res);
            if (!users) return;
            if (users.role_id === 3) {
                const query1 = "SELECT id FROM teams WHERE deleted_at IS NULL AND reporting_user_id = ?";
                const [rows] = await db.query(query1, [user_id]);
                const teamIds = rows.map(row => row.id);

                const queryTasks = "SELECT DISTINCT project_id FROM tasks WHERE deleted_at IS NULL AND team_id IN (?)";
                const [taskRows] = await db.query(queryTasks, [teamIds]);

                const querySubtasks = "SELECT DISTINCT project_id FROM sub_tasks WHERE deleted_at IS NULL AND team_id IN (?)";
                const [subtaskRows] = await db.query(querySubtasks, [teamIds]);

                const projectIds = [...new Set([...taskRows.map(row => row.project_id), ...subtaskRows.map(row => row.project_id)])];
                query = "SELECT id, name FROM projects WHERE deleted_at IS NULL AND id IN (?)";
                queryParams.push(projectIds);
            }else if(users.role_id === 4){
                const queryTasks = "SELECT DISTINCT project_id FROM tasks WHERE deleted_at IS NULL AND user_id=?";
                const [taskRows] = await db.query(queryTasks, [user_id]);

                const querySubtasks = "SELECT DISTINCT project_id FROM sub_tasks WHERE deleted_at IS NULL AND user_id=?";
                const [subtaskRows] = await db.query(querySubtasks, [user_id]);
                const productIds = [...new Set([...taskRows.map(row => row.project_id), ...subtaskRows.map(row => row.project_id)])];
                query = "SELECT id, name FROM projects WHERE deleted_at IS NULL AND id IN (?)";
                queryParams.push(productIds);
            }else {
                    query = "SELECT id, name FROM projects WHERE deleted_at IS NULL";
            }
            }
        } else if (type === "tasks") {
            query = "SELECT id, name FROM tasks WHERE deleted_at IS NULL";
        } else if (type === "designations") {
            query = "SELECT id, name FROM designations WHERE deleted_at IS NULL";
        } else if (type === "roles") {
            query = "SELECT id, name FROM roles";
        } else if (type === "owners") {
            query = "SELECT id, first_name AS name, employee_id, last_name FROM users WHERE deleted_at IS NULL AND role_id != 4";
        } else if (type === "assignee") {
            query = "SELECT id, first_name AS name, employee_id, last_name FROM users WHERE deleted_at IS NULL";
        } else {
            return errorResponse(res, "Invalid type provided", "Invalid type provided", 500);
        }

        // Append additional conditions based on `id`
        if (type === "projects" && id) {
            query += " AND product_id = ?";
            queryParams.push(id);
        }
        if (type === "assignee" && id) {
            query += " AND team_id = ?";
            queryParams.push(id);
        }
        if (type === "tasks" && id) {
            query += " AND project_id = ?";
            queryParams.push(id);
        }
        if (type === "teams" && id) {
            const users = await this.getAuthUserDetails(id, res);
            if (!users) return;
            if (users.role_id === 3) {
                query += " AND reporting_user_id = ?";
                queryParams.push(id);
            }
        }

        query += " ORDER BY `id` DESC";

        // Execute the query
        const [rows] = await db.query(query, queryParams);

        // Format the response for specific types
        if (type === "users" || type === "owners" || type === "assignee") {
            rows.forEach(user => {
                if (user.last_name) {
                    const firstNameInitial = user.name ? user.name.charAt(0).toUpperCase() : '';
                    const lastNameInitial = user.last_name.charAt(0).toUpperCase();
                    user.profileName = `${firstNameInitial}${lastNameInitial}`;
                } else if (user.name) {
                    user.profileName = user.name.substring(0, 2).toUpperCase();
                }
            });
        }

        return successResponse(
            res,
            rows,
            rows.length === 0
                ? `${type.charAt(0).toUpperCase() + type.slice(1)} not found`
                : `${type.charAt(0).toUpperCase() + type.slice(1)} fetched successfully`,
            200
        );
    // } catch (err) {
    //     return errorResponse(res, err.message, "Error fetching Data", 500);
    // }
};

exports.getAuthUserDetails = async (authUserId, res) => {
    try {
      const authUserQuery = "SELECT * FROM users WHERE deleted_at IS NULL AND id = ?";
      const [authUserDetails] = await db.query(authUserQuery, [authUserId]);
  
      if (!authUserDetails || authUserDetails.length === 0) {
        return errorResponse(
          res,
          "Auth User not found",
          'Auth User not found',
          404 
        );
      }
  
      return authUserDetails[0];
    } catch (error) {
      return errorResponse(res, error.message, 'Error fetching User', 500);
    }
  };
  
  
  
  