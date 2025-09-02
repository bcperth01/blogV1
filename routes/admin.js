import express from "express";
const router = express.Router();

//****************************************************************
// NOTE: Every route is protected, to avoid reaching via direct url
// ****************************************************************

// This API end point displays the screen to manage comments
router.get("/comments", function (req, res, next) {
  if (!req.isAuthenticated() || res.locals.member_type !== "admin") {
    // if the user is not logged in or not an admin, redirect to unauthorised
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("You are not authorised for this page") +
        "&title=" +
        encodeURIComponent("Not Authorised") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  res.render("manage/comments", {
    res: res.locals,
  });
});

// This API end point displays the screen to manage documents
router.get("/documents", function (req, res, next) {
  if (!req.isAuthenticated() || res.locals.member_type !== "admin") {
    // if the user is not logged in or not an admin, redirect to unauthorised
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("You are not authorised for this page") +
        "&title=" +
        encodeURIComponent("Not Authorised") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  res.render("manage/documents", {
    res: res.locals,
  });
});

// This API end point displays the screen to manage backups
router.get("/backups", function (req, res, next) {
  if (!req.isAuthenticated() || res.locals.member_type !== "admin") {
    // if the user is not logged in or not an admin, redirect to unauthorised
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("You are not authorised for this page") +
        "&title=" +
        encodeURIComponent("Not Authorised") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  res.render("manage/backups", {
    res: res.locals,
  });
});

export default router;
