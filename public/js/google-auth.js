document.getElementById('googleBtn').addEventListener('click', async () => {
    const supabase = await window.supabaseClientPromise;

    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + '/dashboard.html',
        },
    });

    if (error) {
        alert('No se pudo iniciar sesión con Google: ' + error.message);
    }
    // Si no hay error, el navegador redirige solo a Google y luego de vuelta a tu app.
});