/* Rock Park — motion score. Runs only when GSAP loaded and motion is allowed. */
(() => {
  "use strict";

  const root = document.documentElement;
  const ok = window.gsap && window.ScrollTrigger && window.SplitText && window.CustomEase && root.classList.contains("motion");
  if (!ok) { root.classList.remove("motion"); return; }
  // window.__rpMotion is set only once every reveal is wired; until then the <head> failsafe can still unhide the page
  const bail = (err) => { console.warn("Motion setup failed, showing static page:", err); root.classList.remove("motion"); window.__rpMotion = true; };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase, ...(window.Flip ? [Flip] : []));

  // M3 easing tokens, same beziers as tokens.css
  CustomEase.create("md-emph", "M0,0 C0.2,0 0,1 1,1");
  CustomEase.create("md-emph-dec", "M0,0 C0.05,0.7 0.1,1 1,1");
  CustomEase.create("md-emph-acc", "M0,0 C0.3,0 0.8,0.15 1,1");
  gsap.defaults({ ease: "md-emph-dec", duration: 1 });

  const mm = gsap.matchMedia();
  // the pinned theatre needs room for head + 64vh plate; short laptop screens get the plain stack
  const DESKTOP = "(min-width: 901px) and (min-height: 720px)";

  /* ------------------------------------------------------------------
     Hero: line mask rise, then the supporting copy
     ------------------------------------------------------------------ */
  const title = $(".hero__title");
  // Hero starts at once; autoSplit re-splits the lines when the web font lands
  gsap.set(title, { visibility: "visible" });
  let heroIntro;
  SplitText.create(title, {
    type: "lines", mask: "lines", autoSplit: true,
    onSplit: (self) => {
      if (heroIntro) return gsap.set(self.lines, { yPercent: 0 }); // re-split after font swap: no replay
      heroIntro = gsap.from(self.lines, { yPercent: 110, duration: 1.3, stagger: 0.12, delay: 0.15 });
      return heroIntro;
    },
  });
  gsap.to("[data-hero]", { opacity: 1, y: 0, duration: 1.1, stagger: 0.09, delay: 0.55 });
  document.fonts.ready.then(() => {
    const chars = SplitText.create(".footer__big", { type: "chars", charsClass: "ch", aria: "none" });
    gsap.from(chars.chars, { yPercent: 100, opacity: 0, rotate: 6, stagger: 0.04, duration: 1.3, scrollTrigger: { trigger: ".footer", start: "top 80%" } });
    ScrollTrigger.refresh();
  });
  // Copy lifts away as the page scrolls
  gsap.to(".hero__content", { yPercent: -18, opacity: 0, ease: "none",
    scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.6 } });
  // The drawn stones turn slowly against each other as the hero scrolls away
  const heroScrub = { trigger: ".hero", start: "top top", end: "bottom top", scrub: 1 };
  gsap.to(".agate--a", { rotation: 14, yPercent: -10, ease: "none", scrollTrigger: heroScrub });
  gsap.to(".agate--b", { rotation: -12, yPercent: 12, ease: "none", scrollTrigger: heroScrub });

  // Everything below the hero is wired in idle time, keeping the first paint and input responsive
  const belowFold = () => { try {
    /* ------------------------------------------------------------------
       Reveals (batched, both directions so anchor jumps never strand content)
       ------------------------------------------------------------------ */
    const reveal = (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.1, stagger: 0.08, overwrite: true });
    ScrollTrigger.batch("[data-reveal]", { start: "top 90%", once: true, onEnter: reveal, onEnterBack: reveal });

    /* ------------------------------------------------------------------
       Specimen theatre — the one long pin, desktop only
       ------------------------------------------------------------------ */
    mm.add(DESKTOP, () => {
      const sec = $(".theatre");
      const specs = $$(".spec", sec);
      const dots = $$(".theatre__dots i", sec);
      sec.classList.add("is-staged");
      // six plates -> six faces of a hexagonal prism that turns 60deg per stone
      const stage = document.createElement("div");
      stage.className = "prism-stage";
      stage.setAttribute("aria-hidden", "true");
      const prism = document.createElement("div");
      prism.className = "prism";
      specs.forEach((spec, i) => {
        const face = document.createElement("figure");
        face.className = "prism__face";
        face.style.setProperty("--i", i);
        const pic = $(".spec__plate picture", spec).cloneNode(true);
        $("img", pic).loading = "eager";
        $("img", pic).alt = "";
        face.append(pic);
        prism.append(face);
      });
      stage.append(prism);
      $(".theatre__body", sec).append(stage);
      const glow = (i) => stage.style.setProperty("--glow", specs[i].style.getPropertyValue("--glow"));
      // pull the prism back by its apothem so the front face sits at z=0
      gsap.set(prism, { z: () => -prism.offsetWidth * 0.866, rotationY: 0 });
      gsap.set(specs.slice(1), { autoAlpha: 0 });
      dots[0].classList.add("is-on");
      glow(0);

      const tl = gsap.timeline({ defaults: { ease: "md-emph" } });
      specs.slice(1).forEach((spec, i) => {
        const prev = specs[i];
        const at = i * 1.2;
        tl.to(prism, { rotationY: -60 * (i + 1), duration: 1 }, at)
          .to($(".spec__text", prev), { y: -50, opacity: 0, duration: 0.4, ease: "md-emph-acc" }, at)
          .set(prev, { autoAlpha: 0 }, at + 1)
          .set(spec, { autoAlpha: 1 }, at)
          .from($$(".spec__text > *", spec), { y: 50, opacity: 0, stagger: 0.07, duration: 0.6 }, at + 0.45);
      });
      tl.to({}, { duration: 0.6 }); // hold the last stone before releasing the pin

      // dots and glow follow the (scrub-smoothed) timeline, so they stay in step with the copy
      let current = 0;
      tl.eventCallback("onUpdate", () => {
        const idx = Math.min(specs.length - 1, Math.round(tl.time() / 1.2));
        if (idx === current) return;
        current = idx;
        dots.forEach((d, i) => d.classList.toggle("is-on", i === idx));
        glow(idx);
      });
      ScrollTrigger.create({
        trigger: sec, start: "top top", end: () => "+=" + innerHeight * 5, pin: ".theatre__pin", scrub: 0.8, animation: tl,
        invalidateOnRefresh: true,
      });
      return () => { sec.classList.remove("is-staged"); stage.remove(); gsap.set([...specs, ...$$(".spec *", sec)], { clearProps: "all" }); };
    });
    // Mobile: plates rise and sharpen as they enter
    mm.add("(max-width: 900px), (max-height: 719px)", () => {
      $$(".spec__plate").forEach((p) => gsap.from(p, { scale: 0.86, opacity: 0, duration: 1.2,
        scrollTrigger: { trigger: p, start: "top 85%" } }));
    });

    /* ------------------------------------------------------------------
       Sand sheets slide up over the night
       ------------------------------------------------------------------ */
    $$(".sheet").forEach((s) => gsap.from(s, { y: 120, ease: "none",
      scrollTrigger: { trigger: s, start: "top bottom", end: "top 55%", scrub: 0.6 } }));

    /* ------------------------------------------------------------------
       Collection cards: stagger in by row
       ------------------------------------------------------------------ */
    ScrollTrigger.batch("#grid .card", { start: "top 92%", once: true,
      onEnter: (els) => gsap.from(els, { y: 60, opacity: 0, scale: 0.97, duration: 1, stagger: 0.08, clearProps: "transform,opacity" }) });

    /* ------------------------------------------------------------------
       The store: macro close-ups drift at their own speeds
       ------------------------------------------------------------------ */
    $$(".macro__item").forEach((m) => gsap.fromTo(m, { yPercent: -(+m.dataset.speed) }, { yPercent: +m.dataset.speed, ease: "none",
      scrollTrigger: { trigger: ".macro", start: "top bottom", end: "bottom top", scrub: true } }));
    ScrollTrigger.batch(".macro__item picture", { start: "top 92%", once: true,
      onEnter: (els) => gsap.from(els, { clipPath: "inset(100% 0% 0% 0% round 16px)", duration: 1.4, stagger: 0.12, ease: "md-emph" }) });

    /* ------------------------------------------------------------------
       Visit photo opens; footer wordmark rises letter by letter
       ------------------------------------------------------------------ */
    gsap.fromTo(".visit__clip", { clipPath: "inset(14% 0% 14% 18% round 28px)" }, { clipPath: "inset(0% 0% 0% 0% round 28px)", ease: "none",
      scrollTrigger: { trigger: ".visit", start: "top 85%", end: "top 25%", scrub: 0.8 } });
    gsap.fromTo(".visit__clip img", { scale: 1.25 }, { scale: 1, ease: "none", scrollTrigger: { trigger: ".visit", start: "top bottom", end: "bottom top", scrub: true } });

    /* ------------------------------------------------------------------
       Reading progress hairline
       ------------------------------------------------------------------ */
    gsap.to(".progress span", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });

    /* ------------------------------------------------------------------
       "View" pill follows the pointer over collection cards
       ------------------------------------------------------------------ */
    if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
      const cur = $(".cursor");
      root.classList.add("has-cursor");
      const x = gsap.quickTo(cur, "x", { duration: 0.45, ease: "power3" });
      const y = gsap.quickTo(cur, "y", { duration: 0.45, ease: "power3" });
      addEventListener("pointermove", (e) => { x(e.clientX); y(e.clientY); }, { passive: true });
      $$("#grid .card").forEach((c) => {
        c.addEventListener("pointerenter", () => cur.classList.add("is-on"));
        c.addEventListener("pointerleave", () => cur.classList.remove("is-on"));
      });
    }
    ScrollTrigger.refresh();
    window.__rpMotion = true;
  } catch (err) { bail(err); } };
  window.requestIdleCallback ? requestIdleCallback(belowFold, { timeout: 700 }) : setTimeout(belowFold, 200);

  addEventListener("load", () => ScrollTrigger.refresh());
})();
