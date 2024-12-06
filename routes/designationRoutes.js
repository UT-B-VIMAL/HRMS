const express = require("express");
const router = express.Router();
const DesignationController = require("../controllers/designation/designationController");
// const checkMethod = require("../helpers/checkMethod");

router.post("/designations", DesignationController.insert);
router.get("/designations", DesignationController.getAll);
router.get("/designations/:id", DesignationController.find);
router.put("/designations/:id", DesignationController.update);
router.delete("/designations/:id", DesignationController.delete);

module.exports = router;
