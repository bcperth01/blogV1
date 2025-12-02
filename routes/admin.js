import express from "express";
import { requireAuth } from "./auth.js";
import { requireRole } from "./auth.js";
const router = express.Router();

//****************************************************************
// NOTE: Every route is protected, to avoid reaching via direct url
// ****************************************************************

// This API end point displays the screen to manage comments
router.get("/comments", requireRole("admin"), function (req, res) {
  res.render("manage/comments", {
    res: res.locals,
  });
});

// This API end point displays the screen to manage documents
router.get("/documents", requireRole("admin"), function (req, res, next) {
  res.render("manage/documents", {
    res: res.locals,
  });
});

// This API end point displays the screen to manage backups
router.get("/backups", requireRole("admin"), function (req, res, next) {
  res.render("manage/backups", {
    res: res.locals,
  });
});

export default router;
