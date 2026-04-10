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
    const STORAGE_KEY = 'apple_todos_v22';
    const AW = 100, AH = 106, AR = 50; 
    const MAX_APPLES = 22; // Capacity check

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
        // gardenEl might be scaled via transform: scale()
        // we must calculate everything in unscaled 650x900 coordinate space for physics engine
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
        
        // Exact mapping from viewBox "0 0 320 220"
        const s = bp.w / 320; // 1.875
        const svgOffY = (bp.h - 220 * s) / 2; 
        
        // Basket Bottom Ground: y=200, from x=60 to x=260
        const gndW = 200 * s;
        const gndCx = bp.x + 160 * s;
        const gndCy = bp.y + svgOffY + 200 * s;
        // The rect's own center is y, so we place it slightly below its surface to avoid too thick floor
        const ground = Bodies.rectangle(gndCx, gndCy + 10, gndW + 20, 20, {
            isStatic: true, friction: 1
        });

        // Left wall: from (15,60) to (60,200)
        // Move wall inwards slightly dynamically
        const lx1 = bp.x + 20 * s, ly1 = bp.y + svgOffY + 60 * s;
        const lx2 = bp.x + 60 * s, ly2 = bp.y + svgOffY + 200 * s;
        const lcx = (lx1 + lx2) / 2, lcy = (ly1 + ly2) / 2;
        const llen = Math.hypot(lx2 - lx1, ly2 - ly1);
        const lang = Math.atan2(ly2 - ly1, lx2 - lx1) - Math.PI / 2;
        const leftW = Bodies.rectangle(lcx - 5, lcy, 10, llen + 40, {
            isStatic: true, angle: lang, friction: 0.2
        });

        // Right wall: from (305,60) to (260,200)
        const rx1 = bp.x + 300 * s, ry1 = bp.y + svgOffY + 60 * s;
        const rx2 = bp.x + 260 * s, ry2 = bp.y + svgOffY + 200 * s;
        const rcx = (rx1 + rx2) / 2, rcy = (ry1 + ry2) / 2;
        const rlen = Math.hypot(rx2 - rx1, ry2 - ry1);
        const rang = Math.atan2(ry2 - ry1, rx2 - rx1) - Math.PI / 2;
        const rightW = Bodies.rectangle(rcx + 5, rcy, 10, rlen + 40, {
            isStatic: true, angle: rang, friction: 0.2
        });

        // Screen floor and literal container bounds (glass walls)
        const gw = gardenEl.offsetWidth;  // Unscaled width (e.g. 650)
        const gh = gardenEl.offsetHeight; // Unscaled height (e.g. 900)
        
        // Container boundaries so apples don't fall off the window
        // Keep them bounded inside the garden area
        const wallThickness = 100;
        const leftBound = Bodies.rectangle(-wallThickness/2, gh / 2, wallThickness, gh * 2, { isStatic: true });
        const rightBound = Bodies.rectangle(gw + wallThickness/2, gh / 2, wallThickness, gh * 2, { isStatic: true });
        const topBound = Bodies.rectangle(gw / 2, -wallThickness/2 - 100, gw * 2, wallThickness, { isStatic: true });
        
        const screenGround = Bodies.rectangle(gw / 2, gh + 50, gw * 2, 100, {
            isStatic: true, friction: 0.8
        });

        walls = [ground, leftW, rightW, screenGround, leftBound, rightBound, topBound];
        Composite.add(world, walls);

        console.log('Basket walls built:', {
            ground: { x: gndCx, y: gndCy, w: gndW },
            leftWall: { cx: lcx, cy: lcy, angle: lang },
            rightWall: { cx: rcx, cy: rcy, angle: rang }
        });
    }

    // ── Responsive Scaling ──
    function resizeGarden() {
        const wrapper = document.getElementById('garden-wrapper');
        if (!wrapper) return;
        let w = wrapper.clientWidth;
        if (w > 650) w = 650;
        const scale = w / 650;
        gardenEl.style.transform = `scale(${scale})`;
        gardenEl.style.marginBottom = `-${(1 - scale) * 900}px`;
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
        '做家事', '散步', '學習新知', '感謝日記', '早點睡覺',
        '吃健康五蔬果', '學習外語', '給家人打電話', '讀專業文章', '專注工作番茄鐘'
    ];

    if (saved.todos.length === 0 && saved.harvested.length === 0) {
        TEST_ITEMS.forEach(t => addApple(t));
    } else {
        saved.todos.forEach(t => addApple(t));
    }

    // Respawn harvested apples inside basket (after walls are built)
    setTimeout(() => {
        const bp = relPos(document.querySelector('.basket-back'));
        const cx = bp.x + bp.w / 2;
        const topY = bp.y - 100; // Drop from slightly above the basket
        
        saved.harvested.forEach((task, i) => {
            setTimeout(() => {
                spawnPhysApple(task, cx + (Math.random() * 80 - 40), topY);
            }, i * 180);
        });
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
            const rx = 210, ry = 110; // Tighter vertical spread
            const d = Math.sqrt(Math.random()); 
            const tx = 300 + Math.cos(a) * rx * d - AW / 2;
            const ty = 280 + Math.sin(a) * ry * d - AH / 2; // Much lower center (280px)
            const ok = existing.every(el => {
                const ex = parseFloat(el.style.left), ey = parseFloat(el.style.top);
                return Math.hypot(ex - tx, ey - ty) >= 95; 
            });
            if (ok) { px = tx; py = ty; break; }
            tries++;
        }
        if (px === undefined) { px = 300; py = 280; }

        apple.style.left = px + 'px';
        apple.style.top = py + 'px';
        apple.addEventListener('click', () => harvest(apple, text));
        applesContainer.appendChild(apple);
        persist();
    }

    // ── Harvest: turn red on tree → drop with physics ──
    function harvest(apple, text) {
        if (apple.classList.contains('harvested')) return;

        // CRITICAL: Capture exact offset center position ignoring container scale
        const ar = apple.getBoundingClientRect();
        const gr = gardenEl.getBoundingClientRect();
        const scale = gr.width / gardenEl.offsetWidth;
        const cx = (ar.left - gr.left) / scale + (ar.width / scale) / 2;
        const cy = (ar.top - gr.top) / scale + (ar.height / scale) / 2;

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
        
        // Calculate the current visual scale of the garden
        const wrapper = document.getElementById('garden-wrapper');
        let w = wrapper ? wrapper.clientWidth : 650;
        if (w > 650) w = 650;
        const scale = w / 650;

        // Calculate pointer position relative to garden in unscaled physics coordinates
        const px = (e.clientX - gr.left) / scale;
        const py = (e.clientY - gr.top) / scale;
        
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
        li.textContent = text;
        doneList.prepend(li);
    }

    function persist() {
        const todos = Array.from(applesContainer.querySelectorAll('.apple:not(.harvested)')).map(a => a.dataset.task);
        const harvested = Array.from(doneList.querySelectorAll('.done-item')).map(li => li.textContent);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ todos, count: harvestedCount, harvested }));
        
        // Update Floating Badge
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
        
        // Remove harvested list UI elements
        doneList.innerHTML = '';
        
        // Remove physical apples from world and DOM
        physApples.forEach(({ body, element }) => {
            Composite.remove(world, body);
            element.remove();
        });
        physApples.length = 0;
        
        // Reactivate apples on the tree so they can be dropped again
        document.querySelectorAll('.harvested').forEach(el => {
            el.classList.remove('harvested');
            el.style.pointerEvents = 'auto'; // Re-enable clicking
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
