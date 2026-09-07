/**
 * Aura Nails Hub — editorial redesign layer.
 * Keeps the booking, gallery, payment and admin engines intact while changing
 * the public-facing hierarchy, copy and interaction language.
 */
(function () {
  const WHATSAPP = 'https://wa.me/254741959888?text=' + encodeURIComponent("Hi Denis — I'd like to book a nail appointment with Aura Nails Hub. What's available?");

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'redesign.css?v=20260907';
  document.head.appendChild(stylesheet);

  document.documentElement.classList.remove('dark-mode');
  document.documentElement.classList.add('aura-editorial');
  document.title = 'Aura Nails Hub | Nail Artistry in Embu';
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = 'Clean prep, strong structure and nail art made to feel like you. Studio appointments and house calls in Embu.';
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.content = '#f5efe7';

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const setText = (selector, text, root = document) => { const el = q(selector, root); if (el) el.textContent = text; };
  const setHTML = (selector, html, root = document) => { const el = q(selector, root); if (el) el.innerHTML = html; };

  function rewriteBranding() {
    qa('.brand-logo').forEach(brand => {
      brand.innerHTML = `
        <div class="brand-text">
          <span class="brand-name">AURA</span>
          <span class="brand-sub">Nail studio · Embu</span>
        </div>`;
    });

    const navLinks = qa('.nav-menu .nav-link');
    const nav = [
      ['Work', '#services-portfolio'],
      ['Build a set', '#calculator'],
      ['References', '#inspo'],
      ['The standard', '#standards']
    ];
    navLinks.forEach((link, i) => {
      if (!nav[i]) return;
      link.textContent = nav[i][0];
      link.setAttribute('href', nav[i][1]);
    });

    const book = q('.btn-book-nav');
    if (book) {
      book.href = WHATSAPP;
      book.innerHTML = 'Book a set <span aria-hidden="true">↗</span>';
    }

    const upload = q('.btn-upload-nav');
    const footerBottom = q('.footer-bottom');
    if (upload && footerBottom) {
      upload.classList.add('studio-admin-link');
      upload.classList.remove('btn-upload-nav');
      upload.innerHTML = 'Studio admin';
      footerBottom.appendChild(upload);
    }
  }

  function rewriteHero() {
    setHTML('.status-badge', 'NAIL ARTISTRY · EMBU');
    setHTML('.hero-title', 'Your set should<br><em>say something.</em>');
    setHTML('.hero-description', 'Clean prep, strong structure and art that feels like <strong>you</strong> — in studio or wherever you are in Embu.');

    const primary = q('.hero-cta-group .btn-primary');
    if (primary) {
      primary.href = WHATSAPP;
      primary.innerHTML = 'Book your set <span aria-hidden="true">↗</span>';
    }
    const secondary = q('.hero-cta-group .btn-secondary:not(#hero-upload-btn)');
    if (secondary) {
      secondary.href = '#services-portfolio';
      secondary.innerHTML = 'See the work <span aria-hidden="true">↓</span>';
    }

    const stats = qa('.hero-stats .stat-item');
    const copy = [
      ['HOUSE CALLS + STUDIO', 'Choose the setting that works for you'],
      ['RESERVE / 30%', 'Secure the appointment, settle the rest after'],
      ['CUSTOM BY DEFAULT', 'Bring a reference or start from scratch']
    ];
    stats.forEach((item, i) => {
      if (!copy[i]) return;
      setText('.stat-number', copy[i][0], item);
      setText('.stat-label', copy[i][1], item);
    });

    setText('.hero-visual-badge', 'AURA SIGNATURE');
    setText('.hero-visual-title', 'Chrome, structure, detail.');
  }

  function rewriteWeeklyFeature() {
    setText('.notw-badge', 'CURRENT OBSESSION');
    const cta = q('.notw-cta');
    if (cta) cta.textContent = 'See the set →';
  }

  function rewritePortfolio() {
    const section = q('#services-portfolio');
    if (!section) return;
    setText('.section-tag', 'THE WORK', section);
    setText('.section-title', 'Find the set that feels like you.', section);
    setText('.section-subtitle', 'Natural, structured, chrome or sculpted. Start with a service, then use the work below to decide how far you want to take it.', section);

    const serviceCopy = {
      all: ['All work', 'Every finish, shape and structure'],
      'Gel Polish': ['Gel on natural nails', 'Clean prep · colour · gloss'],
      'Tips + Gel': ['Tips + gel', 'Length, shape and a clean finish'],
      Gumgel: ['Gumgel structure', 'Reinforcement without losing the shape'],
      '3d': ['3D + chrome', 'Texture, metal, detail and statement'],
      Pedicure: ['Gel toes', 'Prep, polish and a lasting finish']
    };

    qa('.service-list-item[data-category]', section).forEach(item => {
      const key = item.dataset.category;
      const pair = serviceCopy[key];
      if (!pair) return;
      setText('.service-card-title', pair[0], item);
      const features = q('.service-features', item);
      if (features) features.innerHTML = `<li>${pair[1]}</li>`;
      const loose = qa('p', item).find(p => !p.closest('.service-list-body'));
      if (loose) loose.textContent = pair[1];
    });

    const search = q('#gallery-search');
    if (search) search.placeholder = 'Search by finish, shape or tag';
  }

  function rewriteCalculator() {
    const section = q('#calculator');
    if (!section) return;
    setText('.section-tag', 'BUILD YOUR SET', section);
    setText('.section-title', 'Know the price before you book.', section);
    setText('.section-subtitle', 'Choose the base, length and finish. The estimate updates as you build, so there is no awkward price surprise at the end.', section);

    const titles = qa('.calc-group-title', section);
    const labels = ['01 · Choose the base', '02 · Add length if you want it', '03 · Decide the finish', 'Your estimate'];
    titles.forEach((el, i) => { if (labels[i]) el.textContent = labels[i]; });
  }

  function rewriteReviews() {
    const section = q('#reviews');
    if (!section) return;
    setText('.section-tag', 'CLIENT NOTES', section);
    setText('.section-title', 'They notice the details.', section);
    setText('.section-subtitle', 'Clean prep, wear, shape and the convenience of having the appointment come to you — the small things are usually what get mentioned.', section);
  }

  function rewriteInspo() {
    const section = q('#inspo');
    if (!section) return;
    setText('.section-tag', 'BRING A REFERENCE', section);
    setText('.section-title', 'Bring the idea. Leave with your version.', section);
    setText('.section-subtitle', 'A reference is a starting point, not a copy-and-paste instruction. Save what you like and Denis can adapt the shape, colour and detail to you.', section);
    const hint = q('.inspo-scroll-hint', section);
    if (hint) hint.innerHTML = 'Drag sideways to keep looking <span aria-hidden="true">→</span>';
  }

  function rewriteStandards() {
    const section = q('#standards');
    if (!section) return;
    setText('.section-tag', 'BEFORE THE COLOUR', section);
    setText('.section-title', 'Good nails start before the colour.', section);
    setText('.section-subtitle', 'The finish is what you photograph. Prep, structure, hygiene and time are what make the appointment worth repeating.', section);

    const cards = qa('.standard-card', section);
    const content = [
      ['Your space or ours.', 'Book a house call around Embu when convenience matters, or choose a studio appointment when you prefer the full setup.'],
      ['Clean tools. Every appointment.', 'Reusable tools are disinfected between clients and single-use files stay single-use. Clean work starts before polish touches the nail.'],
      ['Structure before shine.', 'Prep, primer and apex work are chosen around the service so length and finish have a proper foundation.'],
      ['Art, not a template.', 'Bring a reference, a colour or just a mood. The point is to translate it into a set that still looks like yours.']
    ];
    cards.forEach((card, i) => {
      if (!content[i]) return;
      const h3 = q('h3', card); const p = q('p', card);
      if (h3) h3.textContent = content[i][0];
      if (p) p.textContent = content[i][1];
    });
  }

  function rewriteFooter() {
    const footer = q('.site-footer');
    if (!footer) return;
    const brandPara = q('.footer-brand-col > p');
    if (brandPara) brandPara.textContent = 'Clean prep, strong structure and expressive nail art in Embu — in studio or by house call.';
    const h4s = qa('h4', footer);
    if (h4s[0]) h4s[0].textContent = 'Where we work';
    if (h4s[1]) h4s[1].textContent = 'Appointment hours';
    const bottomPs = qa('.footer-bottom p');
    if (bottomPs[0]) bottomPs[0].textContent = '© 2026 Aura Nails Hub. Embu, Kenya.';
    if (bottomPs[1]) bottomPs[1].textContent = 'Nail artistry by Denis Mwaura';
  }

  function insertClosingCTA() {
    if (q('.aura-closing')) return;
    const footer = q('.site-footer');
    if (!footer) return;
    const closing = document.createElement('section');
    closing.className = 'aura-closing';
    closing.innerHTML = `
      <div class="aura-closing-inner">
        <div class="aura-closing-kicker">YOUR NEXT SET</div>
        <h2>Start with a message.</h2>
        <p>Tell us the date, where you are in Embu and the kind of set you have in mind. A reference photo helps, but it is not required.</p>
        <a class="btn-primary" href="${WHATSAPP}" target="_blank" rel="noopener">Book on WhatsApp <span aria-hidden="true">↗</span></a>
      </div>`;
    footer.parentNode.insertBefore(closing, footer);
  }

  function reorderSections() {
    const main = q('main');
    if (!main) return;
    const portfolio = q('#services-portfolio');
    const calculator = q('#calculator');
    const inspo = q('#inspo');
    const standards = q('#standards');
    const reviews = q('#reviews');
    [portfolio, calculator, inspo, standards, reviews].forEach(section => {
      if (section) main.appendChild(section);
    });
  }

  function cleanGimmicks() {
    qa('.tilt-card').forEach(el => { el.style.transform = ''; });
    const heroBg = q('.parallax-bg');
    if (heroBg) heroBg.setAttribute('aria-hidden', 'true');
  }

  function polishDynamicGallery(root = document) {
    qa('.gallery-card', root).forEach(card => {
      if (card.dataset.editorialPolished === 'true') return;
      card.dataset.editorialPolished = 'true';

      const deposit = qa('.card-content > div', card).find(el => /30% Deposit/i.test(el.textContent));
      if (deposit) deposit.textContent = deposit.textContent.replace('30% Deposit:', 'Reserve with');

      const book = q('.btn-book-look', card);
      if (book) {
        const match = book.textContent.match(/Ksh\s*[\d,]+/i);
        book.innerHTML = `${match ? `Reserve · ${match[0]}` : 'Reserve this set'} <span aria-hidden="true">→</span>`;
      }
    });
  }

  rewriteBranding();
  rewriteHero();
  rewriteWeeklyFeature();
  rewritePortfolio();
  rewriteCalculator();
  rewriteReviews();
  rewriteInspo();
  rewriteStandards();
  reorderSections();
  insertClosingCTA();
  rewriteFooter();
  cleanGimmicks();

  const observer = new MutationObserver(mutations => {
    let needsPolish = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) { needsPolish = true; break; }
    }
    if (needsPolish) polishDynamicGallery();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('DOMContentLoaded', () => {
    polishDynamicGallery();
    initEditorialMotion();
  });

  function initEditorialMotion() {
    const reveal = qa('.section-header, .service-list-item, .calculator-card, .standard-card, .aura-closing-inner');
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: .12, rootMargin: '0px 0px -36px 0px' });
    reveal.forEach(el => { el.classList.add('reveal-on-scroll'); io.observe(el); });

    const header = q('.site-header');
    window.addEventListener('scroll', () => {
      if (header) header.classList.toggle('header-scrolled', window.scrollY > 24);
    }, { passive: true });
  }

  window.effectsEngine = { refreshTilt: () => polishDynamicGallery() };
})();
