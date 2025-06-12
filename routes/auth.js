import express from "express";
import passport from "passport";
import localStrategy from "passport-local";
import crypto from "crypto";
import { getAllUsers } from "../pgQueries/queries.js";

import pg_pool from "../pgQueries/connectPool.js";

const router = express.Router();

const badLoginMessage = "Incorrect username or password";

// Functio display unauthorised access message

// Function for Passport to verify a username/password
async function verifyUser(username, password, cb) {
  let result = {};
  try {
    result = await pg_pool.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    console.log("result", result.rows[0]);
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

// route to display unauthorised access message
router.get("/unauthorised", function (req, res, next) {
  const err_msg = req.query.err_msg
  res.render("auth/unauthorised", {
    err_msg,
    res: res.locals,
  });
});

// This route displays the login form.
// If there has been previous login failures,
// req.session.messages[] will have an array of failure messages
// The session is replaced with a new session after a successful login
// Access: Block access if user is already logged in 
router.get("/login", function (req, res, next) {
  if (req.user){
    // if the user is already logged in, redirect to unauthorised
    res.redirect("/auth/unauthorised?err_msg=" +
      encodeURIComponent("You are already logged in"));
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
// Allow access if the user is logged in
router.get("/logout", function (req, res, next) {
  if (!req.isAuthenticated()) {
    // if the user is not logged in, redirect to unauthorised
    res.redirect("/auth/unauthorised?err_msg=" +
      encodeURIComponent("You are not logged in"));
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
// Later need to add functions to manage documents and comments
router.get("/admin", async function (req, res, next) {
  if (!req.isAuthenticated() || res.locals.member_type !== "admin") {
    // if the user is not logged in or not an admin, redirect to unauthorised
    res.redirect("/auth/unauthorised?err_msg=" +
      encodeURIComponent("You are not authorised to access this page"));
    return;
  }
  try {
    const users = await getAllUsers(); // an array of objects
    let none_msg = users.length === 0?"Users table is empty":""
    // console.log("All users", users);
    res.render("auth/manageUsers", {
      users,
      res: res.locals,
      none_msg,
    });
  } catch (error) {
    console.log("error displaying users",error);
    res.send("error displaying users")
  }
});

/**
 * Note: The "editUser" form can be activated from 3 places
 * 1. Via the /auth/signup route for a new user registering
 * 2. Via the "Add New User" button for the admin user from the /auth/admin route
 * 3. Via the "edit" buttons in the user list display by /auth/route (to edit an existing user)
 */
// The signup GET route presents the signup screen
// Note: the same signup form is used to create new users and edit existing users
router.get("/signup", function (req, res, next) {
  let form1 = req.query.form ? JSON.parse(decodeURIComponent(req.query.form)) : {}
  console.log("form1 = ",form1);
  res.render("auth/editUser", {
    err_msg: req.query.err_msg ? req.query.err_msg : "",
    form1: form1,
    res: res.locals,
    type: "new", // tells the signup form that this is a new user
  });
}); // see POST method below for when a new user is being saved

// The addUser GET route presents the signup screen
// Note: the same signup form is used to create new users and edit existing users
router.get("/addUser", function (req, res, next) {
  // if the user already has an account, redirect to unauthorised
  if (req.isAuthenticated()) {
    res.redirect("/auth/unauthorised?err_msg=" +
      encodeURIComponent("You are already registered and logged in"));
    return;
  }
  let form1 = req.query.form ? JSON.parse(decodeURIComponent(req.query.form)) : {}
  console.log("form1 = ",form1);
  res.render("auth/editUser", {
    err_msg: req.query.err_msg ? req.query.err_msg : "",
    form1:form1,
    res: res.locals,
    type: "new", // tells the signup form that this is a new user
  });
});

// The edit GET route uses the signup form to display the existing record to be edited
// The user id is sent to edit GET as a parameter   
router.get("/edit", async function(req, res, next){
  // if the user is not logged in as admin, redirect to unauthorised
  if (!(req.isAuthenticated() && res.locals.member_type !== "admin")) {
    res.redirect("/auth/unauthorised?err_msg=" +
      encodeURIComponent("You are not authorised to access this page"));
    return;
  }
  let result = await pg_pool.query(
    "select * from users where id = $1",
    [req.query.id]
  );
  console.log("edit activated", result.rows[0]);
  res.render("auth/editUser", {
    err_msg: req.query.err_msg ? req.query.err_msg : "",
    form1: result.rows[0],
    res: res.locals,
    type: "edit", // tells the signup form we're editing an existing user
  });

}); // see POST method below for when an existing user is being edited

// The delete GET route
router.get("/delete", async function (req, res, next){
  // if the user is not logged in as admin, redirect to unauthorised
  if (!(req.isAuthenticated() && res.locals.member_type !== "admin")) {
    res.redirect("/auth/unauthorised?err_msg=" +
      encodeURIComponent("You are not authorised to access this page"));
    return;
  }
  console.log("id",req.query.id, "username",req.query.username)
  let result = await pg_pool.query(
    "delete from users where id = $1",
    [req.query.id]
  );
  console.log("result",result)
  res.redirect("admin");
})

// TODO: The deleteConfirm PUT route

// Cancel of the form can be done from either a new signup or an existing user edit situation
router.get("/cancel", function (req,res,next){
  // console.log("**************")
  // console.log(req.rawHeaders)
  let index = req.rawHeaders.findIndex((element)=> element==="Referer")
  console.log('index',index)
  if (req.rawHeaders[index+1].includes("auth/edit") || req.rawHeaders[index+1].includes("auth/addUser")){
      res.redirect("admin");
  } else {
      res.redirect("/");
  }
})

// POST edit saves changes to an existing user
// IN PROGRESS
router.post("/edit", async (req, res, next)=>{
  let result = await pg_pool.query(
    "select * from users where id = $1",
    [req.body.id]
  );
  console.log("***existing user",result.rows[0]);
  console.log("***new user req.body",req.body);
  // next check which if any fields are different
  // for now we are allowing theses fields to be changed
  // first_name, last_name, email, member_type, status, verified, password
  let changed = false;
  let SQLstring = `update users set `  
  let WHEREclause = `where id = '${req.body.id}'`
  if (req.body.first_name !== result.rows[0].first_name) {
    SQLstring += `first_name = '${req.body.first_name}',`
    changed = true;
  }
  if (req.body.last_name !== result.rows[0].last_name) {
    SQLstring += `last_name = '${req.body.last_name}',`
    changed = true;
  }
  if (req.body.username !== result.rows[0].username) {
    SQLstring += `username = '${req.body.username}',`
    changed = true;
  }
  if (req.body.email !== result.rows[0].email) {
    SQLstring += `email = '${req.body.email}',`
    changed = true;
  }
  if (req.body.member_type !== result.rows[0].member_type) {
    SQLstring += `member_type = '${req.body.member_type}',`
    changed = true;
  }
  if (req.body.status !== result.rows[0].status) {
    SQLstring += `status = '${req.body.status}',`
    changed = true;
  }
  if (req.body.verified !== result.rows[0].verified) {
    SQLstring += `,verified = '${req.body.verified}',`
    changed = true;
  }
  if (changed){
    SQLstring += `updated_at = NOW() ` // always update the updated_at field
    SQLstring += WHEREclause;
    console.log("SQLstring",SQLstring);
    try {
      let result = await pg_pool.query(SQLstring);
      console.log("result",result);
      // if the password has changed, we need to hash it and save it
      if (req.body.password && req.body.password.length > 7) {
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
            // update the password and salt
            let result = await pg_pool.query(
              "update users set hashed_password = $1, salt = $2 where id = $3",
              [hashedPassword, salt, req.body.id]
            );
            console.log("result",result);
          }
        );
      }
      // if the user is logged in, update the session data
      if (res.locals.loggedIn && res.locals.id === req.body.id) {
        req.user.first_name = req.body.first_name;
        req.user.last_name = req.body.last_name;
        req.user.username = req.body.username;
        req.user.email = req.body.email;
        req.user.member_type = req.body.member_type;
        req.user.status = req.body.status;
        req.user.verified = req.body.verified;
      }
      // if the user is an admin, redirect to the admin page
      if (res.locals.member_type === "admin") {
        res.redirect("/auth/admin");
        return;
      }
      // if the user is not an admin, redirect to the home page
      res.redirect("/");
      return;
    } catch (err) {
      console.log("error updating user", err);
      return next(err);
    }
  } // end if changed
  // if nothing has changed, redirect to the home page
  console.log("No changes made to user");
  res.redirect("/")
})

// The signup POST route saves the registration data
router.post("/signup", async function (req, res, next) {
  //The form has mandatory fields username, email, password and confirm_password
  // Check that username does not already exist and that the passwords are the same
  //NOTE: The users table has these fields
  //      id, first_name,last_name,email,member_type,verified, status,
  //      salt, password,created_at, updated_at

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
    console.log("error reading user", err);
    return next(err);
  }

  // res.locals.loggedIn = req.isAuthenticated();
  // res.locals.username = req.isAuthenticated() ? req.user.username : "";
  // res.locals.member_type = req.isAuthenticated() ? req.user.member_type : "";
  // res.locals.id = req.isAuthenticated() ? req.user.id : "";

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
            [req.body.status, req.body.verified,req.body.member_type,req.body.first_name,req.body.last_name,req.body.email,req.body.username, hashedPassword, salt]
          ) ;
        } else {
          // a general user gets the lowest status and role when signing up
          result = await pg_pool.query(
            "INSERT INTO users (status, verified,member_type,first_name, last_name,  email,username, hashed_password, salt) VALUES ($1, $2, $3, $4, $5, $6, $7,$8,$9) RETURNING id",
            ["active", "verified","public",req.body.first_name,req.body.last_name,req.body.email,req.body.username, hashedPassword, salt]
          );
        } 
      } catch (err) {
        console.log("error saving new user", err);
        return next(err);
      }
      // if its a new user log him in automatically
      if (!res.locals.loggedIn) {
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
