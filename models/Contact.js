// models/Contact.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

const ContactSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    contactUser: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['online', 'offline'],
      default: 'offline',
    },
    lastMessage: { type: String },
    time: { type: String },
    unread: { type: Number, default: 0 },
    inroom:{type:Boolean,default:false},
  },
  { timestamps: true }
);

export const Contact = mongoose.models.Contact || mongoose.model('Contact', ContactSchema);
