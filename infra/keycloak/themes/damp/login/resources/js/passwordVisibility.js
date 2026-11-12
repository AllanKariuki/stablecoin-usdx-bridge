// Show/hide toggle for password fields: any button with data-password-toggle
// and aria-controls="<input id>". The `keycloak` parent theme ships its own
// copy; this theme extends `base`, which doesn't.
document.querySelectorAll('[data-password-toggle]').forEach((button) => {
  const input = document.getElementById(button.getAttribute('aria-controls'));
  if (!input) return;
  button.addEventListener('click', () => {
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    button.setAttribute('aria-label', reveal ? button.dataset.labelHide : button.dataset.labelShow);
    button.setAttribute('aria-pressed', String(reveal));
    const icon = button.querySelector('i');
    if (icon) icon.className = reveal ? button.dataset.iconHide : button.dataset.iconShow;
  });
});
