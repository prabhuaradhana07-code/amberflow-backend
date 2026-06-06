const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import the route files we created
const productRoutes = require('./routes/products');
const orderRoutes  = require('./routes/orders');
const authRoutes   = require('./routes/auth');
const reviewRoutes = require('./routes/reviews');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connect the routes to specific URLs
app.use('/api/products', productRoutes);
app.use('/api/orders',   orderRoutes);
app.use('/api/auth',     authRoutes);
app.use('/api/reviews',  reviewRoutes);

app.get('/', (req, res) => res.json({ message: 'AmberFlow API running' }));

app.listen(PORT, () => console.log(`AmberFlow API on port ${PORT}`));
