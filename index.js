
const express = require('express');
const cors = require('cors');
const { RateLimiterMemory } = require('rate-limiter-flexible');

const app = express();
app.use(express.json());
app.use(cors());

// Create 400x300 canvas with white pixels
const canvas = Array(300).fill().map(() => Array(400).fill('#FFFFFF'));

// Rate limiter: max 1 request per 100ms per IP
const rateLimiter = new RateLimiterMemory({
  points: 1,
  duration: 0.1
});

// Get full canvas
app.get('/canvas', (req, res) => {
  res.json(canvas);
});

// Place pixel
app.post('/pixel', async (req, res) => {
  try {
    // Check rate limit
    await rateLimiter.consume(req.ip);
    
    const { x, y, color } = req.body;
    
    // Validate inputs
    if (!Number.isInteger(x) || x < 0 || x >= 400 ||
        !Number.isInteger(y) || y < 0 || y >= 300 ||
        !/^#[0-9A-F]{6}$/i.test(color)) {
      return res.status(400).json({ error: 'Invalid input' });
    }
    
    // Update pixel
    canvas[y][x] = color;
    res.json({ success: true });
    
  } catch (error) {
    if (error.consumedPoints) {
      res.status(429).json({ error: 'Too many requests' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Serve simple HTML interface
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>r/place Clone</title>
      <style>
        canvas { border: 1px solid black; }
      </style>
    </head>
    <body>
      <canvas id="canvas" width="400" height="300"></canvas>
      <br>
      <input type="color" id="colorPicker" value="#000000">
      <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const colorPicker = document.getElementById('colorPicker');
        
        // Load initial canvas
        fetch('/canvas')
          .then(res => res.json())
          .then(data => {
            data.forEach((row, y) => {
              row.forEach((color, x) => {
                ctx.fillStyle = color;
                ctx.fillRect(x, y, 1, 1);
              });
            });
          });
        
        // Handle clicks
        canvas.onclick = async (e) => {
          const rect = canvas.getBoundingClientRect();
          const x = Math.floor(e.clientX - rect.left);
          const y = Math.floor(e.clientY - rect.top);
          const color = colorPicker.value;
          
          const res = await fetch('/pixel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x, y, color })
          });
          
          if (res.ok) {
            ctx.fillStyle = color;
            ctx.fillRect(x, y, 1, 1);
          }
        };
      </script>
    </body>
    </html>
  `);
});

const port = 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
