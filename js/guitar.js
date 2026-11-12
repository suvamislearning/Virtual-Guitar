const NS = "http://www.w3.org/2000/svg";

export const VB = { w: 2350, h: 960 };
export const NUT = 1955;
export const BRIDGE = 488;
export const OPEN = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4, standard tuning.

const X0 = 1998;
const FRET_LENGTH = 1492;
const FRETS = 19;

// String positions, thicknesses, and vibration rates are measured from the guitar image.
const NUT_Y = [437, 455, 473, 493, 510, 527];
const BRIDGE_Y = [413, 441, 469, 497, 523, 552];
const STRING_WIDTH = [4.4, 3.8, 3.1, 2.4, 1.9, 1.5];
const WOUND_STRING = [1, 1, 1, 0, 0, 0];
const VIBRATION_HZ = [9, 11, 13, 15, 18, 21];

const fretX = (fret) =>
  fret ? X0 - FRET_LENGTH * (1 - 2 ** (-fret / 12)) : NUT;

const stringY = (string, x) =>
  NUT_Y[string] +
  ((BRIDGE_Y[string] - NUT_Y[string]) * (NUT - x)) / (NUT - BRIDGE);

function createSvgElement(name, attributes = {}, parent) {
  const element = document.createElementNS(NS, name);

  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }

  parent?.append(element);
  return element;
}

function fretAt(x) {
  if (x > NUT + 10) return null;

  for (let fret = 1; fret <= FRETS; fret++) {
    if (x >= fretX(fret)) return fret;
  }

  return 0;
}

export class Guitar {
  constructor(svg, audio) {
    Object.assign(this, {
      svg,
      audio,
      chord: null,
      strumMs: 28,
      vib: [],
      vibToken: [],
      glowTimers: [],
      touch: [],
      ptrs: new Map(),
      raf: 0,
    });

    const labels = createSvgElement("g", { class: "labels" }, svg);
    const strings = createSvgElement("g", {}, svg);
    const dots = createSvgElement("g", {}, svg);

    this.drawFretLabels(labels);
    this.createStrings(strings, dots);
    this.startVibrationLoop();
    this.bindPointerEvents();
  }

  drawFretLabels(parent) {
    for (let fret = 1; fret <= FRETS; fret++) {
      const x = (fretX(fret - 1) + fretX(fret)) / 2;
      createSvgElement(
        "rect",
        { x: x - 12, y: 352, width: 24, height: 26, rx: 6, class: "pill" },
        parent,
      );
      createSvgElement("text", { x, y: 370, class: "num" }, parent).textContent =
        fret;
    }
  }

  createStrings(parent, dots) {
    this.glow = [];
    this.line = [];
    this.dot = [];

    for (let string = 0; string < 6; string++) {
      this.glow[string] = createSvgElement(
        "path",
        { class: "glow", "stroke-width": STRING_WIDTH[string] * 3.2 },
        parent,
      );

      this.line[string] = createSvgElement(
        "path",
        {
          class: "str",
          "stroke-width": STRING_WIDTH[string],
          stroke: WOUND_STRING[string] ? "#d2ad72" : "#ecebe4",
        },
        parent,
      );

      this.dot[string] = createSvgElement("circle", { r: 11, class: "dot" }, dots);
      this.draw(string, 0, 0, 0);
    }
  }

  startVibrationLoop() {
    this.loop = (time) => {
      let isVibrating = false;

      for (const vibration of this.vib) {
        if (!vibration) continue;

        const elapsed = (time - vibration.t0) / 1000;
        const envelope = Math.exp(-elapsed * 8);

        if (envelope < 0.02) {
          this.draw(vibration.i, 0, 0, 0);
          this.vib[vibration.i] = null;
          continue;
        }

        isVibrating = true;
        const displacement =
          vibration.amp * envelope * Math.sin(elapsed * vibration.hz * 6.283);
        this.draw(vibration.i, vibration.fret, displacement, envelope);
      }

      this.raf = isVibrating ? requestAnimationFrame(this.loop) : 0;
    };
  }

  bindPointerEvents() {
    this.svg.addEventListener("pointerdown", (event) => this.down(event));
    this.svg.addEventListener("pointermove", (event) => this.move(event));

    for (const type of ["pointerup", "pointercancel"]) {
      this.svg.addEventListener(type, (event) => this.ptrs.delete(event.pointerId));
    }
  }

  // Convert screen coordinates to the fixed SVG viewBox used by the guitar image.
  pt(event) {
    const rect = this.svg.getBoundingClientRect();
    const scale = VB.w / rect.width;

    return {
      x: (event.clientX - rect.left) * scale,
      y: (event.clientY - rect.top) * scale,
      s: scale,
    };
  }

