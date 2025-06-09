import express from "express";
import passport from "passport";
import localStrategy from "passport-local";
import crypto from "crypto";
import { getAllUsers } from "../pgQueries/queries.js";

import pg_pool from "../pgQueries/connectPool.js";

const router = express.Router();

const badLoginMessage = "Incorrect username or password";

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

// This route displays the login form.
// If there has been previous login failures,
// req.session.messages[] will have an array of failure messages
// The session is replaced with a new session after a successful login
router.get("/login", function (req, res, next) {
  // console.log("session", req.session);
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
router.get("/logout", function (req, res, next) {
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
  res.render("auth/editUser", {
    err_msg: req.query.err_msg ? req.query.err_msg : "",
    form: req.query.form ? JSON.parse(decodeURIComponent(req.query.form)) : {},
    res: res.locals,
    type: "new", // tells the signup form that this is a new user
  });
}); // see POST method below for when a new user is being saved

// The addUser GET route presents the signup screen
// Note: the same signup form is used to create new users and edit existing users
router.get("/addUser", function (req, res, next) {
  res.render("auth/editUser", {
    err_msg: req.query.err_msg ? req.query.err_msg : "",
    form: req.query.form ? JSON.parse(decodeURIComponent(req.query.form)) : {},
    res: res.locals,
    type: "new", // tells the signup form that this is a new user
  });
});

// The edit GET route uses the signup form to display the existing record to be edited
// The user id is sent to edit GET as a parameter   
router.get("/edit", async function(req, res, next){
  let result = await pg_pool.query(
    "select * from users where id = $1",
    [req.query.id]
  );
  console.log("edit activated", result.rows[0]);
  res.render("auth/editUser", {
    err_msg: req.query.err_msg ? req.query.err_msg : "",
    form: result.rows[0],
    res: res.locals,
    type: "edit", // tells the signup form we're editing an existing user
  });

}); // see POST method below for when an existing user is being edited


// The delete GET route
router.get("/delete", async function (req, res, next){
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
  console.log("**************")
  console.log(req.rawHeaders)
  let index = req.rawHeaders.findIndex((element)=> element==="Referer")
  console.log('index',index)
  if (req.rawHeaders[index+1].includes("auth/edit") || req.rawHeaders[index+1].includes("auth/addUser")){
      res.redirect("admin");
  } else {
      res.redirect("/");
  }
})

// POST edit saves changes to an existing user
router.post("/edit", async (req, res, next)=>{
  let result = await pg_pool.query(
    "select * from users where id = $1",
    [req.body.id]
  );
  console.log(result[0])
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
        result = await pg_pool.query(
          "INSERT INTO users (status, verified,first_name, last_name, member_type, email,username, hashed_password, salt) VALUES ($1, $2, $3, $4, $5, $6, $7,$8,$9) RETURNING id",
          ["active", "verified",req.body.first_name,req.body.last_name,req.body.member_type,req.body.email,req.body.username, hashedPassword, salt]
        );
      } catch (err) {
        console.log("error saving new user", err);
        return next(err);
      }
      // log the new user in automatically
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
    }
  );
});

export default router;
