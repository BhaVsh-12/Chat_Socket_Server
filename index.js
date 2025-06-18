import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http'; 
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
// import { parse } from 'cookie';
// import jwt from 'jsonwebtoken';
// import User from './models/User.js';
// import { Contact } from './models/Contact.js';
// import { Message } from './models/Message.js';

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
  // handleUploadImage, 
} from './controllers.js';

import { connectDB } from './mongodb.js'; 

const app = express();
const httpServer = createServer(app);

app.use(cookieParser());
app.use(cors({
  origin: ['http://localhost:3000','https://chat-app-bb.vercel.app'],
  methods: ['GET', 'POST', 'DELETE', 'PUT'], 
  credentials: true, 
}));

const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:3000','https://chat-app-bb.vercel.app'],
    methods: ['GET', 'POST'],
  }
});

// Socket logic
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);
  handleOnline(socket);

  socket.on('get_profile', (data) => getProfile(socket, data));
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