const moment = require("moment");
const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
} = require("../../helpers/responseHelper");

const projectRequest = async (req, res) => {
    try {
      const { product_id, project_id, user_id, date, status = 0, search } = req.query;
  
      let query = `
        SELECT 
          t.id AS task_id,
          t.name AS task_name,
          t.estimated_hours AS task_estimated_hours,
          t.total_hours_worked AS task_total_hours_worked,
          t.updated_at AS task_updated_at,
          tsut.start_time AS task_start_time,
          tsut.end_time AS task_end_time,
          u.id AS user_id,
          u.first_name AS user_name,
          u.employee_id AS employee_id,
          p.id AS product_id,
          p.name AS product_name,
          pr.id AS project_id,
          pr.name AS project_name,
          st.id AS subtask_id,
          st.name AS subtask_name,
          st.estimated_hours AS subtask_estimated_hours,
          st.total_hours_worked AS subtask_total_hours_worked,
          st.updated_at AS subtask_updated_at,
          tsut_sub.start_time AS subtask_start_time,
          tsut_sub.end_time AS subtask_end_time,
          DATE(t.created_at) AS task_date,
          t.status AS task_status
        FROM 
          tasks t
        LEFT JOIN 
          users u ON u.id = t.user_id
        LEFT JOIN 
          products p ON p.id = t.product_id
        LEFT JOIN 
          projects pr ON pr.id = t.project_id
        LEFT JOIN 
          sub_tasks st ON st.task_id = t.id AND st.deleted_at IS NULL
        LEFT JOIN 
          sub_tasks_user_timeline tsut ON tsut.task_id = t.id AND tsut.deleted_at IS NULL
        LEFT JOIN 
          sub_tasks_user_timeline tsut_sub ON tsut_sub.subtask_id = st.id AND tsut_sub.deleted_at IS NULL
        WHERE 
          t.deleted_at IS NULL
          ${product_id ? `AND (t.product_id = ? OR st.product_id = ?)` : ""}  
          ${project_id ? `AND (t.project_id = ? OR st.project_id = ?)` : ""}  
          ${user_id ? `AND t.user_id = ?` : ""}  
          ${date ? `AND DATE(t.created_at) = ?` : ""}
          ${status !== undefined ? `AND t.status = ?` : ""}  
          ${search ? `AND (t.name LIKE ? OR st.name LIKE ?)` : ""}  
      `;
  
      const values = [];
      if (product_id) {
        values.push(product_id);  
        values.push(product_id); 
      }
      if (project_id) {
        values.push(project_id);  
        values.push(project_id); 
      }
      if (user_id) values.push(user_id);  
      if (date) values.push(date);
      if (status !== undefined) values.push(status);
      if (search) {
        const searchTerm = `%${search}%`; 
        values.push(searchTerm);  
        values.push(searchTerm);  
      }
  
      const [result] = await db.execute(query, values);
  
      const data = result.map((row) => {
        const taskStartTime = row.task_start_time ? moment(row.task_start_time).format("YYYY-MM-DD HH:mm:ss") : "Not started";
        const taskEndTime = row.task_end_time ? moment(row.task_end_time).format("YYYY-MM-DD HH:mm:ss") : "Not completed";
        
        const subtaskStartTime = row.subtask_start_time ? moment(row.subtask_start_time).format("YYYY-MM-DD HH:mm:ss") : "Not started";
        const subtaskEndTime = row.subtask_end_time ? moment(row.subtask_end_time).format("YYYY-MM-DD HH:mm:ss") : "Not completed";
  
        return {
          task_name: row.task_name || row.subtask_name,  
          task_start_time: taskStartTime,
          task_end_time: taskEndTime,
          subtask_start_time: subtaskStartTime,
          subtask_end_time: subtaskEndTime,
          estimated_time: row.task_estimated_hours || row.subtask_estimated_hours,
          task_duration: row.task_updated_at ? moment(row.task_updated_at).fromNow() : "Not started",
          user_id: row.user_id,
          employee_id: row.employee_id,
          assignee: row.user_name,
          product_id: row.product_id,
          product_name: row.product_name,
          project_id: row.project_id,
          project_name: row.project_name,
          task_date: moment(row.task_date).format("YYYY-MM-DD"),
          task_status: row.task_status === 0 ? 'TO DO' : row.task_status === 1 ? 'In Progress' : 'Done',
        };
      });
  
      successResponse(
        res,
        data,
        data.length === 0 ? "No tasks or subtasks found" : "Tasks and subtasks retrieved successfully",
        200
      );
    } catch (error) {
      console.error("Error fetching tasks and subtasks:", error);
      return errorResponse(res, error.message, "Server error", 500);
    }
  };
   
module.exports = { projectRequest };
