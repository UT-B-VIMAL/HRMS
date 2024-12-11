const { 
  createTeam, 
  updateTeam, 
  deleteTeam, 
  getTeam, 
  getAllTeams 
} = require('../api/functions/teamFunction');
const {errorResponse}  = require('../helpers/responseHelper');

const teamController = {
  createTeam: async (req, res) => {
    try {
      const payload = req.body;
    
      await createTeam(payload, res);

    } catch (error) {
      console.error('Error creating team:', error.message);
      return errorResponse(res, error.message, 'Error creating team', 500);
    }
  },

  updateTeam: async (req, res) => {
    try {
      const { id } = req.params;
    
      await updateTeam(id, payload, res);

    } catch (error) {
      console.error('Error updating team:', error.message);
      return errorResponse(res, error.message, 'Error updating team', 500);
    }
  },

  deleteTeam: async (req, res) => {
    try {
      const { id } = req.params;
      await deleteTeam(id, res);
    } catch (error) {
      console.error('Error deleting team:', error.message);
      return errorResponse(res, error.message, 'Error deleting team', 500);
    }
  },

  getTeam: async (req, res) => {
    try {
      const { id } = req.params;
      await getTeam(id, res);
    } catch (error) {
      console.error('Error fetching team:', error.message);
      return errorResponse(res, error.message, 'Error fetching team', 500);
    }
  },

  getAllTeams: async (req, res) => {
    try {
      const queryParams = req.query;
      await getAllTeams(queryParams, res);
    } catch (error) {
      console.error('Error fetching all teams:', error.message);
      return errorResponse(res, error.message, 'Error fetching all teams', 500);
    }
  },
};

module.exports = teamController;
