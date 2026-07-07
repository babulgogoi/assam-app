// Lightweight first-party click tracker — no dependencies, no cookies.
(function () {
  var endpoint = '/api/track';

  function send(data) {
    var payload = JSON.stringify(data);
    // sendBeacon survives page unload — right tool for exit clicks.
    if (navigator.sendBeacon) {
      var blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(endpoint, blob);
    } else {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(function () {});
    }
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('a[href]') : null;

    // ── Outbound links (Amazon affiliate + any external destination) ──
    if (link) {
      var href = link.href || '';
      var isExternal = /^https?:\/\//.test(href) && href.indexOf(location.origin) !== 0;
      if (isExternal) {
        var ctx = link.closest('[data-content-id]');
        send({
          event_type: 'outbound_click',
          content_type: (ctx && ctx.dataset.contentType) || null,
          content_id: (ctx && ctx.dataset.contentId) || null,
          content_slug: (ctx && ctx.dataset.contentSlug) || null,
          content_title: (ctx && ctx.dataset.contentTitle) ||
            link.textContent.trim().slice(0, 200),
          target_url: href,
        });
        return; // an external link is never also a content/filter click
      }
    }

    // ── Content cards (book covers, blog cards, article links) ──
    var card = e.target.closest ? e.target.closest('[data-track-click]') : null;
    if (card) {
      send({
        event_type: 'content_click',
        content_type: card.dataset.contentType || null,
        content_id: card.dataset.contentId || null,
        content_slug: card.dataset.contentSlug || null,
        content_title: card.dataset.contentTitle || null,
        target_url: card.href || null,
      });
      return;
    }

    // ── Filter / tag / nav pills ──
    var filter = e.target.closest ? e.target.closest('[data-track-filter]') : null;
    if (filter) {
      send({
        event_type: 'filter_click',
        content_type: filter.dataset.filterType || null,
        content_title: filter.dataset.filterValue || filter.textContent.trim().slice(0, 200),
      });
    }
  });
})();
