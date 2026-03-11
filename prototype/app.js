const links = document.querySelectorAll('.nav a');
const current = location.pathname.split('/').pop() || 'index.html';
links.forEach((a) => {
  const href = a.getAttribute('href');
  if (href === current) a.classList.add('active');
});

document.querySelectorAll('[data-go]').forEach((el) => {
  el.addEventListener('click', () => {
    const to = el.getAttribute('data-go');
    if (to) location.href = to;
  });
});