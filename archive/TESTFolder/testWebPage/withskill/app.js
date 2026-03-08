const header = document.querySelector(".site-header");
const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelectorAll(".site-nav a");
const revealTargets = document.querySelectorAll("[data-reveal]");
const statValues = document.querySelectorAll(".stat-value[data-target]");
const form = document.getElementById("contactForm");
const formFeedback = document.getElementById("formFeedback");
const yearElement = document.getElementById("currentYear");
const sections = Array.from(document.querySelectorAll("main section[id]"));

if (yearElement) {
  yearElement.textContent = String(new Date().getFullYear());
}

if (menuToggle && header) {
  menuToggle.addEventListener("click", () => {
    const isOpen = header.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      header.classList.remove("is-open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.2, rootMargin: "0px 0px -10% 0px" }
  );

  revealTargets.forEach((target) => revealObserver.observe(target));
} else {
  revealTargets.forEach((target) => target.classList.add("is-visible"));
}

const animateValue = (element, target) => {
  const duration = 1100;
  const start = performance.now();

  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = String(Math.floor(target * eased));
    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  };

  requestAnimationFrame(tick);
};

if ("IntersectionObserver" in window) {
  const statObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const target = Number(entry.target.getAttribute("data-target"));
        if (Number.isFinite(target)) animateValue(entry.target, target);
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.5 }
  );

  statValues.forEach((item) => statObserver.observe(item));
} else {
  statValues.forEach((item) => {
    const target = Number(item.getAttribute("data-target"));
    if (Number.isFinite(target)) item.textContent = String(target);
  });
}

const updateActiveNav = () => {
  const focusLine = window.scrollY + 180;
  let currentId = "";

  sections.forEach((section) => {
    if (focusLine >= section.offsetTop) currentId = section.id;
  });

  navLinks.forEach((link) => {
    const isActive = link.getAttribute("href") === `#${currentId}`;
    link.classList.toggle("is-active", isActive);
  });
};

window.addEventListener("scroll", updateActiveNav, { passive: true });
updateActiveNav();

if (form && formFeedback) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const company = String(formData.get("company") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const budget = String(formData.get("budget") || "").trim();
    const message = String(formData.get("message") || "").trim();
    const privacy = formData.get("privacy");

    if (!name || !company || !email || !budget || !message || !privacy) {
      formFeedback.textContent = "未入力の項目があります。すべて入力してください。";
      formFeedback.style.color = "#ff9f9f";
      return;
    }

    if (!emailPattern.test(email)) {
      formFeedback.textContent = "メールアドレスの形式を確認してください。";
      formFeedback.style.color = "#ff9f9f";
      return;
    }

    if (message.length < 25) {
      formFeedback.textContent = "ご相談内容は25文字以上で入力してください。";
      formFeedback.style.color = "#ffd58a";
      return;
    }

    formFeedback.textContent =
      "お問い合わせを受け付けました。1営業日以内に担当よりご連絡します。";
    formFeedback.style.color = "#9ef0e5";
    form.reset();
  });
}
