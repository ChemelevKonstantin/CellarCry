// --- Canvas Setup ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 1024;
canvas.height = 768;

// --- Wall Image ---
const wallImg = new Image();
wallImg.src = 'assets/wall1.png';

// --- UI Overlay ---
const uiOverlay = document.getElementById('uiOverlay');
const statsOverlay = document.getElementById('statsOverlay');

// --- Room Layout ---
const ROOM_WIDTH = canvas.width;
const ROOM_HEIGHT = canvas.height;
const TILE_SIZE = 64; // 16x12 grid for logic, not visible
const ROOM_COLS = 16;
const ROOM_ROWS = 12;

// --- Player ---
const player = {
    x: ROOM_WIDTH/2 - 30,
    y: ROOM_HEIGHT/2 - 30,
    w: 80,
    h: 80,
    speed: 3,
    color: '#f5e663',
    health: 5,
    maxHealth: 5,
    items: [], // passive items
    dir: {x: 0, y: 0},
    coins: 0,
    keys: 0,
    bombs: 2,
    heals: 1,
    activeItem: null, // {name, cooldown, onUse}
    activeCooldown: 0,
    tearDamage: 5,
    bombCooldown: 0, // cooldown for bomb placement
    tearSpeed: 6, // new: tear velocity (Higher = faster)
    tearRate: 50, // new: frames between shots (lower = faster)
    enemiesKilled: 0,
};

// --- Room Generation Helper ---
function openDoorBetweenRooms(roomA, roomB, dir) {
    const midCol = Math.floor(ROOM_COLS/2);
    const midRow = Math.floor(ROOM_ROWS/2);
    if (dir === 'up') {
        // Open bottom of roomB, top of roomA
        roomA[0][midCol-1] = 0; roomA[0][midCol] = 0; roomA[0][midCol+1] = 0;
        roomB[ROOM_ROWS-1][midCol-1] = 0; roomB[ROOM_ROWS-1][midCol] = 0; roomB[ROOM_ROWS-1][midCol+1] = 0;
    } else if (dir === 'down') {
        // Open bottom of roomA, top of roomB
        roomA[ROOM_ROWS-1][midCol-1] = 0; roomA[ROOM_ROWS-1][midCol] = 0; roomA[ROOM_ROWS-1][midCol+1] = 0;
        roomB[0][midCol-1] = 0; roomB[0][midCol] = 0; roomB[0][midCol+1] = 0;
    } else if (dir === 'left') {
        // Open left of roomA, right of roomB
        roomA[midRow-1][0] = 0; roomA[midRow][0] = 0; roomA[midRow+1][0] = 0;
        roomB[midRow-1][ROOM_COLS-1] = 0; roomB[midRow][ROOM_COLS-1] = 0; roomB[midRow+1][ROOM_COLS-1] = 0;
    } else if (dir === 'right') {
        // Open right of roomA, left of roomB
        roomA[midRow-1][ROOM_COLS-1] = 0; roomA[midRow][ROOM_COLS-1] = 0; roomA[midRow+1][ROOM_COLS-1] = 0;
        roomB[midRow-1][0] = 0; roomB[midRow][0] = 0; roomB[midRow+1][0] = 0;
    }
}

function generateRoom(roomX, roomY) { // Renamed from generateRoom to avoid conflict, now just creates a simple room grid
    const newRoomGrid = [];
    for (let y = 0; y < ROOM_ROWS; y++) {
        const row = [];
        for (let x = 0; x < ROOM_COLS; x++) {
            if (y === 0 || y === ROOM_ROWS-1 || x === 0 || x === ROOM_COLS-1) {
                row.push(1); // wall
            } else {
                row.push(0); // floor
            }
        }
        newRoomGrid.push(row);
    }
    return newRoomGrid;
}

// --- Dungeon (Multiple Rooms, Random Walk Generation) ---
const DUNGEON_SIZE = 4;
let dungeon = [];
for (let y = 0; y < DUNGEON_SIZE; y++) {
    let row = [];
    for (let x = 0; x < DUNGEON_SIZE; x++) {
        row.push({
            exists: false,
            room: null, // Will hold the 2D array for the room grid
            enemies: [],
            visited: false
        });
    }
    dungeon.push(row);
}

// 1. Determine which rooms exist and initialize their basic (closed) grids
let genRoomX = Math.floor(DUNGEON_SIZE/2), genRoomY = Math.floor(DUNGEON_SIZE/2);
dungeon[genRoomY][genRoomX].exists = true;
dungeon[genRoomY][genRoomX].room = generateRoom(genRoomX, genRoomY);
let steps = 8;
let currentWalkX = genRoomX, currentWalkY = genRoomY;

for (let i = 0; i < steps; i++) {
    const dirs = [
        {dx: 0, dy: -1, name: 'up', opp: 'down'},
        {dx: 0, dy: 1, name: 'down', opp: 'up'},
        {dx: -1, dy: 0, name: 'left', opp: 'right'},
        {dx: 1, dy: 0, name: 'right', opp: 'left'}
    ];
    let possible = dirs.filter(d => {
        let nx = currentWalkX + d.dx, ny = currentWalkY + d.dy;
        return nx >= 0 && nx < DUNGEON_SIZE && ny >= 0 && ny < DUNGEON_SIZE;
    });
    if (possible.length === 0) break;
    let d = possible[Math.floor(Math.random()*possible.length)];
    let nextWalkX = currentWalkX + d.dx, nextWalkY = currentWalkY + d.dy;
    if (!dungeon[nextWalkY][nextWalkX].exists) {
        dungeon[nextWalkY][nextWalkX].exists = true;
        dungeon[nextWalkY][nextWalkX].room = generateRoom(nextWalkX, nextWalkY);
        // NO door opening here yet
    }
    currentWalkX = nextWalkX; currentWalkY = nextWalkY;
}

const startX = Math.floor(DUNGEON_SIZE/2);
const startY = Math.floor(DUNGEON_SIZE/2);
const neighborDirs = [
    {dx: 0, dy: -1, name: 'up', opp: 'down'},
    {dx: 0, dy: 1, name: 'down', opp: 'up'},
    {dx: -1, dy: 0, name: 'left', opp: 'right'},
    {dx: 1, dy: 0, name: 'right', opp: 'left'}
];
let existingNeighborCount = 0;
for (let d of neighborDirs) {
    let nx = startX + d.dx, ny = startY + d.dy;
    if (nx >= 0 && nx < DUNGEON_SIZE && ny >= 0 && ny < DUNGEON_SIZE && dungeon[ny][nx].exists) {
        existingNeighborCount++;
    }
}

let forcedNeighbors = 0;
while (existingNeighborCount + forcedNeighbors < 2) {
    let possibleNewDirs = neighborDirs.filter(d => {
        let nx = startX + d.dx, ny = startY + d.dy;
        return nx >= 0 && nx < DUNGEON_SIZE && ny >= 0 && ny < DUNGEON_SIZE && !dungeon[ny][nx].exists;
    });
    if (possibleNewDirs.length === 0) break; // No space to force new neighbors
    let d = possibleNewDirs[Math.floor(Math.random()*possibleNewDirs.length)];
    let nx = startX + d.dx, ny = startY + d.dy;
    dungeon[ny][nx].exists = true;
    dungeon[ny][nx].room = generateRoom(nx, ny);
    // NO door opening here yet
    forcedNeighbors++;
}

// 2. Finalize all doors by iterating through the generated structure
function finalizeAllRoomDoors() {
    for (let y = 0; y < DUNGEON_SIZE; y++) {
        for (let x = 0; x < DUNGEON_SIZE; x++) {
            if (!dungeon[y][x].exists) continue;
            // Up
            if (y > 0 && dungeon[y-1][x].exists) {
                openDoorBetweenRooms(dungeon[y][x].room, dungeon[y-1][x].room, 'up');
            }
            // Down
            if (y < DUNGEON_SIZE-1 && dungeon[y+1][x].exists) {
                openDoorBetweenRooms(dungeon[y][x].room, dungeon[y+1][x].room, 'down');
            }
            // Left
            if (x > 0 && dungeon[y][x-1].exists) {
                openDoorBetweenRooms(dungeon[y][x].room, dungeon[y][x-1].room, 'left');
            }
            // Right
            if (x < DUNGEON_SIZE-1 && dungeon[y][x+1].exists) {
                openDoorBetweenRooms(dungeon[y][x].room, dungeon[y][x+1].room, 'right');
            }
        }
    }
}
finalizeAllRoomDoors();

// Set starting room and current room grid
currentRoomX = startX;
currentRoomY = startY;
let currentRoom = dungeon[currentRoomY][currentRoomX].room;

// --- At game start, do not populate enemies in starting room ---
dungeon[currentRoomY][currentRoomX].visited = true; // Mark start as visited

// --- Input Handling (Space for bomb, H for heal, active item if present) ---
const keys = {};
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space') {
        if (player.bombs > 0 && player.bombCooldown === 0) {
            placeBomb(player.x + player.w/2, player.y + player.h/2);
            player.bombs--;
            player.bombCooldown = 20; // short cooldown
        } else if (player.activeItem && player.activeCooldown === 0) {
            let used = player.activeItem.onUse();
            if (used) player.activeCooldown = player.activeItem.cooldown;
        }
    } else if (e.code === 'KeyH') {
        if (player.heals > 0 && player.health < player.maxHealth) {
            player.health = Math.min(player.maxHealth, player.health+2);
            player.heals--;
            spawnEffect(player.x + player.w/2, player.y + player.h/2, 'heal-use');
        }
    }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// --- Movement and Facing Direction ---
const moveDir = {x: 0, y: 0};
let lastMoveDir = {x: 1, y: 0}; // Default facing right

// --- Mouse Control ---
let mouseControl = false;
let mouseTarget = { x: player.x + player.w/2, y: player.y + player.h/2 };

