const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import the route files we created
const productRoutes = require('./routes/products');
const orderRoutes  = require('./routes/orders');
const authRoutes   = require('./routes/auth');
const reviewRoutes = require('./routes/reviews');

const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ 
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'https://amberflow.in',
      'https://www.amberflow.in',
      process.env.FRONTEND_URL
    ];
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check strict match or wildcard matches for amberflow and railway
    if (
      allowedOrigins.indexOf(origin) !== -1 || 
      origin.endsWith('.amberflow.in') ||
      origin.endsWith('.up.railway.app')
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true 
}));
app.use(express.json());
app.use(cookieParser());

const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use('/uploads', express.static(uploadDir));

// Connect the routes to specific URLs
app.use('/api/products', productRoutes);
app.use('/api/orders',   orderRoutes);
app.use('/api/auth',     authRoutes);
app.use('/api/reviews',  reviewRoutes);

app.get('/', (req, res) => res.json({ message: 'AmberFlow API running' }));

app.listen(PORT, () => console.log(`AmberFlow API on port ${PORT}`));
