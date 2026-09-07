(() => {
  const NativeObserver = window.MutationObserver;
  if (!NativeObserver) return;
  window.MutationObserver = class AuraMutationObserver extends NativeObserver {
    constructor(callback) {
      super((mutations, observer) => {
        const useful = mutations.filter(mutation => {
          const target = mutation.target;
          return !(target instanceof Element && target.closest('#personal-inspo-grid'));
        });
        if (useful.length) callback(useful, observer);
      });
    }
  };
})();
