const { getTeamwiseProductivity ,get_individualProductivity} = require('../api/functions/productivityFunction');
const { successResponse, errorResponse } = require('../helpers/responseHelper');


exports.get_teamwiseProductivity= async (req, res) => {
    try {
        await getTeamwiseProductivity(req,res);
    } catch (error) {
        return errorResponse(res, error.message, 'Error retrieving idle employee', 500);
    }
};

// exports.get_individualProductivity= async (req, res) => {
//     try {
//         await get_individualProductivity(res);
//     } catch (error) {
//         return errorResponse(res, error.message, 'Error retrieving idle employee', 500);
//     }
// };
