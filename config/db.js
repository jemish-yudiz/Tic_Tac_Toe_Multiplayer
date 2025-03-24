const mongoose = require("mongoose");

class MongoClient {
  constructor() {
    this.options = {
      connectTimeoutMS: 30000, // Increase the connection timeout to 30 seconds
      socketTimeoutMS: 30000,
    };
  }

  async initialize() {
    try {
      await mongoose.connect(process.env.MONGO_URI, this.options);
      console.log("Database connected 🧬");
    } catch (error) {
      console.error("Error connecting to MongoDB:", error);
      throw error;
    }
  }
}

module.exports = new MongoClient();
