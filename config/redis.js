const redis = require("redis");

const connectRedis = () => {
  const client = redis.createClient({
    url: process.env.REDIS_URL,
  });

  client.on("error", (err) => {
    console.error("Redis Client Error:", err);
  });

  client.on("connect", () => {
    console.log("Redis Client Connected");
  });

  return client;
};

module.exports = connectRedis;
