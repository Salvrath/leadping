(() => {
  const token = document.documentElement.dataset.salesToken || "";
  const emailRecipientToken = document.documentElement.dataset.emailRecipientToken || "";
  const userNavigation = document.documentElement.dataset.userNavigation === "true";
  const destination = "/#ansok";
  let completed = false;

  const leave = () => window.location.replace(destination);
  const confirm = async (method) => {
    if (completed || document.visibilityState !== "visible" || navigator.webdriver) return;
    completed = true;
    try {
      await fetch("/api/sales/track-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, method, emailRecipientToken: emailRecipientToken || undefined }),
        credentials: "same-origin",
        keepalive: true,
      });
    } finally {
      leave();
    }
  };
  const onInteraction = (event) => {
    if (event.isTrusted) void confirm("interaction");
  };

  window.addEventListener("pointerdown", onInteraction, { once: true, passive: true });
  window.addEventListener("touchstart", onInteraction, { once: true, passive: true });
  window.addEventListener("keydown", onInteraction, { once: true });

  window.setTimeout(() => {
    if (userNavigation && document.hasFocus()) void confirm("visible_delay");
  }, 1800);
  window.setTimeout(() => {
    if (!completed) leave();
  }, 5000);
})();