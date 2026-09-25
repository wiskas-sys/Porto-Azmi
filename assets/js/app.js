(() => {
  'use strict';

  const products = Array.isArray(window.BAKERY_PRODUCTS) ? window.BAKERY_PRODUCTS : [];
  const currency = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  });
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  const elements = {
    header: document.querySelector('[data-header]'),
    menuToggle: document.querySelector('[data-menu-toggle]'),
    mobileMenu: document.querySelector('[data-mobile-menu]'),
    themeToggle: document.querySelector('[data-theme-toggle]'),
    themeMeta: document.querySelector('meta[name="theme-color"]'),
    productGrid: document.querySelector('[data-product-grid]'),
    productCounter: document.querySelector('#product-counter'),
    menuStatus: document.querySelector('[data-menu-status]'),
    menuLive: document.querySelector('[data-menu-live]'),
    emptyState: document.querySelector('[data-empty-state]'),
    searchInput: document.querySelector('#product-search'),
    filterButtons: [...document.querySelectorAll('[data-category]')],
    resetFilter: document.querySelector('[data-reset-filter]'),
    cartLayer: document.querySelector('[data-cart-layer]'),
    cartItems: document.querySelector('[data-cart-items]'),
    cartEmpty: document.querySelector('[data-cart-empty]'),
    cartSummary: document.querySelector('[data-cart-summary]'),
    cartCount: document.querySelector('[data-cart-count]'),
    cartHeadingCount: document.querySelector('[data-cart-heading-count]'),
    cartTotal: document.querySelector('[data-cart-total]'),
    cartOpenButtons: [...document.querySelectorAll('[data-cart-open]')],
    cartLiveGlobal: document.querySelector('[data-cart-live-global]'),
    cartLive: document.querySelector('[data-cart-live]'),
    modal: document.querySelector('[data-product-modal]'),
    modalContent: document.querySelector('[data-modal-content]'),
    toast: document.querySelector('[data-toast]'),
    toastMessage: document.querySelector('[data-toast-message]'),
    currentYear: document.querySelector('[data-current-year]'),
    carousel: document.querySelector('[data-testimonial-carousel]'),
    carouselControls: document.querySelector('.carousel-controls'),
    carouselLive: document.querySelector('[data-carousel-live]'),
    slides: [...document.querySelectorAll('[data-testimonial-slide]')],
    dotsContainer: document.querySelector('[data-testimonial-dots]'),
    carouselToggle: document.querySelector('[data-testimonial-toggle]')
  };

  const state = {
    category: 'semua',
    query: '',
    cart: loadCart(),
    currentSlide: 0,
    selectedProduct: null,
    modalQuantity: 1,
    lastFocused: null,
    toastTimer: null,
    menuStatusTimer: null,
    storageWarningShown: false,
    cartReady: false,
    cartAnnouncementToken: 0,
    closeTimers: { cart: null, modal: null },
    carouselTimer: null,
    carouselPaused: false,
    carouselHovered: false,
    carouselFocused: false
  };

  let revealObserver;

  function formatPrice(value) {
    return currency.format(value).replace('IDR', 'Rp');
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function safeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(value) ? value : '#f8d59a';
  }

  function normalizeText(value) {
    return String(value).toLocaleLowerCase('id-ID');
  }

  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem('bunnie-bloom-cart'));
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};

      return Object.fromEntries(
        Object.entries(saved)
          .filter(([productId, quantity]) => getProduct(productId) && Number.isInteger(quantity) && quantity > 0)
          .map(([productId, quantity]) => [productId, Math.min(quantity, 99)])
      );
    } catch {
      return {};
    }
  }

  function saveCart() {
    try {
      localStorage.setItem('bunnie-bloom-cart', JSON.stringify(state.cart));
    } catch {
      if (state.storageWarningShown) return;
      state.storageWarningShown = true;
      showToast('Keranjang tetap aktif untuk sesi ini.');
    }
  }

  function getProduct(productId) {
    return products.find((product) => product.id === productId);
  }

  function setPageInert(isInert) {
    [elements.header, document.querySelector('main'), document.querySelector('.site-footer')]
      .forEach((element) => {
        if (element) element.inert = isInert;
      });
  }

  function syncBodyLock() {
    const overlayOpen = elements.cartLayer.classList.contains('is-open')
      || elements.modal.classList.contains('is-open');
    document.body.classList.toggle('is-locked', overlayOpen);
    setPageInert(overlayOpen);
  }

  function hideOverlayAfterTransition(element, key, duration) {
    window.clearTimeout(state.closeTimers[key]);
    if (reducedMotionQuery.matches) {
      element.hidden = true;
      state.closeTimers[key] = null;
      return;
    }

    state.closeTimers[key] = window.setTimeout(() => {
      element.hidden = true;
      state.closeTimers[key] = null;
    }, duration);
  }

  function showToast(message) {
    window.clearTimeout(state.toastTimer);
    elements.toastMessage.textContent = message;
    elements.toast.classList.add('is-visible');
    state.toastTimer = window.setTimeout(() => {
      elements.toast.classList.remove('is-visible');
    }, 2800);
  }

  function getFilteredProducts() {
    const query = normalizeText(state.query).trim();

    return products.filter((product) => {
      const categoryMatches = state.category === 'semua' || product.category === state.category;
      const searchableText = normalizeText([
        product.name,
        product.categoryLabel,
        product.description,
        product.detail,
        product.badge,
        product.storage,
        product.ingredients.join(' ')
      ].join(' '));
      const queryMatches = !query || searchableText.includes(query);
      return categoryMatches && queryMatches;
    });
  }

  function productCardTemplate(product) {
    const safeId = escapeHTML(product.id);
    const color = safeColor(product.color);

    return `
      <article class="product-card reveal">
        <button class="product-visual" type="button" data-product-action="detail" data-product-id="${safeId}" style="--product-color: ${color}" aria-label="Lihat detail ${escapeHTML(product.name)}">
          <span class="product-orb" aria-hidden="true"></span>
          <span class="product-icon" aria-hidden="true">${escapeHTML(product.icon)}</span>
          <span class="product-spark" aria-hidden="true">✦</span>
          <span class="product-badge">${escapeHTML(product.badge)}</span>
          <span class="product-detail-button" aria-hidden="true">
            <svg><use href="#icon-arrow"></use></svg>
          </span>
        </button>
        <div class="product-body">
          <span class="product-category">${escapeHTML(product.categoryLabel)}</span>
          <h3>${escapeHTML(product.name)}</h3>
          <p class="product-description">${escapeHTML(product.description)}</p>
          <div class="product-footer">
            <strong class="product-price">${formatPrice(product.price)}</strong>
            <button class="add-cart-button" type="button" data-product-action="add" data-product-id="${safeId}" aria-label="Tambah ${escapeHTML(product.name)} ke keranjang">
              <svg aria-hidden="true"><use href="#icon-bag"></use></svg>
              Tambah
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function renderMenu() {
    const filteredProducts = getFilteredProducts();
    elements.productGrid.innerHTML = filteredProducts.map(productCardTemplate).join('');
    elements.productGrid.hidden = filteredProducts.length === 0;
    elements.emptyState.hidden = filteredProducts.length !== 0;
    elements.productCounter.textContent = filteredProducts.length;
    announceMenuResult(filteredProducts.length);
    observeRevealElements(elements.productGrid);
  }

  function announceMenuResult(count) {
    const categoryName = state.category === 'semua' ? 'semua kategori' : state.category;
    const trimmedQuery = state.query.trim();
    const searchText = trimmedQuery ? ` untuk “${trimmedQuery}”` : '';
    const message = `${count} pilihan ditemukan pada kategori ${categoryName}${searchText}.`;

    elements.menuStatus.textContent = message;
    window.clearTimeout(state.menuStatusTimer);
    if (!trimmedQuery) {
      elements.menuLive.textContent = '';
      state.menuStatusTimer = null;
      return;
    }

    state.menuStatusTimer = window.setTimeout(() => {
      elements.menuLive.textContent = message;
      state.menuStatusTimer = null;
    }, 350);
  }

  function setCategory(category) {
    state.category = category;
    elements.filterButtons.forEach((button) => {
      const isActive = button.dataset.category === category;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    renderMenu();
  }

  function resetMenuFilters() {
    state.query = '';
    elements.searchInput.value = '';
    setCategory('semua');
    elements.searchInput.focus();
  }

  function focusSearchField() {
    closeMobileMenu();
    const reducedMotion = reducedMotionQuery.matches;
    document.querySelector('#menu').scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start'
    });
    window.setTimeout(() => elements.searchInput.focus(), reducedMotion ? 0 : 300);
  }

  function getCartCount() {
    return Object.values(state.cart).reduce((total, quantity) => total + quantity, 0);
  }

  function getCartTotal() {
    return Object.entries(state.cart).reduce((total, [productId, quantity]) => {
      const product = getProduct(productId);
      return total + (product ? product.price * quantity : 0);
    }, 0);
  }

  function cartItemTemplate(product, quantity) {
    const color = safeColor(product.color);
    return `
      <article class="cart-item">
        <div class="cart-item-visual" style="--product-color: ${color}" aria-hidden="true">${escapeHTML(product.icon)}</div>
        <div class="cart-item-info">
          <h3>${escapeHTML(product.name)}</h3>
          <p>${formatPrice(product.price * quantity)}</p>
          <div class="quantity-control" role="group" aria-label="Jumlah ${escapeHTML(product.name)}">
            <button type="button" data-cart-action="decrease" data-product-id="${escapeHTML(product.id)}" aria-label="Kurangi jumlah ${escapeHTML(product.name)}">
              <svg aria-hidden="true"><use href="#icon-minus"></use></svg>
            </button>
            <span>${quantity}</span>
            <button type="button" data-cart-action="increase" data-product-id="${escapeHTML(product.id)}" aria-label="Tambah jumlah ${escapeHTML(product.name)}"${quantity >= 99 ? ' disabled' : ''}>
              <svg aria-hidden="true"><use href="#icon-plus"></use></svg>
            </button>
          </div>
        </div>
        <button class="remove-cart-item" type="button" data-cart-action="remove" data-product-id="${escapeHTML(product.id)}" aria-label="Hapus ${escapeHTML(product.name)} dari keranjang">
          <svg aria-hidden="true"><use href="#icon-trash"></use></svg>
        </button>
      </article>
    `;
  }

  function renderCart() {
    const cartEntries = Object.entries(state.cart)
      .map(([productId, quantity]) => ({ product: getProduct(productId), quantity }))
      .filter((entry) => entry.product && entry.quantity > 0);
    const itemCount = getCartCount();
    const cartTotal = getCartTotal();

    elements.cartCount.textContent = itemCount;
    elements.cartHeadingCount.textContent = `(${itemCount})`;
    elements.cartTotal.textContent = formatPrice(cartTotal);
    elements.cartEmpty.hidden = cartEntries.length > 0;
    elements.cartSummary.hidden = cartEntries.length === 0;
    elements.cartItems.innerHTML = cartEntries
      .map(({ product, quantity }) => cartItemTemplate(product, quantity))
      .join('');

    const cartLabel = itemCount > 0
      ? `Buka keranjang belanja, ${itemCount} item`
      : 'Buka keranjang belanja, kosong';
    elements.cartOpenButtons.forEach((button) => {
      button.setAttribute('aria-label', cartLabel);
    });

    announceCartCount(itemCount, cartTotal);
  }

  function announceCartCount(itemCount, cartTotal) {
    if (!state.cartReady) {
      state.cartReady = true;
      return;
    }

    const activeLiveRegion = elements.cartLayer.classList.contains('is-open')
      ? elements.cartLive
      : elements.cartLiveGlobal;
    if (activeLiveRegion === elements.cartLiveGlobal && elements.toast.classList.contains('is-visible')) return;
    const message = itemCount > 0
      ? `Keranjang berisi ${itemCount} item, subtotal ${formatPrice(cartTotal)}.`
      : 'Keranjang belanja kosong.';

    const token = state.cartAnnouncementToken + 1;
    state.cartAnnouncementToken = token;
    [elements.cartLive, elements.cartLiveGlobal].forEach((region) => {
      if (region) region.textContent = '';
    });
    window.setTimeout(() => {
      if (state.cartAnnouncementToken !== token) return;
      if (activeLiveRegion) activeLiveRegion.textContent = message;
    }, 60);
  }

  function addToCart(productId, quantity = 1) {
    const product = getProduct(productId);
    if (!product) return;

    const requestedQuantity = Number.isFinite(quantity) ? Math.max(1, Math.trunc(quantity)) : 1;
    const currentQuantity = state.cart[productId] || 0;
    const nextQuantity = Math.min(99, currentQuantity + requestedQuantity);
    state.cart[productId] = nextQuantity;
    saveCart();
    showToast(
      currentQuantity + requestedQuantity > 99
        ? `Jumlah ${product.name} dibatasi maksimal 99 per item.`
        : `${product.name} ditambahkan ke keranjang.`
    );
    renderCart();
    bounceCartBadge();
  }

  function updateCartItem(productId, action) {
    if (!state.cart[productId]) return;

    if (action === 'increase') {
      const product = getProduct(productId);
      if (state.cart[productId] >= 99) {
        showToast(`Jumlah ${product.name} dibatasi maksimal 99 per item.`);
        return;
      }
      state.cart[productId] += 1;
    } else if (action === 'decrease') {
      state.cart[productId] -= 1;
      if (state.cart[productId] <= 0) delete state.cart[productId];
    } else if (action === 'remove') {
      delete state.cart[productId];
    } else {
      return;
    }

    saveCart();
    renderCart();
  }

  function bounceCartBadge() {
    elements.cartCount.classList.remove('is-bouncing');
    requestAnimationFrame(() => elements.cartCount.classList.add('is-bouncing'));
  }

  function openCart(trigger = document.activeElement) {
    closeMobileMenu();
    state.lastFocused = trigger instanceof HTMLElement ? trigger : document.activeElement;
    window.clearTimeout(state.closeTimers.cart);
    state.closeTimers.cart = null;
    elements.cartLayer.inert = false;
    elements.cartLayer.hidden = false;
    elements.cartLayer.classList.add('is-open');
    syncBodyLock();
    elements.cartLayer.querySelector('.cart-drawer [data-cart-close]')?.focus();
    announceCartCount(getCartCount(), getCartTotal());
  }

  function closeCart(restoreFocus = true) {
    if (!elements.cartLayer.classList.contains('is-open')) return;
    elements.cartLayer.classList.remove('is-open');
    syncBodyLock();
    if (restoreFocus && state.lastFocused instanceof HTMLElement) state.lastFocused.focus();
    elements.cartLayer.inert = true;
    hideOverlayAfterTransition(elements.cartLayer, 'cart', 420);
  }

  function modalTemplate(product) {
    const color = safeColor(product.color);
    const ingredientTags = product.ingredients
      .map((ingredient) => `<span class="modal-tag">${escapeHTML(ingredient)}</span>`)
      .join('');

    return `
      <div class="modal-visual" style="--product-color: ${color}">
        <span class="modal-badge">${escapeHTML(product.badge)}</span>
        <span class="modal-emoji" aria-hidden="true">${escapeHTML(product.icon)}</span>
      </div>
      <div class="modal-details">
        <span class="modal-category">${escapeHTML(product.categoryLabel)}</span>
        <h2 id="modal-product-name">${escapeHTML(product.name)}</h2>
        <p class="modal-description">${escapeHTML(product.detail)}</p>
        <div class="modal-meta">${ingredientTags}</div>
        <p class="modal-storage"><strong>Simpan:</strong> ${escapeHTML(product.storage)}</p>
        <div class="modal-buy-row">
          <div class="quantity-control" role="group" aria-label="Jumlah ${escapeHTML(product.name)}">
            <button type="button" data-modal-action="decrease" aria-label="Kurangi jumlah" disabled>
              <svg aria-hidden="true"><use href="#icon-minus"></use></svg>
            </button>
            <span data-modal-quantity>1</span>
            <button type="button" data-modal-action="increase" aria-label="Tambah jumlah">
              <svg aria-hidden="true"><use href="#icon-plus"></use></svg>
            </button>
          </div>
          <strong class="modal-price" data-modal-price>${formatPrice(product.price)}</strong>
          <button class="button button-primary" type="button" data-modal-action="add">
            <svg aria-hidden="true"><use href="#icon-bag"></use></svg>
            Masukkan
          </button>
        </div>
        <p class="sr-only" data-modal-live aria-live="polite" aria-atomic="true"></p>
      </div>
    `;
  }

  function openProductModal(productId, trigger = document.activeElement) {
    const product = getProduct(productId);
    if (!product) return;

    closeCart(false);
    closeMobileMenu();
    state.selectedProduct = product;
    state.modalQuantity = 1;
    state.lastFocused = trigger instanceof HTMLElement ? trigger : document.activeElement;
    elements.modalContent.innerHTML = modalTemplate(product);
    window.clearTimeout(state.closeTimers.modal);
    state.closeTimers.modal = null;
    elements.modal.inert = false;
    elements.modal.hidden = false;
    elements.modal.classList.add('is-open');
    syncBodyLock();
    syncModalQuantity(false);
    elements.modal.querySelector('.modal-dialog [data-modal-close]')?.focus();
  }

  function closeProductModal(restoreFocus = true) {
    if (!elements.modal.classList.contains('is-open')) return;
    elements.modal.classList.remove('is-open');
    state.selectedProduct = null;
    syncBodyLock();
    if (restoreFocus && state.lastFocused instanceof HTMLElement) state.lastFocused.focus();
    elements.modal.inert = true;
    hideOverlayAfterTransition(elements.modal, 'modal', 420);
  }

  function syncModalQuantity(announce = true) {
    if (!state.selectedProduct) return;
    const total = state.selectedProduct.price * state.modalQuantity;
    const quantityOutput = elements.modalContent.querySelector('[data-modal-quantity]');
    const priceOutput = elements.modalContent.querySelector('[data-modal-price]');
    const decreaseButton = elements.modalContent.querySelector('[data-modal-action="decrease"]');
    const increaseButton = elements.modalContent.querySelector('[data-modal-action="increase"]');

    if (quantityOutput) quantityOutput.textContent = state.modalQuantity;
    if (priceOutput) priceOutput.textContent = formatPrice(total);
    if (decreaseButton) decreaseButton.disabled = state.modalQuantity <= 1;
    if (increaseButton) increaseButton.disabled = state.modalQuantity >= 20;

    const liveRegion = elements.modalContent.querySelector('[data-modal-live]');
    if (liveRegion && announce) {
      liveRegion.textContent =
        `${state.selectedProduct.name}: jumlah ${state.modalQuantity}, total ${formatPrice(total)}.`;
    }
  }

  function updateModalQuantity(change) {
    if (!state.selectedProduct) return;
    state.modalQuantity = Math.max(1, Math.min(20, state.modalQuantity + change));
    syncModalQuantity();
  }

  function buildOrderText() {
    const lines = Object.entries(state.cart).map(([productId, quantity]) => {
      const product = getProduct(productId);
      return product ? `${quantity}x ${product.name} - ${formatPrice(product.price * quantity)}` : '';
    }).filter(Boolean);

    return [
      'Halo Bunnie Bloom, saya ingin memesan:',
      ...lines,
      '',
      `Total: ${formatPrice(getCartTotal())}`,
      'Mohon konfirmasi ketersediaan dan cara pengambilannya. Terima kasih!'
    ].join('\n');
  }

  function fallbackCopyText(text) {
    const previouslyFocused = document.activeElement;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    return copied;
  }

  async function copyOrder() {
    const orderText = buildOrderText();
    let copied = false;

    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(orderText);
        copied = true;
      } catch {
        copied = false;
      }
    }

    if (!copied) copied = fallbackCopyText(orderText);

    showToast(copied
      ? 'Ringkasan pesanan berhasil disalin.'
      : 'Tidak dapat menyalin otomatis. Silakan izinkan akses clipboard.');
  }

  function closeMobileMenu(restoreFocus = false) {
    const wasOpen = elements.menuToggle.getAttribute('aria-expanded') === 'true';
    elements.menuToggle.setAttribute('aria-expanded', 'false');
    elements.menuToggle.setAttribute('aria-label', 'Buka menu navigasi');
    elements.mobileMenu.classList.remove('is-open');
    elements.mobileMenu.hidden = true;
    elements.mobileMenu.setAttribute('aria-hidden', 'true');
    if (wasOpen && restoreFocus) elements.menuToggle.focus();
  }

  function toggleMobileMenu() {
    const willOpen = elements.menuToggle.getAttribute('aria-expanded') !== 'true';
    elements.menuToggle.setAttribute('aria-expanded', String(willOpen));
    elements.menuToggle.setAttribute('aria-label', willOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi');
    elements.mobileMenu.hidden = !willOpen;
    elements.mobileMenu.setAttribute('aria-hidden', String(!willOpen));
    elements.mobileMenu.classList.toggle('is-open', willOpen);
  }

  function setTheme(theme, persist = true) {
    const isDark = theme === 'dark';
    document.documentElement.dataset.theme = theme;
    elements.themeToggle.setAttribute('aria-label', isDark ? 'Aktifkan mode terang' : 'Aktifkan mode gelap');
    elements.themeMeta.setAttribute('content', isDark ? '#211819' : '#fff8f2');
    if (!persist) return;
    try {
      localStorage.setItem('bunnie-bloom-theme', theme);
    } catch {
      return;
    }
  }

  function showTestimonial(index, announce = false) {
    const totalSlides = elements.slides.length;
    state.currentSlide = (index + totalSlides) % totalSlides;

    elements.slides.forEach((slide, slideIndex) => {
      const isActive = slideIndex === state.currentSlide;
      slide.hidden = !isActive;
      slide.classList.toggle('is-active', isActive);
    });

    [...elements.dotsContainer.children].forEach((dot, dotIndex) => {
      const isActive = dotIndex === state.currentSlide;
      dot.classList.toggle('is-active', isActive);
      if (isActive) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });

    if (announce && elements.carouselLive) {
      const activeSlide = elements.slides[state.currentSlide];
      const person = activeSlide?.querySelector('.testimonial-person strong')?.textContent || '';
      elements.carouselLive.textContent = `Testimoni ${state.currentSlide + 1} dari ${totalSlides}${person ? `, ${person}` : ''}.`;
    }
  }

  function createCarouselDots() {
    elements.slides.forEach((_, index) => {
      const dot = document.createElement('button');
      dot.className = 'carousel-dot';
      dot.type = 'button';
      dot.setAttribute('aria-label', `Tampilkan testimoni ${index + 1}`);
      dot.addEventListener('click', () => showTestimonial(index, true));
      elements.dotsContainer.appendChild(dot);
    });
  }

  function stopCarouselTimer() {
    window.clearInterval(state.carouselTimer);
    state.carouselTimer = null;
  }

  function shouldPauseCarousel() {
    return reducedMotionQuery.matches
      || state.carouselPaused
      || state.carouselHovered
      || state.carouselFocused;
  }

  function syncCarouselControl() {
    if (reducedMotionQuery.matches) {
      stopCarouselTimer();
      elements.carouselToggle.disabled = true;
      elements.carouselToggle.removeAttribute('aria-pressed');
      elements.carouselToggle.textContent = 'Manual';
      elements.carouselToggle.setAttribute('aria-label', 'Testimoni digeser secara manual');
      return;
    }

    elements.carouselToggle.disabled = false;
    elements.carouselToggle.setAttribute('aria-pressed', String(state.carouselPaused));
    elements.carouselToggle.textContent = state.carouselPaused ? 'Putar' : 'Jeda';
    elements.carouselToggle.setAttribute(
      'aria-label',
      state.carouselPaused ? 'Lanjutkan pergantian testimoni' : 'Jeda pergantian testimoni'
    );
  }

  function startCarouselTimer() {
    if (shouldPauseCarousel() || state.carouselTimer) return;
    state.carouselTimer = window.setInterval(() => {
      showTestimonial(state.currentSlide + 1);
    }, 6500);
  }

  function toggleCarousel() {
    if (reducedMotionQuery.matches) return;
    state.carouselPaused = !state.carouselPaused;
    syncCarouselControl();
    if (state.carouselPaused) stopCarouselTimer();
    else startCarouselTimer();
  }

  function observeRevealElements(root = document) {
    const revealElements = root.querySelectorAll('.reveal:not(.is-visible)');
    const reducedMotion = reducedMotionQuery.matches;

    if (reducedMotion || !('IntersectionObserver' in window)) {
      revealElements.forEach((element) => element.classList.add('is-visible'));
      return;
    }

    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
    }

    revealElements.forEach((element) => revealObserver.observe(element));
  }

  function initRevealObserver() {
    observeRevealElements();
  }

  function initActiveNavigation() {
    if (!('IntersectionObserver' in window)) return;
    const sections = [...document.querySelectorAll('main section[id], footer#kontak')];
    const navLinks = [...document.querySelectorAll('.desktop-nav .nav-link')];
    const observer = new IntersectionObserver((entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];
      if (!visibleEntry) return;

      const activeLink = navLinks.find((link) => link.getAttribute('href') === `#${visibleEntry.target.id}`);
      if (!activeLink) return;

      navLinks.forEach((link) => {
        const isActive = link === activeLink;
        link.classList.toggle('is-active', isActive);
        if (isActive) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }, { threshold: [0.1, 0.3, 0.5], rootMargin: '-15% 0px -55%' });

    sections.forEach((section) => observer.observe(section));
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const activeDialog = elements.modal.classList.contains('is-open')
      ? elements.modal.querySelector('.modal-dialog')
      : elements.cartLayer.classList.contains('is-open')
        ? elements.cartLayer.querySelector('.cart-drawer')
        : null;
    if (!activeDialog) return;

    const focusable = [...activeDialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;

    const firstElement = focusable[0];
    const lastElement = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  elements.filterButtons.forEach((button) => {
    button.addEventListener('click', () => setCategory(button.dataset.category));
  });

  elements.searchInput.addEventListener('input', (event) => {
    state.query = event.target.value;
    renderMenu();
  });

  elements.resetFilter.addEventListener('click', resetMenuFilters);
  elements.menuToggle.addEventListener('click', toggleMobileMenu);
  elements.mobileMenu.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMobileMenu(true);
  });

  document.querySelectorAll('[data-focus-search]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      closeCart();
      focusSearchField();
    });
  });

  elements.themeToggle.addEventListener('click', () => {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  });

  elements.productGrid.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-product-action]');
    if (!actionButton) return;
    const productId = actionButton.dataset.productId;
    if (actionButton.dataset.productAction === 'detail') openProductModal(productId, actionButton);
    if (actionButton.dataset.productAction === 'add') addToCart(productId);
  });

  document.querySelectorAll('[data-cart-open]').forEach((button) => {
    button.addEventListener('click', () => openCart(button));
  });

  document.querySelectorAll('[data-cart-close]').forEach((button) => {
    button.addEventListener('click', () => closeCart());
  });

  elements.cartItems.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-cart-action]');
    if (!actionButton) return;
    const productId = actionButton.dataset.productId;
    const action = actionButton.dataset.cartAction;
    updateCartItem(productId, action);

    const nextButton = [...elements.cartItems.querySelectorAll('[data-cart-action]')]
      .find((button) => button.dataset.productId === productId && button.dataset.cartAction === action);
    if (nextButton && !nextButton.disabled) {
      nextButton.focus();
    } else {
      elements.cartLayer.querySelector('.cart-drawer [data-cart-close]')?.focus();
    }
  });

  document.querySelector('[data-copy-order]').addEventListener('click', copyOrder);

  document.querySelectorAll('[data-modal-close]').forEach((button) => {
    button.addEventListener('click', () => closeProductModal());
  });

  elements.modalContent.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-modal-action]');
    if (!actionButton || !state.selectedProduct) return;
    if (actionButton.dataset.modalAction === 'increase') updateModalQuantity(1);
    if (actionButton.dataset.modalAction === 'decrease') updateModalQuantity(-1);
    if (actionButton.dataset.modalAction === 'add') {
      addToCart(state.selectedProduct.id, state.modalQuantity);
      closeProductModal();
    }
  });

  document.querySelector('[data-testimonial-prev]').addEventListener('click', () => {
    showTestimonial(state.currentSlide - 1, true);
  });

  document.querySelector('[data-testimonial-next]').addEventListener('click', () => {
    showTestimonial(state.currentSlide + 1, true);
  });

  elements.carouselToggle.addEventListener('click', toggleCarousel);

  function handleCarouselKeydown(event) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showTestimonial(state.currentSlide + (event.key === 'ArrowRight' ? 1 : -1), true);
    }
  }

  elements.carousel.addEventListener('keydown', handleCarouselKeydown);
  elements.carouselControls.addEventListener('keydown', handleCarouselKeydown);

  [elements.carousel, elements.carouselControls].forEach((region) => {
    region.addEventListener('mouseenter', () => {
      state.carouselHovered = true;
      stopCarouselTimer();
    });
    region.addEventListener('mouseleave', () => {
      state.carouselHovered = false;
      startCarouselTimer();
    });
    region.addEventListener('focusin', () => {
      state.carouselFocused = true;
      stopCarouselTimer();
    });
    region.addEventListener('focusout', (event) => {
      if (!region.contains(event.relatedTarget)) {
        state.carouselFocused = false;
        startCarouselTimer();
      }
    });
  });

  reducedMotionQuery.addEventListener('change', () => {
    syncCarouselControl();
    startCarouselTimer();
  });

  let touchStartX = 0;
  elements.carousel.addEventListener('touchstart', (event) => {
    touchStartX = event.changedTouches[0].clientX;
  }, { passive: true });
  elements.carousel.addEventListener('touchend', (event) => {
    const difference = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(difference) > 50) {
      showTestimonial(state.currentSlide + (difference < 0 ? 1 : -1), true);
    }
  }, { passive: true });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (elements.modal.classList.contains('is-open')) closeProductModal();
      else if (elements.cartLayer.classList.contains('is-open')) closeCart();
      else if (elements.menuToggle.getAttribute('aria-expanded') === 'true') closeMobileMenu(true);
    }

    const overlayIsOpen = elements.modal.classList.contains('is-open')
      || elements.cartLayer.classList.contains('is-open')
      || elements.menuToggle.getAttribute('aria-expanded') === 'true';
    if (event.key === '/' && !overlayIsOpen) {
      const activeTag = document.activeElement?.tagName;
      const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA';
      if (!isTyping) {
        event.preventDefault();
        focusSearchField();
      }
    }

    trapFocus(event);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 940) closeMobileMenu();
  });

  elements.currentYear.textContent = new Date().getFullYear();
  setTheme(document.documentElement.dataset.theme, false);
  renderMenu();
  renderCart();
  createCarouselDots();
  showTestimonial(0);
  initRevealObserver();
  initActiveNavigation();
  syncCarouselControl();
  startCarouselTimer();
})();
