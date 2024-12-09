const db = require("../../config/db");
const { successResponse, errorResponse } = require("../../helpers/responseHelper");

exports.fetchAttendance = async (req, res) => {
    try {
      const currentTime = new Date(); 
      const cutoffTime = new Date();
      cutoffTime.setHours(13, 30, 0, 0); // 1:30 PM cutoff
      const today = new Date().toISOString().split('T')[0]; 
      const { user_id } = req.query; 
  
      if (!user_id) {
        return res.status(400).json({ message: 'user_id is required' });
      }
      const [teamResult] = await db.query("SELECT id FROM teams WHERE reporting_user_id = ?", [user_id]);
      
      if (teamResult.length === 0) {
        return res.status(404).json({ message: 'No teams found for the given user_id' });
      }
  
      const teamIds = teamResult.map(team => team.id);
      const [totalStrengthResult] = await db.query("SELECT COUNT(*) AS total_strength FROM users WHERE team_id IN (?)", [teamIds]);
      const totalStrength = totalStrengthResult[0].total_strength;
      const [absentEmployees] = await db.query(`
        SELECT e.user_id, u.name, 'Absent' AS status
        FROM employee_leave e
        JOIN users u ON e.user_id = u.id
        WHERE DATE(e.date) = ?
        AND (
          e.day_type = 1
          OR (
            e.day_type = 2 AND e.half_type = 1 AND ? < ?
          )
        )
        AND u.team_id IN (?)
      `, [today, currentTime, cutoffTime, teamIds]);
  
      const absentEmployeeIds = absentEmployees.map(emp => emp.user_id);
      let absentEmployeeIdsCondition = absentEmployeeIds.length > 0 ? `AND id NOT IN (?)` : '';
  
      const [presentEmployees] = await db.query(`
        SELECT id, name
        FROM users
        WHERE team_id IN (?)
        ${absentEmployeeIdsCondition}
      `, absentEmployeeIds.length > 0 ? [teamIds, absentEmployeeIds] : [teamIds]);
      const attendanceList = [...absentEmployees, ...presentEmployees.map(emp => ({
        employee_id: emp.id,
        employee_name: emp.name,
        status: 'Present',
      }))];
      const totalAbsentEmployees = absentEmployees.length;
      const totalPresentEmployees = presentEmployees.length;
      const presentPercentage = totalStrength ? Math.round((totalPresentEmployees / totalStrength) * 100) : 0;
      const absentPercentage = totalStrength ? Math.round((totalAbsentEmployees / totalStrength) * 100) : 0;
  
      const attendanceWithInitials = attendanceList.map((employee) => {
        const nameParts = employee.employee_name.split(' ');
        let initials = '';
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
  
      return successResponse(
        res,
        {
          total_strength: totalStrength,
          total_present_employees: totalPresentEmployees,
          total_absent_employees: totalAbsentEmployees,
          present_percentage: presentPercentage,
          absent_percentage: absentPercentage,
          attendance_list: attendanceWithInitials,
        },
        "Attendance data fetched successfully",
        200
      );
    } catch (error) {
      console.error("Error fetching attendance:", error);
      return res.status(500).json({
        message: "Error fetching attendance",
        error: error.message,
      });
    }
  };
  
  
  
  
  
  
  
  