const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

// Frets are ordered from low E to high E; -1 means the string is not played.
const E_FORM = {
  "": [0, 2, 2, 1, 0, 0],
  m: [0, 2, 2, 0, 0, 0],
  7: [0, 2, 0, 1, 0, 0],
  m7: [0, 2, 0, 0, 0, 0],
  sus4: [0, 2, 2, 2, 0, 0],
};

const A_FORM = {
  "": [-1, 0, 2, 2, 2, 0],
  m: [-1, 0, 2, 2, 1, 0],
  7: [-1, 0, 2, 0, 2, 0],
  m7: [-1, 0, 2, 0, 1, 0],
  sus4: [-1, 0, 2, 2, 3, 0],
};

// Common open-position chords sound better than the movable barre forms.
const OPEN = {
  "0|": [-1, 3, 2, 0, 1, 0],
  "2|": [-1, -1, 0, 2, 3, 2],
  "7|": [3, 2, 0, 0, 0, 3],
  "2|m": [-1, -1, 0, 2, 3, 1],
  "0|7": [-1, 3, 2, 3, 1, 0],
  "2|7": [-1, -1, 0, 2, 1, 2],
  "7|7": [3, 2, 0, 0, 0, 1],
};

// The order matches the three rows of chord buttons in the on-screen pad.
export const PAD = [
  ["q", 9, 1],
  ["w", 3],
  ["e", 4],
  ["r", 6],
  ["t", 8],
  ["a", 9],
  ["s", 10],
  ["d", 2],
  ["f", 5],
  ["g", 7],
  ["z", 4, 1],
  ["x", 2, 1],
  ["c", 0],
  ["v", 1],
  ["b", 11],
].map(([key, pc, minor]) => ({ key, pc, minor: !!minor }));

export function chordFor(pc, { minor = false, seventh = false, sus4 = false } = {}) {
  const quality = sus4 ? "sus4" : `${minor ? "m" : ""}${seventh ? "7" : ""}`;
  const openShape = OPEN[`${pc}|${quality}`];

  if (openShape) {
    return { name: NAMES[pc] + quality, frets: openShape };
  }

  // Move whichever basic E- or A-root shape needs the smaller fret shift.
  const eOffset = (pc - 4 + 12) % 12;
  const aOffset = (pc - 9 + 12) % 12;
  const useAForm = aOffset < eOffset;
  const offset = useAForm ? aOffset : eOffset;
  const shape = (useAForm ? A_FORM : E_FORM)[quality];
  const frets = shape.map((fret) => (fret < 0 ? -1 : fret + offset));

  return { name: NAMES[pc] + quality, frets };
}
