/* IGNOSHASHI - Technical indicators (client-side) for chart overlay */
(function (global) {
  'use strict';

  function sma(values, n) {
    const out = []; let s = 0;
    for (let i = 0; i < values.length; i++) {
      s += values[i];
      if (i >= n) s -= values[i - n];
      out.push(i >= n - 1 ? s / n : null);
    }
    return out;
  }
  function ema(values, n) {
    const out = []; const k = 2 / (n + 1); let prev;
    for (let i = 0; i < values.length; i++) {
      if (i === 0) prev = values[i];
      else prev = values[i] * k + prev * (1 - k);
      out.push(prev);
    }
    return out;
  }
  function rsi(values, n) {
    n = n || 14;
    const out = []; let avgG = 0, avgL = 0;
    for (let i = 1; i < values.length; i++) {
      const ch = values[i] - values[i - 1];
      const g = Math.max(ch, 0), l = Math.max(-ch, 0);
      if (i <= n) { avgG = i === 1 ? g : (avgG * (i - 1) + g) / i; avgL = i === 1 ? l : (avgL * (i - 1) + l) / i; }
      else { avgG = (avgG * (n - 1) + g) / n; avgL = (avgL * (n - 1) + l) / n; }
      out.push(avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL));
    }
    return out;
  }
  function bollinger(values, n) {
    n = n || 20;
    const mid = sma(values, n);
    const sd = [];
    for (let i = 0; i < values.length; i++) {
      if (i < n - 1) { sd.push(null); continue; }
      let s = 0;
      for (let j = i - n + 1; j <= i; j++) s += (values[j] - mid[i]) ** 2;
      sd.push(Math.sqrt(s / n));
    }
    return {
      mid,
      upper: mid.map((m, i) => m == null ? null : m + 2 * sd[i]),
      lower: mid.map((m, i) => m == null ? null : m - 2 * sd[i]),
    };
  }
  function macd(values, fast, slow, sig) {
    fast = fast || 12; slow = slow || 26; sig = sig || 9;
    const ef = ema(values, fast), es = ema(values, slow);
    const line = values.map((_, i) => (ef[i] || 0) - (es[i] || 0));
    const sg = ema(line, sig);
    return { line, signal: sg, hist: line.map((v, i) => (v || 0) - (sg[i] || 0)) };
  }

  global.Indicators = { sma, ema, rsi, bollinger, macd };
})(window);
