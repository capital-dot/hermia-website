/* No backend requests, no fabricated live CRM state. */
(function () {
  'use strict';
  var allowed = ['simpro', 'aroflo', 'other'];
  var selected = new URLSearchParams(location.search).get('crm');
  if (allowed.indexOf(selected) === -1) selected = null;
  var catalogue = document.getElementById('crm-catalog');
  var details = Array.prototype.slice.call(document.querySelectorAll('[data-crm]'));
  catalogue.hidden = !!selected;
  details.forEach(function (detail) {
    var active = detail.getAttribute('data-crm') === selected;
    detail.hidden = !active;
    detail.classList.toggle('is-active', active);
  });
  var names = { simpro: 'Simpro', aroflo: 'AroFlo', other: 'Your CRM' };
  if (selected) document.title = names[selected] + ' examples | Hermia in action';

  /* Compatible with the site's existing session trail, but keeps the selected
     CRM query so Configure → Back restores the right view, not just the HTML. */
  var trailKey = 'hermiaNavigationTrail';
  var home = 'index.html';
  var catalogueRoute = 'hermia-in-action.html';
  var current = catalogueRoute + (selected ? '?crm=' + selected : '');
  var memoryTrail = [];
  function canonicalRoute(entry) {
    if (typeof entry !== 'string' || entry.length > 2048) return null;
    try {
      var url = new URL(entry, location.href);
      if (url.origin !== location.origin) return null;
      var leaf = url.pathname.split('/').pop() || home;
      if (leaf === 'index' || leaf === home) return home;
      if (leaf === 'hermia-in-action' || leaf === catalogueRoute) {
        var crm = url.searchParams.get('crm');
        return catalogueRoute + (allowed.indexOf(crm) !== -1 ? '?crm=' + crm : '');
      }
      // Other pages still compare their literal pathname leaf with the stored
      // entry. Preserve that representation (clean URL or .html) for them.
      return leaf;
    } catch (error) { return null; }
  }
  function readTrail() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(trailKey) || '[]');
      if (!Array.isArray(saved)) return memoryTrail.slice();
      return saved.map(canonicalRoute).filter(Boolean);
    } catch (error) { return memoryTrail.slice(); }
  }
  function saveTrail(trail) {
    memoryTrail = trail.slice();
    try { sessionStorage.setItem(trailKey, JSON.stringify(trail)); } catch (error) {}
  }
  function registerVisit(restored) {
    var trail = readTrail();
    if (!trail.length) {
      trail = [home];
      // Recover a same-site entry page if its older version did not register.
      if (document.referrer) {
        var previous = canonicalRoute(document.referrer);
        if (previous && previous !== home && previous !== current) trail.push(previous);
      }
    }
    // Returning via the browser's Back or bfcache must not add a stale duplicate.
    var navigation = performance.getEntriesByType('navigation')[0];
    if (restored || (navigation && navigation.type === 'back_forward')) {
      var at = trail.lastIndexOf(current);
      if (at !== -1) trail = trail.slice(0, at + 1);
    }
    if (trail[trail.length - 1] !== current) trail.push(current);
    saveTrail(trail);
  }
  registerVisit(false);
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) registerVisit(true);
  });
  function goBack(event) {
    event.preventDefault();
    var trail = readTrail();
    if (trail[trail.length - 1] === current) trail.pop();
    var destination = trail[trail.length - 1] || home;
    if (destination === current) destination = home;
    if (destination === home) trail = [home];
    saveTrail(trail);
    location.assign(destination);
  }
  document.querySelectorAll('[data-flow-back]').forEach(function (link) {
    link.addEventListener('click', goBack);
  });
  document.querySelectorAll('[data-catalog-back]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      var trail = readTrail();
      var at = trail.lastIndexOf(catalogueRoute);
      if (at !== -1) trail = trail.slice(0, at + 1);
      else {
        if (trail[trail.length - 1] === current) trail.pop();
        trail.push(catalogueRoute);
      }
      saveTrail(trail);
      location.assign(catalogueRoute);
    });
  });

  var search = document.getElementById('crm-search');
  var clear = document.getElementById('clear-search');
  var cards = Array.prototype.slice.call(document.querySelectorAll('.ha-crm-card'));
  var count = document.getElementById('result-count');
  var empty = document.getElementById('no-results');
  function filterCards() {
    var query = search.value.toLowerCase().trim();
    var words = query.split(/\s+/).filter(Boolean);
    var visible = 0;
    cards.forEach(function (card) {
      var haystack = (card.textContent + ' ' + card.getAttribute('data-search')).toLowerCase();
      var match = words.every(function (word) { return haystack.indexOf(word) !== -1; });
      card.hidden = !match;
      if (match) visible++;
    });
    count.textContent = visible + (visible === 1 ? ' pathway to explore' : ' pathways to explore');
    empty.hidden = visible !== 0;
    clear.hidden = !query;
    try { sessionStorage.setItem('hermiaShowcaseSearch', search.value); } catch (error) {}
  }
  if (!selected) {
    try { search.value = sessionStorage.getItem('hermiaShowcaseSearch') || ''; } catch (error) {}
  }
  search.addEventListener('input', filterCards);
  clear.addEventListener('click', function () { search.value = ''; filterCards(); search.focus(); });
  if (!selected) filterCards();

  var lightbox = document.getElementById('media-lightbox');
  var lightboxImage = document.getElementById('lightbox-image');
  var opener = null;
  document.querySelectorAll('[data-enlarge]').forEach(function (button) {
    button.addEventListener('click', function () {
      opener = button;
      lightboxImage.src = button.getAttribute('data-enlarge');
      lightboxImage.alt = button.getAttribute('data-media-title');
      document.getElementById('lightbox-title').textContent = lightboxImage.alt;
      if (typeof lightbox.showModal === 'function') lightbox.showModal();
      else window.open(lightboxImage.src, '_blank', 'noopener');
    });
  });
  document.getElementById('close-lightbox').addEventListener('click', function () { lightbox.close(); });
  lightbox.addEventListener('click', function (event) {
    if (event.target === lightbox) {
      var rect = lightbox.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) lightbox.close();
    }
  });
  lightbox.addEventListener('close', function () {
    lightboxImage.removeAttribute('src');
    if (opener) opener.focus();
  });
}());
