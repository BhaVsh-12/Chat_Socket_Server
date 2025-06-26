

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

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
    handleupdateProfile ,
     handleLeaveRoom
} from './controllers.js'; 

import { authenticateSocketUser } from './utils/socketAuth.js'; 

import { connectDB } from './mongodb.js'; 

const app = express();
const httpServer = createServer(app);

app.use(cors({
    origin: ['http://localhost:3000', 'https://chat-app-bb.vercel.app'], 
    methods: ['GET', 'POST', 'DELETE', 'PUT'],
    credentials: true,
}));

const io = new Server(httpServer, {
    cors: {
        origin: ['http://localhost:3000', 'https://chat-app-bb.vercel.app'],
        methods: ['GET', 'POST'],
        credentials: true
    }
});


io.on('connection', async (socket) => { 
    console.log('Socket connected:', socket.id);

    const token = socket.handshake.auth.token;
    if (!token) {
        console.error('Socket: Token not provided in handshake auth. Disconnecting socket:', socket.id);
        socket.emit('auth_error', { error: 'Authentication failed: Token missing' }); // Inform client
        socket.disconnect(true);
        return;
    }


    const { user, error } = await authenticateSocketUser(token); 
    if (error) {
        console.error('Socket: Authentication failed for socket', socket.id, 'Error:', error);
        socket.emit('auth_error', { error: `Authentication failed: ${error}` }); 
        socket.disconnect(true);
        return;
    }

    socket.user = user; 
    console.log(`Socket ${socket.id} authenticated for user: ${user.email}`);

    handleOnline(socket);

    // Define all socket event listeners
    socket.on('get_profile', () => getProfile(socket));
    socket.on('add_contact', (data) => handleAddContact(socket, data));
    socket.on('get_contacts', () => handleGetContacts(socket));
    socket.on('go_online', () => handleOnline(socket)); 
    socket.on('go_offline', () => handleOffline(socket));
    socket.on('join_all_rooms', () => handleJoinAllRooms(socket));
    socket.on('join_room', (data) => joinRoom(socket, data));
    socket.on('send_message', (data) => handlemessageSend(io,socket, data));
    socket.on('typing_started', (data) => handleTypingStarted(socket, data));
    socket.on('typing_stopped', (data) => handleTypingStopped(socket, data));
    socket.on('get_messages', (data) => handlegetMessages(socket, data));
    socket.on('leave_room',(data) =>  handleLeaveRoom(socket, data));

    socket.on('updateProfile', (data) => handleupdateProfile(socket, data));

    socket.on('disconnect', () => {
        handleOffline(socket);

    });
});


(async () => {
    try {
        await connectDB();
        const PORT = process.env.SOCKET_PORT || 4000;
        httpServer.listen(PORT, () => {
            console.log(`✅ Socket server running at http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('❌ Failed to connect to DB or start server:', err.message);
    }
})();