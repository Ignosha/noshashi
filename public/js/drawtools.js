/* IGNOSHASHI - Chart drawing tools (editing/sketch on candles) */
(function (global) {
  'use strict';

  // Drawings stored in pixel-space (x,y) relative to chart canvas
  let drawings = [];
  let activeTool = null; // 'trend' | 'hline' | 'fib' | 'rect'
  let draft = null; // in-progress drawing
  let canvas = null;
  let ctx = null;

  /* Scale mapping injected by Charts engine so drawings align to candles */
  let scale = { x: (i) => 0, y: (p) => 0, padL: 0, padT: 0 };

  function setScale(s) { scale = s; }

  function setCanvas(c) {
    canvas = c;
    ctx = c && c.getContext('2d');
  }

  function setTool(tool) {
    activeTool = tool;
    if (canvas) canvas.style.cursor = tool ? 'crosshair' : 'default';
  }

  function clear() {
    drawings = [];
    draft = null;
  }

  function getPos(e) {
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onDown(e) {
    if (!activeTool || !canvas) return;
    const p = getPos(e);
    draft = { type: activeTool, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
  }

  function onMove(e) {
    if (!draft || !canvas) return;
    const p = getPos(e);
    draft.x2 = p.x;
    draft.y2 = p.y;
    requestAnimationFrame(redraw);
  }

  function onUp(e) {
    if (!draft) return;
    const p = getPos(e);
    draft.x2 = p.x;
    draft.y2 = p.y;
    // Only commit if there's meaningful distance (avoid accidental clicks)
    if (Math.abs(draft.x2 - draft.x1) > 3 || Math.abs(draft.y2 - draft.y1) > 3) {
      drawings.push({ ...draft });
    }
    draft = null;
    // stay in tool mode for consecutive drawings
  }

  function drawShape(d) {
    if (!ctx) return;
    ctx.save();
    ctx.strokeStyle = '#32f2ff';
    ctx.fillStyle = 'rgba(50,242,255,0.12)';
    ctx.lineWidth = 2;
    const { x1, y1, x2, y2 } = d;

    if (d.type === 'trend') {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    } else if (d.type === 'hline') {
      ctx.beginPath(); ctx.moveTo(20, y1); ctx.lineTo((canvas ? canvas.width : 800) - 20, y1); ctx.stroke();
    } else if (d.type === 'rect') {
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    } else if (d.type === 'fib') {
      // vertical fib between y1 and y2
      const top = Math.min(y1, y2), bot = Math.max(y1, y2);
      const levelColors = ['#ff4d6d', '#ff884d', '#ffe14d', '#37ff8b', '#32f2ff'];
      const pcts = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      const x = Math.min(x1, x2);
      for (let i = 0; i < pcts.length; i++) {
        const yy = top + (bot - top) * pcts[i];
        ctx.strokeStyle = levelColors[i % levelColors.length];
        ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + 120, yy); ctx.stroke();
        ctx.fillStyle = levelColors[i % levelColors.length];
        ctx.font = '10px VT323';
        ctx.fillText((pcts[i] * 100).toFixed(1) + '%', x + 2, yy - 2);
      }
    }
    ctx.restore();
  }

  function redraw() {
    if (!canvas || !ctx) return;
    // The Charts engine calls this after drawing candles
    for (const d of drawings) drawShape(d);
    if (draft) drawShape(draft);
  }

  function clearActive() {
    activeTool = null;
    if (canvas) canvas.style.cursor = 'default';
  }

  global.DrawTools = {
    setScale, setCanvas, setTool, getTool: () => activeTool,
    clear, redraw, onDown, onMove, onUp,
    getDrawings: () => drawings,
    clearActive, clearAll: clear,
  };
})(window);
