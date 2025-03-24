const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
require("dotenv").config();

// MongoDB and Redis connections
const connectDB = require("./config/db");
const connectRedis = require("./config/redis");
const Game = require("./models/Game");
const Player = require("./models/Player");

// Connect to MongoDB
connectDB.initialize();

// Connect to Redis
const redisClient = connectRedis();
(async () => {
  await redisClient.connect();
})();

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// API Routes

// Get all games
app.get("/api/games", async (req, res) => {
  try {
    const games = await Game.find().sort({ createdAt: -1 }).limit(10);
    res.json(games);
  } catch (error) {
    console.error("Error fetching games:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get specific game by ID
app.get("/api/games/:gameId", async (req, res) => {
  try {
    const gameId = req.params.gameId;

    // Try Redis first
    const cachedGame = await redisClient.get(`game:${gameId}`);
    if (cachedGame) {
      return res.json(JSON.parse(cachedGame));
    }

    // If not in Redis, check MongoDB
    const game = await Game.findOne({ gameId });
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    // Cache the result in Redis
    await redisClient.set(`game:${gameId}`, JSON.stringify(game), {
      EX: 900, // 15 minutes
    });

    res.json(game);
  } catch (error) {
    console.error("Error fetching game:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get player statistics
app.get("/api/players/stats", async (req, res) => {
  try {
    const topPlayers = await Player.find()
      .sort({ wins: -1 })
      .limit(10)
      .select("username wins losses draws gamesPlayed");

    res.json(topPlayers);
  } catch (error) {
    console.error("Error fetching player stats:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get player by username
app.get("/api/players/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const player = await Player.findOne({ username });
    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }
    res.json(player);
  } catch (error) {
    console.error("Error fetching player:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Update player username
app.post("/api/players/update-username", express.json(), async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    // Check if username already exists
    const existingPlayer = await Player.findOne({ username });
    if (existingPlayer) {
      return res.status(400).json({ error: "Username already exists" });
    }

    const player = await Player.findOneAndUpdate(
      { username: req.body.oldUsername },
      { username, password },
      { new: true }
    );

    if (!player) {
      return res.status(404).json({ error: "Player not found" });
    }

    res.json(player);
  } catch (error) {
    console.error("Error updating player:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Create or get player
app.post("/api/players/initialize", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    // Check if player exists
    let player = await Player.findOne({ username });

    if (player) {
      // If player exists, verify password
      if (player.password !== password) {
        return res.status(401).json({ error: "Invalid password" });
      }
      // Update last active timestamp
      player.lastActive = Date.now();
      await player.save();
      return res.json({
        success: true,
        player,
        message: "Login successful",
      });
    }

    // Create new player
    try {
      player = new Player({
        username,
        password,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        lastActive: Date.now(),
      });

      await player.save();
      return res.json({
        success: true,
        player,
        message: "Account created successfully",
      });
    } catch (error) {
      if (error.code === 11000) {
        // Handle duplicate key error
        if (error.keyPattern.username) {
          return res.status(409).json({ error: "Username is already taken" });
        }
        // If it's a deviceId error, try to create the player again
        if (error.keyPattern.deviceId) {
          // Remove the deviceId index if it exists
          try {
            await Player.collection.dropIndex("deviceId_1");
          } catch (dropError) {
            console.log("Index might not exist:", dropError);
          }
          // Try saving again
          await player.save();
          return res.json({
            success: true,
            player,
            message: "Account created successfully",
          });
        }
      }
      throw error;
    }
  } catch (error) {
    console.error("Error initializing player:", error);
    res.status(500).json({
      error: error.message || "Server error",
    });
  }
});

// Game data
const games = {};

// Generate a random game ID
function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Initialize a new game
async function createNewGame() {
  const gameId = generateGameId();
  games[gameId] = {
    board: Array(9).fill(null),
    players: [],
    currentTurn: null,
    gameState: "waiting", // waiting, playing, finished
  };

  // Save game to MongoDB
  try {
    const newGame = new Game({
      gameId,
      board: games[gameId].board,
      players: games[gameId].players,
      currentTurn: games[gameId].currentTurn,
      gameState: games[gameId].gameState,
    });
    await newGame.save();

    // Cache game in Redis with expiration time (24 hours)
    await redisClient.set(`game:${gameId}`, JSON.stringify(games[gameId]), {
      EX: 900, // 15 minutes
    });
  } catch (error) {
    console.error("Error saving game:", error);
  }

  return gameId;
}

// Reset an existing game
async function resetGame(gameId) {
  if (games[gameId]) {
    games[gameId].board = Array(9).fill(null);
    games[gameId].currentTurn = games[gameId].players[0].id; // X starts again
    games[gameId].gameState = "playing";

    // Update in MongoDB
    try {
      await Game.findOneAndUpdate(
        { gameId },
        {
          board: games[gameId].board,
          currentTurn: games[gameId].currentTurn,
          gameState: games[gameId].gameState,
          winner: null,
        }
      );

      // Update in Redis
      await redisClient.set(`game:${gameId}`, JSON.stringify(games[gameId]), {
        EX: 900, // 15 minutes
      });
    } catch (error) {
      console.error("Error updating game:", error);
    }

    return true;
  }
  return false;
}

// Check for a winner
function checkWinner(board) {
  const winPatterns = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8], // rows
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8], // columns
    [0, 4, 8],
    [2, 4, 6], // diagonals
  ];

  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], winningPattern: pattern };
    }
  }

  // Check for a draw
  if (!board.includes(null)) {
    return { winner: "draw" };
  }

  return null;
}

// Socket.IO connection handler
io.on("connection", (socket) => {
  console.log("A user connected");

  // Create a new game
  socket.on("createGame", async (data) => {
    const { username, password } = data;

    // Validate username and password
    if (!username || !password) {
      socket.emit("error", { message: "Username and password are required" });
      return;
    }

    // Verify player credentials
    try {
      const player = await Player.findOne({ username });
      if (!player) {
        socket.emit("error", { message: "Player not found" });
        return;
      }
      if (player.password !== password) {
        socket.emit("error", { message: "Invalid password" });
        return;
      }
    } catch (error) {
      console.error("Error verifying player:", error);
      socket.emit("error", { message: "Error verifying player credentials" });
      return;
    }

    const gameId = await createNewGame();
    socket.join(gameId);
    games[gameId].players.push({ id: socket.id, symbol: "X", username });

    // Update socket ID for player
    try {
      await Player.findOneAndUpdate(
        { username },
        {
          socketId: socket.id,
          lastActive: Date.now(),
        }
      );

      // Update game with player info
      await Game.findOneAndUpdate(
        { gameId },
        { players: games[gameId].players }
      );

      // Update in Redis
      await redisClient.set(`game:${gameId}`, JSON.stringify(games[gameId]), {
        EX: 900, // 15 minutes
      });
    } catch (error) {
      console.error("Error updating player:", error);
    }

    socket.emit("gameCreated", {
      gameId,
      symbol: "X",
      message: `Game created! Share this game ID: ${gameId} with your friend`,
    });
  });

  // Join an existing game
  socket.on("joinGame", async (data) => {
    const { gameId, username, password } = data;

    // Validate username and password
    if (!username || !password) {
      socket.emit("error", { message: "Username and password are required" });
      return;
    }

    // Verify player credentials
    try {
      const player = await Player.findOne({ username });
      if (!player) {
        socket.emit("error", { message: "Player not found" });
        return;
      }
      if (player.password !== password) {
        socket.emit("error", { message: "Invalid password" });
        return;
      }
    } catch (error) {
      console.error("Error verifying player:", error);
      socket.emit("error", { message: "Error verifying player credentials" });
      return;
    }

    // Check if the game exists
    if (!games[gameId]) {
      // Try to find it in Redis first
      try {
        const cachedGame = await redisClient.get(`game:${gameId}`);
        if (cachedGame) {
          games[gameId] = JSON.parse(cachedGame);
        } else {
          // Try to find it in MongoDB
          const dbGame = await Game.findOne({ gameId });
          if (dbGame) {
            games[gameId] = {
              board: dbGame.board,
              players: dbGame.players,
              currentTurn: dbGame.currentTurn,
              gameState: dbGame.gameState,
            };
          } else {
            socket.emit("error", { message: "Game not found" });
            return;
          }
        }
      } catch (error) {
        console.error("Error retrieving game:", error);
        socket.emit("error", { message: "Game not found" });
        return;
      }
    }

    // Check if the game is already full
    if (games[gameId].players.length >= 2) {
      socket.emit("error", { message: "Game is full" });
      return;
    }

    // Check if the username is already in the game
    const usernameExists = games[gameId].players.some(
      (p) => p.username === username
    );
    if (usernameExists) {
      socket.emit("error", {
        message: "You are already in this game with another device",
      });
      return;
    }

    socket.join(gameId);
    games[gameId].players.push({ id: socket.id, symbol: "O", username });
    games[gameId].currentTurn = games[gameId].players[0].id; // X starts
    games[gameId].gameState = "playing";

    // Update socket ID for player
    try {
      await Player.findOneAndUpdate(
        { username },
        {
          socketId: socket.id,
          lastActive: Date.now(),
        }
      );

      // Update game in MongoDB
      await Game.findOneAndUpdate(
        { gameId },
        {
          players: games[gameId].players,
          currentTurn: games[gameId].currentTurn,
          gameState: games[gameId].gameState,
        }
      );

      // Update in Redis
      await redisClient.set(`game:${gameId}`, JSON.stringify(games[gameId]), {
        EX: 900, // 15 minutes
      });
    } catch (error) {
      console.error("Error updating game/player:", error);
    }

    // Notify both players that the game is starting
    io.to(gameId).emit("gameStart", {
      board: games[gameId].board,
      currentTurn: games[gameId].currentTurn,
    });

    // Notify the player who joined
    socket.emit("joinedGame", { gameId, symbol: "O" });

    // Notify the creator that someone joined
    socket.to(gameId).emit("opponentJoined", {});
  });

  // Handle a player's move
  socket.on("makeMove", async (data) => {
    const { gameId, position } = data;
    const game = games[gameId];

    // Validate the game state
    if (!game || game.gameState !== "playing") {
      socket.emit("error", { message: "Invalid game state" });
      return;
    }

    // Check if it's the player's turn
    if (game.currentTurn !== socket.id) {
      socket.emit("error", { message: "It's not your turn" });
      return;
    }

    // Validate the move
    if (position < 0 || position > 8 || game.board[position] !== null) {
      socket.emit("error", { message: "Invalid move" });
      return;
    }

    // Find the player who made the move
    const player = game.players.find((p) => p.id === socket.id);
    if (!player) {
      socket.emit("error", { message: "Player not found" });
      return;
    }

    // Update the board
    game.board[position] = player.symbol;

    // Check if the game is over
    const result = checkWinner(game.board);
    if (result) {
      game.gameState = "finished";

      // Update player stats in MongoDB
      try {
        if (result.winner !== "draw") {
          const winnerPlayer = game.players.find(
            (p) => p.symbol === result.winner
          );
          const loserPlayer = game.players.find(
            (p) => p.symbol !== result.winner
          );

          if (winnerPlayer && winnerPlayer.username) {
            // Update winner stats
            await Player.findOneAndUpdate(
              { username: winnerPlayer.username },
              { $inc: { gamesPlayed: 1, wins: 1 } }
            );
          }

          if (loserPlayer && loserPlayer.username) {
            // Update loser stats
            await Player.findOneAndUpdate(
              { username: loserPlayer.username },
              { $inc: { gamesPlayed: 1, losses: 1 } }
            );
          }
        } else {
          // Update draw stats for both players
          for (const player of game.players) {
            if (player.username) {
              await Player.findOneAndUpdate(
                { username: player.username },
                { $inc: { gamesPlayed: 1, draws: 1 } }
              );
            }
          }
        }

        // Update game in MongoDB
        await Game.findOneAndUpdate(
          { gameId },
          {
            board: game.board,
            gameState: game.gameState,
            winner: result.winner,
          }
        );

        // Update in Redis
        await redisClient.set(`game:${gameId}`, JSON.stringify(game), {
          EX: 900, // 15 minutes
        });
      } catch (error) {
        console.error("Error updating game/player stats:", error);
      }

      io.to(gameId).emit("gameOver", {
        board: game.board,
        result,
      });
    } else {
      // Switch turns
      const otherPlayer = game.players.find((p) => p.id !== socket.id);

      // Make sure we found the other player before accessing properties
      if (otherPlayer) {
        game.currentTurn = otherPlayer.id;
      } else {
        console.error("Could not find other player in the game");
        socket.emit("error", {
          message: "wait for the other player to join the game",
        });
        return;
      }

      // Update game in MongoDB
      try {
        await Game.findOneAndUpdate(
          { gameId },
          {
            board: game.board,
            currentTurn: game.currentTurn,
          }
        );

        // Update in Redis
        await redisClient.set(`game:${gameId}`, JSON.stringify(game), {
          EX: 900, // 15 minutes
        });
      } catch (error) {
        console.error("Error updating game:", error);
      }

      // Notify both players of the move
      io.to(gameId).emit("moveMade", {
        board: game.board,
        position,
        symbol: player.symbol,
        currentTurn: game.currentTurn,
      });
    }
  });

  // Reset the game
  socket.on("resetGame", async (data) => {
    const { gameId } = data;
    const game = games[gameId];

    // Validate game exists
    if (!game) {
      socket.emit("error", { message: "Game not found" });
      return;
    }

    // Check if player is in this game
    const playerInGame = game.players.some((p) => p.id === socket.id);
    if (!playerInGame) {
      socket.emit("error", { message: "You are not a player in this game" });
      return;
    }

    // Only allow reset if game is finished
    if (game.gameState !== "finished") {
      socket.emit("error", {
        message: "Cannot reset a game that's not finished",
      });
      return;
    }

    // Reset the game
    if (await resetGame(gameId)) {
      // Notify both players
      io.to(gameId).emit("gameReset", {
        board: game.board,
        currentTurn: game.currentTurn,
        message: "Game has been reset! X starts again.",
      });
    } else {
      socket.emit("error", { message: "Failed to reset the game" });
    }
  });

  // Handle player disconnect
  socket.on("disconnect", async () => {
    console.log("A user disconnected");

    // Find and clean up any games the player was in
    for (const gameId in games) {
      const game = games[gameId];
      const playerIndex = game.players.findIndex((p) => p.id === socket.id);

      if (playerIndex !== -1) {
        const player = game.players[playerIndex];

        // Update player's last active time
        try {
          if (player.username) {
            await Player.findOneAndUpdate(
              { username: player.username },
              { lastActive: Date.now() }
            );
          }

          // Update game state in MongoDB
          await Game.findOneAndUpdate({ gameId }, { gameState: "finished" });

          // Remove from Redis (or update it)
          await redisClient.del(`game:${gameId}`);
        } catch (error) {
          console.error("Error updating disconnected player:", error);
        }

        // Notify the other player
        socket.to(gameId).emit("opponentLeft", {
          message: "Your opponent has left the game",
        });

        // Clean up the game
        delete games[gameId];
        break;
      }
    }
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
