const express = require("express");
const router = express.Router();
const productController = require("../controllers/product/productController");
// const checkMethod = require("../helpers/checkMethod");

router.post("/products", productController.insert);
router.get("/products", productController.getAll);
router.get("/products/:id", productController.find);
router.put("/products/:id", productController.update);
router.delete("/products/:id", productController.delete);

module.exports = router;
