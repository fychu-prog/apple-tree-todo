document.addEventListener('DOMContentLoaded', () => {
    // ── DOM refs ──
    const todoInput = document.getElementById('todo-input');
    const addBtn = document.getElementById('add-btn');
    const applesContainer = document.getElementById('apples-on-tree');
    const doneList = document.getElementById('done-list');
    const harvestContainer = document.querySelector('.harvested-list-container');
    const countDisplay = document.getElementById('count');
    const clearBtn = document.getElementById('clear-basket');
    const gardenEl = document.getElementById('garden-main');
    const physicsEl = document.getElementById('physics-world');
    const basketEl = document.getElementById('basket-outer');

    // ── Matter.js setup ──
    const { Engine, Runner, Bodies, Composite, Body } = Matter;
    const engine = Engine.create();
    engine.world.gravity.y = 1.2;
    const world = engine.world;
    Runner.run(Runner.create(), engine);

    // ── Constants ──
    const STORAGE_KEY = 'apple_todos_v31';
    const AW = 80, AH = 86, AR = 40; // Slightly smaller apples for better fit
    const MAX_APPLES = 12; // Calculated from foliage geometry — 12 fits comfortably

    // Clear all old storage versions
    for (let i = 1; i <= 30; i++) {
        localStorage.removeItem('apple_todos_v' + i);
    }

    let harvestedCount = 0;
    const physApples = []; // { body, element }
    let walls = [];        // static Matter bodies for the basket

    // ══════════════════════════════════════════════
    // ── FOLIAGE GEOMETRY: SVG viewBox → pixel space ──
    // ══════════════════════════════════════════════
    // SVG viewBox: -550 -600 1100 950
    // .tree-svg-wrapper renders SVG at max-width (matches wrapper)
    // .apples-layer sits on top at width 800px, centered
    //
    // We define foliage circles in a NORMALIZED 0-1 coordinate system
    // relative to the SVG viewBox, then convert at runtime.
    
    const SVG_VB = { x: -550, y: -750, w: 1100, h: 1100 };
    
    // Foliage circles in SVG coordinates (from index.html)
    // Shifted slightly to compensate for potential offset
    const FOLIAGE_SVG = [
        { cx: 0,    cy: -250, r: 320 }, 
        { cx: -250, cy: -150, r: 260 }, 
        { cx: 250,  cy: -150, r: 260 },
        { cx: 0,    cy: -480, r: 240 },
        { cx: -300, cy: -430, r: 200 },
        { cx: 300,  cy: -430, r: 200 }
    ];

    // Convert SVG foliage circles to apples-layer pixel coordinates
    function getFoliagePixelCircles() {
        const svgEl = document.querySelector('.main-tree');
        const layer = applesContainer;
        if (!svgEl || !layer) return [];

        // Use the actual SVG element's rendered dimensions (respects aspect ratio)
        const svgRect = svgEl.getBoundingClientRect();
        const layerRect = layer.getBoundingClientRect();
        
        // Get the visual scale of the garden (transform: scale() applied)
        const gardenRect = gardenEl.getBoundingClientRect();
        const gardenScale = gardenRect.width / gardenEl.offsetWidth;
        
        // SVG pixel-per-viewBox-unit scales
        const scaleX = svgRect.width / gardenScale / SVG_VB.w;
        const scaleY = svgRect.height / gardenScale / SVG_VB.h;
        
        // Offset from the layer's top-left to the SVG's top-left (in unscaled coords)
        const offsetX = (svgRect.left - layerRect.left) / gardenScale;
        const offsetY = (svgRect.top - layerRect.top) / gardenScale;

        const circles = FOLIAGE_SVG.map(c => ({
            cx: (c.cx - SVG_VB.x) * scaleX + offsetX,
            cy: (c.cy - SVG_VB.y) * scaleY + offsetY,
            r: Math.min(c.r * scaleX, c.r * scaleY) // Use smaller scale for safety
        }));
        
        console.log('Foliage circles (px):', circles.map(c => `(${Math.round(c.cx)},${Math.round(c.cy)} r=${Math.round(c.r)})`));
        return circles;
    }

    // Check if a point (apple center) is inside ANY foliage circle
    // with padding so the apple doesn't poke out of the edge
    function isInsideFoliage(x, y, circles, padding) {
        const appleCenterX = x + AW / 2;
        const appleCenterY = y + AH / 2;
        return circles.some(c => {
            const dx = appleCenterX - c.cx;
            const dy = appleCenterY - c.cy;
            return Math.sqrt(dx * dx + dy * dy) <= (c.r - padding);
        });
    }

    // ── Helper: get position relative to gardenEl ──
    function relPos(el) {
        const r = el.getBoundingClientRect();
        const g = gardenEl.getBoundingClientRect();
        const scale = g.width / gardenEl.offsetWidth;
        return { 
            x: (r.left - g.left) / scale, 
            y: (r.top - g.top) / scale, 
            w: r.width / scale, 
            h: r.height / scale 
        };
    }

    // ── Build basket walls from actual SVG positions ──
    function buildWalls() {
        walls.forEach(b => Composite.remove(world, b));
        walls = [];

        const backSvg = document.querySelector('.basket-back');
        if (!backSvg) return;
        const bp = relPos(backSvg);
        
        const s = bp.w / 320;
        const svgOffY = (bp.h - 220 * s) / 2; 
        
        const gndW = 200 * s;
        const gndCx = bp.x + 160 * s;
        const gndCy = bp.y + svgOffY + 200 * s;
        const ground = Bodies.rectangle(gndCx, gndCy + 25, gndW + 20, 20, {
            isStatic: true, friction: 1
        });

        const lx1 = bp.x + 20 * s, ly1 = bp.y + svgOffY + 60 * s;
        const lx2 = bp.x + 60 * s, ly2 = bp.y + svgOffY + 200 * s;
        const lcx = (lx1 + lx2) / 2, lcy = (ly1 + ly2) / 2;
        const llen = Math.hypot(lx2 - lx1, ly2 - ly1);
        const lang = Math.atan2(ly2 - ly1, lx2 - lx1) - Math.PI / 2;
        const leftW = Bodies.rectangle(lcx - 5, lcy, 10, llen + 40, {
            isStatic: true, angle: lang, friction: 0.2
        });

        const rx1 = bp.x + 300 * s, ry1 = bp.y + svgOffY + 60 * s;
        const rx2 = bp.x + 260 * s, ry2 = bp.y + svgOffY + 200 * s;
        const rcx = (rx1 + rx2) / 2, rcy = (ry1 + ry2) / 2;
        const rlen = Math.hypot(rx2 - rx1, ry2 - ry1);
        const rang = Math.atan2(ry2 - ry1, rx2 - rx1) - Math.PI / 2;
        const rightW = Bodies.rectangle(rcx + 5, rcy, 10, rlen + 40, {
            isStatic: true, angle: rang, friction: 0.2
        });

        const gw = gardenEl.offsetWidth;
        const gh = gardenEl.offsetHeight;
        
        const wallThickness = 100;
        const leftBound = Bodies.rectangle(-wallThickness/2, gh / 2, wallThickness, gh * 2, { isStatic: true });
        const rightBound = Bodies.rectangle(gw + wallThickness/2, gh / 2, wallThickness, gh * 2, { isStatic: true });
        const topBound = Bodies.rectangle(gw / 2, -wallThickness/2 - 100, gw * 2, wallThickness, { isStatic: true });
        
        const screenGround = Bodies.rectangle(gw / 2, gh + 50, gw * 2, 100, {
            isStatic: true, friction: 0.8
        });

        walls = [ground, leftW, rightW, screenGround, leftBound, rightBound, topBound];
        Composite.add(world, walls);
    }

    // ── Responsive Scaling: Fit to Screen ──
    function resizeGarden() {
        const wrapper = document.getElementById('garden-wrapper');
        const scaler = document.getElementById('garden-scaler');
        const container = document.querySelector('.app-container');
        if (!wrapper || !container || !scaler) return;
        
        // Use real wrapper size as final boundary
        const availH = wrapper.clientHeight - 20; 
        const availW = wrapper.clientWidth - 20;
        
        const logicalW = 900;
        const logicalH = 1550; // Total height including top margin and basket overflow
        
        const scaleW = availW / logicalW;
        const scaleH = availH / logicalH;
        let scale = Math.min(scaleW, scaleH);
        
        // Apply width and height to scaler so flexbox perfectly centers it visually
        scaler.style.width = `${logicalW * scale}px`;
        scaler.style.height = `${logicalH * scale}px`;
        
        const transformEl = document.getElementById('garden-transform');
        if (transformEl) {
            transformEl.style.transform = `scale(${scale})`;
        }
        
        const gardenEl = document.getElementById('garden-main');
        if (gardenEl) {
            gardenEl.style.transform = 'none';
            gardenEl.style.marginBottom = '0px';
        }
    }

    // Build walls after layout settles
    setTimeout(() => {
        resizeGarden();
        buildWalls();
    }, 300);
    
    window.addEventListener('resize', () => {
        resizeGarden();
        buildWalls();
    });

    // ── Render loop: sync DOM elements to physics bodies ──
    (function animate() {
        physApples.forEach(({ body, element }) => {
            element.style.transform =
                `translate(${body.position.x - AW / 2}px, ${body.position.y - AH / 2}px) rotate(${body.angle}rad)`;
        });
        requestAnimationFrame(animate);
    })();

    // ── Load saved data ──
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"todos":[],"count":0,"harvested":[]}');
    harvestedCount = saved.count || 0;
    countDisplay.textContent = harvestedCount;

    const TEST_ITEMS = [
        '早起喝水', '伸展運動', '閱讀15分鐘', '整理桌面', '寫日記',
        '聽音樂', '澆花', '冥想5分鐘', '規劃明天', '保持微笑',
        '做家事', '學習新知'
    ];

    if (saved.todos.length === 0 && saved.harvested.length === 0) {
        // Delay apple placement until layout is settled
        setTimeout(() => {
            TEST_ITEMS.forEach(t => addApple(t));
        }, 350);
    } else {
        setTimeout(() => {
            saved.todos.forEach(t => addApple(t));
            if (saved.harvested && saved.harvested.length > 0) {
                saved.harvested.forEach(text => {
                    const li = document.createElement('li');
                    li.className = 'done-item';
                    li.innerHTML = `<span>🍎 ${text}</span>`;
                    doneList.append(li);
                });
            }
        }, 350);
    }

    // Respawn harvested apples inside basket (after walls are built)
    setTimeout(() => {
        const bp = relPos(document.querySelector('.basket-back'));
        const cx = bp.x + bp.w / 2;
        const topY = bp.y - 100;
        
        saved.harvested.forEach((task, i) => {
            setTimeout(() => {
                spawnPhysApple(task, cx + (Math.random() * 80 - 40), topY);
            }, i * 180);
        });
    }, 500);

    // ══════════════════════════════════════════════
    // ── Add a green apple — GEOMETRY-BASED placement ──
    // ══════════════════════════════════════════════
    function addApple(text) {
        if (!text) return;
        const apple = document.createElement('div');
        apple.className = 'apple';
        apple.dataset.task = text;
        apple.setAttribute('data-full-task', text);

        const label = document.createElement('span');
        label.className = 'apple-label';
        label.textContent = text;
        apple.appendChild(label);

        // Get foliage circles in pixel coordinates
        const circles = getFoliagePixelCircles();
        const existing = Array.from(applesContainer.querySelectorAll('.apple'));
        
        let px, py;
        let bestPx, bestPy, bestMinDist = 0;
        const EDGE_PADDING = 100; // Keep apple center this far from circle edge
        const MIN_APPLE_DIST = AW + 20; // Minimum distance between apple centers
        
        // Try many random positions, pick the best one
        for (let tries = 0; tries < 200; tries++) {
            // Pick a random foliage circle weighted by area
            const totalArea = circles.reduce((s, c) => s + c.r * c.r, 0);
            let rnd = Math.random() * totalArea;
            let chosen = circles[0];
            for (const c of circles) {
                rnd -= c.r * c.r;
                if (rnd <= 0) { chosen = c; break; }
            }
            
            // Random point inside chosen circle
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.sqrt(Math.random()) * (chosen.r - EDGE_PADDING);
            const tx = chosen.cx + Math.cos(angle) * dist - AW / 2;
            const ty = chosen.cy + Math.sin(angle) * dist - AH / 2;
            
            // Verify this point is actually inside foliage (with edge padding)
            if (!isInsideFoliage(tx, ty, circles, EDGE_PADDING)) continue;
            
            // Check for overlap with existing apples
            let minDist = Infinity;
            let overlapping = false;
            for (const el of existing) {
                const ex = parseFloat(el.style.left);
                const ey = parseFloat(el.style.top);
                const d = Math.hypot(ex - tx, ey - ty);
                if (d < MIN_APPLE_DIST) { overlapping = true; break; }
                if (d < minDist) minDist = d;
            }
            
            if (!overlapping) {
                // Track the position with the maximum minimum distance (best spread)
                if (existing.length === 0 || minDist > bestMinDist) {
                    bestMinDist = minDist;
                    bestPx = tx;
                    bestPy = ty;
                }
                // If we found a great spot, use it immediately
                if (minDist > MIN_APPLE_DIST * 1.5) {
                    px = tx; py = ty;
                    break;
                }
            }
        }
        
        // Use best found position, or fallback
        if (px === undefined) {
            if (bestPx !== undefined) {
                px = bestPx;
                py = bestPy;
            } else {
                // Absolute fallback: center of largest circle
                const c = circles[0] || { cx: 400, cy: 250 };
                px = c.cx - AW / 2;
                py = c.cy - AH / 2;
            }
        }
        
        // Safety clamp: keep apples inside the layer bounds
        px = Math.max(5, Math.min(px, (layer.offsetWidth || 800) - AW - 5));
        py = Math.max(5, Math.min(py, (layer.offsetHeight || 600) - AH - 5));

        apple.style.left = px + 'px';
        apple.style.top = py + 'px';
        apple.addEventListener('click', () => harvest(apple, text));
        applesContainer.appendChild(apple);
        persist();
    }

    // ── Harvest: turn red on tree → drop with physics ──
    function harvest(apple, text) {
        if (apple.classList.contains('harvested')) return;

        const ar = apple.getBoundingClientRect();
        const gr = gardenEl.getBoundingClientRect();
        const scale = gr.width / gardenEl.offsetWidth;
        const cx = (ar.left - gr.left) / scale + (ar.width / scale) / 2;
        const cy = (ar.top - gr.top) / scale + (ar.height / scale) / 2;

        apple.classList.add('harvested');
        apple.style.pointerEvents = 'none';
        apple.style.zIndex = '15';

        setTimeout(() => {
            apple.remove();
            spawnPhysApple(text, cx, cy);

            harvestedCount++;
            countDisplay.textContent = harvestedCount;
            addToHarvestList(text);
            persist();
        }, 500);
    }

    // ── Spawn a physics-controlled red apple ──
    function spawnPhysApple(text, x, y) {
        const el = document.createElement('div');
        el.className = 'apple harvested phys-apple';
        el.setAttribute('data-full-task', text);
        const label = document.createElement('span');
        label.className = 'apple-label';
        label.textContent = text;
        el.appendChild(label);
        physicsEl.appendChild(el);

        const body = Bodies.circle(x, y, AR, {
            restitution: 0.12,
            friction: 0.9,
            frictionStatic: 1.0,
            density: 0.04
        });
        Body.setVelocity(body, { x: (Math.random() - 0.5) * 1.5, y: 0 });

        el.addEventListener('pointerdown', (e) => {
            el.setPointerCapture(e.pointerId);
            draggedBodyInfo = { body, dx: 0, dy: 0, apple: el, pointerId: e.pointerId };
            Body.setVelocity(body, { x: 0, y: 0 });
            Body.setAngularVelocity(body, 0);
        });

        Composite.add(world, body);
        physApples.push({ body, element: el });
    }

    // ── Drag Logic ──
    let draggedBodyInfo = null;
    window.addEventListener('pointermove', (e) => {
        if (!draggedBodyInfo) return;
        const { body } = draggedBodyInfo;
        const gr = gardenEl.getBoundingClientRect();
        const scale = gr.width / gardenEl.offsetWidth;
        const px = (e.clientX - gr.left) / scale;
        const py = (e.clientY - gr.top) / scale;
        Body.setPosition(body, { x: px, y: py });
        Body.setVelocity(body, { x: 0, y: 0 });
    });

    window.addEventListener('pointerup', (e) => {
        if (draggedBodyInfo) {
            draggedBodyInfo.apple.releasePointerCapture(draggedBodyInfo.pointerId);
            draggedBodyInfo = null;
        }
    });

    // ── Helpers ──
    function addToHarvestList(text) {
        const li = document.createElement('li');
        li.className = 'done-item';
        li.innerHTML = `<span>🍎 ${text}</span>`;
        doneList.prepend(li);
    }

    function persist() {
        const todos = Array.from(applesContainer.querySelectorAll('.apple:not(.harvested)')).map(a => a.dataset.task);
        const harvested = Array.from(doneList.querySelectorAll('.done-item')).map(li => {
            const span = li.querySelector('span');
            return span ? span.textContent.replace('🍎 ', '') : li.textContent;
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ todos, count: harvestedCount, harvested }));
        
        const badge = document.getElementById('badge-count');
        if (badge) badge.textContent = harvestedCount;
    }

    // ── Events ──
    addBtn.addEventListener('click', () => {
        const currentApples = applesContainer.querySelectorAll('.apple:not(.harvested)').length;
        if (currentApples >= MAX_APPLES) {
            alert('樹上的空間已經滿載囉！🍎 讓這顆蘋果稍微休息一下吧。\n\n先鼓勵你自己完成幾個待辦事項採收成果，才能繼續種下新的目標喔！✨');
            return;
        }

        const val = todoInput.value.trim();
        if (val) { addApple(val); todoInput.value = ''; }
    });
    todoInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') addBtn.click();
    });

    clearBtn.addEventListener('click', () => {
        if (!confirm('確定清空所有收穫紀錄與重置籃子嗎？')) return;
        
        doneList.innerHTML = '';
        
        physApples.forEach(({ body, element }) => {
            Composite.remove(world, body);
            element.remove();
        });
        physApples.length = 0;
        
        document.querySelectorAll('.harvested').forEach(el => {
            el.classList.remove('harvested');
            el.style.pointerEvents = 'auto';
            el.style.opacity = '1';
            el.style.zIndex = '1';
        });
        
        harvestedCount = 0;
        countDisplay.textContent = '0';
        persist();
    });

    // ── Notice Board UI Logic ──
    const harvestModal = document.getElementById('harvest-modal');
    const bulletinBtn = document.getElementById('floating-bulletin-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');

    if (bulletinBtn && harvestModal) {
        bulletinBtn.addEventListener('click', () => {
            harvestModal.style.display = 'flex';
        });
        closeModalBtn.addEventListener('click', () => {
            harvestModal.style.display = 'none';
        });
        harvestModal.addEventListener('click', (e) => {
            if (e.target === harvestModal) {
                harvestModal.style.display = 'none';
            }
        });
    }

    // ── Gyroscope Gravity Control ──
    if (window.DeviceOrientationEvent) {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            addBtn.addEventListener('click', () => {
                DeviceOrientationEvent.requestPermission()
                    .then(state => { if (state === 'granted') startGyro(); })
                    .catch(console.error);
            }, { once: true });
        } else {
            startGyro();
        }
    }

    function startGyro() {
        window.addEventListener('deviceorientation', (event) => {
            if (event.beta !== null && event.gamma !== null) {
                const grx = (event.gamma / 45) * 1.5;
                const gry = (event.beta / 45) * 1.5;
                engine.world.gravity.x = Math.max(-2, Math.min(2, grx));
                engine.world.gravity.y = Math.max(-2, Math.min(2, gry));
            }
        });
    }
});
