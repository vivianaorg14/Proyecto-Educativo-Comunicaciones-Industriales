const supabaseAdmin = require('../config/supabaseAdmin');

async function requireAdmin(req, res, next) {
    const authHeader = req.headers.authorization; // "Bearer <token>"

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Falta el token de autenticación' });
    }

    const token = authHeader.split(' ')[1];

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    const role = data.user.app_metadata?.role;

    if (role !== 'admin') {
        return res.status(403).json({ error: 'No tienes permisos de administrador' });
    }

    req.user = data.user; // por si lo necesitas en la ruta
    next();
}

module.exports = requireAdmin;