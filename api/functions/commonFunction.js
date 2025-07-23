const db = require('../../config/db');
const { hasPermission } = require('../../controllers/permissionController');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');
const jwt = require('jsonwebtoken');
const { getUserIdFromAccessToken } = require('../utils/tokenUtils');

exports.getAllData = async (req, res) => {
    const { type, id, task_user_id ,project_id,product_id } = req.query;

    let query = "";
    let queryParams = [];
    const accessToken = req.headers.authorization?.split(" ")[1];
    if (!accessToken) {
      return errorResponse(res, "Access token is required", 401);
    }

    const user_id = await getUserIdFromAccessToken(accessToken);
    const hasAllProducts = await hasPermission("dropdown.all_products", accessToken);
    const hasTeamProducts = await hasPermission("dropdown.team_products", accessToken);
    const hasUserProducts = await hasPermission("dropdown.user_products", accessToken);
    const hasAllProjects = await hasPermission("dropdown.all_projects", accessToken);
    const hasTeamProjects = await hasPermission("dropdown.team_projects", accessToken);
    const hasUserProjects = await hasPermission("dropdown.user_projects", accessToken);
    const hasTeamUsers= await hasPermission("dropdown.team_users", accessToken);
    const hasOwnTeamFilter = await hasPermission("dropdown.ownteam_filter", accessToken);
    
    const hasTeamProductsIds =  await this.getExcludedRoleIdsByPermission("dropdown.team_products") ;
    const hasUserProductsIds =  await this.getExcludedRoleIdsByPermission("dropdown.user_products") ;
    const managerIds= await this.getExcludedRoleIdsByPermission("dropdown.managers") ;
    console.log("hasTeamProductsIds",hasTeamProductsIds)
    console.log("hasUserProductsIds",hasUserProductsIds)
    // try {
    // Initialize queries based on type
    if (type === "teams") {
          let teamIds = [];
            let userIds = new Set();

            const conditions = [];
            const values = [];

            if (req.query.project_id) {
                conditions.push("project_id = ?");
                values.push(req.query.project_id);
            }

            if (req.query.product_id) {
                conditions.push("product_id = ?");
                values.push(req.query.product_id);
            }

           if (conditions.length > 0) {
                const whereClause = conditions.join(" OR ");

                // Get user_ids from tasks
                const [taskUsers] = await db.query(
                    `SELECT DISTINCT user_id FROM tasks WHERE deleted_at IS NULL AND (${whereClause})`,
                    values
                );
                taskUsers.forEach(row => userIds.add(row.user_id));

                // Get user_ids from sub_tasks
                const [subtaskUsers] = await db.query(
                    `SELECT DISTINCT user_id FROM sub_tasks WHERE deleted_at IS NULL AND (${whereClause})`,
                    values
                );
                subtaskUsers.forEach(row => userIds.add(row.user_id));
                } else {
                    // No filters provided, return all active team_ids
                    const [teamRows] = await db.query(
                        `SELECT DISTINCT team_id FROM users WHERE deleted_at IS NULL AND team_id IS NOT NULL`
                    );
                    teamIds = teamRows.map(t => t.team_id);
                }

   
        if (userIds.size > 0) {
        const userIdList = [...userIds];
        const [teamRows] = await db.query(
            `SELECT DISTINCT team_id FROM users WHERE deleted_at IS NULL AND id IN (?)`,
            [userIdList]
        );
        teamIds = teamRows.map(t => t.team_id);
    } 

    if (teamIds.length === 0) {
        teamIds = [-1]; // fallback to avoid SQL error
    }

    query = `SELECT DISTINCT teams.id, teams.name FROM teams LEFT JOIN users ON teams.id = users.team_id WHERE teams.deleted_at IS NULL AND users.deleted_at IS NULL AND teams.id IN (?)`;

    queryParams.push(teamIds);
    if( hasOwnTeamFilter && user_id) {
           const users = await this.getAuthUserDetails(user_id, res);
            const teamIds = users.team_id ? users.team_id.split(',') : [];
            console.log("teamIds", teamIds)
            query += " AND teams.id IN (?)";
            queryParams.push(teamIds);
    }
    } else if (type === "users") {
        query = `SELECT id, role_id, COALESCE(CONCAT(first_name, ' ', last_name)) as name, employee_id, last_name FROM users WHERE deleted_at IS NULL AND role_id IN (${hasUserProductsIds.map(() => '?').join(',')})`;
        queryParams.push(...hasUserProductsIds);
    }
    else if (type === "tl") {
     query = `SELECT id, role_id, COALESCE(CONCAT(first_name, ' ', last_name)) as name, employee_id, last_name FROM users WHERE deleted_at IS NULL AND role_id IN (${hasTeamProductsIds.map(() => '?').join(',')})`;
        queryParams.push(...hasTeamProductsIds);
    } else if (type === "products") {

        const users = await this.getAuthUserDetails(user_id, res);
        if (!users) return;
        if (hasTeamProducts) {
            // const query1 = "SELECT id FROM teams WHERE deleted_at IS NULL AND reporting_user_id = ?";
            // const [rows] = await db.query(query1, [user_id]);
            const teamIds = users.team_id ? users.team_id.split(',') : [];
            // if (rows.length > 0) {
            //     teamIds = rows.map(row => row.id);
            // } else {
            //     teamIds.push(users.team_id);
            // }

            const userIdList = "SELECT id FROM users WHERE deleted_at IS NULL AND team_id IN (?)";
            const [userRows] = await db.query(userIdList, [teamIds]);
            const userIds = userRows.map(row => row.id);
            const queryTasks = "SELECT DISTINCT product_id FROM tasks WHERE deleted_at IS NULL AND user_id IN (?)";
            const [taskRows] = await db.query(queryTasks, [userIds]);

            const querySubtasks = "SELECT DISTINCT product_id FROM sub_tasks WHERE deleted_at IS NULL AND user_id IN (?)";
            const [subtaskRows] = await db.query(querySubtasks, [userIds]);

            let productIds = [...new Set([...taskRows.map(row => row.product_id), ...subtaskRows.map(row => row.product_id)])];
            if (productIds.length === 0) {
                productIds = [-1]; // Prevent SQL error for empty IN clause
            }
            query = "SELECT id, name FROM products WHERE deleted_at IS NULL AND id IN (?)";
            queryParams.push(productIds);
        } else if (hasUserProducts) {
            const queryTasks = "SELECT DISTINCT product_id FROM tasks WHERE deleted_at IS NULL AND user_id=?";
            const [taskRows] = await db.query(queryTasks, [user_id]);

            const querySubtasks = "SELECT DISTINCT product_id FROM sub_tasks WHERE deleted_at IS NULL AND user_id=?";
            const [subtaskRows] = await db.query(querySubtasks, [user_id]);

            let productIds = [...new Set([...taskRows.map(row => row.product_id), ...subtaskRows.map(row => row.product_id)])];
            if (productIds.length === 0) {
                productIds = [-1]; // Prevvent SQL error for empty IN clause
            }
            query = "SELECT id, name FROM products WHERE deleted_at IS NULL AND id IN (?)";
            queryParams.push(productIds);
        } else if( hasAllProducts) {
            query = "SELECT id, name FROM products WHERE deleted_at IS NULL";
        }else{
            return errorResponse(res, "Unauthorized access", "You do not have permission to view products", 403);
        }
    } else if (type === "projects") {
        // if(user_id){
        const users = await this.getAuthUserDetails(user_id, res);
        if (!users) return;
        if (hasTeamProjects) {
            // const query1 = "SELECT id FROM teams WHERE deleted_at IS NULL AND reporting_user_id = ?";
            // const [rows] = await db.query(query1, [user_id]);
            // let teamIds = [];
            // if (rows.length > 0) {
            //     teamIds = rows.map(row => row.id);
            // } else {
            //     teamIds.push(users.team_id);
            // }
            const teamIds = users.team_id ? users.team_id.split(',') : [];
            const userIdList = "SELECT id FROM users WHERE deleted_at IS NULL AND team_id IN (?)";
            const [userRows] = await db.query(userIdList, [teamIds]);
            const userIds = userRows.map(row => row.id);
            const queryTasks = "SELECT DISTINCT project_id FROM tasks WHERE deleted_at IS NULL AND user_id IN (?)";
            const [taskRows] = await db.query(queryTasks, [userIds]);

            const querySubtasks = "SELECT DISTINCT project_id FROM sub_tasks WHERE deleted_at IS NULL AND user_id IN (?)";
            const [subtaskRows] = await db.query(querySubtasks, [userIds]);

            let projectIds = [...new Set([...taskRows.map(row => row.project_id), ...subtaskRows.map(row => row.project_id)])];
            if (projectIds.length === 0) {
                projectIds = [-1]; // Prevent SQL error
            }
            query = "SELECT id, name FROM projects WHERE deleted_at IS NULL AND id IN (?)";
            queryParams.push(projectIds);
        } else if (hasUserProjects) {
            const queryTasks = "SELECT DISTINCT project_id FROM tasks WHERE deleted_at IS NULL AND user_id=?";
            const [taskRows] = await db.query(queryTasks, [user_id]);

            const querySubtasks = "SELECT DISTINCT project_id FROM sub_tasks WHERE deleted_at IS NULL AND user_id=?";
            const [subtaskRows] = await db.query(querySubtasks, [user_id]);
            let projectIds = [...new Set([...taskRows.map(row => row.project_id), ...subtaskRows.map(row => row.project_id)])];
            if (projectIds.length === 0) {
                projectIds = [-1]; // Prevent SQL error
            }
            query = "SELECT id, name FROM projects WHERE deleted_at IS NULL AND id IN (?)";
            queryParams.push(projectIds);
        } else if( hasAllProjects) {
            query = "SELECT id, name FROM projects WHERE deleted_at IS NULL";
        }else{
            return errorResponse(res, "Unauthorized access", "You do not have permission to view projects", 403);
        }

        // }
    } else if (type === "tasks") {
        query = "SELECT id, name FROM tasks WHERE deleted_at IS NULL";
    } else if (type === "designations") {
        query = "SELECT id, name FROM designations WHERE deleted_at IS NULL";
    } else if (type === "roles") {
        query = "SELECT id, name ,short_name FROM roles WHERE deleted_at IS NULL";
    } else if (type === "owners") {
        query = `SELECT id, COALESCE(CONCAT(first_name, ' ', last_name)) as name, employee_id, last_name FROM users WHERE deleted_at IS NULL AND role_id IN (${managerIds.map(() => '?').join(',')})`
        queryParams.push(...managerIds);
    } else if (type === "assignee") {
        query = `SELECT id, COALESCE(CONCAT(first_name, ' ', last_name)) as name, employee_id, last_name FROM users WHERE deleted_at IS NULL AND role_id IN (${hasUserProductsIds.map(() => '?').join(',')})`
        queryParams.push(...hasUserProductsIds);
    }
    else if (type === "ot_projects") {
        const users = await this.getAuthUserDetails(user_id, res);
        if (!users) return;
        let projectIds = [];
        if (users.role_id === 2 || users.role_id === 1) {
            const queryTasks = "SELECT DISTINCT project_id FROM tasks WHERE deleted_at IS NULL AND assigned_user_id = ?";
            const [taskRows] = await db.query(queryTasks, [user_id]);
            const querySubtasks = "SELECT DISTINCT project_id FROM sub_tasks WHERE deleted_at IS NULL AND assigned_user_id = ?";
            const [subtaskRows] = await db.query(querySubtasks, [user_id]);
            projectIds = [...new Set([...taskRows.map(row => row.project_id), ...subtaskRows.map(row => row.project_id)])];
        }
        else if (users.role_id === 3) {
            const query1 = "SELECT id FROM teams WHERE deleted_at IS NULL AND reporting_user_id = ?";
            const [rows] = await db.query(query1, [user_id]);
            let teamIds = [];
            if (rows.length > 0) {
                teamIds = rows.map(row => row.id);
            } else {
                teamIds.push(users.team_id);
            }
            const userIdList = "SELECT id FROM users WHERE deleted_at IS NULL AND team_id IN (?)";
            const [userRows] = await db.query(userIdList, [teamIds]);
            const userIds = userRows.map(row => row.id);
            const queryTasks = "SELECT DISTINCT project_id FROM tasks WHERE deleted_at IS NULL AND user_id IN (?)";
            const [taskRows] = await db.query(queryTasks, [userIds]);
            const querySubtasks = "SELECT DISTINCT project_id FROM sub_tasks WHERE deleted_at IS NULL AND user_id IN (?)";
            const [subtaskRows] = await db.query(querySubtasks, [userIds]);
            projectIds = [...new Set([...taskRows.map(row => row.project_id), ...subtaskRows.map(row => row.project_id)])];

        } else if (users.role_id === 4) {
            const queryTasks = "SELECT DISTINCT project_id FROM tasks WHERE deleted_at IS NULL AND user_id = ?";
            const [taskRows] = await db.query(queryTasks, [user_id]);

            const querySubtasks = "SELECT DISTINCT project_id FROM sub_tasks WHERE deleted_at IS NULL AND user_id = ?";
            const [subtaskRows] = await db.query(querySubtasks, [user_id]);
            projectIds = [...new Set([...taskRows.map(row => row.project_id), ...subtaskRows.map(row => row.project_id)])];

        }
        if (projectIds.length === 0) {
            projectIds = [-1]; // Prevent SQL error
        }
        query = "SELECT id, name FROM projects WHERE deleted_at IS NULL AND id IN (?)";
        queryParams.push(projectIds);
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
        query += " AND FIND_IN_SET(?, team_id)";
        queryParams.push(id);
    }
    if (type === "tasks" && id) {
        query += " AND project_id = ?";
        queryParams.push(id);
        if (task_user_id) {
            query += " AND (user_id = ? OR id IN (SELECT task_id FROM sub_tasks WHERE user_id = ?))";
            queryParams.push(task_user_id, task_user_id);
        }
    }
    if (type === "teams" && id) {
        const users = await this.getAuthUserDetails(id, res);
        if (!users) return;
        if (hasTeamUsers) {
            const teamIds = users.team_id ? users.team_id.split(',') : [];
            console.log("teamIds", teamIds)
            query += " AND teams.id IN (?)";
            queryParams.push(teamIds);
        }
    }
    
    if (type === "users" && user_id) {
        const users = await this.getAuthUserDetails(user_id, res);
        if (!users) return;
        if (hasTeamUsers) {
            // const query1 = "SELECT id FROM teams WHERE deleted_at IS NULL AND reporting_user_id = ?";
            // const [rows] = await db.query(query1, [user_id]);
            // let teamIds = [];
            // if (rows.length > 0) {
            //     teamIds = rows.map(row => row.id);
            // }
            const teamIds = users.team_id ? users.team_id.split(',') : [];
            query += ` AND team_id IN (?) AND id!=?`;
            queryParams.push(teamIds, user_id);
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
    let totalSeconds;

    if (typeof time === "number" || /^[0-9]+$/.test(time)) {
        // If time is raw seconds (e.g., "192482")
        totalSeconds = parseInt(time, 10);
    } else if (typeof time === "string" && time.includes(":")) {
        // If time is "HH:MM:SS" format
        const [hours, minutes, seconds] = time.split(":").map(Number);
        totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
    } else {
        return "0m 0s";
    }

    const days = Math.floor(totalSeconds / (8 * 3600)); // 8 hours/day
    const remainingSeconds = totalSeconds % (8 * 3600);

    const remainingHours = Math.floor(remainingSeconds / 3600);
    const remainingMinutes = Math.floor((remainingSeconds % 3600) / 60);
    const finalSeconds = remainingSeconds % 60;

    let result = '';
    if (days > 0) result += `${days}d `;
    if (remainingHours > 0) result += `${remainingHours}h `;
    if (remainingMinutes > 0) result += `${remainingMinutes}m `;
    if (finalSeconds > 0 || result === '') result += `${finalSeconds}s`;

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
exports.reportingUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = id;

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
        } else {
            return successResponse(
                res,
                null,
                "You have a team",
                200
            );
        }
    } catch (error) {
        console.error("Error fetching reporting TL:", error);
        return errorResponse(res, error.message, "Error fetching reporting TL", 500);
    }
};

