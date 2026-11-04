const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Native CORS (no npm package needed)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware for parsing JSON with Base64 image support
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// MongoDB Connection with your ByteXL database
const dbURI = process.env.MONGO_DB_URI || 'mongodb://user_457w6f66f:p457w6f66f@db01.dbhost.dev:5050/db_457w6f66f';

mongoose.connect(dbURI)
  .then(() => console.log('✅ Connected to ByteXL MongoDB successfully (WaterWatch)'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// Routes
const routes = require('./routes/api');
app.use('/api', routes);

app.get('/', (req, res) => {
  res.send('🌊 WaterWatch Community Platform API is running...');
});

app.listen(PORT, () => {
  console.log(`🚀 WaterWatch Server running on port ${PORT}`);
});