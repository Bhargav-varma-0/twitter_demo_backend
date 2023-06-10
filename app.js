const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const dbPath = path.join(__dirname, "twitterClone.db");
let db;

const app = express();

app.use(express.json());

const secretKey = "SECRET_KEY_12345!@#$%";

const initializeDbAndStartServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    console.log("Database initialized");

    app.listen(3000);
    console.log("SERVER STARTED AT 3000");
  } catch (error) {
    console.error(error);
  }
};

initializeDbAndStartServer();

app.post("/register/", async (req, res) => {
  try {
    const { username, password, name, gender } = req.body;

    console.log(password.length);
    if (password.length < 6) {
      res.status(400).send("Password is too short");
    } else {
      const userAlreadyExists = await db.get(
        "SELECT * FROM user where username = ?;",
        username
      );
      console.log(`userAlreadyExists : ${userAlreadyExists}`);
      if (userAlreadyExists === undefined) {
        const encryptedPasswd = await bcrypt.hash(password, 10);
        const addUserQuery =
          "INSERT INTO user (username,password,name,gender) VALUES (?,?,?,?)";
        await db.run(addUserQuery, [username, encryptedPasswd, name, gender]);
        console.log("User created successfully");
        res.send("User created successfully");
      } else {
        res.status(400).send("User already exists");
      }
    }
  } catch (error) {
    console.error(error);
  }
});

app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const userDetails = await db.get(
    "SELECT * FROM user where username = ?;",
    username
  );
  if (userDetails === undefined) {
    res.status(400).send("Invalid user");
  } else if (await bcrypt.compare(password, userDetails.password)) {
    console.log("inside jwt creator");
    const jwtToken = await jwt.sign({ username }, secretKey);
    console.log(`jwtToken : ${jwtToken}`);
    res.send({ jwtToken: jwtToken });
  } else {
    res.status(400).send("Invalid password");
  }
});

const authenticateUser = async (req, res, next) => {
  try {
    //   console.log(req.headers.authorization);
    const { authorization } = req.headers;
    if (authorization === undefined) {
      res.status(401).send("Invalid JWT Token");
    } else {
      const authToken = authorization.split(" ")[1];
      console.log(`authToken : ${authToken}`);
      const userDetailsFromJwt = await jwt.verify(authToken, secretKey);
      const userDetails = await db.get(
        "SELECT * FROM user where username = ?;",
        userDetailsFromJwt.username
      );
      if (userDetails === undefined) {
        res.status(401).send("Invalid JWT Token");
      } else {
        req.body.userId = userDetails.user_id;
        console.log(`inside middleWhere ${req.body.userId}`);
        next();
      }
    }
  } catch (error) {
    console.error(error);
  }
};

app.get("/user/tweets/feed/", authenticateUser, async (req, res) => {
  try {
    const { userId } = req.body;
    console.log(`userDetails : ${userId}`);
    const allFollowingTweets = await db.all(
      "SELECT user.username as username ,tweet.tweet as tweet, tweet.date_time as dateTime FROM follower INNER JOIN user ON follower.following_user_id = user.user_id INNER JOIN tweet ON user.user_id = tweet.user_id WHERE follower.follower_user_id = ? LIMIT 4;",
      userId
    );
    console.log(`allFollowingTweets : ${allFollowingTweets}`);
    res.send(allFollowingTweets);
  } catch (error) {
    console.error(error);
  }
});

app.get("/user/following/", authenticateUser, async (req, res) => {
  try {
    const { userId } = req.body;
    console.log(`userDetails : ${userId}`);
    const detailsOfFollowing = await db.all(
      "SELECT user.username as username  FROM follower INNER JOIN user ON follower.following_user_id = user.user_id  WHERE follower.follower_user_id = ?;",
      userId
    );
    res.send(detailsOfFollowing);
  } catch (error) {
    console.error(error);
  }
});

app.get("/user/followers/", authenticateUser, async (req, res) => {
  try {
    const { userId } = req.body;
    console.log(`userDetails : ${userId}`);
    const detailsOfFollower = await db.all(
      "SELECT user.username as username  FROM follower INNER JOIN user ON follower.follower_user_id = user.user_id  WHERE follower.following_user_id = ?;",
      userId
    );
    res.send(detailsOfFollower);
  } catch (error) {
    console.error(error);
  }
});

app.get("/tweets/:tweetId/", authenticateUser, async (req, res) => {
  try {
    const { userId } = req.body;
    const { tweetId } = req.params;
    console.log(`tweetId : ${tweetId}`);
  } catch (error) {
    console.error(error);
  }
});

app.get("", authenticateUser, async (req, res) => {});
app.get("", authenticateUser, async (req, res) => {});
app.get("", authenticateUser, async (req, res) => {});
app.get("", authenticateUser, async (req, res) => {});

module.exports = app;
