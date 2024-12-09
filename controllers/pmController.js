const { fetchProducts, fetchUtilization, fetchAttendance, fetchPmdatas, fetchPmviewproductdata } = require('../api/functions/pmdashboardFunction');
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



// Add other sections as needed

