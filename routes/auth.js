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
    // row.salt,
    "somedummysalt123456",
    310000,
    32,
    "sha256",
    function (err, hashedPassword) {
      if (err) {
        return cb(err);
      }
      console.log("hashedPassword", hashedPassword);
      //   if (!crypto.timingSafeEqual(row.hashed_password, hashedPassword)) {
      if (
        !crypto.timingSafeEqual(
          Buffer.from(row.password, "utf-8"),
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

// Seriuialise and deserialise are used to persist user data in the session store
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

// // Function to save the new user and log them in automatically
// async function saveUserAndLogin(err, hashedPassword) {
//   if (err) {
//     return next(err);
//   }
//   try {
//     await pg_pool.query(
//       "INSERT INTO users (username, hashed_password, salt) VALUES (?, ?, ?)",
//       [req.body.username, hashedPassword, salt]
//     );
//   } catch (err) {
//     return next(err);
//   }

//   const user = {
//     id: this.lastID,
//     username: req.body.username,
//   };

//   req.login(user, function (err) {
//     if (err) {
//       return next(err);
//     }
//     res.redirect("/");
//   });
// }

// // function to hash the password and save the new new user in table users
// async function signupFn(req, res, next) {
//   var salt = crypto.randomBytes(16);
//   crypto.pbkdf2(req.body.password, salt, 310000, 32, "sha256", () =>
//     saveUserAndLogin(req, res, next)
//   );
// }

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
      try {
        console.log(req.body);
        console.log(hashedPassword);
        console.log(salt);
        await pg_pool.query(
          "INSERT INTO users (username, hashed_password, salt) VALUES ($1, $2, $3)",
          [req.body.username, hashedPassword, salt]
        );
      } catch (err) {
        console.log("error saving new user", err);
        return next(err);
      }
      var user = {
        id: this.lastID,
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
