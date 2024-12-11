const { 
  createDesignation, 
  updateDesignation, 
  deleteDesignation, 
  getDesignation, 
  getAllDesignations 
} = require('../api/functions/DesignationFunction');
const {errorResponse}  = require('../helpers/responseHelper');

const designationController = {
  createDesignation: async (req, res) => {
    try {
      const payload = req.body;
      await createDesignation(payload, res);

    } catch (error) {
      console.error('Error creating designation:', error.message);
      return errorResponse(res, error.message, 'Error creating designation', 500);
    }
  },

  updateDesignation: async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body;

      await updateDesignation(id, payload, res);

    } catch (error) {
      console.error('Error updating designation:', error.message);
      return errorResponse(res, error.message, 'Error updating designation', 500);
    }
  },

  deleteDesignation: async (req, res) => {
    try {
      const { id } = req.params;
      await deleteDesignation(id, res);
    } catch (error) {
      console.error('Error deleting designation:', error.message);
      return errorResponse(res, error.message, 'Error deleting designation', 500);
    }
  },

  getDesignation: async (req, res) => {
    try {
      const { id } = req.params;
      await getDesignation(id, res);
    } catch (error) {
      console.error('Error fetching designation:', error.message);
      return errorResponse(res, error.message, 'Error fetching designation', 500);
    }
  },

  getAllDesignations: async (req, res) => {
    try {
      const queryParams = req.query;
      await getAllDesignations(queryParams, res);
    } catch (error) {
      console.error('Error fetching all designations:', error.message);
      return errorResponse(res, error.message, 'Error fetching all designations', 500);
    }
  },
};

module.exports = designationController;
