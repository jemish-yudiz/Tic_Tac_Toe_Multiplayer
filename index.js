// Game variables
let socket = null;
let gameId = null;
let playerSymbol = null;
let currentTurn = null;
let board = Array(9).fill(null);
let isGameActive = false;
let winningPattern = null;

// DOM elements
const gameBoard = document.getElementById("gameBoard");
const gameIdInput = document.getElementById("gameIdInput");
const createGameBtn = document.getElementById("createGameBtn");
const joinGameBtn = document.getElementById("joinGameBtn");
const messageDiv = document.getElementById("message");
const gameInfo = document.getElementById("gameInfo");
const playerXInfo = document.getElementById("playerX");
const playerOInfo = document.getElementById("playerO");
const resetBtn = document.getElementById("resetBtn");

// Initialize game
function initGame() {
  // Clear the game board
  while (gameBoard.firstChild) {
    gameBoard.removeChild(gameBoard.firstChild);
  }

  // Create the board cells
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.classList.add("cell");
    cell.dataset.index = i;
    cell.addEventListener("click", () => handleCellClick(i));
    gameBoard.appendChild(cell);
  }

  // Reset game state
  board = Array(9).fill(null);
  isGameActive = false;
  winningPattern = null;

  // Reset UI
  gameInfo.style.display = "none";
  resetBtn.style.display = "none";
  createGameBtn.disabled = false;
  joinGameBtn.disabled = false;
  gameIdInput.disabled = false;
  updatePlayerInfo();

  showMessage("Create a new game or join an existing one");
}

// Show message to user
function showMessage(message, isError = false) {
  messageDiv.textContent = message;
  messageDiv.className = isError ? "message error" : "message";
}

// Update game board UI
function updateBoard() {
  const cells = gameBoard.querySelectorAll(".cell");

  cells.forEach((cell, index) => {
    // Clear existing classes
    cell.classList.remove("x", "o", "winning-cell");

    // Set X or O class based on board value
    if (board[index] === "X") {
      cell.classList.add("x");
    } else if (board[index] === "O") {
      cell.classList.add("o");
    }

    // Highlight winning cells if any
    if (winningPattern && winningPattern.includes(index)) {
      cell.classList.add("winning-cell");
    }
  });
}

// Update player info display
function updatePlayerInfo() {
  if (!isGameActive && !winningPattern) {
    gameInfo.style.display = "none";
    return;
  }

  gameInfo.style.display = "flex";

  // Reset active states
  playerXInfo.classList.remove("active");
  playerOInfo.classList.remove("active");

  // Set active player
  if (isGameActive) {
    const activeSymbol =
      currentTurn === socket.id
        ? playerSymbol
        : playerSymbol === "X"
        ? "O"
        : "X";
    if (activeSymbol === "X") {
      playerXInfo.classList.add("active");
    } else {
      playerOInfo.classList.add("active");
    }
  }
}

// Handle cell click
function handleCellClick(index) {
  // Check if it's a valid move
  if (!isGameActive || board[index] !== null || socket.id !== currentTurn) {
    return;
  }

  // Send move to server
  socket.emit("makeMove", { gameId, position: index });
}

// Socket.IO connection
socket = io();

socket.on("connect", () => {
  console.log("Connected to server");
});

// Event: Game created successfully
socket.on("gameCreated", (data) => {
  gameId = data.gameId;
  playerSymbol = data.symbol;

  showMessage(data.message);
  createGameBtn.disabled = true;
  gameIdInput.value = gameId;
  gameIdInput.select();
});

// Event: Successfully joined a game
socket.on("joinedGame", (data) => {
  gameId = data.gameId;
  playerSymbol = data.symbol;

  showMessage(`Joined game ${gameId}. You are playing as ${playerSymbol}`);
  joinGameBtn.disabled = true;
  gameIdInput.disabled = true;
});

// Event: Opponent joined the game
socket.on("opponentJoined", () => {
  showMessage("Opponent joined! Game is starting...");
});

// Event: Game starts
socket.on("gameStart", (data) => {
  board = data.board;
  currentTurn = data.currentTurn;
  isGameActive = true;

  updateBoard();
  updatePlayerInfo();

  const isYourTurn = currentTurn === socket.id;
  showMessage(
    isYourTurn ? "Game started! Your turn" : "Game started! Opponent's turn"
  );
});

// Event: Move made by either player
socket.on("moveMade", (data) => {
  board = data.board;
  currentTurn = data.currentTurn;

  updateBoard();
  updatePlayerInfo();

  const isYourTurn = currentTurn === socket.id;
  showMessage(isYourTurn ? "Your turn" : "Opponent's turn");
});

// Event: Game over
socket.on("gameOver", (data) => {
  board = data.board;
  isGameActive = false;

  if (data.result.winner === "draw") {
    showMessage("Game ended in a draw!");
  } else {
    winningPattern = data.result.winningPattern;
    const winnerSymbol = data.result.winner;
    const youWon = winnerSymbol === playerSymbol;

    showMessage(youWon ? "You won!" : "You lost!");
  }

  updateBoard();
  updatePlayerInfo();

  // Show reset button
  resetBtn.style.display = "inline-block";
});

// Event: Game reset
socket.on("gameReset", (data) => {
  // Update game state
  board = data.board;
  currentTurn = data.currentTurn;
  isGameActive = true;
  winningPattern = null;

  // Show message
  showMessage(data.message);

  // Update UI
  updateBoard();
  updatePlayerInfo();

  // Hide reset button
  resetBtn.style.display = "none";
});

// Event: Opponent left
socket.on("opponentLeft", (data) => {
  showMessage(data.message);
  isGameActive = false;

  // Enable creating a new game
  createGameBtn.disabled = false;
  joinGameBtn.disabled = false;
  gameIdInput.disabled = false;
  resetBtn.style.display = "inline-block";

  updatePlayerInfo();
});

// Event: Error
socket.on("error", (data) => {
  showMessage(data.message, true);
});

// Event listeners
createGameBtn.addEventListener("click", () => {
  socket.emit("createGame");
});

joinGameBtn.addEventListener("click", () => {
  const id = gameIdInput.value.trim().toUpperCase();
  if (!id) {
    showMessage("Please enter a valid game ID", true);
    return;
  }

  socket.emit("joinGame", { gameId: id });
});

resetBtn.addEventListener("click", () => {
  if (gameId) {
    // Request game reset from server
    socket.emit("resetGame", { gameId });
  } else {
    // If no game ID (should not happen normally), just reset UI
    initGame();
  }
});

// Initialize the game
initGame();
