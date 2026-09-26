(() => {
  'use strict';

  const products = Array.isArray(window.BAKERY_PRODUCTS) ? window.BAKERY_PRODUCTS : [];
  const methods = Array.isArray(window.BUNNIE_PAYMENT_METHODS) ? window.BUNNIE_PAYMENT_METHODS : [];
  const config = window.BUNNIE_PAYMENT_CONFIG || {};
  const submitPayment = typeof window.BUNNIE_PAYMENT_SUBMIT === 'function'
    ? window.BUNNIE_PAYMENT_SUBMIT
    : null;

  const CART_KEY = 'bunnie-bloom-cart';
  const ORDER_KEY = 'bunnie-bloom-last-order';
  const LAST_STEP = 4;
  const DELIVERY_FEE = Number(config.deliveryFee) || 0;
  const FREE_DELIVERY_THRESHOLD = Number(config.freeDeliveryThreshold) || 0;

  const currency = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  });
  const dateTimeFormat = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  const elements = {
    layer: document.querySelector('[data-checkout-layer]'),
    dialog: document.querySelector('[data-checkout-dialog]'),
    kicker: document.querySelector('[data-checkout-kicker]'),
    title: document.querySelector('[data-checkout-title]'),
    body: document.querySelector('[data-checkout-body]'),
    footer: document.querySelector('[data-checkout-footer]'),
    live: document.querySelector('[data-checkout-live]'),
    orderHistory: document.querySelector('[data-order-history]'),
    cartLayer: document.querySelector('[data-cart-layer]'),
    openButtons: [...document.querySelectorAll('[data-checkout-open]')],
    closeButtons: [...document.querySelectorAll('[data-checkout-close]')],
    indicators: [...document.querySelectorAll('[data-step-indicator]')]
  };

  const state = {
    step: 1,
    // Salinan keranjang milik app.js. null berarti pakai localStorage.
    cart: null,
    customer: { name: '', phone: '', email: '', address: '', note: '' },
    fulfillment: 'pickup',
    methodId: methods[0]?.id ?? null,
    accountIndex: 0,
    wallet: methods.find((method) => method.kind === 'wallet')?.options?.[0] ?? null,
    simulateFailure: false,
    errors: {},
    paymentError: '',
    processing: false,
    order: null,
    lastFocused: null,
    closeTimer: null,
    history: readLastOrder()
  };

  const STEP_COPY = {
    1: { kicker: 'Langkah 1 dari 3', title: 'Data & Pengiriman' },
    2: { kicker: 'Langkah 2 dari 3', title: 'Pilih Pembayaran' },
    3: { kicker: 'Langkah 3 dari 3', title: 'Konfirmasi Pesanan' },
    4: { kicker: 'Semua beres', title: 'Pesanan Diterima' }
  };

  function formatPrice(value) {
    return currency.format(Math.max(0, Math.round(value) || 0)).replace('IDR', 'Rp');
  }

  function escapeHTML(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function getProduct(productId) {
    return products.find((product) => product.id === productId);
  }

  function getMethod(methodId) {
    return methods.find((method) => method.id === methodId) ?? null;
  }

  function readCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(CART_KEY));
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

  function readLastOrder() {
    try {
      const saved = JSON.parse(localStorage.getItem(ORDER_KEY));
      if (!saved || typeof saved !== 'object' || !saved.orderId) return null;
      return saved;
    } catch {
      return null;
    }
  }

  function getCartEntries() {
    const source = state.cart ?? readCart();
    return Object.entries(source)
      .map(([productId, quantity]) => ({ product: getProduct(productId), quantity }))
      .filter((entry) => entry.product && entry.quantity > 0);
  }

  function countItems(entries) {
    return entries.reduce((total, entry) => total + entry.quantity, 0);
  }

  function sumSubtotal(entries) {
    return entries.reduce((total, entry) => total + entry.product.price * entry.quantity, 0);
  }

  function getSubtotal() {
    return sumSubtotal(getCartEntries());
  }

  function getDeliveryFee() {
    if (state.fulfillment !== 'delivery') return 0;
    const subtotal = getSubtotal();
    if (FREE_DELIVERY_THRESHOLD > 0 && subtotal >= FREE_DELIVERY_THRESHOLD) return 0;
    return DELIVERY_FEE;
  }

  function getGrandTotal() {
    return getSubtotal() + getDeliveryFee();
  }

  function getFreeDeliveryGap() {
    if (state.fulfillment !== 'delivery' || FREE_DELIVERY_THRESHOLD <= 0) return 0;
    return Math.max(0, FREE_DELIVERY_THRESHOLD - getSubtotal());
  }

  function isCartEmpty() {
    return getCartEntries().length === 0;
  }

  function createOrderId() {
    const now = new Date();
    const datePart = [
      String(now.getFullYear()).slice(-2),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('');
    const random = new Uint32Array(1);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(random);
    else random[0] = Math.floor(Math.random() * 4294967295);
    return `BB-${datePart}-${String(random[0] % 10000).padStart(4, '0')}`;
  }

  function normalizePhone(value) {
    let digits = String(value ?? '').replace(/[^\d+]/g, '');
    if (digits.startsWith('+')) digits = digits.slice(1);
    if (digits.startsWith('62')) digits = `0${digits.slice(2)}`;
    if (digits.startsWith('8')) digits = `0${digits}`;
    return digits;
  }

  function formatPhoneInput(value) {
    const digits = normalizePhone(value).slice(0, 13);
    const parts = [];
    if (digits.length > 0) parts.push(digits.slice(0, 4));
    if (digits.length > 4) parts.push(digits.slice(4, 8));
    if (digits.length > 8) parts.push(digits.slice(8, 13));
    return parts.join('-');
  }

  function isValidEmail(value) {
    if (!value) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  function validateContact() {
    const errors = {};
    const name = state.customer.name.trim();
    const phone = normalizePhone(state.customer.phone);
    const address = state.customer.address.trim();

    if (name.length < 3) errors.name = 'Tulis nama lengkap, minimal 3 huruf.';
    if (!/^08\d{8,11}$/.test(phone)) {
      errors.phone = 'Masukkan nomor WhatsApp aktif, contoh 0812 3456 7890.';
    }
    if (!isValidEmail(state.customer.email.trim())) {
      errors.email = 'Format email belum tepat, contoh namamu@email.com.';
    }
    if (state.fulfillment === 'delivery' && address.length < 10) {
      errors.address = 'Tulis alamat lengkap beserta patokan agar kurir tidak nyasar.';
    }

    return errors;
  }

  function announce(message) {
    if (!elements.live) return;
    elements.live.textContent = '';
    window.setTimeout(() => {
      elements.live.textContent = message;
    }, 60);
  }

  function setPageInert(isInert) {
    [
      document.querySelector('.site-header'),
      document.querySelector('main'),
      document.querySelector('.site-footer'),
      elements.cartLayer
    ].forEach((element) => {
      if (element) element.inert = isInert;
    });
  }

  function syncPageLock() {
    const isOpen = elements.layer.classList.contains('is-open');
    const cartIsOpen = elements.cartLayer?.classList.contains('is-open') ?? false;
    document.body.classList.toggle('is-locked', isOpen || cartIsOpen);
    setPageInert(isOpen);
  }

  function syncStepIndicator() {
    // Di luar dialog checkout, stepper berada di tahap keranjang.
    const isCheckoutOpen = elements.layer.classList.contains('is-open');
    const activeStep = !isCheckoutOpen ? 1 : state.step >= LAST_STEP ? 3 : 2;
    elements.indicators.forEach((indicator) => {
      [...indicator.querySelectorAll('.checkout-step')].forEach((item) => {
        const itemStep = Number(item.dataset.step);
        const isCurrent = itemStep === activeStep;
        item.classList.toggle('is-current', isCurrent);
        item.classList.toggle('is-done', itemStep < activeStep);
        if (isCurrent) item.setAttribute('aria-current', 'step');
        else item.removeAttribute('aria-current');
      });
    });
  }

  function fieldErrorTemplate(field) {
    const message = state.errors[field];
    return `<p class="field-error" id="checkout-error-${field}" data-error-for="${field}"${message ? '' : ' hidden'}>${escapeHTML(message || '')}</p>`;
  }

  function errorAttributes(field) {
    return state.errors[field]
      ? `aria-invalid="true" aria-describedby="checkout-error-${field}"`
      : '';
  }

  function fieldTemplate({ id, label, hint, control, field, optional = false }) {
    return `
      <div class="field-group">
        <label class="field-label" for="checkout-${id}">
          ${escapeHTML(label)}${optional
            ? '<span class="field-optional">opsional</span>'
            : '<span class="field-required" aria-hidden="true">*</span>'}
        </label>
        ${control}
        ${hint ? `<p class="field-hint" id="checkout-hint-${id}">${escapeHTML(hint)}</p>` : ''}
        ${fieldErrorTemplate(field)}
      </div>
    `;
  }

  function renderContactStep() {
    const isDelivery = state.fulfillment === 'delivery';
    const errorCount = Object.keys(state.errors).length;

    return `
      <div class="checkout-panel">
        <p class="checkout-lead">Cukup beberapa data singkat supaya pesanan kami tidak salah kirim.</p>
        ${errorCount ? `
          <p class="form-alert" role="alert">
            <svg aria-hidden="true"><use href="#icon-alert"></use></svg>
            <span>${errorCount} data perlu diperbaiki sebelum lanjut.</span>
          </p>
        ` : ''}

        <div class="field-grid">
          ${fieldTemplate({
            id: 'name',
            field: 'name',
            label: 'Nama lengkap',
            control: `<input class="field-input" id="checkout-name" name="name" type="text" autocomplete="name" required value="${escapeHTML(state.customer.name)}" ${errorAttributes('name')}>`
          })}
          ${fieldTemplate({
            id: 'phone',
            field: 'phone',
            label: 'Nomor WhatsApp',
            hint: 'Boleh diawali +62.',
            control: `<input class="field-input" id="checkout-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="0812 3456 7890" value="${escapeHTML(state.customer.phone)}" ${errorAttributes('phone')}>`
          })}
        </div>

        ${fieldTemplate({
          id: 'email',
          field: 'email',
          label: 'Email',
          optional: true,
          control: `<input class="field-input" id="checkout-email" name="email" type="email" autocomplete="email" placeholder="namamu@email.com" value="${escapeHTML(state.customer.email)}" ${errorAttributes('email')}>`
        })}

        <fieldset class="fulfillment-set">
          <legend class="field-label">Cara menerima pesanan</legend>
          <div class="method-grid">
            <label class="method-option">
              <input class="sr-only" type="radio" name="fulfillment" value="pickup"${isDelivery ? '' : ' checked'}>
              <span class="method-card">
                <span class="method-icon"><svg aria-hidden="true"><use href="#icon-store"></use></svg></span>
                <span class="method-body">
                  <strong>Ambil di kedai</strong>
                  <small>${escapeHTML(config.storeAddress || 'Bunnie Bloom')}</small>
                </span>
                <svg class="method-check" aria-hidden="true"><use href="#icon-check"></use></svg>
              </span>
            </label>
            <label class="method-option">
              <input class="sr-only" type="radio" name="fulfillment" value="delivery"${isDelivery ? ' checked' : ''}>
              <span class="method-card">
                <span class="method-icon"><svg aria-hidden="true"><use href="#icon-truck"></use></svg></span>
                <span class="method-body">
                  <strong>Diantar ke alamat</strong>
                  <small>${formatPrice(DELIVERY_FEE)}${FREE_DELIVERY_THRESHOLD ? `, gratis di atas ${formatPrice(FREE_DELIVERY_THRESHOLD)}` : ''}</small>
                </span>
                <svg class="method-check" aria-hidden="true"><use href="#icon-check"></use></svg>
              </span>
            </label>
          </div>
        </fieldset>

        <div class="field-group" data-address-group${isDelivery ? '' : ' hidden'}>
          <label class="field-label" for="checkout-address">
            Alamat pengiriman<span class="field-required" aria-hidden="true">*</span>
          </label>
          <textarea class="field-input field-textarea" id="checkout-address" name="address" rows="3" autocomplete="street-address" placeholder="Nama jalan, nomor rumah, RT/RW, kelurahan, kecamatan, kota" ${isDelivery ? 'required' : ''} ${errorAttributes('address')}>${escapeHTML(state.customer.address)}</textarea>
          ${fieldErrorTemplate('address')}
        </div>

        ${fieldTemplate({
          id: 'note',
          field: 'note',
          label: 'Catatan untuk dapur',
          optional: true,
          hint: 'Misalnya kurang manis, alergi, atau ada request tulisan di kue.',
          control: `<textarea class="field-input field-textarea" id="checkout-note" name="note" rows="2" placeholder="Tidak wajib, diisi bila ada.">${escapeHTML(state.customer.note)}</textarea>`
        })}
      </div>
    `;
  }

  function renderMethodStep() {
    const method = getMethod(state.methodId);
    const gap = getFreeDeliveryGap();
    const subtotal = getSubtotal();
    const progress = FREE_DELIVERY_THRESHOLD > 0
      ? Math.min(100, Math.round((subtotal / FREE_DELIVERY_THRESHOLD) * 100))
      : 100;

    return `
      <div class="checkout-panel">
        <p class="checkout-lead">Pilih cara yang paling nyaman. Instruksinya muncul setelah pembayaran dikonfirmasi.</p>

        <fieldset class="method-fieldset">
          <legend class="sr-only">Metode pembayaran</legend>
          <div class="method-grid">
            ${methods.map((item) => `
              <label class="method-option">
                <input class="sr-only" type="radio" name="method" value="${escapeHTML(item.id)}"${item.id === state.methodId ? ' checked' : ''}>
                <span class="method-card">
                  <span class="method-icon"><svg aria-hidden="true"><use href="#icon-${escapeHTML(item.icon)}"></use></svg></span>
                  <span class="method-body">
                    <strong>${escapeHTML(item.label)}</strong>
                    <small>${escapeHTML(item.hint)}</small>
                  </span>
                  <svg class="method-check" aria-hidden="true"><use href="#icon-check"></use></svg>
                </span>
              </label>
            `).join('')}
          </div>
        </fieldset>

        ${method?.kind === 'wallet' ? `
          <fieldset class="chip-fieldset">
            <legend class="field-label">Dompet digital</legend>
            <div class="chip-list">
              ${method.options.map((option) => `
                <label class="chip-option">
                  <input class="sr-only" type="radio" name="wallet" value="${escapeHTML(option)}"${option === state.wallet ? ' checked' : ''}>
                  <span class="chip">${escapeHTML(option)}</span>
                </label>
              `).join('')}
            </div>
          </fieldset>
        ` : ''}

        ${method?.accounts?.length ? `
          <fieldset class="chip-fieldset">
            <legend class="field-label">Pilih rekening tujuan</legend>
            <div class="account-list">
              ${method.accounts.map((account, index) => `
                <label class="account-option">
                  <input class="sr-only" type="radio" name="account" value="${index}"${index === state.accountIndex ? ' checked' : ''}>
                  <span class="account-card">
                    <strong>${escapeHTML(account.bank)}</strong>
                    <small>${escapeHTML(account.number)}</small>
                  </span>
                </label>
              `).join('')}
            </div>
            <p class="field-hint">Nomor di atas adalah data contoh untuk kebutuhan demo.</p>
          </fieldset>
        ` : ''}

        <div class="delivery-meter">
          <div class="delivery-meter-copy">
            <strong>${state.fulfillment === 'delivery' ? 'Ongkos antar' : 'Ambil sendiri di kedai'}</strong>
            <span>${state.fulfillment === 'delivery'
              ? (gap > 0 ? `Tambah ${formatPrice(gap)} lagi untuk gratis antar.` : 'Gratis antar untuk pesanan ini.')
              : escapeHTML(config.storeHours || 'Setiap hari 08.00-20.00')}</span>
          </div>
          ${state.fulfillment === 'delivery'
            ? `<div class="delivery-track" style="--delivery-progress: ${progress}%" aria-hidden="true"><span></span></div>`
            : ''}
        </div>
      </div>
    `;
  }

  function renderItemsSummary(entries) {
    const list = entries ?? getCartEntries();
    if (!list.length) {
      return '<li class="summary-item summary-item-empty">Tidak ada item.</li>';
    }
    return list.map(({ product, quantity }) => `
      <li class="summary-item">
        <span class="summary-item-visual" aria-hidden="true">${escapeHTML(product.icon)}</span>
        <span class="summary-item-info">
          <strong>${escapeHTML(product.name)}</strong>
          <small>${quantity} x ${formatPrice(product.price)}</small>
        </span>
        <span class="summary-item-total">${formatPrice(product.price * quantity)}</span>
      </li>
    `).join('');
  }

  function renderTotals({ subtotal, deliveryFee, total }) {
    return `
      <div class="totals-block">
        <div class="totals-row"><span>Subtotal</span><strong>${formatPrice(subtotal)}</strong></div>
        <div class="totals-row">
          <span>${deliveryFee > 0 ? 'Ongkos antar' : state.fulfillment === 'delivery' ? 'Ongkos antar' : 'Pengambilan di kedai'}</span>
          <strong>${deliveryFee === 0 ? 'Gratis' : formatPrice(deliveryFee)}</strong>
        </div>
        <div class="totals-row totals-row-grand"><span>Total</span><strong>${formatPrice(total)}</strong></div>
      </div>
    `;
  }

  function renderConfirmStep() {
    const method = getMethod(state.methodId);
    const phone = formatPhoneInput(state.customer.phone);

    return `
      <div class="checkout-panel">
        ${state.paymentError ? `
          <div class="payment-alert" role="alert">
            <svg aria-hidden="true"><use href="#icon-alert"></use></svg>
            <div>
              <strong>Pembayaran belum berhasil</strong>
              <p>${escapeHTML(state.paymentError)}</p>
              <p class="payment-alert-hint">Keranjang kamu tetap aman. Coba lagi atau pilih metode lain.</p>
            </div>
          </div>
        ` : ''}

        <section class="confirm-block">
          <h3 class="confirm-heading">Pesanan kamu</h3>
          <ul class="summary-list">${renderItemsSummary()}</ul>
        </section>

        <section class="confirm-block">
          <h3 class="confirm-heading">Diterima oleh</h3>
          <dl class="detail-list">
            <div><dt>Nama</dt><dd>${escapeHTML(state.customer.name.trim())}</dd></div>
            <div><dt>WhatsApp</dt><dd>${escapeHTML(phone)}</dd></div>
            ${state.customer.email.trim() ? `<div><dt>Email</dt><dd>${escapeHTML(state.customer.email.trim())}</dd></div>` : ''}
            <div><dt>Pengambilan</dt><dd>${state.fulfillment === 'delivery' ? 'Diantar ke alamat' : 'Ambil di kedai'}</dd></div>
            ${state.fulfillment === 'delivery' ? `<div><dt>Alamat</dt><dd>${escapeHTML(state.customer.address.trim())}</dd></div>` : ''}
            ${state.customer.note.trim() ? `<div><dt>Catatan</dt><dd>${escapeHTML(state.customer.note.trim())}</dd></div>` : ''}
            <div><dt>Pembayaran</dt><dd>${escapeHTML(method?.label ?? '-')}${method?.kind === 'wallet' && state.wallet ? ` via ${escapeHTML(state.wallet)}` : ''}</dd></div>
          </dl>
        </section>

        ${renderTotals({
          subtotal: getSubtotal(),
          deliveryFee: getDeliveryFee(),
          total: getGrandTotal()
        })}

        <label class="demo-toggle">
          <input class="sr-only" type="checkbox" data-failure-toggle${state.simulateFailure ? ' checked' : ''}>
          <span class="demo-toggle-track" aria-hidden="true"><span class="demo-toggle-knob"></span></span>
          <span class="demo-toggle-copy">
            <strong>Simulasikan pembayaran gagal</strong>
            <small>Untuk melihat tampilan saat penyedia pembayaran menolak transaksi.</small>
          </span>
        </label>

        <p class="demo-note">
          <svg aria-hidden="true"><use href="#icon-lock"></use></svg>
          Ini simulasi pembayaran. Tidak ada uang sungguhan yang diproses dan tidak ada data yang dikirim ke mana pun.
        </p>
      </div>
    `;
  }

  function buildQrPattern(seed) {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
      hash = (hash ^ seed.charCodeAt(index)) * 16777619 % 4294967296;
    }
    const next = () => {
      hash = (hash * 1103515245 + 12345) % 2147483648;
      return hash % 100;
    };
    const inFinder = (row, col) => (row < 4 && col < 4) || (row < 4 && col > 8) || (row > 8 && col < 4);

    const cells = [];
    for (let row = 0; row < 13; row += 1) {
      for (let col = 0; col < 13; col += 1) {
        if (inFinder(row, col)) continue;
        if (next() < 46) cells.push(`<rect x="${col}" y="${row}" width="1" height="1"/>`);
      }
    }
    return cells.join('');
  }

  function renderQrCode(orderId) {
    const finder = (x, y) => `
      <rect x="${x}" y="${y}" width="4" height="4" fill="none" stroke="currentColor" stroke-width="1"/>
      <rect x="${x + 1.5}" y="${y + 1.5}" width="1" height="1" fill="currentColor"/>
    `;
    return `
      <div class="qr-card">
        <svg class="qr-code" viewBox="0 0 13 13" role="img" aria-label="Kode QR contoh yang tidak dapat dipindai">
          <rect width="13" height="13" fill="var(--surface)"/>
          <g fill="currentColor">${buildQrPattern(orderId)}</g>
          <g>${finder(0, 0)}${finder(9, 0)}${finder(0, 9)}</g>
        </svg>
        <p class="qr-caption">Kode QR contoh untuk ${escapeHTML(orderId)}</p>
      </div>
    `;
  }

  function renderSuccessStep() {
    const order = state.order;
    const method = getMethod(order.methodId);
    const account = method?.accounts?.[order.accountIndex];

    return `
      <div class="checkout-panel checkout-panel-success">
        <div class="success-hero">
          <span class="success-mark" aria-hidden="true"><svg><use href="#icon-check"></use></svg></span>
          <div>
            <p class="success-kicker">Nomor pesanan</p>
            <strong class="success-order">${escapeHTML(order.orderId)}</strong>
          </div>
        </div>

        <p class="checkout-lead">
          Terima kasih, ${escapeHTML(order.customerName)}. Pesanan sudah kami terima
          ${order.fulfillment === 'delivery' ? 'dan sedang disiapkan untuk pengantaran.' : 'dan mulai dipanggang sekarang.'}
        </p>

        <section class="confirm-block">
          <h3 class="confirm-heading">Cara menyelesaikan pembayaran</h3>
          ${method?.kind === 'qr' || method?.kind === 'wallet' ? renderQrCode(order.orderId) : ''}
          ${account ? `
            <div class="account-detail">
              <span class="account-detail-label">Nomor ${escapeHTML(account.bank)}</span>
              <strong>${escapeHTML(account.number)}</strong>
              <span class="account-detail-label">a.n. ${escapeHTML(config.bankHolder ?? config.storeName ?? 'Bunnie Bloom')}</span>
            </div>
          ` : ''}
          ${method?.kind === 'wallet' && order.wallet ? `<p class="instruction-note">Dilakukan lewat <strong>${escapeHTML(order.wallet)}</strong>.</p>` : ''}
          <ol class="instruction-list">
            ${(method?.instructions ?? []).map((item) => `<li>${escapeHTML(item)}</li>`).join('')}
          </ol>
        </section>

        <section class="confirm-block">
          <h3 class="confirm-heading">Rincian pesanan</h3>
          <ul class="summary-list">${renderItemsSummary(order.items)}</ul>
          ${renderTotals(order)}
          <p class="success-meta">
            ${countItems(order.items)} item terkonfirmasi pada ${escapeHTML(dateTimeFormat.format(order.placedAt))}
          </p>
        </section>

        <p class="demo-note">
          <svg aria-hidden="true"><use href="#icon-lock"></use></svg>
          Nomor pesanan ini hanya disimpan di browser kamu sebagai demo. Tidak ada transaksi nyata yang terjadi.
        </p>
      </div>
    `;
  }

  function renderBody() {
    if (state.step === 1) elements.body.innerHTML = renderContactStep();
    else if (state.step === 2) elements.body.innerHTML = renderMethodStep();
    else if (state.step === 3) elements.body.innerHTML = renderConfirmStep();
    else elements.body.innerHTML = renderSuccessStep();
  }

  function renderFooter() {
    if (state.step === LAST_STEP) {
      elements.footer.innerHTML = `
        <button class="button button-ghost button-full" type="button" data-checkout-copy>
          <svg aria-hidden="true"><use href="#icon-copy"></use></svg>
          Salin Ringkasan
        </button>
        <button class="button button-primary button-full" type="button" data-checkout-done>
          Selesai
        </button>
      `;
      return;
    }

    if (state.processing) {
      elements.footer.innerHTML = `
        <p class="processing-note">
          <span class="processing-spinner" aria-hidden="true"></span>
          <span>Memproses pembayaran…</span>
        </p>
        <button class="button button-primary button-full" type="button" disabled>
          Memproses…
        </button>
      `;
      return;
    }

    elements.footer.innerHTML = `
      <button class="button button-ghost button-full" type="button" data-checkout-back>
        <svg aria-hidden="true"><use href="#icon-chevron-left"></use></svg>
        ${state.step === 1 ? 'Kembali ke keranjang' : 'Kembali'}
      </button>
      <button class="button button-primary button-full" type="button" data-checkout-next>
        ${state.step === 3 ? 'Bayar Sekarang' : 'Lanjut'}
        <svg aria-hidden="true"><use href="#icon-arrow"></use></svg>
      </button>
    `;
  }

  function renderCheckout() {
    const copy = STEP_COPY[state.step];
    elements.kicker.textContent = copy.kicker;
    elements.title.textContent = copy.title;
    elements.dialog.setAttribute('aria-busy', String(state.processing));
    elements.body.scrollTop = 0;
    renderBody();
    renderFooter();
    syncStepIndicator();
  }

  function focusFirstInDialog() {
    const target = state.step === LAST_STEP
      ? elements.footer.querySelector('[data-checkout-done]')
      : elements.body.querySelector('input:not([type="radio"]), textarea');
    if (target) {
      target.focus();
      return;
    }
    elements.footer.querySelector('[data-checkout-next], [data-checkout-done]')?.focus();
  }

  function focusFirstError() {
    const firstInvalid = elements.body.querySelector('[aria-invalid="true"]');
    if (firstInvalid) firstInvalid.focus();
    else focusFirstInDialog();
  }

  function focusChecked(name) {
    const input = elements.body.querySelector(`[name="${name}"]:checked`);
    if (input) input.focus();
  }

  function setStep(step, options = {}) {
    const { focus = true, silent = false } = options;
    state.step = Math.min(LAST_STEP, Math.max(1, step));
    renderCheckout();
    if (focus) focusFirstInDialog();
    if (!silent) announce(`${STEP_COPY[state.step].kicker}. ${STEP_COPY[state.step].title}.`);
  }

  function collectCustomerFromForm() {
    const readValue = (name) => elements.body.querySelector(`[name="${name}"]`)?.value ?? '';
    state.customer.name = readValue('name').slice(0, 80);
    state.customer.phone = readValue('phone').slice(0, 24);
    state.customer.email = readValue('email').slice(0, 120);
    state.customer.address = readValue('address').slice(0, 240);
    state.customer.note = readValue('note').slice(0, 240);
  }

  function handleNext() {
    if (state.processing) return;

    if (state.step === 1) {
      collectCustomerFromForm();
      state.errors = validateContact();
      if (Object.keys(state.errors).length) {
        renderCheckout();
        announce(`${Object.keys(state.errors).length} data perlu diperbaiki sebelum lanjut.`);
        focusFirstError();
        return;
      }
    }

    if (state.step === 3) {
      startPayment();
      return;
    }

    setStep(state.step + 1);
  }

  function handleBack() {
    if (state.processing) return;
    if (state.step === 1) {
      closeCheckout();
      return;
    }
    state.paymentError = '';
    setStep(state.step - 1);
  }

  function startPayment() {
    if (!submitPayment) {
      state.paymentError = 'Layanan pembayaran belum tersedia.';
      renderCheckout();
      return;
    }

    const items = getCartEntries();
    const order = {
      orderId: createOrderId(),
      placedAt: new Date(),
      customerName: state.customer.name.trim(),
      methodId: state.methodId,
      wallet: state.wallet,
      accountIndex: state.accountIndex,
      fulfillment: state.fulfillment,
      items,
      subtotal: sumSubtotal(items),
      deliveryFee: getDeliveryFee(),
      total: getGrandTotal()
    };

    state.processing = true;
    state.paymentError = '';
    renderCheckout();
    announce('Memproses pembayaran. Mohon tunggu sebentar.');

    submitPayment({
      orderId: order.orderId,
      amount: order.total,
      methodId: order.methodId,
      customer: { name: order.customerName },
      fulfillment: order.fulfillment,
      simulateFailure: state.simulateFailure
    }).then((result) => {
      state.processing = false;
      if (!result?.ok) {
        state.paymentError = result?.message || 'Pembayaran gagal diproses. Silakan coba lagi.';
        renderCheckout();
        announce(`Pembayaran gagal. ${state.paymentError}`);
        elements.body.querySelector('.payment-alert')?.scrollIntoView({
          behavior: reducedMotionQuery.matches ? 'auto' : 'smooth',
          block: 'center'
        });
        elements.footer.querySelector('[data-checkout-next]')?.focus();
        return;
      }
      finishOrder(order);
    }).catch((error) => {
      state.processing = false;
      state.paymentError = error?.message || 'Terjadi kendala teknis. Silakan coba lagi.';
      renderCheckout();
      announce(`Pembayaran gagal. ${state.paymentError}`);
    });
  }

  function finishOrder(order) {
    state.order = order;
    state.simulateFailure = false;
    state.cart = {};
    try {
      localStorage.setItem(CART_KEY, '{}');
      localStorage.setItem(ORDER_KEY, JSON.stringify({
        orderId: order.orderId,
        placedAt: order.placedAt.toISOString(),
        total: order.total,
        methodLabel: getMethod(order.methodId)?.label ?? '-',
        itemCount: countItems(order.items)
      }));
    } catch {
      // Penyimpanan penuh atau dinonaktifkan tidak boleh membatalkan pesanan.
    }
    state.history = readLastOrder();
    window.dispatchEvent(new CustomEvent('bunnie-bloom:cart-changed'));
    renderOrderHistory();
    setStep(LAST_STEP);
    announce(`Pembayaran berhasil. Nomor pesanan ${order.orderId}.`);
  }

  function buildOrderText() {
    const order = state.order;
    if (!order) return '';
    const method = getMethod(order.methodId);
    return [
      'Halo Bunnie Bloom, pesanan saya:',
      ...order.items.map(({ product, quantity }) => `${quantity}x ${product.name} - ${formatPrice(product.price * quantity)}`),
      '',
      `Nomor pesanan: ${order.orderId}`,
      `Penerima: ${order.customerName}`,
      `Pengambilan: ${order.fulfillment === 'delivery' ? 'Diantar ke alamat' : 'Ambil di kedai'}`,
      `Pembayaran: ${method?.label ?? '-'}${method?.kind === 'wallet' && order.wallet ? ` via ${order.wallet}` : ''}`,
      `Subtotal: ${formatPrice(order.subtotal)}`,
      `Ongkos antar: ${order.deliveryFee === 0 ? 'Gratis' : formatPrice(order.deliveryFee)}`,
      `Total: ${formatPrice(order.total)}`,
      '',
      'Mohon konfirmasi ketersediaan dan waktu pengambilannya. Terima kasih!'
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

  let toastTimer = null;
  function showToast(message) {
    const toast = document.querySelector('[data-toast]');
    const toastMessage = document.querySelector('[data-toast-message]');
    if (!toast || !toastMessage) return;
    toastMessage.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 2800);
  }

  async function copyOrderSummary() {
    const text = buildOrderText();
    if (!text) return;
    let copied = false;

    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        copied = false;
      }
    }
    if (!copied) copied = fallbackCopyText(text);

    showToast(copied
      ? 'Ringkasan pesanan berhasil disalin.'
      : 'Tidak dapat menyalin otomatis. Silakan izinkan akses clipboard.');
  }

  function renderOrderHistory() {
    if (!elements.orderHistory) return;
    const order = state.history;
    const shouldShow = Boolean(order) && isCartEmpty();
    elements.orderHistory.hidden = !shouldShow;
    if (!shouldShow) {
      elements.orderHistory.innerHTML = '';
      return;
    }

    const placedAt = new Date(order.placedAt);
    const hasValidDate = !Number.isNaN(placedAt.getTime());

    elements.orderHistory.innerHTML = `
      <div class="order-history-card">
        <span class="order-history-icon" aria-hidden="true"><svg><use href="#icon-check"></use></svg></span>
        <div class="order-history-body">
          <strong>Pesanan terakhir</strong>
          <span class="order-history-id">${escapeHTML(order.orderId)}</span>
          <span class="order-history-meta">${escapeHTML(order.methodLabel || '-')} · ${formatPrice(order.total)}${hasValidDate ? ` · ${escapeHTML(dateTimeFormat.format(placedAt))}` : ''}</span>
        </div>
      </div>
    `;
  }

  function openCheckout(trigger = document.activeElement) {
    if (isCartEmpty()) {
      showToast('Keranjang masih kosong. Pilih menu dulu ya.');
      return;
    }

    state.step = 1;
    state.errors = {};
    state.paymentError = '';
    state.order = null;
    state.lastFocused = trigger instanceof HTMLElement ? trigger : document.activeElement;

    window.clearTimeout(state.closeTimer);
    elements.layer.inert = false;
    elements.layer.hidden = false;
    elements.layer.classList.add('is-open');
    renderCheckout();
    syncPageLock();
    elements.dialog.querySelector('[data-checkout-close]')?.focus();
  }

  function closeCheckout(restoreFocus = true) {
    if (!elements.layer.classList.contains('is-open')) return;
    elements.layer.classList.remove('is-open');
    elements.dialog.setAttribute('aria-busy', 'false');
    syncStepIndicator();
    syncPageLock();
    elements.layer.inert = true;

    if (restoreFocus) {
      const trigger = state.lastFocused;
      // Pemicu bisa ikut hilang, misalnya tombol checkout di keranjang yang
      // disembunyikan setelah pesanan lunas.
      const canRestore = trigger instanceof HTMLElement
        && trigger.isConnected
        && !trigger.closest('[hidden]')
        && trigger.getClientRects().length > 0;
      const fallback = document.querySelector('[data-cart-open]');
      (canRestore ? trigger : fallback)?.focus();
    }

    state.closeTimer = window.setTimeout(() => {
      if (!elements.layer.classList.contains('is-open')) elements.layer.hidden = true;
    }, reducedMotionQuery.matches ? 0 : 320);
  }

  function trapFocus(event) {
    if (event.key !== 'Tab' || !elements.layer.classList.contains('is-open')) return;

    const focusable = [...elements.dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((element) => element.getClientRects().length > 0);
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

  function handleBodyChange(event) {
    const field = event.target.name;

    if (event.target.matches('[data-failure-toggle]')) {
      state.simulateFailure = event.target.checked;
      announce(state.simulateFailure
        ? 'Simulasi pembayaran gagal diaktifkan.'
        : 'Simulasi pembayaran gagal dimatikan.');
      return;
    }

    if (field === 'fulfillment') {
      state.fulfillment = event.target.value;
      // Validasi ulang supaya ringkasan error tidak lagi menampilkan
      // data yang sebenarnya sudah diperbaiki pengguna.
      state.errors = validateContact();
      renderCheckout();
      focusChecked('fulfillment');
      announce(state.fulfillment === 'delivery'
        ? 'Diantar ke alamat. Alamat pengiriman menjadi wajib.'
        : 'Ambil di kedai. Ongkos antar tidak berlaku.');
      return;
    }

    if (field === 'method') {
      state.methodId = event.target.value;
      state.accountIndex = 0;
      const method = getMethod(state.methodId);
      if (method?.options?.length) state.wallet = method.options[0];
      renderCheckout();
      focusChecked('method');
      announce(`Metode pembayaran ${method?.label ?? ''} dipilih.`);
      return;
    }

    if (field === 'wallet') {
      state.wallet = event.target.value;
      announce(`Dompet digital ${state.wallet} dipilih.`);
      return;
    }

    if (field === 'account') {
      state.accountIndex = Number(event.target.value) || 0;
      announce(`Rekening ${getMethod(state.methodId)?.accounts?.[state.accountIndex]?.bank ?? ''} dipilih.`);
    }
  }

  elements.openButtons.forEach((button) => {
    button.addEventListener('click', () => openCheckout(button));
  });

  elements.closeButtons.forEach((button) => {
    button.addEventListener('click', () => closeCheckout());
  });

  elements.body.addEventListener('input', (event) => {
    const field = event.target.name;
    if (['name', 'phone', 'email', 'address', 'note'].includes(field)) {
      state.customer[field] = event.target.value;
    }
  });

  elements.body.addEventListener('focusout', (event) => {
    if (event.target.name !== 'phone') return;
    const formatted = formatPhoneInput(event.target.value);
    if (formatted && formatted !== event.target.value) {
      event.target.value = formatted;
      state.customer.phone = formatted;
    }
  });

  elements.body.addEventListener('change', handleBodyChange);

  elements.footer.addEventListener('click', (event) => {
    if (event.target.closest('[data-checkout-next]')) handleNext();
    if (event.target.closest('[data-checkout-back]')) handleBack();
    if (event.target.closest('[data-checkout-done]')) closeCheckout();
    if (event.target.closest('[data-checkout-copy]')) copyOrderSummary();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && elements.layer.classList.contains('is-open')) {
      if (state.processing) return;
      event.stopPropagation();
      closeCheckout();
    }
    trapFocus(event);
  });

  window.addEventListener('bunnie-bloom:cart-changed', (event) => {
    // Hanya terima salinan dari app.js. Event tanpa detail dikirim oleh
    // checkout.js sendiri saat keranjang dikosongkan setelah pembayaran.
    if (event.detail?.cart) state.cart = event.detail.cart;
    if (!elements.layer.classList.contains('is-open')) renderOrderHistory();
  });

  renderOrderHistory();
})();
