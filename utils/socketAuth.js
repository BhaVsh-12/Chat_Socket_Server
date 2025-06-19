// utils/socketAuth.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

export async function authenticateSocketUser(token) {
  try {
    if (!token) {
      console.error('authenticateSocketUser: Unauthorized - Token missing');
      return { error: 'Unauthorized: Token missing' };
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('authenticateSocketUser: Decoded JWT:', decoded);
    } catch (err) {
      console.error('authenticateSocketUser: JWT verification failed:', err.message);
      return { error: 'Invalid token' };
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      console.error('authenticateSocketUser: User not found for ID:', decoded.id);
      return { error: 'User not found' };
    }

    console.log('authenticateSocketUser: User authenticated:', user.email);
    return { user };
  } catch (err) {
    console.error('[AUTH_ERROR]', err.message);
    return { error: 'Authentication failed' };
  }
}
