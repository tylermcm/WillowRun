// Mobile menu
const btn = document.querySelector('.menu-btn');
const nav = document.getElementById('nav');
btn.addEventListener('click', () => btn.setAttribute('aria-expanded', nav.classList.toggle('open')));
nav.addEventListener('click', e => {
  if (e.target.closest('a')) { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
});

// Highlight today's hours (uses the visitor's clock)
const row = document.querySelector(`[data-day="${new Date().getDay()}"]`);
if (row) row.classList.add('today');

// Accordion: keep one service open at a time
const panels = [...document.querySelectorAll('.acc details')];
panels.forEach(d => d.addEventListener('toggle', () => {
  if (d.open) panels.filter(o => o !== d).forEach(o => (o.open = false));
}));

// Contact form opens the visitor's email app (no server needed)
const cform = document.getElementById('contact-form');
if (cform) cform.addEventListener('submit', e => {
  e.preventDefault();
  const d = new FormData(e.target);
  const body = `${d.get('message')}\n\nName: ${d.get('name')}\nPhone: ${d.get('phone')}`;
  location.href = `mailto:Mctuthbrush@msn.com?subject=${encodeURIComponent(d.get('subject'))}&body=${encodeURIComponent(body)}`;
});

// Gentle reveal on scroll
const io = new IntersectionObserver(entries => entries.forEach(en => {
  if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
}), { threshold: .1 });
document.querySelectorAll('.lcard, .facts li, .team article, .road li, details, .office-photo, .step-cards li, .tile, .cover, .visit-card').forEach(el => { el.classList.add('reveal'); io.observe(el); });
