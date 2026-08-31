const NAV = [
  ["index.html", "Home"],
  ["latest-news.html", "News"],
  ["current-affairs.html", "Affairs"],
  ["politics.html", "Politics"],
  ["sports.html", "Sports"],
  ["history.html", "History"],
  ["about.html", "About"]
];

function currentPage() {
  const p = location.pathname.split("/").pop() || "index.html";
  return p === "" ? "index.html" : p;
}

function renderChrome() {
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
            <div>Pakistan Atlas<small>Every province · every district</small></div>
          </a>
          <button class="menu-btn" id="menuBtn" aria-label="Menu">☰</button>
          <nav id="mainNav">
            <ul>
              ${NAV.map(([href, label]) =>
                `<li><a class="${page === href ? "active" : ""}" href="${href}">${label}</a></li>`
              ).join("")}
            </ul>
          </nav>
        </div>
      </header>`;
    const btn = document.getElementById("menuBtn");
    const nav = document.getElementById("mainNav");
    if (btn && nav) btn.onclick = () => nav.classList.toggle("open");
  }
  if (footer) {
    footer.innerHTML = `
      <footer>
        <div class="container foot-grid">
          <div>
            <strong>Pakistan Atlas</strong>
            <p style="margin-top:.6rem">A student-friendly knowledge site on Pakistan’s provinces, districts, culture, schools and hospitals. Figures are compiled from public sources and should be checked against Pakistan Bureau of Statistics and official departments.</p>
          </div>
          <div>
            <strong>Explore</strong>
            <p><a href="provinces.html">Provinces</a><br><a href="districts.html">Districts</a><br><a href="culture.html">Culture</a><br><a href="news.html">Updates</a></p>
          </div>
          <div>
            <strong>Trust</strong>
            <p><a href="about.html">About</a><br><a href="contact.html">Contact</a><br><a href="privacy.html">Privacy</a><br><a href="disclaimer.html">Disclaimer</a></p>
          </div>
          <div>
            <strong>For publishers</strong>
            <p>Replace the dashed ad boxes with your AdSense unit after approval. Keep original articles coming so the site stays useful.</p>
          </div>
        </div>
        <div class="container foot-bottom">
          <span>© ${new Date().getFullYear()} Pakistan Atlas · Built for young readers</span>
          <span><a href="terms.html">Terms</a></span>
        </div>
      </footer>`;
  }
}

async function loadData() {
  const res = await fetch("data/provinces.json");
  return res.json();
}

function fmt(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-PK");
}

document.addEventListener("DOMContentLoaded", renderChrome);
