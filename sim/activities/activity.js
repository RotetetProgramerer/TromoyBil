// The base for what you do instead of driving the car: the boat, the plane, skiing. game.js loads every module in its ACTS list
// (sim/activities/<name>.js, default export a subclass of Activity) and, while you drive, asks each one for an offer.
//
//   init()            once after the game has loaded (async allowed): build what stays in the world (the marina's boats, the lift)
//   offers(car)       a few times a second while driving: null, or {kind, name, info, go()} when the car is at the entry point
//                     (the marina, the airport, the ski lift). go() runs when the player presses Enter or the button
//   start(opts)       call game.startActivity(this) from here (or from go()); take over the camera and the controls
//   update(dt, inp)   every frame while active. inp = Input.read(): {gas, brake, steer, handbrake, analog, lookX, lookY,
//                     presses, releases, down (the Set of keys held, lower case), touch (the touch buttons held)}
//   press(a)          every key or touch action while active (the names in KEYS in sim/input.js, or the key itself); return
//                     true when handled. 'pause' that is not handled opens the game's pause menu
//   reset()           the pause menu's «sett tilbake» while active
//   stop()            tidy up, then call game.endActivity(); also called when the player goes to the main menu
//   frame(dt)         every frame whether active or not (the chairlift runs, boats bob at the marina)
//   pose              while active: {pos, fw, kmh} for the minimap and the place name (pos and fw are Vector3-likes)
// The car stays parked while an activity runs (its physics paused); body.act hides the car's dashboard and touch pads.
export class Activity {
  constructor(game) { this.game = game; this.active = false; this.pose = null; }
  async init() { }
  offers() { return null; }
  start() { }
  update() { }
  press() { return false; }
  reset() { }
  stop() { this.game.endActivity(); }
  frame() { }
}
