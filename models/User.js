const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const messageSchema = new Schema({
  message: {
    type: String,
    required: true,
  },
  receiver_name: {
    type: String,
    required: true,
  },
  sender: {
    type: String,
    required: true,
    index: true,
  },
  receiver: {
    type: String,
    required: true,
    index: true,
  },
  message_type: {
    type: String,
    required: false,
    index: true,
  },
  retry_count: {
    type: Number,
    required: true,
    default: 0,
  },
  version: {
    type: Number,
    required: true,
    default: 0,
  },
  scheduled_at: {
    type: Date,
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ["pending", "sent", "success", "failed", "deleted"],
    default: "pending",
    index: true,
  },
  whatsapp_acknowledgement_id: {
    type: String,
  },
  media_type: {
    type: String,
  },
  media: {
    type: String,
  },
  file_name: {
    type: String,
  },
}, { timestamps: true });

const userSchema = new Schema({
  mobile_number: {
    type: String,
    required: true,
    index: true,
  },
  instance_id: {
    type: String,
    index: true,
  },
  status: {
    type: String,
    index: true,
    default: "OFFLINE",
  },
  allowed_message_count: {
    type: Number,
    default: -1,
  },
  invite_code: {
    type: String,
  },
  otp: {
    type: String,
  },
  group_permission: {
    type: Boolean,
    default: true,
  },
  is_new_user: {
    type: Boolean,
    default: true,
  },
  referred_users_count: {
    type: Number,
  },
  referred_by: {
    type: Schema.Types.ObjectId,
    ref: "users",
  },
  // WhatsApp user profile information
  name: {
    type: String,
  },
  email: {
    type: String
  },
  address: {
    city: String,
    state: String,
    country: String,
    street: String,
    zipcode: String,
  },
  devices: [
    {
      deviceId: String,
      deviceName: String,
      isActive: Boolean,
    },
  ],
  messages: [messageSchema],
  sequences: [{
    message_ids: [{ type: String, required: true }],
    receiver: { type: String, required: true },
    start_time: { type: Date, required: true },
    delay_seconds: { type: Number, required: true }
  }],
  tag: [
    {
      name: { type: String, required: true },
      members: [
        {
          user_name: { type: String, required: true },
          mobile_number: { type: String, required: true },
          addedAt: { type: Date, default: Date.now },
        },
      ],
    },
  ],
  groups: [
    {
      message: { type: String, required: true },
      group_id: { type: String, required: true },
      delay: { type: Number, required: true },
      status: { type: String, required: true },
    },
  ],
  membershipId: {
    type: Schema.Types.ObjectId,
    ref: 'Membership',
    index: true
  },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
