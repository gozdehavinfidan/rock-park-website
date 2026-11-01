/* Rock Park — behaviour that must work with or without the motion layer */
(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const root = document.documentElement;
  const motionOK = () => root.classList.contains("motion") && !!window.gsap;

  // Placeholder — replace with the real inbox before launch.
  const CONTACT_EMAIL = "wholesale@example.com";

  /* ------------------------------------------------------------------
     Top app bar: solid after the hero edge, hides on scroll down
     ------------------------------------------------------------------ */
  const bar = $("#bar");
  const toggle = $(".bar__toggle");
  let lastY = scrollY;
  const onScroll = () => {
    const y = scrollY;
    bar.classList.toggle("is-solid", y > 40);
    if (!bar.classList.contains("is-open")) bar.classList.toggle("is-hidden", y > lastY && y > innerHeight * 0.6);
    lastY = y;
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Mobile menu: page behind becomes inert, focus moves in and comes back out
  const behind = [$("#main"), $(".footer")];
  const setMenu = (open, returnFocus = true) => {
    bar.classList.toggle("is-open", open);
    if (open) bar.classList.remove("is-hidden");
    toggle.setAttribute("aria-expanded", open);
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    document.body.style.overflow = open ? "hidden" : "";
    behind.forEach((el) => (el.inert = open));
    if (open) $(".bar__nav a").focus();
    else if (returnFocus) toggle.focus();
  };
  const isMenu = () => bar.classList.contains("is-open");
  toggle.addEventListener("click", () => setMenu(!isMenu()));
  $$(".bar__nav a").forEach((a) =>
    a.addEventListener("click", () => {
      if (!isMenu()) return;
      setMenu(false, false);
      // land keyboard focus on the destination heading, not on the now-hidden link
      const h = $(a.getAttribute("href") + " h2");
      if (h) { h.tabIndex = -1; setTimeout(() => h.focus({ preventScroll: true }), 0); }
    })
  );
  addEventListener("keydown", (e) => {
    if (!isMenu()) return;
    if (e.key === "Escape") setMenu(false);
    if (e.key === "Tab") { // keep Tab cycling between the toggle, links and CTA inside the open bar
      const items = [toggle, ...$$(".bar__nav a")];
      const i = items.indexOf(document.activeElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1);
      e.preventDefault();
      items[next].focus();
    }
  });
  matchMedia("(min-width: 901px)").addEventListener("change", (m) => m.matches && isMenu() && setMenu(false, false));

  // Active-section indicator under the nav links
  const links = $$(".bar__nav a");
  const ind = $(".bar__ind");
  const markActive = (id) => {
    let hit = null;
    links.forEach((a) => {
      const on = a.getAttribute("href") === "#" + id;
      if (on) { a.setAttribute("aria-current", "true"); hit = a; } else a.removeAttribute("aria-current");
    });
    ind.style.opacity = hit ? 1 : 0;
    if (hit) { ind.style.width = hit.offsetWidth - 24 + "px"; ind.style.transform = `translateX(${hit.offsetLeft + 12}px)`; }
  };
  const sections = links.map((a) => $(a.getAttribute("href"))).filter(Boolean);
  const seen = new Map();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => seen.set(e.target.id, e.isIntersecting));
    const current = sections.find((s) => seen.get(s.id));
    markActive(current ? current.id : "");
  }, { rootMargin: "-45% 0px -50% 0px" });
  sections.forEach((s) => io.observe(s));

  /* ------------------------------------------------------------------
     Collection filter (GSAP Flip morphs the grid when motion is on)
     ------------------------------------------------------------------ */
  const chips = $$(".chips .chip[data-filter]");
  const cards = $$("#grid .card");
  const gridStatus = $("#grid-status");
  chips.forEach((chip) =>
    chip.addEventListener("click", () => {
      const f = chip.dataset.filter;
      chips.forEach((c) => c.setAttribute("aria-pressed", c === chip));
      const useFlip = motionOK() && window.Flip;
      const state = useFlip ? Flip.getState(cards) : null;
      let n = 0;
      cards.forEach((c) => { const show = f === "all" || c.dataset.cat === f; c.hidden = !show; n += show; });
      gridStatus.textContent = `${n} ${n === 1 ? "stone" : "stones"} shown`;
      if (useFlip) {
        Flip.from(state, {
          duration: 0.7, ease: "md-emph", absolute: true, nested: true,
          onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.6, ease: "md-emph-dec" }),
          onLeave: (els) => gsap.to(els, { opacity: 0, scale: 0.92, duration: 0.3, ease: "md-emph-acc" }),
          onComplete: () => window.ScrollTrigger && ScrollTrigger.refresh(),
        });
      }
    })
  );

  /* ------------------------------------------------------------------
     Quick-view dialog (native <dialog>: focus trap, Esc, inert page)
     ------------------------------------------------------------------ */
  const dlg = $("#quick");
  let current = null;
  const fill = (card) => {
    const d = card.dataset;
    const img = $("img", card);
    const q = $("#quick-img");
    q.src = img.currentSrc || img.src;
    q.alt = img.alt;
    $("#quick-title").textContent = $(".card__name", card).textContent;
    $("#quick-tag").textContent = $(".card__tag", card).textContent;
    $("#quick-note").textContent = d.note;
    $("#quick-form").textContent = d.form;
    $("#quick-sold").textContent = d.sold;
    $("#quick-tiers").textContent = d.tiers;
    $("#quick-origin").textContent = d.origin;
    $("#quick-origin-row").hidden = !d.origin;
  };
  $$(".card__open").forEach((btn) =>
    btn.addEventListener("click", () => {
      current = btn.closest(".card");
      fill(current);
      dlg.classList.add("is-opening");
      dlg.showModal();
    })
  );
  dlg.addEventListener("animationend", () => dlg.classList.remove("is-opening"));
  const close = () => dlg.close();
  $("#quick-close").addEventListener("click", close);
  $("[data-close]", dlg).addEventListener("click", close);
  dlg.addEventListener("click", (e) => e.target === dlg && close()); // backdrop click
  dlg.addEventListener("close", () => current && $(".card__open", current).focus());

  // "Request availability" → pre-check the stone in the form and jump there
  const stoneMap = { "Amethyst Cathedrals": "Amethyst", "Labradorite Hearts": "Labradorite", "Amazonite Points": "Amazonite",
    "Flower Agate": "Flower agate", "Rose Quartz": "Rose quartz", "Stone Spheres": "Spheres", "Soapstone Animals": "Carvings",
    "Jasper & Mixed Towers": "Towers & points", "Rough Quartz Points": "Towers & points", "Chevron Amethyst": "Tumbled stones",
    "Blue Apatite": "Tumbled stones", "Mexican Minerals": "Mexican minerals", "Coprolite": "Coprolite & fossils" };
  $("#quick-request").addEventListener("click", () => {
    const name = $(".card__name", current).textContent;
    const val = stoneMap[name] || name;
    const box = $$('input[name="stones"]').find((i) => i.value === val);
    if (box) box.checked = true;
    const msg = $("#f-message");
    if (!msg.value.trim()) msg.value = `Interested in: ${name}
`;
    current = null;
    close();
    $("#inquiry").scrollIntoView({ behavior: motionOK() ? "smooth" : "auto" });
    setTimeout(() => $("#f-name").focus({ preventScroll: true }), motionOK() ? 900 : 0);
  });

  /* ------------------------------------------------------------------
     Wholesale gauge: ticks are built here; motion.js scrubs the needle
     ------------------------------------------------------------------ */
  const MAX_LB = 60;
  const ticks = $(".gauge__ticks");
  const NS = "http://www.w3.org/2000/svg";
  const polar = (lb, r) => { const a = Math.PI * (1 - lb / MAX_LB); return [200 + r * Math.cos(a), 210 - r * Math.sin(a)]; };
  for (let lb = 0; lb <= MAX_LB; lb += 4) {
    const key = lb === 20 || lb === 44;
    const g = document.createElementNS(NS, "g");
    if (key) g.setAttribute("class", "is-key");
    const [x1, y1] = polar(lb, 150), [x2, y2] = polar(lb, key ? 128 : 140);
    g.innerHTML = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>` + (key ? `<text x="${polar(lb, 108)[0]}" y="${polar(lb, 108)[1] + 4}">${lb}</text>` : "");
    ticks.appendChild(g);
  }
  const lbEl = $(".gauge__lb");
  const tierCards = $$(".tier");
  const tierPills = $$(".gauge__tier span");
  window.RP = window.RP || {};
  window.RP.setGauge = (lb) => {
    const t = lb >= 44 ? "case" : lb >= 20 ? "flat" : "pick";
    $(".gauge__needle").style.transform = `rotate(${-90 + (180 * lb) / MAX_LB}deg)`;
    $(".gauge__fill").style.strokeDashoffset = 1 - lb / MAX_LB;
    lbEl.textContent = Math.round(lb);
    tierCards.forEach((c) => c.classList.toggle("is-active", c.dataset.tier === t));
    tierPills.forEach((p) => p.classList.toggle("is-on", p.dataset.t === t));
  };
  window.RP.setGauge(44); // static, informative state until (or unless) motion takes over

  /* ------------------------------------------------------------------
     Inquiry form → validated mailto
     ------------------------------------------------------------------ */
  const form = $("#inquiry-form");
  const status = $("#form-status");
  const fieldError = (input, msg) => {
    const tf = input.closest(".tf");
    tf.classList.toggle("is-error", !!msg);
    input.setAttribute("aria-invalid", !!msg);
    $(".tf__err", tf).textContent = msg || "";
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = form.elements.name, email = form.elements.email;
    const nameErr = name.value.trim() ? "" : "Please add your name.";
    const emailErr = email.value.trim() && email.checkValidity() ? "" : "Please add a valid email address.";
    fieldError(name, nameErr);
    fieldError(email, emailErr);
    if (nameErr || emailErr) {
      status.classList.add("is-error");
      status.textContent = "Two quick details are missing above.";
      (nameErr ? name : email).focus();
      return;
    }
    const d = new FormData(form);
    const body = [
      `Name: ${d.get("name")}`,
      `Business: ${d.get("business") || "-"}`,
      `Email: ${d.get("email")}`,
      `Type: ${d.get("type")}`,
      `Stones: ${d.getAll("stones").join(", ") || "-"}`,
      `Volume: ${d.get("volume")}`,
      `Delivery: ${d.get("delivery")}`,
      "",
      d.get("message") || "",
    ].join("\n");
    location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Wholesale inquiry — " + (d.get("business") || d.get("name")))}&body=${encodeURIComponent(body)}`;
    status.classList.remove("is-error");
    status.textContent = "Your email app is opening with the details filled in. Thank you!";
  });
  ["name", "email"].forEach((n) => form.elements[n].addEventListener("input", (e) => e.target.closest(".tf").classList.contains("is-error") && fieldError(e.target, "")));

  $("#year").textContent = new Date().getFullYear();
})();
