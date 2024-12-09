const { fetchAttendance } = require('../api/functions/tldashboardFunction');
const { successResponse, errorResponse } = require('../helpers/responseHelper');

exports.tlattendancesection = async (req, res) => {
  try {
    return await fetchAttendance(req, res);
  } catch (error) {
    console.error("Error during tlattendancesection processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};



// Add other sections as needed

