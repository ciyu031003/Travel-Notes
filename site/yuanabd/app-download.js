/* ============================================================================
   甜途 App「扫码下载」弹窗 + 主站版本号动态读取
   部署目标：/var/www/yuanabd/js/app-download.js
   
   行为契约：
   · 桌面（≥768px）点击下载按钮 → 留在本页弹出二维码弹窗
   · 移动端 → 不弹窗，直接走 <a href> 回退（应用下载页，含直装与原生识别）
     —— 理由：手机上扫自己屏幕上的二维码没有意义
   · 无 JS → <a href> 回退同样可用（渐进增强）
   · 版本号：页面加载即从同源 /api/version 拉取，填充所有 [data-app-version]
     （nginx 在 www.yuanabd.cn 上做了 /api/version 同源代理，故无跨域问题）
   · 版本 chip 带加载态「检查更新中…」，而不是先闪一个写死的旧版本号；
     主站 index.html 通常被禁用缓存，不必要为每次发版去改它。
   ============================================================================ */
(function () {
  "use strict";

  var modal = document.getElementById("dlModal");
  var trigger = document.querySelector("[data-app-download]");
  if (!modal || !trigger) return;

  var lastFocus = null;
  var isDesktop = function () {
    return window.matchMedia("(min-width: 768px)").matches;
  };

  /* ---------- 弹窗开关 ---------- */
  // 主站 body 在滚动时会挂 .is-locked（overflow:hidden），弹窗打开/关闭要成对处理，
  // 否则关掉弹窗后页面滚不动（或反之把主站的滚动锁提前解掉）。
  var hadBodyLock = false;
  var SEL_FOCUSABLE = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';

  function open() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    hadBodyLock = document.body.classList.contains("is-locked");
    if (!hadBodyLock) document.body.classList.add("is-locked");
    document.documentElement.style.overflow = "hidden";
    var closeBtn = modal.querySelector(".dl-modal__close") || modal.querySelector("[data-dl-close]");
    if (closeBtn) closeBtn.focus();
    loadVersion(); // 兜底：若页面加载时拉取失败，打开弹窗时再试一次
  }

  function close() {
    modal.hidden = true;
    document.documentElement.style.overflow = "";
    if (!hadBodyLock) document.body.classList.remove("is-locked");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  trigger.addEventListener("click", function (e) {
    // 移动端交给默认行为（href 回退）
    if (!isDesktop()) return;
    e.preventDefault();
    open();
  });

  modal.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("[data-dl-close]")) close();
  });

  document.addEventListener("keydown", function (e) {
    if (modal.hidden) return;
    if (e.key === "Escape") {
      close();
      return;
    }
    // 焦点陷阱：弹窗是 aria-modal="true"，Tab 不应跑到底下的页面里
    if (e.key === "Tab") {
      var items = modal.querySelectorAll(SEL_FOCUSABLE);
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  /* ---------- 版本号动态读取 ---------- */
  // 只填充「甜途」的版本位，不碰同站另一产品「苦旅 KULV」的版本号。
  // 用静态 NodeList 快照：chip 的加载态会整体重写父节点 innerHTML，
  // 之后重新查询一次能拿到「重写后」的元素，避免引用已脱离文档的旧节点（曾导致版本号看似没更新）。
  var versionEls = [];
  var versionUpperEls = [];
  function refreshVersionEls() {
    versionEls = document.querySelectorAll("[data-app-version]");
    versionUpperEls = document.querySelectorAll("[data-app-version-upper]");
  }
  refreshVersionEls();
  var versionLoaded = false;
  var versionLoading = false;

  var versionActual = ""; // 远端版本号原文（例如 1.24.7）
  function applyVersion(v) {
    versionActual = v;
    for (var i = 0; i < versionEls.length; i++) versionEls[i].textContent = "v" + v;
    for (var i = 0; i < versionUpperEls.length; i++) versionUpperEls[i].textContent = "V" + v;
  }

  function applyChangelog(text) {
    var els = document.querySelectorAll("[data-app-changelog]");
    for (var i = 0; i < els.length; i++) {
      if (text) {
        els[i].textContent = text;
        els[i].hidden = false;
      } else {
        els[i].hidden = true;
      }
    }
  }

  function firstVersionText() {
    return versionEls.length ? versionEls[0].textContent : null;
  }

  function loadVersion() {
    if (versionLoaded || versionLoading) return;
    if (!versionEls.length && !versionUpperEls.length) return;
    versionLoading = true;
    fetch("/api/version", { headers: { Accept: "application/json" }, credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("bad status");
        return r.json();
      })
      .then(function (m) {
        if (m && m.version) {
          versionLoaded = true;
          applyVersion(m.version);
          applyChangelog(m.changelog);
        }
      })
      .catch(function () {
        /* 失败保留 HTML 中的静态回退值，不打扰用户 */
      })
      .then(function () {
        versionLoading = false;
        // 无论成功与否都要重新绑定：成功时 chip 已被重写，失败时要还原回退文案。
        restoreFallback();
      });
  }

  /**
   * 加载态：主站 chip 里写死的「v1.0.0 · LIVE」是回退文案，页面加载到 /api/version 返回
   * 之间会白闪一个旧版本号。这里在首个同步 tick 就把 chip 文字换成「检查更新中…」，
   * 拉取失败再还原回退文案（保证不会一直停在「检查更新中」）。
   * 只替换纯文字 chip；弹窗里带装饰性 chip 的不动。
   */
  var chipFallbacks = [];
  var i;
  for (i = 0; i < versionEls.length; i++) {
    var el0 = versionEls[i];
    var chip0 = el0.parentElement;
    var pure = chip0 && chip0.hasAttribute("data-app-version-chip") && chip0.children.length === 1;
    // chip 内版本号之后的文字后缀（例如「 · LIVE」），加载成功后要保留
    var suffix = "";
    if (pure) suffix = (chip0.textContent || "").replace(el0.textContent, "");
    chipFallbacks.push({
      el: el0,
      chip: pure ? chip0 : null,
      html: pure ? chip0.innerHTML : "",
      suffix: suffix,
    });
  }
  function setLoadingState() {
    for (var j = 0; j < chipFallbacks.length; j++) {
      var f = chipFallbacks[j];
      if (f.chip) f.chip.textContent = "检查更新中…";
    }
  }
  function restoreFallback() {
    for (var j = 0; j < chipFallbacks.length; j++) {
      var f = chipFallbacks[j];
      if (!f.chip) continue;
      if (versionLoaded) {
        // 加载成功：恢复静态结构（版本 span + 文字后缀），再把版本号填进去。
        // ⚠️ 用 innerHTML 还原而不是手工拼子节点：门户站的 .chip 是
        //    inline-flex + gap，直接放文本节点会被当成 flex item 而换行显示。
        f.chip.innerHTML = f.html;
        var span = f.chip.querySelector("[data-app-version]");
        if (span) span.textContent = "v" + currentVersionText();
      } else {
        // 加载失败：还原成 HTML 里的回退文案
        f.chip.innerHTML = f.html;
      }
    }
    refreshVersionEls();
  }

  function currentVersionText() {
    return versionActual || (versionEls.length ? (versionEls[0].textContent || "").replace(/^v/i, "") : "");
  }
  if (!versionLoaded) setLoadingState();

  // 页面加载即拉取（首屏 chip 也动态）
  loadVersion();

  /* ---------- 复制下载链接 ---------- */
  var copyBtn = modal.querySelector("[data-dl-copy]");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var url = copyBtn.getAttribute("data-copy") || "";
      var label = copyBtn.querySelector("span") || copyBtn;

      function done() {
        var old = label.textContent;
        label.textContent = "已复制 ✓";
        setTimeout(function () {
          label.textContent = old;
        }, 1800);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(function () {
          window.prompt("复制下载链接", url);
        });
      } else {
        window.prompt("复制下载链接", url);
      }
    });
  }
})();