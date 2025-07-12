const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// PostgreSQL pool setup
const pool = new Pool({
  connectionString: 'postgresql://FVorders_owner:npg_JYz5vftUSkl9@ep-holy-sun-a4rpbu9p-pooler.us-east-1.aws.neon.tech/FVorders?sslmode=require&channel_binding=require',
});

// Middleware to authenticate admin using JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Root route
app.get("/", (req, res) => {
  res.send("Backend is working!");
});

// ==================== Admin Login ====================
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;

  if (
    email === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// ==================== Product APIs ====================

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new product (Admin only)
app.post('/api/products', authenticateToken, async (req, res) => {
  const { name, price } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO products (name, price) VALUES ($1, $2) RETURNING *',
      [name, price]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update product (Admin only)
app.put('/api/products/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, price } = req.body;
  try {
    const result = await pool.query(
      'UPDATE products SET name=$1, price=$2 WHERE id=$3 RETURNING *',
      [name, price, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete product (Admin only)
app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM products WHERE id=$1', [id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== Orders ====================

// Place Order
app.post('/api/orders', async (req, res) => {
  const { name, address, contact, items } = req.body;
  try {
    const orderResult = await pool.query(
      'INSERT INTO orders (name, address, contact, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, address, contact, 'Pending']
    );
    const orderId = orderResult.rows[0].id;

    for (const item of items) {
      const productCheck = await pool.query(
        'SELECT id FROM products WHERE id = $1',
        [item.product_id]
      );

      if (productCheck.rowCount === 0) {
        return res.status(400).json({
          error: `Product with id ${item.product_id} does not exist`,
        });
      }

      await pool.query(
        'INSERT INTO order_items (order_id, product_id, quantity) VALUES ($1, $2, $3)',
        [orderId, item.product_id, item.quantity]
      );
    }

    res.status(201).json({ id: orderId, status: 'Pending' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Track single order by ID
app.get('/api/orders/:id', async (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(orderResult.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all orders (Admin only)
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update order status (Admin only)
app.put('/api/orders/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const result = await pool.query(
      'UPDATE orders SET status=$1 WHERE id=$2 RETURNING *',
      [status, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get order items by order ID (optional)
app.get('/api/orders/:id/items', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
        order_items.id,
        order_items.product_id,
        products.name AS product_name,
        order_items.quantity
      FROM order_items
      JOIN products ON order_items.product_id = products.id
      WHERE order_items.order_id = $1
    `, [id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
