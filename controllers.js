import jwt from 'jsonwebtoken';
import { connectDB } from "./mongodb.js";
import User from './models/User.js';
import { Contact } from './models/Contact.js';
import { parse } from 'cookie'; // 👈 install with: npm install cookie
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { authenticateSocketUser } from './utils/socketAuth.js';
import { v2 as cloudinary } from 'cloudinary';
import { Message } from './models/Message.js';
import { time } from 'console';
import mongoose from 'mongoose';
export async function handleAddContact(socket, data) {
  try {
    await connectDB();

    const { user: currentUser, error } = await authenticateSocketUser(socket);
    if (error) return socket.emit('add_contact_error', { error });

    const { email } = data;
    if (!email) {
      return socket.emit('add_contact_error', { error: 'Email is required' });
    }

    const contactUser = await User.findOne({ email });
    if (!contactUser) {
      return socket.emit('add_contact_error', { error: 'Contact user not found' });
    }

    const existingContact = await Contact.findOne({
      user: currentUser._id,
      contactUser: contactUser._id,
    });

    if (existingContact) {
      return socket.emit('add_contact_success', {
        message: 'Already added as contact',
        contact: existingContact,
      });
    }

    const currentToContact = await Contact.create({
      user: currentUser._id,
      contactUser: contactUser._id,
      unread: 0,
      lastMessage: '',
      time: new Date().toISOString(),
      status: 'offline',
    });

 
    const contactToCurrent = await Contact.create({
      user: contactUser._id,
      contactUser: currentUser._id,
      unread: 0,
      lastMessage: '',
      time: new Date().toISOString(),
      status: 'offline',
    });

    currentUser.contacts.push(currentToContact._id);
    contactUser.contacts.push(contactToCurrent._id);


    await Promise.all([currentUser.save(), contactUser.save()]);

    return socket.emit('add_contact_success', {
      message: 'Contact added successfully',
      contact: currentToContact,
    });
  } catch (err) {
    console.error(err);
    return socket.emit('add_contact_error', { error: 'Something went wrong' });
  }
}
export async function handleGetContacts(socket) {
  try {
    await connectDB();
    const { user: currentUser, error } = await authenticateSocketUser(socket);
    if (error) return socket.emit('get_contacts_error', { error });

    const populatedUser = await User.findById(currentUser._id)
      .populate({
        path: 'contacts',
        model: Contact,
        populate: {
          path: 'contactUser',
          select: 'name email avatarUrl status',
        },
        select: '-__v',
        options: { sort: { time: -1 } }, // optional sorting
      })
      .lean();

    const contacts = populatedUser?.contacts || [];

    return socket.emit('get_contacts_success', {
      message: contacts.length
        ? 'Contacts fetched successfully'
        : 'No contacts found. Start by adding someone!',
      contacts,
    });
  } catch (err) {
    console.error('[CONTACTS_FETCH_ERROR]', err);
    return socket.emit('get_contacts_error', { error: 'Something went wrong' });
  }
}
export async function handleOnline(socket) {
  try {
    await connectDB();
    const { user: currentUser, error } = await authenticateSocketUser(socket);
    if (error) return socket.emit('handleOnline_error', { error });

    
    await Contact.updateMany(
      { contactUser: currentUser._id },
      { status: 'online' }
    );

  
    const contacts = await Contact.find({ user: currentUser._id }).select('contactUser');

    for (const contact of contacts) {
      const contactId = contact.contactUser.toString();
      const ids = [currentUser._id.toString(), contactId].sort();
      const room = `${ids[0]}-${ids[1]}`;

      socket.to(room).emit('contact_status_update', {
        contactId: currentUser._id,
        status: 'online',
      });
    }

    return socket.emit('handleOnline_success', {
      message: 'You are online',
    });
  } catch (err) {
    console.error('[HANDLE_ONLINE_ERROR]', err);
    return socket.emit('handleOnline_error', { error: 'Something went wrong' });
  }
}
export async function handleOffline(socket) {
  try {
    await connectDB();
    const { user: currentUser, error } = await authenticateSocketUser(socket);
    if (error) return socket.emit('handleOffline_error', { error });

    await Contact.updateMany(
      { contactUser: currentUser._id },
      { status: 'offline' }
    );

    const contacts = await Contact.find({ user: currentUser._id }).select('contactUser');

    for (const contact of contacts) {
      const contactId = contact.contactUser.toString();
      const ids = [currentUser._id.toString(), contactId].sort();
      const room = `${ids[0]}-${ids[1]}`;
      
      socket.to(room).emit('contact_status_update', {
        contactId: currentUser._id,
        status: 'offline',
      });
    }

    return socket.emit('handleOffline_success', {
      message: 'You are offline',
    });
  } catch (err) {
    console.error('[HANDLE_OFFLINE_ERROR]', err);
    return socket.emit('handleOffline_error', { error: 'Something went wrong' });
  }
}
export async function getProfile(socket) {
  try{
    await connectDB();

    const { user: currentUser, error } = await authenticateSocketUser(socket);
    if (error) return socket.emit('getProfile_error', { error });
    const user = await User.findById(currentUser._id).select('-password -__v');
    if (!user) {
      return socket.emit('getProfile_error', { error: 'User not found' });
    }
    return socket.emit('getProfile_success', {
      message: 'Profile fetched successfully',
      user,
    });

  }
  catch (err) {
    console.error('[PROFILE_FETCH_ERROR]', err);
    return socket.emit('getProfile_error', { error: 'Something went wrong' });
  }
}
export async function handleupdateProfile(socket, data) {
  try {
    await connectDB();

    const { user: currentUser, error } = await authenticateSocketUser(socket);
    if (error) return socket.emit('updateProfile_error', { error });

    const { name, email, avatarUrl } = data;
    if (!name || !email) {
      return socket.emit('updateProfile_error', { error: 'Name and email are required' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      currentUser._id,
      { name, email, avatarUrl },
      { new: true, runValidators: true }
    ).select('-password -__v');

    if (!updatedUser) {
      return socket.emit('updateProfile_error', { error: 'User not found' });
    }

    
    const contacts = await Contact.find({ user: currentUser._id }).select('contactUser');

  
    for (const contact of contacts) {
      const contactId = contact.contactUser.toString();
      const ids = [currentUser._id.toString(), contactId].sort();
      const room = `${ids[0]}-${ids[1]}`;

      socket.to(room).emit('contact_profile_updated', {
        contactId: updatedUser._id,
        updatedData: {
          name: updatedUser.name,
          email: updatedUser.email,
          avatarUrl: updatedUser.avatarUrl,
        },
      });
    }

    
    socket.emit('updateProfile_success', {
      message: 'Profile updated successfully',
      user: updatedUser,
    });

  } catch (err) {
    console.error('[PROFILE_UPDATE_ERROR]', err);
    return socket.emit('updateProfile_error', {
      error: 'Something went wrong',
    });
  }
}
export async function joinRoom(socket, data) {
  try {
    await connectDB();

    const { user: currentUser, error } = await authenticateSocketUser(socket);
    if (error) return socket.emit('join_room_error', { error });

    const { contactid } = data;
    if (!contactid || !mongoose.Types.ObjectId.isValid(contactid)) {
      return socket.emit('join_room_error', { error: 'Valid Contact ID is required' });
    }

    
    const isValidContact = await Contact.findOne({
      user: currentUser._id,
      contactUser: contactid,
    });

    if (!isValidContact) {
      return socket.emit('join_room_error', {
        error: 'You are not allowed to chat with this user.',
      });
    }

    
    await Contact.findOneAndUpdate(
      { user:currentUser._id , contactUser: contactid },
      { unread: 0 },
      { new: true }
    );

    const ids = [currentUser._id.toString(), contactid.toString()].sort();
    const room = `${ids[0]}-${ids[1]}`;
    socket.join(room);

    
    socket.emit('unread_reset', { contactId: contactid });

    return socket.emit('join_room_success', {
      message: 'Room joined successfully',
      room,
    });
  } catch (err) {
    console.error('[JOIN_ROOM_ERROR]', err);
    return socket.emit('join_room_error', { error: 'Something went wrong' });
  }
}
export async function handlemessageSend(socket, data) {
  try {
    await connectDB();

    const { user: currentUser, error } = await authenticateSocketUser(socket);
    if (error) return socket.emit('message_error', { error });

    const { senderId, receiverId, text } = data;
    if (!senderId || !receiverId || !text) {
      return socket.emit('message_error', {
        error: 'Missing senderId, receiverId, or text',
      });
    }

    const ids = [senderId.toString(), receiverId.toString()].sort();
    const room = `${ids[0]}-${ids[1]}`;

    const message = await Message.create({
      roomId: room,
      senderId,
      receiverId,
      text,
      timestamp: new Date(),
      status: 'sent',
    });

    
    socket.to(room).emit('message_received', {
      message,
      room,
    });


    socket.emit('message_sent', {
      message,
      room,
    });

    
    await Contact.findOneAndUpdate(
      { user: receiverId, contactUser: senderId },
      {
        $inc: { unread: 1 },
        lastMessage: text,
        time: new Date().toISOString(),
      },
      { new: true }
    );

    return;
  } catch (err) {
    console.error('[MESSAGE_SEND_ERROR]', err);
    return socket.emit('message_error', { error: 'Something went wrong' });
  }
}
export async function handlegetMessages(socket, data) {
  try {
    await connectDB();

    const { user: currentUser, error } = await authenticateSocketUser(socket);
    if (error) return socket.emit('message_error', { error });

    const { contactId } = data;
    if (!contactId) {
      return socket.emit('message_error', { error: 'Contact ID is required' });
    }

    const ids = [contactId.toString(), currentUser._id.toString()].sort();
    const room = `${ids[0]}-${ids[1]}`;

    const messages = await Message.find({ roomId: room }).sort({ timestamp: 1 });

    return socket.emit('get_messages_success', { messages });
  } catch (err) {
    console.error('[GET_MESSAGES_ERROR]', err);
    return socket.emit('message_error', { error: 'Something went wrong' });
  }
}
export async function handleJoinAllRooms(socket) {
  try {
    await connectDB();
    const { user: currentUser, error } = await authenticateSocketUser(socket);
    if (error) return socket.emit('join_all_rooms_error', { error });

    const contacts = await Contact.find({ user: currentUser._id }).select('contactUser');
    
    for (const contact of contacts) {
      const ids = [currentUser._id.toString(), contact.contactUser.toString()].sort();
      const room = `${ids[0]}-${ids[1]}`;
      socket.join(room);
    }

    socket.emit('join_all_rooms_success', { message: 'All rooms joined successfully' });
  } catch (err) {
    console.error('[JOIN_ALL_ROOMS_ERROR]', err);
    socket.emit('join_all_rooms_error', { error: 'Something went wrong' });
  }
}
export async function handleTypingStarted(socket, data) {
  try {
    const { user: currentUser, error } = await authenticateSocketUser(socket);
    if (error) return socket.emit('typing_error', { error: 'Authentication failed' });

    const { senderId, receiverId } = data;
    if (!senderId || !receiverId) {
      return socket.emit('typing_error', { error: 'Missing sender or receiver ID' });
    }

    // Ensure it's the current authenticated user who is sending the typing event
    if (currentUser._id.toString() !== senderId) {
        return socket.emit('typing_error', { error: 'Unauthorized typing event' });
    }

    const ids = [senderId.toString(), receiverId.toString()].sort();
    const room = `${ids[0]}-${ids[1]}`;

    
    socket.to(room).emit('typing_started', { senderId }); 
    console.log(`User ${senderId} started typing in room ${room}`);

  } catch (err) {
    console.error('[TYPING_STARTED_ERROR]', err);
    socket.emit('typing_error', { error: 'Failed to broadcast typing status' });
  }
}
export async function handleTypingStopped(socket, data) {
  try {
    const { user: currentUser, error } = await authenticateSocketUser(socket);
    if (error) return socket.emit('typing_error', { error: 'Authentication failed' });

    const { senderId, receiverId } = data;
    if (!senderId || !receiverId) {
      return socket.emit('typing_error', { error: 'Missing sender or receiver ID' });
    }

    if (currentUser._id.toString() !== senderId) {
        return socket.emit('typing_error', { error: 'Unauthorized typing event' });
    }

    const ids = [senderId.toString(), receiverId.toString()].sort();
    const room = `${ids[0]}-${ids[1]}`;

    // Emit to everyone in the room except the sender
    socket.to(room).emit('typing_stopped', { senderId }); // Only need to send senderId
    console.log(`User ${senderId} stopped typing in room ${room}`);

  } catch (err) {
    console.error('[TYPING_STOPPED_ERROR]', err);
    socket.emit('typing_error', { error: 'Failed to broadcast typing status' });
  }
}