canvas.addEventListener('click', (e) => {
    mouseControl = !mouseControl;
    if (mouseControl) {
        // Set initial target to current mouse position
        const rect = canvas.getBoundingClientRect();
        mouseTarget.x = (e.clientX - rect.left) * (canvas.width / rect.width);
        mouseTarget.y = (e.clientY - rect.top) * (canvas.height / rect.height);
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (!mouseControl) return;
    const rect = canvas.getBoundingClientRect();
    mouseTarget.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouseTarget.y = (e.clientY - rect.top) * (canvas.height / rect.height);
});

function handleInput() {
    if (mouseControl) {
        // Move toward mouse target
        const px = player.x + player.w/2;
        const py = player.y + player.h/2;
        const dx = mouseTarget.x - px;
        const dy = mouseTarget.y - py;
        const dist = Math.hypot(dx, dy);
        if (dist > 6) { // Deadzone
            moveDir.x = dx / dist;
            moveDir.y = dy / dist;
        } else {
            moveDir.x = 0;
            moveDir.y = 0;
        }
        // Update lastMoveDir if moving
        if (moveDir.x !== 0 || moveDir.y !== 0) {
            lastMoveDir.x = moveDir.x;
            lastMoveDir.y = moveDir.y;
        }
        player.dir.x = moveDir.x;
        player.dir.y = moveDir.y;
        return;
    }
    // WASD and Arrow keys (using event.code for layout independence)
    moveDir.x = 0;
    moveDir.y = 0;
    if (keys['KeyW'] || keys['ArrowUp']) moveDir.y = -1;
    if (keys['KeyS'] || keys['ArrowDown']) moveDir.y = 1;
    if (keys['KeyA'] || keys['ArrowLeft']) moveDir.x = -1;
    if (keys['KeyD'] || keys['ArrowRight']) moveDir.x = 1;
    if (moveDir.x !== 0 || moveDir.y !== 0) {
        lastMoveDir.x = moveDir.x;
        lastMoveDir.y = moveDir.y;
    }
    player.dir.x = moveDir.x;
    player.dir.y = moveDir.y;
}

// --- Shooting Cooldown ---
let shootCooldown = 0;

function updateShooting() {
    // Only shoot if facing a direction (not 0,0)
    if ((lastMoveDir.x !== 0 || lastMoveDir.y !== 0) && shootCooldown === 0) {
        shootTear(lastMoveDir);
        shootCooldown = player.tearRate;
    }
    if (shootCooldown > 0) shootCooldown--;
}

function movePlayer() {
    // Predict next position
    const nextX = player.x + player.dir.x * player.speed;
    const nextY = player.y + player.dir.y * player.speed;
    // Player bounding box corners
    const corners = [
        {x: nextX, y: nextY},
        {x: nextX + player.w, y: nextY},
        {x: nextX, y: nextY + player.h},
        {x: nextX + player.w, y: nextY + player.h}
    ];
    let blocked = false;
    for (let c of corners) {
        let gridX = Math.floor(c.x / TILE_SIZE);
        let gridY = Math.floor(c.y / TILE_SIZE);
        if (currentRoom[gridY] && currentRoom[gridY][gridX] === 1) {
            blocked = true;
            break;
        }
    }
    // --- Door collision: block door gap unless room is cleared ---
    if (!blocked) {
        // Check if player is in a door gap
        let allEnemiesDead = dungeon[currentRoomY][currentRoomX].enemies.every(e => !e.alive);
        if (!allEnemiesDead) {
            let midCol = Math.floor(ROOM_COLS / 2);
            let midRow = Math.floor(ROOM_ROWS / 2);
            // Up door gap
            if (
                nextY < TILE_SIZE / 2 &&
                nextX + player.w/2 > (midCol-1)*TILE_SIZE &&
                nextX + player.w/2 < (midCol+2)*TILE_SIZE
            ) blocked = true;
            // Down door gap
            if (
                nextY + player.h > ROOM_HEIGHT - TILE_SIZE / 2 &&
                nextX + player.w/2 > (midCol-1)*TILE_SIZE &&
                nextX + player.w/2 < (midCol+2)*TILE_SIZE
            ) blocked = true;
            // Left door gap
            if (
                nextX < TILE_SIZE / 2 &&
                nextY + player.h/2 > (midRow-1)*TILE_SIZE &&
                nextY + player.h/2 < (midRow+2)*TILE_SIZE
            ) blocked = true;
            // Right door gap
            if (
                nextX + player.w > ROOM_WIDTH - TILE_SIZE / 2 - player.w/2 &&
                nextY + player.h/2 > (midRow-1)*TILE_SIZE &&
                nextY + player.h/2 < (midRow+2)*TILE_SIZE
            ) blocked = true;
        }
    }
    if (!blocked) {
        player.x = nextX;
        player.y = nextY;
    }
    // Clamp to canvas as fallback
    const minX = 0;
    const minY = 0;
    const maxX = ROOM_WIDTH - player.w;
    const maxY = ROOM_HEIGHT - player.h;
    player.x = Math.max(minX, Math.min(maxX, player.x));
    player.y = Math.max(minY, Math.min(maxY, player.y));
}

// --- Drawing ---
function drawRoom() {
    // Draw room grid (walls and doors)
    for (let y = 0; y < ROOM_ROWS; y++) {
        for (let x = 0; x < ROOM_COLS; x++) {
            if (currentRoom[y][x] === 1) {
                // Draw wall image if loaded, else fallback to color
                if (wallImg.complete && wallImg.naturalWidth !== 0) {
                    ctx.drawImage(wallImg, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                } else {
                    ctx.fillStyle = '#222'; // fallback wall color
                    ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            } else {
                ctx.fillStyle = '#353535'; // floor/door (darker)
                ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }
    // Draw inner wall border (optional, for more Isaac look)
    ctx.save();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, ROOM_WIDTH, ROOM_HEIGHT);
    ctx.restore();
    // Draw doors in the wall gap (not overlapping border)
    ctx.save();
    ctx.fillStyle = '#b97a56'; // brown door color
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    // Center calculations
    let midCol = Math.floor(ROOM_COLS / 2);
    let midRow = Math.floor(ROOM_ROWS / 2);
    // Up (top wall gap)
    if (currentRoomY > 0 && dungeon[currentRoomY-1][currentRoomX] && dungeon[currentRoomY-1][currentRoomX].exists) {
        let doorY = 0;
        let doorH = TILE_SIZE / 2;
        let doorW = TILE_SIZE * 3;
        let doorX = (midCol - 1) * TILE_SIZE;
        ctx.fillRect(doorX, doorY, doorW, doorH);
        ctx.strokeRect(doorX, doorY, doorW, doorH);
    }
    // Down (bottom wall gap)
    if (currentRoomY < DUNGEON_SIZE-1 && dungeon[currentRoomY+1][currentRoomX] && dungeon[currentRoomY+1][currentRoomX].exists) {
        let doorH = TILE_SIZE / 2;
        let doorW = TILE_SIZE * 3;
        let doorX = (midCol - 1) * TILE_SIZE;
        let doorY = ROOM_HEIGHT - doorH;
        ctx.fillRect(doorX, doorY, doorW, doorH);
        ctx.strokeRect(doorX, doorY, doorW, doorH);
    }
    // Left (left wall gap)
    if (currentRoomX > 0 && dungeon[currentRoomY][currentRoomX-1] && dungeon[currentRoomY][currentRoomX-1].exists) {
        let doorW = TILE_SIZE / 2;
        let doorH = TILE_SIZE * 3;
        let doorX = 0;
        let doorY = (midRow - 1) * TILE_SIZE;
        ctx.fillRect(doorX, doorY, doorW, doorH);
        ctx.strokeRect(doorX, doorY, doorW, doorH);
    }
    // Right (right wall gap)
    if (currentRoomX < DUNGEON_SIZE-1 && dungeon[currentRoomY][currentRoomX+1] && dungeon[currentRoomY][currentRoomX+1].exists) {
        let doorW = TILE_SIZE / 2;
        let doorH = TILE_SIZE * 3;
        let doorX = ROOM_WIDTH - doorW;
        let doorY = (midRow - 1) * TILE_SIZE;
        ctx.fillRect(doorX, doorY, doorW, doorH);
        ctx.strokeRect(doorX, doorY, doorW, doorH);
    }
    ctx.restore();
}

// --- Enemy Types ---
const ENEMY_TYPES = [
    // Regulars
    { name: 'Blob', category: 'Regular', minLevel: 1, maxHealth: 2, speed: 0.7, color: '#e55', emoji: '🟠', effect: null },
    { name: 'Fastling', category: 'Regular', minLevel: 2, maxHealth: 1, speed: 1.3, color: '#5af', emoji: '🟦', effect: null },
    { name: 'Splitter', category: 'Regular', minLevel: 3, maxHealth: 2, speed: 0.8, color: '#ad5', emoji: '🟩', effect: 'split' },
    { name: 'Bouncer', category: 'Regular', minLevel: 2, maxHealth: 2, speed: 1.0, color: '#fa5', emoji: '🟫', effect: 'bounce' },
    { name: 'Wanderer', category: 'Regular', minLevel: 1, maxHealth: 1, speed: 0.9, color: '#5fa', emoji: '🟩', effect: 'wander' },
    // Miniboss
    { name: 'Charger', category: 'Miniboss', minLevel: 2, maxHealth: 6, speed: 1.1, color: '#f5e663', emoji: '🟡', effect: 'charge' },
    { name: 'Shooter', category: 'Miniboss', minLevel: 3, maxHealth: 5, speed: 0.7, color: '#b5f', emoji: '🟣', effect: 'shoot' },
    { name: 'Spitter', category: 'Miniboss', minLevel: 3, maxHealth: 4, speed: 0.8, color: '#0cf', emoji: '🟦', effect: 'spit' },
    { name: 'Tank', category: 'Miniboss', minLevel: 2, maxHealth: 10, speed: 0.4, color: '#888', emoji: '⬛', effect: 'tank' },
    // Boss
    { name: 'Big Boss', category: 'Boss', minLevel: 2, maxHealth: 15, speed: 0.6, color: '#f33', emoji: '🔴', effect: 'boss' },
    { name: 'Twin Boss', category: 'Boss', minLevel: 3, maxHealth: 8, speed: 0.8, color: '#f93', emoji: '🟤', effect: 'twin' },
    { name: 'Summoner', category: 'Boss', minLevel: 1, maxHealth: 12, speed: 0.5, color: '#3cf', emoji: '🔵', effect: 'summon' },
];
// --- Current Dungeon Level (for future expansion) ---
let dungeonLevel = 1;

// --- Enemy ---
function spawnEnemyOfType(type, x, y) {
    return {
        x: x * TILE_SIZE + TILE_SIZE/2,
        y: y * TILE_SIZE + TILE_SIZE/2,
        w: 56,
        h: 56,
        color: type.color,
        emoji: type.emoji,
        speed: type.speed,
        health: type.maxHealth,
        maxHealth: type.maxHealth,
        alive: true,
        name: type.name,
        category: type.category,
        effect: type.effect,
        state: {}, // for effect state
        vx: 0, // Knockback velocity X
        vy: 0  // Knockback velocity Y
    };
}

// --- Boss Room Selection (one per dungeon level) ---
let bossRooms = [];
function pickBossRooms() {
    bossRooms = [];
    let usedBossRooms = new Set();
    for (let lvl = 1; lvl <= dungeonLevel; lvl++) {
        let candidates = [];
        for (let y = 0; y < DUNGEON_SIZE; y++) {
            for (let x = 0; x < DUNGEON_SIZE; x++) {
                let key = `${x},${y}`;
                if (
                    dungeon[y][x].exists &&
                    !dungeon[y][x].isTreasure &&
                    !(x === startX && y === startY) &&
                    !usedBossRooms.has(key)
                ) {
                    candidates.push({x, y, key});
                }
            }
        }
        // If no candidates left, relax restriction: allow any non-start, existing room not already used for boss
        if (candidates.length === 0) {
            for (let y = 0; y < DUNGEON_SIZE; y++) {
                for (let x = 0; x < DUNGEON_SIZE; x++) {
                    let key = `${x},${y}`;
                    if (
                        dungeon[y][x].exists &&
                        !(x === startX && y === startY) &&
                        !usedBossRooms.has(key)
                    ) {
                        candidates.push({x, y, key});
                    }
                }
            }
        }
        if (candidates.length) {
            let idx = Math.floor(Math.random()*candidates.length);
            let bossRoom = candidates[idx];
            usedBossRooms.add(bossRoom.key);
            bossRoom.level = lvl;
            bossRooms.push(bossRoom);
            dungeon[bossRoom.y][bossRoom.x][`isBoss${lvl}`] = true;
        }
    }
    // After assignment, ensure only one boss room per level
    for (let lvl = 1; lvl <= dungeonLevel; lvl++) {
        let foundBoss = false;
        for (let y = 0; y < DUNGEON_SIZE; y++) {
            for (let x = 0; x < DUNGEON_SIZE; x++) {
                if (dungeon[y][x][`isBoss${lvl}`]) {
                    if (!foundBoss) {
                        foundBoss = true;
                    } else {
                        delete dungeon[y][x][`isBoss${lvl}`];
                    }
                }
            }
        }
    }
}
pickBossRooms();

function populateRoomEnemies(roomObj) {
    if (!roomObj.exists) return;
    roomObj.enemies = [];
    // Boss room logic for current dungeonLevel
    if (roomObj[`isBoss${dungeonLevel}`]) {
        // Only spawn Bosses with minLevel === dungeonLevel
        let allowedBosses = ENEMY_TYPES.filter(t => t.category === 'Boss' && t.minLevel === dungeonLevel);
        if (allowedBosses.length === 0) return;
        // Always at least one boss
        let bossType = allowedBosses[Math.floor(Math.random()*allowedBosses.length)];
        let ex = Math.floor(ROOM_COLS/2);
        let ey = Math.floor(ROOM_ROWS/2);
        roomObj.enemies.push(spawnEnemyOfType(bossType, ex, ey));
        // Optionally, spawn a second boss for Twin Boss
        if (bossType.effect === 'twin') {
            let ex2 = ex + 2;
            let ey2 = ey;
            roomObj.enemies.push(spawnEnemyOfType(bossType, ex2, ey2));
        }
        return;
    }
    // Allow all types (Regular, Miniboss) whose minLevel <= dungeonLevel
    let allowedTypes = ENEMY_TYPES.filter(t => (t.category === 'Regular' || t.category === 'Miniboss') && t.minLevel <= dungeonLevel);
    for (let i = 0; i < Math.floor(Math.random()*3)+1; i++) {
        let type = allowedTypes[Math.floor(Math.random()*allowedTypes.length)];
        let ex = Math.floor(Math.random()*(ROOM_COLS-4))+2;
        let ey = Math.floor(Math.random()*(ROOM_ROWS-4))+2;
        roomObj.enemies.push(spawnEnemyOfType(type, ex, ey));
    }
}

// --- Tears (Projectiles) ---
let tears = [];
function shootTear(dir) {
    // Add vy for gravity
    const speed = player.tearSpeed;
    const angle = Math.atan2(dir.y, dir.x);
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed * 0.85; // slightly less vertical
    const vy = -0.2; // much less upward arc
    const startX = player.x + player.w/2;
    const startY = player.y + player.h/2;
    tears.push({
        x: startX,
        y: startY,
        dx: dx,
        dy: dy,
        vy: vy,
        r: 18,
        baseR: 18,
        color: '#8cf',
        alive: true,
        life: 0,
        maxLife: 120,
        startX: startX,
        startY: startY,
        dirY: dir.y // store original Y direction
    });
}

const TEAR_RANGE = 380;

// --- Player Invincibility ---
let invincible = 0;
const INVINCIBLE_TIME = 60;

// --- Game Over Overlay ---
const gameOverOverlay = document.getElementById('gameOverOverlay');
const restartBtn = document.getElementById('restartBtn');
let isGameOver = false;
if (restartBtn) {
    restartBtn.onclick = () => window.location.reload();
}

function showGameOver() {
    isGameOver = true;
    gameOverOverlay.style.display = 'flex';
}

// --- Update Functions ---
function updateEnemies() {
    let roomObj = dungeon[currentRoomY][currentRoomX];
    // Track twin bosses for Twin Boss effect
    let twinBosses = roomObj.enemies.filter(e => e.alive && e.effect === 'twin');
    let allEnemiesDead = roomObj.enemies.every(e => !e.alive);
    for (let enemy of roomObj.enemies) {
        if (!enemy.alive) continue;
        // Store previous position for collision revert
        let prevX = enemy.x;
        let prevY = enemy.y;
        // --- Knockback movement ---
        if (Math.abs(enemy.vx) > 0.01 || Math.abs(enemy.vy) > 0.01) {
            enemy.x += enemy.vx;
            enemy.y += enemy.vy;
            // Friction
            enemy.vx *= 0.85;
            enemy.vy *= 0.85;
            // Wall collision (simple bounce)
            let gridX = Math.floor(enemy.x / TILE_SIZE);
            let gridY = Math.floor(enemy.y / TILE_SIZE);
            if (currentRoom[gridY] && currentRoom[gridY][gridX] === 1) {
                enemy.vx *= -0.4;
                enemy.vy *= -0.4;
            }
        }
        // --- Door collision: block door gap unless room is cleared ---
        if (!allEnemiesDead) {
            let midCol = Math.floor(ROOM_COLS / 2);
            let midRow = Math.floor(ROOM_ROWS / 2);
            // Up door gap
            if (
                enemy.y < TILE_SIZE / 2 &&
                enemy.x > (midCol-1)*TILE_SIZE &&
                enemy.x < (midCol+2)*TILE_SIZE
            ) {
                enemy.x = prevX;
                enemy.y = prevY;
            }
            // Down door gap
            if (
                enemy.y > ROOM_HEIGHT - TILE_SIZE / 2 - enemy.h/2 &&
                enemy.x > (midCol-1)*TILE_SIZE &&
                enemy.x < (midCol+2)*TILE_SIZE
            ) {
                enemy.x = prevX;
                enemy.y = prevY;
            }
            // Left door gap
            if (
                enemy.x < TILE_SIZE / 2 &&
                enemy.y > (midRow-1)*TILE_SIZE &&
                enemy.y < (midRow+2)*TILE_SIZE
            ) {
                enemy.x = prevX;
                enemy.y = prevY;
            }
            // Right door gap
            if (
                enemy.x > ROOM_WIDTH - TILE_SIZE / 2 - enemy.w/2 &&
                enemy.y > (midRow-1)*TILE_SIZE &&
                enemy.y < (midRow+2)*TILE_SIZE
            ) {
                enemy.x = prevX;
                enemy.y = prevY;
            }
        }
        // --- Unique effects ---
        if (enemy.effect === 'charge') {
            // Miniboss Charger: occasionally charges at player
            if (!enemy.state.charging && Math.random() < 0.01) {
                enemy.state.charging = 30 + Math.random()*30; // charge for 30-60 frames
                let dx = player.x + player.w/2 - enemy.x;
                let dy = player.y + player.h/2 - enemy.y;
                let dist = Math.hypot(dx, dy);
                enemy.state.chargeDir = {x: dx/dist, y: dy/dist};
            }
            if (enemy.state.charging) {
                enemy.x += enemy.state.chargeDir.x * enemy.speed * 2.5;
                enemy.y += enemy.state.chargeDir.y * enemy.speed * 2.5;
                enemy.state.charging--;
                if (enemy.state.charging <= 0) enemy.state.charging = null;
                continue;
            }
        } else if (enemy.effect === 'shoot') {
            // Miniboss Shooter: occasionally shoots at player (visual only)
            if (!enemy.state.cooldown || enemy.state.cooldown <= 0) {
                if (Math.random() < 0.02) {
                    // Visual: spawn a quick blue tear toward player
                    let dx = player.x + player.w/2 - enemy.x;
                    let dy = player.y + player.h/2 - enemy.y;
                    let dist = Math.hypot(dx, dy);
                    let speed = 7;
                    tears.push({
                        x: enemy.x,
                        y: enemy.y,
                        dx: dx/dist*speed,
                        dy: dy/dist*speed*0.85,
                        vy: 0,
                        r: 12,
                        baseR: 12,
                        color: '#5af',
                        alive: true,
                        life: 0,
                        maxLife: 60,
                        startX: enemy.x,
                        startY: enemy.y,
                        dirY: dy/dist
                    });
                    enemy.state.cooldown = 60;
                }
            } else {
                enemy.state.cooldown--;
            }
        } else if (enemy.effect === 'bounce') {
            // Bouncer: moves in a straight line, bounces off walls
            if (!enemy.state.dir) {
                let angle = Math.random() * 2 * Math.PI;
                enemy.state.dir = {x: Math.cos(angle), y: Math.sin(angle)};
            }
            let nextX = enemy.x + enemy.state.dir.x * enemy.speed;
            let nextY = enemy.y + enemy.state.dir.y * enemy.speed;
            let gridX = Math.floor(nextX / TILE_SIZE);
            let gridY = Math.floor(nextY / TILE_SIZE);
            if (currentRoom[gridY] && currentRoom[gridY][gridX] === 1) {
                // Bounce: reflect direction
                if (currentRoom[Math.floor(enemy.y / TILE_SIZE)][gridX] === 1) enemy.state.dir.x *= -1;
                if (currentRoom[gridY][Math.floor(enemy.x / TILE_SIZE)] === 1) enemy.state.dir.y *= -1;
            } else {
                enemy.x = nextX;
                enemy.y = nextY;
            }
            // No chase AI
            continue;
        } else if (enemy.effect === 'wander') {
            // Wanderer: moves in random direction, changes every 60-120 frames
            if (!enemy.state.dir || !enemy.state.timer || enemy.state.timer <= 0) {
                let angle = Math.random() * 2 * Math.PI;
                enemy.state.dir = {x: Math.cos(angle), y: Math.sin(angle)};
                enemy.state.timer = 60 + Math.floor(Math.random()*60);
            }
            let nextX = enemy.x + enemy.state.dir.x * enemy.speed;
            let nextY = enemy.y + enemy.state.dir.y * enemy.speed;
            let gridX = Math.floor(nextX / TILE_SIZE);
            let gridY = Math.floor(nextY / TILE_SIZE);
            if (currentRoom[gridY] && currentRoom[gridY][gridX] === 1) {
                enemy.state.timer = 0; // pick new direction
            } else {
                enemy.x = nextX;
                enemy.y = nextY;
                enemy.state.timer--;
            }
            // No chase AI
            continue;
        } else if (enemy.effect === 'spit') {
            // Spitter: shoots 8 projectiles in all directions every 90 frames
            if (!enemy.state.cooldown || enemy.state.cooldown <= 0) {
                for (let j = 0; j < 8; j++) {
                    let angle = (Math.PI*2) * (j/8);
                    let speed = 5;
                    tears.push({
                        x: enemy.x,
                        y: enemy.y,
                        dx: Math.cos(angle)*speed,
                        dy: Math.sin(angle)*speed*0.85,
                        vy: 0,
                        r: 10,
                        baseR: 10,
                        color: '#0cf',
                        alive: true,
                        life: 0,
                        maxLife: 60,
                        startX: enemy.x,
                        startY: enemy.y,
                        dirY: Math.sin(angle)
                    });
                }
                enemy.state.cooldown = 90;
            } else {
                enemy.state.cooldown--;
            }
        } else if (enemy.effect === 'tank') {
            // Tank: becomes invincible for 30 frames after hit (flashes)
            if (enemy.state.invincible && enemy.state.invincible > 0) {
                enemy.state.invincible--;
            }
        } else if (enemy.effect === 'twin') {
            // Twin Boss: if one dies, the other speeds up
            if (twinBosses.length === 1 && !enemy.state.angry) {
                enemy.speed *= 1.7;
                enemy.state.angry = true;
            }
        } else if (enemy.effect === 'summon') {
            // Summoner: spawns a regular enemy every 120 frames
            if (!enemy.state.cooldown || enemy.state.cooldown <= 0) {
                let regulars = ENEMY_TYPES.filter(t => t.category === 'Regular' && t.minLevel <= dungeonLevel);
                let type = regulars[Math.floor(Math.random()*regulars.length)];
                let ex = (enemy.x + (Math.random()-0.5)*60) / TILE_SIZE;
                let ey = (enemy.y + (Math.random()-0.5)*60) / TILE_SIZE;
                roomObj.enemies.push(spawnEnemyOfType(type, ex, ey));
                enemy.state.cooldown = 120;
            } else {
                enemy.state.cooldown--;
            }
        }
        // --- Regular chase AI for all ---
        let dx = player.x + player.w/2 - enemy.x;
        let dy = player.y + player.h/2 - enemy.y;
        let dist = Math.hypot(dx, dy);
        if (dist > 1) {
            enemy.x += (dx/dist) * enemy.speed;
            enemy.y += (dy/dist) * enemy.speed;
        }
        // Collision with player
        if (invincible === 0 && Math.abs(enemy.x - (player.x+player.w/2)) < (enemy.w/2+player.w/2) && Math.abs(enemy.y - (player.y+player.h/2)) < (enemy.h/2+player.h/2)) {
            player.health--;
            invincible = INVINCIBLE_TIME;
        }
    }
}

// --- Splashes (Tear Impact Effects) ---
let splashes = [];
let splashDrops = [];

function spawnSplash(x, y) {
    splashes.push({
        x,
        y,
        r: 10,
        maxR: 32,
        alpha: 1,
        life: 0,
        maxLife: 12
    });
    // Diagonal drop directions with randomization
    const baseDirs = [
        {dx: -1, dy: -1},
        {dx: 1, dy: -1},
        {dx: 1, dy: 1},
        {dx: -1, dy: 1}
    ];
    // Optionally add 1-2 more drops at random angles
    const extraDrops = Math.floor(Math.random() * 3); // 0, 1, or 2
    let dirs = [...baseDirs];
    for (let i = 0; i < extraDrops; i++) {
        const angle = Math.random() * 2 * Math.PI;
        dirs.push({dx: Math.cos(angle), dy: Math.sin(angle)});
    }
    for (let d of dirs) {
        // Randomize speed and radius
        const speed = 4 + Math.random() * 3; // 4 to 7
        const radius = 5 + Math.random() * 7; // 5 to 12
        // Small random angle offset
        const angleOffset = (Math.random() - 0.5) * (Math.PI / 8);
        const angle = Math.atan2(d.dy, d.dx) + angleOffset;
        // Add vy for gravity
        const initialVy = Math.sin(angle) * speed * 0.7 - (Math.random() * 2 + 2); // upward burst
        splashDrops.push({
            x: x,
            y: y,
            dx: Math.cos(angle) * speed,
            dy: Math.sin(angle) * speed * 0.5, // less horizontal
            vy: initialVy,
            r: radius,
            alpha: 1,
            life: 0,
            maxLife: 18,
            baseR: radius
        });
    }
}

function updateSplashes() {
    for (let splash of splashes) {
        splash.life++;
        splash.r += 2;
        splash.alpha = 1 - splash.life / splash.maxLife;
    }
    splashes = splashes.filter(s => s.life < s.maxLife);
    // Update drops with physics
    for (let drop of splashDrops) {
        drop.life++;
        // Physics: gravity and friction
        drop.dy += 0.7; // gravity
        drop.dx *= 0.93; // friction
        drop.dy *= 0.93; // friction
        drop.x += drop.dx;
        drop.y += drop.dy + (drop.vy || 0);
        if (drop.vy !== undefined) drop.vy *= 0.85; // vertical velocity fades
        drop.alpha = 1 - drop.life / drop.maxLife;
        drop.r = drop.baseR * drop.alpha; // shrink as it fades
    }
    splashDrops = splashDrops.filter(d => d.life < d.maxLife);
}

function drawSplashes() {
    // Main splash ring
    for (let splash of splashes) {
        ctx.save();
        ctx.globalAlpha = splash.alpha * 0.7;
        ctx.strokeStyle = '#8cf';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(splash.x, splash.y, splash.r, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();
    }
    // Drops
    for (let drop of splashDrops) {
        ctx.save();
        ctx.globalAlpha = drop.alpha * 0.8;
        ctx.fillStyle = '#8cf';
        ctx.beginPath();
        ctx.arc(drop.x, drop.y, drop.r, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }
}

// --- Update updateTears to spawn splash on wall hit ---
function updateTears() {
    let roomObj = dungeon[currentRoomY][currentRoomX];
    for (let tear of tears) {
        if (!tear.alive) continue;
        tear.life++;
        // Physics: gravity and friction
        // Only apply gravity if shot downward or diagonally downward
        if (tear.dirY > 0) {
            tear.vy += 0.04; // less gravity
        } else if (tear.dirY === 0) {
            // horizontal: very subtle gravity
            tear.vy += 0.01;
        } else {
            // Upward: no gravity
            tear.vy = 0;
        }
        tear.dx *= 0.997; // less friction
        tear.dy *= 0.997;
        tear.x += tear.dx;
        tear.y += tear.dy + tear.vy;
        // Optional: shrink as it travels
        tear.r = tear.baseR * (1 - tear.life / tear.maxLife * 0.4);
        // Isaac-like range limit
        const dist = Math.hypot(tear.x - tear.startX, tear.y - tear.startY);
        if (dist > TEAR_RANGE) {
            // Push objects near splash
            if (roomObj.objects) {
                for (let obj of roomObj.objects) {
                    let odist = Math.hypot(tear.x - obj.x, tear.y - obj.y);
                    if (odist < 60) {
                        let force = 3 * (1 - odist/60);
                        let dx = obj.x - tear.x;
                        let dy = obj.y - tear.y;
                        let d = Math.max(1, Math.hypot(dx, dy));
                        obj.vx += (dx/d) * force;
                        obj.vy += (dy/d) * force;
                    }
                }
            }
            spawnSplash(tear.x, tear.y);
            tear.alive = false;
            continue;
        }
        // Wall collision
        let tx = Math.floor(tear.x / TILE_SIZE);
        let ty = Math.floor(tear.y / TILE_SIZE);
        if (currentRoom[ty] && currentRoom[ty][tx] === 1) {
            // Push objects near splash
            if (roomObj.objects) {
                for (let obj of roomObj.objects) {
                    let odist = Math.hypot(tear.x - obj.x, tear.y - obj.y);
                    if (odist < 60) {
                        let force = 3 * (1 - odist/60);
                        let dx = obj.x - tear.x;
                        let dy = obj.y - tear.y;
                        let d = Math.max(1, Math.hypot(dx, dy));
                        obj.vx += (dx/d) * force;
                        obj.vy += (dy/d) * force;
                    }
                }
            }
            spawnSplash(tear.x, tear.y);
            tear.alive = false;
            continue;
        }
        // Out of room bounds
        if (
            tear.x < 0 || tear.x > ROOM_WIDTH ||
            tear.y < 0 || tear.y > ROOM_HEIGHT
        ) {
            tear.alive = false;
            continue;
        }
        // Enemy collision
        for (let enemy of roomObj.enemies) {
            if (!enemy.alive) continue;
            // Tank: invincible after hit
            if (enemy.effect === 'tank' && enemy.state.invincible && enemy.state.invincible > 0) continue;
            if (Math.abs(tear.x - enemy.x) < (tear.r+enemy.w/2) && Math.abs(tear.y - enemy.y) < (tear.r+enemy.h/2)) {
                // Push objects near splash
                if (roomObj.objects) {
                    for (let obj of roomObj.objects) {
                        let odist = Math.hypot(tear.x - obj.x, tear.y - obj.y);
                        if (odist < 60) {
                            let force = 3 * (1 - odist/60);
                            let dx = obj.x - tear.x;
                            let dy = obj.y - tear.y;
                            let d = Math.max(1, Math.hypot(dx, dy));
                            obj.vx += (dx/d) * force;
                            obj.vy += (dy/d) * force;
                        }
                    }
                }
                // Tank: set invincible after hit
                if (enemy.effect === 'tank') enemy.state.invincible = 30;
                enemy.health -= player.tearDamage;
                // --- Knockback ---
                let knockbackStrength = 7 + player.tearDamage * 0.7;
                let dx = enemy.x - tear.x;
                let dy = enemy.y - tear.y;
                let d = Math.max(0.1, Math.hypot(dx, dy));
                enemy.vx += (dx/d) * knockbackStrength;
                enemy.vy += (dy/d) * knockbackStrength * 0.7; // slightly less vertical knockback
                spawnSplash(tear.x, tear.y);
                tear.alive = false;
                if (enemy.health <= 0) {
                    spawnEffect(enemy.x, enemy.y, 'blood-splash');
                    enemy.alive = false;
                    player.enemiesKilled++;
                    // Splitter: spawn two Blobs on death
                    if (enemy.effect === 'split') {
                        for (let i = 0; i < 2; i++) {
                            let ex = (enemy.x + (Math.random()-0.5)*40) / TILE_SIZE;
                            let ey = (enemy.y + (Math.random()-0.5)*40) / TILE_SIZE;
                            let blobType = ENEMY_TYPES.find(t => t.name === 'Blob');
                            roomObj.enemies.push(spawnEnemyOfType(blobType, ex, ey));
                        }
                    }
                }
                break;
            }
        }
        // --- Furniture object collision (push in flight) ---
        if (roomObj.objects) {
            for (let obj of roomObj.objects) {
                // Simple AABB collision
                if (
                    tear.x > obj.x - obj.w/2 &&
                    tear.x < obj.x + obj.w/2 &&
                    tear.y > obj.y - obj.h/2 &&
                    tear.y < obj.y + obj.h/2
                ) {
                    // Push object in tear's direction
                    let force = obj.pushStrength || 2;
                    obj.vx += tear.dx * force * 0.18;
                    obj.vy += (tear.dy + (tear.vy || 0)) * force * 0.18;
                    // Glass: increment pushes and break if needed
                    if (obj.type === 'glass') {
                        obj.pushes = (obj.pushes || 0) + 1;
                        if (obj.pushes === 3) spawnGlassBreak(obj.x, obj.y);
                    }
                    // Destroy the tear on impact
                    spawnSplash(tear.x, tear.y);
                    tear.alive = false;
                    break;
                }
            }
        }
    }
    // Remove dead tears
    tears = tears.filter(t => t.alive);
}

function updatePlayer() {
    if (invincible > 0) invincible--;
    if (player.activeCooldown > 0) player.activeCooldown--;
    if (player.bombCooldown > 0) player.bombCooldown--;
    if (player.health <= 0 && !isGameOver) {
        showGameOver();
    }
}

// --- Room Transitions (simplified) ---
function tryRoomTransition() {
    let left = player.x;
    let right = player.x + player.w;
    let top = player.y;
    let bottom = player.y + player.h;
    let moved = false;
    const doorMin = (ROOM_ROWS/2 - 1.5) * TILE_SIZE;
    const doorMax = (ROOM_ROWS/2 + 1.5) * TILE_SIZE;
    const doorMinX = (ROOM_COLS/2 - 1.5) * TILE_SIZE;
    const doorMaxX = (ROOM_COLS/2 + 1.5) * TILE_SIZE;
    // Isaac logic: only allow transition if all enemies are dead
    let roomObj = dungeon[currentRoomY][currentRoomX];
    let allEnemiesDead = roomObj.enemies.every(e => !e.alive);
    if (!allEnemiesDead) return;
    // Left
    if (left <= 0 && currentRoomX > 0 && dungeon[currentRoomY][currentRoomX-1].exists &&
        bottom > doorMin && top < doorMax) {
        currentRoomX--;
        player.x = (ROOM_COLS-1)*TILE_SIZE - player.w;
        moved = true;
    }
    // Right
    else if (right >= ROOM_WIDTH && currentRoomX < DUNGEON_SIZE-1 && dungeon[currentRoomY][currentRoomX+1].exists &&
        bottom > doorMin && top < doorMax) {
        currentRoomX++;
        player.x = TILE_SIZE;
        moved = true;
    }
    // Up
    else if (top <= 0 && currentRoomY > 0 && dungeon[currentRoomY-1][currentRoomX].exists &&
        right > doorMinX && left < doorMaxX) {
        currentRoomY--;
        player.y = (ROOM_ROWS-1)*TILE_SIZE - player.h;
        moved = true;
    }
    // Down
    else if (bottom >= ROOM_HEIGHT && currentRoomY < DUNGEON_SIZE-1 && dungeon[currentRoomY+1][currentRoomX].exists &&
        right > doorMinX && left < doorMaxX) {
        currentRoomY++;
        player.y = TILE_SIZE;
        moved = true;
    }
    if (moved) {
        enterRoom();
    }
}

// --- Enter Room (simplified) ---
function enterRoom() {
    currentRoom = dungeon[currentRoomY][currentRoomX].room;
    let isTreasure = dungeon[currentRoomY][currentRoomX].isTreasure;
    
    // Reset portal state when entering new room
    portalActive = false;
    portalPos = null;
    bossReward = null;
    
    if (!dungeon[currentRoomY][currentRoomX].visited) {
        if (!(currentRoomY === startY && currentRoomX === startX)) {
            populateRoomEnemies(dungeon[currentRoomY][currentRoomX]);
            populateRoomPickups(dungeon[currentRoomY][currentRoomX], isTreasure);
        } else {
            dungeon[currentRoomY][currentRoomX].enemies = [];
            dungeon[currentRoomY][currentRoomX].pickups = [];
        }
        dungeon[currentRoomY][currentRoomX].visited = true;
    } else {
    // Only show portal if this is the boss room for the current level, all enemies are dead, and reward not collected
    let roomObj = dungeon[currentRoomY][currentRoomX];
    if (
        roomObj[`isBoss${dungeonLevel}`] &&
        roomObj.enemies && roomObj.enemies.length > 0 &&
        roomObj.enemies.every(e => !e.alive) &&
        !roomObj.bossRewardCollected
    ) {
        portalActive = true;
        portalPos = { x: ROOM_WIDTH/2, y: ROOM_HEIGHT/2 + 40 };
        bossReward = roomObj.bossReward;
    }
}
    tears = [];
}

// --- Drawing (add enemies, tears, doors) ---
function drawEnemies() {
    let roomObj = dungeon[currentRoomY][currentRoomX];
    for (let enemy of roomObj.enemies) {
        if (!enemy.alive) continue;
        ctx.save();
        // Draw shadow
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(enemy.x, enemy.y + enemy.h/2.5, enemy.w/2.3, enemy.h/4.2, 0, 0, Math.PI*2);
        ctx.filter = 'blur(2px)';
        ctx.fill();
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
        // Tank: flash when invincible
        if (enemy.effect === 'tank' && enemy.state.invincible && enemy.state.invincible > 0) {
            ctx.globalAlpha = 0.3 + 0.7*Math.abs(Math.sin(enemy.state.invincible/2));
        } else {
            ctx.globalAlpha = 0.92;
        }
        ctx.font = '44px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(enemy.emoji, enemy.x, enemy.y);
        ctx.globalAlpha = 1;
        // Draw healthbar
        const barWidth = enemy.w;
        const barHeight = 7;
        const barX = enemy.x - barWidth/2;
        const barY = enemy.y - enemy.h/2 - 14;
        ctx.save();
        // Background (red)
        ctx.fillStyle = '#a22';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        // Foreground (green)
        const healthRatio = Math.max(0, enemy.health / enemy.maxHealth);
        ctx.fillStyle = '#4f4';
        ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
        ctx.restore();
        // Draw type label
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 0.7;
        ctx.fillText(enemy.category, enemy.x, enemy.y + enemy.h/2 + 10);
        ctx.globalAlpha = 1;
        ctx.restore();
    }
}
function drawTears() {
    for (let tear of tears) {
        if (!tear.alive) continue;
        ctx.save();
        // Draw shadow (stronger)
        ctx.globalAlpha = 0.32;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(tear.x, tear.y + tear.r * 0.85, tear.r * 1.05, tear.r * 0.48, 0, 0, Math.PI*2);
        ctx.filter = 'blur(2.2px)';
        ctx.fill();
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
        // Draw tear
        ctx.fillStyle = tear.color;
        ctx.beginPath();
        ctx.arc(tear.x, tear.y, tear.r, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }
}

function drawMinimap() {
    const mapSize = 120;
    const cellSize = mapSize / DUNGEON_SIZE;
    const offsetX = canvas.width - mapSize - 24;
    const offsetY = 24;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#222';
    ctx.fillRect(offsetX-6, offsetY-6, mapSize+12, mapSize+12);
    for (let y = 0; y < DUNGEON_SIZE; y++) {
        for (let x = 0; x < DUNGEON_SIZE; x++) {
            const room = dungeon[y][x];
            if (!room.exists) continue;
            // Only show boss room for current level
            if (room[`isBoss${dungeonLevel}`]) {
                ctx.fillStyle = '#f33'; // red for boss room (current level only)
            } else if (room.isTreasure) {
                ctx.fillStyle = '#ff0'; // yellow for treasure
            } else if (x === startX && y === startY) {
                ctx.fillStyle = '#3f6'; // green for start
            } else if (room.visited || (x === currentRoomX && y === currentRoomY)) {
                ctx.fillStyle = '#8cf';
            } else {
                ctx.fillStyle = '#444';
            }
            ctx.fillRect(offsetX + x*cellSize, offsetY + y*cellSize, cellSize-4, cellSize-4);
        }
    }
    // Draw face emoji for current room
    ctx.globalAlpha = 1;
    ctx.font = `${Math.floor(cellSize*0.9)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👧🏼', offsetX + currentRoomX*cellSize + (cellSize-4)/2, offsetY + currentRoomY*cellSize + (cellSize-4)/2 + 1);
    ctx.restore();
}

// --- Update draw() to draw splashes ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRoom();
    drawEnemies();
    drawTears();
    drawSplashes();
    drawPickups();
    drawEffects();
    drawPlayer();
    drawMinimap();
    drawBombs();
    drawGodRays(); // Draw god rays on top of everything
    // Player flash if invincible
    if (invincible > 0) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(player.x + player.w/2, player.y + player.h/2, player.w/2+2, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }
    // Draw mouse target indicator if mouse control is active
    if (mouseControl) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#f5e663';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(mouseTarget.x, mouseTarget.y, 24, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();
    }
    // --- Vignette overlay ---
    ctx.save();
    let vignette = ctx.createRadialGradient(
        canvas.width/2, canvas.height/2, canvas.width*0.36,
        canvas.width/2, canvas.height/2, canvas.width*0.52
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.7, 'rgba(0,0,0,0.0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}

// --- UI Overlay (add heals) ---
function updateUI() {
    let hearts = '';
    for (let i = 0; i < player.maxHealth; i++) {
        if (i < player.health) hearts += '❤️';
        else hearts += '🖤';
    }
    let items = player.items.length ? 'Items: ' + player.items.join(', ') : '';
    let pickups = `<span style=\"margin-left:24px\">🪙 ${player.coins}  🗝️ ${player.keys}  💣 ${player.bombs}  🧪 ${player.heals}</span>`;
    let active = player.activeItem ? `<span style=\"margin-left:24px\">Active: ${player.activeItem.emoji} ${player.activeItem.name}${player.activeCooldown > 0 ? ' ('+player.activeCooldown+')' : ''}</span>` : '';
    uiOverlay.innerHTML = `${hearts} ${pickups} <span style=\"margin-left:24px\">${items}</span> ${active}`;
}

// --- Game Stats ---
const TEAR_DAMAGE = 1; // base damage (not used, now in player.tearDamage)

function updateStatsUI() {
    statsOverlay.innerHTML = `
        <b>Stats</b><br>
        Dungeon Level: <span style=\"color:#f5e663\">${dungeonLevel}</span><br>
        Max Health: <span style=\"color:#f5e663\">${player.maxHealth}</span><br>
        Current Health: <span style=\"color:#f5e663\">${player.health}</span><br>
        Enemies Killed: <span style=\"color:#f5e663\">${player.enemiesKilled}</span><br>
        Tear Damage: <span style=\"color:#f5e663\">${player.tearDamage}</span><br>
        Tear Range: <span style=\"color:#8cf\">${TEAR_RANGE}</span><br>
        Player Speed: <span style=\"color:#6f6\">${player.speed.toFixed(2)}</span><br>
        Tear Speed: <span style=\"color:#8cf\">${player.tearSpeed.toFixed(2)}</span><br>
        Tear Frequency: <span style=\"color:#8cf\">${(60/player.tearRate).toFixed(2)} /s</span>
    `;
}

// --- Pickups ---
const PICKUP_TYPES = ['heart', 'coin', 'key'];
function spawnPickup(type, x, y) {
    return {
        type,
        x: x * TILE_SIZE + TILE_SIZE/2,
        y: y * TILE_SIZE + TILE_SIZE/2,
        r: 22,
        collected: false,
        vx: 0,
        vy: 0
    };
}
function populateRoomPickups(roomObj, isTreasureRoom = false) {
    if (!roomObj.exists) return;
    roomObj.pickups = [];
    if (isTreasureRoom) {
        // Always spawn an item in treasure room
        let item = ITEM_POOL[Math.floor(Math.random()*ITEM_POOL.length)];
        roomObj.pickups.push({
            type: 'item',
            item: item,
            x: Math.floor(ROOM_COLS/2) * TILE_SIZE + TILE_SIZE/2,
            y: Math.floor(ROOM_ROWS/2) * TILE_SIZE + TILE_SIZE/2,
            r: 26,
            collected: false,
            vx: 0,
            vy: 0
        });
    } else {
        // 30% chance for each pickup type (except in start room)
        for (let type of PICKUP_TYPES) {
            if (Math.random() < 0.3) {
                let px = Math.floor(Math.random()*(ROOM_COLS-4))+2;
                let py = Math.floor(Math.random()*(ROOM_ROWS-4))+2;
                let p = spawnPickup(type, px, py);
                roomObj.pickups.push(p);
            }
        }
        // 10% chance to spawn a bomb pickup
        if (Math.random() < 0.5) {
            let px = Math.floor(Math.random()*(ROOM_COLS-4))+2;
            let py = Math.floor(Math.random()*(ROOM_ROWS-4))+2;
            roomObj.pickups.push({type: 'bomb', x: px*TILE_SIZE+TILE_SIZE/2, y: py*TILE_SIZE+TILE_SIZE/2, r: 22, collected: false, vx: 0, vy: 0});
        }
        // 10% chance to spawn a heal pickup
        if (Math.random() < 0.5) {
            let px = Math.floor(Math.random()*(ROOM_COLS-4))+2;
            let py = Math.floor(Math.random()*(ROOM_ROWS-4))+2;
            roomObj.pickups.push({type: 'heal', x: px*TILE_SIZE+TILE_SIZE/2, y: py*TILE_SIZE+TILE_SIZE/2, r: 22, collected: false, vx: 0, vy: 0});
        }
    }
}

// --- Draw Pickups (add heal) ---
function drawPickups() {
    let roomObj = dungeon[currentRoomY][currentRoomX];
    if (!roomObj.pickups) return;
    for (let p of roomObj.pickups) {
        if (p.collected) continue;
        ctx.save();
        // Draw shadow
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + (p.r/2.2), p.r*0.8, p.r*0.38, 0, 0, Math.PI*2);
        ctx.filter = 'blur(1.5px)';
        ctx.fill();
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
        // Draw pickup/item
        if (p.type === 'heart') {
            ctx.font = '32px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('❤️', p.x, p.y+2);
        } else if (p.type === 'coin') {
            ctx.font = '32px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🪙', p.x, p.y+2);
        } else if (p.type === 'key') {
            ctx.font = '32px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🗝️', p.x, p.y+2);
        } else if (p.type === 'bomb') {
            ctx.font = '32px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('💣', p.x, p.y+2);
        } else if (p.type === 'heal') {
            ctx.font = '32px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🧪', p.x, p.y+2);
        } else if (p.type === 'item') {
            ctx.font = '32px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.item.emoji, p.x, p.y+2);
        }
        ctx.restore();
    }
}

// --- Collect Pickups (add heal) and physics ---
function updatePickups() {
    let roomObj = dungeon[currentRoomY][currentRoomX];
    if (!roomObj.pickups) return;
    for (let p of roomObj.pickups) {
        if (p.collected) continue;
        // --- Physics movement ---
        p.x += p.vx || 0;
        p.y += p.vy || 0;
        // Friction
        p.vx *= 0.88;
        p.vy *= 0.88;
        // Wall collision (simple bounding box)
        let minX = TILE_SIZE + p.r;
        let maxX = ROOM_WIDTH - TILE_SIZE - p.r;
        let minY = TILE_SIZE + p.r;
        let maxY = ROOM_HEIGHT - TILE_SIZE - p.r;
        if (p.x < minX) { p.x = minX; p.vx = -p.vx * 0.4; }
        if (p.x > maxX) { p.x = maxX; p.vx = -p.vx * 0.4; }
        if (p.y < minY) { p.y = minY; p.vy = -p.vy * 0.4; }
        if (p.y > maxY) { p.y = maxY; p.vy = -p.vy * 0.4; }
        // --- Player collision ---
        let canPick = false;
        if (p.type === 'heart') {
            canPick = player.health < player.maxHealth;
        } else if (p.type === 'coin') {
            canPick = true;
        } else if (p.type === 'key') {
            canPick = true;
        } else if (p.type === 'bomb') {
            canPick = true;
        } else if (p.type === 'heal') {
            canPick = true;
        } else if (p.type === 'item') {
            canPick = true;
        }
        if (Math.abs(player.x + player.w/2 - p.x) < player.w/2 + p.r && Math.abs(player.y + player.h/2 - p.y) < player.h/2 + p.r) {
            if (canPick) {
                p.collected = true;
                if (p.type === 'heart') {
                    player.health++;
                } else if (p.type === 'coin') {
                    player.coins++;
                } else if (p.type === 'key') {
                    player.keys++;
                } else if (p.type === 'bomb') {
                    player.bombs++;
                    spawnEffect(p.x, p.y, 'bomb-pickup');
                } else if (p.type === 'heal') {
                    player.heals++;
                    spawnEffect(p.x, p.y, 'heal-use');
                } else if (p.type === 'item') {
                    giveItemToPlayer(p.item);
                }
            } else {
                // Push the pickup away from the player
                let dx = p.x - (player.x + player.w/2);
                let dy = p.y - (player.y + player.h/2);
                let dist = Math.max(1, Math.hypot(dx, dy));
                let force = 2.2;
                p.vx += (dx/dist) * force;
                p.vy += (dy/dist) * force;
            }
        }
    }
}

// --- Items ---
const ITEM_POOL = [
    // Passive items only (no Heal active)
    {type: 'passive', name: 'Speed Up', emoji: '⚡', effect: function() { player.speed += 0.7; }},
    {type: 'passive', name: '+Damage', emoji: '💥', effect: function() { player.tearDamage += 1; }},
    {type: 'passive', name: 'Tears Up', emoji: '💧', effect: function() { player.tearRate = Math.max(20, player.tearRate - 20); }},
];

function giveItemToPlayer(item) {
    if (item.type === 'active') {
        player.activeItem = {...item};
        player.activeCooldown = 0;
    } else if (item.type === 'passive') {
        player.items.push(item.name);
        if (item.effect) item.effect();
    }
}

// --- Bombs ---
let bombs = [];
function placeBomb(x, y) {
    console.log('Placing bomb at', x, y);
    bombs.push({
        x, y,
        r: 24,
        timer: 60, // 1 second
        exploded: false
    });
}
function updateBombs() {
    let roomObj = dungeon[currentRoomY][currentRoomX];
    for (let bomb of bombs) {
        if (bomb.exploded) continue;
        bomb.timer--;
        if (bomb.timer <= 0) {
            bomb.exploded = true;
            // Damage enemies in radius
            for (let enemy of roomObj.enemies) {
                if (!enemy.alive) continue;
                let dist = Math.hypot(bomb.x - enemy.x, bomb.y - enemy.y);
                if (dist < 90) enemy.health -= 3;
                if (enemy.health <= 0) enemy.alive = false;
            }
            // --- Knockback pickups ---
            if (roomObj.pickups) {
                for (let p of roomObj.pickups) {
                    if (p.collected) continue;
                    let dist = Math.hypot(bomb.x - p.x, bomb.y - p.y);
                    if (dist < 120) {
                        let force = 7 * (1 - dist/120);
                        let dx = p.x - bomb.x;
                        let dy = p.y - bomb.y;
                        let d = Math.max(1, Math.hypot(dx, dy));
                        p.vx += (dx/d) * force;
                        p.vy += (dy/d) * force;
                    }
                }
            }
            // --- Knockback furniture objects ---
            if (roomObj.objects) {
                for (let obj of roomObj.objects) {
                    let dist = Math.hypot(bomb.x - obj.x, bomb.y - obj.y);
                    if (dist < 120) {
                        let force = 8 * (1 - dist/120);
                        let dx = obj.x - bomb.x;
                        let dy = obj.y - bomb.y;
                        let d = Math.max(1, Math.hypot(dx, dy));
                        obj.vx += (dx/d) * force;
                        obj.vy += (dy/d) * force;
                    }
                }
                // Break all breakable objects in radius
                for (let obj of roomObj.objects) {
                    let dist = Math.hypot(bomb.x - obj.x, bomb.y - obj.y);
                    if (dist < 120 && obj.breakable) {
                        if (obj.type === 'glass') {
                            spawnGlassBreak(obj.x, obj.y);
                        } else {
                            spawnObjectBreak(obj.x, obj.y);
                        }
                        obj._toRemove = true;
                    }
                }
                // Remove all objects marked for removal
                roomObj.objects = roomObj.objects.filter(obj => !obj._toRemove);
            }
            // Optional: break walls/rocks here
            // Splash effect
            spawnSplash(bomb.x, bomb.y);
            spawnEffect(bomb.x, bomb.y, 'bomb-explode');
        }
    }
    // Remove exploded bombs after a short time
    bombs = bombs.filter(b => !b.exploded || b.timer > -30);
}
function drawBombs() {
    for (let bomb of bombs) {
        if (bomb.exploded) {
            // No static red circle here anymore
        } else if (bomb.timer >= 0) {
            ctx.save();
            // Draw shadow (grounded)
            ctx.globalAlpha = 0.32;
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.ellipse(bomb.x, bomb.y + bomb.r * 0.75, bomb.r * 0.7, bomb.r * 0.32, 0, 0, Math.PI*2);
            ctx.filter = 'blur(1.5px)';
            ctx.fill();
            ctx.filter = 'none';
            ctx.globalAlpha = 1;
            // Wiggle: rotate back and forth based on timer
            let wiggle = Math.sin(bomb.timer * 0.4) * 0.18; // radians
            ctx.translate(bomb.x, bomb.y);
            ctx.rotate(wiggle);
            // Flash: pulse opacity as timer nears zero
            let flash = 1;
            if (bomb.timer < 20) {
                flash = 0.6 + 0.4 * Math.abs(Math.sin(bomb.timer * 0.7));
            }
            // Fade out in last 10 frames
            let fade = 1;
            if (bomb.timer < 10 && bomb.timer >= 0) {
                fade = Math.max(0.15, bomb.timer / 10);
            }
            ctx.globalAlpha = Math.max(0.15, flash * fade);
            ctx.font = '32px Arial, serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('💣', 0, 0);
            ctx.restore();
        }
    }
}

// --- Treasure Room ---
let treasureRoom = null;
(function pickTreasureRoom() {
    // Pick a random non-start, existing room
    let candidates = [];
    for (let y = 0; y < DUNGEON_SIZE; y++) {
        for (let x = 0; x < DUNGEON_SIZE; x++) {
            if (dungeon[y][x].exists && !(x === startX && y === startY)) {
                candidates.push({x, y});
            }
        }
    }
    if (candidates.length) {
        let idx = Math.floor(Math.random()*candidates.length);
        treasureRoom = candidates[idx];
        dungeon[treasureRoom.y][treasureRoom.x].isTreasure = true;
    }
})();

// --- Effects (Visual Bursts) ---
let effects = [];
function spawnEffect(x, y, type) {
    if (type === 'bomb-pickup') {
        // Small yellow burst
        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const speed = 2 + Math.random() * 2;
            effects.push({
                x, y,
                dx: Math.cos(angle) * speed,
                dy: Math.sin(angle) * speed,
                r: 6 + Math.random()*4,
                color: '#ffe066',
                alpha: 1,
                life: 0,
                maxLife: 18
            });
        }
    } else if (type === 'bomb-explode') {
        // Large orange burst + white flash
        for (let i = 0; i < 24; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const speed = 4 + Math.random() * 5;
            effects.push({
                x, y,
                dx: Math.cos(angle) * speed,
                dy: Math.sin(angle) * speed,
                r: 16 + Math.random()*10,
                color: '#ffb347',
                alpha: 1,
                life: 0,
                maxLife: 24
            });
        }
        // Add a white flash
        effects.push({
            x, y,
            dx: 0, dy: 0,
            r: 120,
            color: '#fff',
            alpha: 0.5,
            life: 0,
            maxLife: 8,
            flash: true
        });
        // Add bomb explosion radius ring
        effects.push({
            x, y,
            r: 90,
            color: '#f33',
            alpha: 0.5,
            life: 0,
            maxLife: 18,
            ring: true
        });
    } else if (type === 'heal-use') {
        // Green sparkles and a green glow
        for (let i = 0; i < 14; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const speed = 2 + Math.random() * 2;
            effects.push({
                x, y,
                dx: Math.cos(angle) * speed,
                dy: Math.sin(angle) * speed,
                r: 7 + Math.random()*4,
                color: '#6f6',
                alpha: 1,
                life: 0,
                maxLife: 20
            });
        }
        // Green glow
        effects.push({
            x, y,
            dx: 0, dy: 0,
            r: 48,
            color: '#6f6',
            alpha: 0.25,
            life: 0,
            maxLife: 16,
            glow: true
        });
    } else if (type === 'blood-splash') {
        // Blood splash: red burst with random direction and size
        for (let i = 0; i < 16; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const speed = 2.5 + Math.random() * 3.5;
            effects.push({
                x, y,
                dx: Math.cos(angle) * speed,
                dy: Math.sin(angle) * speed,
                r: 10 + Math.random()*10,
                color: (Math.random() < 0.2 ? '#a00' : (Math.random() < 0.5 ? '#d22' : '#b11')),
                alpha: 1,
                life: 0,
                maxLife: 22 + Math.floor(Math.random()*8)
            });
        }
        // Central blood pool
        effects.push({
            x, y,
            dx: 0, dy: 0,
            r: 32 + Math.random()*16,
            color: '#a00',
            alpha: 0.5,
            life: 0,
            maxLife: 32,
            blood: true
        });
    }
}
function updateEffects() {
    for (let e of effects) {
        e.life++;
        if (!e.flash && !e.glow && !e.ring) {
            e.x += e.dx;
            e.y += e.dy;
            e.alpha = 1 - e.life / e.maxLife;
            e.r *= 0.97;
        } else {
            e.alpha = 1 - e.life / e.maxLife;
        }
    }
    effects = effects.filter(e => e.life < e.maxLife);
}
function drawEffects() {
    for (let e of effects) {
        ctx.save();
        if (e.flash) {
            ctx.globalAlpha = e.alpha * 0.5;
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r, 0, Math.PI*2);
            ctx.fill();
        } else if (e.glow) {
            ctx.globalAlpha = e.alpha * 0.25;
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r, 0, Math.PI*2);
            ctx.fill();
        } else if (e.ring) {
            ctx.globalAlpha = e.alpha * 0.7;
            ctx.strokeStyle = e.color;
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r, 0, Math.PI*2);
            ctx.stroke();
        } else {
            ctx.globalAlpha = e.alpha * 0.8;
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.r, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.restore();
    }
}

