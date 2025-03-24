const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

// Game data
const games = {};

// Generate a random game ID
function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Initialize a new game
function createNewGame() {
  const gameId = generateGameId();
  games[gameId] = {
    board: Array(9).fill(null),
    players: [],
    currentTurn: null,
    gameState: "waiting", // waiting, playing, finished
  };
  return gameId;
}

// Reset an existing game
function resetGame(gameId) {
  if (games[gameId]) {
    games[gameId].board = Array(9).fill(null);
    games[gameId].currentTurn = games[gameId].players[0].id; // X starts again
    games[gameId].gameState = "playing";
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
  socket.on("createGame", () => {
    const gameId = createNewGame();
    socket.join(gameId);
    games[gameId].players.push({ id: socket.id, symbol: "X" });

    socket.emit("gameCreated", {
      gameId,
      symbol: "X",
      message: `Game created! Share this game ID: ${gameId} with your friend`,
    });
  });

  // Join an existing game
  socket.on("joinGame", (data) => {
    const gameId = data.gameId;

    // Check if the game exists
    if (!games[gameId]) {
      socket.emit("error", { message: "Game not found" });
      return;
    }

    // Check if the game is already full
    if (games[gameId].players.length >= 2) {
      socket.emit("error", { message: "Game is full" });
      return;
    }

    socket.join(gameId);
    games[gameId].players.push({ id: socket.id, symbol: "O" });
    games[gameId].currentTurn = games[gameId].players[0].id; // X starts
    games[gameId].gameState = "playing";

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
  socket.on("makeMove", (data) => {
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
      io.to(gameId).emit("gameOver", {
        board: game.board,
        result,
      });
    } else {
      // Switch turns
      game.currentTurn = game.players.find((p) => p.id !== socket.id).id;

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
  socket.on("resetGame", (data) => {
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
    if (resetGame(gameId)) {
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
  socket.on("disconnect", () => {
    console.log("A user disconnected");

    // Find and clean up any games the player was in
    for (const gameId in games) {
      const game = games[gameId];
      const playerIndex = game.players.findIndex((p) => p.id === socket.id);

      if (playerIndex !== -1) {
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
