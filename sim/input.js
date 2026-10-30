// Controls: keyboard, gamepad (analog triggers and stick, or a steering wheel through the Gamepad API) and touch buttons.
// Every frame read() gives {gas, brake, steer, handbrake, …} in 0–1 (steer −1 right … +1 left) and a list of key presses.
export const KEYS = {
  gas: ['arrowup', 'w'], brake: ['arrowdown', 's'], left: ['arrowleft', 'a'], right: ['arrowright', 'd'], handbrake: [' '],
  up: ['e'], down: ['q'], cam: ['c'], lights: ['l'], horn: ['h'], map: ['m', 'k'], pause: ['escape', 'p'], low: ['g'], reset: ['r'],
  enter: ['enter'], look: ['v'], indL: [','], indR: ['.'], hazard: ['-'], photo: ['f2'],
};
export class Input {
  constructor(el) {
    this.down = new Set(); this.presses = []; this.touch = {}; this.steerKb = 0; this.pad = null; this.padPrev = {}; this.wheel = false;
    addEventListener('keydown', e => {
      const k = e.key.toLowerCase(); if (!this.down.has(k)) this.presses.push(this.action(k));
      this.down.add(k); if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k) && e.target === document.body) e.preventDefault();
    });
    addEventListener('keyup', e => this.down.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.down.clear());
    // touch buttons: any element with data-t="gas|brake|left|right|handbrake|…"
    document.querySelectorAll('[data-t]').forEach(b => {
      const t = b.dataset.t;
      const on = e => { e.preventDefault(); this.touch[t] = 1; b.classList.add('on'); if (!['gas', 'brake', 'left', 'right', 'handbrake'].includes(t)) this.presses.push(t); try { b.setPointerCapture(e.pointerId); } catch (_) { } };
      const off = () => { this.touch[t] = 0; b.classList.remove('on'); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    });
  }
  action(k) { for (const a in KEYS) if (KEYS[a].includes(k)) return a; return k; }
  has(a) { return KEYS[a].some(k => this.down.has(k)); }
  // speed: the car's speed in m/s (keyboard steering gets slower and returns faster at speed, like a driver's hands)
  read(dt, speed = 0) {
    const out = { gas: 0, brake: 0, steer: 0, handbrake: 0, shiftUp: 0, shiftDown: 0, analog: false };
    out.gas = this.has('gas') || this.touch.gas ? 1 : 0; out.brake = this.has('brake') || this.touch.brake ? 1 : 0;
    const target = (this.has('left') || this.touch.left ? 1 : 0) - (this.has('right') || this.touch.right ? 1 : 0);
    const rate = target === 0 ? 4.5 : Math.sign(target) !== Math.sign(this.steerKb) && this.steerKb !== 0 ? 5 : 2.6 / (1 + speed * 0.025);
    this.steerKb += Math.max(-dt * rate, Math.min(dt * rate, target - this.steerKb));
    out.steer = this.steerKb;
    out.handbrake = this.has('handbrake') || this.touch.handbrake ? 1 : 0;
    // gamepad: right trigger gas, left trigger brake, left stick (or a wheel's first axis) steering
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find(p => p && p.connected);
    if (gp) {
      this.wheel = /wheel|g29|g920|t300|t150|fanatec|logitech.*(racing|driving)/i.test(gp.id);
      const ax = gp.axes[0] || 0, dz = this.wheel ? 0.01 : 0.12;
      if (Math.abs(ax) > dz) { out.steer = -Math.sign(ax) * (this.wheel ? Math.abs(ax) : Math.pow((Math.abs(ax) - dz) / (1 - dz), 1.6)); out.analog = true; }
      const rt = gp.buttons[7] ? gp.buttons[7].value : 0, lt = gp.buttons[6] ? gp.buttons[6].value : 0;
      // pedals on a wheel are often axes from −1 (released) to 1 (pressed)
      if (this.wheel && gp.axes.length > 2) { const g = (1 - (gp.axes[2] ?? 1)) / 2, b = (1 - (gp.axes[3] ?? 1)) / 2; if (g > 0.02) out.gas = Math.max(out.gas, g); if (b > 0.02) out.brake = Math.max(out.brake, b); }
      out.gas = Math.max(out.gas, rt); out.brake = Math.max(out.brake, lt);
      if (rt > 0.05 || lt > 0.05) out.analog = true;
      const btn = i => gp.buttons[i] && gp.buttons[i].pressed, pr = i => btn(i) && !this.padPrev[i];
      if (btn(0)) out.handbrake = 1;
      if (pr(5)) this.presses.push('up'); if (pr(4)) this.presses.push('down');
      if (pr(3)) this.presses.push('cam'); if (pr(2)) this.presses.push('lights'); if (pr(1)) this.presses.push('reset');
      if (pr(9)) this.presses.push('pause'); if (pr(8)) this.presses.push('map'); if (pr(12)) this.presses.push('low'); if (pr(13)) this.presses.push('enter');
      this.padPrev = {}; gp.buttons.forEach((b, i) => this.padPrev[i] = b.pressed);
      // the right stick looks round
      out.lookX = Math.abs(gp.axes[2] || 0) > 0.15 && !this.wheel ? gp.axes[2] : 0; out.lookY = Math.abs(gp.axes[3] || 0) > 0.15 && !this.wheel ? gp.axes[3] : 0;
    }
    // tilt steering on phones (optional, set by the settings)
    if (this.tilt != null && this.tiltOn) out.steer = Math.max(-1, Math.min(1, -this.tilt / 28));
    out.presses = this.presses; this.presses = [];
    return out;
  }
  enableTilt(on) {
    this.tiltOn = on;
    if (on && !this._tilt) {
      this._tilt = e => { const o = (screen.orientation && screen.orientation.angle) || 0; this.tilt = o === 90 ? e.beta : o === -90 || o === 270 ? -e.beta : e.gamma; };
      const go = () => addEventListener('deviceorientation', this._tilt);
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().then(r => r === 'granted' && go()).catch(() => { });
      else go();
    }
  }
}
