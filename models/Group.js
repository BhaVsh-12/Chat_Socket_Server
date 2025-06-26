
import mongoose from 'mongoose';
const { Schema } = mongoose;

const GroupSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
        },
        avatarUrl: {
            type: String,
            default: '',
        },
        description: {
            type: String,
            default: '',
        },
        members: [
            {
                type: Schema.Types.ObjectId,
                ref: 'User',
                required: true,
            },
        ],
        admin: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        lastmessage: {
            type: String,
            default: '',
        },
        messages: [
            {
                senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
                text: { type: String, required: true },
                timestamp: { type: Date, default: Date.now },
            },
        ],
    },
    { timestamps: true }
);

export const Group = mongoose.models.Group || mongoose.model('Group', GroupSchema);
