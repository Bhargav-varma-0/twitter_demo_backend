const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { format } = require("date-fns");

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
    const tweetDetails = await db.get(
      "SELECT tweet.tweet AS tweet ,COUNT(like.like_id) AS likes, COUNT(reply.reply) AS replies, tweet.date_time AS dateTime FROM tweet LEFT JOIN reply ON reply.tweet_id = tweet.tweet_id LEFT JOIN like ON like.tweet_id = tweet.tweet_id WHERE tweet.tweet_id = ?  AND tweet.user_id NOT IN (SELECT following_user_id FROM follower WHERE follower_user_id = ? ) GROUP BY tweet.tweet_id;",
      [userId, tweetId]
    );
    tweetDetails === undefined
      ? res.status(401).send("Invalid Request")
      : res.send(tweetDetails);
  } catch (error) {
    console.error(error);
  }
});

app.get("/tweets/:tweetId/likes/", authenticateUser, async (req, res) => {
  try {
    const { userId } = req.body;
    const { tweetId } = req.params;
    const tweetLikeDetails = await db.all(
      "SELECT user.username AS username FROM user INNER JOIN like ON user.user_id = like.user_id WHERE like.tweet_id = ? AND user.user_id IN ( SELECT following_user_id FROM follower WHERE follower_user_id = ? );",
      [userId, tweetId]
    );
    if (tweetLikeDetails.length === 0 || tweetLikeDetails === undefined) {
      res.status(401).send("Invalid Request");
    } else {
      res.send(tweetLikeDetails);
    }
  } catch (error) {
    console.error(error);
  }
});
app.get("/tweets/:tweetId/replies/", authenticateUser, async (req, res) => {
  try {
    const { tweetId } = req.params;
    const { userId } = req.body;

    const getRepliesQuery = `
      SELECT reply.reply AS reply
      FROM reply
      WHERE reply.tweet_id = ? AND reply.user_id IN (
        SELECT following_user_id FROM follower WHERE follower_user_id = ? );`;
    const replies = await db.all(getRepliesQuery, [tweetId, userId]);
    console.log(`!replies. : ${!replies}`);
    if (!replies || replies.length === 0) {
      res.status(401).send("Invalid Request");
    } else {
      res.send(replies);
    }
  } catch (error) {
    console.error(error);
  }
});
app.get("/user/tweets/", authenticateUser, async (req, res) => {
  try {
    const { userId } = req.body;
    const allTweetsOfUser = await db.all(
      "SELECT tweet.tweet AS tweet ,COUNT(like.like_id) AS likes, COUNT(reply.reply) AS replies, tweet.date_time AS dateTime FROM tweet LEFT JOIN reply ON reply.tweet_id = tweet.tweet_id LEFT JOIN like ON like.tweet_id = tweet.tweet_id WHERE tweet.user_id = ? GROUP BY tweet.tweet_id",
      userId
    );
    res.send(allTweetsOfUser);
  } catch (error) {
    console.error(error);
  }
});

app.post("/user/tweets/", authenticateUser, async (req, res) => {
  try {
    const { userId, tweet } = req.body;
    console.log(`userId : ${userId} tweet : ${tweet}`);
    const currentDateTime = await format(new Date(), "yyyy-MM-dd HH:mm:ss");
    console.log(currentDateTime);
    const createNewPost = await db.run(
      "INSERT INTO tweet (tweet,user_id,date_time) VALUES (?,?,?);",
      [userId, tweet, currentDateTime]
    );
    res.send("Created a Tweet");
  } catch (error) {
    console.error(error);
  }
});

app.delete("/tweets/:tweetId/", authenticateUser, async (req, res) => {
  try {
    const { userId } = req.body;
    const { tweetId } = req.params;
    const tweetRequested = await db.get(
      "SELECT user_id FROM tweet WHERE tweet_id = ?",
      tweetId
    );
    if (tweetRequested.user_id !== userId) {
      res.status(401).send("Invalid Request");
      return;
    }
    const deleteTweet = await db.run(
      "DELETE FROM tweet WHERE tweet_id = ?",
      tweetId
    );
    res.send("Tweet Removed");
  } catch (error) {
    console.error(error);
  }
});

module.exports = app;
// module.exports = app;
