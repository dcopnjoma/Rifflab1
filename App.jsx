import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import * as Tone from "tone";
import {
  Play, Pause, Heart, Bookmark, Shuffle, GitMerge, Sparkles, Upload, Mic,
  Trash2, ChevronRight, ChevronLeft, Download, Check, RotateCcw, Music2,
  Plus, X, Wand2, ArrowLeft, FolderOpen, Loader2, AudioLines
} from "lucide-react";

/* ============================================================================
   RIFFLAB — prototipo funcional de front-end
   La generación musical es sintetizada en tiempo real con Tone.js a partir de
   los parámetros elegidos (género, mood, complejidad, instrumentos). No hay
   modelo de IA generativa de audio real detrás: es una simulación coherente
   del flujo y de la sensación sonora, pensada para validar la experiencia.
   ========================================================================== */

/* ---------------------------------- Datos base ---------------------------------- */

const NOTE_NAMES = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
const SCALE_MAJOR = [0, 2, 4, 5, 7, 9, 11];
const SCALE_MINOR = [0, 2, 3, 5, 7, 8, 10];

const GENRES = ["Electrónica", "Rock", "Hip-Hop", "Ambient", "Folk", "Cinemático", "Pop", "Jazz"];
const MOODS = ["Oscuro", "Épico", "Soñador", "Melancólico", "Enérgico", "Íntimo"];

const MOOD_CONFIG = {
  "Oscuro":       { scaleType: "minor", progression: [0, 5, 2, 6] },
  "Épico":        { scaleType: "minor", progression: [0, 6, 5, 6] },
  "Soñador":      { scaleType: "major", progression: [3, 0, 4, 5] },
  "Melancólico":  { scaleType: "minor", progression: [5, 3, 0, 4] },
  "Enérgico":     { scaleType: "major", progression: [0, 4, 5, 3] },
  "Íntimo":       { scaleType: "minor", progression: [0, 3, 6, 2] },
};

const INSTRUMENT_OPTIONS = [
  { key: "bass", label: "Bajo" },
  { key: "drums", label: "Batería" },
  { key: "chords", label: "Acordes" },
  { key: "melody", label: "Melodía secundaria" },
  { key: "vocal", label: "Adornos vocales" },
  { key: "pad", label: "Capas ambientales" },
];

const TRACK_INSTRUMENTS = ["Guitarra", "Bajo", "Batería", "Voz", "Sintetizador", "Piano", "Percusión", "Otro"];

const EXPLORE_OPTIONS = ["Más melódico", "Más rítmico", "Más atmosférico", "Más minimalista", "Más complejo", "Sorpréndeme"];

const ADJ_BANK = ["Nocturna", "Distante", "Suspendida", "Errante", "Silente", "Ardiente", "Frágil", "Lenta", "Difusa", "Cristalina", "Oxidada", "Íntima", "Pálida", "Tensa", "Suave"];
const NOUN_BANK = ["Deriva", "Marea", "Resonancia", "Sombra", "Órbita", "Ceniza", "Estática", "Corriente", "Bruma", "Pulso", "Eco", "Grieta", "Vértigo", "Umbral", "Vela"];

const RECOMMENDATION_BANK = [
  { id: "r1", text: "Los acordes y el bajo ocupan el mismo registro; sepáralos una octava para ganar claridad.", cond: (s) => s.layers.chords && s.layers.bass, apply: { complexityDelta: -4 } },
  { id: "r2", text: "El patrón rítmico se repite sin variación; un fill sutil cada 4 compases le daría movimiento.", cond: (s) => s.layers.drums && s.complexity < 65, apply: { complexityDelta: 6 } },
  { id: "r3", text: "Hay más capas simultáneas de las que pide una idea minimalista; considera quitar el ambiente.", cond: (s) => s.layers.pad && s.complexity < 45, apply: { toggleLayerOff: "pad" } },
  { id: "r4", text: "La melodía secundaria compite con los adornos vocales en el mismo rango; baja una de las dos.", cond: (s) => s.layers.melody && s.layers.vocal, apply: { complexityDelta: -6 } },
  { id: "r5", text: "Faltan capas que sostengan el espacio entre frases; una capa ambiental ayudaría.", cond: (s) => !s.layers.pad, apply: { toggleLayerOn: "pad" } },
  { id: "r6", text: "Hay demasiado aire entre bajo y batería en los acentos; alinear el bajo al bombo suma peso.", cond: (s) => s.layers.drums && s.layers.bass && s.complexity > 55, apply: { complexityDelta: 4 } },
  { id: "r7", text: "La progresión es estable y podría sostener una séptima para dar más color armónico.", cond: (s) => s.layers.chords && s.complexity < 60, apply: { complexityDelta: 8 } },
  { id: "r8", text: "La densidad general es alta para la intención del proyecto; reduce los adornos rítmicos.", cond: (s) => s.complexity > 72, apply: { complexityDelta: -12 } },
];

/* ---------------------------------- utilidades ---------------------------------- */

function strSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(seedStr) { return mulberry32(strSeed(seedStr)); }
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function pickName(rng) { return `${pick(rng, ADJ_BANK)} ${pick(rng, NOUN_BANK)}`; }

function scaleArr(type) { return type === "major" ? SCALE_MAJOR : SCALE_MINOR; }
function degreeToNote(rootIndex, type, degree, octave) {
  const arr = scaleArr(type);
  const len = arr.length;
  const wraps = Math.floor(degree / len);
  const idx = ((degree % len) + len) % len;
  const semitone = (rootIndex + arr[idx]) % 12;
  return TONE_NOTE_NAMES[semitone] + (octave + wraps);
}
// Tone.js needs Western note names internally, independent of the Spanish UI labels.
const TONE_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function chordTones(rootIndex, type, degree, octave, withSeventh) {
  const notes = [
    degreeToNote(rootIndex, type, degree, octave),
    degreeToNote(rootIndex, type, degree + 2, octave),
    degreeToNote(rootIndex, type, degree + 4, octave),
  ];
  if (withSeventh) notes.push(degreeToNote(rootIndex, type, degree + 6, octave));
  return notes;
}

function fmtPct(n) { return `${Math.round(n)}%`; }

/* ---------------------------------- generación musical ---------------------------------- */

const DRUM_BASE = {
  "Electrónica": { kick: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0], hat: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0] },
  "Rock":        { kick: [1,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0], hat: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0] },
  "Hip-Hop":     { kick: [1,0,0,1,0,0,1,0,0,0,1,0,0,0,0,0], hat: [1,0,1,1,0,1,1,0,1,0,1,1,0,1,1,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0] },
  "Ambient":     { kick: [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], hat: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], snare: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0] },
  "Folk":        { kick: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], hat: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], snare: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0] },
  "Cinemático":  { kick: [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], hat: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], snare: [0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0] },
  "Pop":         { kick: [1,0,0,0,0,0,1,0,1,0,0,1,0,0,0,0], hat: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0] },
  "Jazz":        { kick: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0], hat: [1,0,1,1,0,1,1,0,1,0,1,1,0,1,1,0], snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0] },
};

const GENRE_TIMBRE = {
  "Electrónica": { bass: "sawtooth", chord: "square", melody: "sawtooth" },
  "Rock":        { bass: "sawtooth", chord: "triangle", melody: "triangle" },
  "Hip-Hop":     { bass: "sine", chord: "triangle", melody: "triangle" },
  "Ambient":     { bass: "sine", chord: "sine", melody: "sine" },
  "Folk":        { bass: "triangle", chord: "triangle", melody: "triangle" },
  "Cinemático":  { bass: "sine", chord: "sine", melody: "sine" },
  "Pop":         { bass: "triangle", chord: "square", melody: "square" },
  "Jazz":        { bass: "sine", chord: "sine", melody: "triangle" },
};

function buildDrumPattern(genre, complexity, rng) {
  const base = DRUM_BASE[genre] || DRUM_BASE["Pop"];
  const bars = 4;
  const extraProb = Math.min(0.7, complexity / 130);
  const out = { kick: [], hat: [], snare: [] };
  for (let b = 0; b < bars; b++) {
    for (let i = 0; i < 16; i++) {
      let k = !!base.kick[i];
      let h = !!base.hat[i];
      let s = !!base.snare[i];
      if (!h && genre !== "Ambient" && genre !== "Cinemático" && rng() < extraProb * 0.4) h = true;
      if (!k && rng() < extraProb * 0.08) k = true;
      // fill on the last bar
      if (b === bars - 1 && i >= 14 && complexity > 55 && rng() < 0.6) { s = true; }
      out.kick.push(k); out.hat.push(h); out.snare.push(s);
    }
  }
  return out;
}

