const mongoose = require("mongoose");

const GameSchema = new mongoose.Schema({
  gameId: {
    type: String,
    required: true,
    unique: true,
  },
  board: {
    type: Array,
    required: true,
  },
  players: [
    {
      id: String,
      symbol: String,
    },
  ],
  currentTurn: {
    type: String,
    default: null,
  },
  gameState: {
    type: String,
    enum: ["waiting", "playing", "finished"],
    default: "waiting",
  },
  winner: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Game", GameSchema);