async function checkUpdatePermission({ id, type, status, active_status, reopen_status, role_id, res }) {
    let selectQuery;
    // Fetch data based on type
    if (type === 'task') {
        selectQuery = `
            SELECT status, active_status, reopen_status
            FROM tasks
            WHERE deleted_at IS NULL AND id = ?
        `;
    } else if (type === 'sub_task') {
        selectQuery = `
            SELECT status, active_status, reopen_status
            FROM sub_tasks
            WHERE deleted_at IS NULL AND id = ?
        `;
    } else {
        return { allowed: true };
    }

    const [rows] = await db.query(selectQuery, [id]);

    if (!rows.length) {
        return { allowed: false, message: 'Item not found.' };
    }

    const { status: prevStatus, active_status: prevActive, reopen_status: prevReopen } = rows[0];

    // Rule 1: Check TO-DO status
    if (prevStatus === 0 && prevActive === 0 && prevReopen === 0) {
        if (status === 1 && active_status === 1 && reopen_status === 0 && role_id === 4) {
            return { allowed: true };
        } else {
            return errorResponse(res, null, 'Update not allowed based on previous state.', 403);
        }
    }

    // Rule 2: Check IN-PROGRESS status
    if (prevStatus === 1 && prevActive === 1 && prevReopen === 0) {
        return errorResponse(res, null, 'Update not allowed based on previous state.', 403);
    }

    // Rule 3: Check ON-HOLD status
    if (prevStatus === 1 && prevActive === 0 && prevReopen === 0) {
        if (status === 1 && active_status === 1 && reopen_status === 0 && role_id === 4) {
            return { allowed: true };
        } else {
            return errorResponse(res, null, 'Update not allowed based on previous state.', 403);
        }
    }

    // Rule 4: Check IN-REVIEW status
    if (prevStatus === 2 && prevActive === 0 && prevReopen === 0) {
        if (status === 3 || reopen_status === 1) {
            return { allowed: true };
        } else {
            return errorResponse(res, null, 'Update not allowed based on previous state.', 403);
        }
    }

    // Rule 5: Check COMPLETED status
    if (prevStatus === 3 && prevActive === 0 && prevReopen === 0) {
        if (reopen_status === 1) {
            return { allowed: true };
        } else {
            return errorResponse(res, null, 'Update not allowed based on previous state.', 403);
        }
    }

    return { allowed: true };


}
exports.checkUpdatePermission = checkUpdatePermission;