function buildProposalSpec({ rootIndex, scaleType, progression, bpm, genre, mood, complexity, layers, bias, seedBase, index }) {
  const seed = `${seedBase}-${index}-${bias}`;
  const rng = makeRng(seed);
  let c = complexity;
  let ly = { ...layers };

  switch (bias) {
    case "Más melódico": ly.melody = true; c = Math.min(100, c + 12); break;
    case "Más rítmico": c = Math.min(100, c + 15); break;
    case "Más atmosférico": ly.pad = true; ly.drums = false; c = Math.max(10, c - 10); break;
    case "Más minimalista": c = Math.max(5, Math.min(c, 28)); ly.melody = false; ly.pad = false; break;
    case "Más complejo": c = Math.min(100, c + 30); ly.melody = true; ly.pad = true; break;
    case "Sorpréndeme": {
      const wobble = Math.floor(rng() * 21) - 10;
      c = Math.max(5, Math.min(100, c + wobble));
      if (rng() < 0.5) ly.melody = !ly.melody;
      if (rng() < 0.35) ly.pad = !ly.pad;
      break;
    }
    default: break;
  }

  const bpmShift = Math.floor(rng() * 7) - 3;
  return {
    id: seed,
    name: pickName(rng),
    bias,
    rootIndex, scaleType, progression, genre, mood,
    bpm: Math.max(60, bpm + bpmShift),
    complexity: c,
    layers: ly,
    seed,
    liked: false,
    saved: false,
    origin: null,
  };
}

function describeProposal(spec) {
  const active = Object.entries(spec.layers).filter(([, v]) => v).map(([k]) => (
    { bass: "bajo", drums: "batería", chords: "acordes", melody: "melodía", vocal: "adornos vocales", pad: "capas ambientales" }[k]
  ));
  const list = active.length ? active.join(", ") : "una base mínima";
  return `Variante ${spec.bias.toLowerCase()}, con énfasis en ${list}. Mantiene la tonalidad y el compás de base.`;
}

/* ---------------------------------- motor de audio (Tone.js) ---------------------------------- */

function useAudioEngine() {
  const nodesRef = useRef(null);
  const playingIdRef = useRef(null);
  const [playingId, setPlayingId] = useState(null);

  const disposeNodes = useCallback(() => {
    if (nodesRef.current) {
      nodesRef.current.forEach((n) => { try { n.dispose(); } catch (e) {} });
      nodesRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    try { Tone.Transport.stop(); Tone.Transport.cancel(); } catch (e) {}
    disposeNodes();
    playingIdRef.current = null;
    setPlayingId(null);
  }, [disposeNodes]);

  // Builds every instrument + schedules the 4-bar pattern. Works both live
  // (real AudioContext, looping) and inside Tone.Offline (rendering to a buffer).
  const schedule = useCallback((spec, bars, loop) => {
    const created = [];
    const master = new Tone.Reverb({ decay: 2.2, wet: 0.18 }).toDestination();
    created.push(master);
    const limiter = new Tone.Limiter(-1).connect(master);
    created.push(limiter);

    const timbre = GENRE_TIMBRE[spec.genre] || GENRE_TIMBRE["Pop"];
    const rng = makeRng(spec.seed + "-audio");

    const kick = new Tone.MembraneSynth({ octaves: 6, pitchDecay: 0.02, envelope: { attack: 0.001, decay: 0.35, sustain: 0 } }).connect(limiter);
    const hat = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.05, sustain: 0 } }).connect(limiter);
    const snare = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.001, decay: 0.15, sustain: 0 } }).connect(limiter);
    const bass = new Tone.MonoSynth({ oscillator: { type: timbre.bass }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.3 }, filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, baseFrequency: 200, octaves: 2 } }).connect(limiter);
    const chords = new Tone.PolySynth(Tone.Synth, { oscillator: { type: timbre.chord }, envelope: { attack: 0.05, decay: 0.3, sustain: 0.5, release: 0.8 } }).connect(limiter);
    chords.volume.value = -8;
    const melody = new Tone.Synth({ oscillator: { type: timbre.melody }, envelope: { attack: 0.005, decay: 0.15, sustain: 0.2, release: 0.3 } }).connect(limiter);
    melody.volume.value = -6;
    const vocal = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.08, decay: 0.2, sustain: 0.4, release: 0.6 } }).connect(limiter);
    vocal.volume.value = -10;
    const pad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sine" }, envelope: { attack: 1.2, decay: 0.4, sustain: 0.8, release: 2.5 } }).connect(limiter);
    pad.volume.value = -14;

    created.push(kick, hat, snare, bass, chords, melody, vocal, pad);

    Tone.Transport.bpm.value = spec.bpm;
    const drumOn = spec.layers.drums;
    const drums = buildDrumPattern(spec.genre, spec.complexity, rng);

    if (drumOn) {
      const seq = new Tone.Sequence((time, i) => {
        if (drums.kick[i]) kick.triggerAttackRelease("C1", "8n", time);
        if (drums.hat[i]) hat.triggerAttackRelease("16n", time, 0.5);
        if (drums.snare[i]) snare.triggerAttackRelease("8n", time, 0.8);
      }, Array.from({ length: 16 * bars }, (_, i) => i), "16n");
      seq.start(0);
      created.push(seq);
    }

    const octaves = { bass: 2, chords: 3, melody: 4, vocal: 5, pad: 3 };
    const withSeventh = spec.complexity > 50;

    if (spec.layers.bass) {
      const seq = new Tone.Sequence((time, i) => {
        const step = i % 16; const bar = Math.floor(i / 16);
        const deg = spec.progression[bar % spec.progression.length];
        if (step === 0) bass.triggerAttackRelease(degreeToNote(spec.rootIndex, spec.scaleType, deg, octaves.bass), "8n", time);
        else if (step === 8 && spec.complexity > 40) bass.triggerAttackRelease(degreeToNote(spec.rootIndex, spec.scaleType, deg + 4, octaves.bass), "8n", time);
        else if (step === 14 && spec.complexity > 70) bass.triggerAttackRelease(degreeToNote(spec.rootIndex, spec.scaleType, deg + 1, octaves.bass), "16n", time);
      }, Array.from({ length: 16 * bars }, (_, i) => i), "16n");
      seq.start(0);
      created.push(seq);
    }

    if (spec.layers.chords) {
      const isFolk = spec.genre === "Folk";
      const seq = new Tone.Sequence((time, i) => {
        const step = i % 16; const bar = Math.floor(i / 16);
        const deg = spec.progression[bar % spec.progression.length];
        const tones = chordTones(spec.rootIndex, spec.scaleType, deg, octaves.chords, withSeventh);
        if (isFolk) {
          if (step % 4 === 0) chords.triggerAttackRelease([tones[Math.floor(step / 4) % tones.length]], "8n", time);
        } else if (step === 0) {
          chords.triggerAttackRelease(tones, "2n", time);
        }
      }, Array.from({ length: 16 * bars }, (_, i) => i), "16n");
      seq.start(0);
      created.push(seq);
    }

    if (spec.layers.melody) {
      const density = 0.25 + (spec.complexity / 100) * 0.5;
      const seq = new Tone.Sequence((time, i) => {
        const step = i % 16; const bar = Math.floor(i / 16);
        const deg = spec.progression[bar % spec.progression.length];
        const onOff = step % 4 === 2;
        if (onOff || rng() < density * 0.3) {
          const wobble = Math.floor(rng() * 3) - 1;
          melody.triggerAttackRelease(degreeToNote(spec.rootIndex, spec.scaleType, deg + 2 + wobble, octaves.melody), "16n", time);
        }
      }, Array.from({ length: 16 * bars }, (_, i) => i), "16n");
      seq.start(0);
      created.push(seq);
    }

    if (spec.layers.vocal) {
      const seq = new Tone.Sequence((time, i) => {
        const step = i % 16; const bar = Math.floor(i / 16);
        const deg = spec.progression[bar % spec.progression.length];
        if (step === 6 || (step === 10 && spec.complexity > 45)) {
          vocal.triggerAttackRelease(degreeToNote(spec.rootIndex, spec.scaleType, deg + 4, octaves.vocal), "8n", time);
        }
      }, Array.from({ length: 16 * bars }, (_, i) => i), "16n");
      seq.start(0);
      created.push(seq);
    }

    if (spec.layers.pad) {
      const seq = new Tone.Sequence((time, i) => {
        const bar = Math.floor(i / 16); const step = i % 16;
        if (step !== 0) return;
        const deg = spec.progression[bar % spec.progression.length];
        const tones = [degreeToNote(spec.rootIndex, spec.scaleType, deg, octaves.pad), degreeToNote(spec.rootIndex, spec.scaleType, deg + 4, octaves.pad)];
        pad.triggerAttackRelease(tones, "1m", time);
      }, Array.from({ length: 16 * bars }, (_, i) => i), "16n");
      seq.start(0);
      created.push(seq);
    }

    if (loop) {
      Tone.Transport.loop = true;
      Tone.Transport.loopStart = 0;
      Tone.Transport.loopEnd = { "1m": bars };
    }

    return created;
  }, []);

  const play = useCallback(async (spec) => {
    await Tone.start();
    stop();
    const created = schedule(spec, 4, true);
    nodesRef.current = created;
    Tone.Transport.start();
    playingIdRef.current = spec.id;
    setPlayingId(spec.id);
  }, [schedule, stop]);

  const renderWav = useCallback(async (spec, bars = 4) => {
    const barSeconds = (60 / spec.bpm) * 4;
    const duration = barSeconds * bars + 2.2;
    const buffer = await Tone.Offline(() => {
      schedule(spec, bars, false);
      Tone.Transport.start();
    }, duration);
    return audioBufferToWavBlob(buffer.get ? buffer.get() : buffer._buffer || buffer);
  }, [schedule]);

  useEffect(() => () => { stop(); }, [stop]);

  return { play, stop, playingId, renderWav };
}

