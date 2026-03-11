const current = location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('[data-tab]').forEach((a) => {
  if (a.getAttribute('href') === current) a.classList.add('active');
});
document.querySelectorAll('[data-go]').forEach((el) => {
  el.addEventListener('click', () => {
    const to = el.getAttribute('data-go');
    if (to) location.href = to;
  });
});