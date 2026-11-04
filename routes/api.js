const express = require('express');
const router = express.Router();
const WaterIssue = require('../models/WaterIssue');
const User = require('../models/User');

// HARDCODED ADMIN CREDENTIALS (Cannot be registered or overwritten)
const HARDCODED_ADMIN = {
  id: 'admin_authority_01',
  name: 'Water Board Authority',
  email: 'admin@waterwatch.gov',
  password: 'admin123',
  role: 'admin',
  phone: '1800-WATER-WATCH'
};

// ================= USER AUTHENTICATION =================

// 1. REGISTER: STRICTLY CITIZENS ONLY
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Security check: Block anyone from registering with the admin email or role
    if (cleanEmail === HARDCODED_ADMIN.email.toLowerCase() || req.body.role === 'admin') {
      return res.status(403).json({ message: 'Administrator accounts cannot be created. Registration is restricted to Citizens only.' });
    }

    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'A citizen account with this email already exists' });
    }

    // Force role to strictly be 'citizen'
    const newUser = new User({
      name: name.trim(),
      email: cleanEmail,
      password,
      role: 'citizen',
      phone: phone || ''
    });

    await newUser.save();
    res.status(201).json({
      message: 'Citizen registration successful',
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: 'citizen',
        phone: newUser.phone
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during registration', error: error.message });
  }
});

// 2. LOGIN: CHECKS HARDCODED ADMIN FIRST, THEN CITIZEN DATABASE
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if logging in as the hardcoded Administrator
    if (cleanEmail === HARDCODED_ADMIN.email.toLowerCase() && password === HARDCODED_ADMIN.password) {
      return res.json({
        message: 'Admin login successful',
        user: {
          id: HARDCODED_ADMIN.id,
          name: HARDCODED_ADMIN.name,
          email: HARDCODED_ADMIN.email,
          role: 'admin',
          phone: HARDCODED_ADMIN.phone
        }
      });
    }

    // Otherwise, check Citizen database
    const user = await User.findOne({ email: cleanEmail, password });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.json({
      message: 'Citizen login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during login', error: error.message });
  }
});

// ================= WATER ISSUE CRUD ROUTES =================

// CREATE: Report a new water issue
router.post('/issues', async (req, res) => {
  try {
    const { title, category, description, location, urgency, photo, reportedBy } = req.body;
    if (!title || !category || !description || !location?.address) {
      return res.status(400).json({ message: 'Please provide all mandatory fields (Title, Category, Address, Description)' });
    }

    const issue = new WaterIssue({
      title,
      category,
      description,
      location: {
        address: location.address,
        landmark: location.landmark || '',
        ward: location.ward || '',
        latitude: location.latitude || null,
        longitude: location.longitude || null
      },
      urgency: urgency || 'Medium',
      photo: photo || '',
      reportedBy: {
        userId: reportedBy?.userId || '',
        name: reportedBy?.name || 'Anonymous Citizen',
        email: reportedBy?.email || '',
        phone: reportedBy?.phone || ''
      }
    });

    const savedIssue = await issue.save();
    res.status(201).json({ message: 'Water problem reported successfully!', issue: savedIssue });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to report water issue' });
  }
});

// READ: Get all issues (supports search, filter, and citizen userId scoping)
router.get('/issues', async (req, res) => {
  try {
    const { category, status, urgency, search, userId } = req.query;
    let query = {};

    if (userId) query['reportedBy.userId'] = userId;
    if (category && category !== 'All') query.category = category;
    if (status && status !== 'All') query.status = status;
    if (urgency && urgency !== 'All') query.urgency = urgency;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'location.address': { $regex: search, $options: 'i' } },
        { 'location.landmark': { $regex: search, $options: 'i' } },
        { 'reportedBy.name': { $regex: search, $options: 'i' } }
      ];
    }

    const issues = await WaterIssue.find(query).sort({ createdAt: -1 });
    res.json(issues);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching issues', error: error.message });
  }
});

// READ: Stats counter (Scoper by citizen userId if passed)
router.get('/issues/stats', async (req, res) => {
  try {
    const { userId } = req.query;
    let filter = {};
    if (userId) filter['reportedBy.userId'] = userId;

    const total = await WaterIssue.countDocuments(filter);
    const pending = await WaterIssue.countDocuments({ ...filter, status: 'Pending' });
    const inProgress = await WaterIssue.countDocuments({ ...filter, status: 'In Progress' });
    const resolved = await WaterIssue.countDocuments({ ...filter, status: 'Resolved' });
    const critical = await WaterIssue.countDocuments({ ...filter, urgency: 'Critical', status: { $ne: 'Resolved' } });

    res.json({ total, pending, inProgress, resolved, critical });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching stats', error: error.message });
  }
});

// READ: Single issue by ID (Tracking)
router.get('/issues/:id', async (req, res) => {
  try {
    const issue = await WaterIssue.findById(req.params.id);
    if (!issue) return res.status(404).json({ message: 'Complaint not found' });
    res.json(issue);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving complaint', error: error.message });
  }
});

// UPDATE: Admin updates status and official remarks
router.put('/issues/:id', async (req, res) => {
  try {
    const { status, adminRemarks, urgency, title, description } = req.body;
    const updateData = {};

    if (status) {
      updateData.status = status;
      if (status === 'Resolved') updateData.resolvedAt = new Date();
    }
    if (adminRemarks !== undefined) updateData.adminRemarks = adminRemarks;
    if (urgency) updateData.urgency = urgency;
    if (title) updateData.title = title;
    if (description) updateData.description = description;

    const updatedIssue = await WaterIssue.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    );

    if (!updatedIssue) return res.status(404).json({ message: 'Issue not found' });
    res.json({ message: 'Issue updated successfully', issue: updatedIssue });
  } catch (error) {
    res.status(500).json({ message: 'Error updating issue', error: error.message });
  }
});

// DELETE: Delete complaint
router.delete('/issues/:id', async (req, res) => {
  try {
    const deletedIssue = await WaterIssue.findByIdAndDelete(req.params.id);
    if (!deletedIssue) return res.status(404).json({ message: 'Issue not found' });
    res.json({ message: 'Complaint deleted successfully', id: req.params.id });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting complaint', error: error.message });
  }
});

module.exports = router;