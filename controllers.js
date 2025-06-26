// controllers.js
import { connectDB } from "./mongodb.js";
import User from './models/User.js';
import { Contact } from './models/Contact.js'; 
import { Message } from './models/Message.js'; 
import mongoose from 'mongoose'; 
import { Group } from './models/Group.js';
function isAuthenticated(socket) {
  if (!socket.user) {
    console.error('Socket: User not authenticated for this operation.');
    return { authenticated: false, error: 'Unauthorized: User not authenticated' };
  }
  return { authenticated: true, user: socket.user };
}
export async function handleAddContact(socket, data) {
  try {
    await connectDB();

  
    const { authenticated, user: currentUser, error } = isAuthenticated(socket);
    if (!authenticated) return socket.emit('add_contact_error', { error });

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
    console.error('[ADD_CONTACT_ERROR]', err);
    return socket.emit('add_contact_error', { error: 'Something went wrong' });
  }
}
export async function handleGetContacts(socket) {
  try {
    await connectDB();
    
    const { authenticated, user: currentUser, error } = isAuthenticated(socket);
    if (!authenticated) return socket.emit('get_contacts_error', { error });

    const populatedUser = await User.findById(currentUser._id)
      .populate({
        path: 'contacts',
        model: 'Contact', 
        populate: {
          path: 'contactUser',
          model: 'User', 
          select: 'name email avatarUrl status', 
        },
        select: '-__v',
        options: { sort: { time: -1 } }, 
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

    const { authenticated, user: currentUser, error } = await isAuthenticated(socket);
    if (!authenticated) return socket.emit('handleOnline_error', { error });

    // 1. Set user as online in others' contact lists
    await Contact.updateMany(
      { contactUser: currentUser._id },
      { status: 'online' }
    );

    // 2. Notify contacts
    const contacts = await Contact.find({ user: currentUser._id }).select('contactUser');

    for (const contact of contacts) {
      const contactId = contact.contactUser.toString();
      const ids = [currentUser._id.toString(), contactId].sort();
      const room = `${ids[0]}-${ids[1]}`;

      // Notify others in the room
      socket.to(room).emit('contact_status_update', {
        contactId: currentUser._id,
        status: 'online',
      });
    }

    const sentMessages = await Message.find({
      receiverId: currentUser._id,
      status: 'sent',
    });

    if (sentMessages.length > 0) {
      // Update in DB
      await Message.updateMany(
        { receiverId: currentUser._id, status: 'sent' },
        { status: 'delivered' }
      );

      // 4. Emit event to sender if they're in room
      for (const msg of sentMessages) {
        const ids = [msg.senderId.toString(), msg.receiverId.toString()].sort();
        const room = `${ids[0]}-${ids[1]}`;

        // Emit to that room only
        socket.to(room).emit('message_status_updated', {
          messageId: msg._id,
          status: 'delivered',
          updatedBy: currentUser._id,
        });
      }
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
    const { authenticated, user: currentUser, error } = isAuthenticated(socket);
    if (!authenticated) return socket.emit('handleOffline_error', { error });

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

 
    const { authenticated, user: currentUser, error } = isAuthenticated(socket);
    if (!authenticated) return socket.emit('getProfile_error', { error });

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
        const currentUser = socket.user;
        if (!currentUser) {
            console.error('Update Profile Error: Unauthorized access. User not attached to socket.');
            return socket.emit('updateProfile_error', { error: 'Authentication required to update profile.' });
        }

        const { avatarUrl } = data; 

        if (!avatarUrl) {
            console.error('Update Profile Error: No avatarUrl provided in data for update.');
            return socket.emit('updateProfile_error', { error: 'No avatar URL provided for update.' });
        }


        const updatedUser = await User.findByIdAndUpdate(
            currentUser._id,
            { avatarUrl: avatarUrl }, 
            { new: true, runValidators: true }
        ).select('-password -__v');

        if (!updatedUser) {
            console.error(`Update Profile Error: User with ID ${currentUser._id} not found in DB.`);
            return socket.emit('updateProfile_error', { error: 'User not found for update.' });
        }

        console.log(`✅ User profile updated for ${updatedUser.email}. New avatarUrl: ${updatedUser.avatarUrl}`);

        const contacts = await Contact.find({ user: currentUser._id }).select('contactUser');
        for (const contact of contacts) {
            const contactId = contact.contactUser._id.toString();
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
            message: 'Profile updated successfully!',
            user: { 
                _id: updatedUser._id,
                name: updatedUser.name,
                email: updatedUser.email,
                avatarUrl: updatedUser.avatarUrl,
            },
        });

    } catch (err) {
        console.error('[PROFILE_UPDATE_ERROR]', err);
        return socket.emit('updateProfile_error', {
            error: 'Something went wrong while updating profile. Please try again.',
        });
    }
}
export async function joinRoom(socket, data) {
  try {
    await connectDB();
    const { authenticated, user: currentUser, error } = isAuthenticated(socket);
    if (!authenticated) return socket.emit('join_room_error', { error });
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
    const contact = await Contact.findOne({
      user: contactid,
      contactUser: currentUser._id,
    });
    await Contact.findOneAndUpdate(
      { user:currentUser._id , contactUser: contactid },
      { unread: 0 },
      { new: true }
    );
    const ids = [currentUser._id.toString(), contactid.toString()].sort();
    const room = `${ids[0]}-${ids[1]}`;
    socket.join(room);
    const messages = await Message.find({ roomId: room, receiverId: currentUser._id });
    for (const message of messages) {
      if (message.status === 'sent' || message.status === 'delivered') {
        message.status = 'read';
        await message.save();
      }
    }
    isValidContact.inroom=true;
    await isValidContact.save();
    socket.emit('messages_updated', { room, updated: true });
    socket.to(room).emit('contact_joined', {
      contactId: contactid,
      userId: currentUser._id,
      status:contact.status,
      inroom:contact.inroom,
    }, () => {
      console.log(`User ${currentUser._id} joined room ${room} baba yyvvvv ${contact}`);
    });
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
export async function handlemessageSend(io, socket, data) {
  try {
    await connectDB();

    const { authenticated, user: currentUser, error } = await isAuthenticated(socket);
    if (!authenticated) return socket.emit('message_error', { error });

    const { senderId, receiverId, text } = data;
    if (!senderId || !receiverId || !text) {
      return socket.emit('message_error', {
        error: 'Missing senderId, receiverId, or text',
      });
    }

    if (currentUser._id.toString() !== senderId.toString()) {
      return socket.emit('message_error', { error: 'Unauthorized: Sender ID mismatch' });
    }

    const ids = [senderId.toString(), receiverId.toString()].sort();
    const room = `${ids[0]}-${ids[1]}`;

    const socketsInRoom = await io.in(room).fetchSockets();
    const userIdsInRoom = socketsInRoom.map(s => s.id);

    const receiverContact = await Contact.findOne({
      user: receiverId,
      contactUser: senderId,
    });
    const senderContact = await Contact.findOne({
      user: senderId,
      contactUser: receiverId,
    });
    let status = 'sent';
    if (userIdsInRoom.length === 2 && receiverContact?.inroom) {
      status = 'read';
    } else if (senderContact?.status === 'online' && !receiverContact.inroom) {
      status = 'delivered';
    }

    const message = await Message.create({
      roomId: room,
      senderId,
      receiverId,
      text,
      timestamp: new Date(),
      status,
    });

    socket.to(room).emit('message_received', { message, room });
    socket.emit('message_sent', { message, room });
    // ➊ after you call Contact.findOneAndUpdate(...)
const updatedContact = await Contact.findOne(
  { user: receiverId, contactUser: senderId },
  'unread lastMessage time'
).lean();

socket.to(room).emit('contacts_changes', {
  receiverId,             
  senderId,               
  unread: updatedContact.unread,
  lastMessage: text,
  time: updatedContact.time
});

    const updatePayload = {
      lastMessage: text,
      time: new Date().toISOString(),
    };

    if (receiverContact && !receiverContact.inroom) {
      updatePayload.$inc = { unread: 1 };
    }

    if (receiverContact) {
      await Contact.findOneAndUpdate(
        { user: receiverId, contactUser: senderId },
        updatePayload,
        { new: true }
      );
    }

  } catch (err) {
    console.error('[MESSAGE_SEND_ERROR]', err);
    return socket.emit('message_error', { error: 'Something went wrong' });
  }
}

export async function handlegetMessages(socket, data) {
  try {
    await connectDB();

    const { authenticated, user: currentUser, error } = isAuthenticated(socket);
    if (!authenticated) return socket.emit('message_error', { error });

    const { contactId } = data;
    if (!contactId || !mongoose.Types.ObjectId.isValid(contactId)) {
      return socket.emit('message_error', { error: 'Valid Contact ID is required' });
    }


    const isValidContact = await Contact.findOne({
      user: currentUser._id,
      contactUser: contactId,
    });

    if (!isValidContact) {
      return socket.emit('message_error', {
        error: 'You are not allowed to view messages with this user.',
      });
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
export async function handleLeaveRoom(socket, data) {
  try {
    const { authenticated, user: currentUser, error } = await isAuthenticated(socket);
    if (!authenticated) {
      return socket.emit('leave_room_error', { error: error || 'Authentication failed.' });
    }

    const contactId = data;
    if (!contactId || !mongoose.Types.ObjectId.isValid(contactId)) {
      return socket.emit('leave_room_error', { error: 'Valid Contact ID is required.' });
    }

    const isValidContact = await Contact.findOne({
      user: currentUser._id,
      contactUser: contactId,
    });

    if (!isValidContact) {
      return socket.emit('leave_room_error', {
        error: 'You are not allowed to leave this room, or the contact does not exist.',
      });
    }

    isValidContact.inroom = false;
    await isValidContact.save();
    const ids = [currentUser._id.toString(), contactId.toString()].sort();
    const room = `${ids[0]}-${ids[1]}`;
    socket.leave(room);

    socket.to(room).emit('contact_left', {
      contactId: currentUser._id,
      userId: contactId,
      message: `${currentUser.name || 'A user'} has left the chat.`,
    });

    return socket.emit('leave_room_success', {
      message: 'Successfully left the room.',
      room,
    });

  } catch (err) {
    console.error('[LEAVE_ROOM_ERROR]', err);
    return socket.emit('leave_room_error', {
      error: 'Something went wrong while leaving the room.',
    });
  }
}

export async function handleJoinAllRooms(socket) {
  try {
    await connectDB();

    const { authenticated, user: currentUser, error } = await isAuthenticated(socket);
    if (!authenticated) {
      return socket.emit('join_all_rooms_error', { error });
    }

    const contacts = await Contact.find({ user: currentUser._id }).select('contactUser');

    for (const contact of contacts) {
      const ids = [currentUser._id.toString(), contact.contactUser.toString()].sort();
      const room = `${ids[0]}-${ids[1]}`;
      socket.join(room);
      console.log(`✅ User ${currentUser._id} joined room ${room} joinallroom s@@@@@@@@@@@@@@@`);
    }

    socket.emit('join_all_rooms_success', { message: 'All rooms joined successfully' });

  } catch (err) {
    console.error('[JOIN_ALL_ROOMS_ERROR]', err);
    socket.emit('join_all_rooms_error', { error: 'Something went wrong' });
  }
}

export async function handleTypingStarted(socket, data) {
  try {

    const { authenticated, user: currentUser, error } = isAuthenticated(socket);
    if (!authenticated) return socket.emit('typing_error', { error: 'Authentication failed' });

    const { senderId, receiverId } = data;
    if (!senderId || !receiverId) {
      return socket.emit('typing_error', { error: 'Missing sender or receiver ID' });
    }

   
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
    
    const { authenticated, user: currentUser, error } = isAuthenticated(socket);
    if (!authenticated) return socket.emit('typing_error', { error: 'Authentication failed' });

    const { senderId, receiverId } = data;
    if (!senderId || !receiverId) {
      return socket.emit('typing_error', { error: 'Missing sender or receiver ID' });
    }

    if (currentUser._id.toString() !== senderId) {
        return socket.emit('typing_error', { error: 'Unauthorized typing event' });
    }

    const ids = [senderId.toString(), receiverId.toString()].sort();
    const room = `${ids[0]}-${ids[1]}`;


    socket.to(room).emit('typing_stopped', { senderId }); // Only need to send senderId
    console.log(`User ${senderId} stopped typing in room ${room}`);

  } catch (err) {
    console.error('[TYPING_STOPPED_ERROR]', err);
    socket.emit('typing_error', { error: 'Failed to broadcast typing status' });
  }
}
export async function handleCreateGroup(socket, data) {
  try {
    await connectDB();
    
    const { authenticated, user: currentUser, error } = isAuthenticated(socket);
    if (!authenticated) {
      return socket.emit('create_group_error', { error });
    }

    const { name, avatarUrl, description } = data;

 
    if (!name || !avatarUrl || !description) {
      return socket.emit('create_group_error', {
        error: 'Name, avatarUrl, and description are required.',
      });
    }

    const existingGroup = await Group.findOne({ name });
    if (existingGroup) {
      return socket.emit('create_group_error', {
        error: 'A group with this name already exists.',
      });
    }

    const newGroup = new Group({
      name,
      avatarUrl,
      description,
      members: [currentUser._id],
      admin: currentUser._id,
    });

    await newGroup.save();

    socket.emit('create_group_success', {
      message: 'Group created successfully',
      group: newGroup,
    });
  } catch (err) {
    console.error('[CREATE_GROUP_ERROR]', err);
    socket.emit('create_group_error', {
      error: 'Something went wrong while creating the group.',
    });
  }
}
export async function handleAddMember(socket, data) {
  try {
    await connectDB();

    const { authenticated, user: currentUser, error } = isAuthenticated(socket);
    if (!authenticated) {
      return socket.emit('add_member_error', { error });
    }

    const { email, groupId } = data;
    if (!email || !groupId) {
      return socket.emit('add_member_error', {
        error: 'Email and groupId are required.',
      });
    }

    const contactUser = await User.findOne({ email });
    if (!contactUser) {
      return socket.emit('add_member_error', {
        error: 'User with this email does not exist.',
      });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return socket.emit('add_member_error', {
        error: 'Group not found.',
      });
    }
    if (group.admin.toString() !== currentUser._id.toString()) {
      return socket.emit('add_member_error', {
        error: 'Only group admins can add members.',
      });
    }
    const alreadyMember = group.members.some(
      (id) => id.toString() === contactUser._id.toString()
    );

    if (alreadyMember) {
      return socket.emit('add_member_error', {
        error: 'User is already a member of the group.',
      });
    }

    group.members.push(contactUser._id);
    await group.save();
    socket.emit('add_member_success', {
      message: 'Member added successfully.',
      group,
    });
    socket.to(group._id.toString()).emit('member_added', {
      groupId: group._id,
      member: {
        _id: contactUser._id,
        name: contactUser.name,
        email: contactUser.email,
        avatar: contactUser.avatar || '',
      },
    });
    const connectedSockets = await socket.server.in(contactUser._id.toString()).fetchSockets();
    connectedSockets.forEach((s) => s.join(group._id.toString()));

  } catch (err) {
    console.error('[ADD_MEMBER_ERROR]', err);
    socket.emit('add_member_error', {
      error: 'Something went wrong while adding the member.',
    });
  }
}
export async function handleLeaveGroup(socket, data) {
  try {
    await connectDB();

    const { authenticated, user: currentUser, error } = isAuthenticated(socket);
    if (!authenticated) {
      return socket.emit('leave_group_error', { error });
    }

    const { groupId } = data;
    if (!groupId) {
      return socket.emit('leave_group_error', {
        error: 'Group ID is required.',
      });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return socket.emit('leave_group_error', {
        error: 'Group not found.',
      });
    }

    // Prevent admin from leaving without transfer
    if (group.admin.toString() === currentUser._id.toString()) {
      return socket.emit('leave_group_error', {
        error: 'Admin cannot leave the group. Transfer admin rights first.',
      });
    }

    const isMember = group.members.includes(currentUser._id);
    if (!isMember) {
      return socket.emit('leave_group_error', {
        error: 'You are not a member of this group.',
      });
    }

    group.members = group.members.filter(
      (id) => id.toString() !== currentUser._id.toString()
    );
    await group.save();

    socket.leave(groupId);

    socket.emit('leave_group_success', {
      message: 'You have left the group.',
      groupId,
    });

    socket.to(groupId).emit('member_left', {
      groupId,
      memberId: currentUser._id,
    });
  } catch (err) {
    console.error('[LEAVE_GROUP_ERROR]', err);
    socket.emit('leave_group_error', {
      error: 'Something went wrong while leaving the group.',
    });
  }
}
export async function handleRemoveMember(socket, data) {
  try {
    await connectDB();

    const { authenticated, user: currentUser, error } = isAuthenticated(socket);
    if (!authenticated) {
      return socket.emit('remove_member_error', { error });
    }

    const { email, groupId } = data;
    if (!email || !groupId) {
      return socket.emit('remove_member_error', {
        error: 'Email and groupId are required.',
      });
    }

    const targetUser = await User.findOne({ email });
    if (!targetUser) {
      return socket.emit('remove_member_error', {
        error: 'User not found.',
      });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return socket.emit('remove_member_error', {
        error: 'Group not found.',
      });
    }

    if (group.admin.toString() !== currentUser._id.toString()) {
      return socket.emit('remove_member_error', {
        error: 'Only group admins can remove members.',
      });
    }

    if (targetUser._id.toString() === group.admin.toString()) {
      return socket.emit('remove_member_error', {
        error: 'Admin cannot be removed from the group.',
      });
    }

    const isMember = group.members.includes(targetUser._id);
    if (!isMember) {
      return socket.emit('remove_member_error', {
        error: 'User is not a member of the group.',
      });
    }

    group.members = group.members.filter(
      (id) => id.toString() !== targetUser._id.toString()
    );
    await group.save();

    socket.emit('remove_member_success', {
      message: 'Member removed successfully.',
      groupId,
      memberId: targetUser._id,
    });

    socket.to(groupId).emit('member_removed', {
      groupId,
      memberId: targetUser._id,
    });

    const connectedSockets = await socket.server.in(targetUser._id.toString()).fetchSockets();
    connectedSockets.forEach((s) => s.leave(groupId));

  } catch (err) {
    console.error('[REMOVE_MEMBER_ERROR]', err);
    socket.emit('remove_member_error', {
      error: 'Something went wrong while removing the member.',
    });
  }
}
export async function handleGroupMessageSend(socket, data) {
  try {
    await connectDB();

    const { authenticated, user: currentUser, error } = isAuthenticated(socket);
    if (!authenticated) {
      return socket.emit('group_message_error', { error });
    }

    const { groupId, text } = data;

    if (!groupId || !text?.trim()) {
      return socket.emit('group_message_error', {
        error: 'Group ID and non-empty message text are required.',
      });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return socket.emit('group_message_error', { error: 'Group not found.' });
    }

    const isMember = group.members.some(
      (memberId) => memberId.toString() === currentUser._id.toString()
    );

    if (!isMember) {
      return socket.emit('group_message_error', {
        error: 'You are not a member of this group.',
      });
    }

    const message = {
      senderId: currentUser._id,
      text,
      timestamp: new Date(),
    };

    group.messages.push(message);
    group.lastmessage = text;
    await group.save();

    socket.to(groupId).emit('group_message_received', {
      message,
      groupId,
    });

    socket.emit('group_message_sent', {
      message,
      groupId,
    });

  } catch (err) {
    console.error('[GROUP_MESSAGE_SEND_ERROR]', err);
    socket.emit('group_message_error', {
      error: 'Something went wrong while sending the message.',
    });
  }
}
export async function handleGetGroupMessages(socket, data) {
  try {
    await connectDB();

    const { authenticated, user: currentUser, error } = isAuthenticated(socket);
    if (!authenticated) {
      return socket.emit('get_group_messages_error', { error });
    }

    const { groupId } = data;
    if (!groupId) {
      return socket.emit('get_group_messages_error', {
        error: 'Group ID is required.',
      });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return socket.emit('get_group_messages_error', { error: 'Group not found.' });
    }

    const isMember = group.members.some(
      (memberId) => memberId.toString() === currentUser._id.toString()
    );

    if (!isMember) {
      return socket.emit('get_group_messages_error', {
        error: 'You are not a member of this group.',
      });
    }

    return socket.emit('get_group_messages_success', {
      messages: group.messages,
      groupId,
    });

  } catch (err) {
    console.error('[GET_GROUP_MESSAGES_ERROR]', err);
    socket.emit('get_group_messages_error', {
      error: 'Something went wrong while fetching group messages.',
    });
  }
}
export async function handleGroupTypingStarted(socket, data) {
  try {
    const { authenticated, user: currentUser, error } = isAuthenticated(socket);
    if (!authenticated) {
      return socket.emit('group_typing_error', { error: 'Authentication failed' });
    }

    const { groupId } = data;
    if (!groupId) {
      return socket.emit('group_typing_error', { error: 'Group ID is required' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return socket.emit('group_typing_error', { error: 'Group not found' });
    }

    const isMember = group.members.some(
      (memberId) => memberId.toString() === currentUser._id.toString()
    );

    if (!isMember) {
      return socket.emit('group_typing_error', { error: 'You are not a member of this group' });
    }

    socket.to(groupId).emit('group_typing_started', { senderId: currentUser._id });

  } catch (err) {
    console.error('[GROUP_TYPING_STARTED_ERROR]', err);
    socket.emit('group_typing_error', { error: 'Failed to broadcast typing status' });
  }
}
export async function handleGroupTypingStopped(socket, data) {
  try {
    const { authenticated, user: currentUser, error } = isAuthenticated(socket);
    if (!authenticated) {
      return socket.emit('group_typing_error', { error: 'Authentication failed' });
    }

    const { groupId } = data;
    if (!groupId) {
      return socket.emit('group_typing_error', { error: 'Group ID is required' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return socket.emit('group_typing_error', { error: 'Group not found' });
    }

    const isMember = group.members.some(
      (memberId) => memberId.toString() === currentUser._id.toString()
    );

    if (!isMember) {
      return socket.emit('group_typing_error', { error: 'You are not a member of this group' });
    }

    socket.to(groupId).emit('group_typing_stopped', { senderId: currentUser._id });

  } catch (err) {
    console.error('[GROUP_TYPING_STOPPED_ERROR]', err);
    socket.emit('group_typing_error', { error: 'Failed to broadcast typing status' });
  }
}
export async function handleGetGroups(socket) {
  try {
    await connectDB();

    const { authenticated, user: currentUser, error } = isAuthenticated(socket);
    if (!authenticated) {
      return socket.emit('get_groups_error', { error });
    }

    const groups = await Group.find({ members: currentUser._id }).select('avatarUrl name lastmessage');
    return socket.emit('get_groups_success', {
      message: groups.length ? 'Groups fetched successfully' : 'No groups found',
      groups,
    });
  } catch (err) {
    console.error('[GET_GROUPS_ERROR]', err);
    return socket.emit('get_groups_error', { error: 'Something went wrong' });
  }
}
export async function handleGetGroupDetails(socket, data) {
  try {
    await connectDB();

    const { authenticated, user: currentUser, error } = isAuthenticated(socket);
    if (!authenticated) {
      return socket.emit('get_group_details_error', { error });
    }

    const { groupId } = data;
    if (!groupId) {
      return socket.emit('get_group_details_error', { error: 'Group ID is required' });
    }

    const group = await Group.findById(groupId)
      .populate('admin', 'name email avatarUrl ')
      .populate('members', 'name email avatarUrl ')
      .select('-__v,-messages');

    if (!group) {
      return socket.emit('get_group_details_error', { error: 'Group not found' });
    }

    const isMember = group.members.some(
      (memberId) => memberId.toString() === currentUser._id.toString()
    );

    if (!isMember) {
      return socket.emit('get_group_details_error', { error: 'You are not a member of this group' });
    }

    return socket.emit('get_group_details_success', {
      message: 'Group details fetched successfully',
      group,
    });
  } catch (err) {
    console.error('[GET_GROUP_DETAILS_ERROR]', err);
    return socket.emit('get_group_details_error', { error: 'Something went wrong' });
  }
}


