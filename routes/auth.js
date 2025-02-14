import express from "express";
import passport from "passport";
import localStrategy from "passport-local";
import crypto from "crypto";

import pg_pool from "../pgQueries/connectPool.js";

const router = express.Router();

// Function for Passport to verify a username/password
async function verifyUser(username, password, cb) {
  console.log("username", username, "password", password);
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
      message: "Incorrect username or password.",
    });
  }

  let row = result.rows[0];
  console.log("Reached here", row);
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
          message: "Incorrect username or password.",
        });
      }
      return cb(null, row);
    }
  );
}

/**
 * Serialise and deserialise are used to persist anf retrieve user data in the session store
 * serializeUser() in this case is passed the user object and told to save an object
 * containing the user id and username
 * deserializeUser() in this case is told to return that object from the session data.
 * Note: If we only passed the user.id to serializeUser() then we could use deserializeUser()
 * to read the user table and return whatever data us needed,
 */
passport.serializeUser(function (user, cb) {
  process.nextTick(function () {
    cb(null, { id: user.id, username: user.username });
  });
});

passport.deserializeUser(function (user, cb) {
  process.nextTick(function () {
    return cb(null, user);
  });
});

// Apply the passport middleware
passport.use(new localStrategy(verifyUser));

// This route diaplsy the login form
router.get("/login", function (req, res, next) {
  res.render("auth/login");
});

// This route authenticates the username, password
router.post(
  "/login/password",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
  })
);

// logs out the user and redirects to home
router.post("/logout", function (req, res, next) {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

// Presents the signup screen
router.get("/signup", function (req, res, next) {
  res.render("auth/signup");
});

// router.post("/signup", () => signupFn(req, res, next));

router.post("/signup", function (req, res, next) {
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
          "INSERT INTO users (username, hashed_password, salt) VALUES ($1, $2, $3) RETURNING id",
          [req.body.username, hashedPassword, salt]
        );
      } catch (err) {
        console.log("error saving new user", err);
        return next(err);
      }
      const user = {
        // id: this.lastID,
        id: result.rows[0].id,
        username: req.body.username,
        // user_id: ,
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
