const NAV = [
  ["index.html", "Home"],
  ["culture.html", "Culture"],
  ["literature.html", "Literature"],
  ["geography.html", "Geography"],
  ["sports.html", "Sports"],
  ["history.html", "History"],
  ["showbiz.html", "Showbiz"],
  ["about.html", "About"]
];

const SITE = "https://mybook.pk";

function currentPage() {
  const p = location.pathname.split("/").pop() || "index.html";
  return p === "" ? "index.html" : p;
}

function enhanceHead() {
  const head = document.head;
  if (!document.querySelector('link[rel="icon"]')) {
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.type = "image/svg+xml";
    icon.href = "favicon.svg";
    head.appendChild(icon);
  }
  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const apple = document.createElement("link");
    apple.rel = "apple-touch-icon";
    apple.href = "favicon.svg";
    head.appendChild(apple);
  }
  if (!document.querySelector('meta[name="theme-color"]')) {
    const theme = document.createElement("meta");
    theme.name = "theme-color";
    theme.content = "#01411c";
    head.appendChild(theme);
  }
  if (!document.querySelector('meta[name="viewport"]')) {
    const vp = document.createElement("meta");
    vp.name = "viewport";
    vp.content = "width=device-width, initial-scale=1, viewport-fit=cover";
    head.appendChild(vp);
  } else {
    const vp = document.querySelector('meta[name="viewport"]');
    if (vp && !/viewport-fit/.test(vp.content || "")) {
      vp.content = "width=device-width, initial-scale=1, viewport-fit=cover";
    }
  }
  if (!document.querySelector('script[data-site-schema]') && !document.querySelector('script[type="application/ld+json"]')) {
    const schema = document.createElement("script");
    schema.type = "application/ld+json";
    schema.setAttribute("data-site-schema", "1");
    schema.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "MyBook.Pk",
      url: SITE + "/",
      inLanguage: ["en", "ur"],
      potentialAction: {
        "@type": "SearchAction",
        target: SITE + "/districts.html?q={search_term_string}",
        "query-input": "required name=search_term_string"
      }
    });
    head.appendChild(schema);
  }
}

function addSkipAndMain() {
  if (!document.querySelector(".skip-link")) {
    const a = document.createElement("a");
    a.className = "skip-link";
    a.href = "#main-content";
    a.textContent = "Skip to content";
    document.body.prepend(a);
  }
  if (!document.getElementById("main-content")) {
    const target = document.querySelector(".atlas-hero, .page-hero, .archive-hero, main, section");
    if (target && !target.id) target.id = "main-content";
  }
}

function setupMenu(btn, nav) {
  const setOpen = (open) => {
    nav.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  btn.setAttribute("aria-controls", "mainNav");
  btn.setAttribute("aria-expanded", "false");
  btn.onclick = () => setOpen(!nav.classList.contains("open"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
  document.addEventListener("click", (e) => {
    if (!nav.classList.contains("open")) return;
    if (nav.contains(e.target) || btn.contains(e.target)) return;
    setOpen(false);
  });
}

function setupBackToTop() {
  if (document.querySelector(".back-to-top")) return;
  const btn = document.createElement("button");
  btn.className = "back-to-top";
  btn.type = "button";
  btn.setAttribute("aria-label", "Back to top");
  btn.textContent = "↑";
  btn.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
  document.body.appendChild(btn);
  const onScroll = () => btn.classList.toggle("show", window.scrollY > 480);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function lazyImages() {
  document.querySelectorAll("img:not([loading]):not([fetchpriority])").forEach((img, i) => {
    if (i === 0) return;
    img.loading = "lazy";
    img.decoding = "async";
  });
}

function setupShowbizImages() {
  const image = "/images/humsafar-header.jpg?v=2";

  // Homepage Showbiz archive card: replace the decorative emblem
  // with the real Humsafar image already stored in /images.
  document.querySelectorAll(".atlas-archive-visual.showbiz").forEach((card) => {
    card.style.backgroundImage = `url("${image}")`;
    card.style.backgroundSize = "cover";
    card.style.backgroundPosition = "center";
    card.style.backgroundRepeat = "no-repeat";

    const emblem = card.querySelector(".showbiz-emblem");
    if (emblem) emblem.style.display = "none";
  });

  // Showbiz page hero: use an absolute root path so the image works
  // consistently regardless of the page URL.
  document.querySelectorAll(".sb-hero-bg").forEach((img) => {
    img.src = image;
  });
}

function renderChrome() {
  enhanceHead();
  addSkipAndMain();
  const header = document.getElementById("site-header");
  const footer = document.getElementById("site-footer");
  const page = currentPage();
  if (header) {
    header.innerHTML = `
      <div class="topbar">
        <div class="container">
          <span>پاکستان کے ہر کونے کی مستند معلومات</span>
          <span>Census baseline: PBS 2023 · Educational project</span>
        </div>
      </div>
      <header class="site">
        <div class="container nav-wrap">
          <a class="logo" href="index.html">
            <div class="logo-mark">★</div>
            <div>MyBook.Pk<small>Every province · every district</small></div>
          </a>
          <button class="menu-btn" id="menuBtn" aria-label="Open menu">☰</button>
          <nav id="mainNav" aria-label="Main">
            <ul>
              ${NAV.map(([href, label]) =>
                `<li><a class="${page === href ? "active" : ""}" href="${href}">${label}</a></li>`
              ).join("")}
              <li><a class="nav-search" href="districts.html" aria-label="Search districts"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16.2 16.2 L20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></a></li>
            </ul>
          </nav>
        </div>
      </header>`;
    const btn = document.getElementById("menuBtn");
    const nav = document.getElementById("mainNav");
    if (btn && nav) setupMenu(btn, nav);
  }
  if (footer) {
    footer.innerHTML = `
      <footer>
        <div class="container foot-grid">
          <div>
            <strong>MyBook.Pk</strong>
            <p>A student-friendly guide to Pakistan’s provinces, districts, culture, literature, geography, sports and history. Figures follow public sources and should be checked against the Pakistan Bureau of Statistics.</p>
          </div>
          <div>
            <strong>Explore</strong>
            <p><a href="provinces.html">Provinces</a><br><a href="districts.html">Districts</a><br><a href="culture.html">Culture</a><br><a href="literature.html">Literature</a><br><a href="geography.html">Geography</a></p>
          </div>
          <div>
            <strong>Learn</strong>
            <p><a href="sports.html">Sports</a><br><a href="history.html">History</a><br><a href="showbiz.html">Showbiz</a><br><a href="about.html">About</a><br><a href="contact.html">Contact</a></p>
          </div>
          <div>
            <strong>Trust</strong>
            <p><a href="privacy.html">Privacy</a><br><a href="disclaimer.html">Disclaimer</a><br><a href="terms.html">Terms</a><br><a href="sitemap.xml">Sitemap</a></p>
          </div>
        </div>
        <div class="container foot-bottom">
          <span>© ${new Date().getFullYear()} MyBook.Pk · Built for young readers</span>
          <span><a href="index.html">Home</a></span>
        </div>
      </footer>`;
  }
  setupBackToTop();
  lazyImages();
  setupShowbizImages();
}

async function loadData() {
  const res = await fetch("data/provinces.json");
  return res.json();
}

async function loadDistricts() {
  const res = await fetch("data/districts.json");
  return res.json();
}

function fmt(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-PK");
}

document.addEventListener("DOMContentLoaded", renderChrome);
