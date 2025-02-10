const express = require("express");
const cors = require("cors");
const fs = require("fs");
const { RateLimiterMemory } = require("rate-limiter-flexible");

const app = express();
app.use(express.json());
app.use(cors());

const ENABLE_BACKUP = true; // Toggle backup functionality
const BACKUP_INTERVAL = 60000; // In ms

// Create 40x30 canvas with white pixels
const canvas = Array(30)
  .fill()
  .map(() => Array(40).fill("#FFFFFF"));

// Create backup directory if it doesn't exist
/*if (!fs.existsSync("backup")) {
  fs.mkdirSync("backup");
}*/

// Load most recent backup if exists
try {
  const backupFiles = fs.readdirSync("backup").sort().reverse();
  if (backupFiles.length > 0) {
    const backup = JSON.parse(fs.readFileSync(`backup/${backupFiles[0]}`));
    if (backup.length === 30 && backup[0].length === 40) {
      for (let y = 0; y < 30; y++) {
        for (let x = 0; x < 40; x++) {
          canvas[y][x] = backup[y][x];
        }
      }
    }
  }
} catch (err) {
  console.log("No backup found or invalid backup, starting with fresh canvas");
}

// Setup backup interval
if (ENABLE_BACKUP) {
  setInterval(() => {
    const date = new Date();
    const filename = `${date.getDate()}.${date.getMonth() + 1}.${date.getHours()}.${date.getMinutes()}.${date.getSeconds()}.json`;
    fs.writeFileSync(`backup/${filename}`, JSON.stringify(canvas));
    console.log(`Canvas backup created: ${filename}`);
  }, BACKUP_INTERVAL);
}

// Rate limiter: max 1 request per 100ms per IP
const rateLimiter = new RateLimiterMemory({
  points: 1,
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
      x >= 40 ||
      !Number.isInteger(y) ||
      y < 0 ||
      y >= 30 ||
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
          width: 400px;
          height: 300px;
        }
      </style>
    </head>
    <body>
      <canvas id="canvas" width="40" height="30"></canvas>
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
          const x = Math.floor((e.clientX - rect.left) * (40 / rect.width));
          const y = Math.floor((e.clientY - rect.top) * (30 / rect.height));
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

app.listen(3000, () => {
  console.log('Server listening on port 3000');
}); // you can also change to any port, remember to also update the ports config file (if theres any)