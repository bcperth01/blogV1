import express from "express";
import passport from "passport";
import localStrategy from "passport-local";
import crypto from "crypto";
import { getAllUsers } from "../pgQueries/queries.js";

import pg_pool from "../pgQueries/connectPool.js";

const router = express.Router();

const badLoginMessage = "Incorrect username or password";

//TDDO: move this to a utility module within auth
function verifyPasswordStrength(password) {
  if (password.length > 7) {
    return true;
  }
  return false;
}

// Function to display unauthorised access message

// Function for Passport to verify a username/password
async function verifyUser(username, password, cb) {
  let result = {};
  try {
    result = await pg_pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    console.log("result in verify user", result.rows[0]);
  } catch (err) {
    if (err) {
      console.log("error", err);
      return cb(err);
    }
  }
  if (result.rowCount === 0) {
    return cb(null, false, {
      message: badLoginMessage, // Note: THis message will be added to req.session.messages[]
    });
  }

  let row = result.rows[0];
  crypto.pbkdf2(
    password,
    row.salt,
    310000,
    32,
    "sha256",
    function (err, hashedPassword) {
      console.log("hashed password", hashedPassword);
      if (err) {
        return cb(err);
      }
      if (
        !crypto.timingSafeEqual(
          Buffer.from(row.hashed_password, "utf-8"),
          hashedPassword
        )
      ) {
        return cb(null, false, {
          message: badLoginMessage, // Note: THis message will be added to req.session.messages[]
        });
      }
      return cb(null, row);
    }
  );
}

/**
 * Serialise and deserialise are used to persist and retrieve user data in the session store
 * serializeUser() in this case is passed the user object and told to save an object
 * containing the user id and username
 * deserializeUser() in this case is told to return that object from the session data.
 * Note: If we only passed the user.id to serializeUser() then we could use deserializeUser()
 * to read the user table and return whatever data us needed,
 */
passport.serializeUser(function (user, cb) {
  process.nextTick(function () {
    cb(null, {
      id: user.id,
      username: user.username,
      member_type: user.member_type,
    });
  });
});

passport.deserializeUser(function (user, cb) {
  process.nextTick(function () {
    return cb(null, user);
  });
});

// Apply the passport middleware
passport.use(new localStrategy(verifyUser));

//****************************************************************
// NOTE: Every route is protected, to avoid reaching via direct url
// ****************************************************************

// Route to display:
// - unauthorised access message
// - advise if page does not exist
// and to redirect the user to a different route
router.get("/unauthorised", function (req, res, next) {
  const title = req.query.title ? req.query.title : "Unauthorised Access";
  const err_msg = req.query.err_msg
    ? req.query.err_msg
    : "You are not authorised to access this page";
  const route = req.query.route ? req.query.route : "/";
  res.render("auth/unauthorised", {
    err_msg,
    res: res.locals,
    title,
    route, // the route to redirect to when the user clicks the button
  });
});

// This route displays the login form.
// If there has been previous login failures,
// req.session.messages[] will have an array of failure messages
// The session is replaced with a new session after a successful login
/*****************************************
 * Security Note: Even if routes cannot be accessed via menus or links...
 * ...they can still be accessed via direct URL entry.
 * Therefore every route needs to be protected.
 ****************************************/
// Security: Block access if user is already logged in
//           TODO: Block if too many log-in attempts have been made
router.get("/login", function (req, res, next) {
  if (req.user) {
    // if the user is already logged in, redirect to unauthorised
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("You are already logged in") +
        "&title=" +
        encodeURIComponent("Bad Route") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  // res.redirect("/auth/unauthorised");
  res.render("auth/login", {
    err_msg:
      req.session.messages?.length > 0
        ? req.session.messages[req.session.messages.length - 1]
        : "",
    res: res.locals,
  });
});

// This route authenticates the username, password
router.post(
  "/login/password",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/auth/login",
    failureMessage: true, // Enables error messages to be pushed to req.session.messages[]
  })
);

