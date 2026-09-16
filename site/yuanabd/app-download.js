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
  function open() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.documentElement.style.overflow = "hidden";
    var closeBtn = modal.querySelector("[data-dl-close]");
    if (closeBtn) closeBtn.focus();
    loadVersion(); // 兜底：若页面加载时拉取失败，打开弹窗时再试一次
  }

  function close() {
    modal.hidden = true;
    document.documentElement.style.overflow = "";
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
    if (e.key === "Escape" && !modal.hidden) close();
  });

  /* ---------- 版本号动态读取 ---------- */
  // 只填充「甜途」的版本位，不碰同站另一产品「苦旅 KULV」的版本号。
  var versionEls = document.querySelectorAll("[data-app-version]");
  var versionUpperEls = document.querySelectorAll("[data-app-version-upper]");
  var versionLoaded = false;

  function applyVersion(v) {
    var i;
    for (i = 0; i < versionEls.length; i++) versionEls[i].textContent = "v" + v;
    for (i = 0; i < versionUpperEls.length; i++) versionUpperEls[i].textContent = "V" + v;
  }

  function loadVersion() {
    if (versionLoaded || (!versionEls.length && !versionUpperEls.length)) return;
    fetch("/api/version", { headers: { Accept: "application/json" }, credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("bad status");
        return r.json();
      })
      .then(function (m) {
        if (m && m.version) {
          versionLoaded = true;
          applyVersion(m.version);
        }
      })
      .catch(function () {
        /* 失败保留 HTML 中的静态回退值，不打扰用户 */
      });
  }

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
