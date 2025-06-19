// main Socket.IO server file (e.g., index.js or server.js)
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
// import cookieParser from 'cookie-parser'; // ✅ CHANGE: Remove cookieParser

import {
  handleGetContacts,
  handleAddContact,
  handleOnline,
  handleOffline,
  getProfile,
  joinRoom,
  handlemessageSend,
  handlegetMessages,
  handleTypingStarted,
  handleTypingStopped,
  handleJoinAllRooms,
  handleupdateProfile // ✅ Add handleupdateProfile import
} from './controllers.js'; // Assuming your controllers are in a separate file
import { authenticateSocketUser } from './utils/socketAuth.js'; // Ensure this import

import { connectDB } from './mongodb.js'; // Assuming your DB connection is in a separate file

const app = express();
const httpServer = createServer(app);

// ✅ CHANGE: Remove app.use(cookieParser());
// app.use(cookieParser()); 

app.use(cors({
  origin: ['http://localhost:3000','https://chat-app-bb.vercel.app'], // Your frontend origins
  methods: ['GET', 'POST', 'DELETE', 'PUT'], 
  credentials: true, // Keep if other API calls from frontend to this backend require credentials
}));

const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:3000','https://chat-app-bb.vercel.app'], // Your frontend origins
    methods: ['GET', 'POST'],
    credentials: true // Keep if other API calls from frontend to this backend require credentials
  }
});

// ✅ CHANGE: Remove the cookie header logging middleware
// io.use((socket, next) => {
//   console.log('Socket Cookie Header:', socket.handshake.headers.cookie);
//   next();
// });

// Socket logic
io.on('connection', async (socket) => { // Make async to await authentication
  console.log('Socket connected:', socket.id);

  // ✅ CHANGE: Get token from handshake.auth
  const token = socket.handshake.auth.token;
  if (!token) {
    console.error('Socket: Token not provided in handshake auth. Disconnecting socket:', socket.id);
    socket.emit('auth_error', { error: 'Authentication failed: Token missing' }); // Inform client
    socket.disconnect(true);
    return;
  }

  // Use the authenticateSocketUser function to verify the token
  const { user, error } = await authenticateSocketUser(token); // Pass token directly
  if (error) {
    console.error('Socket: Authentication failed for socket', socket.id, 'Error:', error);
    socket.emit('auth_error', { error: `Authentication failed: ${error}` }); // Inform client
    socket.disconnect(true);
    return;
  }
  
  // Attach user to socket for later use in controllers
  socket.user = user; 
  console.log(`Socket ${socket.id} authenticated for user: ${user.email}`);

  // Your existing socket event handlers - now they can directly use socket.user
  handleOnline(socket);
  socket.on('get_profile', () => getProfile(socket)); // ✅ No data parameter needed for getProfile now
  socket.on('add_contact', (data) => handleAddContact(socket, data));
  socket.on('get_contacts', () => handleGetContacts(socket));
  socket.on('go_online', () => handleOnline(socket));
  socket.on('go_offline', () => handleOffline(socket));
  socket.on('join_all_rooms', () => handleJoinAllRooms(socket)); 
  socket.on('join_room', (data) => joinRoom(socket, data));
  socket.on('send_message', (data) => handlemessageSend(socket, data));
  socket.on('typing_started', (data) => handleTypingStarted(socket, data));
  socket.on('typing_stopped', (data) => handleTypingStopped(socket, data));
  socket.on('get_messages', (data) => handlegetMessages(socket, data));
  socket.on('update_profile', (data) => handleupdateProfile(socket, data)); // ✅ Add this handler
  socket.on('disconnect', () => {
    handleOffline(socket);
    console.log('Socket disconnected:', socket.id);
  });
});


connectDB();
const PORT = process.env.SOCKET_PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Socket server running at http://localhost:${PORT}`);
});