// logs out the user and redirects to home
// Security: Block access if user is not logged in
router.get("/logout", function (req, res, next) {
  if (!req.isAuthenticated()) {
    // if the user is not logged in, redirect to unauthorised
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("You are not logged in") +
        "&title=" +
        encodeURIComponent("Bad Route") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

// Presents the admin screen - so far this screen allows users to be managed
// TODO: add admin functions to manage documents and comments
router.get("/admin", async function (req, res, next) {
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
  try {
    const users = await getAllUsers(); // an array of objects
    let none_msg = users.length === 0 ? "Users table is empty" : "";
    // console.log("All users", users);
    res.render("auth/manageUsers", {
      users,
      res: res.locals,
      none_msg,
    });
  } catch (error) {
    res.redirect("/error/A Search Error Has Occurred in route %2Fauth%2Fadmin");
    return;
  }
});

/**
 * Note: The "editUser" form can be activated from 3 places
 * 1. Via the /auth/signup route for a new user registering
 * 2. Via the "Add New User" button for the admin user from the /auth/admin route
 * 3. Via the "edit" buttons in the user list display by /auth/route (admin only)
 * 4: Via the "editProfile" route for users to edit their own profile/password
 */

// 1. Via the /auth/signup route for a new user registering
// Security: Block this route if the user is logged in
router.get("/signup", function (req, res, next) {
  if (req.isAuthenticated()) {
    // if the user is logged in then cant register again
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("You are already registered") +
        "&title=" +
        encodeURIComponent("Not Authorised") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  let form1 = req.query.form
    ? JSON.parse(decodeURIComponent(req.query.form))
    : {};
  console.log("form1 = ", form1);
  res.render("auth/editUser", {
    err_msg: req.query.err_msg ? req.query.err_msg : "",
    form1: form1,
    res: res.locals,
    type: "new", // tells the signup form that this is a new user
  });
}); // see POST method below for when a new user is being saved

// 2. Via the "Add New User" button for the admin user from the /auth/admin route
// Security: Block this route:
//           - if the user is logged in and not an admin
//           - if the user is not logged in
router.get("/addUser", function (req, res, next) {
  // if the user is not logged in or is an admin, redirect to unauthorised
  if (
    !req.isAuthenticated() ||
    (req.isAuthenticated() && res.locals.member_type !== "admin")
  ) {
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("Inaccessible Route") +
        "&title=" +
        encodeURIComponent("Not Authorised") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  let form1 = req.query.form
    ? JSON.parse(decodeURIComponent(req.query.form))
    : {};
  console.log("form1 = ", form1);
  res.render("auth/editUser", {
    err_msg: req.query.err_msg ? req.query.err_msg : "",
    form1: form1,
    res: res.locals,
    type: "new", // tells the signup form that this is a new user
  });
});

// 3. Via the "edit" buttons in the user list display by /auth/route (to edit an existing user)
// Security: Block this route:
//           - if the user is not logged in as admin
// Note: See below for POST method to save changes to a user's profile
router.get("/edit", async function (req, res, next) {
  // if the user is not logged in as admin, redirect to unauthorised
  if (!(req.isAuthenticated() && res.locals.member_type === "admin")) {
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("Inaccessible Route") +
        "&title=" +
        encodeURIComponent("Not Authorised") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  if (!req.query.id) {
    // if no id is provided, redirect to unauthorised
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("No user id provided") +
        "&title=" +
        encodeURIComponent("Incomplete Route") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  let result = await pg_pool.query("select * from users where id = $1", [
    req.query.id,
  ]);
  console.log("edit user query result", result.rows[0]);
  if (result.rowCount === 0) {
    // if no user is found, redirect to unauthorised
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("No user found with that id") +
        "&title=" +
        encodeURIComponent("Not Found") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  res.render("auth/editUser", {
    err_msg: req.query.err_msg ? req.query.err_msg : "",
    form1: result.rows[0],
    res: res.locals,
    type: "edit", // tells the edit/signup form we're editing an existing user
  });
}); // see POST method below for when an existing user is being edited

// 4. Via the "editProfile" route that a non admin user has in his menu bar
// Security: Block this route:
//           - if the user is not logged in
router.get("/editProfile", async function (req, res, next) {
  console.log("res.locals", res.locals);
  if (!req.isAuthenticated()) {
    // if the user is not logged in then block access
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
  if (!res.locals.id) {
    // if no id is provided, redirect to unauthorised
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("No user id provided") +
        "&title=" +
        encodeURIComponent("Incomplete Route") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  let result = await pg_pool.query("select * from users where id = $1", [
    res.locals.id,
  ]);
  console.log("edit user query result", result.rows[0]);
  if (result.rowCount === 0) {
    // if no user is found, redirect to unauthorised
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("No user found with that id") +
        "&title=" +
        encodeURIComponent("Not Found") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  res.render("auth/editUser", {
    err_msg: req.query.err_msg ? req.query.err_msg : "",
    form1: result.rows[0],
    res: res.locals,
    type: "profile", // tells the edit/signup form we're editing an existing user
  });
});

// The delete GET route
router.get("/delete", async function (req, res, next) {
  // if the user is not logged in as admin, redirect to unauthorised
  if (!(req.isAuthenticated() && res.locals.member_type === "admin")) {
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("Inaccessible Route") +
        "&title=" +
        encodeURIComponent("Not Authorised") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  if (!req.query?.id?.length > 12) {
    // if no id is provided, redirect to unauthorised
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("No user id provided") +
        "&title=" +
        encodeURIComponent("Incomplete Route") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  console.log("id", req.query.id, "username", req.query.username);
  let result = await pg_pool.query("delete from users where id = $1", [
    req.query.id,
  ]);
  if (result.rowCount === 0) {
    // if no user is found, redirect to unauthorised
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("No user found with that id") +
        "&title=" +
        encodeURIComponent("Not Found") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  console.log("result", result);
  res.redirect("admin");
});

// TODO: The deleteConfirm PUT route

// This cancels the edit or add user form
//          and the login form
// Security: No need to block this route as it redirects only
router.get("/cancel", function (req, res, next) {
  let index = req.rawHeaders.findIndex((element) => element === "Referer");
  console.log("index", index);
  if (
    req.rawHeaders[index + 1].includes("auth/edit") ||
    req.rawHeaders[index + 1].includes("auth/addUser")
  ) {
    res.redirect("admin");
  } else {
    res.redirect("/");
  }
});

// POST edit saves changes to an existing user
// IN PROGRESS
// Security: Block this route if
//           - the user is not logged on
//           - the user is logged on AND
//                 - NOT( the user is Admin OR The user is editing his own profile)
router.post("/edit", async (req, res, next) => {
  // if the user is not logged in then go to unauthorised (can happen via a URL attempt)
  console.log("res.locals", res.locals);
  console.log("req.query", req.query);
  if (!req.isAuthenticated()) {
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("Inaccessible Route") +
        "&title=" +
        encodeURIComponent("Not Authorised") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  if (!req.query?.id?.length > 12) {
    // if no id or username is provided, redirect to unauthorised
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("No user id provided") +
        "&title=" +
        encodeURIComponent("Incomplete Route") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }

  if (!(res.locals.member_type === "admin" || res.locals.id === req.query.id)) {
    // Block if not user is not admin or if the user is not editing his own user profile
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("Inaccessible Route") +
        "&title=" +
        encodeURIComponent("Not Authorised") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }

  // Admin can change (firstname, lastname, role, verified, status and password)
  // User can change (firstname, lastname, and password)
  // We don't want to change id, username or email as they are unique identifiers possibly used to identify article owners etc
  // We will also only make changes to records that have been changed in the form

  // Read the table record to see what is to be changed.
  let result = {};
  try {
    result = await pg_pool.query("select * from users where id = $1", [
      req.body.id,
    ]);
  } catch (err) {
    res.redirect(
      "/error/A Search Error Has Occurred in route %2Fauth%2Fedit POST"
    );
    return;
  }

  console.log("***existing user", result.rows[0]); // as read from the user table
  console.log("***new user req.body", req.body); // as per the entry form

  // check the form fields and build a SQL string
  let changed = false;
  let SQLstring = `update users set `;
  let WHEREclause = `where id = '${req.body.id}'`;
  let values = [];

  // Allow admins to change anyone's name, but a user to change his own name only
  // Note: If we reach here, these criteria are already met, so no need for conditional
  // Note: SQL parameters start at $1 not $0
  if (req.body.first_name !== result.rows[0].first_name) {
    SQLstring += `first_name = $${values.length + 1},`;
    values[values.length] = req.body.first_name;
    changed = true;
  }
  if (req.body.last_name !== result.rows[0].last_name) {
    SQLstring += `last_name = $${values.length + 1},`;
    values[values.length] = req.body.last_name;
    changed = true;
  }
  // we dont want to change username or email (they may be used elsewhere as unique identifiers)
  // if (req.body.username !== result.rows[0].username) {
  //   SQLstring += `username = '${req.body.username}',`;
  //   changed = true;
  // }
  // if (req.body.email !== result.rows[0].email) {
  //   SQLstring += `email = '${req.body.email}',`;
  //   changed = true;
  // }

  // Only allow admins to change the membership status
  // WARNING: Could get lockout if an Admin changes his member_type to User or Public (consider preventing this)
  if (res.locals.member_type === "admin") {
    if (req.body.member_type !== result.rows[0].member_type) {
      SQLstring += `member_type = $${values.length + 1},`;
      values[values.length] = req.body.member_type;
      changed = true;
    }
    if (req.body.status !== result.rows[0].status) {
      SQLstring += `status = $${values.length + 1},`;
      values[values.length] = req.body.status;
      changed = true;
    }
    if (req.body.verified !== result.rows[0].verified) {
      SQLstring += `verified = $${values.length + 1},`;
      values[values.length] = req.body.verified;
      changed = true;
    }
  }

  // Check if the password has changed
  // Note: Updating the password requires an additional step of hashing
  // Note:  If the user has, in the past, logged in from the current browser,
  //          the browser will fill in the password field automatically (but showing *****),
  //        If the user has not logged in the password in the form will be blank.
  // Strategy:
  //        a) if the password is blank - then its not changed so skip
  //        b) if the password is not blank - but its hash is the same as the stored hash - then its not changed so skip
  //        c) if the password has changed, but does not match the "confirm" - then flag the error and redraw the edit screen
  //        d) if the password has changed, but does not meet the criteria - then flag the error and redraw the edit screen
  //           Otherwise
  //        e) Mark the password as changed and add the SQL to change it

  if (req.body.password === "") {
    // password field is empty - so do nothing
    console.log("Password not changed");
  } else {
    // check if its the same as the old password by hashng it with the same key as was used for the original
    let hashedPassword = crypto.pbkdf2Sync(
      req.body.password,
      result.rows[0].salt,
      310000,
      32,
      "sha256"
    );
    console.log("Checking the password");
    console.log(hashedPassword);
    console.log(result.rows[0].hashed_password);
    if (Buffer.compare(hashedPassword, result.rows[0].hashed_password) === 0) {
      // do nothing - password has not changed
      console.log("password has NOT changed");
    } else {
      console.log("password has changed");
      // Does the confirmation password match?
      if (req.body.password !== req.body.confirm_password) {
        console.log(
          "Confirm password does not match",
          req.body.password,
          req.body.confirm_password
        );
        //  redraw the screen with the error indicated
        res.redirect(
          "/auth/edit/?err_msg=" +
            encodeURIComponent("Confirm password does not match") +
            "&form=" +
            encodeURIComponent(JSON.stringify(req.body)) +
            "&id=" +
            encodeURIComponent(req.body.id)
        );
        return; // redirects need a return to stop later code in this route being executed
      } else {
        // Is the password the right length and composition?
        if (!verifyPasswordStrength(req.body.password)) {
          console.log("password must meet requirements");
          //  redraw the screen with the error indicated
          res.redirect(
            "/auth/edit/?err_msg=" +
              encodeURIComponent("Password must be 7 chars at least") +
              "&form=" +
              encodeURIComponent(JSON.stringify(req.body)) +
              "&id=" +
              encodeURIComponent(req.body.id)
          );
          return; // redirects need a return to stop later code in this route being executed
        } else {
          // new pasword is good
          console.log("adding SQL to update the password");
          // create a new salt and hashed password
          const salt = crypto.randomBytes(16);
          console.log("salt", salt);
          hashedPassword = crypto.pbkdf2Sync(
            req.body.password,
            salt,
            310000,
            32,
            "sha256"
          );
          console.log("hashedPasswordNew", hashedPassword);
          // update the SQL string to include the salt and hashed password
          SQLstring += `hashed_password = $${values.length + 1},`;
          values[values.length] = hashedPassword;
          SQLstring += `salt = $${values.length + 1},`;
          values[values.length] = salt;
          changed = true;
        }
      }
    }
  }

  if (changed) {
    SQLstring += `updated_at = NOW() `; // always update the updated_at field
    SQLstring += WHEREclause;
    console.log("SQLstring", SQLstring);
    console.log("values", values);
    try {
      let result = await pg_pool.query(SQLstring, values);
      console.log("result", result);
      result = await pg_pool.query("select * from users where id = $1", [
        req.body.id,
      ]);
      console.log("user after being saved", result.rows[0]);

      //   // // if the user is logged in, update the session data
      //   // // TODO: Maybe better to logout/login if loggen in user's data has changed
      //   // if (res.locals.loggedIn && res.locals.id === req.body.id) {
      //   //   req.user.first_name = req.body.first_name;
      //   //   req.user.last_name = req.body.last_name;
      //   //   req.user.username = req.body.username;
      //   //   req.user.email = req.body.email;
      //   //   req.user.member_type = req.body.member_type;
      //   //   req.user.status = req.body.status;
      //   //   req.user.verified = req.body.verified;
      //   // }
      // if the user is an admin, redirect to the admin page
      if (res.locals.member_type === "admin") {
        res.redirect("/auth/admin");
        return;
      }
      // if the user is not an admin, redirect to the home page
      res.redirect("/");
      return;
    } catch (err) {
      res.redirect(
        "/error/A update Error Has Occurred in route %2Fauth%2Fedit POST"
      );
      return;
    }
  } // end if changed
  // if nothing has changed, redirect to the home page
  console.log("No changes made to user");
  res.redirect("/");
  return;
});
// The signup POST route saves the registration data
// Securtity: Block this route if the user is logged in, but not an admin
router.post("/signup", async function (req, res, next) {
  // The form has mandatory fields username, email, password and confirm_password
  // Check that both username and email do not already exist and that the passwords are the same
  // NOTE: The users table has these fields
  //      id, first_name,last_name,email,member_type,verified, status,
  //      salt, password,created_at, updated_at
  if (req.isAuthenticated() && res.locals.member_type !== "admin") {
    // if the user is logged in, redirect to unauthorised
    res.redirect(
      "/auth/unauthorised?err_msg=" +
        encodeURIComponent("You are already registered") +
        "&title=" +
        encodeURIComponent("Not Authorised") +
        "&route=" +
        encodeURIComponent("/")
    );
    return;
  }
  try {
    let goodNewUser = false;
    let err_msg = "";
    let result = await pg_pool.query(
      "select username from users where username = $1",
      [req.body.username]
    );
    // new user is good if the username or email dont allready exist AND the passwords are the same and have length > 7
    if (result.rowCount === 0) {
      result = await pg_pool.query("select email from users where email = $1", [
        req.body.email,
      ]);
      if (result.rowCount === 0) {
        if (
          req.body.password.length > 7 &&
          req.body.password === req.body.confirm_password
        ) {
          goodNewUser = true;
        } else {
          err_msg = `Passwords don't match or not at least 8 chars`;
        }
      } else {
        err_msg = `Supplied email not available`;
      }
    } else {
      err_msg = `username "${req.body.username}" not available`;
    }

    if (!goodNewUser) {
      res.redirect(
        "/auth/signup/?err_msg=" +
          encodeURIComponent(err_msg) +
          "&form=" +
          encodeURIComponent(JSON.stringify(req.body))
      );
      return; // redirects need a return to stop later code in this route being executed
    }
  } catch (err) {
    res.redirect(
      "/error/A Search Error Has Occurred in route %2Fauth%2Fsignup POST"
    );
    return;
  }

  // If we reach here we are good to add the new user
  // Note: For now we are forcing status "active" and verified "verified"
  var salt = crypto.randomBytes(16);
  crypto.pbkdf2(
    req.body.password,
    salt,
    310000,
    32,
    "sha256",
    async function (err, hashedPassword) {
      if (err) {
        return next(err);
      }
      let result = []; // to retrieve the users id in postgres, after save
      try {
        if (res.locals.loggedIn || res.locals.member_type === "admin") {
          // only the admin user can upgrade role and status
          result = await pg_pool.query(
            "INSERT INTO users (status, verified,member_type,first_name, last_name,  email,username, hashed_password, salt) VALUES ($1, $2, $3, $4, $5, $6, $7,$8,$9) RETURNING id",
            [
              req.body.status,
              req.body.verified,
              req.body.member_type,
              req.body.first_name,
              req.body.last_name,
              req.body.email,
              req.body.username,
              hashedPassword,
              salt,
            ]
          );
        } else {
          // a general user gets the lowest status and role when signing up
          result = await pg_pool.query(
            "INSERT INTO users (status, verified,member_type,first_name, last_name,  email,username, hashed_password, salt) VALUES ($1, $2, $3, $4, $5, $6, $7,$8,$9) RETURNING id",
            [
              "active",
              "verified",
              "public",
              req.body.first_name,
              req.body.last_name,
              req.body.email,
              req.body.username,
              hashedPassword,
              salt,
            ]
          );
        }
      } catch (err) {
        res.redirect(
          "/error/An Insert Error Has Occurred in route %2Fauth%2Fsignup POST"
        );
        return;
      }
      // if its a new user log him in automatically
      if (!req.isAuthenticated()) {
        const user = {
          id: result.rows[0].id,
          username: req.body.username,
        };
        req.login(user, function (err) {
          if (err) {
            return next(err);
          }
          res.redirect("/");
        });
      } else {
        // if its an admin user, redirect to the admin page
        res.redirect("/auth/admin");
      }
    }
  );
});

export default router;
