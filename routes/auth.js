const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');

// REGISTRO
router.post('/register', async (req, res) => {
  const { email, password, fullName } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
  }

  // Se arma con el host real de la petición (no un valor fijo) para que el
  // enlace del correo de confirmación apunte al dominio correcto tanto en
  // local como en producción.
  const emailRedirectTo = `${req.protocol}://${req.get('host')}/login.html`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      ...(fullName ? { data: { full_name: fullName } } : {}),
      emailRedirectTo,
    },
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json({
    message: 'Usuario registrado. Revisa tu correo si Supabase pide confirmación.',
    user: data.user,
  });
});

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  return res.status(200).json({
    message: 'Login exitoso',
    session: data.session,
    user: data.user,
  });
});

module.exports = router;