function audioBufferToWavBlob(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  let result;
  if (numChannels === 2) {
    result = interleave(audioBuffer.getChannelData(0), audioBuffer.getChannelData(1));
  } else {
    result = audioBuffer.getChannelData(0);
  }
  const buffer = encodeWAV(result, format, sampleRate, numChannels, bitDepth);
  return new Blob([buffer], { type: "audio/wav" });
}
function interleave(left, right) {
  const length = left.length + right.length;
  const result = new Float32Array(length);
  let index = 0, inputIndex = 0;
  while (index < length) {
    result[index++] = left[inputIndex];
    result[index++] = right[inputIndex];
    inputIndex++;
  }
  return result;
}
function encodeWAV(samples, format, sampleRate, numChannels, bitDepth) {
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);
  floatTo16BitPCM(view, 44, samples);
  return buffer;
}
function floatTo16BitPCM(view, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
}

/* ---------------------------------- waveform de archivos subidos ---------------------------------- */

function getPeaks(audioBuffer, numPeaks) {
  const data = audioBuffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(data.length / numPeaks));
  const peaks = [];
  for (let i = 0; i < numPeaks; i++) {
    let sum = 0; const start = i * blockSize;
    for (let j = 0; j < blockSize; j++) sum += Math.abs(data[start + j] || 0);
    peaks.push(sum / blockSize);
  }
  const max = Math.max(...peaks, 0.0001);
  return peaks.map((p) => p / max);
}

function guessInstrument(filename) {
  const n = filename.toLowerCase();
  if (/bass|bajo/.test(n)) return "Bajo";
  if (/drum|perc|bater/.test(n)) return "Batería";
  if (/voc|voz|vocal/.test(n)) return "Voz";
  if (/guitar/.test(n)) return "Guitarra";
  if (/synth|pad/.test(n)) return "Sintetizador";
  if (/piano|keys/.test(n)) return "Piano";
  return "Otro";
}

/* ---------------------------------- componentes visuales pequeños ---------------------------------- */

function Waveform({ peaks, color = "var(--accent)", height = 40, active = false }) {
  if (!peaks || !peaks.length) {
    peaks = Array.from({ length: 40 }, () => 0.15);
  }
  return (
    <div className="rl-wave" style={{ height }}>
      {peaks.map((p, i) => (
        <span
          key={i}
          className={active ? "rl-wave-bar rl-wave-bar-active" : "rl-wave-bar"}
          style={{ height: `${Math.max(6, p * 100)}%`, background: color, animationDelay: `${(i % 12) * 0.05}s` }}
        />
      ))}
    </div>
  );
}

function EqLogo({ size = 22 }) {
  return (
    <div className="rl-eq" style={{ width: size, height: size }}>
      <span /><span /><span /><span />
    </div>
  );
}

