const express = require('express');
const router = express.Router();
const supabaseAdmin = require('../config/supabaseAdmin');
const requireAdmin = require('../middleware/requireAdmin');

// Todas las rutas de este archivo pasan primero por requireAdmin
router.use(requireAdmin);

// Listar todos los usuarios
router.get('/users', async (req, res) => {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    const users = data.users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.user_metadata?.full_name || null,
        role: u.app_metadata?.role || 'user',
        created_at: u.created_at,
    }));

    res.json({ users });
});

// Cambiar el rol de un usuario (ej: convertirlo en admin)
router.post('/set-role', async (req, res) => {
    const { userId, role } = req.body;

    if (!userId || !role) {
        return res.status(400).json({ error: 'userId y role son obligatorios' });
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        app_metadata: { role },
    });

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    res.json({ message: `Rol actualizado a "${role}"`, user: data.user });
});

module.exports = router;