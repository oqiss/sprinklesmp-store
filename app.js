// SprinkleSMP store: renders the packages, asks for a Minecraft username, then sends the buyer to
// Tebex checkout via the Headless API (basket -> add package -> checkout link).
(() => {
  const CFG = window.STORE_CONFIG || {};
  const API = "https://headless.tebex.io/api";

  // Package ids/prices mirror the Tebex creator panel. If you change a price there, change it here too.
  const RANKS = [
    { id: 7828879, name: "FROSTED", color: "#C9A7FF", price: "4.99",
      stats: [["Homes", "3"], ["/fly at spawn", "✓"], ["/hide", "✓"], ["/kit", "✗"],
              ["/ec /craft /anvil /trash", "✗"], ["1 sprinkle / minute", "✗"]] },
    { id: 7828881, name: "GLAZED", color: "#7FD8FF", price: "9.99",
      stats: [["Homes", "5"], ["/fly at spawn", "✓"], ["/hide", "✓"], ["/kit", "Diamond PvP"],
              ["/ec /craft /anvil /trash", "✓"], ["1 sprinkle / minute", "✓"]] },
    { id: 7828883, name: "SPRINKLE", color: "#FFC857", price: "14.99",
      stats: [["Homes", "7"], ["/fly at spawn", "✓"], ["/hide", "✓"], ["/kit", "Netherite PvP"],
              ["/ec /craft /anvil /trash", "✓"], ["1 sprinkle / minute", "✓"]] },
  ];
  const KEYS = [
    { id: 7829857, crate: "prime", name: "Prime Key", color: "#7FD8FF", price: "1.99", note: "Choose 1 reward" },
    { id: 7829859, crate: "crimson", name: "Crimson Key", color: "#FF4D6D", price: "2.99", note: "Choose 1 reward" },
    { id: 7829850, crate: "spawner", name: "Spawner Key", color: "#FFC857", price: "7.99", note: "Choose 5 of any spawner", best: true },
  ];

  const $ = (s) => document.querySelector(s);
  const fmt = (n) => n.toLocaleString("en-US");
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  // ---------- render ----------
  const ranks = $("#ranks");
  for (const r of RANKS) {
    const card = el("article", "card rank");
    card.append(el("h3", "rank__name", `<span style="color:${r.color}">${r.name.charAt(0)}${r.name.slice(1).toLowerCase()}</span>`));
    const ul = el("ul", "rank__stats");
    for (const [k, v] of r.stats) ul.append(el("li", v === "✗" ? "is-off" : "", `<span>${k}</span><b>${v}</b>`));
    card.append(ul);
    const btn = el("button", "price", `<span class="price__amt">$${r.price}</span><span class="price__cur">USD</span><span class="price__per">/ month</span>`);
    btn.type = "button";
    btn.addEventListener("click", () => pick({ id: r.id, label: `${r.name} rank ($${r.price}/month)` }));
    card.append(btn);
    ranks.append(card);
  }

  const keys = $("#keys");
  for (const k of KEYS) {
    const card = el("article", "card shard key" + (k.best ? " key--best" : ""));
    card.style.setProperty("--key", k.color);
    card.append(el("div", "shard__badge" + (k.best ? "" : " is-empty"), k.best ? "SPAWNERS" : "&nbsp;"));
    card.append(el("div", "shard__img key__img", `<img src="key_${k.crate}.png" alt="">`));
    card.append(el("div", "shard__amount key__name", k.name));
    card.append(el("div", "key__note", k.note));
    const btn = el("button", "price", `<span class="price__amt">$${k.price}</span><span class="price__cur">USD</span>`);
    btn.type = "button";
    btn.addEventListener("click", () => pick({ id: k.id, label: `${k.name} ($${k.price})` }));
    card.append(btn);
    keys.append(card);
  }

  // ---------- copy server address ----------
  const ip = $(".hero__ip");
  ip.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(ip.dataset.copy); } catch (_) {}
    ip.classList.add("copied");
    setTimeout(() => ip.classList.remove("copied"), 1500);
  });

  // ---------- thank-you after checkout ----------
  const params = new URLSearchParams(location.search);
  if (params.has("thanks")) {
    const n = $("#notice");
    n.textContent = "Thanks for supporting SprinkleSMP! Your purchase is delivered automatically in-game (crate keys arrive next time you're online).";
    n.hidden = false;
    history.replaceState(null, "", location.pathname);
  }

  // ---------- username step ----------
  let chosen = null;
  let edition = "java";
  const store = $("#store"), login = $("#login"), err = $("#login-err"), input = $("#username"), go = $("#continue");

  try { const saved = JSON.parse(localStorage.getItem("sprinkle-user") || "null"); if (saved) { input.value = saved.name || ""; setEdition(saved.edition || "java"); } } catch (_) {}

  function setEdition(e) {
    edition = e;
    document.querySelectorAll(".ed").forEach((b) => b.classList.toggle("is-active", b.dataset.edition === e));
  }
  document.querySelectorAll(".ed").forEach((b) => b.addEventListener("click", () => setEdition(b.dataset.edition)));

  function pick(pkg) {
    chosen = pkg;
    $("#login-for").textContent = `Buying: ${pkg.label}`;
    err.hidden = true;
    store.hidden = true; login.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => input.focus(), 50);
  }
  $("#login-back").addEventListener("click", () => { login.hidden = true; store.hidden = false; });

  $("#login-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const raw = input.value.trim();
    const java = /^[A-Za-z0-9_]{3,16}$/;
    if (edition === "java" && !java.test(raw)) return fail("Java usernames are 3-16 letters, numbers or underscores.");
    if (edition === "bedrock" && !/^[A-Za-z0-9_ ]{1,16}$/.test(raw.replace(/^\./, ""))) return fail("That doesn't look like a Bedrock gamertag.");
    // Geyser players have a "." in front of their name on the server
    const username = edition === "bedrock" ? "." + raw.replace(/^\./, "").replace(/ /g, "_") : raw;
    try { localStorage.setItem("sprinkle-user", JSON.stringify({ name: raw, edition })); } catch (_) {}

    if (!CFG.TEBEX_PUBLIC_TOKEN) { location.href = CFG.TEBEX_STORE_URL; return; }

    go.disabled = true; err.hidden = true;
    try {
      const base = location.origin + location.pathname;
      const b = await call(`${API}/accounts/${CFG.TEBEX_PUBLIC_TOKEN}/baskets`, {
        username, complete_url: base + "?thanks=1", cancel_url: base, complete_auto_redirect: true,
      });
      const basket = b.data;
      const added = await call(`${API}/baskets/${basket.ident}/packages`, { package_id: chosen.id, quantity: 1 });
      const link = (added.data && added.data.links && added.data.links.checkout) || basket.links.checkout;
      location.href = link;
    } catch (e) {
      fail(e.message || "Something went wrong. Please try again in a moment.");
      go.disabled = false;
    }
  });

  async function call(url, body) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
    let data = null; try { data = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error((data && (data.detail || data.message || data.title)) || `Tebex error (${res.status}). Please try again.`);
    return data;
  }
  function fail(msg) { err.textContent = msg; err.hidden = false; }
})();
