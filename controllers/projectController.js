const { 
  createProject, 
  updateProject, 
  deleteProject, 
  getProject, 
  getAllProjects,
  projectRequest,
  projectStatus,
  projectStatus_ToDo,
  getRequestupdate,
  getRequestchange
} = require('../api/functions/projectFunction');
const {errorResponse}  = require('../helpers/responseHelper');

const projectController = {
  createProject: async (req, res) => {
    try {
      const payload = req.body;
      await createProject(payload, res);
    } catch (error) {
      console.error('Error creating project:', error.message);
      return errorResponse(res, error.message, 'Error creating project', 500);
    }
  },

  updateProject: async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body;

      await updateProject(id, payload, res);

    } catch (error) {
      console.error('Error updating project:', error.message);
      return errorResponse(res, error.message, 'Error updating project', 500);
    }
  },

  deleteProject: async (req, res) => {
    try {
      const { id } = req.params;
      await deleteProject(id, res);
    } catch (error) {
      console.error('Error deleting project:', error.message);
      return errorResponse(res, error.message, 'Error deleting project', 500);
    }
  },

  getProject: async (req, res) => {
    try {
      const { id } = req.params;
      await getProject(id, res);
    } catch (error) {
      console.error('Error fetching project:', error.message);
      return errorResponse(res, error.message, 'Error fetching project', 500);
    }
  },

  getAllProjects: async (req, res) => {
    try {
      const queryParams = req.query;
      await getAllProjects(queryParams, res);
    } catch (error) {
      console.error('Error fetching all projects:', error.message);
      return errorResponse(res, error.message, 'Error fetching all projects', 500);
    }
  },


project_status: async (req, res) => {
  try {
    const { status } = req.query;
    console.log(status);
  
      await projectStatus(req,res);
  
    // if (status == "0") {
    //   await projectStatus_ToDo(req, res);
    // } else {
    //   await projectStatus(req,res);
    // }
    
} catch (error) {
    return errorResponse(res, error.message, 'Error retrieving idle employee', 500);
}
},
project_request: async (req, res) => {
  try {
    await projectRequest(req,res);
} catch (error) {
    return errorResponse(res, error.message, 'Error retrieving Project request', 500);
}
},
project_requestupdate: async (req, res) => {
  try {
    await getRequestupdate(req,res);
} catch (error) {
    return errorResponse(res, error.message, 'Error retrieving task or subtask data', 500);
}
},
project_requestchange: async (req, res) => {
  try {
        const { id } = req.params;
        const payload = req.body;
        await getRequestchange(id, payload, res,req);
} catch (error) {
    return errorResponse(res, error.message, 'Error updating task or subtask', 500);
}
},

};
module.exports = projectController;
