const { getTimeListReport } = require('../api/functions/reportFunction');
const { successResponse, errorResponse } = require('../helpers/responseHelper');


exports.getTimeListReport= async (req, res) => {
    try {
        await getTimeListReport(req,res);
    } catch (error) {
        return errorResponse(res, error.message, 'Error retrieving idle employee', 500);
    }
};

