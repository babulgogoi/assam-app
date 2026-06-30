(function () {
  const header = document.getElementById('siteHeader');
  if (!header) return;

  let ticking = false;
  const STICK_THRESHOLD = 80;

  function updateHeaderState() {
    header.classList.toggle('is-stuck', window.scrollY > STICK_THRESHOLD);
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      window.requestAnimationFrame(updateHeaderState);
      ticking = true;
    }
  }, { passive: true });

  updateHeaderState();
})();

document.getElementById('mobileMenuToggle')
  ?.addEventListener('click', function () {
    document.querySelector('.main-nav').classList.toggle('is-open');
  });
