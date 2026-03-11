const links = document.querySelectorAll('.nav a');
const current = location.pathname.split('/').pop() || 'index.html';
links.forEach((a) => {
  const href = a.getAttribute('href');
  if (href === current) a.classList.add('active');
});