const { fetchPendingTask, fetchDailybreakdown, fetchStatistics, fetchStatisticschart, fetchRatings } = require('../api/functions/empdashboardFunction');
const { successResponse, errorResponse } = require('../helpers/responseHelper');

exports.emppendingtasksection = async (req, res) => {
  try {
    return await fetchPendingTask(req, res);
  } catch (error) {
    console.error("Error during emppendingtasksection processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};
exports.empdailybreakdownsection = async (req, res) => {
  try {
    return await fetchDailybreakdown(req, res);
  } catch (error) {
    console.error("Error during empdailybreakdownsection processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};
exports.empstatisticssection = async (req, res) => {
  try {
    return await fetchStatistics(req, res);
  } catch (error) {
    console.error("Error during empstatisticssection processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};
exports.empstatisticschartsection = async (req, res) => {
  try {
    return await fetchStatisticschart(req, res);
  } catch (error) {
    console.error("Error during empstatisticschartsection processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};
exports.empratingsection = async (req, res) => {
  try {
    return await fetchRatings(req, res);
  } catch (error) {
    console.error("Error during empratingsection processing:", error.message);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};