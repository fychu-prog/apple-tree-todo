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
    const STORAGE_KEY = 'apple_todos_v13';
    const AW = 72, AH = 76, AR = 36; // AR = AW/2 so physics circle matches visual apple exactly

    // Clear all old storage versions
    for (let i = 1; i <= 12; i++) {
        localStorage.removeItem('apple_todos_v' + i);
    }

    let harvestedCount = 0;
    const physApples = []; // { body, element }
    let walls = [];        // static Matter bodies for the basket

    // ── Helper: get position relative to gardenEl ──
    function relPos(el) {
        const r = el.getBoundingClientRect();
        const g = gardenEl.getBoundingClientRect();
        return { x: r.left - g.left, y: r.top - g.top, w: r.width, h: r.height };
    }

    // ── Build basket walls from actual SVG positions ──
    function buildWalls() {
        walls.forEach(b => Composite.remove(world, b));
        walls = [];

        const backSvg = document.querySelector('.basket-back');
        if (!backSvg) return;
        const bp = relPos(backSvg);
        // SVG viewBox = "0 0 320 200"
        const sx = bp.w / 320, sy = bp.h / 200;

        // Basket Bottom Ground: y=180, from x=60 to x=260
        const gndCx = bp.x + 160 * sx;
        const gndCy = bp.y + 180 * sy;
        const gndW  = 200 * sx;
        const ground = Bodies.rectangle(gndCx, gndCy + 10, gndW + 20, 20, {
            isStatic: true, friction: 1
        });

        // Left wall: shifted left from SVG edge (20,60) → (60,180)
        const lx1 = bp.x + 15 * sx, ly1 = bp.y + 55 * sy;
        const lx2 = bp.x + 55 * sx, ly2 = bp.y + 185 * sy;
        const lcx = (lx1 + lx2) / 2, lcy = (ly1 + ly2) / 2;
        const llen = Math.hypot(lx2 - lx1, ly2 - ly1);
        const lang = Math.atan2(ly2 - ly1, lx2 - lx1) - Math.PI / 2;
        const leftW = Bodies.rectangle(lcx, lcy, 6, llen + 20, {
            isStatic: true, angle: lang, friction: 0.2
        });

        // Right wall: shifted right from SVG edge (300,60) → (260,180)
        const rx1 = bp.x + 305 * sx, ry1 = bp.y + 55 * sy;
        const rx2 = bp.x + 265 * sx, ry2 = bp.y + 185 * sy;
        const rcx = (rx1 + rx2) / 2, rcy = (ry1 + ry2) / 2;
        const rlen = Math.hypot(rx2 - rx1, ry2 - ry1);
        const rang = Math.atan2(ry2 - ry1, rx2 - rx1) - Math.PI / 2;
        const rightW = Bodies.rectangle(rcx, rcy, 6, rlen + 20, {
            isStatic: true, angle: rang, friction: 0.2
        });

        // Screen floor out of bounds (so if they bounce out, you can pick them up)
        const g = gardenEl.getBoundingClientRect();
        const screenGround = Bodies.rectangle(g.width / 2, g.height + 50, g.width * 2, 100, {
            isStatic: true, friction: 0.8
        });

        walls = [ground, leftW, rightW, screenGround];
        Composite.add(world, walls);

        console.log('Basket walls built:', {
            ground: { x: gndCx, y: gndCy, w: gndW },
            leftWall: { cx: lcx, cy: lcy, angle: lang },
            rightWall: { cx: rcx, cy: rcy, angle: rang }
        });
    }

    // Build walls after layout settles
    setTimeout(buildWalls, 300);
    window.addEventListener('resize', buildWalls);

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
        '做家事', '散步', '學習新知', '感謝日記', '早點睡覺'
    ];

    if (saved.todos.length === 0 && saved.harvested.length === 0) {
        TEST_ITEMS.forEach(t => addApple(t));
    } else {
        saved.todos.forEach(t => addApple(t));
    }

    // Respawn harvested apples inside basket (after walls are built)
    setTimeout(() => {
        const bp = relPos(document.querySelector('.basket-back') || basketEl);
        const sx = bp.w / 200, sy = bp.h / 120;
        const cx = bp.x + 100 * sx;
        const topY = bp.y + 50 * sy;

        saved.harvested.forEach((task, i) => {
            addToHarvestList(task);
            setTimeout(() => {
                spawnPhysApple(task, cx + (Math.random() * 80 - 40), topY);
            }, i * 180);
        });
        updateHarvestVisibility();
    }, 400);

    // ── Add a green apple to the tree ──
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

        // Find a non-overlapping position within the canopy
        const existing = Array.from(applesContainer.querySelectorAll('.apple'));
        let px, py, tries = 0;
        while (tries < 60) {
            const a = Math.random() * Math.PI * 2;
            const d = Math.random() * 190;
            const tx = 300 + Math.cos(a) * d - AW / 2;
            const ty = 230 + Math.sin(a) * d - AH / 2;
            const ok = existing.every(el => {
                const ex = parseFloat(el.style.left), ey = parseFloat(el.style.top);
                return Math.hypot(ex - tx, ey - ty) >= 80;
            });
            if (ok) { px = tx; py = ty; break; }
            tries++;
        }
        if (px === undefined) { px = 300; py = 230; }

        apple.style.left = px + 'px';
        apple.style.top = py + 'px';
        apple.addEventListener('click', () => harvest(apple, text));
        applesContainer.appendChild(apple);
        persist();
    }

    // ── Harvest: turn red on tree → drop with physics ──
    function harvest(apple, text) {
        if (apple.classList.contains('harvested')) return;

        // CRITICAL: Capture exact center position BEFORE any CSS transform is applied
        const ar = apple.getBoundingClientRect();
        const gr = gardenEl.getBoundingClientRect();
        const cx = ar.left - gr.left + ar.width / 2;
        const cy = ar.top - gr.top + ar.height / 2;

        // Turn red on tree (no transform to avoid coord shift)
        apple.classList.add('harvested');
        apple.style.pointerEvents = 'none';
        apple.style.zIndex = '15';

        // After red flash, swap to physics body at EXACT captured position
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
            restitution: 0.12,  // Low bounce — apples don't bounce much
            friction: 0.9,      // High friction — prevents sliding through each other
            frictionStatic: 1.0,// Sticks when settled
            density: 0.04       // Heavier — sinks into stack properly
        });
        // Tiny nudge so apples don't perfectly stack on top of each other
        Body.setVelocity(body, { x: (Math.random() - 0.5) * 1.5, y: 0 });

        // Add drag support
        el.addEventListener('pointerdown', (e) => {
            el.setPointerCapture(e.pointerId);
            draggedBodyInfo = { body, dx: 0, dy: 0, apple: el, pointerId: e.pointerId };
            // Optional: reset velocities when caught
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
        // Calculate pointer position in world coordinates
        const px = e.clientX - gr.left;
        const py = e.clientY - gr.top;
        
        // Directly set position for responsive feel, or apply forces
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
        li.textContent = '🍎 ' + text;
        doneList.prepend(li);
        updateHarvestVisibility();
    }

    function updateHarvestVisibility() {
        harvestContainer.style.display = doneList.children.length > 0 ? 'block' : 'none';
    }

    function persist() {
        const todos = Array.from(applesContainer.querySelectorAll('.apple:not(.harvested)')).map(a => a.dataset.task);
        const harvested = Array.from(doneList.querySelectorAll('.done-item')).map(li => li.textContent.replace('🍎 ', ''));
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ todos, count: harvestedCount, harvested }));
    }

    // ── Events ──
    addBtn.addEventListener('click', () => {
        const val = todoInput.value.trim();
        if (val) { addApple(val); todoInput.value = ''; }
    });
    todoInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') addBtn.click();
    });

    clearBtn.addEventListener('click', () => {
        if (!confirm('確定清空所有收穫紀錄？')) return;
        doneList.innerHTML = '';
        physApples.forEach(({ body, element }) => {
            Composite.remove(world, body);
            element.remove();
        });
        physApples.length = 0;
        harvestedCount = 0;
        countDisplay.textContent = '0';
        updateHarvestVisibility();
        persist();
    });
});
