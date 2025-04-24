const { fetchAttendance, fetchTlrating, fetchTLproducts, fetchTLresourceallotment, fetchTLdatas, fetchTlviewproductdata } = require('../api/functions/tldashboardFunction');
const { successResponse, errorResponse } = require('../helpers/responseHelper');

exports.tlattendancesection = async (req, res) => {
  try {
    return await fetchAttendance(req, res);
  } catch (error) {
    console.error("Error during tlattendancesection processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};
exports.tlratingsection = async (req, res) => {
  try {
    return await fetchTlrating(req, res);
  } catch (error) {
    console.error("Error during tlratingsection processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};
exports.tlproductsection = async (req, res) => {
  try {
    return await fetchTLproducts(req, res);
  } catch (error) {
    console.error("Error during tlproductsection processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};
exports.tlresourceallotmentsection = async (req, res) => {
  try {
    return await fetchTLresourceallotment(req, res);
  } catch (error) {
    console.error("Error during tlresourceallotmentsection processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};
exports.tldashboardsection = async (req, res) => {
  try {
    return await fetchTLdatas(req, res);
  } catch (error) {
    console.error("Error during tldashboardsection processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};

exports.tlviewproductsection = async (req, res) => {
  try {
    const { product_id } = req.query;  // Accessing ID from query params
    if (!product_id) {
      return errorResponse(res, null, 'Product ID is required', 400);
    }

    // Call the function to fetch product data
    return await fetchTlviewproductdata(req, res);
  } catch (error) {
    // Log and return an error response
    console.error("Error during pmviewproductsection processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};

// Add other sections as needed

