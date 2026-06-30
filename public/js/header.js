document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.getElementById('mobileMenuToggle');
  var nav = document.querySelector('.main-nav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', function () {
    nav.classList.toggle('is-open');
  });
});
