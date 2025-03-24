# TicTacToe Game with MongoDB & Redis

This is a multiplayer implementation of the classic Tic-Tac-Toe game built using Express, Socket.IO, MongoDB, and Redis. The game provides a real-time multiplayer experience where players can create and join games using unique game IDs.

## Features

- Real-time multiplayer gaming with Socket.IO
- Game state persistence with MongoDB
- Caching with Redis for improved performance
- Player statistics tracking
- Game history retrieval
- RESTful API endpoints for game and player data

## Technologies Used

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express
- **Real-time Communication**: Socket.IO
- **Database**: MongoDB with Mongoose
- **Caching**: Redis

## API Endpoints

- `GET /api/games` - Get a list of recent games
- `GET /api/games/:gameId` - Get details of a specific game
- `GET /api/players/stats` - Get top player statistics

## Setup Instructions

1. Clone the repository
2. Install dependencies: `npm install`
3. Ensure MongoDB and Redis are running on your system
4. Create a `.env` file with the following variables:
   ```
   PORT=3000
   MONGO_URI=mongodb://localhost:27017/tictactoe
   REDIS_URL=redis://localhost:6379
   ```
5. Start the development server: `npm run dev`
6. Open your browser and navigate to `http://localhost:3000`

## How to Play

1. First player creates a game and receives a game ID
2. Second player joins the game using the game ID
3. Players take turns marking X and O on the grid
4. The first player to get three in a row wins!

## Persistence

- Game states are stored in MongoDB for long-term persistence
- Redis is used for caching active games to improve performance
- Player statistics are tracked across games
