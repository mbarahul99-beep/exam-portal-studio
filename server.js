import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON middleware
app.use(express.json());

// Serve production static assets from dist folder
app.use(express.static(path.join(__dirname, 'dist')));

// Health check endpoint for Hostinger Node App Manager
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'online', 
    timestamp: new Date().toISOString(),
    message: 'Exam Portal Production Node.js Server Running Successfully!' 
  });
});

// Single Page Application (SPA) fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 Exam Portal Production Server is Live!`);
  console.log(`🌐 Listening on Port: ${PORT}`);
  console.log(`===================================================`);
});
