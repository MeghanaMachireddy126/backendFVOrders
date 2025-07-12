const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// PostgreSQL pool setup
const pool = new Pool({
  connectionString: 'postgresql://FVorders_owner:npg_JYz5vftUSkl9@ep-holy-sun-a4rpbu9p-pooler.us-east-1.aws.neon.tech/FVorders?sslmode=require&channel_binding=require',
});

// Root route
app.get("/", (req, res) => {
  res.send("Backend is working!");
});
// Get all order items
app.get('/api/order_items', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        order_items.id,
        order_items.order_id,
        order_items.product_id,
        products.name AS product_name,
        order_items.quantity
      FROM order_items
      JOIN products ON order_items.product_id = products.id
      ORDER BY order_items.order_id DESC;
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new product (Admin)
app.post('/api/products', async (req, res) => {
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

// Update product (Admin)
app.put('/api/products/:id', async (req, res) => {
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

//Delete product (Admin)
app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM products WHERE id=$1', [id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Place Order with validation
app.post('/api/orders', async (req, res) => {
  const { name, address, contact, items } = req.body;
  try {
    console.log("📦 Incoming Order:", { name, address, contact, items });

    const orderResult = await pool.query(
      'INSERT INTO orders (name, address, contact, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, address, contact, 'Pending']
    );
    const orderId = orderResult.rows[0].id;

    for (const item of items) {
      console.log("🔍 Checking Product ID:", item.product_id);

      const productCheck = await pool.query(
        'SELECT id FROM products WHERE id = $1',
        [item.product_id]
      );

      if (productCheck.rowCount === 0) {
        console.error(`❌ Product not found for ID: ${item.product_id}`);
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
    console.error("❌ Order submission failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Track Order by ID
app.get('/api/orders/:id', async (req, res) => {
  const rawId = req.params.id;
  const orderId = parseInt(rawId, 10);

  console.log("Incoming request for Order ID:", orderId);

  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    console.log("Query Result:", orderResult.rows);

    if (orderResult.rows.length === 0) {
      console.log("⚠️ No order found in DB");
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(orderResult.rows[0]);
  } catch (err) {
    console.error("❌ Error querying the database:", err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//Admin: Get All Orders
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//Admin: Update Order Status
app.put('/api/orders/:id/status', async (req, res) => {
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
