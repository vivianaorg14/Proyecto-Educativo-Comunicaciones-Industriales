const form = document.getElementById('loginForm');
const messageBox = document.getElementById('message');
const submitBtn = document.getElementById('submitBtn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Entrando...';
  messageBox.className = 'message';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Credenciales inválidas');
    }

    // Persistimos la sesión en el cliente de Supabase del navegador
    const supabase = await window.supabaseClientPromise;
    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    messageBox.textContent = '¡Bienvenido! Redirigiendo...';
    messageBox.classList.add('success');

    setTimeout(() => {
      window.location.href = '/dashboard.html';
    }, 600);
  } catch (err) {
    messageBox.textContent = err.message;
    messageBox.classList.add('error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Entrar';
  }
});
