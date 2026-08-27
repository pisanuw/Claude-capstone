// Color vision deficiency simulation.
//
// Anomalous trichromacy and dichromacy use the physiologically-based model of
// Machado, Oliveira & Fernandes (2009), "A Physiologically-based Model for
// Simulation of Color Vision Deficiency", IEEE TVCG 15(6). The 3x3 matrices
// below are the authors' published matrices (severity 0.6 for the anomalous
// forms, severity 1.0 for the dichromatic forms), verified against the
// colour-science reference dataset. They are applied in LINEAR sRGB.
//
// Achromatopsia (total color blindness) is simulated as Rec. 709 luminance
// gray in linear light; achromatomaly (partial) as a 50% blend toward it.

import { rgbToLinear, linearToRgb, clamp01, srgbToLinear, linearToSrgb } from './color.js';

// Machado et al. severity 0.6 (moderate anomalous trichromacy).
const PROTANOMALY = [
  0.385450, 0.769005, -0.154455,
  0.100526, 0.829802, 0.069673,
  -0.007442, -0.022190, 1.029632,
];
const DEUTERANOMALY = [
  0.498864, 0.674741, -0.173604,
  0.205199, 0.754872, 0.039929,
  -0.011131, 0.030969, 0.980162,
];
const TRITANOMALY = [
  1.104996, -0.046633, -0.058363,
  -0.032137, 0.971635, 0.060503,
  0.001336, 0.317922, 0.680742,
];

// Machado et al. severity 1.0 (dichromacy).
const PROTANOPIA = [
  0.152286, 1.052583, -0.204868,
  0.114503, 0.786281, 0.099216,
  -0.003882, -0.048116, 1.051998,
];
const DEUTERANOPIA = [
  0.367322, 0.860646, -0.227968,
  0.280085, 0.672501, 0.047413,
  -0.011820, 0.042940, 0.968881,
];
const TRITANOPIA = [
  1.255528, -0.076749, -0.178779,
  -0.078411, 0.930809, 0.147602,
  0.004733, 0.691367, 0.303900,
];

// Rec. 709 luma coefficients (linear light).
const LUMA = [0.2126, 0.7152, 0.0722];

export const CVD_TYPES = [
  { id: 'protanomaly', label: 'Protanomaly', note: 'red-weak · ~1.3% of men', matrix: PROTANOMALY },
  { id: 'protanopia', label: 'Protanopia', note: 'red-blind · ~1.3% of men', matrix: PROTANOPIA },
  { id: 'deuteranomaly', label: 'Deuteranomaly', note: 'green-weak · ~5% of men', matrix: DEUTERANOMALY },
  { id: 'deuteranopia', label: 'Deuteranopia', note: 'green-blind · ~1.2% of men', matrix: DEUTERANOPIA },
  { id: 'tritanomaly', label: 'Tritanomaly', note: 'blue-weak · rare', matrix: TRITANOMALY },
  { id: 'tritanopia', label: 'Tritanopia', note: 'blue-blind · rare', matrix: TRITANOPIA },
  { id: 'achromatomaly', label: 'Achromatomaly', note: 'partial color loss · very rare', matrix: null, gray: 0.5 },
  { id: 'achromatopsia', label: 'Achromatopsia', note: 'no color · very rare', matrix: null, gray: 1 },
];

const TYPE_BY_ID = Object.fromEntries(CVD_TYPES.map((t) => [t.id, t]));

function applyToLinear([r, g, b], type) {
  if (type.matrix) {
    const m = type.matrix;
    return [
      m[0] * r + m[1] * g + m[2] * b,
      m[3] * r + m[4] * g + m[5] * b,
      m[6] * r + m[7] * g + m[8] * b,
    ];
  }
  const y = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
  const t = type.gray;
  return [r + (y - r) * t, g + (y - g) * t, b + (y - b) * t];
}

/** Simulate how one color appears under a deficiency. Returns {r,g,b}. */
export function simulateColor(rgb, typeId) {
  const type = TYPE_BY_ID[typeId];
  if (!type) throw new Error('Unknown CVD type: ' + typeId);
  const out = applyToLinear(rgbToLinear(rgb), type).map(clamp01);
  return linearToRgb(out);
}

// Lookup tables so full-image simulation stays fast without WebGL.
const TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) TO_LINEAR[i] = srgbToLinear(i / 255);
const TO_SRGB = new Uint8ClampedArray(4096);
for (let i = 0; i < 4096; i++) TO_SRGB[i] = Math.round(linearToSrgb(i / 4095) * 255);

/** Simulate a whole ImageData in place-safe fashion (returns a new ImageData). */
export function simulateImageData(imageData, typeId) {
  const type = TYPE_BY_ID[typeId];
  if (!type) throw new Error('Unknown CVD type: ' + typeId);
  const src = imageData.data;
  const out = new Uint8ClampedArray(src.length);
  const m = type.matrix;
  const t = type.gray;
  for (let i = 0; i < src.length; i += 4) {
    const r = TO_LINEAR[src[i]];
    const g = TO_LINEAR[src[i + 1]];
    const b = TO_LINEAR[src[i + 2]];
    let R, G, B;
    if (m) {
      R = m[0] * r + m[1] * g + m[2] * b;
      G = m[3] * r + m[4] * g + m[5] * b;
      B = m[6] * r + m[7] * g + m[8] * b;
    } else {
      const y = LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
      R = r + (y - r) * t;
      G = g + (y - g) * t;
      B = b + (y - b) * t;
    }
    out[i] = TO_SRGB[Math.round(clamp01(R) * 4095)];
    out[i + 1] = TO_SRGB[Math.round(clamp01(G) * 4095)];
    out[i + 2] = TO_SRGB[Math.round(clamp01(B) * 4095)];
    out[i + 3] = src[i + 3];
  }
  return new ImageData(out, imageData.width, imageData.height);
}
