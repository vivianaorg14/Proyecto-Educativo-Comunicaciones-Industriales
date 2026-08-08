const form = document.getElementById('registerForm');
const messageBox = document.getElementById('message');
const submitBtn = document.getElementById('submitBtn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const fullName = document.getElementById('fullName').value.trim();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (password !== confirmPassword) {
    messageBox.textContent = 'Las contraseñas no coinciden';
    messageBox.className = 'message error';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Creando cuenta...';
  messageBox.className = 'message';

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Ocurrió un error al registrarte');
    }

    messageBox.textContent = data.message + ' Redirigiendo a login...';
    messageBox.classList.add('success');

    setTimeout(() => {
      window.location.href = '/login.html';
    }, 1800);
  } catch (err) {
    messageBox.textContent = err.message;
    messageBox.classList.add('error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Registrarme';
  }
});
