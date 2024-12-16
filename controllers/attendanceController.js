const {  errorResponse } = require("../helpers/responseHelper");
const { getAttendance, updateAttendanceData } = require("../api/functions/attendanceFunction");

exports.getAttendanceList = async (req, res) => {
    try {
        await getAttendance(req,res);
      
      } catch (error) {
        const statusCode = error.status || 500;
        return errorResponse(res, error.message, "Error fetching Attendance", statusCode);
      }
  };

exports.updateAttendance = async (req, res) => {
    try {
        await updateAttendanceData(req,res);
      
      } catch (error) {
        const statusCode = error.status || 500;
        return errorResponse(res, error.message, "Error Updating Attendance", statusCode);
      }
  };
  


  