exports.commonStatusGroup = (status, reopenStatus, activeStatus,holdStatus) => {
    status = Number(status);
    reopenStatus = Number(reopenStatus);
    activeStatus = Number(activeStatus);
    if (status === 0 && reopenStatus === 0 && activeStatus === 0 && holdStatus === 0) {
        return "To Do";
    } else if (status === 1 && reopenStatus === 0 && activeStatus === 0 && holdStatus === 0) {
        return "Paused";
    } 
     else if (status === 1 && reopenStatus === 0 && activeStatus === 0 && holdStatus === 1) {
        return "On Hold";
    } 
    else if (status === 2 && reopenStatus === 0) {
        return "Pending Approval";
    } else if (reopenStatus === 1 && activeStatus === 0) {
        return "Reopen";
    } else if (status === 1 && activeStatus === 1) {
        return "InProgress";
    } else if (status === 3) {
        return "Done";
    }
    return "";
};

exports.addHistorydata = async (
    old_data = null,
    new_data = null,
    task_id = null,
    subtask_id = null,
    updated_by,
    status_flag
) => {
    try {
        const textQuery = `SELECT description FROM task_status_flags WHERE id = ?`;
        const [flagResult] = await db.query(textQuery, [status_flag]);
        const text = flagResult[0]?.description || "Unknown action";

        const historyQuery = `
    INSERT INTO task_histories (
      old_data, new_data, task_id, subtask_id, text,
      updated_by, status_flag, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL)
  `;

        const values = [
            old_data || null,
            new_data || null,
            task_id || null,
            subtask_id || null,
            text,
            updated_by,
            status_flag,
        ];

        await db.query(historyQuery, values);
    } catch (error) {
        console.error("Error saving task history:", error);
        return errorResponse(res, null, error.message, 400);
    }
};