function drawGodRays() {
    // Only draw the focused god rays (no radial or outer glow)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
        let rayX = ROOM_WIDTH/2 + (i-1)*180 + Math.sin(Date.now()/2000 + i)*8;
        ctx.save();
        ctx.translate(rayX, 0); // Start at very top of screen
        ctx.rotate(-0.08 + i*0.08 + Math.sin(Date.now()/3000 + i)*0.01);
        // Create a linear gradient for the ray
        let rayLen = ROOM_HEIGHT*0.5;
        let grad = ctx.createLinearGradient(0, 0, 0, rayLen);
        grad.addColorStop(0, 'rgba(255,245,180,0.18)');
        grad.addColorStop(0.5, 'rgba(255,245,180,0.07)');
        grad.addColorStop(0.85, 'rgba(255,245,180,0.01)');
        grad.addColorStop(1, 'rgba(255,245,180,0)');
        ctx.beginPath();
        // Trapezoid: narrow at top and bottom for more focused rays
        ctx.moveTo(-40, 0); // narrower top at y=0
        ctx.lineTo(-10, rayLen); // narrower bottom left
        ctx.lineTo(10, rayLen); // narrower bottom right
        ctx.lineTo(40, 0); // narrower top at y=0
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.globalAlpha = 1;
        ctx.filter = 'blur(6px)';
        ctx.fill();
        ctx.filter = 'none';
        ctx.restore();
    }
    ctx.restore();
}

