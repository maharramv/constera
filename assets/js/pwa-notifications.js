(function initPwaNotifications() {
  const button = document.querySelector("[data-push-toggle]");
  const status = document.querySelector("[data-push-status]");
  const api = window.ConstEraAPI;
  if (!button || !status || !api?.pushSettings) return;

  let subscription = null;
  let publicKey = "";

  const setStatus = (message, type = "") => {
    status.textContent = message;
    if (type) status.dataset.type = type;
    else delete status.dataset.type;
  };

  const decodeKey = (value) => {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const source = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(source), (character) => character.charCodeAt(0));
  };

  const paint = () => {
    button.disabled = false;
    button.textContent = subscription ? "Bildirişi söndür" : "Bildirişi aktiv et";
    setStatus(
      subscription
        ? "Bu cihazda sifariş, sorğu və hesab yenilikləri üçün bildiriş aktivdir."
        : "Bu cihazda brauzer bildirişi aktiv deyil.",
      subscription ? "success" : ""
    );
  };

  const load = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus("Bu brauzer push bildirişlərini dəstəkləmir.", "error");
      return;
    }
    const session = await api.session();
    if (!session.user) throw new Error("Bildirişləri aktiv etmək üçün hesaba daxil ol.");
    const [settings, registration] = await Promise.all([
      api.pushSettings(),
      navigator.serviceWorker.ready
    ]);
    if (!settings.data?.ready || !settings.data.publicKey) {
      throw new Error("Brauzer bildirişləri serverdə hələ aktivləşdirilməyib.");
    }
    publicKey = settings.data.publicKey;
    subscription = await registration.pushManager.getSubscription();
    paint();
  };

  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const registration = await navigator.serviceWorker.ready;
      if (subscription) {
        const endpoint = subscription.endpoint;
        await api.unsubscribePush(endpoint);
        await subscription.unsubscribe();
        subscription = null;
        paint();
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Brauzer bildiriş icazəsi verilmədi.");
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(publicKey)
      });
      await api.subscribePush(subscription.toJSON());
      paint();
    } catch (error) {
      setStatus(error.message, "error");
      button.disabled = false;
    }
  });

  load().catch((error) => {
    setStatus(error.message, "error");
    button.disabled = true;
  });
})();