// exports.getUserIdFromAccessToken = async (accessToken) => {
//     try {
//         if (!accessToken) {
//             throw new Error('Access token is missing or invalid');
//         }
//         const decoded = jwt.decode(accessToken);
//         const keycloakId = decoded?.sub;
        
//         if (!keycloakId) {
//             throw new Error('Keycloak user ID not found in token');
//         }

//         const keycloakUserQuery = "SELECT id FROM users WHERE keycloak_id = ? AND deleted_at IS NULL LIMIT 1";
//         const [user] = await db.query(keycloakUserQuery, [keycloakId]);


//         if (!user) {
//             throw new Error('User not found in the database');
//         }
//         const userId = user[0].id;
//         return userId; 
//     } catch (error) {
//         console.error('Error retrieving user ID from access token:', error.message);
//         throw new Error('Error retrieving user ID: ' + error.message);
//     }
// };


const productColors = [
  { fill: '#3B2B1A', stroke: '#7A5A38', text: '#FFA25B' },
  { fill: '#412D52', stroke: '#7541A6', text: '#C586FF' },
  { fill: '#49291B', stroke: '#6D351C', text: '#FF631F' },
  { fill: '#1E2A3A', stroke: '#486892', text: '#4AA8FF' },
  { fill: '#183F29', stroke: '#155C35', text: '#0CD464' },
  { fill: '#423B1E', stroke: '#615521', text: '#DCC02E' },
  { fill: '#2B4740', stroke: '#376B5E', text: '#6AF9D7' },
  { fill: '#491B46', stroke: '#6D1C69', text: '#FF1FF4' },
];

