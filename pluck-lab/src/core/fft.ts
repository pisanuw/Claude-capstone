/** In-place radix-2 FFT and a Hann-windowed dB spectrum. */

export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n & (n - 1)) throw new Error('FFT size must be a power of two');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/**
 * Magnitude spectrum in dB (bins 0..size/2) of the last `size` samples, Hann
 * windowed and normalized so a full-scale sine reads about 0 dB.
 */
export function spectrumDb(samples: ArrayLike<number>, size: number): Float64Array {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const start = Math.max(0, samples.length - size);
  for (let i = 0; i < size && start + i < samples.length; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
    re[i] = samples[start + i]! * w;
  }
  fft(re, im);
  const out = new Float64Array(size / 2 + 1);
  for (let k = 0; k <= size / 2; k++) {
    const mag = (Math.hypot(re[k]!, im[k]!) * 4) / size;
    out[k] = 20 * Math.log10(mag + 1e-12);
  }
  return out;
}

/**
 * Amplitude of harmonics 1..count of one period stored in `period` (a direct
 * DFT, since the delay line is rarely a power of two long), in dB relative to
 * full scale.
 */
export function harmonicsDb(period: ArrayLike<number>, count: number): Float64Array {
  const n = period.length;
  const out = new Float64Array(count);
  for (let k = 1; k <= count; k++) {
    if (k > n / 2) {
      out[k - 1] = -120;
      continue;
    }
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * k) / n;
    for (let i = 0; i < n; i++) {
      re += period[i]! * Math.cos(w * i);
      im -= period[i]! * Math.sin(w * i);
    }
    out[k - 1] = 20 * Math.log10((2 * Math.hypot(re, im)) / n + 1e-6);
  }
  return out;
}