  down(event) {
    this.svg.setPointerCapture(event.pointerId);
    const point = this.pt(event);
    this.ptrs.set(event.pointerId, point);

    if (point.x < BRIDGE - 40) return;

    const tolerance = Math.min(60, 22 * point.s);
    let closestString = -1;
    let closestDistance = tolerance;

    for (let string = 0; string < 6; string++) {
      const y = stringY(string, Math.min(point.x, NUT));
      const distance = Math.abs(point.y - y);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestString = string;
      }
    }

    if (closestString >= 0) this.hit(closestString, point.x, 0.8);
  }

  move(event) {
    const previous = this.ptrs.get(event.pointerId);
    if (!previous) return;

    const point = this.pt(event);
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
    const velocity = Math.min(1, 0.55 + (distance / 80) * 0.45);

    // Play a string whenever the pointer crosses its line during a drag.
    for (let string = 0; string < 6; string++) {
      const crossed =
        (previous.y - stringY(string, previous.x)) *
          (point.y - stringY(string, point.x)) <
        0;

      if (crossed) this.hit(string, point.x, velocity);
    }

    this.ptrs.set(event.pointerId, point);
  }

  hit(string, x, velocity, delay = 0) {
    let fret = fretAt(x);
    if (fret === null) return;

    if (fret === 0) {
      fret = this.chord ? this.chord[string] : 0;
    } else {
      this.press(string, fret);
    }

    if (fret >= 0) this.sound(string, fret, velocity, delay);
  }

  press(string, fret) {
    this.touch[string] = fret;
    this.render();

    clearTimeout(this[`t${string}`]);
    this[`t${string}`] = setTimeout(() => {
      this.touch[string] = null;
      this.render();
    }, 700);
  }

  sound(string, fret, velocity, delay = 0) {
    this.audio.pluck(string, OPEN[string] + fret, velocity, delay);
    const token = (this.vibToken[string] = (this.vibToken[string] || 0) + 1);
    const glow = this.glow[string];

    // Keep the visual pluck cue working even when audio is unavailable or blocked.
    setTimeout(() => {
      glow.style.opacity = 0.65;
      clearTimeout(this.glowTimers[string]);
      this.glowTimers[string] = setTimeout(() => {
        glow.style.opacity = 0;
      }, 240);
    }, delay * 1000);

    setTimeout(() => {
      if (this.vibToken[string] !== token) return;

      this.vib[string] = {
        i: string,
        fret,
        t0: performance.now(),
        amp: 2 + velocity * 2.5,
        hz: VIBRATION_HZ[string] * 0.4,
      };

      if (!this.raf) this.raf = requestAnimationFrame(this.loop);
    }, delay * 1000);
  }

  pluckString(string, velocity = 0.8) {
    const fret = this.chord ? this.chord[string] : 0;
    if (fret >= 0) this.sound(string, fret, velocity);
  }

  strum(direction = "down", velocity = 0.85) {
    const order =
      direction === "down" ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0];

    order.forEach((string, index) => {
      const fret = this.chord ? this.chord[string] : 0;
      if (fret >= 0) {
        this.sound(
          string,
          fret,
          velocity * (0.88 + 0.12 * Math.random()),
          (index * this.strumMs) / 1000,
        );
      }
    });
  }

  setChord(frets) {
    this.chord = frets;
    this.render();
  }

  render() {
    for (let string = 0; string < 6; string++) {
      const fret = this.touch[string] ?? (this.chord ? this.chord[string] : 0);
      const dot = this.dot[string];

      dot.style.opacity = fret > 0 ? 1 : 0;

      if (fret > 0) {
        const x = (fretX(fret - 1) + fretX(fret)) / 2;
        dot.setAttribute("cx", x);
        dot.setAttribute("cy", stringY(string, x));
      }

      this.line[string].style.opacity =
        this.chord && this.chord[string] < 0 ? 0.3 : 1;
    }
  }

  draw(string, fret, displacement, envelope) {
    const x = fretX(fret);
    const y = stringY(string, x);
    const middleX = (x + BRIDGE) / 2;
    const middleY = (y + BRIDGE_Y[string]) / 2;
    const path = `M${NUT} ${NUT_Y[string]}L${x} ${y}Q${middleX} ${
      middleY + 2 * displacement
    } ${BRIDGE} ${BRIDGE_Y[string]}`;

    this.line[string].setAttribute("d", path);
    this.glow[string].setAttribute("d", path);
    this.glow[string].style.opacity = envelope * 0.55;
  }
}
