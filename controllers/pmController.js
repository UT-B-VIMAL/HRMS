const { fetchProducts, fetchUtilization, fetchAttendance, fetchPmdatas } = require('../api/functions/pmdashboardFunction');
const { successResponse, errorResponse } = require('../helpers/responseHelper');

exports.pmproductsection = async (req, res) => {
  try {
    return await fetchProducts(req.body, res);
  } catch (error) {
    console.error("Error during pmproductsection processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};

exports.pmutilizationsection = async (req, res) => {
  try {
    return await fetchUtilization(req.body, res);
  } catch (error) {
    console.error("Error during pmutilizationsection processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};
exports.pmattendancesection = async (req, res) => {
  try {
    return await fetchAttendance(req.body, res);
  } catch (error) {
    console.error("Error during pmattendancesection processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};
exports.pmdashboardsection = async (req, res) => {
  try {
    return await fetchPmdatas(req.body, res);
  } catch (error) {
    console.error("Error during pmdashboardsection processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};

// Add other sections as needed

