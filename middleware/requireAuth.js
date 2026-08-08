const supabaseAdmin = require('../config/supabaseAdmin');

// A diferencia de requireAdmin, esta solo exige sesión válida (cualquier rol).
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization; // "Bearer <token>"

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Falta el token de autenticación' });
    }

    const token = authHeader.split(' ')[1];

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    req.user = data.user;
    next();
}

module.exports = requireAuth;
