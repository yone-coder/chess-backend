const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Chess } = require('chess.js');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // In production, replace with your frontend URL
    methods: ["GET", "POST"]
  }
});

const port = process.env.PORT || 3001; // Render assigns PORT
const games = new Map(); // Stores game states

io.on('connection', (socket) => {
  console.log('New client connected');

  // Create a new game room
  socket.on('createRoom', () => {
    const roomId = uuidv4();
    const game = new Chess();
    games.set(roomId, { game, players: [socket.id], colors: { [socket.id]: 'white' } });
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, color: 'white' });
  });

  // Join an existing game room
  socket.on('joinRoom', (roomId) => {
    const room = games.get(roomId);
    if (!room) {
      socket.emit('error', 'Room does not exist');
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('error', 'Room is full');
      return;
    }
    room.players.push(socket.id);
    room.colors[socket.id] = 'black';
    socket.join(roomId);
    socket.emit('roomJoined', { roomId, color: 'black' });
    io.to(roomId).emit('gameStart', { fen: room.game.fen() });
  });

  // Handle moves
  socket.on('move', ({ roomId, move }) => {
    const room = games.get(roomId);
    if (!room) return;
    const game = room.game;
    if (game.turn() === 'w' && room.colors[socket.id] !== 'white') return;
    if (game.turn() === 'b' && room.colors[socket.id] !== 'black') return;
    const result = game.move(move);
    if (result) {
      io.to(roomId).emit('boardUpdate', { fen: game.fen() });
      if (game.isGameOver()) {
        const winner = game.turn() === 'w' ? 'black' : 'white';
        io.to(roomId).emit('gameOver', { winner });
      }
    } else {
      socket.emit('invalidMove');
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    for (const [roomId, room] of games) {
      if (room.players.includes(socket.id)) {
        io.to(roomId).emit('opponentDisconnected');
        games.delete(roomId);
        break;
      }
    }
  });
});

server.listen(port, () => console.log(`Server running on port ${port}`));