// --- Level Progression and Boss Rewards ---
let portalActive = false;
let portalPos = null;
let bossReward = null;
let levelUpMessage = '';
let levelUpTimer = 0;

function checkBossRoomClear() {
    let roomObj = dungeon[currentRoomY][currentRoomX];
    // Only spawn portal in boss room
    if (!roomObj[`isBoss${dungeonLevel}`]) return;
    if (portalActive) return;
    if (roomObj.enemies.every(e => !e.alive)) {
        console.log('Spawning portal!');
        portalActive = true;
        portalPos = { x: ROOM_WIDTH/2, y: ROOM_HEIGHT/2 + 40 };
        // Random reward: item, heart, or stat boost
        let rewardType = Math.random();
        if (rewardType < 0.5) {
            // Random item
            let item = ITEM_POOL[Math.floor(Math.random()*ITEM_POOL.length)];
            bossReward = { type: 'item', item, x: ROOM_WIDTH/2, y: ROOM_HEIGHT/2 - 40, r: 28, collected: false };
        } else if (rewardType < 0.8) {
            bossReward = { type: 'heart', x: ROOM_WIDTH/2, y: ROOM_HEIGHT/2 - 40, r: 28, collected: false };
        } else {
            bossReward = { type: 'maxhealth', x: ROOM_WIDTH/2, y: ROOM_HEIGHT/2 - 40, r: 28, collected: false };
        }
    }
}

