const EYE_ICON = `
  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
  <circle cx="12" cy="12" r="3" />
`;

const EYE_OFF_ICON = `
  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a18.6 18.6 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19" />
  <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
  <path d="M1 1l22 22" />
`;

document.querySelectorAll('.password-toggle').forEach((btn) => {
  const input = document.getElementById(btn.dataset.toggleFor);
  if (!input) return;

  btn.addEventListener('click', () => {
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.querySelector('svg').innerHTML = showing ? EYE_ICON : EYE_OFF_ICON;
    btn.title = showing ? 'Mostrar contraseña' : 'Ocultar contraseña';
  });
});
