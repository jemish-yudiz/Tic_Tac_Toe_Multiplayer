// Game variables
let socket = null;
let gameId = null;
let playerSymbol = null;
let currentTurn = null;
let board = Array(9).fill(null);
let isGameActive = false;
let winningPattern = null;
let username = null;
let password = null;

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
const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const saveUsernameBtn = document.getElementById("saveUsernameBtn");
const playerStats = document.getElementById("playerStats");
const playerUsername = document.getElementById("playerUsername");
const statGames = document.getElementById("statGames");
const statWins = document.getElementById("statWins");
const statLosses = document.getElementById("statLosses");
const statDraws = document.getElementById("statDraws");

// Initialize socket connection
function initializeSocket() {
  if (!socket) {
    socket = io();
    setupSocketListeners();
  }
}

// Initialize game
async function initGame() {
  try {
    // Try to get existing player data from localStorage first
    let player = JSON.parse(localStorage.getItem("player") || "null");

    if (!player) {
      showMessage(
        "Please enter your username and password to start playing",
        "info"
      );
      // Disable game controls until user logs in
      createGameBtn.disabled = true;
      joinGameBtn.disabled = true;
      gameIdInput.disabled = true;
      return;
    }

    // Update username field if available
    if (player.username) {
      usernameInput.value = player.username;
      if (playerUsername) {
        playerUsername.textContent = player.username;
      }
    }

    // Load player stats
    await loadPlayerStats(player.username);

    // Initialize socket connection
    initializeSocket();

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
  } catch (error) {
    console.error("Error initializing game:", error);
    showMessage(
      error.message || "Error initializing game. Please try again.",
      "error"
    );
  }
}

