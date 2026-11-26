// Keyboard and mouse controls for Kestrel Run.
// Arrow keys / WASD pitch and roll, Shift/Ctrl or +/- throttle, C camera,
// Space cargo drop (and brake on the ground), M mission menu, R restart,
// P pause. Mouse steering: move the mouse and the plane banks toward it.

export function newInput() {
  return {
    keys: new Set(),
    mouseX: 0.5, mouseY: 0.5,      // normalised 0..1
    mouseActive: false,            // true once the mouse has moved
    mouseAge: 99,                  // seconds since last mouse move
    clicked: false,                // true on the frame a click happened
    dropQueued: false,             // SPACE pressed this frame
    pressed: new Set(),            // keys pressed this frame (edge)
  };
}

export function attachInput(input, canvas) {
  const down = (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (!e.repeat) {
      input.pressed.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      if (e.key === ' ') input.dropQueued = true;
    }
    input.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  };
  const up = (e) => {
    input.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', () => input.keys.clear());
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouseX = (e.clientX - r.left) / r.width;
    input.mouseY = (e.clientY - r.top) / r.height;
    input.mouseActive = true;
    input.mouseAge = 0;
  });
  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    input.clicked = true;
    input.mouseActive = true;
    input.mouseAge = 0;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function endFrame(input, dt) {
  input.pressed.clear();
  input.clicked = false;
  input.dropQueued = false;
  input.mouseAge += dt;
  if (input.mouseAge > 6) input.mouseActive = false;
}

// Read the current control intent from the input state.
// Returns { pitch, roll, throttleDelta, brake }.
export function readControls(input, plane, dt) {
  const k = input.keys;
  let pitch = 0;
  let roll = 0;
  if (k.has('ArrowUp') || k.has('w')) pitch -= 1;   // nose down (stick forward)
  if (k.has('ArrowDown') || k.has('s')) pitch += 1;  // nose up
  if (k.has('ArrowLeft') || k.has('a')) roll -= 1;
  if (k.has('ArrowRight') || k.has('d')) roll += 1;
  // Mouse steering blends in when the mouse is the last thing moved.
  if (input.mouseActive) {
    const mx = (input.mouseX - 0.5) * 2;
    const my = (input.mouseY - 0.5) * 2;
    roll += mx * 1.4;
    pitch += my * 0.9;
  }
  let throttleDelta = 0;
  if (k.has('Shift')) throttleDelta += 0.55 * dt;
  if (k.has('Control')) throttleDelta -= 0.55 * dt;
  if (k.has('+') || k.has('=')) throttleDelta += 0.55 * dt;
  if (k.has('-') || k.has('_')) throttleDelta -= 0.55 * dt;
  const brake = k.has(' ') && plane.landed;
  return {
    pitch: Math.max(-1, Math.min(1, pitch)),
    roll: Math.max(-1, Math.min(1, roll)),
    throttle: Math.max(0, Math.min(1, plane.throttle + throttleDelta)),
    brake,
  };
}

export function wasPressed(input, ...names) {
  return names.some((n) => input.pressed.has(n));
}