function Pill({ active, onClick, children }) {
  return (
    <button className={`rl-pill ${active ? "rl-pill-active" : ""}`} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function StageDot({ label, done, current, onClick, disabled }) {
  return (
    <button type="button" onClick={disabled ? undefined : onClick} className="rl-stage-dot" disabled={disabled} title={label}>
      <span className={`rl-dot ${current ? "rl-dot-current" : done ? "rl-dot-done" : ""}`} />
      <span className={`rl-stage-label ${current ? "rl-stage-label-current" : ""}`}>{label}</span>
    </button>
  );
}

/* ================================================================================
   APP
   ================================================================================ */

const STAGES = [
  { key: "dashboard", label: "Proyectos" },
  { key: "upload", label: "Nueva idea" },
  { key: "analysis", label: "Análisis" },
  { key: "direction", label: "Dirección" },
  { key: "explorer", label: "Explorador" },
  { key: "combine", label: "Combinar" },
  { key: "compact", label: "Compactar" },
  { key: "export", label: "Exportar" },
];

export default function RiffLabApp() {
  const [screen, setScreen] = useState("dashboard");
  const [maxStageIndex, setMaxStageIndex] = useState(0);
  const [projects, setProjects] = useState([
    { id: "p1", name: "Bruma de Marzo", generations: 12, updated: "hace 2 días" },
    { id: "p2", name: "Eco Suspendido", generations: 4, updated: "hace 1 semana" },
  ]);

  const [tracks, setTracks] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [direction, setDirection] = useState({
    genre: null,
    mood: null,
    complexity: 50,
    instruments: { bass: true, drums: true, chords: true, melody: false, vocal: false, pad: false },
    explore: "Sorpréndeme",
    bpmOverride: null,
    keyOverride: null,
  });
  const [proposals, setProposals] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [compareA, setCompareA] = useState(null);
  const [compareB, setCompareB] = useState(null);

  const [combineSel, setCombineSel] = useState([]);
  const [combineComponents, setCombineComponents] = useState({});
  const [combineInstruction, setCombineInstruction] = useState("");
  const [combineResult, setCombineResult] = useState(null);

  const [versionHistory, setVersionHistory] = useState([]);
  const [activeVersionId, setActiveVersionId] = useState(null);
  const [appliedRecs, setAppliedRecs] = useState({});
  const [structure, setStructure] = useState(null);

  const engine = useAudioEngine();
  const projectNameRef = useRef("Idea sin título");

  useEffect(() => {
    const idx = STAGES.findIndex((s) => s.key === screen);
    if (idx > maxStageIndex) setMaxStageIndex(idx);
  }, [screen]); // eslint-disable-line

  const goTo = (key) => {
    const idx = STAGES.findIndex((s) => s.key === key);
    if (idx <= maxStageIndex) { engine.stop(); setScreen(key); }
  };

  const resetProject = () => {
    engine.stop();
    setTracks([]); setAnalysis(null); setProposals([]);
    setCombineSel([]); setCombineComponents({}); setCombineResult(null);
    setVersionHistory([]); setActiveVersionId(null); setAppliedRecs({}); setStructure(null);
    setDirection({
      genre: null, mood: null, complexity: 50,
      instruments: { bass: true, drums: true, chords: true, melody: false, vocal: false, pad: false },
      explore: "Sorpréndeme", bpmOverride: null, keyOverride: null,
    });
    setMaxStageIndex(1);
    setScreen("upload");
  };

  return (
    <div className="rl-root">
      <GlobalStyle />
      <TopBar screen={screen} maxStageIndex={maxStageIndex} goTo={goTo} projectName={tracks.length ? projectNameRef.current : null} />
      <main className="rl-main">
        {screen === "dashboard" && (
          <Dashboard projects={projects} onNew={resetProject} onOpen={() => resetProject()} />
        )}
        {screen === "upload" && (
          <UploadScreen
            tracks={tracks} setTracks={setTracks}
            onAnalyze={() => {
              const seedStr = tracks.map((t) => t.name + t.duration).join("|") || "vacio";
              const rng = makeRng(seedStr);
              const bpm = 70 + Math.floor(rng() * 90);
              const rootIndex = Math.floor(rng() * 12);
              const scaleType = rng() < 0.55 ? "minor" : "major";
              const timeSig = rng() < 0.78 ? "4/4" : rng() < 0.6 ? "3/4" : "6/8";
              const compat = Math.round(55 + rng() * 40);
              const instruments = Array.from(new Set(tracks.map((t) => t.instrument)));
              const notes = [
                `Las ideas comparten un centro tonal cercano a ${NOTE_NAMES[rootIndex]} ${scaleType === "minor" ? "menor" : "mayor"}, así que puedo mantenerlas juntas sin transportar nada.`,
                tracks.length > 1
                  ? `Detecto ${tracks.length} pistas con roles distintos; hay espacio para que el arreglo respire entre ellas.`
                  : `Con una sola pista tengo margen para construir el resto del arreglo alrededor suyo.`,
                compat > 80 ? "La relación rítmica entre las ideas es muy consistente." : "Hay pequeñas diferencias de tempo entre las ideas; el arreglo puede absorberlas.",
              ];
              setAnalysis({ bpm, rootIndex, scaleType, timeSig, compat, instruments, notes });
              setDirection((d) => ({ ...d, bpmOverride: bpm, keyOverride: { rootIndex, scaleType } }));
              setMaxStageIndex((m) => Math.max(m, 2));
              setScreen("analysis");
            }}
          />
        )}
        {screen === "analysis" && analysis && (
          <AnalysisScreen analysis={analysis} tracks={tracks} onContinue={() => { setMaxStageIndex((m) => Math.max(m, 3)); setScreen("direction"); }} />
        )}
        {screen === "direction" && (
          <DirectionScreen
            direction={direction} setDirection={setDirection} analysis={analysis}
            onGenerate={() => {
              setGenerating(true);
              setMaxStageIndex((m) => Math.max(m, 4));
              setTimeout(() => {
                const seedBase = `${direction.genre}-${direction.mood}-${direction.complexity}-${tracks.length}`;
                const biasSeq = direction.explore === "Sorpréndeme"
                  ? EXPLORE_OPTIONS
                  : Array(6).fill(direction.explore);
                const cfg = MOOD_CONFIG[direction.mood];
                const bpm = direction.bpmOverride || analysis?.bpm || 100;
                const rootIndex = direction.keyOverride ? direction.keyOverride.rootIndex : (analysis?.rootIndex ?? 0);
                const generated = biasSeq.map((bias, i) => buildProposalSpec({
                  rootIndex, scaleType: cfg.scaleType, progression: cfg.progression, bpm,
                  genre: direction.genre, mood: direction.mood, complexity: direction.complexity,
                  layers: direction.instruments, bias, seedBase, index: i,
                }));
                setProposals(generated);
                setGenerating(false);
                setScreen("explorer");
              }, 1400);
            }}
          />
        )}
        {screen === "explorer" && (
          <ExplorerScreen
            proposals={proposals} setProposals={setProposals} engine={engine}
            compareA={compareA} compareB={compareB} setCompareA={setCompareA} setCompareB={setCompareB}
            onRegenerate={(base) => {
              const seedBase = `${base.id}-regen-${Date.now()}`;
              const biasSeq = EXPLORE_OPTIONS;
              const regenerated = biasSeq.map((bias, i) => buildProposalSpec({
                rootIndex: base.rootIndex, scaleType: base.scaleType, progression: base.progression, bpm: base.bpm,
                genre: base.genre, mood: base.mood, complexity: base.complexity, layers: base.layers,
                bias, seedBase, index: i,
              }));
              setProposals(regenerated);
            }}
            onGoCombine={() => { setMaxStageIndex((m) => Math.max(m, 5)); setScreen("combine"); }}
          />
        )}
        {screen === "combine" && (
          <CombineScreen
            proposals={proposals} engine={engine}
            combineSel={combineSel} setCombineSel={setCombineSel}
            combineComponents={combineComponents} setCombineComponents={setCombineComponents}
            instruction={combineInstruction} setInstruction={setCombineInstruction}
            onCombined={(spec) => {
              setCombineResult(spec);
              setProposals((p) => [...p, spec]);
            }}
            combineResult={combineResult}
            onGoCompact={(spec) => {
              const initial = { id: "v1", label: "Versión inicial", spec, ts: Date.now() };
              setVersionHistory([initial]);
              setActiveVersionId("v1");
              setMaxStageIndex((m) => Math.max(m, 6));
              setScreen("compact");
            }}
          />
        )}
        {screen === "compact" && (
          <CompactScreen
            versionHistory={versionHistory} setVersionHistory={setVersionHistory}
            activeVersionId={activeVersionId} setActiveVersionId={setActiveVersionId}
            appliedRecs={appliedRecs} setAppliedRecs={setAppliedRecs}
            structure={structure} setStructure={setStructure}
            engine={engine}
            onGoExport={() => { setMaxStageIndex((m) => Math.max(m, 7)); setScreen("export"); }}
          />
        )}
        {screen === "export" && (
          <ExportScreen
            versionHistory={versionHistory} activeVersionId={activeVersionId} engine={engine}
            onBack={() => setScreen("explorer")}
          />
        )}
      </main>
      {generating && <GeneratingOverlay />}
    </div>
  );
}

/* ---------------------------------- TopBar ---------------------------------- */

function TopBar({ screen, maxStageIndex, goTo, projectName }) {
  return (
    <header className="rl-topbar">
      <div className="rl-brand">
        <EqLogo />
        <span className="rl-brand-name">RiffLab</span>
        {projectName && <span className="rl-brand-project">/ {projectName}</span>}
      </div>
      <nav className="rl-stagebar">
        {STAGES.map((s, i) => (
          <StageDot
            key={s.key}
            label={s.label}
            done={i < STAGES.findIndex((x) => x.key === screen)}
            current={s.key === screen}
            disabled={i > maxStageIndex}
            onClick={() => goTo(s.key)}
          />
        ))}
      </nav>
    </header>
  );
}

/* ---------------------------------- Dashboard ---------------------------------- */

function Dashboard({ projects, onNew, onOpen }) {
  return (
    <div className="rl-screen">
      <section className="rl-hero">
        <div className="rl-hero-text">
          <p className="rl-eyebrow">Copiloto creativo para músicos</p>
          <h1 className="rl-h1">Sube una idea a medio hacer.<br />Sal con seis caminos posibles.</h1>
          <p className="rl-sub">RiffLab escucha tus riffs, voces o percusiones, entiende cómo se relacionan y propone acompañamientos reales para explorar, combinar y compactar hasta tener algo terminado.</p>
          <button className="rl-btn rl-btn-primary rl-btn-lg" onClick={onNew}>
            <Plus size={18} /> Nueva idea
          </button>
        </div>
        <div className="rl-hero-visual" aria-hidden="true">
          <Waveform peaks={Array.from({ length: 46 }, (_, i) => 0.2 + 0.7 * Math.abs(Math.sin(i / 3)))} height={140} />
        </div>
      </section>

      <div className="rl-section-head">
        <h2 className="rl-h2">Proyectos recientes</h2>
      </div>

      {projects.length === 0 ? (
        <EmptyState onNew={onNew} />
      ) : (
        <div className="rl-grid-cards">
          {projects.map((p) => (
            <button key={p.id} className="rl-card rl-card-project" onClick={onOpen}>
              <div className="rl-card-project-top">
                <FolderOpen size={18} color="var(--accent)" />
                <span className="rl-card-project-count">{p.generations} generaciones</span>
              </div>
              <Waveform peaks={Array.from({ length: 24 }, () => 0.15 + Math.random() * 0.7)} height={28} />
              <h3 className="rl-card-title">{p.name}</h3>
              <p className="rl-card-meta">Actualizado {p.updated}</p>
            </button>
          ))}
          <button className="rl-card rl-card-new" onClick={onNew}>
            <Plus size={22} />
            <span>Nueva idea</span>
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onNew }) {
  return (
    <div className="rl-empty">
      <AudioLines size={30} color="var(--text-secondary)" />
      <p>Todavía no hay proyectos. Sube tu primera idea para empezar a explorar acompañamientos.</p>
      <button className="rl-btn rl-btn-primary" onClick={onNew}><Plus size={16} /> Nueva idea</button>
    </div>
  );
}

/* ---------------------------------- Upload ---------------------------------- */

function UploadScreen({ tracks, setTracks, onAnalyze }) {
  const [dragOver, setDragOver] = useState(false);
  const [loadingCount, setLoadingCount] = useState(0);
  const inputRef = useRef(null);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("audio/") || /\.(wav|mp3|m4a|ogg|flac|aac)$/i.test(f.name));
    if (!files.length) return;
    setLoadingCount((c) => c + files.length);
    for (const file of files) {
      const id = `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const url = URL.createObjectURL(file);
      let peaks = null; let duration = 0;
      try {
        const arrayBuf = await file.arrayBuffer();
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
        peaks = getPeaks(decoded, 64);
        duration = decoded.duration;
        ctx.close();
      } catch (e) {
        peaks = Array.from({ length: 64 }, () => 0.1 + Math.random() * 0.5);
        duration = 0;
      }
      setTracks((prev) => [...prev, {
        id, name: file.name, url, peaks, duration,
        instrument: guessInstrument(file.name),
      }]);
      setLoadingCount((c) => Math.max(0, c - 1));
    }
  };

  return (
    <div className="rl-screen">
      <h1 className="rl-h1-sm">Nueva idea</h1>
      <p className="rl-sub">Sube una o varias pistas: riffs, voces, bajos, percusión o cualquier fragmento suelto.</p>

      <div
        className={`rl-dropzone ${dragOver ? "rl-dropzone-active" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={26} color="var(--accent)" />
        <p className="rl-dropzone-title">Arrastra tus archivos aquí</p>
        <p className="rl-dropzone-sub">o haz clic para elegirlos desde tu equipo</p>
        <div className="rl-dropzone-actions">
          <button className="rl-btn rl-btn-secondary" type="button" onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>Seleccionar archivos</button>
          <button className="rl-btn rl-btn-ghost" type="button" onClick={(e) => e.stopPropagation()} title="Grabación no disponible en este prototipo">
            <Mic size={15} /> Grabar
          </button>
        </div>
        <input ref={inputRef} type="file" accept="audio/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {loadingCount > 0 && (
        <div className="rl-inline-loading"><Loader2 size={14} className="rl-spin" /> Cargando {loadingCount} pista(s)…</div>
      )}

      {tracks.length > 0 && (
        <div className="rl-tracklist">
          {tracks.map((t) => (
            <div key={t.id} className="rl-track-row">
              <div className="rl-track-info">
                <p className="rl-track-name">{t.name}</p>
                <p className="rl-track-meta">{t.duration ? `${t.duration.toFixed(1)}s` : "duración desconocida"}</p>
              </div>
              <Waveform peaks={t.peaks} height={30} color="var(--accent-2)" />
              <select
                className="rl-select rl-select-sm"
                value={t.instrument}
                onChange={(e) => setTracks((prev) => prev.map((x) => x.id === t.id ? { ...x, instrument: e.target.value } : x))}
              >
                {TRACK_INSTRUMENTS.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
              <button className="rl-icon-btn" onClick={() => setTracks((prev) => prev.filter((x) => x.id !== t.id))} title="Eliminar pista">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rl-actions-row">
        <button
          className="rl-btn rl-btn-primary rl-btn-lg"
          disabled={tracks.length === 0}
          onClick={onAnalyze}
        >
          Analizar ideas <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------- Analysis ---------------------------------- */

function AnalysisScreen({ analysis, tracks, onContinue }) {
  const keyLabel = `${NOTE_NAMES[analysis.rootIndex]} ${analysis.scaleType === "minor" ? "menor" : "mayor"}`;
  return (
    <div className="rl-screen">
      <h1 className="rl-h1-sm">Análisis musical</h1>
      <p className="rl-sub">Esto es lo que RiffLab detecta a partir de tus pistas.</p>

      <div className="rl-grid-4">
        <StatCard label="BPM" value={analysis.bpm} mono />
        <StatCard label="Tonalidad" value={keyLabel} />
        <StatCard label="Compás" value={analysis.timeSig} mono />
        <StatCard label="Compatibilidad" value={fmtPct(analysis.compat)} accent={analysis.compat > 75} />
      </div>

      <div className="rl-panel rl-panel-pad">
        <p className="rl-label">Instrumentos detectados</p>
        <div className="rl-chip-row">
          {analysis.instruments.map((i) => <span key={i} className="rl-chip">{i}</span>)}
        </div>
      </div>

      <div className="rl-panel rl-panel-pad">
        <p className="rl-label">Waveforms</p>
        {tracks.map((t) => (
          <div key={t.id} className="rl-wave-row">
            <span className="rl-wave-row-label">{t.name}</span>
            <Waveform peaks={t.peaks} height={26} />
          </div>
        ))}
      </div>

      <div className="rl-panel rl-panel-pad rl-panel-accent">
        <p className="rl-label"><Sparkles size={13} /> Qué veo en tus ideas</p>
        <ul className="rl-notes">
          {analysis.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      </div>

      <div className="rl-actions-row">
        <button className="rl-btn rl-btn-primary rl-btn-lg" onClick={onContinue}>Continuar a explorar <ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

function StatCard({ label, value, mono, accent }) {
  return (
    <div className="rl-panel rl-stat">
      <p className="rl-label">{label}</p>
      <p className={`rl-stat-value ${mono ? "rl-mono" : ""} ${accent ? "rl-accent-text" : ""}`}>{value}</p>
    </div>
  );
}

/* ---------------------------------- Direction ---------------------------------- */

function DirectionScreen({ direction, setDirection, analysis, onGenerate }) {
  const set = (patch) => setDirection((d) => ({ ...d, ...patch }));
  const canGenerate = direction.genre && direction.mood;

  return (
    <div className="rl-screen">
      <h1 className="rl-h1-sm">Dirección creativa</h1>
      <p className="rl-sub">Define hacia dónde quieres llevar el arreglo. RiffLab generará seis alternativas a partir de esto.</p>

      <div className="rl-panel rl-panel-pad">
        <p className="rl-label">Género</p>
        <div className="rl-chip-row">
          {GENRES.map((g) => <Pill key={g} active={direction.genre === g} onClick={() => set({ genre: g })}>{g}</Pill>)}
        </div>
      </div>

      <div className="rl-panel rl-panel-pad">
        <p className="rl-label">Mood</p>
        <div className="rl-chip-row">
          {MOODS.map((m) => <Pill key={m} active={direction.mood === m} onClick={() => set({ mood: m })}>{m}</Pill>)}
        </div>
      </div>

      <div className="rl-panel rl-panel-pad">
        <p className="rl-label">Complejidad</p>
        <div className="rl-slider-row">
          <span className="rl-slider-end">Minimalista</span>
          <input
            type="range" min={0} max={100} value={direction.complexity}
            onChange={(e) => set({ complexity: Number(e.target.value) })}
            className="rl-slider"
          />
          <span className="rl-slider-end">Complejo</span>
        </div>
      </div>

      <div className="rl-grid-2">
        <div className="rl-panel rl-panel-pad">
          <p className="rl-label">BPM</p>
          <input
            type="number" className="rl-input"
            value={direction.bpmOverride ?? analysis?.bpm ?? 100}
            onChange={(e) => set({ bpmOverride: Number(e.target.value) })}
          />
        </div>
        <div className="rl-panel rl-panel-pad">
          <p className="rl-label">Tonalidad</p>
          <div className="rl-key-row">
            <select
              className="rl-select"
              value={direction.keyOverride ? direction.keyOverride.rootIndex : (analysis?.rootIndex ?? 0)}
              onChange={(e) => set({ keyOverride: { ...(direction.keyOverride || { scaleType: analysis?.scaleType || "minor" }), rootIndex: Number(e.target.value) } })}
            >
              {NOTE_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
            </select>
            <select
              className="rl-select"
              value={direction.keyOverride ? direction.keyOverride.scaleType : (analysis?.scaleType || "minor")}
              onChange={(e) => set({ keyOverride: { ...(direction.keyOverride || { rootIndex: analysis?.rootIndex || 0 }), scaleType: e.target.value } })}
            >
              <option value="major">mayor</option>
              <option value="minor">menor</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rl-panel rl-panel-pad">
        <p className="rl-label">Instrumentos a generar</p>
        <div className="rl-chip-row">
          {INSTRUMENT_OPTIONS.map((opt) => (
            <Pill
              key={opt.key}
              active={direction.instruments[opt.key]}
              onClick={() => set({ instruments: { ...direction.instruments, [opt.key]: !direction.instruments[opt.key] } })}
            >
              {opt.label}
            </Pill>
          ))}
        </div>
      </div>

      <div className="rl-panel rl-panel-pad">
        <p className="rl-label">Exploración</p>
        <div className="rl-chip-row">
          {EXPLORE_OPTIONS.map((o) => <Pill key={o} active={direction.explore === o} onClick={() => set({ explore: o })}>{o}</Pill>)}
        </div>
      </div>

      <div className="rl-actions-row">
        <button className="rl-btn rl-btn-primary rl-btn-lg" disabled={!canGenerate} onClick={onGenerate}>
          <Wand2 size={16} /> Generar 6 ideas
        </button>
        {!canGenerate && <span className="rl-hint">Elige un género y un mood para continuar.</span>}
      </div>
    </div>
  );
}

function GeneratingOverlay() {
  return (
    <div className="rl-overlay">
      <div className="rl-overlay-card">
        <EqLogo size={34} />
        <p className="rl-overlay-title">Generando alternativas…</p>
        <p className="rl-overlay-sub">Componiendo bajo, armonía y ritmo sobre tu idea</p>
      </div>
    </div>
  );
}

/* ---------------------------------- Explorer ---------------------------------- */

function ProposalCard({ p, engine, onLike, onSave, onRegenerate, onCombineToggle, combineChecked, compareBadge }) {
  const isPlaying = engine.playingId === p.id;
  return (
    <div className={`rl-panel rl-proposal ${p.origin ? "rl-proposal-combo" : ""}`}>
      <div className="rl-proposal-top">
        <div>
          <h3 className="rl-card-title">{p.name}</h3>
          <p className="rl-proposal-bias">{p.bias}{p.origin ? " · combinación" : ""}</p>
        </div>
        {compareBadge && <span className="rl-chip rl-chip-accent2">{compareBadge}</span>}
      </div>
      <p className="rl-proposal-desc">{describeProposal(p)}</p>
      <Waveform
        peaks={Array.from({ length: 40 }, (_, i) => {
          const layerCount = Object.values(p.layers).filter(Boolean).length;
          return 0.15 + 0.55 * Math.abs(Math.sin((i + layerCount) / (2.5 - p.complexity / 250)));
        })}
        height={34}
        color={isPlaying ? "var(--accent-2)" : "var(--accent)"}
        active={isPlaying}
      />
      <div className="rl-proposal-meta">
        <span className="rl-mono">{p.bpm} BPM</span>
        <span>·</span>
        <span>{NOTE_NAMES[p.rootIndex]} {p.scaleType === "minor" ? "menor" : "mayor"}</span>
        <span>·</span>
        <span>{Object.entries(p.layers).filter(([, v]) => v).length} capas</span>
      </div>
      <div className="rl-proposal-actions">
        <button className="rl-icon-btn rl-icon-btn-lg rl-icon-btn-accent" onClick={() => (isPlaying ? engine.stop() : engine.play(p))} title={isPlaying ? "Pausar" : "Reproducir"}>
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className={`rl-icon-btn ${p.liked ? "rl-icon-btn-on" : ""}`} onClick={onLike} title="Me gusta"><Heart size={15} /></button>
        <button className={`rl-icon-btn ${p.saved ? "rl-icon-btn-on" : ""}`} onClick={onSave} title="Guardar"><Bookmark size={15} /></button>
        <button className="rl-icon-btn" onClick={onRegenerate} title="Regenerar desde esta idea"><Shuffle size={15} /></button>
        <button className={`rl-icon-btn ${combineChecked ? "rl-icon-btn-on" : ""}`} onClick={onCombineToggle} title="Elegir para combinar"><GitMerge size={15} /></button>
      </div>
    </div>
  );
}

function ExplorerScreen({ proposals, setProposals, engine, compareA, compareB, setCompareA, setCompareB, onRegenerate, onGoCombine }) {
  const [selectedForCombine, setSelectedForCombine] = useState([]);
  const toggleFlag = (id, key) => setProposals((prev) => prev.map((p) => p.id === id ? { ...p, [key]: !p[key] } : p));
  const toggleCombine = (id) => setSelectedForCombine((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  return (
    <div className="rl-screen">
      <div className="rl-screen-head-row">
        <div>
          <h1 className="rl-h1-sm">Explorador de ideas</h1>
          <p className="rl-sub">Escucha, compara y marca lo que te convence. Puedes regenerar desde cualquier propuesta.</p>
        </div>
        <button className="rl-btn rl-btn-primary" disabled={selectedForCombine.length < 2} onClick={() => { onGoCombine(); }}>
          <GitMerge size={15} /> Combinar seleccionadas ({selectedForCombine.length})
        </button>
      </div>

      <div className="rl-compare-row">
        <div className="rl-compare-slot">
          <p className="rl-label">A/B — A</p>
          <select className="rl-select" value={compareA || ""} onChange={(e) => setCompareA(e.target.value || null)}>
            <option value="">Elegir propuesta</option>
            {proposals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="rl-compare-slot">
          <p className="rl-label">A/B — B</p>
          <select className="rl-select" value={compareB || ""} onChange={(e) => setCompareB(e.target.value || null)}>
            <option value="">Elegir propuesta</option>
            {proposals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      <div className="rl-grid-cards rl-grid-proposals">
        {proposals.map((p) => (
          <ProposalCard
            key={p.id}
            p={p}
            engine={engine}
            onLike={() => toggleFlag(p.id, "liked")}
            onSave={() => toggleFlag(p.id, "saved")}
            onRegenerate={() => onRegenerate(p)}
            onCombineToggle={() => toggleCombine(p.id)}
            combineChecked={selectedForCombine.includes(p.id)}
            compareBadge={p.id === compareA ? "A" : p.id === compareB ? "B" : null}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- Combine ---------------------------------- */

const COMPONENT_KEYS = [
  { key: "bass", label: "Bajo" },
  { key: "drums", label: "Batería" },
  { key: "chords", label: "Armonía" },
  { key: "melody", label: "Melodía" },
  { key: "vocal", label: "Adornos" },
  { key: "pad", label: "Ambiente" },
];

function CombineScreen({ proposals, engine, combineSel, setCombineSel, combineComponents, setCombineComponents, instruction, setInstruction, onCombined, combineResult, onGoCompact }) {
  const available = proposals.filter((p) => !p.origin);

  const toggleSel = (id) => setCombineSel((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const parseInstruction = () => {
    const text = instruction.toLowerCase();
    const map = { bajo: "bass", "batería": "drums", "bateria": "drums", armonía: "chords", armonia: "chords", acordes: "chords", melodía: "melody", melodia: "melody", adornos: "vocal", ambiente: "pad" };
    const next = { ...combineComponents };
    Object.entries(map).forEach(([word, compKey]) => {
      const re = new RegExp(word + "[^.,]*?\\bde\\s+([a-záéíóúñ0-9 ]+)", "i");
      const m = text.match(re);
      if (m) {
        const guess = m[1].trim();
        const found = available.find((p) => p.name.toLowerCase().includes(guess) || guess.includes(p.name.toLowerCase().split(" ")[0]));
        if (found) next[compKey] = found.id;
      }
    });
    setCombineComponents(next);
  };

  const generateCombo = () => {
    const chosenIds = Object.values(combineComponents).filter(Boolean);
    const primary = available.find((p) => p.id === (chosenIds[0] || combineSel[0])) || available[0];
    if (!primary) return;
    const layers = {};
    COMPONENT_KEYS.forEach(({ key }) => {
      const sourceId = combineComponents[key];
      const source = available.find((p) => p.id === sourceId);
      layers[key] = source ? !!source.layers[key] : !!primary.layers[key];
    });
    const seed = `combo-${Date.now()}`;
    const spec = {
      ...primary,
      id: seed,
      seed,
      name: `${primary.name.split(" ")[0]} · combinación`,
      bias: "Combinación",
      layers,
      liked: false,
      saved: false,
      origin: combineSel,
    };
    onCombined(spec);
  };

  return (
    <div className="rl-screen">
      <h1 className="rl-h1-sm">Combinar ideas</h1>
      <p className="rl-sub">Elige qué propuestas participan y de cuál toma cada componente.</p>

      <div className="rl-panel rl-panel-pad">
        <p className="rl-label">Propuestas seleccionadas</p>
        <div className="rl-chip-row">
          {available.map((p) => (
            <Pill key={p.id} active={combineSel.includes(p.id)} onClick={() => toggleSel(p.id)}>{p.name}</Pill>
          ))}
        </div>
      </div>

      <div className="rl-panel rl-panel-pad">
        <p className="rl-label">Elegir componentes</p>
        <div className="rl-combine-grid">
          {COMPONENT_KEYS.map(({ key, label }) => (
            <div key={key} className="rl-combine-row">
              <span className="rl-combine-label">{label}</span>
              <select
                className="rl-select"
                value={combineComponents[key] || ""}
                onChange={(e) => setCombineComponents((c) => ({ ...c, [key]: e.target.value || undefined }))}
              >
                <option value="">Sin definir (usa la base)</option>
                {(combineSel.length ? available.filter((p) => combineSel.includes(p.id)) : available).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="rl-panel rl-panel-pad">
        <p className="rl-label">Instrucción (opcional)</p>
        <div className="rl-instruction-row">
          <input
            className="rl-input"
            placeholder='Ej: "Quiero el bajo de Deriva Nocturna y la batería de Eco Suspendido"'
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <button className="rl-btn rl-btn-secondary" onClick={parseInstruction} type="button">Aplicar</button>
        </div>
      </div>

      <div className="rl-actions-row">
        <button className="rl-btn rl-btn-primary rl-btn-lg" disabled={combineSel.length < 1} onClick={generateCombo}>
          <GitMerge size={16} /> Generar combinación
        </button>
      </div>

      {combineResult && (
        <div className="rl-panel rl-panel-pad rl-panel-accent2">
          <p className="rl-label">Combinación resultante</p>
          <ProposalCard p={combineResult} engine={engine} onLike={() => {}} onSave={() => {}} onRegenerate={() => {}} onCombineToggle={() => {}} combineChecked={false} />
          <div className="rl-actions-row">
            <button className="rl-btn rl-btn-primary" onClick={() => onGoCompact(combineResult)}>
              Continuar a compactar <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Compact ---------------------------------- */

function buildStructure(spec, rng) {
  const bars = { intro: 4, desarrollo: 8, clímax: 4, salida: 4 };
  return [
    { name: "Intro", bars: bars.intro, note: spec.layers.pad ? "capa ambiental sola, entra el bajo al final" : "bajo y acordes a media densidad" },
    { name: "Desarrollo", bars: bars.desarrollo, note: spec.layers.melody ? "entra la melodía secundaria sobre la base" : "capas rítmicas se afianzan" },
    { name: "Clímax", bars: bars.clímax, note: spec.complexity > 55 ? "densidad máxima, todas las capas activas" : "un elemento nuevo sutil, sin saturar" },
    { name: "Salida", bars: bars.salida, note: "retirar capas una a una hasta la base original" },
  ];
}

function CompactScreen({ versionHistory, setVersionHistory, activeVersionId, setActiveVersionId, appliedRecs, setAppliedRecs, structure, setStructure, engine, onGoExport }) {
  const activeVersion = versionHistory.find((v) => v.id === activeVersionId) || versionHistory[0];
  const spec = activeVersion?.spec;

  useEffect(() => {
    if (spec && !structure) {
      const rng = makeRng(spec.seed + "-structure");
      setStructure(buildStructure(spec, rng));
    }
  }, [spec]); // eslint-disable-line

  if (!spec) return null;

  const rng = makeRng(spec.seed + "-recs");
  const recs = RECOMMENDATION_BANK.filter((r) => r.cond(spec)).slice(0, 5);

  const applyRec = (rec) => {
    setAppliedRecs((prev) => ({ ...prev, [rec.id]: true }));
    const patch = rec.apply;
    const newLayers = { ...spec.layers };
    if (patch.toggleLayerOff) newLayers[patch.toggleLayerOff] = false;
    if (patch.toggleLayerOn) newLayers[patch.toggleLayerOn] = true;
    const newComplexity = Math.max(5, Math.min(100, spec.complexity + (patch.complexityDelta || 0)));
    const newSpec = { ...spec, layers: newLayers, complexity: newComplexity, seed: spec.seed + "-r" + rec.id };
    updateActiveVersionSpec(newSpec);
  };

  const applyAll = () => { recs.forEach((r) => { if (!appliedRecs[r.id]) applyRec(r); }); };

  function updateActiveVersionSpec(newSpec) {
    setVersionHistory((prev) => prev.map((v) => v.id === activeVersionId ? { ...v, spec: newSpec } : v));
  }

  const generateNewVersion = () => {
    const idx = versionHistory.length + 1;
    const newV = { id: `v${idx}`, label: `Versión ${idx}`, spec: { ...spec, seed: spec.seed + "-v" + idx }, ts: Date.now() };
    setVersionHistory((prev) => [...prev, newV]);
    setActiveVersionId(newV.id);
    setAppliedRecs({});
    setStructure(null);
  };

  const isPlaying = engine.playingId === spec.id;

  return (
    <div className="rl-screen">
      <h1 className="rl-h1-sm">Compactar idea</h1>
      <p className="rl-sub">Recomendaciones para pasar de una idea dispersa a un arreglo más compacto y coherente.</p>

      <div className="rl-panel rl-panel-pad">
        <div className="rl-version-row">
          <p className="rl-label">Versión activa</p>
          <div className="rl-chip-row">
            {versionHistory.map((v) => <Pill key={v.id} active={v.id === activeVersionId} onClick={() => setActiveVersionId(v.id)}>{v.label}</Pill>)}
          </div>
        </div>
        <div className="rl-proposal-actions" style={{ marginTop: 12 }}>
          <button className="rl-icon-btn rl-icon-btn-lg rl-icon-btn-accent" onClick={() => (isPlaying ? engine.stop() : engine.play(spec))}>
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <span className="rl-mono">{spec.bpm} BPM</span>
          <span>{NOTE_NAMES[spec.rootIndex]} {spec.scaleType === "minor" ? "menor" : "mayor"}</span>
          <span>Complejidad {Math.round(spec.complexity)}%</span>
        </div>
      </div>

      {structure && (
        <div className="rl-panel rl-panel-pad">
          <p className="rl-label">Estructura sugerida</p>
          <div className="rl-structure-row">
            {structure.map((s) => (
              <div key={s.name} className="rl-structure-block">
                <p className="rl-structure-name">{s.name}</p>
                <p className="rl-structure-bars rl-mono">{s.bars} compases</p>
                <p className="rl-structure-note">{s.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rl-panel rl-panel-pad">
        <div className="rl-screen-head-row">
          <p className="rl-label">Recomendaciones</p>
          <button className="rl-btn rl-btn-secondary rl-btn-sm" onClick={applyAll}>Aplicar todas</button>
        </div>
        <ul className="rl-recs">
          {recs.map((r) => (
            <li key={r.id} className="rl-rec-row">
              <span>{r.text}</span>
              <button className={`rl-btn rl-btn-sm ${appliedRecs[r.id] ? "rl-btn-done" : "rl-btn-secondary"}`} onClick={() => applyRec(r)} disabled={appliedRecs[r.id]}>
                {appliedRecs[r.id] ? <><Check size={13} /> Aplicada</> : "Aplicar"}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rl-actions-row">
        <button className="rl-btn rl-btn-secondary" onClick={generateNewVersion}><RotateCcw size={15} /> Generar nueva versión</button>
        <button className="rl-btn rl-btn-primary rl-btn-lg" onClick={onGoExport}>Ir a exportar <ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

/* ---------------------------------- Export ---------------------------------- */

function ExportScreen({ versionHistory, activeVersionId, engine, onBack }) {
  const version = versionHistory.find((v) => v.id === activeVersionId) || versionHistory[versionHistory.length - 1];
  const [rendering, setRendering] = useState(false);
  const [wavUrl, setWavUrl] = useState(null);
  const spec = version?.spec;
  const isPlaying = spec && engine.playingId === spec.id;

  if (!spec) return null;

  const doExport = async () => {
    setRendering(true);
    try {
      const blob = await engine.renderWav(spec, 4);
      const url = URL.createObjectURL(blob);
      setWavUrl(url);
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="rl-screen">
      <h1 className="rl-h1-sm">Exportar</h1>
      <p className="rl-sub">Descarga la mezcla final de tu versión compactada.</p>

      <div className="rl-panel rl-panel-pad">
        <div className="rl-proposal-actions">
          <button className="rl-icon-btn rl-icon-btn-lg rl-icon-btn-accent" onClick={() => (isPlaying ? engine.stop() : engine.play(spec))}>
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <div>
            <p className="rl-card-title">{spec.name}</p>
            <p className="rl-proposal-meta"><span className="rl-mono">{spec.bpm} BPM</span> · {NOTE_NAMES[spec.rootIndex]} {spec.scaleType === "minor" ? "menor" : "mayor"}</p>
          </div>
        </div>
      </div>

      <div className="rl-panel rl-panel-pad">
        <p className="rl-label">Mezcla final</p>
        <div className="rl-export-actions">
          <button className="rl-btn rl-btn-primary rl-btn-lg" onClick={doExport} disabled={rendering}>
            {rendering ? <><Loader2 size={15} className="rl-spin" /> Renderizando…</> : <><Download size={16} /> Exportar mezcla (WAV)</>}
          </button>
          {wavUrl && (
            <a className="rl-btn rl-btn-secondary" href={wavUrl} download={`${spec.name.replace(/\s+/g, "_")}.wav`}>
              <Download size={15} /> Descargar archivo
            </a>
          )}
        </div>
        <p className="rl-hint" style={{ marginTop: 10 }}>Exportación a MP3 y separación en stems: disponible en fases posteriores.</p>
      </div>

      <div className="rl-actions-row">
        <button className="rl-btn rl-btn-ghost" onClick={onBack}><ArrowLeft size={15} /> Volver al explorador</button>
      </div>
    </div>
  );
}

/* ---------------------------------- estilos globales ---------------------------------- */

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

      .rl-root {
        --bg: #0B0D10;
        --panel: #15181D;
        --panel-2: #20242B;
        --text: #F4F6F8;
        --text-secondary: #9AA1AB;
        --accent: #7C5CFF;
        --accent-2: #21D4A7;
        --border: #30353D;
        background: var(--bg);
        color: var(--text);
        font-family: 'Inter', sans-serif;
        min-height: 100%;
        border-radius: 14px;
        overflow: hidden;
      }
      .rl-root * { box-sizing: border-box; }
      .rl-root button { font-family: 'Inter', sans-serif; cursor: pointer; }
      .rl-root select, .rl-root input { font-family: 'Inter', sans-serif; }
      .rl-mono { font-family: 'JetBrains Mono', monospace; }

      .rl-topbar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 20px; border-bottom: 1px solid var(--border);
        background: var(--panel); flex-wrap: wrap; gap: 10px;
      }
      .rl-brand { display: flex; align-items: center; gap: 10px; }
      .rl-brand-name { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 17px; letter-spacing: 0.2px; }
      .rl-brand-project { color: var(--text-secondary); font-size: 13px; }

      .rl-eq { display: flex; align-items: flex-end; gap: 2px; }
      .rl-eq span { flex: 1; background: var(--accent); border-radius: 1px; animation: rl-eq-bounce 1.1s ease-in-out infinite; }
      .rl-eq span:nth-child(1) { height: 40%; animation-delay: 0s; }
      .rl-eq span:nth-child(2) { height: 90%; animation-delay: 0.15s; }
      .rl-eq span:nth-child(3) { height: 60%; animation-delay: 0.3s; }
      .rl-eq span:nth-child(4) { height: 75%; animation-delay: 0.45s; }
      @keyframes rl-eq-bounce { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
      @media (prefers-reduced-motion: reduce) { .rl-eq span { animation: none; } }

      .rl-stagebar { display: flex; gap: 4px; overflow-x: auto; }
      .rl-stage-dot { display: flex; flex-direction: column; align-items: center; gap: 4px; background: none; border: none; padding: 4px 8px; }
      .rl-stage-dot:disabled { opacity: 0.35; cursor: not-allowed; }
      .rl-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--border); }
      .rl-dot-done { background: var(--accent-2); }
      .rl-dot-current { background: var(--accent); box-shadow: 0 0 0 3px rgba(124,92,255,0.25); }
      .rl-stage-label { font-size: 10px; color: var(--text-secondary); white-space: nowrap; }
      .rl-stage-label-current { color: var(--text); font-weight: 600; }

      .rl-main { padding: 26px 20px 60px; max-width: 1080px; margin: 0 auto; }
      .rl-screen { display: flex; flex-direction: column; gap: 20px; }

      .rl-eyebrow { color: var(--accent-2); font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 600; margin: 0 0 10px; }
      .rl-h1 { font-family: 'Space Grotesk', sans-serif; font-size: 34px; line-height: 1.15; font-weight: 700; margin: 0 0 14px; }
      .rl-h1-sm { font-family: 'Space Grotesk', sans-serif; font-size: 26px; font-weight: 700; margin: 0; }
      .rl-h2 { font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 600; margin: 0; }
      .rl-sub { color: var(--text-secondary); font-size: 14.5px; line-height: 1.6; max-width: 620px; margin: 0; }

      .rl-hero { display: flex; align-items: center; justify-content: space-between; gap: 30px; padding: 30px 8px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
      .rl-hero-text { flex: 1; min-width: 280px; }
      .rl-hero-visual { flex: 1; min-width: 220px; opacity: 0.85; }

      .rl-section-head { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; }
      .rl-screen-head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; flex-wrap: wrap; }

      .rl-btn { display: inline-flex; align-items: center; gap: 7px; border-radius: 10px; border: 1px solid transparent; padding: 9px 16px; font-size: 13.5px; font-weight: 600; transition: transform 0.1s ease, opacity 0.15s ease; }
      .rl-btn:active { transform: scale(0.97); }
      .rl-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .rl-btn-primary { background: var(--accent); color: #fff; }
      .rl-btn-primary:hover:not(:disabled) { opacity: 0.9; }
      .rl-btn-secondary { background: var(--panel-2); color: var(--text); border-color: var(--border); }
      .rl-btn-secondary:hover:not(:disabled) { border-color: var(--accent); }
      .rl-btn-ghost { background: transparent; color: var(--text-secondary); }
      .rl-btn-ghost:hover { color: var(--text); }
      .rl-btn-lg { padding: 12px 20px; font-size: 14.5px; }
      .rl-btn-sm { padding: 6px 11px; font-size: 12px; }
      .rl-btn-done { background: rgba(33,212,167,0.15); color: var(--accent-2); border-color: var(--accent-2); }

      .rl-icon-btn { width: 32px; height: 32px; border-radius: 9px; background: var(--panel-2); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; color: var(--text-secondary); }
      .rl-icon-btn:hover { color: var(--text); border-color: var(--accent); }
      .rl-icon-btn-on { color: var(--accent-2); border-color: var(--accent-2); }
      .rl-icon-btn-lg { width: 40px; height: 40px; }
      .rl-icon-btn-accent { background: var(--accent); color: #fff; border-color: var(--accent); }
      .rl-icon-btn-accent:hover { color: #fff; opacity: 0.9; }

      .rl-panel { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; }
      .rl-panel-pad { padding: 16px 18px; }
      .rl-panel-accent { border-color: rgba(124,92,255,0.35); background: linear-gradient(180deg, rgba(124,92,255,0.06), var(--panel)); }
      .rl-panel-accent2 { border-color: rgba(33,212,167,0.35); background: linear-gradient(180deg, rgba(33,212,167,0.06), var(--panel)); }

      .rl-label { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); margin: 0 0 10px; display: flex; align-items: center; gap: 6px; }

      .rl-grid-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
      .rl-grid-proposals { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
      .rl-grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; }
      .rl-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }

      .rl-card { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 16px; text-align: left; display: flex; flex-direction: column; gap: 8px; color: var(--text); }
      .rl-card-project:hover { border-color: var(--accent); }
      .rl-card-project-top { display: flex; align-items: center; justify-content: space-between; }
      .rl-card-project-count { font-size: 11px; color: var(--text-secondary); }
      .rl-card-title { font-family: 'Space Grotesk', sans-serif; font-size: 15.5px; font-weight: 600; margin: 4px 0 0; }
      .rl-card-meta { font-size: 12px; color: var(--text-secondary); margin: 0; }
      .rl-card-new { align-items: center; justify-content: center; color: var(--text-secondary); border-style: dashed; }
      .rl-card-new:hover { color: var(--accent); border-color: var(--accent); }

      .rl-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 50px 20px; border: 1px dashed var(--border); border-radius: 14px; text-align: center; color: var(--text-secondary); }
      .rl-empty p { max-width: 360px; font-size: 13.5px; }

      .rl-wave { display: flex; align-items: flex-end; gap: 2px; width: 100%; }
      .rl-wave-bar { flex: 1; min-width: 2px; border-radius: 1px; opacity: 0.75; transition: height 0.2s ease; }
      .rl-wave-bar-active { animation: rl-wave-pulse 0.9s ease-in-out infinite; }
      @keyframes rl-wave-pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
      @media (prefers-reduced-motion: reduce) { .rl-wave-bar-active { animation: none; opacity: 1; } }

      .rl-dropzone { border: 1.5px dashed var(--border); border-radius: 16px; padding: 40px 20px; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; cursor: pointer; transition: border-color 0.15s ease, background 0.15s ease; }
      .rl-dropzone:hover, .rl-dropzone-active { border-color: var(--accent); background: rgba(124,92,255,0.05); }
      .rl-dropzone-title { font-weight: 600; margin: 8px 0 0; }
      .rl-dropzone-sub { color: var(--text-secondary); font-size: 13px; margin: 0; }
      .rl-dropzone-actions { display: flex; gap: 10px; margin-top: 14px; }

      .rl-inline-loading { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 13px; }
      .rl-spin { animation: rl-spin 0.9s linear infinite; }
      @keyframes rl-spin { to { transform: rotate(360deg); } }

      .rl-tracklist { display: flex; flex-direction: column; gap: 8px; }
      .rl-track-row { display: grid; grid-template-columns: minmax(120px,1fr) minmax(100px,1.4fr) 130px 32px; align-items: center; gap: 14px; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 10px 14px; }
      .rl-track-info { min-width: 0; }
      .rl-track-name { font-size: 13.5px; font-weight: 500; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .rl-track-meta { font-size: 11.5px; color: var(--text-secondary); margin: 2px 0 0; }
      .rl-wave-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
      .rl-wave-row-label { font-size: 12px; color: var(--text-secondary); width: 120px; flex-shrink: 0; }

      .rl-select, .rl-input { background: var(--panel-2); border: 1px solid var(--border); color: var(--text); border-radius: 9px; padding: 8px 10px; font-size: 13px; width: 100%; }
      .rl-select:focus, .rl-input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
      .rl-select-sm { width: auto; }
      .rl-key-row { display: flex; gap: 8px; }

      .rl-actions-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding-top: 4px; }
      .rl-hint { font-size: 12.5px; color: var(--text-secondary); }

      .rl-chip-row { display: flex; gap: 8px; flex-wrap: wrap; }
      .rl-chip { font-size: 12px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 20px; padding: 5px 12px; color: var(--text-secondary); }
      .rl-chip-accent2 { background: rgba(33,212,167,0.15); border-color: var(--accent-2); color: var(--accent-2); font-weight: 600; }

      .rl-pill { background: var(--panel-2); border: 1px solid var(--border); color: var(--text-secondary); border-radius: 20px; padding: 7px 14px; font-size: 13px; font-weight: 500; transition: all 0.12s ease; }
      .rl-pill:hover { color: var(--text); }
      .rl-pill-active { background: var(--accent); border-color: var(--accent); color: #fff; }

      .rl-slider-row { display: flex; align-items: center; gap: 14px; }
      .rl-slider { flex: 1; accent-color: var(--accent); height: 4px; }
      .rl-slider-end { font-size: 11.5px; color: var(--text-secondary); white-space: nowrap; }

      .rl-stat { padding: 14px 16px; }
      .rl-stat-value { font-family: 'Space Grotesk', sans-serif; font-size: 22px; font-weight: 700; margin: 0; }
      .rl-accent-text { color: var(--accent-2); }

      .rl-notes { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; color: var(--text); }

      .rl-overlay { position: absolute; inset: 0; background: rgba(11,13,16,0.82); display: flex; align-items: center; justify-content: center; border-radius: 14px; }
      .rl-overlay-card { display: flex; flex-direction: column; align-items: center; gap: 12px; }
      .rl-overlay-title { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 16px; margin: 0; }
      .rl-overlay-sub { color: var(--text-secondary); font-size: 13px; margin: 0; }

      .rl-proposal { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
      .rl-proposal-combo { border-color: rgba(33,212,167,0.4); }
      .rl-proposal-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
      .rl-proposal-bias { font-size: 11.5px; color: var(--accent); margin: 2px 0 0; font-weight: 600; }
      .rl-proposal-desc { font-size: 12.5px; color: var(--text-secondary); margin: 0; line-height: 1.5; }
      .rl-proposal-meta { display: flex; gap: 6px; font-size: 12px; color: var(--text-secondary); align-items: center; }
      .rl-proposal-actions { display: flex; gap: 8px; align-items: center; }

      .rl-compare-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px,1fr)); gap: 14px; }
      .rl-compare-slot { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; }

      .rl-combine-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap: 10px; }
      .rl-combine-row { display: flex; align-items: center; gap: 10px; }
      .rl-combine-label { width: 80px; flex-shrink: 0; font-size: 13px; color: var(--text-secondary); }
      .rl-instruction-row { display: flex; gap: 10px; }

      .rl-version-row { display: flex; flex-direction: column; gap: 8px; }
      .rl-structure-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap: 12px; }
      .rl-structure-block { background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
      .rl-structure-name { font-weight: 600; font-size: 13px; margin: 0; }
      .rl-structure-bars { font-size: 11px; color: var(--accent-2); margin: 3px 0 5px; }
      .rl-structure-note { font-size: 12px; color: var(--text-secondary); margin: 0; line-height: 1.4; }

      .rl-recs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
      .rl-rec-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; font-size: 13px; }

      .rl-export-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }

      @media (max-width: 640px) {
        .rl-h1 { font-size: 26px; }
        .rl-track-row { grid-template-columns: 1fr; }
        .rl-wave-row-label { width: auto; }
      }
    `}</style>
  );
}
