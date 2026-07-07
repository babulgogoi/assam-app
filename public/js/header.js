(function () {
  const header = document.getElementById('siteHeader');
  if (!header) return;

  let ticking = false;
  let isStuck = false;
  const STICK_AT   = 80; // px — stick when scrolled past this
  const UNSTICK_AT = 50; // px — unstick only when scroll comes back below this (hysteresis)

  function updateHeaderState() {
    const y = window.scrollY;
    if (!isStuck && y > STICK_AT) {
      isStuck = true;
      header.classList.add('is-stuck');
    } else if (isStuck && y < UNSTICK_AT) {
      isStuck = false;
      header.classList.remove('is-stuck');
    }
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
