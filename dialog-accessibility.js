let activeDialog = null;
let returnFocus = null;

function isVisible(dialog) {
  return !dialog.closest("[hidden]") && dialog.getClientRects().length > 0;
}

function focusable(dialog) {
  return [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.closest("[hidden]") && element.getClientRects().length > 0);
}

function syncDialogFocus() {
  const nextDialog = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].find(isVisible) || null;
  if (nextDialog === activeDialog) return;

  if (!nextDialog) {
    const target = returnFocus;
    activeDialog = null;
    returnFocus = null;
    if (target?.isConnected) target.focus({ preventScroll:true });
    return;
  }

  if (!activeDialog) returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  activeDialog = nextDialog;
  const preferred = nextDialog.dataset.initialFocus ? nextDialog.querySelector(nextDialog.dataset.initialFocus) : null;
  const target = preferred || focusable(nextDialog)[0] || nextDialog;
  if (!nextDialog.hasAttribute("tabindex")) nextDialog.tabIndex = -1;
  queueMicrotask(() => target.focus({ preventScroll:true }));
}

document.addEventListener("keydown", (event) => {
  if (!activeDialog || !isVisible(activeDialog)) return;

  if (event.key === "Escape") {
    const close = activeDialog.querySelector('[aria-label="Close"], .auth-close, .log-close, .edit-close, .substitution-close');
    if (close && !close.disabled) {
      event.preventDefault();
      close.click();
    }
    return;
  }

  if (event.key !== "Tab") return;
  const controls = focusable(activeDialog);
  if (!controls.length) {
    event.preventDefault();
    activeDialog.focus();
    return;
  }
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

new MutationObserver(syncDialogFocus).observe(document.body, {
  attributes:true,
  attributeFilter:["hidden"],
  childList:true,
  subtree:true,
});
syncDialogFocus();
