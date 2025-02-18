const db = require('../../config/db');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');

exports.getAllData = async (payload, res) => {
    const { type, id, user_id ,task_user_id} = payload;

    let query = "";
    let queryParams = [];

    // try {
        // Initialize queries based on type
        if (type === "teams") {
            query = "SELECT id, name FROM teams WHERE deleted_at IS NULL";
        } else if (type === "users") {
            query = "SELECT id,role_id, first_name AS name, employee_id, last_name FROM users WHERE deleted_at IS NULL";
        }
        else if (type === "tl") {
            query = "SELECT id,role_id, first_name AS name, employee_id, last_name FROM users WHERE role_id = 3 AND deleted_at IS NULL";
        } else if (type === "products") {
            // if(user_id){
            const users = await this.getAuthUserDetails(user_id, res);
            if (!users) return;
            if (users.role_id === 3) {
                const query1 = "SELECT id FROM teams WHERE deleted_at IS NULL AND reporting_user_id = ?";
                const [rows] = await db.query(query1, [user_id]);
                let teamIds = []; 
                if(rows.length > 0){
                    teamIds = rows.map(row => row.id);
                }else{
                   teamIds.push(users.team_id);
                }
                
                const queryTasks = "SELECT DISTINCT product_id FROM tasks WHERE deleted_at IS NULL AND team_id IN (?)";
                const [taskRows] = await db.query(queryTasks, [teamIds]);

                const querySubtasks = "SELECT DISTINCT product_id FROM sub_tasks WHERE deleted_at IS NULL AND team_id IN (?)";
                const [subtaskRows] = await db.query(querySubtasks, [teamIds]);

                let productIds = [...new Set([...taskRows.map(row => row.product_id), ...subtaskRows.map(row => row.product_id)])];
                if (productIds.length === 0) {
                    productIds = [-1]; // Prevent SQL error
                }
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
        // }
        } else if (type === "projects") {
            // if(user_id){
            const users = await this.getAuthUserDetails(user_id, res);
            if (!users) return;
            if (users.role_id === 3) {
                const query1 = "SELECT id FROM teams WHERE deleted_at IS NULL AND reporting_user_id = ?";
                const [rows] = await db.query(query1, [user_id]);
                let teamIds = []; 
                if(rows.length > 0){
                    teamIds = rows.map(row => row.id);
                }else{
                   teamIds.push(users.team_id);
                }
                const queryTasks = "SELECT DISTINCT project_id FROM tasks WHERE deleted_at IS NULL AND team_id IN (?)";
                const [taskRows] = await db.query(queryTasks, [teamIds]);

                const querySubtasks = "SELECT DISTINCT project_id FROM sub_tasks WHERE deleted_at IS NULL AND team_id IN (?)";
                const [subtaskRows] = await db.query(querySubtasks, [teamIds]);

                let projectIds = [...new Set([...taskRows.map(row => row.project_id), ...subtaskRows.map(row => row.project_id)])];
                if (projectIds.length === 0) {
                    projectIds = [-1]; // Prevent SQL error
                }
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

            // }
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
        } 
        
        else if (type === "issue") {
            query = "SELECT id, issue_name FROM issue_types WHERE deleted_at IS NULL";
        } 
        else {
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
            if(task_user_id){
                query += " AND user_id = ?";
                queryParams.push(task_user_id);
            }
        }
        if (type === "teams" && id) {
            const users = await this.getAuthUserDetails(id, res);
            if (!users) return;
            if (users.role_id === 3) {
                query += " AND reporting_user_id = ?";
                queryParams.push(id);
            }
        }
        if(type==="users" && user_id){
            const users = await this.getAuthUserDetails(user_id, res);
            if (!users) return;
            if (users.role_id === 3) {
                const query1 = "SELECT id FROM teams WHERE deleted_at IS NULL AND reporting_user_id = ?";
                const [rows] = await db.query(query1, [user_id]);
                let teamIds = []; 
                if(rows.length > 0){
                    teamIds = rows.map(row => row.id);
                }
                query += " AND team_id IN (?) AND id!=?";
                queryParams.push(teamIds,user_id);
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

  exports.formatTimeDHMS = (time) => {
    if (time === "00:00:00") {
        return "0m";
    }

    const [hours, minutes] = time.split(":").map(Number);
    const totalMinutes = hours * 60 + minutes;

    const days = Math.floor(totalMinutes / (8 * 60)); // 8 hours per day
    const remainingMinutes = totalMinutes % (8 * 60);

    const remainingHours = Math.floor(remainingMinutes / 60);
    const finalMinutes = remainingMinutes % 60;

    let result = '';
    if (days > 0) {
        result += `${days}d `;
    }
    if (remainingHours > 0) {
        result += `${remainingHours}h `;
    }
    if (finalMinutes > 0 || result === '') {
        result += `${finalMinutes}m`;
    }

    return result.trim();
};
  
exports.getISTTime = () => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istTime = new Date(now.getTime() + istOffset);
    return istTime.toISOString().slice(0, 19).replace("T", " "); // Convert to MySQL DATETIME format
};


exports.getticketCount = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = id;
        
        if (!userId) {
          return errorResponse(res, null, 'User ID is required', 400);
        }

        const [rows] = await db.query(
            "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
            [userId]
          );
      
          // Check if no rows are returned
          if (rows.length === 0) {
            return errorResponse(res, null, "User Not Found", 400);
          }
          const [rowss] = await db.query(
            "SELECT COUNT(id) AS count FROM ticket_comments WHERE receiver_id = ? AND type = 0 AND deleted_at IS NULL",
            [userId]
          );
          
          const ticketCount = rowss[0]?.count || 0;

        return successResponse(
          res,
          ticketCount,
          "Ticket Count retrieved successfully",
          200
        );
    } catch (error) {
        console.error("Error fetching Ticket Count:", error);
        return errorResponse(res, error.message, "Error fetching Ticket Count", 500);
    }
};



  