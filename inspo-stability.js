(() => {
  'use strict';

  const NativeMutationObserver = window.MutationObserver;
  if (!NativeMutationObserver) return;

  window.MutationObserver = class MutationObserver extends NativeMutationObserver {
    observe(target, options = {}) {
      if (target?.id === 'inspo-scroll' && options.childList && options.subtree) {
        return super.observe(target, { ...options, subtree:false });
      }
      return super.observe(target, options);
    }
  };
})();
