const mongoose = require('mongoose');

const WaterIssueSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: {
    type: String,
    required: true,
    enum: ['Leakage', 'Water Shortage', 'Contamination', 'Tank Overflow', 'Pipeline Damage', 'Wastage', 'Other']
  },
  description: { type: String, required: true },
  location: {
    address: { type: String, required: true },
    landmark: { type: String, default: '' },
    ward: { type: String, default: '' },
    latitude: { type: Number },
    longitude: { type: Number }
  },
  urgency: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium'
  },
  photo: { type: String, default: '' },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Resolved', 'Rejected'],
    default: 'Pending'
  },
  reportedBy: {
    userId: { type: String },
    name: { type: String, required: true },
    email: { type: String, default: '' },
    phone: { type: String, default: '' }
  },
  adminRemarks: { type: String, default: '' },
  resolvedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('WaterIssue', WaterIssueSchema);