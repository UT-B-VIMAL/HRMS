const { 
    getAllData,
    getticketCount,
    reportingUser
  } = require('../api/functions/commonFunction');
  const {errorResponse}  = require('../helpers/responseHelper');

  const commonController = {
  getDropDownList: async (req, res) => {
    try {
      const payload = req.query;

      await getAllData(payload, res);
    } catch (error) {
      return errorResponse(res, error.message, 'Error  fetching Data', 500);
    }
  },
  getTicketCount: async (req, res) => {
    try {

      await getticketCount(req, res);
    } catch (error) {
      return errorResponse(res, error.message, 'Error  fetching Data', 500);
    }
  },
  getreportinguser: async (req, res) => {
    try {

      await reportingUser(req, res);
    } catch (error) {
      return errorResponse(res, error.message, 'Error  fetching Data', 500);
    }
  },
}


module.exports = commonController;