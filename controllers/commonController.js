const { 
    getAllData
  } = require('../api/functions/commonFunction');
  const {errorResponse}  = require('../helpers/responseHelper');

  const commonController = {
  getDropDownList: async (req, res) => {
    try {
      const payload = req.body;

      await getAllData(payload, res);
    } catch (error) {
      return errorResponse(res, error.message, 'Error fetching Data', 500);
    }
  },
}


module.exports = commonController;