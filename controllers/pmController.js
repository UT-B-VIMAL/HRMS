const { fetchProducts, fetchUtilization, fetchAttendance, fetchPmdatas, fetchPmviewproductdata, fetchUserTasksByProduct,fetchTeamUtilizationAndAttendance,getProjectCompletion } = require('../api/functions/pmdashboardFunction');
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
    return await fetchUtilization(req, res);
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
    return await fetchPmdatas(req, res);
  } catch (error) {
    console.error("Error during pmdashboardsection processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};
exports.pmviewproductsection = async (req, res) => {
  try {
    const { product_id } = req.query;  // Accessing ID from query params
    if (!product_id) {
      return errorResponse(res, null, 'Product ID is required', 400);
    }

    // Call the function to fetch product data
    return await fetchPmviewproductdata(req, res);
  } catch (error) {
    // Log and return an error response
    console.error("Error during pmviewproductsection processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};


exports.pmfetchUserTasksByProduct = async (req, res) => {
  try {
    return await fetchUserTasksByProduct(req, res);
  } catch (error) {
    console.error("Error during pmfetchUserTasksByProduct processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};
exports.pmUtilizationAndAttendance = async (req, res) => {
  try {
    return await fetchTeamUtilizationAndAttendance(req, res);
  } catch (error) {
    console.error("Error during pmfetchUserTasksByProduct processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};

exports.getProjectCompletionPercentage = async (req, res) => {
  try {
    return await getProjectCompletion(req, res);
  } catch (error) {
    console.error("Error during getProjectCompletionPercentage processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};


// Add other sections as needed