const MAX_DUNGEON_LEVEL = 9;

function tryNextLevel() {
    if (!portalActive) return;
    // If player touches portal, go to next level
    let px = player.x + player.w/2, py = player.y + player.h/2;
    if (Math.abs(px - portalPos.x) < 40 && Math.abs(py - portalPos.y) < 40) {
        if (dungeonLevel < MAX_DUNGEON_LEVEL) {
            dungeonLevel++;
            levelUpMessage = `Level ${dungeonLevel}!`;
            levelUpTimer = 90;
            // Regenerate dungeon, boss/treasure rooms, reset player position, keep stats
            regenerateDungeonForNextLevel();
            portalActive = false;
            bossReward = null;
        } else {
            showWinScreen();
            portalActive = false;
        }
    }
}

function regenerateDungeonForNextLevel() {
    // Reset dungeon structure
    dungeon = [];
    for (let y = 0; y < DUNGEON_SIZE; y++) {
        let row = [];
        for (let x = 0; x < DUNGEON_SIZE; x++) {
            row.push({
                exists: false,
                room: null,
                enemies: [],
                visited: false
            });
        }
        dungeon.push(row);
    }
    // Generate new dungeon layout (random walk)
    let genRoomX = Math.floor(DUNGEON_SIZE/2), genRoomY = Math.floor(DUNGEON_SIZE/2);
    dungeon[genRoomY][genRoomX].exists = true;
    dungeon[genRoomY][genRoomX].room = generateRoom(genRoomX, genRoomY);
    let steps = 8;
    let currentWalkX = genRoomX, currentWalkY = genRoomY;
    for (let i = 0; i < steps; i++) {
        const dirs = [
            {dx: 0, dy: -1, name: 'up', opp: 'down'},
            {dx: 0, dy: 1, name: 'down', opp: 'up'},
            {dx: -1, dy: 0, name: 'left', opp: 'right'},
            {dx: 1, dy: 0, name: 'right', opp: 'left'}
        ];
        let possible = dirs.filter(d => {
            let nx = currentWalkX + d.dx, ny = currentWalkY + d.dy;
            return nx >= 0 && nx < DUNGEON_SIZE && ny >= 0 && ny < DUNGEON_SIZE;
        });
        if (possible.length === 0) break;
        let d = possible[Math.floor(Math.random()*possible.length)];
        let nextWalkX = currentWalkX + d.dx, nextWalkY = currentWalkY + d.dy;
        if (!dungeon[nextWalkY][nextWalkX].exists) {
            dungeon[nextWalkY][nextWalkX].exists = true;
            dungeon[nextWalkY][nextWalkX].room = generateRoom(nextWalkX, nextWalkY);
        }
        currentWalkX = nextWalkX; currentWalkY = nextWalkY;
    }
    // Ensure start room has at least 2 neighbors
    const startX = Math.floor(DUNGEON_SIZE/2);
    const startY = Math.floor(DUNGEON_SIZE/2);
    const neighborDirs = [
        {dx: 0, dy: -1, name: 'up', opp: 'down'},
        {dx: 0, dy: 1, name: 'down', opp: 'up'},
        {dx: -1, dy: 0, name: 'left', opp: 'right'},
        {dx: 1, dy: 0, name: 'right', opp: 'left'}
    ];
    let existingNeighborCount = 0;
    for (let d of neighborDirs) {
        let nx = startX + d.dx, ny = startY + d.dy;
        if (nx >= 0 && nx < DUNGEON_SIZE && ny >= 0 && ny < DUNGEON_SIZE && dungeon[ny][nx].exists) {
            existingNeighborCount++;
        }
    }
    let forcedNeighbors = 0;
    while (existingNeighborCount + forcedNeighbors < 2) {
        let possibleNewDirs = neighborDirs.filter(d => {
            let nx = startX + d.dx, ny = startY + d.dy;
            return nx >= 0 && nx < DUNGEON_SIZE && ny >= 0 && ny < DUNGEON_SIZE && !dungeon[ny][nx].exists;
        });
        if (possibleNewDirs.length === 0) break;
        let d = possibleNewDirs[Math.floor(Math.random()*possibleNewDirs.length)];
        let nx = startX + d.dx, ny = startY + d.dy;
        dungeon[ny][nx].exists = true;
        dungeon[ny][nx].room = generateRoom(nx, ny);
        forcedNeighbors++;
    }
    finalizeAllRoomDoors();
    // Clear all isBossX and isTreasure flags from all rooms before picking new ones
    for (let y = 0; y < DUNGEON_SIZE; y++) {
        for (let x = 0; x < DUNGEON_SIZE; x++) {
            if (!dungeon[y][x].exists) continue;
            // Remove all isBossX flags for all possible levels
            for (let lvl = 1; lvl <= MAX_DUNGEON_LEVEL; lvl++) {
                delete dungeon[y][x][`isBoss${lvl}`];
            }
            // Remove isTreasure flag
            delete dungeon[y][x].isTreasure;
        }
    }
    // Pick new treasure rooms (one per dungeon level, never the same room twice)
    let usedTreasureRooms = new Set();
    for (let lvl = 1; lvl <= dungeonLevel; lvl++) {
        let candidates = [];
        for (let y = 0; y < DUNGEON_SIZE; y++) {
            for (let x = 0; x < DUNGEON_SIZE; x++) {
                let key = `${x},${y}`;
                if (
                    dungeon[y][x].exists &&
                    !(x === startX && y === startY) &&
                    !usedTreasureRooms.has(key)
                ) {
                    candidates.push({x, y, key});
                }
            }
        }
        // If no candidates left, relax restriction: allow any non-start, existing room
        if (candidates.length === 0) {
            for (let y = 0; y < DUNGEON_SIZE; y++) {
                for (let x = 0; x < DUNGEON_SIZE; x++) {
                    let key = `${x},${y}`;
                    if (dungeon[y][x].exists && !(x === startX && y === startY)) {
                        candidates.push({x, y, key});
                    }
                }
            }
        }
        if (candidates.length) {
            let idx = Math.floor(Math.random()*candidates.length);
            let treasureRoom = candidates[idx];
            usedTreasureRooms.add(treasureRoom.key);
            dungeon[treasureRoom.y][treasureRoom.x].isTreasure = true;
        }
    }
    // After assignment, ensure only one room per level has isTreasure=true
    let foundTreasure = false;
    for (let y = 0; y < DUNGEON_SIZE; y++) {
        for (let x = 0; x < DUNGEON_SIZE; x++) {
            if (dungeon[y][x].isTreasure) {
                if (!foundTreasure) {
                    foundTreasure = true;
                } else {
                    delete dungeon[y][x].isTreasure;
                }
            }
        }
    }
    pickBossRooms();
    // Set player to new start room
    currentRoomX = startX;
    currentRoomY = startY;
    currentRoom = dungeon[currentRoomY][currentRoomX].room;
    dungeon[currentRoomY][currentRoomX].visited = true;
    // Reset tears, splashes, bombs, effects, portal, reward
    tears = [];
    splashes = [];
    splashDrops = [];
    bombs = [];
    effects = [];
    portalActive = false;
    bossReward = null;
    // Optionally, reset minimap visited state
    for (let y = 0; y < DUNGEON_SIZE; y++) {
        for (let x = 0; x < DUNGEON_SIZE; x++) {
            if (dungeon[y][x].exists) dungeon[y][x].visited = false;
        }
    }
    dungeon[currentRoomY][currentRoomX].visited = true;
    // Optionally, heal player a bit or give bonus
}