const assignedColors = new Map();

let recycledIndex = 0;

exports.getColorForProduct = (productIdOrName) => {
    if (assignedColors.has(productIdOrName)) {
        return assignedColors.get(productIdOrName);
    }

    let color;
    const currentAssignedCount = assignedColors.size;

    if (currentAssignedCount < productColors.length) {
        color = productColors[currentAssignedCount];
    } else {
        color = productColors[recycledIndex % productColors.length];
        recycledIndex++;
    }

    assignedColors.set(productIdOrName, color);
    return color;
};

exports.getTeamuserids = async (user_id) => {
  try {
    const [teamResult] = await db.query(
      `SELECT team_id FROM users WHERE id = ?`,
      [user_id]
    );

    if (!teamResult.length || !teamResult[0].team_id) return [];

    const teamIds = teamResult[0].team_id
      .split(',')
      .map(id => parseInt(id.trim()))
      .filter(id => !isNaN(id));
    if (!teamIds.length) return [];
    const teamUsersQuery = `
      SELECT id FROM users 
      WHERE team_id IN (${teamIds.map(() => '?').join(',')})
      AND id != ?
    `;

    const [teamUsers] = await db.query(teamUsersQuery, [...teamIds, user_id]);

    const UserIds = teamUsers.map(user => user.id);
    return UserIds;
  } catch (error) {
    console.error("Error in getTeamuserids:", error);
    return [];
  }
};


exports.getExcludedRoleIdsByPermission = async (permissionName) => {
    console.log(`Fetching excluded role IDs for permission: ${permissionName}`);
    
  const [rows] = await db.query(
    `
    SELECT rhp.role_id
    FROM role_has_permissions rhp
    JOIN permissions p ON rhp.permission_id = p.id
    WHERE p.name = ?
    `,
    [permissionName]
  );
  return rows.map(r => r.role_id);
};





