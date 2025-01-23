const { getAllRatings, getAnnualRatings,updateRating, getRatings, getRatingById, ratingUpdation } = require("../api/functions/ratingFunction");
const { successResponse, errorResponse } = require("../helpers/responseHelper");

exports.getAllRatings = async (req, res) => {
  try {
    const queryParams = req.query;
    await getAllRatings(queryParams,res);
  
  } catch (error) {
    const statusCode = error.status || 500;
    return errorResponse(res, error.message, "Error fetching ratings", statusCode);
  }
};

exports.getAnnualRatings = async (req, res) => {
  try {
    const queryParams = req.query;
    await getAnnualRatings(queryParams,res);
  
  } catch (error) {
    const statusCode = error.status || 500;
    return errorResponse(res, error.message, "Error fetching ratings", statusCode);
  }
};

exports.ratingUpdation = async (req, res) => {
  try {
    const payload = req.body;
    await updateRating(payload,res);
  } catch (error) {
    const statusCode = error.status || 500;
    return errorResponse(res, error.message, "Error updating rating", statusCode);
  }
};
exports.ratingUpdations = async (req, res) => {
  try {
    const payload = req.body;
    await ratingUpdation(payload,res);
  } catch (error) {
    const statusCode = error.status || 500;
    return errorResponse(res, error.message, "Error updating rating", statusCode);
  }
}
exports.getRating = async (req, res) => {
  try {
    const reqbody = req.body;
    await getRatingById(reqbody,res);
  
  } catch (error) {
    const statusCode = error.status || 500;
    return errorResponse(res, error.message, "Error fetching ratings", statusCode);
  }
};

exports.getAllUserRating = async (req, res) => {
  try {
    const reqbody = req.query;
    await getRatings(reqbody,res);
  
  } catch (error) {
    const statusCode = error.status || 500;
    return errorResponse(res, error.message, "Error fetching ratings", statusCode);
  }
};