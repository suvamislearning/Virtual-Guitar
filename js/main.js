import { GuitarAudio } from "./audio.js";
import { PAD, chordFor } from "./chords.js";
import { Guitar } from "./guitar.js";

const $ = (selector) => document.querySelector(selector);
const portraitPhone = window.matchMedia(
  "(max-width: 700px) and (orientation: portrait) and (pointer: coarse)",
);
let appStarted = false;

function startApp() {
  if (appStarted) return;
  appStarted = true;

  // Reuse saved audio settings when present; defaults cover a fresh installation.
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem("fretwork") || "{}");
  } catch {
    // Ignore a missing or invalid saved preference and use the defaults below.
  }

  const config = { volume: 0.8, reverb: 0.25, strum: 28, ...saved };
  const audio = new GuitarAudio(config);
  const guitar = new Guitar($("#guitar"), audio);
  guitar.strumMs = config.strum;

  audio.load().catch((error) => {
    console.error("Guitar audio failed to load", error);
  });

  // Modifier keys are also clickable toggles; holding a keyboard key applies it temporarily.
  const modifiers = { minor: false, seventh: false, sus4: false };
  const modifierKeys = { Shift: "minor", "7": "seventh", "8": "sus4" };
  let currentChord = null;
  const pad = $("#pad");

  // Build the chord keys from the same data used by the keyboard shortcuts.
  PAD.forEach((chord) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.key = chord.key;

    const shortcut = document.createElement("i");
    shortcut.textContent = chord.key;

    const name = document.createElement("span");
    button.append(shortcut, name);
    pad.append(button);
    chord.button = button;
  });

  const getChord = (chord) =>
    chordFor(chord.pc, {
      minor: chord.minor || modifiers.minor,
      seventh: modifiers.seventh,
      sus4: modifiers.sus4,
    });

  function updateChordLabels() {
    PAD.forEach((chord) => {
      chord.button.querySelector("span").textContent = getChord(chord).name;
    });
  }

  function playChord(chord) {
    const notes = getChord(chord);
    guitar.setChord(notes.frets);
    guitar.strum("down");

    currentChord?.button.classList.remove("on");
    currentChord = chord;
    chord.button.classList.add("on");
  }

  function clearChord() {
    guitar.setChord(null);
    currentChord?.button.classList.remove("on");
    currentChord = null;
  }

  pad.addEventListener("pointerdown", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    event.preventDefault();
    playChord(PAD.find((chord) => chord.key === button.dataset.key));
  });

  function setModifier(name, isOn) {
    modifiers[name] = isOn;
    $(`[data-mod=${name}]`).setAttribute("aria-pressed", isOn);
    updateChordLabels();

    if (currentChord) playChord(currentChord);
  }

  document.querySelectorAll("[data-mod]").forEach((button) => {
    button.addEventListener("click", () => {
      const name = button.dataset.mod;
      setModifier(name, !modifiers[name]);
    });
  });

  updateChordLabels();

  $("#down").addEventListener("pointerdown", (event) => {
    event.preventDefault();
    guitar.strum("down");
  });

  $("#up").addEventListener("pointerdown", (event) => {
    event.preventDefault();
    guitar.strum("up");
  });

  $("#open").addEventListener("click", clearChord);

  // Ignore shortcuts while the browser or operating system handles a key combination.
  addEventListener("keydown", (event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const modifier = modifierKeys[key];

    if (modifier) {
      setModifier(modifier, true);
      return;
    }

    const chord = PAD.find((item) => item.key === key);
    if (chord) {
      playChord(chord);
      return;
    }

    if (key === "h" || (key === " " && document.activeElement === document.body)) {
      event.preventDefault();
      guitar.strum("down");
    } else if (key === "j") {
      guitar.strum("up");
    } else if (key === "Escape") {
      clearChord();
    } else if (/^[1-6]$/.test(key)) {
      guitar.pluckString(6 - Number(key)); // 1 plays high E; 6 plays low E.
    }
  });

  addEventListener("keyup", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const modifier = modifierKeys[key];

    if (modifier) setModifier(modifier, false);
  });
}

function updateOrientationPrompt() {
  const shouldRotate = portraitPhone.matches;
  document.body.classList.toggle("phone-portrait", shouldRotate);

  // Initialize only after a phone is landscape; rotation then reveals the ready app.
  if (!shouldRotate) startApp();
}

portraitPhone.addEventListener("change", updateOrientationPrompt);
updateOrientationPrompt();
