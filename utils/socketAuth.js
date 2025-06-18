// utils/socketAuth.js
import jwt from 'jsonwebtoken';
import { parse } from 'cookie';
import User from '../models/User.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
export async function authenticateSocketUser(socket) {
  try {
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) {
      return { error: 'No cookie found' };
    }

    const cookies = parse(cookieHeader);
    const token = cookies.token;

    if (!token) {
      return { error: 'Unauthorized: Token missing' };
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return { error: 'Invalid token' };
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return { error: 'User not found' };
    }

    return { user }; // ✅ Success
  } catch (err) {
    console.error('[AUTH_ERROR]', err);
    return { error: 'Authentication failed' };
  }
}
