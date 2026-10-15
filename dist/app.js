(() => {
  'use strict';
  const pages = [...document.querySelectorAll('.page')];
  const stage = document.querySelector('.invitation');
  const navigation = document.querySelector('.page-navigation');
  const next = document.querySelector('#next-page');
  const video = document.querySelector('#welcome-video');
  const error = document.querySelector('#video-error');
  let introComplete = false;
  let current = 0;
  let locked = false;
  let gesture = null;
  let ignoreClickUntil = 0;
  const buttons = pages.map((page, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', `Afdeling ${index + 1}: ${page.getAttribute('aria-label') || 'Aftelling'}`);
    button.addEventListener('click', () => goTo(index));
    navigation.append(button);
    return button;
  });
  function update() {
    pages.forEach((page, i) => {
      page.classList.toggle('is-active', i === current);
      page.classList.toggle('is-before', i < current);
      page.inert = i !== current;
      page.setAttribute('aria-hidden', String(i !== current));
      if (i === current) buttons[i].setAttribute('aria-current', 'step');
      else buttons[i].removeAttribute('aria-current');
    });
    navigation.hidden = current === 0;
    next.hidden = current === 0 || current === pages.length - 1;
    document.querySelector('#navigation-status').textContent = `Afdeling ${current + 1} van ${pages.length}: ${pages[current].getAttribute('aria-label') || 'Aftelling'}`;
  }
  function goTo(index) {
    if (locked || (current === 0 && !introComplete) || index < 0 || index >= pages.length || index === current) return;
    locked = true;
    const previous = pages[current];
    previous.classList.add('is-leaving');
    if (current === 0) video.pause();
    current = index;
    if (current === 0) {
      introComplete = false;
      video.currentTime = 0;
    }
    update();
    if (previous.contains(document.activeElement)) buttons[current].focus({ preventScroll: true });
    window.setTimeout(() => { previous.classList.remove('is-leaving'); locked = false; }, 560);
  }
  next.addEventListener('click', () => goTo(current + 1));
  stage.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    gesture = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  stage.addEventListener('pointerup', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    gesture = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 45) return;
    ignoreClickUntil = Date.now() + 400;
    const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    goTo(current + (delta < 0 ? 1 : -1));
  });
  stage.addEventListener('pointercancel', () => { gesture = null; });
  stage.addEventListener('click', event => {
    if (Date.now() < ignoreClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('keydown', event => {
    if (document.querySelector('#rsvp-dialog').open) return;
    if (current === 0 && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      playVideo();
      return;
    }
    if (event.target.closest('iframe, input, textarea, select')) return;
    if (['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'PageDown', 'PageUp'].includes(event.key)) {
      event.preventDefault();
      goTo(current + (['ArrowDown', 'ArrowRight', 'PageDown'].includes(event.key) ? 1 : -1));
    }
  });
  let lastWheel = 0;
  stage.addEventListener('wheel', event => {
    event.preventDefault();
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(delta) < 25 || Date.now() - lastWheel < 800) return;
    lastWheel = Date.now();
    goTo(current + (delta > 0 ? 1 : -1));
  }, { passive: false });
  async function playVideo() {
    error.hidden = true;
    try { await video.play(); }
    catch { error.hidden = false; }
  }
  pages[0].addEventListener('click', () => { if (video.paused) playVideo(); });
  video.addEventListener('ended', () => {
    if (current !== 0) return;
    introComplete = true;
    goTo(1);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); });

  const dialog = document.querySelector('#rsvp-dialog');
  const form = document.querySelector('#rsvp-form');
  const status = document.querySelector('#rsvp-status');
  const submit = document.querySelector('#submit-rsvp');
  const answers = [...form.querySelectorAll('[name="attendance"]')];
  document.querySelector('#open-rsvp').addEventListener('click', () => dialog.showModal());
  document.querySelector('#close-rsvp').addEventListener('click', () => dialog.close());
  answers.forEach(answer => answer.addEventListener('change', () => {
    if (answer.checked) answers.forEach(other => { if (other !== answer) other.checked = false; });
    answers[0].setCustomValidity('');
  }));
  let requestId = null;
  form.addEventListener('input', () => { requestId = null; status.textContent = ''; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    const selected = answers.find(answer => answer.checked);
    answers[0].setCustomValidity(selected ? '' : 'Kies asseblief Ja of Nee.');
    if (!form.reportValidity()) return;
    const endpoint = window.INVITATION_CONFIG?.rsvpEndpoint;
    status.dataset.error = 'false';
    if (!endpoint) {
      status.dataset.error = 'true';
      status.textContent = 'Aanlyn RSVP is nog nie beskikbaar nie. Probeer asseblief later weer.';
      return;
    }
    const data = new FormData(form);
    requestId ||= crypto.randomUUID();
    const payload = { name: String(data.get('name')).trim(), surname: String(data.get('surname')).trim(), attendance: selected.value, website: String(data.get('website') || ''), requestId };
    submit.disabled = true;
    submit.textContent = 'Besig om te stuur…';
    form.setAttribute('aria-busy', 'true');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify(payload), signal: controller.signal });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error('RSVP delivery failed');
      status.textContent = result.simulated === true
        ? 'Toets geslaag! Jou RSVP is plaaslik gestoor. Geen e-pos is gestuur nie.'
        : 'Baie dankie! Jou RSVP is gestuur.';
      form.reset();
      requestId = null;
    } catch {
      status.dataset.error = 'true';
      status.textContent = 'Jou RSVP kon nie bevestig word nie. Probeer asseblief weer.';
    } finally {
      window.clearTimeout(timeout);
      submit.disabled = false;
      submit.textContent = 'Stuur RSVP';
      form.removeAttribute('aria-busy');
    }
  });

  const configuredDate = window.INVITATION_CONFIG?.weddingDate;
  const target = configuredDate ? new Date(configuredDate).getTime() : NaN;
  if (Number.isFinite(target)) {
    document.querySelector('#wedding-date').textContent = new Intl.DateTimeFormat('af-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(target);
    function tick() {
      const remaining = Math.max(0, Math.floor((target - Date.now()) / 1000));
      const values = [Math.floor(remaining / 86400), Math.floor(remaining / 3600) % 24, Math.floor(remaining / 60) % 60, remaining % 60];
      ['days', 'hours', 'minutes', 'seconds'].forEach((id, i) => { document.getElementById(id).textContent = String(values[i]).padStart(2, '0'); });
      document.querySelector('#countdown-title').textContent = remaining ? 'Ons trou oor' : 'Ons groot dag';
    }
    tick();
    window.setInterval(tick, 1000);
  }
  update();
})();