// Load player stats from server
async function loadPlayerStats(username) {
  try {
    const response = await fetch(`/api/players/${username}`);

    if (!response.ok) {
      if (response.status === 404) {
        // Player stats not found - create a stats error element
        const statsContainer =
          document.querySelector(".player-stats") ||
          document.createElement("div");
        statsContainer.className = "player-stats";

        // Clear any existing content
        statsContainer.innerHTML = "";

        // Create error notification
        const errorDiv = document.createElement("div");
        errorDiv.className = "stats-error";
        errorDiv.textContent = "Failed to load player stats";

        // Create retry button
        const retryButton = document.createElement("button");
        retryButton.className = "retry-button";
        retryButton.textContent = "Retry";
        retryButton.onclick = () => loadPlayerStats(username);

        // Append elements
        statsContainer.appendChild(errorDiv);
        statsContainer.appendChild(retryButton);

        // If the container isn't already in the DOM, append it
        const gameContainer = document.querySelector(".container");
        if (!statsContainer.parentNode) {
          gameContainer.appendChild(statsContainer);
        }

        // Return default stats object
        return {
          wins: 0,
          losses: 0,
          draws: 0,
          totalGames: 0,
        };
      }

      throw new Error(
        `Failed to load player stats (Status: ${response.status})`
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Error loading player stats:", error);

    // Try to create fallback UI if function was called from initGame
    try {
      const statsContainer =
        document.querySelector(".player-stats") ||
        document.createElement("div");
      statsContainer.className = "player-stats";

      // Clear any existing content
      statsContainer.innerHTML = "";

      // Create error notification
      const errorDiv = document.createElement("div");
      errorDiv.className = "stats-error";
      errorDiv.textContent = "Error loading player statistics";

      // Create retry button
      const retryButton = document.createElement("button");
      retryButton.className = "retry-button";
      retryButton.textContent = "Retry";
      retryButton.onclick = () => loadPlayerStats(username);

      // Append elements
      statsContainer.appendChild(errorDiv);
      statsContainer.appendChild(retryButton);

      // If the container isn't already in the DOM, append it
      const gameContainer = document.querySelector(".container");
      if (!statsContainer.parentNode) {
        gameContainer.appendChild(statsContainer);
      }
    } catch (uiError) {
      console.error("Error creating fallback UI:", uiError);
    }

    // Return default stats object
    return {
      wins: 0,
      losses: 0,
      draws: 0,
      totalGames: 0,
    };
  }
}

// Save username and initialize game
async function saveUsername() {
  const newUsername = usernameInput.value.trim();
  const newPassword = passwordInput.value.trim();

  if (!newUsername || !newPassword) {
    showMessage("Please enter both username and password", "error");
    return;
  }

  try {
    const response = await fetch("/api/players/initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: newUsername,
        password: newPassword,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to save username");
    }

    if (!data.success) {
      throw new Error("Authentication failed");
    }

    // Save player data to localStorage
    localStorage.setItem("player", JSON.stringify(data.player));

    // Update displayed username
    if (playerUsername) {
      playerUsername.textContent = newUsername;
    }

    showMessage(data.message, false, "success");

    // Initialize the game after successful login
    await initGame();
  } catch (error) {
    console.error("Error saving username:", error);
    showMessage(
      error.message || "Failed to save username. Please try again.",
      "error"
    );
  }
}

// Show message to user
function showMessage(message, isError = false, type = "") {
  messageDiv.textContent = message;

  // Reset classes
  messageDiv.className = "message";

  if (isError) {
    messageDiv.classList.add("error");
  } else if (type) {
    messageDiv.classList.add(type);
  }
}

// Update board UI
function updateBoard() {
  const cells = gameBoard.querySelectorAll(".cell");

  // Update the game board class based on game state
  if (winningPattern) {
    gameBoard.classList.add("winning");
  } else {
    gameBoard.classList.remove("winning");
  }

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

// Setup socket event listeners
function setupSocketListeners() {
  // Handle game creation response
  socket.on("gameCreated", (data) => {
    gameId = data.gameId;
    playerSymbol = data.symbol;
    showMessage(data.message);
    createGameBtn.disabled = true;
    joinGameBtn.disabled = true;
    gameIdInput.disabled = true;
    gameInfo.style.display = "flex";
    updatePlayerInfo();
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

    const result = data.result;
    if (result.winner === "draw") {
      showMessage("Game over! It's a draw!");
    } else {
      if (result.winner === playerSymbol) {
        showMessage("Congratulations! You won the game!");
      } else {
        showMessage("Game over! You lost.");
      }

      // Highlight winning pattern
      if (result.winningPattern) {
        winningPattern = result.winningPattern;
        highlightWinningPattern();
      }
    }

    updateBoard();
    updatePlayerInfo();

    // Show reset button
    resetBtn.style.display = "block";

    // Refresh player stats
    setTimeout(loadPlayerStats, 1000);
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
}

// Create event listeners
document.addEventListener("DOMContentLoaded", () => {
  // Initialize the game (will show message to enter username/password if not set)
  initGame();

  // Create game button listener
  createGameBtn.addEventListener("click", () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) {
      showMessage("Please enter both username and password", "error");
      return;
    }
    socket.emit("createGame", { username, password });
  });

  // Join game button listener
  joinGameBtn.addEventListener("click", () => {
    const id = gameIdInput.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!id) {
      showMessage("Please enter a valid Game ID", true);
      return;
    }

    if (!username || !password) {
      showMessage("Please enter both username and password", "error");
      return;
    }

    socket.emit("joinGame", { gameId: id, username, password });
  });

  // Reset button listener
  resetBtn.addEventListener("click", () => {
    if (gameId) {
      socket.emit("resetGame", { gameId });
    }
  });

  // Save username button listener
  saveUsernameBtn.addEventListener("click", saveUsername);
});

// Highlight winning pattern
function highlightWinningPattern() {
  if (!winningPattern) return;

  const cells = gameBoard.querySelectorAll(".cell");

  // First clear any existing winning-cell classes
  cells.forEach((cell) => {
    cell.classList.remove("winning-cell");
  });

  // Then apply the winning-cell class to the winning cells
  winningPattern.forEach((index) => {
    cells[index].classList.add("winning-cell");
  });

  // Also highlight the game board itself
  gameBoard.classList.add("winning");
}

// Add a function to update the stats display
function updateStatsDisplay(stats) {
  // Create or find the stats container
  let statsContainer = document.querySelector(".player-stats");
  if (!statsContainer) {
    statsContainer = document.createElement("div");
    statsContainer.className = "player-stats";
    const gameContainer = document.querySelector(".container");
    gameContainer.appendChild(statsContainer);
  }

  // Clear any existing content (like error messages)
  statsContainer.innerHTML = "";

  // Create heading
  const heading = document.createElement("h3");
  heading.textContent = "Your Statistics";
  statsContainer.appendChild(heading);

  // Create stats grid
  const statsGrid = document.createElement("div");
  statsGrid.className = "stats-container";

  // Add individual stat items
  const statItems = [
    { label: "Wins", value: stats.wins },
    { label: "Losses", value: stats.losses },
    { label: "Draws", value: stats.draws },
    {
      label: "Total Games",
      value: stats.totalGames || stats.wins + stats.losses + stats.draws,
    },
  ];

  statItems.forEach((item) => {
    const statDiv = document.createElement("div");
    statDiv.className = "stat";

    const label = document.createElement("span");
    label.textContent = item.label;

    const value = document.createElement("span");
    value.textContent = item.value;

    statDiv.appendChild(label);
    statDiv.appendChild(value);
    statsGrid.appendChild(statDiv);
  });

  statsContainer.appendChild(statsGrid);
}
