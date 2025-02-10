const express = require("express");
const cors = require("cors");
const { RateLimiterMemory } = require("rate-limiter-flexible");

const app = express();
app.use(express.json());
app.use(cors());

// Create 140x130 canvas with white pixels
const canvas = Array(130)
  .fill()
  .map(() => Array(140).fill("#FFFFFF"));

// Rate limiter: max 1 request per 10ms per IP
const rateLimiter = new RateLimiterMemory({
  points: 10,
  duration: 0.1,
});

// Get full canvas
app.get("/canvas", (req, res) => {
  res.json(canvas);
});

// Place pixel
app.post("/pixel", async (req, res) => {
  try {
    // Check rate limit
    await rateLimiter.consume(req.ip);

    const { x, y, color } = req.body;

    // Validate inputs
    if (
      !Number.isInteger(x) ||
      x < 0 ||
      x >= 140 ||
      !Number.isInteger(y) ||
      y < 0 ||
      y >= 130 ||
      !/^#[0-9A-F]{6}$/i.test(color)
    ) {
      return res.status(400).json({ error: "Invalid input" });
    }

    // Update pixel
    canvas[y][x] = color;
    res.json({ success: true });
  } catch (error) {
    if (error.consumedPoints) {
      res.status(429).json({ error: "Too many requests" });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Serve simple HTML interface
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>CHAOnvaS</title>
      <style>
        canvas { 
          border: 1px solid black;
          image-rendering: pixelated;
          width: 1400px;
          height: 1300px;
        }
      </style>
    </head>
    <body>
      <canvas id="canvas" width="140" height="130"></canvas>
      <br>
      <input type="color" id="colorPicker" value="#000000">
      <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const colorPicker = document.getElementById('colorPicker');

        // Load initial canvas
        function loadCanvas() {
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
        }

        // Refresh canvas every 1 seconds
        setInterval(loadCanvas, 1000);

        loadCanvas();

        let isDrawing = false;
        let lastX = -1;
        let lastY = -1;

        async function drawPixel(e) {
          const rect = canvas.getBoundingClientRect();
          const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
          const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
          const x = Math.floor((clientX - rect.left) * (140 / rect.width));
          const y = Math.floor((clientY - rect.top) * (130 / rect.height));

          if (x === lastX && y === lastY) return;
          lastX = x;
          lastY = y;

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
        }

        canvas.addEventListener('mousedown', (e) => {
          isDrawing = true;
          drawPixel(e);
        });
        canvas.addEventListener('mousemove', (e) => {
          if (isDrawing) drawPixel(e);
        });
        canvas.addEventListener('mouseup', () => {
          isDrawing = false;
          lastX = -1;
          lastY = -1;
        });
        canvas.addEventListener('mouseleave', () => {
          isDrawing = false;
          lastX = -1;
          lastY = -1;
        });

        // Touch events
        canvas.addEventListener('touchstart', (e) => {
          e.preventDefault();
          isDrawing = true;
          drawPixel(e);
        });
        canvas.addEventListener('touchmove', (e) => {
          e.preventDefault();
          if (isDrawing) drawPixel(e);
        });
        canvas.addEventListener('touchend', () => {
          isDrawing = false;
          lastX = -1;
          lastY = -1;
        });
      </script>
    </body>
    </html>
  `);
});

app.listen(3000, '0.0.0.0', () => {
  console.log('Server listening on port 3000');
});