function drawPortalAndReward() {
    if (!portalActive) return;
    // Draw portal shadow
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(portalPos.x, portalPos.y + 32, 44, 18, 0, 0, Math.PI*2);
    ctx.filter = 'blur(2.5px)';
    ctx.fill();
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.restore();
    // Draw portal
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.font = '64px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🌀', portalPos.x, portalPos.y);
    ctx.restore();
    // Draw reward
    if (bossReward && !bossReward.collected) {
        ctx.save();
        ctx.font = '40px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (bossReward.type === 'item') ctx.fillText(bossReward.item.emoji, bossReward.x, bossReward.y);
        else if (bossReward.type === 'heart') ctx.fillText('❤️', bossReward.x, bossReward.y);
        else if (bossReward.type === 'maxhealth') ctx.fillText('💖', bossReward.x, bossReward.y);
        ctx.restore();
    }
}

function updatePortalAndReward() {
    if (!portalActive) return;
    // Collect reward
    if (bossReward && !bossReward.collected) {
        let px = player.x + player.w/2, py = player.y + player.h/2;
        if (Math.abs(px - bossReward.x) < 40 && Math.abs(py - bossReward.y) < 40) {
            if (bossReward.type === 'item') giveItemToPlayer(bossReward.item);
            else if (bossReward.type === 'heart' && player.health < player.maxHealth) player.health++;
            else if (bossReward.type === 'maxhealth') player.maxHealth++;
            bossReward.collected = true;
        }
    }
}

