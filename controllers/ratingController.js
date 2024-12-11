const { getAllRatings, updateRating } = require("../api/functions/ratingFunction");
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

exports.ratingUpdation = async (req, res) => {
  try {
    const payload = req.body;
    await updateRating(payload,res);
  } catch (error) {
    const statusCode = error.status || 500;
    return errorResponse(res, error.message, "Error updating rating", statusCode);
  }
};
