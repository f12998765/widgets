/*!
 * RingProgress - 居中灵动圆环进度组件
 * @version 1.0.0
 * @license MIT
 *
 * 用法：
 *   const rp = new RingProgress({ palette: [...] });
 *   rp.start();            // 播放一次
 *   rp.set(0.5);           // 手动设定进度 0~1
 *   rp.reset();            // 归零
 *   rp.destroy();          // 销毁
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
    size: 180,          // 组件显示尺寸(px)
    radius: 38,         // 半径 (基于 100x100 viewBox)
    stroke: 6,          // 线宽
    duration: 2200,     // 动画时长(ms)
    hold: 1400,         // 完成停留(ms)
    autoStart: false,   // 创建后是否自动播放
    onProgress: null,   // (p: 0~1) => void
    onComplete: null    // () => void
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

      // 每段弧线
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

      // 数字渐变（描边用）
      const numGrad = el('linearGradient', {
        id: `${id}-num`,
        gradientUnits: 'userSpaceOnUse',
        x1: '20', y1: '20', x2: '80', y2: '80'
      });
      cfg.palette.forEach((c, i) => {
        numGrad.appendChild(el('stop', {
          offset: ((i / (segs - 1)) * 100).toFixed(2) + '%',
          'stop-color': c
        }));
      });
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

      // 数字（白色填充 + 彩色描边）
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
      const numStroke = el('text', Object.assign({}, numAttrs, {
        fill: `url(#${id}-num)`,
        stroke: `url(#${id}-num)`,
        'stroke-width': '2.6',
        'stroke-linejoin': 'round'
      }));
      numStroke.textContent = '0';

      const numFill = el('text', Object.assign({}, numAttrs, { fill: '#ffffff' }));
      numFill.textContent = '0';

      svg.appendChild(numStroke);
      svg.appendChild(numFill);

      btn.appendChild(svg);
      document.documentElement.appendChild(btn);

      // 缓存引用
      this.btn = btn;
      this.segments = segments;
      this.sparkle = sparkle;
      this.numFill = numFill;
      this.numStroke = numStroke;
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
      this.numStroke.textContent = text;

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
      this.btn = this.segments = this.sparkle = this.numFill = this.numStroke = null;
    }
  }

  return RingProgress;
}));