// --- Draw level up message ---
function drawLevelUpMessage() {
    if (levelUpTimer > 0) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.font = '48px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f5e663';
        ctx.fillText(levelUpMessage, canvas.width/2, 120);
        ctx.restore();
        levelUpTimer--;
    }
}

// --- End Screen and Persistent Stats ---
let showEndScreen = false;
function showWinScreen() {
    showEndScreen = true;
    // Save stats to localStorage
    let best = JSON.parse(localStorage.getItem('isaacBestStats') || '{}');
    let stats = {
        dungeonLevel,
        enemiesKilled: player.enemiesKilled,
        maxHealth: player.maxHealth,
        coins: player.coins,
        keys: player.keys,
        bombs: player.bombs,
        heals: player.heals
    };
    // Update best stats
    if (!best.dungeonLevel || dungeonLevel > best.dungeonLevel) best = stats;
    else {
        best.dungeonLevel = Math.max(best.dungeonLevel, stats.dungeonLevel);
        best.enemiesKilled = Math.max(best.enemiesKilled, stats.enemiesKilled);
        best.maxHealth = Math.max(best.maxHealth, stats.maxHealth);
        best.coins = Math.max(best.coins, stats.coins);
        best.keys = Math.max(best.keys, stats.keys);
        best.bombs = Math.max(best.bombs, stats.bombs);
        best.heals = Math.max(best.heals, stats.heals);
    }
    localStorage.setItem('isaacBestStats', JSON.stringify(best));
}

function drawEndScreen() {
    if (!showEndScreen) return;
    ctx.save();
    ctx.globalAlpha = 0.97;
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.font = '64px serif';
    ctx.fillStyle = '#f5e663';
    ctx.textAlign = 'center';
    ctx.fillText('You Win!', canvas.width/2, 160);
    ctx.font = '32px serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('Your Run:', canvas.width/2, 230);
    let y = 270;
    ctx.font = '24px monospace';
    ctx.fillText(`Dungeon Level: ${dungeonLevel}`, canvas.width/2, y); y += 34;
    ctx.fillText(`Enemies Killed: ${player.enemiesKilled}`, canvas.width/2, y); y += 34;
    ctx.fillText(`Max Health: ${player.maxHealth}`, canvas.width/2, y); y += 34;
    ctx.fillText(`Coins: ${player.coins}  Keys: ${player.keys}  Bombs: ${player.bombs}  Heals: ${player.heals}`, canvas.width/2, y); y += 44;
    // Best stats
    let best = JSON.parse(localStorage.getItem('isaacBestStats') || '{}');
    ctx.font = '32px serif';
    ctx.fillStyle = '#f5e663';
    ctx.fillText('Best Run:', canvas.width/2, y); y += 36;
    ctx.font = '24px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(`Dungeon Level: ${best.dungeonLevel || dungeonLevel}`, canvas.width/2, y); y += 34;
    ctx.fillText(`Enemies Killed: ${best.enemiesKilled || player.enemiesKilled}`, canvas.width/2, y); y += 34;
    ctx.fillText(`Max Health: ${best.maxHealth || player.maxHealth}`, canvas.width/2, y); y += 34;
    ctx.fillText(`Coins: ${best.coins || player.coins}  Keys: ${best.keys || player.keys}  Bombs: ${best.bombs || player.bombs}  Heals: ${best.heals || player.heals}`, canvas.width/2, y); y += 44;
    // Restart button
    ctx.font = '28px serif';
    ctx.fillStyle = '#f5e663';
    ctx.fillText('Click to Restart', canvas.width/2, y+30);
    ctx.restore();
}

canvas.addEventListener('click', () => {
    if (showEndScreen) window.location.reload();
});

// --- Game Loop ---
function gameLoop() {
    if (isGameOver) return;
    if (showEndScreen) {
        drawEndScreen();
        return;
    }
    handleInput();
    movePlayer();
    pushObjectsByEntity(player);
    tryRoomTransition();
    updateEnemies();
    // Enemies push objects
    let roomObj = dungeon[currentRoomY][currentRoomX];
    if (roomObj && roomObj.enemies) {
        for (let enemy of roomObj.enemies) {
            if (enemy.alive) pushObjectsByEntity(enemy);
        }
    }
    updateTears();
    updatePlayer();
    updateShooting();
    updateSplashes();
    updatePickups();
    updateBombs();
    updateEffects();
    updateObjects();
    checkBossRoomClear(); // Only check for boss room portal
    updatePortalAndReward();
    tryNextLevel();
    drawRoom();
    drawEnemies();
    drawTears();
    drawSplashes();
    drawPickups();
    drawEffects();
    drawObjects(); // Draw furniture before player
    drawPlayer();
    drawMinimap();
    drawBombs();
    drawGodRays(); // Draw god rays on top of everything
    // Player flash if invincible
    if (invincible > 0) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(player.x + player.w/2, player.y + player.h/2, player.w/2+2, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }
    // Draw mouse target indicator if mouse control is active
    if (mouseControl) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#f5e663';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(mouseTarget.x, mouseTarget.y, 24, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();
    }
    // --- Vignette overlay ---
    ctx.save();
    let vignette = ctx.createRadialGradient(
        canvas.width/2, canvas.height/2, canvas.width*0.36,
        canvas.width/2, canvas.height/2, canvas.width*0.52
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.7, 'rgba(0,0,0,0.0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    drawPortalAndReward();
    drawLevelUpMessage();
    updateUI();
    updateStatsUI();
    requestAnimationFrame(gameLoop);
}

// --- Start Menu Logic ---
let gameStarted = false;
const startMenu = document.getElementById('startMenu');
const startGameBtn = document.getElementById('startGameBtn');

function startGame() {
    if (gameStarted) return;
    gameStarted = true;
    if (startMenu) startMenu.style.display = 'none';
    requestAnimationFrame(gameLoop);
}

if (startGameBtn) {
    startGameBtn.onclick = startGame;
}

// Only show menu, do not start game loop until started
if (startMenu) startMenu.style.display = 'flex';

// --- Game Loop ---
function gameLoop() {
    if (!gameStarted) return;
    if (isGameOver) return;
    if (showEndScreen) {
        drawEndScreen();
        return;
    }
    handleInput();
    movePlayer();
    pushObjectsByEntity(player);
    tryRoomTransition();
    updateEnemies();
    // Enemies push objects
    let roomObj = dungeon[currentRoomY][currentRoomX];
    if (roomObj && roomObj.enemies) {
        for (let enemy of roomObj.enemies) {
            if (enemy.alive) pushObjectsByEntity(enemy);
        }
    }
    updateTears();
    updatePlayer();
    updateShooting();
    updateSplashes();
    updatePickups();
    updateBombs();
    updateEffects();
    updateObjects();
    checkBossRoomClear(); // Only check for boss room portal
    updatePortalAndReward();
    tryNextLevel();
    drawRoom();
    drawEnemies();
    drawTears();
    drawSplashes();
    drawPickups();
    drawEffects();
    drawObjects(); // Draw furniture before player
    drawPlayer();
    drawMinimap();
    drawBombs();
    drawGodRays(); // Draw god rays on top of everything
    // Player flash if invincible
    if (invincible > 0) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(player.x + player.w/2, player.y + player.h/2, player.w/2+2, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }
    // Draw mouse target indicator if mouse control is active
    if (mouseControl) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#f5e663';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(mouseTarget.x, mouseTarget.y, 24, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();
    }
    // --- Vignette overlay ---
    ctx.save();
    let vignette = ctx.createRadialGradient(
        canvas.width/2, canvas.height/2, canvas.width*0.36,
        canvas.width/2, canvas.height/2, canvas.width*0.52
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.7, 'rgba(0,0,0,0.0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    drawPortalAndReward();
    drawLevelUpMessage();
    updateUI();
    updateStatsUI();
    requestAnimationFrame(gameLoop);
}

gameLoop(); 

const fullscreenBtn = document.getElementById('fullscreenBtn');
if (fullscreenBtn) {
    function isFullscreen() {
        return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    }
    function updateBtnText() {
        fullscreenBtn.textContent = isFullscreen() ? 'Exit Fullscreen' : 'Fullscreen';
    }
    fullscreenBtn.addEventListener('click', () => {
        if (isFullscreen()) {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        } else {
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.mozRequestFullScreen) {
                elem.mozRequestFullScreen();
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) {
                elem.msRequestFullscreen();
            }
        }
    });
    document.addEventListener('fullscreenchange', updateBtnText);
    document.addEventListener('webkitfullscreenchange', updateBtnText);
    document.addEventListener('mozfullscreenchange', updateBtnText);
    document.addEventListener('MSFullscreenChange', updateBtnText);
    updateBtnText();
}

// --- Pause Logic ---
let gamePaused = false;
const pauseOverlay = document.getElementById('pauseOverlay');

window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP') {
        gamePaused = !gamePaused;
        if (pauseOverlay) pauseOverlay.style.display = gamePaused ? 'flex' : 'none';
    }
});



if (startGameBtn) {
    startGameBtn.onclick = startGame;
}

// Only show menu, do not start game loop until started
if (startMenu) startMenu.style.display = 'flex';

// --- Game Loop ---
function gameLoop() {
    if (!gameStarted) return;
    if (gamePaused) {
        // Still draw overlays and pause screen
        draw();
        if (pauseOverlay) pauseOverlay.style.display = 'flex';
        requestAnimationFrame(gameLoop);
        return;
    } else {
        if (pauseOverlay) pauseOverlay.style.display = 'none';
    }
    if (isGameOver) return;
    if (showEndScreen) {
        drawEndScreen();
        return;
    }
    handleInput();
    movePlayer();
    pushObjectsByEntity(player);
    tryRoomTransition();
    updateEnemies();
    // Enemies push objects
    let roomObj = dungeon[currentRoomY][currentRoomX];
    if (roomObj && roomObj.enemies) {
        for (let enemy of roomObj.enemies) {
            if (enemy.alive) pushObjectsByEntity(enemy);
        }
    }
    updateTears();
    updatePlayer();
    updateShooting();
    updateSplashes();
    updatePickups();
    updateBombs();
    updateEffects();
    updateObjects();
    checkBossRoomClear(); // Only check for boss room portal
    updatePortalAndReward();
    tryNextLevel();
    drawRoom();
    drawEnemies();
    drawTears();
    drawSplashes();
    drawPickups();
    drawEffects();
    drawObjects(); // Draw furniture before player
    drawPlayer();
    drawMinimap();
    drawBombs();
    drawGodRays(); // Draw god rays on top of everything
    // Player flash if invincible
    if (invincible > 0) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(player.x + player.w/2, player.y + player.h/2, player.w/2+2, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }
    // Draw mouse target indicator if mouse control is active
    if (mouseControl) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#f5e663';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(mouseTarget.x, mouseTarget.y, 24, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();
    }
    // --- Vignette overlay ---
    ctx.save();
    let vignette = ctx.createRadialGradient(
        canvas.width/2, canvas.height/2, canvas.width*0.36,
        canvas.width/2, canvas.height/2, canvas.width*0.52
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.7, 'rgba(0,0,0,0.0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    drawPortalAndReward();
    drawLevelUpMessage();
    updateUI();
    updateStatsUI();
    requestAnimationFrame(gameLoop);
}

// --- Furniture Images ---
const tableImg = new Image();
tableImg.src = 'assets/table1.png';
const chairImg = new Image();
chairImg.src = 'assets/chair1.png';
const coffeeCupImg = new Image();
coffeeCupImg.src = 'assets/coffeecup.png';
const vaseImg = new Image();
vaseImg.src = 'assets/vase.png';
const laptopImg = new Image();
laptopImg.src = 'assets/laptop1.png';
const blenderImg = new Image();
blenderImg.src = 'assets/blender.png';
const armchairImg = new Image();
armchairImg.src = 'assets/armchair1.png';
const bedImg = new Image();
bedImg.src = 'assets/bed1.png';
const sofaImg = new Image();
sofaImg.src = 'assets/sofa1.png';

