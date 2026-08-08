require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const unitsRoutes = require('./routes/units');
const unitTopicsRoutes = require('./routes/unit-topics');
const contentRoutes = require('./routes/content');


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Sirve los archivos del frontend (HTML, CSS, JS) desde /public
app.use(express.static(path.join(__dirname, 'public')));

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/units', unitsRoutes);
app.use('/api/admin/units/:unitId/topics', unitTopicsRoutes);
app.use('/api/content', contentRoutes);

// Config pública para que el frontend pueda hablar directo con Supabase (necesario para el login con Google)
app.get('/api/config', (req, res) => {
  res.json({
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  });
});

// Manejador de errores (p. ej. multer: PDF inválido o demasiado grande)
app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ error: err.message || 'Error inesperado' });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});