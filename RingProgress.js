/*!
 * RingProgress - 居中灵动圆环进度组件
 * @version 1.1.0
 * @license MIT
 *
 * 用法：
 *   const rp = new RingProgress({ palette: [...] });
 *   rp.start();            // 播放一次
 *   rp.set(0.5);           // 手动设定进度 0~1
 *   rp.reset();            // 归零
 *   rp.destroy();          // 销毁
 *
 * 数字填充策略：
 *   1. 自动判断调色板中哪些颜色是深色（相对亮度 < darkThreshold）
 *   2. 深色数量 >= 2 时，用全部深色做渐变
 *   3. 深色不足 2 个时，取亮度最低的 2 个色兜底
 *   4. 数字外加白色细描边，保证白底可见
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define(factory);
  } else {
    root.RingProgress = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  const DEFAULTS = {
    palette: [
      '#ffadad', '#ffd6a5', '#fdffb6', '#caffbf',
      '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff'
    ],
    size: 180,             // 组件显示尺寸(px)
    radius: 38,            // 半径 (基于 100x100 viewBox)
    stroke: 6,             // 线宽
    duration: 2200,        // 动画时长(ms)
    hold: 1400,            // 完成停留(ms)
    autoStart: false,      // 创建后是否自动播放
    darkThreshold: 0.5,    // 深色判断阈值（0~1，越大越宽松）
    numStroke: 2.2,        // 数字白色描边宽度
    onProgress: null,      // (p: 0~1) => void
    onComplete: null       // () => void
  };

  /* ---------- 工具 ---------- */
  const springEase = (t) => {
    if (t >= 1) return 1;
    const c1 = 1.4, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };

  function el(name, attrs) {
    const e = document.createElementNS(SVG_NS, name);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* ---------- 颜色工具 ---------- */
  function hexToRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return [
      parseInt(h.substr(0, 2), 16),
      parseInt(h.substr(2, 2), 16),
      parseInt(h.substr(4, 2), 16)
    ];
  }

  /** YIQ 相对亮度 0~1 */
  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  function isDark(hex, threshold) {
    return luminance(hex) < threshold;
  }

  /**
   * 从调色板中挑出用于数字填充的颜色
   *  - 全部深色（>=2 个）→ 全部使用
   *  - 深色不足 2 个 → 按亮度升序取最深的 2 个
   */
  function pickNumberColors(palette, threshold) {
    const dark = palette.filter(c => isDark(c, threshold));
    if (dark.length >= 2) return dark;
    return palette
      .slice()
      .sort((a, b) => luminance(a) - luminance(b))
      .slice(0, 2);
  }

  /* ---------- 样式（只注入一次） ---------- */
  const STYLE_ID = 'grp-style';
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      .grp-btn{position:fixed;left:50%;top:50%;padding:0;border:none;border-radius:50%;
        background:transparent;cursor:pointer;z-index:2147483647;display:block;
        transform:translate(-50%,-50%);
        transition:transform .35s cubic-bezier(.34,1.56,.64,1);
        filter:drop-shadow(0 8px 22px rgba(0,0,0,.16));
        -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
      .grp-btn:hover{transform:translate(-50%,-50%) scale(1.06)}
      .grp-btn:active{transform:translate(-50%,-50%) scale(.94)}
      .grp-btn svg{display:block;width:100%;height:100%;overflow:visible}
    `;
    document.head.appendChild(s);
  }

  /* ---------- 实例 ID 生成 ---------- */
  let uid = 0;

  /* ---------- 主类 ---------- */
  class RingProgress {
    constructor(options = {}) {
      this.cfg = Object.assign({}, DEFAULTS, options);
      this.progress = 0;
      this.rafId = 0;
      this.timer = 0;
      this.id = 'grp-' + (++uid);

      // 预先算好数字填充用色
      this.numColors = pickNumberColors(this.cfg.palette, this.cfg.darkThreshold);

      this._build();
      if (this.cfg.autoStart) this.start();
    }

    /* -------- 构建 DOM -------- */
    _build() {
      const cfg = this.cfg;
      const r = cfg.radius;
      const segs = cfg.palette.length;
      const segAngle = 360 / segs;
      const id = this.id;

      injectStyle();

      // 按钮容器
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'grp-btn';
      btn.title = '点击查看进度';
      btn.style.width = cfg.size + 'px';
      btn.style.height = cfg.size + 'px';

      // SVG
      const svg = el('svg', { viewBox: '0 0 100 100' });
      const defs = el('defs');

      // 每段弧线：用原调色板
      const segments = [];
      const group = el('g', { filter: `url(#${id}-glow)` });

      for (let i = 0; i < segs; i++) {
        const a1 = (i * segAngle - 90) * Math.PI / 180;
        const a2 = ((i + 1) * segAngle - 90) * Math.PI / 180;
        const x1 = (50 + r * Math.cos(a1)).toFixed(3);
        const y1 = (50 + r * Math.sin(a1)).toFixed(3);
        const x2 = (50 + r * Math.cos(a2)).toFixed(3);
        const y2 = (50 + r * Math.sin(a2)).toFixed(3);

        const gid = `${id}-seg-${i}`;
        const grad = el('linearGradient', {
          id: gid,
          gradientUnits: 'userSpaceOnUse',
          x1, y1, x2, y2
        });
        grad.appendChild(el('stop', { offset: '0%',   'stop-color': cfg.palette[i] }));
        grad.appendChild(el('stop', { offset: '100%', 'stop-color': cfg.palette[(i + 1) % segs] }));
        defs.appendChild(grad);

        const path = el('path', {
          d: `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`,
          fill: 'none',
          stroke: `url(#${gid})`,
          'stroke-width': cfg.stroke,
          'stroke-linecap': 'butt',
          pathLength: '1',
          'stroke-dasharray': '0 1'
        });
        group.appendChild(path);
        segments.push(path);
      }

      // 数字渐变：只用自动挑出的深色组
      const numGrad = el('linearGradient', {
        id: `${id}-num`,
        gradientUnits: 'userSpaceOnUse',
        x1: '20', y1: '20', x2: '80', y2: '80'
      });
      if (this.numColors.length === 1) {
        numGrad.appendChild(el('stop', { offset: '0%',   'stop-color': this.numColors[0] }));
        numGrad.appendChild(el('stop', { offset: '100%', 'stop-color': this.numColors[0] }));
      } else {
        this.numColors.forEach((c, i) => {
          numGrad.appendChild(el('stop', {
            offset: ((i / (this.numColors.length - 1)) * 100).toFixed(2) + '%',
            'stop-color': c
          }));
        });
      }
      defs.appendChild(numGrad);

      // 大范围柔光滤镜
      const glow = el('filter', {
        id: `${id}-glow`,
        x: '-150%', y: '-150%', width: '400%', height: '400%'
      });
      glow.appendChild(el('feGaussianBlur', { stdDeviation: '3.6', result: 'b1' }));
      glow.appendChild(el('feGaussianBlur', {
        in: 'SourceGraphic', stdDeviation: '1.2', result: 'b2'
      }));
      const merge = el('feMerge');
      ['b1', 'b2', 'SourceGraphic'].forEach((src) => {
        merge.appendChild(el('feMergeNode', { in: src }));
      });
      glow.appendChild(merge);
      defs.appendChild(glow);

      svg.appendChild(defs);
      svg.appendChild(group);

      // 头部 ✨
      const sparkle = el('text', {
        'font-size': '17',
        'text-anchor': 'middle',
        'dominant-baseline': 'central'
      });
      sparkle.textContent = '✨';
      svg.appendChild(sparkle);

      // 数字通用属性
      const numAttrs = {
        x: '50', y: '51',
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': '28',
        'font-weight': '900',
        'font-family': 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
        'letter-spacing': '-1',
        'pointer-events': 'none'
      };

      // 底层：白色描边（保证深色数字在白底上也有边界）
      const numOutline = el('text', Object.assign({}, numAttrs, {
        fill: 'none',
        stroke: '#ffffff',
        'stroke-width': String(cfg.numStroke),
        'stroke-linejoin': 'round'
      }));
      numOutline.textContent = '0';

      // 顶层：深色渐变填充
      const numFill = el('text', Object.assign({}, numAttrs, {
        fill: `url(#${id}-num)`
      }));
      numFill.textContent = '0';

      svg.appendChild(numOutline);
      svg.appendChild(numFill);

      btn.appendChild(svg);
      document.documentElement.appendChild(btn);

      // 缓存引用
      this.btn = btn;
      this.segments = segments;
      this.sparkle = sparkle;
      this.numFill = numFill;
      this.numOutline = numOutline;
      this.segCount = segs;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.start();
      });

      this._update(0);
    }

    /* -------- 根据进度刷新视图 -------- */
    _update(p) {
      const segs = this.segCount;
      const segWalked = p * segs;

      for (let i = 0; i < segs; i++) {
        const sp = Math.max(0, Math.min(1, segWalked - i));
        this.segments[i].setAttribute('stroke-dasharray', sp.toFixed(4) + ' 1');
      }

      // ✨ 位置
      const r = this.cfg.radius;
      const rad = (p * 360 - 90) * Math.PI / 180;
      this.sparkle.setAttribute('x', (50 + r * Math.cos(rad)).toFixed(2));
      this.sparkle.setAttribute('y', (50 + r * Math.sin(rad)).toFixed(2));

      // 中央数字
      const text = String(Math.round(p * 100));
      this.numFill.textContent = text;
      this.numOutline.textContent = text;

      // ✨：0% 和 100% 时隐藏
      this.sparkle.style.display = (p > 0.001 && p < 0.999) ? '' : 'none';

      if (this.cfg.onProgress) this.cfg.onProgress(p);
    }

    /* -------- 播放一次进度动画 -------- */
    start(duration) {
      cancelAnimationFrame(this.rafId);
      clearTimeout(this.timer);
      this._update(0);

      const dur = duration || this.cfg.duration;
      const begin = performance.now();

      const tick = (now) => {
        const t = Math.min((now - begin) / dur, 1);
        const p = Math.min(1, springEase(t));
        this.progress = p;
        this._update(p);

        if (t < 1) {
          this.rafId = requestAnimationFrame(tick);
        } else {
          this._update(1);
          if (this.cfg.onComplete) this.cfg.onComplete();
          this.timer = setTimeout(() => {
            this.progress = 0;
            this._update(0);
          }, this.cfg.hold);
        }
      };

      this.rafId = requestAnimationFrame(tick);
      return this;
    }

    /* -------- 手动设定进度 0~1 -------- */
    set(p) {
      cancelAnimationFrame(this.rafId);
      clearTimeout(this.timer);
      this.progress = Math.max(0, Math.min(1, p));
      this._update(this.progress);
      return this;
    }

    /* -------- 归零 -------- */
    reset() {
      cancelAnimationFrame(this.rafId);
      clearTimeout(this.timer);
      this.progress = 0;
      this._update(0);
      return this;
    }

    /* -------- 销毁，移除 DOM 与事件 -------- */
    destroy() {
      cancelAnimationFrame(this.rafId);
      clearTimeout(this.timer);
      if (this.btn && this.btn.parentNode) {
        this.btn.parentNode.removeChild(this.btn);
      }
      this.btn = this.segments = this.sparkle =
        this.numFill = this.numOutline = null;
    }

    /* -------- 查看当前用于数字填充的颜色（调试用） -------- */
    getNumberColors() {
      return this.numColors.slice();
    }
  }

  return RingProgress;
}));