// --- Helper: Add furniture to a room ---
function spawnRoomObjects(roomObj) {
    roomObj.objects = [];
    // Don't spawn in start, boss, or treasure rooms
    if (roomObj === dungeon[startY][startX] || roomObj[`isBoss${dungeonLevel}`] || roomObj.isTreasure) return;
    // 1-2 big tables
    let numTables = 1 + Math.floor(Math.random()*2);
    for (let i = 0; i < numTables; i++) {
        let x = (2 + Math.random() * (ROOM_COLS-4)) * TILE_SIZE + TILE_SIZE/2;
        let y = (2 + Math.random() * (ROOM_ROWS-4)) * TILE_SIZE + TILE_SIZE/2;
        roomObj.objects.push({
            type: 'big',
            x, y,
            w: 64, h: 64,
            vx: 0, vy: 0,
            pushable: true,
            img: tableImg,
            pushStrength: 1.2,
            breakable: true
        });
    }
    // 1-2 beds
    let numBeds = 1 + Math.floor(Math.random()*2);
    for (let i = 0; i < numBeds; i++) {
        let x = (2 + Math.random() * (ROOM_COLS-4)) * TILE_SIZE + TILE_SIZE/2;
        let y = (2 + Math.random() * (ROOM_ROWS-4)) * TILE_SIZE + TILE_SIZE/2;
        roomObj.objects.push({
            type: 'big',
            x, y,
            w: 80, h: 80,
            vx: 0, vy: 0,
            pushable: true,
            img: bedImg,
            pushStrength: 1.1,
            breakable: true
        });
    }
    // 1-2 sofas
    let numSofas = 1 + Math.floor(Math.random()*2);
    for (let i = 0; i < numSofas; i++) {
        let x = (2 + Math.random() * (ROOM_COLS-4)) * TILE_SIZE + TILE_SIZE/2;
        let y = (2 + Math.random() * (ROOM_ROWS-4)) * TILE_SIZE + TILE_SIZE/2;
        roomObj.objects.push({
            type: 'big',
            x, y,
            w: 96, h: 96,
            vx: 0, vy: 0,
            pushable: true,
            img: sofaImg,
            pushStrength: 1.0,
            breakable: true
        });
    }
    // 2-5 medium chairs
    let numChairs = 2 + Math.floor(Math.random()*4);
    for (let i = 0; i < numChairs; i++) {
        let x = (2 + Math.random() * (ROOM_COLS-4)) * TILE_SIZE + TILE_SIZE/2;
        let y = (2 + Math.random() * (ROOM_ROWS-4)) * TILE_SIZE + TILE_SIZE/2;
        roomObj.objects.push({
            type: 'medium',
            x, y,
            w: 52, h: 52,
            vx: 0, vy: 0,
            pushable: true,
            img: chairImg,
            pushStrength: 2.5,
            breakable: true
        });
    }
    // 1-2 armchairs
    let numArmchairs = 1 + Math.floor(Math.random()*2);
    for (let i = 0; i < numArmchairs; i++) {
        let x = (2 + Math.random() * (ROOM_COLS-4)) * TILE_SIZE + TILE_SIZE/2;
        let y = (2 + Math.random() * (ROOM_ROWS-4)) * TILE_SIZE + TILE_SIZE/2;
        roomObj.objects.push({
            type: 'medium',
            x, y,
            w: 70, h: 70,
            vx: 0, vy: 0,
            pushable: true,
            img: armchairImg,
            pushStrength: 2.0,
            breakable: true
        });
    }
    // 1-2 laptops
    let numLaptops = 1 + Math.floor(Math.random()*2);
    for (let i = 0; i < numLaptops; i++) {
        let x = (2 + Math.random() * (ROOM_COLS-4)) * TILE_SIZE + TILE_SIZE/2;
        let y = (2 + Math.random() * (ROOM_ROWS-4)) * TILE_SIZE + TILE_SIZE/2;
        roomObj.objects.push({
            type: 'medium',
            x, y,
            w: 48, h: 48,
            vx: 0, vy: 0,
            pushable: true,
            img: laptopImg,
            pushStrength: 2.3,
            breakable: true
        });
    }
    // 1-2 blenders
    let numBlenders = 1 + Math.floor(Math.random()*2);
    for (let i = 0; i < numBlenders; i++) {
        let x = (2 + Math.random() * (ROOM_COLS-4)) * TILE_SIZE + TILE_SIZE/2;
        let y = (2 + Math.random() * (ROOM_ROWS-4)) * TILE_SIZE + TILE_SIZE/2;
        roomObj.objects.push({
            type: 'medium',
            x, y,
            w: 48, h: 48,
            vx: 0, vy: 0,
            pushable: true,
            img: blenderImg,
            pushStrength: 2.2,
            breakable: true
        });
    }
    // 2-4 coffee cups
    let numCups = 2 + Math.floor(Math.random()*3);
    for (let i = 0; i < numCups; i++) {
        let x = (2 + Math.random() * (ROOM_COLS-4)) * TILE_SIZE + TILE_SIZE/2;
        let y = (2 + Math.random() * (ROOM_ROWS-4)) * TILE_SIZE + TILE_SIZE/2;
        roomObj.objects.push({
            type: 'glass',
            x, y,
            w: 32, h: 32,
            vx: 0, vy: 0,
            pushable: true,
            img: coffeeCupImg,
            pushStrength: 3.2,
            pushes: 0,
            breakable: true
        });
    }
    // 2-4 vases
    let numVases = 2 + Math.floor(Math.random()*3);
    for (let i = 0; i < numVases; i++) {
        let x = (2 + Math.random() * (ROOM_COLS-4)) * TILE_SIZE + TILE_SIZE/2;
        let y = (2 + Math.random() * (ROOM_ROWS-4)) * TILE_SIZE + TILE_SIZE/2;
        roomObj.objects.push({
            type: 'glass',
            x, y,
            w: 48, h: 48,
            vx: 0, vy: 0,
            pushable: true,
            img: vaseImg,
            pushStrength: 2.7,
            pushes: 0,
            breakable: true
        });
    }
}

// --- Integrate object spawning into room population ---
function populateRoomEnemies(roomObj) {
    if (!roomObj.exists) return;
    roomObj.enemies = [];
    spawnRoomObjects(roomObj);
    // Boss room logic for current dungeonLevel
    if (roomObj[`isBoss${dungeonLevel}`]) {
        // Only spawn Bosses with minLevel === dungeonLevel
        let allowedBosses = ENEMY_TYPES.filter(t => t.category === 'Boss' && t.minLevel === dungeonLevel);
        if (allowedBosses.length === 0) return;
        // Always at least one boss
        let bossType = allowedBosses[Math.floor(Math.random()*allowedBosses.length)];
        let ex = Math.floor(ROOM_COLS/2);
        let ey = Math.floor(ROOM_ROWS/2);
        roomObj.enemies.push(spawnEnemyOfType(bossType, ex, ey));
        // Optionally, spawn a second boss for Twin Boss
        if (bossType.effect === 'twin') {
            let ex2 = ex + 2;
            let ey2 = ey;
            roomObj.enemies.push(spawnEnemyOfType(bossType, ex2, ey2));
        }
        return;
    }
    // Allow all types (Regular, Miniboss) whose minLevel <= dungeonLevel
    let allowedTypes = ENEMY_TYPES.filter(t => (t.category === 'Regular' || t.category === 'Miniboss') && t.minLevel <= dungeonLevel);
    for (let i = 0; i < Math.floor(Math.random()*3)+1; i++) {
        let type = allowedTypes[Math.floor(Math.random()*allowedTypes.length)];
        let ex = Math.floor(Math.random()*(ROOM_COLS-4))+2;
        let ey = Math.floor(Math.random()*(ROOM_ROWS-4))+2;
        roomObj.enemies.push(spawnEnemyOfType(type, ex, ey));
    }
}

// --- Draw furniture objects ---
function drawObjects() {
    let roomObj = dungeon[currentRoomY][currentRoomX];
    if (!roomObj.objects) return;
    for (let obj of roomObj.objects) {
        // Draw shadow (like pickups)
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(obj.x, obj.y + (obj.h/2.2), obj.w*0.8, obj.h*0.38, 0, 0, Math.PI*2);
        ctx.filter = 'blur(1.5px)';
        ctx.fill();
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
        ctx.restore();
        // Draw image or fallback
        if (obj.img && obj.img.complete && obj.img.naturalWidth !== 0) {
            ctx.drawImage(obj.img, obj.x - obj.w/2, obj.y - obj.h/2, obj.w, obj.h);
        } else {
            ctx.fillStyle = obj.type === 'table' ? '#b97a56' : '#c9b18a';
            ctx.fillRect(obj.x - obj.w/2, obj.y - obj.h/2, obj.w, obj.h);
        }
    }
}

// --- Update furniture physics and collisions ---
function updateObjects() {
    let roomObj = dungeon[currentRoomY][currentRoomX];
    if (!roomObj.objects) return;
    // Physics update
    for (let obj of roomObj.objects) {
        obj.x += obj.vx;
        obj.y += obj.vy;
        // Friction
        obj.vx *= 0.85;
        obj.vy *= 0.85;
        // Wall collision
        let minX = TILE_SIZE + obj.w/2;
        let maxX = ROOM_WIDTH - TILE_SIZE - obj.w/2;
        let minY = TILE_SIZE + obj.h/2;
        let maxY = ROOM_HEIGHT - TILE_SIZE - obj.h/2;
        if (obj.x < minX) { obj.x = minX; obj.vx = -obj.vx * 0.4; }
        if (obj.x > maxX) { obj.x = maxX; obj.vx = -obj.vx * 0.4; }
        if (obj.y < minY) { obj.y = minY; obj.vy = -obj.vy * 0.4; }
        if (obj.y > maxY) { obj.y = maxY; obj.vy = -obj.vy * 0.4; }
    }
    // Object-object collision (simple push apart)
    for (let i = 0; i < roomObj.objects.length; i++) {
        for (let j = i+1; j < roomObj.objects.length; j++) {
            let a = roomObj.objects[i], b = roomObj.objects[j];
            let dx = b.x - a.x, dy = b.y - a.y;
            let dist = Math.hypot(dx, dy);
            let minDist = (a.w + b.w)/2 * 0.8;
            if (dist < minDist && dist > 0) {
                let overlap = (minDist - dist) / 2;
                let ox = (dx/dist) * overlap;
                let oy = (dy/dist) * overlap;
                a.x -= ox; b.x += ox;
                a.y -= oy; b.y += oy;
            }
        }
    }
    // Remove broken glass objects
    roomObj.objects = roomObj.objects.filter(obj => !(obj.type === 'glass' && obj.pushes >= 3));
}

// --- Player/object push and collision ---
function pushObjectsByEntity(entity) {
    let roomObj = dungeon[currentRoomY][currentRoomX];
    if (!roomObj.objects) return;
    for (let obj of roomObj.objects) {
        // AABB collision
        if (
            entity.x + entity.w/2 > obj.x - obj.w/2 &&
            entity.x - entity.w/2 < obj.x + obj.w/2 &&
            entity.y + entity.h/2 > obj.y - obj.h/2 &&
            entity.y - entity.h/2 < obj.y + obj.h/2
        ) {
            // Push object in direction of entity movement
            let dx = obj.x - (entity.x);
            let dy = obj.y - (entity.y);
            let dist = Math.max(1, Math.hypot(dx, dy));
            let force = obj.pushStrength || 2.5;
            obj.vx += (dx/dist) * force;
            obj.vy += (dy/dist) * force;
            // Glass: increment pushes and break if needed
            if (obj.type === 'glass') {
                obj.pushes = (obj.pushes || 0) + 1;
                if (obj.pushes === 3) spawnGlassBreak(obj.x, obj.y);
            }
            // Prevent entity from moving through object (push back)
            entity.x -= (dx/dist) * 2.5;
            entity.y -= (dy/dist) * 2.5;
        }
    }
}

// --- Prevent player from moving through objects ---
// Call pushObjectsByEntity(player) after movePlayer()
// Call for each enemy in updateEnemies()
// ... existing code ...
// --- Integrate into game loop ---
// In gameLoop, after movePlayer():
// pushObjectsByEntity(player);
// After updateEnemies(), for each enemy:
// pushObjectsByEntity(enemy);
// After updateObjects(), call drawObjects() before drawPlayer()
// ... existing code ...
// --- Glass breaking effect ---
function spawnGlassBreak(x, y) {
    for (let i = 0; i < 12; i++) {
        const angle = Math.random() * 2 * Math.PI;
        const speed = 2 + Math.random() * 3;
        effects.push({
            x, y,
            dx: Math.cos(angle) * speed,
            dy: Math.sin(angle) * speed,
            r: 4 + Math.random()*3,
            color: '#bff',
            alpha: 1,
            life: 0,
            maxLife: 18
        });
    }
    // Central white flash
    effects.push({
        x, y,
        dx: 0, dy: 0,
        r: 18,
        color: '#fff',
        alpha: 0.5,
        life: 0,
        maxLife: 8,
        flash: true
    });
}

// Add a generic break effect for non-glass objects
function spawnObjectBreak(x, y) {
    for (let i = 0; i < 10; i++) {
        const angle = Math.random() * 2 * Math.PI;
        const speed = 2 + Math.random() * 2.5;
        effects.push({
            x, y,
            dx: Math.cos(angle) * speed,
            dy: Math.sin(angle) * speed,
            r: 7 + Math.random()*5,
            color: '#b97a56',
            alpha: 1,
            life: 0,
            maxLife: 18
        });
    }
    // Central brown flash
    effects.push({
        x, y,
        dx: 0, dy: 0,
        r: 24,
        color: '#b97a56',
        alpha: 0.3,
        life: 0,
        maxLife: 10,
        flash: true
    });
}

// --- Player Image ---
const playerImg = new Image();
playerImg.src = 'assets/player1.png';

function drawPlayer() {
    ctx.save();
    // Draw shadow
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(player.x + player.w/2, player.y + player.h/2 + player.h/2.5, player.w/2.2, player.h/4, 0, 0, Math.PI*2);
    ctx.filter = 'blur(2px)';
    ctx.fill();
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    // Draw player image
    if (playerImg.complete && playerImg.naturalWidth !== 0) {
        ctx.drawImage(playerImg, player.x, player.y, player.w, player.h);
    } else {
        // fallback: draw a circle
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(player.x + player.w/2, player.y + player.h/2, player.w/2, 0, Math.PI*2);
        ctx.fill();
    }
    ctx.restore();
}