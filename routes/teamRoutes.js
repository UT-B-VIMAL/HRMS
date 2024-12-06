const express = require("express");
const router = express.Router();
const teamController = require("../controllers/team/teamController");
// const checkMethod = require("../helpers/checkMethod");

router.post("/team", teamController.insert);
router.get("/team", teamController.getAll);
router.get("/team/:id", teamController.find);
router.put("/team/:id", teamController.update);
router.delete("/team/:id", teamController.delete);

module.exports = router;
