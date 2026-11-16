// Keyboard and mouse, and the pointer lock that turns the mouse into look. Plain browser
// APIs only: the game asks the canvas for pointer lock and reads movementX/Y while it holds it.
// Extended: B buy menu, E interact (hold), M mute, right-click scope.
export function createInput(canvas, onLockChange, handlers = {}) {
  const keys = new Set();
  const state = {
    keys, locked: false, firing: false, scoping: false, interact: false, lookX: 0, lookY: 0,
  };
  const h = {
    onBuy: handlers.onBuy || (() => {}),
    onInteractDown: handlers.onInteractDown || (() => {}),
    onInteractUp: handlers.onInteractUp || (() => {}),
    onMute: handlers.onMute || (() => {}),
    onScopeDown: handlers.onScopeDown || (() => {}),
    onScopeUp: handlers.onScopeUp || (() => {}),
  };

  function setKey(event, down) {
    if (down) keys.add(event.code);
    else keys.delete(event.code);
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => {
    setKey(event, true);
    if (event.repeat) return;
    if (event.code === 'KeyB') h.onBuy();
    else if (event.code === 'KeyM') h.onMute();
    else if (event.code === 'KeyE') {
      state.interact = true;
      h.onInteractDown();
    }
  });
  window.addEventListener('keyup', (event) => {
    setKey(event, false);
    if (event.code === 'KeyE') {
      state.interact = false;
      h.onInteractUp();
    }
  });
  window.addEventListener('blur', () => {
    keys.clear();
    state.interact = false;
    state.scoping = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    else if (event.button === 2) {
      state.scoping = true;
      h.onScopeDown();
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    else if (event.button === 2) {
      state.scoping = false;
      h.onScopeUp();
    }
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
      state.scoping = false;
      state.interact = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
  };
}
