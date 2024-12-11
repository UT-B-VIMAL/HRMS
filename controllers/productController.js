const { 
  createProduct, 
  updateProduct, 
  deleteProduct, 
  getProduct, 
  getAllProducts 
} = require('../api/functions/productFunction');
const {errorResponse}  = require('../helpers/responseHelper');

const productController = {
  createProduct: async (req, res) => {
    try {
      const payload = req.body;
     
      await createProduct(payload, res);

    } catch (error) {
      console.error('Error creating product:', error.message);
      return errorResponse(res, error.message, 'Error creating product', 500);
    }
  },

  updateProduct: async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body;


      await updateProduct(id, payload, res);

    } catch (error) {
      console.error('Error updating product:', error.message);
      return errorResponse(res, error.message, 'Error updating product', 500);
    }
  },

  deleteProduct: async (req, res) => {
    try {
      const { id } = req.params;
      await deleteProduct(id, res);
    } catch (error) {
      console.error('Error deleting product:', error.message);
      return errorResponse(res, error.message, 'Error deleting product', 500);
    }
  },

  getProduct: async (req, res) => {
    try {
      const { id } = req.params;
      await getProduct(id, res);
    } catch (error) {
      console.error('Error fetching product:', error.message);
      return errorResponse(res, error.message, 'Error fetching product', 500);
    }
  },

  getAllProducts: async (req, res) => {
    try {
      const queryParams = req.query;
      await getAllProducts(queryParams, res);
    } catch (error) {
      console.error('Error fetching all products:', error.message);
      return errorResponse(res, error.message, 'Error fetching all products', 500);
    }
  },
};

module.exports = productController;
