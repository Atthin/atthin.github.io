/* ============================================================================
   atthin.github.io — behaviour
   No dependencies. Every animated path checks prefers-reduced-motion first and
   falls back to rendering the final state immediately.
   ========================================================================= */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => reduceQuery.matches;
  const live = document.getElementById('live');

  /* ------------------------------------------------------------ 7. theme ---
     Session-only: held in a closure variable. Deliberately no localStorage or
     sessionStorage, so a reload returns to the system preference. */
  (() => {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const systemDark = matchMedia('(prefers-color-scheme: dark)');
    let override = null;

    const effective = () => override || (systemDark.matches ? 'dark' : 'light');
    const syncLabel = () => {
      const next = effective() === 'dark' ? 'light' : 'dark';
      btn.setAttribute('aria-label', `Switch to ${next} theme`);
    };

    btn.addEventListener('click', () => {
      override = effective() === 'dark' ? 'light' : 'dark';
      // Enable colour transitions only for the duration of the switch, so they
      // never fire during initial paint.
      root.classList.add('theming');
      root.setAttribute('data-theme', override);
      syncLabel();
      setTimeout(() => root.classList.remove('theming'), 320);
    });

    systemDark.addEventListener('change', () => { if (!override) syncLabel(); });
    syncLabel();
  })();

  /* -------------------------------------------------------- 6. copy email --- */
  (() => {
    const btn = document.getElementById('copy-email');
    if (!btn) return;
    const address = btn.dataset.email;
    let timer;

    const fallback = (text) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      ta.remove();
      return ok;
    };

    btn.addEventListener('click', async () => {
      let ok = true;
      try {
        if (navigator.clipboard && isSecureContext) {
          await navigator.clipboard.writeText(address);
        } else {
          ok = fallback(address);
        }
      } catch (_) {
        ok = fallback(address);
      }

      if (ok) {
        btn.setAttribute('data-copied', '');
        if (live) live.textContent = `Email address ${address} copied to clipboard`;
        clearTimeout(timer);
        timer = setTimeout(() => {
          btn.removeAttribute('data-copied');
          if (live) live.textContent = '';
        }, 1600);
      } else if (live) {
        // Never leave the user without the address if the clipboard is blocked.
        live.textContent = `Could not copy automatically. Email address is ${address}`;
      }
    });
  })();

  /* ------------------------------------------- 1. hero topology field ------
     ~20 nodes on a jittered grid wired as a mesh with a few express links —
     the shape of the node-link figures this research is about. Decorative:
     the <svg> is aria-hidden and absent entirely without JS. */
  (() => {
    const svg = document.getElementById('topo');
    if (!svg) return;

    const NS = 'http://www.w3.org/2000/svg';
    const hero = document.querySelector('.hero');
    if (!hero) return;

    /* Derive the viewBox from the hero's actual proportions rather than hardcoding
       one. A fixed viewBox plus preserveAspectRatio="slice" cropped most of the
       field away on wide heroes and left it looking randomly truncated. */
    const rect = hero.getBoundingClientRect();
    const aspect = Math.min(4.5, Math.max(0.35, rect.width / Math.max(rect.height, 1)));
    const H = 520;
    const W = Math.round(H * aspect);
    // ~20 nodes, laid out so the cells stay roughly square whatever the aspect.
    const ROWS = Math.max(2, Math.round(Math.sqrt(20 / aspect)));
    const COLS = Math.max(2, Math.round(20 / ROWS));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    // Deterministic jitter: same layout on every load, no per-visit churn.
    const rand = (() => {
      let s = 0x9e3779b9;
      return () => {
        s |= 0; s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();

    const padX = W * 0.075, padY = H * 0.13;
    const cellW = (W - padX * 2) / (COLS - 1);
    const cellH = (H - padY * 2) / (ROWS - 1);
    const nodes = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        nodes.push({
          x: padX + c * cellW + (rand() - 0.5) * cellW * 0.44,
          y: padY + r * cellH + (rand() - 0.5) * cellH * 0.44,
          c, r,
        });
      }
    }
    const at = (c, r) => r * COLS + c;      // grid position -> node index

    // Edges hold node *indices*, so adjacency lookups for the cursor highlight are
    // direct rather than identity searches.
    const edges = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (c < COLS - 1) edges.push([at(c, r), at(c + 1, r)]);
        if (r < ROWS - 1) edges.push([at(c, r), at(c, r + 1)]);
      }
    }
    // A few express/skip links so it reads as a real topology, not graph paper.
    if (COLS >= 3 && ROWS >= 2) {
      const express = Math.max(2, Math.round(COLS * ROWS * 0.18));
      for (let k = 0; k < express; k++) {
        const c = Math.floor(rand() * (COLS - 2));
        const r = Math.floor(rand() * (ROWS - 1));
        edges.push([at(c, r), at(c + 2, r + 1)]);
      }
    }

    // node index -> immediate neighbours, and node index -> incident edge indices
    const neighbours = nodes.map(() => new Set());
    const incident = nodes.map(() => []);
    edges.forEach(([ia, ib], i) => {
      neighbours[ia].add(ib);
      neighbours[ib].add(ia);
      incident[ia].push(i);
      incident[ib].push(i);
    });

    const linkGroup = document.createElementNS(NS, 'g');
    const nodeGroup = document.createElementNS(NS, 'g');
    svg.append(linkGroup, nodeGroup);

    const motion = !reduced();

    const linkEls = edges.map(([ia, ib], i) => {
      const a = nodes[ia], b = nodes[ib];
      const el = document.createElementNS(NS, 'line');
      el.setAttribute('x1', a.x.toFixed(1));
      el.setAttribute('y1', a.y.toFixed(1));
      el.setAttribute('x2', b.x.toFixed(1));
      el.setAttribute('y2', b.y.toFixed(1));
      el.setAttribute('class', 'topo-link');
      // --j is the per-element jitter the stylesheet multiplies the ambient level by
      el.style.setProperty('--j', (0.72 + rand() * 0.28).toFixed(2));
      if (motion) {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        el.style.strokeDasharray = len.toFixed(1);
        el.style.strokeDashoffset = len.toFixed(1);
        el.style.transitionDelay = `${120 + i * 6}ms`;
      }
      return el;
    });
    linkGroup.append(...linkEls);

    const nodeEls = nodes.map((n, i) => {
      const el = document.createElementNS(NS, 'circle');
      el.setAttribute('cx', n.x.toFixed(1));
      el.setAttribute('cy', n.y.toFixed(1));
      el.setAttribute('r', '4.5');
      el.setAttribute('class', 'topo-node');
      el.style.setProperty('--j', (0.72 + rand() * 0.28).toFixed(2));
      if (motion) el.style.transitionDelay = `${i * 40}ms`;
      return el;
    });
    nodeGroup.append(...nodeEls);

    /* ---- cursor interaction ----------------------------------------------
       Two things happen as the pointer moves:

       (a) HIGHLIGHT — nearest-router hit testing rather than :hover on a 4.5px
           circle, which would be almost impossible to land on. The hovered
           router, its incident edges and its immediate neighbours change colour;
           everything within GLOW_R also brightens by distance.

       (b) PULL — routers near the cursor drift toward it and settle back when it
           leaves, and their edges are re-drawn to follow, so the mesh behaves like
           a web being tugged rather than a static picture.

       The pull is integrated here in one rAF loop rather than left to a CSS
       transition: <line> endpoints cannot be transformed independently, so if the
       circles eased on their own the strands would visibly detach from them. One
       integrator drives node offset, node radius and edge endpoints from the same
       numbers every frame, which keeps the web joined together. */
    const unit = Math.min(cellW, cellH);
    const HOT_R = unit * 0.85;                 // becomes the hovered router
    const GLOW_R = Math.max(cellW, cellH) * 1.9;  // opacity falloff
    const PULL_R = unit * 2.2;                 // how far the tug reaches
    const PULL = unit * 0.1;                   // furthest a router will travel
    const R_BASE = 4.5, R_HOT = 6.6;           // router radius, resting and hovered
    const EASE = 0.16;                         // per-frame approach; lower = looser
    const REST = 0.02;                         // snap-to-rest threshold

    // Under reduce the colour highlight stays (it answers direct input) but nothing
    // physically moves, and the loop is driven by pointermove instead of self-running.
    const canPull = motion;
    const PACKET_MS = 1500;
    const packets = [];                  // { el, ia, ib, t, peak } in flight
    let ptr = null, live = false, rafId = null, lastT = 0;

    const falloff = (d, r) => { const t = 1 - Math.min(d / r, 1); return t * t; };

    // distance from the cursor to a line segment, so long edges glow along their
    // whole length instead of only near their midpoint
    const segDist = (px, py, ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    };

    const off = nodes.map(() => ({ x: 0, y: 0 }));   // current displacement
    const rad = nodes.map(() => R_BASE);
    const nodeLit = new Array(nodes.length).fill(false);   // written last frame?
    const edgeLit = new Array(edges.length).fill(false);
    const nodeP = new Array(nodes.length).fill(-1);        // last --p written
    const edgeP = new Array(edges.length).fill(-1);
    let lastHot = -1;

    // Hit testing and pull targets both use the *base* positions. Using displaced
    // ones would feed back on itself: a router pulled closer would be pulled harder.
    const hottest = () => {
      if (!ptr) return -1;
      let best = -1, bestD = Infinity;
      for (let i = 0; i < nodes.length; i++) {
        const d = Math.hypot(nodes[i].x - ptr.x, nodes[i].y - ptr.y);
        if (d < bestD) { bestD = d; best = i; }
      }
      return bestD <= HOT_R ? best : -1;
    };

    // Classes only change when the hovered router changes, so a continuous rAF loop
    // is not thrashing the class list 52 times a frame.
    const setClasses = (hot) => {
      if (hot === lastHot) return;
      if (lastHot >= 0) {
        nodeEls[lastHot].classList.remove('is-hot');
        neighbours[lastHot].forEach((n) => nodeEls[n].classList.remove('is-near'));
        incident[lastHot].forEach((e) => linkEls[e].classList.remove('is-hot'));
      }
      if (hot >= 0) {
        nodeEls[hot].classList.add('is-hot');
        neighbours[hot].forEach((n) => nodeEls[n].classList.add('is-near'));
        incident[hot].forEach((e) => linkEls[e].classList.add('is-hot'));
      }
      lastHot = hot;
    };

    const tick = (now) => {
      rafId = null;
      // Frame-rate independent: a fixed per-frame lerp would settle twice as fast on
      // a 120Hz display as on 60Hz. Clamped so a backgrounded tab does not jump.
      const dt = Math.min(now - (lastT || now - 16.7), 50) || 16.7;
      lastT = now;
      const k = 1 - Math.pow(1 - EASE, dt / 16.7);

      const hot = hottest();
      setClasses(hot);

      let busy = false;

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i], o = off[i];

        let tx = 0, ty = 0, p = 0;
        if (ptr) {
          const dx = ptr.x - n.x, dy = ptr.y - n.y;
          const d = Math.hypot(dx, dy);
          p = falloff(d, GLOW_R);      // brightness responds even under reduce
          if (canPull && d > 0.001 && d < PULL_R) {
            const pull = falloff(d, PULL_R) * PULL;
            tx = (dx / d) * pull;
            ty = (dy / d) * pull;
          }
        }

        // Growing the hovered router is movement too, so under reduce the highlight
        // is carried by colour and opacity alone.
        const tr = canPull && i === hot ? R_HOT : R_BASE;
        o.x += (tx - o.x) * k;
        o.y += (ty - o.y) * k;
        rad[i] += (tr - rad[i]) * k;
        // Snap once inside the threshold so activity is an exact comparison and
        // the loop can actually stop instead of chasing sub-pixel drift forever.
        if (Math.abs(o.x) < REST && Math.abs(o.y) < REST && Math.abs(rad[i] - R_BASE) < REST) {
          o.x = 0; o.y = 0; rad[i] = R_BASE;
        }
        const lit = o.x !== 0 || o.y !== 0 || rad[i] !== R_BASE;
        if (lit) busy = true;

        if (lit || nodeLit[i]) {
          const el = nodeEls[i];
          el.style.setProperty('--dx', `${o.x.toFixed(2)}px`);
          el.style.setProperty('--dy', `${o.y.toFixed(2)}px`);
          el.setAttribute('r', rad[i].toFixed(2));
        }
        nodeLit[i] = lit;

        if (Math.abs(p - nodeP[i]) > 0.008) {
          nodeEls[i].style.setProperty('--p', p.toFixed(3));
          nodeP[i] = p;
        }
      }

      for (let e = 0; e < edges.length; e++) {
        const ia = edges[e][0], ib = edges[e][1];
        const a = nodes[ia], b = nodes[ib];

        if (nodeLit[ia] || nodeLit[ib] || edgeLit[e]) {
          const el = linkEls[e];
          el.setAttribute('x1', (a.x + off[ia].x).toFixed(2));
          el.setAttribute('y1', (a.y + off[ia].y).toFixed(2));
          el.setAttribute('x2', (b.x + off[ib].x).toFixed(2));
          el.setAttribute('y2', (b.y + off[ib].y).toFixed(2));
          edgeLit[e] = nodeLit[ia] || nodeLit[ib];
        }

        const p = ptr ? falloff(segDist(ptr.x, ptr.y, a.x, a.y, b.x, b.y), GLOW_R) : 0;
        if (Math.abs(p - edgeP[e]) > 0.008) {
          linkEls[e].style.setProperty('--p', p.toFixed(3));
          edgeP[e] = p;
        }
      }

      // Packets ride the *displaced* endpoints, recomputed every frame. They used to
      // be Web Animations keyframed from the base positions, which left them floating
      // off the strand as soon as the web was tugged.
      for (let k = packets.length - 1; k >= 0; k--) {
        const pk = packets[k];
        pk.t += dt / PACKET_MS;
        if (pk.t >= 1) { pk.el.remove(); packets.splice(k, 1); continue; }
        const e = pk.t < 0.5                          // quadratic ease-in-out
          ? 2 * pk.t * pk.t
          : 1 - 2 * (1 - pk.t) * (1 - pk.t);
        const ax = nodes[pk.ia].x + off[pk.ia].x, ay = nodes[pk.ia].y + off[pk.ia].y;
        const bx = nodes[pk.ib].x + off[pk.ib].x, by = nodes[pk.ib].y + off[pk.ib].y;
        pk.el.style.transform =
          `translate(${(ax + (bx - ax) * e).toFixed(2)}px, ${(ay + (by - ay) * e).toFixed(2)}px)`;
        // fade in over the first 15% and out over the last 15%
        pk.el.style.opacity =
          (pk.peak * Math.min(1, Math.min(pk.t, 1 - pk.t) / 0.15)).toFixed(3);
      }

      if ((ptr && canPull) || busy || packets.length) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const request = () => {
      if (!live || rafId !== null) return;
      rafId = requestAnimationFrame(tick);
    };

    /* Size the mask ellipse to the real text block so the web dims where it would
       otherwise cut across the name, the advisor line or the link row. */
    const fitMask = () => {
      const hr = hero.getBoundingClientRect();
      if (!hr.width || !hr.height) return;
      const parts = ['.hero-name', '.hero-meta']
        .map((s) => hero.querySelector(s))
        .filter(Boolean)
        .map((el) => el.getBoundingClientRect());
      if (!parts.length) return;
      const pad = 30;
      const left = Math.min(...parts.map((r) => r.left));
      const right = Math.max(...parts.map((r) => r.right));
      const top = Math.min(...parts.map((r) => r.top));
      const bottom = Math.max(...parts.map((r) => r.bottom));
      const pct = (v) => `${v.toFixed(1)}%`;
      svg.style.setProperty('--mask-x', pct(((left + right) / 2 - hr.left) / hr.width * 100));
      svg.style.setProperty('--mask-y', pct(((top + bottom) / 2 - hr.top) / hr.height * 100));
      svg.style.setProperty('--mask-w', pct(((right - left) / 2 + pad) / hr.width * 100));
      svg.style.setProperty('--mask-h', pct(((bottom - top) / 2 + pad) / hr.height * 100));
    };
    fitMask();
    addEventListener('resize', fitMask);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitMask);

    const toSvg = (e) => {
      const m = svg.getScreenCTM();
      if (!m) return null;
      // getScreenCTM already accounts for the viewBox and preserveAspectRatio slice
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      return { x: p.x, y: p.y };
    };

    // Listen on the hero, not the SVG: the SVG is pointer-events:none so it can
    // never swallow a click, and this way the web reacts over the text too.
    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;   // no hover state to speak of
      ptr = toSvg(e);
      request();
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { ptr = null; request(); });

    const goLive = () => {
      live = true;
      svg.classList.add('is-live');
      // drop the intro stagger so highlight changes are immediate
      nodeEls.forEach((el) => { el.style.transitionDelay = ''; });
      linkEls.forEach((el) => { el.style.transitionDelay = ''; });
    };

    if (motion) {
      // Two frames so the hidden initial state is committed before animating.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        svg.classList.add('is-ready');
        linkEls.forEach((el) => {
          el.classList.add('is-in');
          el.style.strokeDashoffset = '0';
        });
      }));
      setTimeout(goLive, 1250);   // just after the intro settles
    } else {
      svg.classList.add('is-ready');
      goLive();                   // highlight is a response to input, not motion
    }

    /* packets: max two in flight, one new every 2-4s, paused off-screen.
       Advanced by the integrator above so they track a strand that is being pulled. */
    if (!motion) return;
    let timer = null, visible = true;

    const sendPacket = () => {
      if (packets.length >= 2) return;
      const [ia, ib] = edges[Math.floor(rand() * edges.length)];
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('r', '3');
      dot.setAttribute('cx', '0');
      dot.setAttribute('cy', '0');
      dot.setAttribute('class', 'topo-packet');
      dot.style.opacity = '0';
      svg.appendChild(dot);
      // Peak opacity comes from the theme rather than being 1: the group opacity that
      // used to hold packets back is gone, so an opaque dot would now shout. Read once
      // per packet rather than every frame.
      const peak = parseFloat(
        getComputedStyle(svg).getPropertyValue('--topo-warm')) || 0.55;
      packets.push({ el: dot, ia, ib, t: 0, peak });
      request();
    };

    const schedule = () => {
      timer = setTimeout(() => {
        if (visible && !document.hidden) sendPacket();
        schedule();
      }, 2000 + rand() * 2000);
    };

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible) {
          if (timer === null) schedule();
        } else {
          if (timer !== null) { clearTimeout(timer); timer = null; }
          // The pointer cannot leave a hero that has scrolled away, so release it
          // here or the integrator would keep spinning against a stale position.
          ptr = null;
          request();
        }
      }, { threshold: 0 }).observe(hero);
    } else {
      schedule();
    }
  })();

  /* ------------------------------ 2 & 8. scroll reveal + section rules ----- */
  (() => {
    if (reduced() || !('IntersectionObserver' in window)) return;

    // 60ms stagger within a section, so groups arrive together rather than as
    // one long cascade down the page.
    document.querySelectorAll('.section').forEach((section) => {
      section.querySelectorAll('[data-reveal]').forEach((el, i) => {
        el.style.transitionDelay = `${i * 60}ms`;
      });
    });

    const io = new IntersectionObserver((entries, obs) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add(
          e.target.classList.contains('s-line') ? 'is-drawn' : 'is-revealed');
        obs.unobserve(e.target);   // never re-animate on scroll back
      }
    }, { threshold: 0.15 });

    document.querySelectorAll('[data-reveal], .s-line').forEach((el) => io.observe(el));
  })();

  /* --------------------- 3. sticky nav, progress bar, active dot ----------- */
  (() => {
    const nav = document.getElementById('nav');
    const list = document.getElementById('nav-list');
    const bar = document.querySelector('.progress-bar');
    const hero = document.querySelector('.hero');
    if (!nav || !list) return;

    const dot = list.querySelector('.nav-dot');
    const links = [...list.querySelectorAll('a')];
    const targets = links
      .map((a) => ({ a, el: document.querySelector(a.getAttribute('href')) }))
      .filter((t) => t.el);

    let current = null;
    const setHidden = (hidden) => {
      nav.dataset.state = hidden ? 'hidden' : 'shown';
      nav.inert = hidden;        // keeps hidden links out of the tab order
    };
    setHidden(true);

    const moveDot = (link) => {
      if (!dot || !link) return;
      const x = link.offsetLeft + link.offsetWidth / 2 - dot.offsetWidth / 2;
      dot.style.transform = `translateX(${x}px)`;
      dot.setAttribute('data-active', '');
    };

    const update = () => {
      const y = window.scrollY;

      if (bar) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`;
      }

      setHidden(hero ? y < hero.offsetHeight - 8 : y < 200);

      // last section whose top has passed the reading line
      const line = 96;
      let active = null;
      for (const t of targets) {
        if (t.el.getBoundingClientRect().top <= line) active = t;
      }
      // The final section is short enough that the page bottoms out before its top
      // reaches the reading line, so it could never win on its own. At the bottom of
      // the document the last section is by definition the one being read.
      const doc = document.documentElement;
      if (y + window.innerHeight >= doc.scrollHeight - 4 && targets.length) {
        active = targets[targets.length - 1];
      }
      if (active !== current) {
        links.forEach((a) => a.removeAttribute('aria-current'));
        if (active) {
          active.a.setAttribute('aria-current', 'true');
          moveDot(active.a);
        } else if (dot) {
          dot.removeAttribute('data-active');
        }
        current = active;
      }
    };

    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; update(); });
    };

    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', () => {
      current = null;         // force the dot to be repositioned
      update();
    });
    update();
  })();
})();
