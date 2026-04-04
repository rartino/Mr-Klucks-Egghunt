/********************************************************************
 * game.js — Mr. Kluck's Egg Hunt: Open World Edition
 *
 * A scrollable open-world RPG where Mr. Kluck the rooster explores
 * procedurally generated terrain — villages, forests, deserts, swamps,
 * and snowy mountains — to reclaim his stolen Easter eggs.
 *
 * Controls:
 *   WASD / Arrows  — Move
 *   SPACE           — Crow Power (stun nearby bunnies)
 *   SHIFT           — Dash (quick burst)
 *   E               — Talk to NPCs
 *
 * Features:
 *  - 150×150 tile scrollable world with 7 biomes
 *  - Procedural village & city generation with buildings & roads
 *  - 12 NPCs with RPG-style typewriter dialogue & quests
 *  - Minimap, quest tracker, combo system, power-ups
 *  - 4 enemy types (normal, fast, patrol, boss)
 *  - Environmental hazards (mud, ice, water)
 ********************************************************************/

const APP_VERSION = window.APP_VERSION || '(Unknown)';

// ===================================================================
//  CONSTANTS
// ===================================================================

const TILE = 32;
const WORLD_W = 150;
const WORLD_H = 150;

// Player
const PLAYER_SPEED = 160;
const INVINCIBLE_DURATION = 2000;
const CROW_COOLDOWN = 5000;
const CROW_STUN_RADIUS = 130;
const CROW_STUN_DURATION = 2500;
const DASH_SPEED = 500;
const DASH_DURATION = 180;
const DASH_COOLDOWN = 3000;

// Eggs
const EGG_POINTS = 10;
const GOLDEN_EGG_POINTS = 50;
const CHOCOLATE_EGG_POINTS = 15;
const ROTTEN_EGG_PENALTY = -20;

// Combo
const COMBO_WINDOW = 2000;
const COMBO_MAX = 5;

// NPC
const NPC_INTERACT_DIST = 50;
const DIALOGUE_CHAR_DELAY = 25;

// Bunny AI
const BUNNY_LEASH = 350;
const BUNNY_CHASE_RANGE = 250;

// Ground tile indices
const T_GRASS      = 0;
const T_GRASS_DARK = 1;
const T_DIRT       = 2;
const T_STONE      = 3;
const T_SAND       = 4;
const T_SNOW       = 5;
const T_WATER      = 6;
const T_SWAMP      = 7;
const T_FOREST     = 8;
const T_ICE        = 9;
const T_COBBLE     = 10;
const T_WOOD       = 11;

// Wall tile indices
const W_TREE       = 12;
const W_PINE       = 13;
const W_STONE_WALL = 14;
const W_WOOD_WALL  = 15;
const W_ROCK       = 16;
const W_CACTUS     = 17;
const W_REEDS      = 18;
const W_SNOW_ROCK  = 19;
const T_STAIRS     = 20;
const T_BASEMENT   = 21;
const W_BASEMENT_WALL = 22;

const TOTAL_TILES  = 23;

// Egg colors
const EGG_COLORS = [
    { hex: 0xff6b9d, name: 'pink'   },
    { hex: 0x7eb8ff, name: 'blue'   },
    { hex: 0x6bff8a, name: 'green'  },
    { hex: 0xff9e6b, name: 'orange' },
    { hex: 0xd36bff, name: 'purple' },
    { hex: 0x6bd4ff, name: 'cyan'   },
];

// Village center coordinates (tile space)
const V1_X = 75, V1_Y = 75;   // main village
const V2_X = 35, V2_Y = 75;   // second village


// ===================================================================
//  NOISE / UTILITY
// ===================================================================

function hash2D(ix, iy) {
    let h = (ix * 374761393 + iy * 668265263) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    h = (h ^ (h >> 16)) | 0;
    return (h & 0x7fffffff) / 0x7fffffff;
}

function smoothNoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash2D(ix, iy) * (1 - sx) + hash2D(ix + 1, iy) * sx;
    const b = hash2D(ix, iy + 1) * (1 - sx) + hash2D(ix + 1, iy + 1) * sx;
    return a * (1 - sy) + b * sy;
}

function fbm(x, y) {
    let v = 0, a = 0.5;
    for (let i = 0; i < 4; i++) { v += a * smoothNoise(x, y); x *= 2; y *= 2; a *= 0.5; }
    return v;
}


// ===================================================================
//  WORLD GENERATION
// ===================================================================

function getBiome(tx, ty) {
    const dx = tx - V1_X, dy = ty - V1_Y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Villages are hard-set
    if (dist < 10) return 'village';
    if (Math.sqrt((tx - V2_X) ** 2 + (ty - V2_Y) ** 2) < 7) return 'village';

    if (dist < 20) return 'farmland';

    // Water pockets
    const wn = fbm(tx * 0.07 + 50, ty * 0.07 + 50);
    if (wn < 0.18 && dist > 25 && dist < 55) return 'water';

    // Compute a "weight" for each biome using smooth distance fields + noise
    // so boundaries are wobbly and organic, not straight lines.
    const warp = fbm(tx * 0.04 + 200, ty * 0.04 + 200) * 18 - 9; // -9..+9 tile warp
    const warpX = fbm(tx * 0.05 + 300, ty * 0.05 + 300) * 18 - 9;
    const wy = ty + warp;
    const wx = tx + warpX;

    if (wy < 25) return 'snow';
    if (wy < 50 && wx > 22 && wx < 128) return 'forest';
    if (wx > 110) return 'desert';
    if (wy > 115) return 'swamp';
    if (wx < 36 && dist > 15) return 'hills';

    // Transition zones with noise blending
    const bn = fbm(tx * 0.06 + 100, ty * 0.06 + 100);
    if (wy < 60) return bn > 0.48 ? 'forest' : 'farmland';
    if (wx > 90) return bn > 0.42 ? 'desert' : 'farmland';
    if (wy > 100) return bn > 0.42 ? 'swamp' : 'farmland';

    return 'farmland';
}

function groundTileForBiome(biome, tx, ty) {
    const n = hash2D(tx * 7, ty * 13);
    switch (biome) {
        case 'village':  return n < 0.4 ? T_COBBLE : T_GRASS;
        case 'farmland': return n < 0.15 ? T_GRASS_DARK : n < 0.25 ? T_DIRT : T_GRASS;
        case 'forest':   return n < 0.3 ? T_GRASS_DARK : T_FOREST;
        case 'desert':   return T_SAND;
        case 'snow':     return n < 0.15 ? T_ICE : T_SNOW;
        case 'swamp':    return n < 0.3 ? T_WATER : T_SWAMP;
        case 'hills':    return n < 0.2 ? T_DIRT : n < 0.3 ? T_GRASS_DARK : T_GRASS;
        case 'water':    return T_WATER;
        default:         return T_GRASS;
    }
}

function wallTileForBiome(biome, tx, ty) {
    const n = hash2D(tx * 3 + 99, ty * 5 + 77);
    const density = {
        village: 0, farmland: 0.01, forest: 0.14, desert: 0.03,
        snow: 0.05, swamp: 0.06, hills: 0.04, water: 0,
    };
    if (n > (density[biome] || 0)) return -1;
    switch (biome) {
        case 'forest':   return n < 0.07 ? W_TREE : W_ROCK;
        case 'desert':   return n < 0.015 ? W_CACTUS : W_ROCK;
        case 'snow':     return n < 0.025 ? W_PINE : W_SNOW_ROCK;
        case 'swamp':    return W_REEDS;
        case 'hills':    return W_ROCK;
        case 'farmland': return W_TREE;
        default:         return -1;
    }
}

// Village building definitions: { x, y, w, h } in tile offsets from village center
const V1_BUILDINGS = [
    { x: -6, y: -6, w: 5, h: 4, basement: true  },
    { x:  2, y: -6, w: 4, h: 4                   },
    { x: -6, y:  3, w: 4, h: 4, basement: true  },
    { x:  3, y:  3, w: 5, h: 4                   },
    { x: -3, y: -9, w: 3, h: 3                   },
    { x:  5, y: -1, w: 3, h: 3                   },
];
const V2_BUILDINGS = [
    { x: -4, y: -4, w: 4, h: 3, basement: true  },
    { x:  1, y: -4, w: 4, h: 3                   },
    { x: -3, y:  2, w: 3, h: 3                   },
    { x:  2, y:  2, w: 4, h: 3                   },
];

function generateWorld() {
    const ground = [], walls = [], biomeMap = [];
    for (let y = 0; y < WORLD_H; y++) {
        ground[y] = []; walls[y] = []; biomeMap[y] = [];
        for (let x = 0; x < WORLD_W; x++) {
            const b = getBiome(x, y);
            biomeMap[y][x] = b;
            ground[y][x] = groundTileForBiome(b, x, y);
            walls[y][x] = wallTileForBiome(b, x, y);
        }
    }

    // Place buildings and record basement locations
    const basements = [];
    const placeBuildings = (cx, cy, list) => {
        list.forEach(b => {
            for (let dy = 0; dy < b.h; dy++) {
                for (let dx = 0; dx < b.w; dx++) {
                    const tx = cx + b.x + dx, ty = cy + b.y + dy;
                    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) continue;
                    const isEdge = dx === 0 || dx === b.w - 1 || dy === 0 || dy === b.h - 1;
                    const doorCenter = Math.floor(b.w / 2);
                    const isDoor = dy === b.h - 1 && (dx === doorCenter || dx === doorCenter - 1);
                    if (isEdge && !isDoor) {
                        walls[ty][tx] = W_WOOD_WALL;
                        ground[ty][tx] = T_WOOD;
                    } else {
                        walls[ty][tx] = -1;
                        ground[ty][tx] = T_WOOD;
                    }
                }
            }
            // Place stairs in basement buildings (top-left interior corner)
            if (b.basement) {
                const sx = cx + b.x + 1, sy = cy + b.y + 1;
                if (sx >= 0 && sy >= 0 && sx < WORLD_W && sy < WORLD_H) {
                    ground[sy][sx] = T_STAIRS;
                    walls[sy][sx] = -1;
                    basements.push({ stairsTx: sx, stairsTy: sy, w: b.w, h: b.h });
                }
            }
        });
    };
    placeBuildings(V1_X, V1_Y, V1_BUILDINGS);
    placeBuildings(V2_X, V2_Y, V2_BUILDINGS);

    // Village plaza cobblestone
    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            const tx = V1_X + dx, ty = V1_Y + dy;
            if (walls[ty][tx] < 0) ground[ty][tx] = T_COBBLE;
        }
    }
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const tx = V2_X + dx, ty = V2_Y + dy;
            if (walls[ty][tx] < 0) ground[ty][tx] = T_COBBLE;
        }
    }

    // Roads
    // Main village cross roads
    for (let i = -9; i <= 9; i++) {
        const tx1 = V1_X + i, ty1 = V1_Y;
        const tx2 = V1_X, ty2 = V1_Y + i;
        if (tx1 >= 0 && tx1 < WORLD_W && walls[ty1][tx1] < 0) ground[ty1][tx1] = T_COBBLE;
        if (ty2 >= 0 && ty2 < WORLD_H && walls[ty2][tx2] < 0) ground[ty2][tx2] = T_COBBLE;
    }
    // Road between villages (stone, 2 tiles wide)
    for (let x = V2_X; x <= V1_X; x++) {
        if (walls[V1_Y][x] < 0) ground[V1_Y][x] = T_STONE;
        if (V1_Y + 1 < WORLD_H && walls[V1_Y + 1][x] < 0) ground[V1_Y + 1][x] = T_STONE;
    }
    // Roads out of main village (N, E, S) — stone, 2 tiles wide
    for (let i = 0; i < 35; i++) {
        const n = V1_Y - 10 - i, s = V1_Y + 10 + i, e = V1_X + 10 + i;
        if (n >= 0) {
            if (walls[n][V1_X] < 0) ground[n][V1_X] = T_STONE;
            if (V1_X + 1 < WORLD_W && walls[n][V1_X + 1] < 0) ground[n][V1_X + 1] = T_STONE;
        }
        if (s < WORLD_H) {
            if (walls[s][V1_X] < 0) ground[s][V1_X] = T_STONE;
            if (V1_X + 1 < WORLD_W && walls[s][V1_X + 1] < 0) ground[s][V1_X + 1] = T_STONE;
        }
        if (e < WORLD_W) {
            if (walls[V1_Y][e] < 0) ground[V1_Y][e] = T_STONE;
            if (V1_Y + 1 < WORLD_H && walls[V1_Y + 1][e] < 0) ground[V1_Y + 1][e] = T_STONE;
        }
    }

    // Clear walls on all road/path tiles
    for (let y = 0; y < WORLD_H; y++) {
        for (let x = 0; x < WORLD_W; x++) {
            if (ground[y][x] === T_COBBLE || ground[y][x] === T_DIRT || ground[y][x] === T_STONE) {
                walls[y][x] = -1;
            }
        }
    }

    // Generate egg positions
    const eggs = [];
    const eggBiomeCfg = {
        farmland:  { normal: 12, golden: 2, chocolate: 2, rotten: 2 },
        forest:    { normal: 15, golden: 3, chocolate: 2, rotten: 3 },
        desert:    { normal: 14, golden: 3, chocolate: 2, rotten: 3 },
        swamp:     { normal: 12, golden: 2, chocolate: 1, rotten: 5 },
        snow:      { normal: 12, golden: 3, chocolate: 4, rotten: 2 },
        hills:     { normal: 10, golden: 2, chocolate: 2, rotten: 1 },
        village:   { normal: 5,  golden: 1, chocolate: 1, rotten: 0 },
    };
    Object.entries(eggBiomeCfg).forEach(([biome, cfg]) => {
        const types = [];
        for (let i = 0; i < cfg.normal; i++) types.push('normal');
        for (let i = 0; i < cfg.golden; i++) types.push('golden');
        for (let i = 0; i < cfg.chocolate; i++) types.push('chocolate');
        for (let i = 0; i < cfg.rotten; i++) types.push('rotten');
        let placed = 0, attempts = 0;
        while (placed < types.length && attempts < 2000) {
            const tx = Phaser.Math.Between(5, WORLD_W - 5);
            const ty = Phaser.Math.Between(5, WORLD_H - 5);
            if (biomeMap[ty][tx] === biome && walls[ty][tx] < 0 && ground[ty][tx] !== T_WATER) {
                eggs.push({ tx, ty, type: types[placed] });
                placed++;
            }
            attempts++;
        }
    });

    // Generate bunny positions
    const bunnies = [];
    const bunnyBiomeCfg = {
        farmland: { normal: 3, fast: 0, patrol: 0, boss: false },
        forest:   { normal: 2, fast: 3, patrol: 1, boss: false },
        desert:   { normal: 2, fast: 1, patrol: 1, boss: true  },
        swamp:    { normal: 1, fast: 1, patrol: 3, boss: false },
        snow:     { normal: 2, fast: 2, patrol: 1, boss: true  },
        hills:    { normal: 2, fast: 1, patrol: 0, boss: false },
    };
    Object.entries(bunnyBiomeCfg).forEach(([biome, cfg]) => {
        const types = [];
        for (let i = 0; i < cfg.normal; i++) types.push('normal');
        for (let i = 0; i < cfg.fast; i++) types.push('fast');
        for (let i = 0; i < cfg.patrol; i++) types.push('patrol');
        if (cfg.boss) types.push('boss');
        let placed = 0, attempts = 0;
        while (placed < types.length && attempts < 1000) {
            const tx = Phaser.Math.Between(5, WORLD_W - 5);
            const ty = Phaser.Math.Between(5, WORLD_H - 5);
            if (biomeMap[ty][tx] === biome && walls[ty][tx] < 0 && ground[ty][tx] !== T_WATER) {
                bunnies.push({ tx, ty, type: types[placed], biome });
                placed++;
            }
            attempts++;
        }
    });

    return { ground, walls, biomeMap, eggs, bunnies, basements };
}


// ===================================================================
//  NPC DEFINITIONS
// ===================================================================

const NPC_DEFS = [
    {
        id: 'elder', name: 'Elder Cluck',
        body: 0x3344AA, hat: 0x6688DD, hatType: 'hood',
        tx: V1_X, ty: V1_Y - 1,
        dialogues: [
            "Welcome, brave Mr. Kluck! The Easter Bunny's army has stolen all your eggs and scattered them across the land!",
            "Explore the forests to the north, the desert to the east, the swamp to the south, and the snowy mountains beyond.",
            "Beware of Boss Bunnies in the desert and snow — they require THREE crow stuns to defeat!",
            "Collect 30 eggs and return to me. I shall reward your bravery!",
        ],
        quest: { id: 'elder_eggs', desc: 'Collect 30 eggs', type: 'eggs', target: 30, rewardType: 'life' },
    },
    {
        id: 'farmer', name: 'Farmer Hen',
        body: 0x886633, hat: 0xCCAA44, hatType: 'straw',
        tx: V1_X + 5, ty: V1_Y + 6,
        dialogues: [
            "Those rascal bunnies trampled my crops and hid eggs everywhere!",
            "Watch out for the GREEN eggs — those are rotten! They'll slow you down and cost you points.",
            "The brown chocolate eggs give you a little speed boost when collected. Yum!",
        ],
    },
    {
        id: 'merchant', name: 'Merchant Peck',
        body: 0x774488, hat: 0xDDAA22, hatType: 'cap',
        tx: V1_X + 3, ty: V1_Y - 5,
        dialogues: [
            "Welcome to my shop! Well... I don't have much left after the bunnies raided the place.",
            "Power-ups appear near landmarks around the world. Speed boots, shields, magnets — keep your eyes peeled!",
            "I heard a golden egg is hidden deep in every region. They're worth 50 points each!",
        ],
    },
    {
        id: 'guard', name: 'Guard Roost',
        body: 0x777788, hat: 0x555566, hatType: 'helmet',
        tx: V1_X, ty: V1_Y - 9,
        dialogues: [
            "Halt! Oh, it's you, Mr. Kluck. The road north leads to the forest. Be careful — fast bunnies lurk there.",
            "Use your Crow Power with SPACE to stun nearby bunnies. And SHIFT gives you a quick dash!",
            "If you see a bunny with a crown, that's a Boss Bunny. You'll need to stun it three times to defeat it.",
        ],
    },
    {
        id: 'herbalist', name: 'Sage Feathers',
        body: 0x338844, hat: 0x55AA66, hatType: 'hood',
        tx: V1_X - 45, ty: V1_Y - 30,
        dialogues: [
            "Ah... a visitor in my forest glade. Few wander this deep.",
            "The forest hides many eggs among the trees. Move carefully — the fast bunnies here are relentless.",
            "Collect eggs quickly one after another to build a combo multiplier. Timing is everything!",
        ],
    },
    {
        id: 'nomad', name: 'Desert Nomad',
        body: 0xBB8844, hat: 0xDDCC88, hatType: 'hood',
        tx: V1_X + 38, ty: V1_Y + 3,
        dialogues: [
            "The desert sands stretch far. Eggs hide near the cacti and rocks.",
            "A fearsome Boss Bunny rules the eastern reaches. Approach with caution!",
            "Defeat the Desert Boss and you'll earn a massive score bonus.",
        ],
        quest: { id: 'desert_boss', desc: 'Defeat the Desert Boss', type: 'boss', target: 'desert', rewardType: 'score500' },
    },
    {
        id: 'witch', name: 'Swamp Witch',
        body: 0x553366, hat: 0x7744AA, hatType: 'pointed',
        tx: V1_X + 5, ty: V1_Y + 42,
        dialogues: [
            "Heh heh... a brave little rooster ventures into my swamp...",
            "Rotten eggs are EVERYWHERE here. The bunnies love to leave traps in the muck.",
            "But if you're clever, you'll find golden eggs hidden where others fear to tread...",
        ],
    },
    {
        id: 'snowsage', name: 'Snow Sage',
        body: 0xCCCCDD, hat: 0xAABBFF, hatType: 'hood',
        tx: V1_X - 5, ty: V1_Y - 58,
        dialogues: [
            "Welcome to the frozen peaks, Mr. Kluck. The ice makes travel treacherous.",
            "Chocolate eggs are plentiful up here — they'll warm your feathers and speed you up!",
            "A Boss Bunny guards the highest reaches. Defeat it to prove your worth.",
            "Collect 10 golden eggs across the land, and you shall be a true hero!",
        ],
        quest: { id: 'golden_hunt', desc: 'Collect 10 golden eggs', type: 'golden', target: 10, rewardType: 'speed' },
    },
    {
        id: 'v2elder', name: 'Village Elder Bawk',
        body: 0x886644, hat: 0xCCBB88, hatType: 'straw',
        tx: V2_X, ty: V2_Y - 1,
        dialogues: [
            "Welcome to Westwick! Our little village has suffered from the bunny raids too.",
            "The hills around here aren't as dangerous as the deep wilderness, but stay alert!",
            "The road east leads back to Cluckville. Safe travels, friend.",
        ],
    },
    {
        id: 'blacksmith', name: 'Blacksmith Anvil',
        body: 0x993322, hat: 0x444444, hatType: 'helmet',
        tx: V2_X + 3, ty: V2_Y + 3,
        dialogues: [
            "I used to forge the finest plows. Now I sharpen my tools against those bunnies!",
            "Your Dash ability is your best friend in tight spots. Use SHIFT while moving to burst forward!",
            "You're invincible during a dash. Use it to escape bunny ambushes!",
        ],
    },
    {
        id: 'fisher', name: 'Old Fisher',
        body: 0x4466AA, hat: 0xBBBB88, hatType: 'straw',
        tx: V1_X - 18, ty: V1_Y + 12,
        dialogues: [
            "I sit here fishing, but there's no fish left... just eggs floating in the water.",
            "Can't walk on water, of course. But you can find eggs on the shoreline!",
            "Watch the minimap in the corner — it shows the whole world. Very handy for navigation.",
        ],
    },
    {
        id: 'scout', name: 'Scout Swift',
        body: 0x558855, hat: 0x446644, hatType: 'cap',
        tx: V1_X + 20, ty: V1_Y - 20,
        dialogues: [
            "I've been scouting the border between the farmland and the forest.",
            "Patrol bunnies are the tricky ones — they walk in circles until you get close, then they CHARGE!",
            "If you see an exclamation mark near someone, press E to talk. You never know what you'll learn!",
        ],
    },
];


// ===================================================================
//  TEXTURE GENERATION
// ===================================================================

function generateAllTextures(scene) {
    createTilesetTexture(scene);
    createPlayerTexture(scene);
    createPlayerStunnedTexture(scene);
    createShieldBubbleTexture(scene);
    createBunnyTexture(scene, 'bunny', 0xF0F0FF, 0xFFFFFF, 0xFFAABB, 0xFF0044);
    createBunnyTexture(scene, 'bunny_stunned', 0xCCCCDD, 0xDDDDEE, 0xCCAABB, 0x6666AA);
    createBunnyTexture(scene, 'fast_bunny', 0x8888CC, 0x9999DD, 0xBB88CC, 0xFF0066);
    createBunnyTexture(scene, 'fast_bunny_stunned', 0x666699, 0x7777AA, 0x9977AA, 0x6666AA);
    createPatrolBunnyTexture(scene, 'patrol_bunny', false);
    createPatrolBunnyTexture(scene, 'patrol_bunny_stunned', true);
    createBossBunnyTexture(scene, 'boss_bunny', false);
    createBossBunnyTexture(scene, 'boss_bunny_stunned', true);
    EGG_COLORS.forEach((ec, i) => createEggTexture(scene, ec.hex, 'egg' + i));
    createGoldenEggTexture(scene);
    createChocolateEggTexture(scene);
    createRottenEggTexture(scene);
    createHeartTexture(scene);
    createCrowBurstTexture(scene);
    createDashTrailTexture(scene);
    createPowerupTextures(scene);
    NPC_DEFS.forEach(d => createNPCTexture(scene, 'npc_' + d.id, d.body, d.hat, d.hatType));
}

function createTilesetTexture(scene) {
    if (scene.textures.exists('tiles')) return;
    const T = TILE, g = scene.make.graphics({ add: false });

    const fill = (idx, color) => { g.fillStyle(color); g.fillRect(idx * T, 0, T, T); };
    const detail = (idx, color, count) => {
        for (let i = 0; i < count; i++) {
            g.fillStyle(color);
            g.fillRect(idx * T + Math.floor(hash2D(idx * 17 + i, i * 31) * (T - 2)), Math.floor(hash2D(i * 7, idx * 3 + i) * (T - 3)), 2, 3);
        }
    };

    // 0: grass light
    fill(0, 0x2D8C27); detail(0, 0x3A9D33, 6); detail(0, 0x247A1F, 4);
    // 1: grass dark
    fill(1, 0x247A1F); detail(1, 0x1A6B14, 5);
    // 2: dirt
    fill(2, 0x8B7355); detail(2, 0x7A6345, 4); detail(2, 0x9C8466, 3);
    // 3: stone path
    fill(3, 0x999999); g.lineStyle(1, 0x777777); g.lineBetween(3*T, T/2, 4*T, T/2); g.lineBetween(3*T+T/2, 0, 3*T+T/2, T);
    // 4: sand
    fill(4, 0xD4B896); detail(4, 0xC4A886, 4); detail(4, 0xE4C8A6, 3);
    // 5: snow
    fill(5, 0xE8E8FF); detail(5, 0xFFFFFF, 5); detail(5, 0xD0D0EE, 3);
    // 6: water
    fill(6, 0x2266AA); g.fillStyle(0x3377BB); g.fillRect(6*T+4, 10, 8, 2); g.fillRect(6*T+16, 20, 10, 2);
    // 7: swamp
    fill(7, 0x3D5C2E); detail(7, 0x2D4C1E, 5); g.fillStyle(0x4D6C3E, 0.5); g.fillRect(7*T+8, 8, 6, 4);
    // 8: forest floor
    fill(8, 0x1A5C14); detail(8, 0x0D4A0A, 4); detail(8, 0x2A6C24, 3);
    // 9: ice
    fill(9, 0xAADDFF); g.lineStyle(1, 0xFFFFFF, 0.4); g.lineBetween(9*T+4, 6, 9*T+20, 10); g.lineBetween(9*T+10, 22, 9*T+28, 18);
    // 10: cobblestone
    fill(10, 0x888888);
    g.lineStyle(1, 0x666666);
    g.lineBetween(10*T, T/2, 11*T, T/2);
    g.lineBetween(10*T + T/3, 0, 10*T + T/3, T/2);
    g.lineBetween(10*T + T*2/3, T/2, 10*T + T*2/3, T);
    // 11: wood floor
    fill(11, 0x9B7340); g.lineStyle(1, 0x8A6230); for (let i = 0; i < 4; i++) g.lineBetween(11*T, i*8+4, 12*T, i*8+4);

    // Wall tiles (transparent backgrounds, just draw the obstacle)
    // 12: tree
    g.fillStyle(0x5C3317); g.fillRect(12*T+14, 20, 4, 12);
    g.fillStyle(0x2D6B1E); g.fillCircle(12*T+16, 14, 11);
    g.fillStyle(0x1A5C14); g.fillCircle(12*T+16, 11, 8);
    // 13: pine tree
    g.fillStyle(0x5C3317); g.fillRect(13*T+14, 22, 4, 10);
    g.fillStyle(0x1A6B14); g.fillTriangle(13*T+16, 2, 13*T+4, 24, 13*T+28, 24);
    g.fillStyle(0x0D5A0A); g.fillTriangle(13*T+16, 6, 13*T+8, 20, 13*T+24, 20);
    // 14: stone wall
    g.fillStyle(0x666666); g.fillRect(14*T+2, 2, 28, 28);
    g.fillStyle(0x777777); g.fillRect(14*T+4, 4, 12, 12); g.fillRect(14*T+18, 4, 12, 12);
    g.fillStyle(0x555555); g.fillRect(14*T+4, 18, 24, 10);
    // 15: wood wall
    g.fillStyle(0x7A5C30); g.fillRect(15*T+2, 2, 28, 28);
    g.fillStyle(0x8B6D40); g.fillRect(15*T+4, 4, 10, 24); g.fillRect(15*T+16, 4, 12, 24);
    g.lineStyle(1, 0x6A4C20); g.lineBetween(15*T+15, 2, 15*T+15, 30);
    // 16: rock
    g.fillStyle(0x888888); g.fillEllipse(16*T+16, 18, 22, 18);
    g.fillStyle(0x999999); g.fillEllipse(16*T+14, 14, 14, 10);
    // 17: cactus
    g.fillStyle(0x2D8C27); g.fillRect(17*T+13, 6, 6, 24);
    g.fillRect(17*T+6, 12, 7, 5); g.fillRect(17*T+19, 16, 7, 5);
    g.fillStyle(0x3A9D33); g.fillRect(17*T+14, 8, 4, 20);
    // 18: reeds/tall grass
    g.fillStyle(0x4D6C3E); g.fillRect(18*T+6, 8, 3, 22); g.fillRect(18*T+14, 4, 3, 26); g.fillRect(18*T+22, 10, 3, 20);
    g.fillStyle(0x5D7C4E); g.fillRect(18*T+10, 6, 3, 24); g.fillRect(18*T+18, 8, 3, 22);
    // 19: snow rock
    g.fillStyle(0xCCCCDD); g.fillEllipse(19*T+16, 18, 22, 18);
    g.fillStyle(0xDDDDEE); g.fillEllipse(19*T+14, 14, 14, 10);
    g.fillStyle(0xFFFFFF, 0.5); g.fillEllipse(19*T+12, 10, 8, 5);
    // 20: stairs (dark square with step lines)
    g.fillStyle(0x554433); g.fillRect(20*T, 0, T, T);
    g.lineStyle(2, 0x776655);
    for (let i = 0; i < 5; i++) g.lineBetween(20*T+2, 4+i*6, 20*T+T-2, 4+i*6);
    g.fillStyle(0xFFDD44); g.fillRect(20*T+12, 12, 8, 8); // highlight marker
    // 21: basement floor (dark stone)
    g.fillStyle(0x3A3A44); g.fillRect(21*T, 0, T, T);
    g.fillStyle(0x44444E); g.fillRect(21*T+2, 2, 14, 14); g.fillRect(21*T+16, 16, 14, 14);
    // 22: basement wall (dark brick)
    g.fillStyle(0x2A2A34); g.fillRect(22*T, 0, T, T);
    g.fillStyle(0x333340); g.fillRect(22*T+2, 2, 12, 6); g.fillRect(22*T+16, 2, 12, 6);
    g.fillRect(22*T+8, 10, 12, 6); g.fillRect(22*T+22, 10, 8, 6);
    g.fillRect(22*T+2, 18, 12, 6); g.fillRect(22*T+16, 18, 12, 6);
    g.fillRect(22*T+8, 26, 12, 6);

    g.generateTexture('tiles', TOTAL_TILES * T, T);
    g.destroy();
}

function createPlayerTexture(scene) {
    if (scene.textures.exists('player')) return;
    const g = scene.make.graphics({ add: false }), s = 36;
    g.fillStyle(0xCC4400); g.fillEllipse(s/2, s/2+4, 22, 18);
    g.fillStyle(0xDD5500); g.fillCircle(s/2, s/2-5, 9);
    g.fillStyle(0xFF6600); g.fillTriangle(s/2-14, s/2, s/2-8, s/2+5, s/2-17, s/2+8);
    g.fillStyle(0xFFAA00); g.fillTriangle(s/2-15, s/2+3, s/2-9, s/2+8, s/2-18, s/2+11);
    g.fillStyle(0xFF3300); g.fillTriangle(s/2-12, s/2-2, s/2-7, s/2+4, s/2-16, s/2+4);
    g.fillStyle(0xFF2200);
    g.fillTriangle(s/2-2, s/2-13, s/2, s/2-13, s/2-1, s/2-17);
    g.fillTriangle(s/2+1, s/2-13, s/2+3, s/2-13, s/2+2, s/2-16);
    g.fillTriangle(s/2+3, s/2-13, s/2+5, s/2-13, s/2+4, s/2-15);
    g.fillStyle(0xFF3300); g.fillEllipse(s/2+7, s/2-2, 5, 8);
    g.fillStyle(0xFFAA00); g.fillTriangle(s/2+8, s/2-7, s/2+8, s/2-4, s/2+14, s/2-5);
    g.fillStyle(0xFFFFFF); g.fillCircle(s/2+3, s/2-7, 3);
    g.fillStyle(0x000000); g.fillCircle(s/2+4, s/2-7, 1.5);
    g.fillStyle(0xBB3300); g.fillEllipse(s/2-2, s/2+4, 16, 10);
    g.fillStyle(0xFFBB00);
    g.fillRect(s/2-3, s/2+13, 2, 6); g.fillRect(s/2+2, s/2+13, 2, 6);
    g.fillRect(s/2-6, s/2+18, 4, 2); g.fillRect(s/2+2, s/2+18, 4, 2);
    g.generateTexture('player', s, s); g.destroy();
}

function createPlayerStunnedTexture(scene) {
    if (scene.textures.exists('player_stunned')) return;
    const g = scene.make.graphics({ add: false }), s = 36;
    g.fillStyle(0x886644); g.fillEllipse(s/2, s/2+4, 22, 18);
    g.fillStyle(0x997755); g.fillCircle(s/2, s/2-5, 9);
    g.fillStyle(0xAA8866); g.fillEllipse(s/2-2, s/2+4, 16, 10);
    g.fillStyle(0xBB3300); g.fillTriangle(s/2-2, s/2-13, s/2, s/2-13, s/2-1, s/2-17);
    g.fillStyle(0xFFAA00); g.fillTriangle(s/2+8, s/2-7, s/2+8, s/2-4, s/2+14, s/2-5);
    g.fillStyle(0xFFFFFF); g.fillCircle(s/2+3, s/2-7, 3);
    g.fillStyle(0x0000FF); g.fillCircle(s/2+4, s/2-7, 1.5);
    g.fillStyle(0xFFFF00);
    g.fillTriangle(s/2-5, s/2-22, s/2-8, s/2-18, s/2-2, s/2-18);
    g.fillTriangle(s/2-5, s/2-14, s/2-8, s/2-18, s/2-2, s/2-18);
    g.fillTriangle(s/2+5, s/2-24, s/2+2, s/2-20, s/2+8, s/2-20);
    g.fillTriangle(s/2+5, s/2-16, s/2+2, s/2-20, s/2+8, s/2-20);
    g.generateTexture('player_stunned', s, s); g.destroy();
}

function createShieldBubbleTexture(scene) {
    if (scene.textures.exists('shield_bubble')) return;
    const g = scene.make.graphics({ add: false }), s = 44;
    g.lineStyle(2, 0x44CCFF, 0.8); g.strokeCircle(s/2, s/2, 20);
    g.lineStyle(1, 0x88EEFF, 0.5); g.strokeCircle(s/2, s/2, 18);
    g.generateTexture('shield_bubble', s, s); g.destroy();
}

function createBunnyTexture(scene, key, body, head, inner, eyes) {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ add: false }), s = 34;
    g.fillStyle(body); g.fillEllipse(s/2, s/2+5, 20, 16);
    g.fillStyle(head); g.fillCircle(s/2, s/2-3, 9);
    g.fillStyle(head); g.fillEllipse(s/2-5, s/2-16, 6, 16); g.fillEllipse(s/2+5, s/2-16, 6, 16);
    g.fillStyle(inner); g.fillEllipse(s/2-5, s/2-16, 3, 12); g.fillEllipse(s/2+5, s/2-16, 3, 12);
    g.fillStyle(eyes); g.fillCircle(s/2-3, s/2-5, 2); g.fillCircle(s/2+3, s/2-5, 2);
    g.fillStyle(head); g.fillCircle(s/2-8, s/2+8, 5);
    g.generateTexture(key, s, s); g.destroy();
}

function createPatrolBunnyTexture(scene, key, stunned) {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ add: false }), s = 36;
    const c = stunned ? 0.6 : 1;
    g.fillStyle(stunned ? 0xAA9977 : 0xDDCCAA); g.fillEllipse(s/2, s/2+5, 22, 18);
    g.fillStyle(stunned ? 0xBBAA88 : 0xEEDDBB); g.fillCircle(s/2, s/2-3, 10);
    g.fillStyle(stunned ? 0x665533 : 0x887744); g.fillEllipse(s/2, s/2-6, 18, 10);
    g.fillStyle(stunned ? 0xBBAA88 : 0xEEDDBB);
    g.fillEllipse(s/2-6, s/2-16, 6, 14); g.fillEllipse(s/2+6, s/2-16, 6, 14);
    g.fillStyle(0xFFAABB); g.fillEllipse(s/2-6, s/2-16, 3, 10); g.fillEllipse(s/2+6, s/2-16, 3, 10);
    g.fillStyle(stunned ? 0x6666AA : 0xFF2200);
    g.fillCircle(s/2-3, s/2-4, 2); g.fillCircle(s/2+3, s/2-4, 2);
    g.generateTexture(key, s, s); g.destroy();
}

function createBossBunnyTexture(scene, key, stunned) {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ add: false }), s = 50;
    g.fillStyle(stunned ? 0x222222 : 0x333333); g.fillEllipse(s/2, s/2+6, 30, 24);
    g.fillStyle(stunned ? 0x333333 : 0x444444); g.fillCircle(s/2, s/2-4, 14);
    g.fillStyle(stunned ? 0x333333 : 0x444444);
    g.fillEllipse(s/2-8, s/2-22, 7, 18); g.fillEllipse(s/2+8, s/2-22, 7, 18);
    g.fillStyle(0xCC4444); g.fillEllipse(s/2-8, s/2-22, 3, 14); g.fillEllipse(s/2+8, s/2-22, 3, 14);
    // Crown
    g.fillStyle(stunned ? 0xAAAA00 : 0xFFD700);
    g.fillRect(s/2-10, s/2-16, 20, 5);
    g.fillTriangle(s/2-10, s/2-16, s/2-6, s/2-16, s/2-8, s/2-22);
    g.fillTriangle(s/2-2, s/2-16, s/2+2, s/2-16, s/2, s/2-24);
    g.fillTriangle(s/2+6, s/2-16, s/2+10, s/2-16, s/2+8, s/2-22);
    g.fillStyle(stunned ? 0x6666AA : 0xFF0000);
    g.fillCircle(s/2-5, s/2-6, 3); g.fillCircle(s/2+5, s/2-6, 3);
    if (!stunned) { g.fillStyle(0x000000); g.fillCircle(s/2-5, s/2-6, 1.5); g.fillCircle(s/2+5, s/2-6, 1.5); }
    g.generateTexture(key, s, s); g.destroy();
}

function createEggTexture(scene, colorHex, key) {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ add: false }), s = 20;
    g.fillStyle(colorHex); g.fillEllipse(s/2, s/2+1, 14, 18);
    g.fillStyle(0xFFFFFF, 0.4); g.fillEllipse(s/2-2, s/2-3, 5, 7);
    g.lineStyle(2, 0xFFFFFF, 0.3); g.lineBetween(s/2-5, s/2+2, s/2+5, s/2+2);
    g.generateTexture(key, s, s); g.destroy();
}

function createGoldenEggTexture(scene) {
    if (scene.textures.exists('goldenegg')) return;
    const g = scene.make.graphics({ add: false }), s = 24;
    g.fillStyle(0xFFD700); g.fillEllipse(s/2, s/2+1, 16, 20);
    g.fillStyle(0xFFF8CC, 0.5); g.fillEllipse(s/2-2, s/2-4, 6, 8);
    g.lineStyle(2, 0xFFA500, 0.6); g.lineBetween(s/2-6, s/2, s/2+6, s/2);
    g.fillStyle(0xFFFFFF); g.fillCircle(s/2+4, s/2-5, 2);
    g.generateTexture('goldenegg', s, s); g.destroy();
}

function createChocolateEggTexture(scene) {
    if (scene.textures.exists('chocolateegg')) return;
    const g = scene.make.graphics({ add: false }), s = 22;
    g.fillStyle(0x5C3317); g.fillEllipse(s/2, s/2+1, 14, 18);
    g.fillStyle(0x7B4B2A, 0.5); g.fillEllipse(s/2-2, s/2-3, 5, 7);
    g.lineStyle(2, 0x3B1F0B, 0.7); g.lineBetween(s/2-4, s/2-2, s/2+2, s/2+1);
    g.generateTexture('chocolateegg', s, s); g.destroy();
}

function createRottenEggTexture(scene) {
    if (scene.textures.exists('rottenegg')) return;
    const g = scene.make.graphics({ add: false }), s = 20;
    g.fillStyle(0x6B8E23); g.fillEllipse(s/2, s/2+1, 14, 18);
    g.fillStyle(0x556B2F, 0.5); g.fillEllipse(s/2-2, s/2-3, 5, 7);
    g.lineStyle(1, 0x9ACD32, 0.6);
    g.lineBetween(s/2-3, s/2-8, s/2-5, s/2-12);
    g.lineBetween(s/2, s/2-9, s/2, s/2-13);
    g.lineBetween(s/2+3, s/2-8, s/2+5, s/2-12);
    g.generateTexture('rottenegg', s, s); g.destroy();
}

function createHeartTexture(scene) {
    if (scene.textures.exists('heart')) return;
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0xFF2244); g.fillCircle(8, 8, 6); g.fillCircle(18, 8, 6);
    g.fillTriangle(2, 10, 24, 10, 13, 22);
    g.generateTexture('heart', 26, 24); g.destroy();
}

function createCrowBurstTexture(scene) {
    if (scene.textures.exists('crowburst')) return;
    const g = scene.make.graphics({ add: false }), s = 40;
    g.fillStyle(0xFFDD00, 0.6); g.fillCircle(s/2, s/2, 16);
    g.fillStyle(0xFFAA00, 0.4); g.fillCircle(s/2, s/2, 20);
    for (let i = 0; i < 8; i++) {
        const a = (Math.PI*2/8)*i;
        g.lineStyle(2, 0xFFFF00, 0.7);
        g.lineBetween(s/2+Math.cos(a)*12, s/2+Math.sin(a)*12, s/2+Math.cos(a)*20, s/2+Math.sin(a)*20);
    }
    g.generateTexture('crowburst', s, s); g.destroy();
}

function createDashTrailTexture(scene) {
    if (scene.textures.exists('dashtrail')) return;
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0xFFAA00, 0.5); g.fillCircle(8, 8, 6);
    g.fillStyle(0xFFDD44, 0.3); g.fillCircle(8, 8, 8);
    g.generateTexture('dashtrail', 16, 16); g.destroy();
}

function createPowerupTextures(scene) {
    const s = 24;
    if (!scene.textures.exists('powerup_speed')) {
        const g = scene.make.graphics({ add: false });
        g.fillStyle(0x00AA00, 0.4); g.fillCircle(s/2, s/2, 11);
        g.fillStyle(0xFFDD00);
        g.fillTriangle(s/2+2, s/2-8, s/2-4, s/2+1, s/2+1, s/2+1);
        g.fillTriangle(s/2-1, s/2, s/2+5, s/2, s/2-1, s/2+9);
        g.generateTexture('powerup_speed', s, s); g.destroy();
    }
    if (!scene.textures.exists('powerup_shield')) {
        const g = scene.make.graphics({ add: false });
        g.fillStyle(0x0044AA, 0.4); g.fillCircle(s/2, s/2, 11);
        g.fillStyle(0x44AAFF); g.fillEllipse(s/2, s/2, 14, 16);
        g.fillStyle(0x88CCFF); g.fillEllipse(s/2, s/2-2, 8, 10);
        g.generateTexture('powerup_shield', s, s); g.destroy();
    }
    if (!scene.textures.exists('powerup_magnet')) {
        const g = scene.make.graphics({ add: false });
        g.fillStyle(0xAA0000, 0.4); g.fillCircle(s/2, s/2, 11);
        g.lineStyle(4, 0xFF4444); g.beginPath(); g.arc(s/2, s/2-1, 7, Math.PI, 0, false); g.strokePath();
        g.fillStyle(0xFF4444); g.fillRect(s/2-8, s/2-1, 4, 8); g.fillRect(s/2+4, s/2-1, 4, 8);
        g.generateTexture('powerup_magnet', s, s); g.destroy();
    }
    if (!scene.textures.exists('powerup_freeze')) {
        const g = scene.make.graphics({ add: false });
        g.fillStyle(0x004488, 0.4); g.fillCircle(s/2, s/2, 11);
        g.lineStyle(2, 0xCCEEFF);
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI/3)*i;
            g.lineBetween(s/2+Math.cos(a)*3, s/2+Math.sin(a)*3, s/2+Math.cos(a)*9, s/2+Math.sin(a)*9);
        }
        g.fillStyle(0xFFFFFF); g.fillCircle(s/2, s/2, 2);
        g.generateTexture('powerup_freeze', s, s); g.destroy();
    }
    if (!scene.textures.exists('powerup_extralife')) {
        const g = scene.make.graphics({ add: false });
        g.fillStyle(0x880044, 0.4); g.fillCircle(s/2, s/2, 11);
        g.fillStyle(0xFF4488); g.fillCircle(s/2-3, s/2-2, 4); g.fillCircle(s/2+3, s/2-2, 4);
        g.fillTriangle(s/2-7, s/2, s/2+7, s/2, s/2, s/2+7);
        g.generateTexture('powerup_extralife', s, s); g.destroy();
    }
}

function createNPCTexture(scene, key, bodyColor, hatColor, hatType) {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ add: false }), s = 32;
    // Body
    g.fillStyle(bodyColor); g.fillEllipse(s/2, s/2+5, 16, 14);
    // Head
    const hr = ((bodyColor >> 16) & 0xFF), hg = ((bodyColor >> 8) & 0xFF), hb = (bodyColor & 0xFF);
    const headColor = ((Math.min(255, hr + 30) << 16) | (Math.min(255, hg + 30) << 8) | Math.min(255, hb + 30));
    g.fillStyle(headColor); g.fillCircle(s/2, s/2-5, 8);
    // Eyes
    g.fillStyle(0x000000); g.fillCircle(s/2-3, s/2-6, 1.5); g.fillCircle(s/2+3, s/2-6, 1.5);
    // Mouth
    g.lineStyle(1, 0x000000, 0.5); g.lineBetween(s/2-2, s/2-2, s/2+2, s/2-2);
    // Hat
    g.fillStyle(hatColor);
    if (hatType === 'hood') {
        g.fillEllipse(s/2, s/2-9, 20, 10);
    } else if (hatType === 'pointed') {
        g.fillTriangle(s/2-8, s/2-9, s/2+8, s/2-9, s/2, s/2-24);
    } else if (hatType === 'helmet') {
        g.fillEllipse(s/2, s/2-9, 20, 8);
        g.fillRect(s/2-10, s/2-9, 20, 3);
    } else if (hatType === 'straw') {
        g.fillEllipse(s/2, s/2-11, 22, 6);
        g.fillRect(s/2-6, s/2-16, 12, 5);
    } else if (hatType === 'cap') {
        g.fillEllipse(s/2+2, s/2-11, 18, 7);
        g.fillRect(s/2, s/2-13, 10, 3);
    }
    // Feet
    g.fillStyle(0x333333); g.fillRect(s/2-4, s/2+11, 3, 4); g.fillRect(s/2+1, s/2+11, 3, 4);
    g.generateTexture(key, s, s); g.destroy();
}


// ===================================================================
//  BOOT SCENE
// ===================================================================

class BootScene extends Phaser.Scene {
    constructor() { super('BootScene'); }

    preload() { generateAllTextures(this); }

    create() {
        const W = this.scale.width, H = this.scale.height;

        this.add.tileSprite(0, 0, W, H, 'tiles', T_GRASS).setOrigin(0);

        const panel = this.add.graphics();
        panel.fillStyle(0x000000, 0.7);
        panel.fillRoundedRect(W/2-210, 20, 420, H-40, 20);

        this.add.text(W/2, 60, "Mr. Kluck's", {
            fontSize: '34px', fontFamily: 'Georgia, serif', fill: '#FFD700', stroke: '#8B4513', strokeThickness: 5,
        }).setOrigin(0.5);
        this.add.text(W/2, 102, 'Egg Hunt', {
            fontSize: '44px', fontFamily: 'Georgia, serif', fill: '#FFD700', stroke: '#8B4513', strokeThickness: 6,
        }).setOrigin(0.5);
        this.add.text(W/2, 140, 'Open World Edition', {
            fontSize: '18px', fontFamily: 'Georgia, serif', fill: '#AADDFF',
        }).setOrigin(0.5);

        const kluck = this.add.image(W/2, 185, 'player').setScale(2.5);
        this.tweens.add({ targets: kluck, y: 195, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut' });

        this.add.text(W/2, 240, [
            'The Easter Bunny has stolen your eggs',
            'and scattered them across the land!',
            'Explore forests, deserts, swamps & mountains',
            'to reclaim them all!',
        ].join('\n'), {
            fontSize: '14px', fontFamily: 'Arial', fill: '#FFFFCC', align: 'center', lineSpacing: 4,
        }).setOrigin(0.5);

        this.add.text(W/2, 320, [
            'WASD/Arrows: Move   |   E: Talk to NPCs',
            'SPACE: Crow Stun    |   SHIFT: Dash',
        ].join('\n'), {
            fontSize: '12px', fontFamily: 'Arial', fill: '#88DDAA', align: 'center', lineSpacing: 3,
        }).setOrigin(0.5);

        // Leaderboard
        const stored = localStorage.getItem('mrkluckLeaderboard');
        const lb = stored ? JSON.parse(stored) : [];
        let lbY = 365;
        this.add.text(W/2, lbY, '--- High Scores ---', { fontSize: '14px', fill: '#FFD700' }).setOrigin(0.5);
        if (lb.length === 0) {
            this.add.text(W/2, lbY+20, '(no scores yet)', { fontSize: '13px', fill: '#FFFFCC' }).setOrigin(0.5);
        } else {
            lb.forEach((e, i) => {
                this.add.text(W/2, lbY+18+i*18, `${i+1}. ${e.name}  ${e.score} pts`, {
                    fontSize: '13px', fill: '#FFFFCC',
                }).setOrigin(0.5);
            });
        }

        this.add.text(W/2, H-65, `v${APP_VERSION}`, { fontSize: '12px', fill: '#888' }).setOrigin(0.5);
        const tap = this.add.text(W/2, H-40, 'Tap or Press SPACE to Play', {
            fontSize: '18px', fontFamily: 'Arial', fill: '#FFD700',
        }).setOrigin(0.5);
        this.tweens.add({ targets: tap, alpha: 0, yoyo: true, repeat: -1, duration: 700 });

        // Throttle CPU — boot screen is mostly static
        this.game.loop.targetFps = 15;

        const start = () => {
            this.game.loop.targetFps = 60;
            this.scene.start('GameScene');
        };
        this.input.keyboard.once('keydown-SPACE', start);
        this.input.once('pointerdown', start);
    }
}


// ===================================================================
//  GAME SCENE
// ===================================================================

class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }

    init() {
        this.score = 0;
        this.lives = 3;
        this.isInvincible = false;
        this.invincibleTimer = null;
        this.crowReady = true;
        this.dashReady = true;
        this.isDashing = false;
        this.paused = false;
        this.playerDead = false;

        this.comboCount = 0;
        this.comboMult = 1;
        this.comboTimer = null;

        this.totalEggsCollected = 0;
        this.goldenEggsCollected = 0;
        this.bossesDefeated = {};

        this.activePowerups = {};
        this.shieldSprite = null;

        this.dialogueActive = false;
        this.dialogueNPC = null;
        this.dialogueIdx = 0;
        this.typewriterTimer = null;
        this.typewriterDone = false;
        this.currentFullText = '';

        this.activeQuests = [];
        this.completedQuests = {};

        this.lastVelocity = { x: 0, y: 0 };
        this.playerOnIce = false;

        this.basementCooldown = false; // prevent re-entering immediately after exiting
    }

    preload() { generateAllTextures(this); }

    create() {
        // Generate world data
        this.worldData = generateWorld();

        // Build tilemap
        const map = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: WORLD_W, height: WORLD_H });
        const tileset = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0);

        this.groundLayer = map.createBlankLayer('ground', tileset);
        this.wallLayer = map.createBlankLayer('walls', tileset);

        for (let y = 0; y < WORLD_H; y++) {
            for (let x = 0; x < WORLD_W; x++) {
                this.groundLayer.putTileAt(this.worldData.ground[y][x], x, y);
                if (this.worldData.walls[y][x] >= 0) {
                    this.wallLayer.putTileAt(this.worldData.walls[y][x], x, y);
                }
            }
        }

        this.groundLayer.setCollision([T_WATER]);
        this.wallLayer.setCollisionByExclusion([-1]);

        // Physics world bounds
        this.physics.world.setBounds(0, 0, WORLD_W * TILE, WORLD_H * TILE);

        // Player
        this.player = this.physics.add.sprite(V1_X * TILE + TILE/2, V1_Y * TILE + TILE/2, 'player');
        this.player.body.setSize(16, 16);
        this.player.body.setOffset(10, 14);
        this.player.setCollideWorldBounds(true);
        this.player.setDepth(10);

        this.physics.add.collider(this.player, this.groundLayer);
        this.physics.add.collider(this.player, this.wallLayer);

        // Groups
        this.eggGroup = this.physics.add.staticGroup();
        this.bunnyGroup = this.physics.add.group();
        this.powerupGroup = this.physics.add.staticGroup();

        this.physics.add.collider(this.bunnyGroup, this.wallLayer);

        // Spawn eggs
        this.worldData.eggs.forEach(e => {
            const px = e.tx * TILE + TILE/2, py = e.ty * TILE + TILE/2;
            let key, points, eggType;
            if (e.type === 'golden')     { key = 'goldenegg';     points = GOLDEN_EGG_POINTS;    eggType = 'golden'; }
            else if (e.type === 'chocolate') { key = 'chocolateegg'; points = CHOCOLATE_EGG_POINTS; eggType = 'chocolate'; }
            else if (e.type === 'rotten')    { key = 'rottenegg';    points = ROTTEN_EGG_PENALTY;   eggType = 'rotten'; }
            else { key = 'egg' + (Math.abs(e.tx * 7 + e.ty * 3) % EGG_COLORS.length); points = EGG_POINTS; eggType = 'normal'; }
            const egg = this.eggGroup.create(px, py, key);
            egg.setData('points', points);
            egg.setData('eggType', eggType);
            egg.setDepth(5);
            if (eggType === 'golden') {
                this.tweens.add({ targets: egg, angle: 360, repeat: -1, duration: 3000, ease: 'Linear' });
                this.tweens.add({ targets: egg, scaleX: 1.15, scaleY: 1.15, yoyo: true, repeat: -1, duration: 800 });
            } else if (eggType === 'rotten') {
                this.tweens.add({ targets: egg, angle: -8, yoyo: true, repeat: -1, duration: 400 });
            } else {
                this.tweens.add({ targets: egg, y: py - 4, yoyo: true, repeat: -1, duration: 600 + (e.tx % 5) * 80, ease: 'Sine.easeInOut' });
            }
        });

        // Spawn bunnies
        this.worldData.bunnies.forEach(b => {
            const px = b.tx * TILE + TILE/2, py = b.ty * TILE + TILE/2;
            let key, speed, texKey, stunKey;
            if (b.type === 'fast')   { key = 'fast_bunny'; speed = 130; texKey = 'fast_bunny'; stunKey = 'fast_bunny_stunned'; }
            else if (b.type === 'patrol') { key = 'patrol_bunny'; speed = 80; texKey = 'patrol_bunny'; stunKey = 'patrol_bunny_stunned'; }
            else if (b.type === 'boss')   { key = 'boss_bunny'; speed = 70; texKey = 'boss_bunny'; stunKey = 'boss_bunny_stunned'; }
            else                          { key = 'bunny'; speed = 90; texKey = 'bunny'; stunKey = 'bunny_stunned'; }
            const bunny = this.bunnyGroup.create(px, py, key);
            bunny.setCollideWorldBounds(true);
            bunny.setData('speed', speed);
            bunny.setData('stunned', false);
            bunny.setData('stunnedTimer', null);
            bunny.setData('bunnyType', b.type);
            bunny.setData('textureKey', texKey);
            bunny.setData('stunnedTextureKey', stunKey);
            bunny.setData('biome', b.biome);
            bunny.setData('stuckTime', 0);
            bunny.setDepth(9);
            if (b.type === 'patrol') {
                bunny.setData('patrolCenter', { x: px, y: py });
                bunny.setData('patrolAngle', Math.random() * Math.PI * 2);
            }
            if (b.type === 'boss') {
                bunny.setData('bossHP', 3);
                bunny.setScale(1.2);
            }
        });

        // Overlaps
        this.physics.add.overlap(this.player, this.eggGroup, this.onCollectEgg, null, this);
        this.physics.add.overlap(this.player, this.bunnyGroup, this.onCaughtByBunny, null, this);
        this.physics.add.overlap(this.player, this.powerupGroup, this.onCollectPowerup, null, this);

        // Spawn NPCs
        this.npcs = [];
        NPC_DEFS.forEach(d => {
            const npc = this.add.image(d.tx * TILE + TILE/2, d.ty * TILE + TILE/2, 'npc_' + d.id);
            npc.setDepth(8);
            npc.setData('npcDef', d);
            npc.setData('dialogueIdx', 0);
            this.npcs.push(npc);
            this.tweens.add({ targets: npc, y: npc.y - 3, yoyo: true, repeat: -1, duration: 800 + Math.random() * 400, ease: 'Sine.easeInOut' });
        });

        // Camera
        this.cameras.main.setBounds(0, 0, WORLD_W * TILE, WORLD_H * TILE);
        this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

        // Input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D,
        });
        this.crowKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.dashKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.interactKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

        this.setupTouchControls();

        // HUD
        this.createHUD();
        this.createMinimap();
        this.createDialogueUI();

        // Power-up spawn timer
        this.time.addEvent({ delay: 12000, callback: this.spawnPowerup, callbackScope: this, loop: true });

        // NPC proximity
        this.nearestNPC = null;
        this.interactPrompt = this.add.text(0, 0, '[E] Talk', {
            fontSize: '12px', fill: '#FFD700', backgroundColor: '#000000AA', padding: { x: 3, y: 2 },
        }).setOrigin(0.5).setDepth(30).setVisible(false);
    }

    // ------------------------------------------------------------------
    //  HUD
    // ------------------------------------------------------------------

    createHUD() {
        const W = this.scale.width;
        this.hudBg = this.add.graphics().setScrollFactor(0).setDepth(100);
        this.hudBg.fillStyle(0x000000, 0.6);
        this.hudBg.fillRect(0, 0, W, 40);

        this.scoreText = this.add.text(8, 4, 'Score: 0', { fontSize: '14px', fill: '#FFD700' }).setScrollFactor(0).setDepth(101);
        this.eggsText = this.add.text(8, 22, 'Eggs: 0', { fontSize: '12px', fill: '#FFFFFF' }).setScrollFactor(0).setDepth(101);
        this.comboText = this.add.text(130, 4, '', { fontSize: '13px', fill: '#FF8800' }).setScrollFactor(0).setDepth(101);
        this.biomeText = this.add.text(W/2, 4, '', { fontSize: '12px', fill: '#AADDAA' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101);

        this.crowLabel = this.add.text(W/2, 24, 'CROW!', { fontSize: '11px', fill: '#FFD700', backgroundColor: '#440000', padding: { x: 3, y: 1 } }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101);
        this.dashLabel = this.add.text(W/2 + 55, 24, 'DASH!', { fontSize: '11px', fill: '#FF8800', backgroundColor: '#442200', padding: { x: 3, y: 1 } }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101);

        this.createHeartDisplay();

        // Quest panel
        this.questText = this.add.text(8, 44, '', { fontSize: '11px', fill: '#AADDFF', lineSpacing: 2 }).setScrollFactor(0).setDepth(101);
    }

    createHeartDisplay() {
        if (this.heartImages) this.heartImages.forEach(h => h.destroy());
        this.heartImages = [];
        const W = this.scale.width;
        for (let i = 0; i < this.lives; i++) {
            const h = this.add.image(W - 14 - i * 22, 20, 'heart').setScrollFactor(0).setDepth(101).setScale(0.6);
            this.heartImages.push(h);
        }
    }

    createMinimap() {
        const mmW = 110, mmH = 110;
        const mmX = this.scale.width - mmW - 8, mmY = 44;

        // Generate minimap texture
        const g = this.make.graphics({ add: false });
        const colorMap = {
            [T_GRASS]: 0x2D8C27, [T_GRASS_DARK]: 0x247A1F, [T_DIRT]: 0x8B7355, [T_STONE]: 0x999999,
            [T_SAND]: 0xD4B896, [T_SNOW]: 0xDDDDFF, [T_WATER]: 0x2266AA, [T_SWAMP]: 0x3D5C2E,
            [T_FOREST]: 0x1A5C14, [T_ICE]: 0xAADDFF, [T_COBBLE]: 0x888888, [T_WOOD]: 0x9B7340,
        };
        const scaleX = mmW / WORLD_W, scaleY = mmH / WORLD_H;
        for (let y = 0; y < WORLD_H; y++) {
            for (let x = 0; x < WORLD_W; x++) {
                g.fillStyle(colorMap[this.worldData.ground[y][x]] || 0x2D8C27);
                g.fillRect(Math.floor(x * scaleX), Math.floor(y * scaleY), Math.ceil(scaleX), Math.ceil(scaleY));
            }
        }
        g.generateTexture('minimap_tex', mmW, mmH);
        g.destroy();

        // Border
        const border = this.add.graphics().setScrollFactor(0).setDepth(100);
        border.lineStyle(2, 0xFFFFFF, 0.6);
        border.strokeRect(mmX - 1, mmY - 1, mmW + 2, mmH + 2);

        this.minimapImg = this.add.image(mmX, mmY, 'minimap_tex').setOrigin(0).setScrollFactor(0).setDepth(101).setAlpha(0.75);
        this.minimapDot = this.add.graphics().setScrollFactor(0).setDepth(102);
        this.mmX = mmX; this.mmY = mmY; this.mmW = mmW; this.mmH = mmH;
    }

    createDialogueUI() {
        const W = this.scale.width, H = this.scale.height;
        const boxH = 130, boxW = W - 40, boxX = 20, boxY = H - boxH - 10;

        this.dlgBox = this.add.graphics().setScrollFactor(0).setDepth(200).setVisible(false);
        this.dlgBox.fillStyle(0x111122, 0.92);
        this.dlgBox.fillRoundedRect(boxX, boxY, boxW, boxH, 12);
        this.dlgBox.lineStyle(2, 0x4466AA, 0.8);
        this.dlgBox.strokeRoundedRect(boxX, boxY, boxW, boxH, 12);

        this.dlgName = this.add.text(boxX + 14, boxY + 8, '', {
            fontSize: '16px', fontFamily: 'Georgia, serif', fill: '#FFD700',
        }).setScrollFactor(0).setDepth(201).setVisible(false);

        this.dlgText = this.add.text(boxX + 14, boxY + 32, '', {
            fontSize: '14px', fontFamily: 'Arial', fill: '#EEEEEE', wordWrap: { width: boxW - 28 }, lineSpacing: 4,
        }).setScrollFactor(0).setDepth(201).setVisible(false);

        this.dlgPrompt = this.add.text(boxX + boxW - 14, boxY + boxH - 16, 'Tap / [E]', {
            fontSize: '11px', fill: '#AAAAAA',
        }).setOrigin(1, 1).setScrollFactor(0).setDepth(201).setVisible(false);
    }

    // ------------------------------------------------------------------
    //  UPDATE LOOP
    // ------------------------------------------------------------------

    update(time, delta) {
        // Throttle CPU when in idle states
        const isIdle = this.playerDead || this.paused || this.dialogueActive;
        const targetFps = isIdle ? 15 : 60;
        if (this.game.loop.targetFps !== targetFps) this.game.loop.targetFps = targetFps;

        if (this.playerDead) return;

        // Handle dialogue input separately
        if (this.dialogueActive) {
            if (Phaser.Input.Keyboard.JustDown(this.interactKey) || Phaser.Input.Keyboard.JustDown(this.crowKey)
                || this.dialogueTapped) {
                this.dialogueTapped = false;
                this.advanceDialogue();
            }
            return;
        }

        if (this.paused) return;

        this.handleInput();
        this.updateBunnies(delta);
        this.updateNPCProximity();
        this.updateMinimap();
        this.updateHUD();
        this.updateShield();
        this.updateMagnet();
        this.updateEnvironment();
        this.checkStairs();
    }

    handleInput() {
        if (this.isDashing) return;

        const left  = this.cursors.left.isDown  || this.wasd.left.isDown;
        const right = this.cursors.right.isDown || this.wasd.right.isDown;
        const up    = this.cursors.up.isDown    || this.wasd.up.isDown;
        const down  = this.cursors.down.isDown  || this.wasd.down.isDown;

        // Touch drag direction
        const tD = this.touchDir || { x: 0, y: 0 };

        let speed = PLAYER_SPEED;
        if (this.activePowerups.speed) speed *= 1.6;

        // Mud check
        const ptx = Math.floor(this.player.x / TILE), pty = Math.floor(this.player.y / TILE);
        const groundTile = (ptx >= 0 && pty >= 0 && ptx < WORLD_W && pty < WORLD_H) ? this.worldData.ground[pty][ptx] : T_GRASS;
        if (groundTile === T_SWAMP && !this.activePowerups.speed) speed *= 0.55;
        this.playerOnIce = (groundTile === T_ICE);

        let vx = 0, vy = 0;
        if (left  || tD.x < -0.3) vx = -speed;
        if (right || tD.x >  0.3) vx =  speed;
        if (up    || tD.y < -0.3) vy = -speed;
        if (down  || tD.y >  0.3) vy =  speed;

        if (vx !== 0 && vy !== 0) { const d = 1 / Math.SQRT2; vx *= d; vy *= d; }

        if (this.playerOnIce) {
            vx = this.lastVelocity.x * 0.93 + vx * 0.07;
            vy = this.lastVelocity.y * 0.93 + vy * 0.07;
        }

        this.player.setVelocity(vx, vy);
        this.lastVelocity = { x: vx, y: vy };

        if (vx < 0) this.player.setFlipX(true);
        if (vx > 0) this.player.setFlipX(false);

        if (Phaser.Input.Keyboard.JustDown(this.crowKey)) this.useCrowPower();
        if (Phaser.Input.Keyboard.JustDown(this.dashKey)) this.useDash();
        if (Phaser.Input.Keyboard.JustDown(this.interactKey) && this.nearestNPC) this.showDialogue(this.nearestNPC);
    }

    updateBunnies(delta) {
        const px = this.player.x, py = this.player.y;
        const allFrozen = !!this.activePowerups.freeze;

        this.bunnyGroup.getChildren().forEach(bunny => {
            if (bunny.getData('stunned')) return;

            const dist = Phaser.Math.Distance.Between(bunny.x, bunny.y, px, py);

            if (allFrozen) { bunny.setVelocity(0, 0); bunny.setTint(0x88BBFF); return; }
            bunny.clearTint();

            // Leash — don't chase if too far
            if (dist > BUNNY_LEASH) { bunny.setVelocity(0, 0); bunny.setData('stuckTime', 0); return; }

            const speed = bunny.getData('speed');
            const type = bunny.getData('bunnyType');

            if (type === 'patrol') {
                const center = bunny.getData('patrolCenter');
                if (dist < 130) {
                    const a = Phaser.Math.Angle.Between(bunny.x, bunny.y, px, py);
                    this.physics.velocityFromRotation(a, speed * 1.2, bunny.body.velocity);
                } else {
                    let pa = bunny.getData('patrolAngle') + 0.015;
                    bunny.setData('patrolAngle', pa);
                    const tx = center.x + Math.cos(pa) * 80, ty = center.y + Math.sin(pa) * 80;
                    const a = Phaser.Math.Angle.Between(bunny.x, bunny.y, tx, ty);
                    this.physics.velocityFromRotation(a, speed * 0.6, bunny.body.velocity);
                }
            } else if (type === 'boss') {
                const a = Phaser.Math.Angle.Between(bunny.x, bunny.y, px, py);
                const phase = Math.floor(this.time.now / 3000) % 2;
                if (phase === 0 || dist < 100) {
                    this.physics.velocityFromRotation(a, speed * 1.3, bunny.body.velocity);
                } else {
                    this.physics.velocityFromRotation(a + Math.PI / 2, speed, bunny.body.velocity);
                }
            } else if (dist < BUNNY_CHASE_RANGE) {
                const a = Phaser.Math.Angle.Between(bunny.x, bunny.y, px, py);
                const wobble = Math.sin(this.time.now / 600 + bunny.x) * (type === 'fast' ? 0.2 : 0.4);
                this.physics.velocityFromRotation(a + wobble, speed, bunny.body.velocity);
            } else {
                // Wander
                const wa = Math.sin(this.time.now / 2000 + bunny.x * 0.1) * Math.PI;
                this.physics.velocityFromRotation(wa, speed * 0.3, bunny.body.velocity);
            }

            // Wall-stuck avoidance
            if (bunny.body.speed < 5 && dist < BUNNY_CHASE_RANGE) {
                const st = (bunny.getData('stuckTime') || 0) + (delta || 16);
                bunny.setData('stuckTime', st);
                if (st > 800) {
                    const nudge = Phaser.Math.Angle.Between(bunny.x, bunny.y, px, py) + (Math.random() > 0.5 ? Math.PI/2 : -Math.PI/2);
                    this.physics.velocityFromRotation(nudge, speed, bunny.body.velocity);
                    bunny.setData('stuckTime', 0);
                }
            } else {
                bunny.setData('stuckTime', 0);
            }

            if (bunny.body.velocity.x < 0) bunny.setFlipX(true);
            else bunny.setFlipX(false);
        });
    }

    updateNPCProximity() {
        let nearest = null, nearDist = Infinity;
        this.npcs.forEach(npc => {
            const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y);
            if (d < NPC_INTERACT_DIST && d < nearDist) { nearest = npc; nearDist = d; }
        });
        this.nearestNPC = nearest;
        if (nearest) {
            this.interactPrompt.setPosition(nearest.x, nearest.y - 24);
            this.interactPrompt.setVisible(true);
        } else {
            this.interactPrompt.setVisible(false);
        }
    }

    updateMinimap() {
        const px = (this.player.x / (WORLD_W * TILE)) * this.mmW + this.mmX;
        const py = (this.player.y / (WORLD_H * TILE)) * this.mmH + this.mmY;
        this.minimapDot.clear();
        this.minimapDot.fillStyle(0xFF0000);
        this.minimapDot.fillCircle(px, py, 3);
    }

    updateHUD() {
        this.scoreText.setText(`Score: ${this.score}`);
        this.eggsText.setText(`Eggs: ${this.totalEggsCollected}`);

        if (this.comboMult > 1) {
            this.comboText.setText(`x${this.comboMult} COMBO`);
        } else {
            this.comboText.setText('');
        }

        // Biome name
        const ptx = Math.floor(this.player.x / TILE), pty = Math.floor(this.player.y / TILE);
        if (ptx >= 0 && pty >= 0 && ptx < WORLD_W && pty < WORLD_H) {
            const b = this.worldData.biomeMap[pty][ptx];
            const names = { village: 'Village', farmland: 'Farmland', forest: 'Forest', desert: 'Desert', swamp: 'Swamp', snow: 'Snowy Mountains', hills: 'Hills', water: 'Water' };
            this.biomeText.setText(names[b] || b);
        }

        // Crow/Dash labels
        this.crowLabel.setText(this.crowReady ? 'CROW!' : 'crow...');
        this.crowLabel.setStyle({ fill: this.crowReady ? '#FFD700' : '#666', backgroundColor: this.crowReady ? '#440000' : '#222' });
        this.dashLabel.setText(this.dashReady ? 'DASH!' : 'dash...');
        this.dashLabel.setStyle({ fill: this.dashReady ? '#FF8800' : '#666', backgroundColor: this.dashReady ? '#442200' : '#222' });

        // Quest tracker
        if (this.activeQuests.length > 0) {
            const lines = this.activeQuests.map(q => {
                let prog = '';
                if (q.type === 'eggs') prog = ` (${Math.min(this.totalEggsCollected, q.target)}/${q.target})`;
                if (q.type === 'golden') prog = ` (${Math.min(this.goldenEggsCollected, q.target)}/${q.target})`;
                if (q.type === 'boss') prog = this.bossesDefeated[q.target] ? ' (Done!)' : '';
                return `> ${q.desc}${prog}`;
            });
            this.questText.setText(lines.join('\n'));
        } else {
            this.questText.setText('');
        }
    }

    updateShield() {
        if (this.shieldSprite && this.shieldSprite.active) {
            this.shieldSprite.setPosition(this.player.x, this.player.y);
        }
    }

    updateMagnet() {
        if (!this.activePowerups.magnet) return;
        this.eggGroup.getChildren().forEach(egg => {
            if (egg.getData('eggType') === 'rotten') return;
            const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, egg.x, egg.y);
            if (d < 150) {
                const a = Phaser.Math.Angle.Between(egg.x, egg.y, this.player.x, this.player.y);
                egg.x += Math.cos(a) * 3;
                egg.y += Math.sin(a) * 3;
                egg.body.reset(egg.x, egg.y);
            }
        });
    }

    updateEnvironment() {
        // Ice visual hint
        if (this.playerOnIce) {
            this.player.setTint(0xCCDDFF);
        } else if (!this.activePowerups.shield) {
            this.player.clearTint();
        }
    }

    // ------------------------------------------------------------------
    //  DIALOGUE
    // ------------------------------------------------------------------

    showDialogue(npc) {
        const def = npc.getData('npcDef');
        this.dialogueActive = true;
        this.dialogueTapped = false;
        this.dialogueNPC = npc;
        this.player.setVelocity(0, 0);

        // Tap anywhere to advance dialogue on mobile
        this._dialogueTapHandler = () => { if (this.dialogueActive) this.dialogueTapped = true; };
        this.input.on('pointerdown', this._dialogueTapHandler);

        // Activate quest if NPC has one and not already active/completed
        if (def.quest && !this.completedQuests[def.quest.id] && !this.activeQuests.find(q => q.id === def.quest.id)) {
            this.activeQuests.push(def.quest);
        }

        const idx = npc.getData('dialogueIdx');
        const text = def.dialogues[idx % def.dialogues.length];
        npc.setData('dialogueIdx', idx + 1);

        this.dlgBox.setVisible(true);
        this.dlgName.setText(def.name).setVisible(true);
        this.dlgText.setText('').setVisible(true);
        this.dlgPrompt.setVisible(true);

        this.currentFullText = text;
        this.typewriterDone = false;
        this.startTypewriter(text);
    }

    startTypewriter(text) {
        let i = 0;
        if (this.typewriterTimer) this.typewriterTimer.remove();
        this.typewriterTimer = this.time.addEvent({
            delay: DIALOGUE_CHAR_DELAY,
            callback: () => {
                i++;
                this.dlgText.setText(text.substring(0, i));
                if (i >= text.length) { this.typewriterTimer.remove(); this.typewriterDone = true; }
            },
            loop: true,
        });
    }

    advanceDialogue() {
        if (!this.typewriterDone) {
            // Skip to full text
            if (this.typewriterTimer) this.typewriterTimer.remove();
            this.dlgText.setText(this.currentFullText);
            this.typewriterDone = true;
            return;
        }
        this.closeDialogue();
    }

    closeDialogue() {
        this.dialogueActive = false;
        this.dialogueTapped = false;
        this.dialogueNPC = null;
        if (this._dialogueTapHandler) {
            this.input.off('pointerdown', this._dialogueTapHandler);
            this._dialogueTapHandler = null;
        }
        this.dlgBox.setVisible(false);
        this.dlgName.setVisible(false);
        this.dlgText.setVisible(false);
        this.dlgPrompt.setVisible(false);
        if (this.typewriterTimer) this.typewriterTimer.remove();

        // Check quest completion after dialogue
        this.checkQuests();
    }

    // ------------------------------------------------------------------
    //  QUESTS
    // ------------------------------------------------------------------

    checkQuests() {
        this.activeQuests = this.activeQuests.filter(q => {
            if (this.completedQuests[q.id]) return false;
            let done = false;
            if (q.type === 'eggs' && this.totalEggsCollected >= q.target) done = true;
            if (q.type === 'golden' && this.goldenEggsCollected >= q.target) done = true;
            if (q.type === 'boss' && this.bossesDefeated[q.target]) done = true;
            if (done) {
                this.completeQuest(q);
                return false;
            }
            return true;
        });
    }

    completeQuest(quest) {
        this.completedQuests[quest.id] = true;

        // Reward
        if (quest.rewardType === 'life') {
            this.lives = Math.min(this.lives + 1, 5);
            this.createHeartDisplay();
        } else if (quest.rewardType === 'score500') {
            this.score += 500;
        } else if (quest.rewardType === 'speed') {
            // Permanent slight speed boost — handled by checking completedQuests in input
        }

        // Notification
        const W = this.scale.width;
        const notify = this.add.text(W / 2, 70, `Quest Complete: ${quest.desc}!`, {
            fontSize: '18px', fill: '#FFD700', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(150);
        this.tweens.add({ targets: notify, y: 50, alpha: 0, duration: 3000, onComplete: () => notify.destroy() });
        this.cameras.main.flash(400, 255, 215, 0);
    }

    // ------------------------------------------------------------------
    //  ABILITIES
    // ------------------------------------------------------------------

    useCrowPower() {
        if (!this.crowReady) return;
        this.crowReady = false;

        const burst = this.add.image(this.player.x, this.player.y, 'crowburst').setDepth(15).setAlpha(0.9);
        this.tweens.add({ targets: burst, scaleX: 3.5, scaleY: 3.5, alpha: 0, duration: 600, onComplete: () => burst.destroy() });

        this.bunnyGroup.getChildren().forEach(bunny => {
            if (Phaser.Math.Distance.Between(this.player.x, this.player.y, bunny.x, bunny.y) < CROW_STUN_RADIUS) {
                this.stunBunny(bunny);
            }
        });

        this.time.delayedCall(CROW_COOLDOWN, () => { this.crowReady = true; });
    }

    stunBunny(bunny) {
        const type = bunny.getData('bunnyType');

        if (type === 'boss') {
            let hp = bunny.getData('bossHP') - 1;
            bunny.setData('bossHP', hp);
            const hpText = this.add.text(bunny.x, bunny.y - 30, `HP: ${hp}/3`, {
                fontSize: '14px', fill: '#FF4444', stroke: '#000', strokeThickness: 2,
            }).setOrigin(0.5).setDepth(15);
            this.tweens.add({ targets: hpText, y: hpText.y - 30, alpha: 0, duration: 1200, onComplete: () => hpText.destroy() });

            if (hp <= 0) {
                this.bossesDefeated[bunny.getData('biome')] = true;
                this.score += 200;
                const dt = this.add.text(bunny.x, bunny.y - 20, 'BOSS DEFEATED! +200', {
                    fontSize: '18px', fill: '#FFD700', stroke: '#000', strokeThickness: 3,
                }).setOrigin(0.5).setDepth(30);
                this.tweens.add({ targets: dt, y: dt.y - 60, alpha: 0, duration: 2000, onComplete: () => dt.destroy() });
                bunny.destroy();
                this.cameras.main.flash(500, 255, 215, 0);
                this.checkQuests();
                return;
            }
        }

        bunny.setData('stunned', true);
        bunny.setVelocity(0, 0);
        bunny.setTexture(bunny.getData('stunnedTextureKey'));

        const stars = this.add.text(bunny.x, bunny.y - 20, '***', { fontSize: '14px', fill: '#FFFF00' }).setDepth(15);
        this.tweens.add({ targets: stars, y: bunny.y - 50, alpha: 0, duration: CROW_STUN_DURATION, onComplete: () => stars.destroy() });

        const old = bunny.getData('stunnedTimer');
        if (old) old.remove();
        const dur = type === 'boss' ? CROW_STUN_DURATION * 0.5 : CROW_STUN_DURATION;
        bunny.setData('stunnedTimer', this.time.delayedCall(dur, () => {
            if (bunny.active) { bunny.setData('stunned', false); bunny.setTexture(bunny.getData('textureKey')); bunny.clearTint(); }
        }));
    }

    useDash() {
        if (!this.dashReady || this.isDashing) return;
        const vx = this.player.body.velocity.x, vy = this.player.body.velocity.y;
        if (vx === 0 && vy === 0) return;

        this.isDashing = true;
        this.dashReady = false;
        this.isInvincible = true;

        const mag = Math.sqrt(vx * vx + vy * vy);
        this.player.setVelocity((vx / mag) * DASH_SPEED, (vy / mag) * DASH_SPEED);

        const trail = this.time.addEvent({
            delay: 30,
            callback: () => {
                const t = this.add.image(this.player.x, this.player.y, 'dashtrail').setDepth(8).setAlpha(0.6);
                this.tweens.add({ targets: t, alpha: 0, scaleX: 0.3, scaleY: 0.3, duration: 300, onComplete: () => t.destroy() });
            },
            repeat: Math.floor(DASH_DURATION / 30),
        });

        this.time.delayedCall(DASH_DURATION, () => {
            this.isDashing = false;
            if (!this.invincibleTimer && !this.activePowerups.shield) this.isInvincible = false;
            trail.remove();
        });
        this.time.delayedCall(DASH_COOLDOWN, () => { this.dashReady = true; });
    }

    // ------------------------------------------------------------------
    //  POWER-UPS
    // ------------------------------------------------------------------

    spawnPowerup() {
        if (this.paused || this.playerDead || this.dialogueActive) return;
        if (this.powerupGroup.getChildren().length >= 2) return;

        const types = ['speed', 'shield', 'magnet', 'freeze', 'extralife'];
        const type = types[Phaser.Math.Between(0, types.length - 1)];
        if (type === 'extralife' && this.lives >= 5) return;

        // Spawn near player
        const angle = Math.random() * Math.PI * 2;
        const dist = 100 + Math.random() * 150;
        const px = this.player.x + Math.cos(angle) * dist;
        const py = this.player.y + Math.sin(angle) * dist;
        if (px < TILE || py < TILE || px > (WORLD_W - 1) * TILE || py > (WORLD_H - 1) * TILE) return;

        const pu = this.powerupGroup.create(px, py, 'powerup_' + type);
        pu.setData('powerupType', type);
        pu.setDepth(8);
        this.tweens.add({ targets: pu, scaleX: 1.3, scaleY: 1.3, yoyo: true, repeat: -1, duration: 500 });
        this.time.delayedCall(8000, () => {
            if (pu.active) this.tweens.add({ targets: pu, alpha: 0, duration: 500, onComplete: () => { if (pu.active) pu.destroy(); } });
        });
    }

    onCollectPowerup(player, pu) {
        const type = pu.getData('powerupType');
        pu.destroy();

        const labels = { speed: 'SPEED!', shield: 'SHIELD!', magnet: 'MAGNET!', freeze: 'FREEZE!', extralife: '+1 LIFE!' };
        const colors = { speed: '#FFDD00', shield: '#44AAFF', magnet: '#FF4444', freeze: '#CCEEFF', extralife: '#FF88CC' };

        const ft = this.add.text(player.x, player.y - 20, labels[type], {
            fontSize: '18px', fill: colors[type], stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(30);
        this.tweens.add({ targets: ft, y: ft.y - 50, alpha: 0, duration: 1000, onComplete: () => ft.destroy() });

        if (type === 'extralife') { this.lives = Math.min(this.lives + 1, 5); this.createHeartDisplay(); return; }

        const durations = { speed: 6000, shield: 5000, magnet: 6000, freeze: 4000 };
        if (this.activePowerups[type] && this.activePowerups[type].timer) this.activePowerups[type].timer.remove();

        const timer = this.time.delayedCall(durations[type], () => {
            delete this.activePowerups[type];
            if (type === 'shield') { if (!this.invincibleTimer) this.isInvincible = false; if (this.shieldSprite) { this.shieldSprite.destroy(); this.shieldSprite = null; } }
            if (type === 'freeze') this.bunnyGroup.getChildren().forEach(b => b.clearTint());
        });
        this.activePowerups[type] = { timer };

        if (type === 'shield') {
            this.isInvincible = true;
            if (!this.shieldSprite) this.shieldSprite = this.add.image(player.x, player.y, 'shield_bubble').setDepth(11).setAlpha(0.6);
        }
        if (type === 'freeze') this.cameras.main.flash(300, 100, 150, 255);
    }

    // ------------------------------------------------------------------
    //  COLLISION HANDLERS
    // ------------------------------------------------------------------

    onCaughtByBunny(player, bunny) {
        if (this.isInvincible || bunny.getData('stunned') || this.dialogueActive) return;

        this.lives--;
        this.comboCount = 0; this.comboMult = 1;
        this.createHeartDisplay();

        if (this.lives <= 0) { this.gameOver(); return; }

        this.isInvincible = true;
        this.player.setTexture('player_stunned');
        this.tweens.add({
            targets: this.player, alpha: 0, yoyo: true, repeat: 7, duration: 200,
            onComplete: () => { if (this.player.active) { this.player.setAlpha(1); this.player.setTexture('player'); } },
        });
        this.cameras.main.flash(300, 255, 0, 0);

        if (this.invincibleTimer) this.invincibleTimer.remove();
        this.invincibleTimer = this.time.delayedCall(INVINCIBLE_DURATION, () => {
            if (!this.activePowerups.shield) this.isInvincible = false;
            this.invincibleTimer = null;
            if (this.player.active) this.player.setTexture('player');
        });
    }

    onCollectEgg(player, egg) {
        const basePoints = egg.getData('points');
        const eggType = egg.getData('eggType');

        if (eggType === 'rotten') {
            this.score = Math.max(0, this.score + basePoints);
            const ft = this.add.text(egg.x, egg.y, `${basePoints}`, { fontSize: '20px', fill: '#88AA22', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(30);
            this.tweens.add({ targets: ft, y: ft.y - 50, alpha: 0, duration: 800, onComplete: () => ft.destroy() });
            this.cameras.main.flash(200, 100, 150, 0);
            this.player.setVelocity(0, 0);
            this.comboCount = 0; this.comboMult = 1;
            egg.destroy();
            return;
        }

        // Combo
        this.comboCount++;
        this.comboMult = this.comboCount >= 2 ? Math.min(this.comboCount, COMBO_MAX) : 1;
        if (this.comboTimer) this.comboTimer.remove();
        this.comboTimer = this.time.delayedCall(COMBO_WINDOW, () => { this.comboCount = 0; this.comboMult = 1; });

        const points = basePoints * this.comboMult;
        this.score += points;
        this.totalEggsCollected++;
        if (eggType === 'golden') this.goldenEggsCollected++;

        const cs = this.comboMult > 1 ? ` x${this.comboMult}` : '';
        const ft = this.add.text(egg.x, egg.y, `+${points}${cs}`, {
            fontSize: this.comboMult > 1 ? '22px' : '18px',
            fill: eggType === 'golden' ? '#FFD700' : eggType === 'chocolate' ? '#D2691E' : '#FFFFFF',
            stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(30);
        this.tweens.add({ targets: ft, y: ft.y - 50, alpha: 0, duration: 800, onComplete: () => ft.destroy() });

        if (eggType === 'golden') this.cameras.main.flash(200, 255, 215, 0);
        else if (eggType === 'chocolate') {
            this.cameras.main.flash(100, 100, 50, 0);
            // Brief speed boost
            if (!this.activePowerups.speed) {
                const t = this.time.delayedCall(2000, () => { delete this.activePowerups.speed; });
                this.activePowerups.speed = { timer: t };
            }
        } else {
            this.cameras.main.flash(100, 0, 200, 0);
        }

        egg.destroy();
        this.checkQuests();
    }

    // ------------------------------------------------------------------
    //  GAME OVER / PAUSE
    // ------------------------------------------------------------------

    gameOver() {
        this.playerDead = true;
        this.player.setVelocity(0, 0);
        this.bunnyGroup.getChildren().forEach(b => b.setVelocity(0, 0));

        const stored = localStorage.getItem('mrkluckLeaderboard');
        let lb = stored ? JSON.parse(stored) : [];
        lb.push({ name: 'MRK', score: this.score, level: this.totalEggsCollected + ' eggs' });
        lb.sort((a, b) => b.score - a.score);
        lb = lb.slice(0, 5);
        localStorage.setItem('mrkluckLeaderboard', JSON.stringify(lb));

        const W = this.scale.width, H = this.scale.height;
        const ov = this.add.graphics().setScrollFactor(0).setDepth(200);
        ov.fillStyle(0x000000, 0.75); ov.fillRect(0, 0, W, H);

        this.add.text(W/2, H/2-90, 'GAME OVER', {
            fontSize: '44px', fontFamily: 'Georgia, serif', fill: '#FF3333', stroke: '#000', strokeThickness: 6,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
        this.add.text(W/2, H/2-30, 'The bunnies caught you!', { fontSize: '18px', fill: '#FFFFCC' }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
        this.add.text(W/2, H/2+10, `Final Score: ${this.score}`, { fontSize: '24px', fill: '#FFD700' }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
        this.add.text(W/2, H/2+50, `Eggs Collected: ${this.totalEggsCollected}`, { fontSize: '18px', fill: '#FFF' }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

        const tap = this.add.text(W/2, H/2+110, 'Tap to return to menu', { fontSize: '16px', fill: '#AAA' }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
        this.tweens.add({ targets: tap, alpha: 0, yoyo: true, repeat: -1, duration: 700 });

        this.time.delayedCall(1000, () => {
            const go = () => this.scene.start('BootScene');
            this.input.keyboard.once('keydown', go);
            this.input.once('pointerdown', go);
        });
    }

    togglePause() {
        this.paused = !this.paused;
        if (this.paused) {
            this.player.setVelocity(0, 0);
            this.bunnyGroup.getChildren().forEach(b => b.setVelocity(0, 0));
            const W = this.scale.width, H = this.scale.height;
            this.pauseOverlay = this.add.graphics().setScrollFactor(0).setDepth(180);
            this.pauseOverlay.fillStyle(0x000000, 0.6); this.pauseOverlay.fillRect(0, 0, W, H);
            this.pausedText = this.add.text(W/2, H/2, 'PAUSED', {
                fontSize: '48px', fontFamily: 'Georgia, serif', fill: '#FFD700', stroke: '#000', strokeThickness: 5,
            }).setOrigin(0.5).setScrollFactor(0).setDepth(181);
        } else {
            if (this.pauseOverlay) { this.pauseOverlay.destroy(); this.pauseOverlay = null; }
            if (this.pausedText) { this.pausedText.destroy(); this.pausedText = null; }
        }
    }

    // ------------------------------------------------------------------
    //  BASEMENTS
    // ------------------------------------------------------------------

    checkStairs() {
        if (this.basementCooldown) return;
        const ptx = Math.floor(this.player.x / TILE), pty = Math.floor(this.player.y / TILE);
        if (ptx < 0 || pty < 0 || ptx >= WORLD_W || pty >= WORLD_H) return;
        if (this.worldData.ground[pty][ptx] === T_STAIRS) {
            const bsmt = this.worldData.basements.find(b => b.stairsTx === ptx && b.stairsTy === pty);
            if (bsmt) this.enterBasement(bsmt);
        }
    }

    enterBasement(bsmt) {
        this.scene.pause();
        this.scene.launch('BasementScene', {
            parentScene: this,
            basementW: Math.max(bsmt.w + 2, 7),
            basementH: Math.max(bsmt.h + 2, 7),
            returnX: this.player.x,
            returnY: this.player.y,
            score: this.score,
        });
    }

    returnFromBasement(data) {
        if (data && data.score !== undefined) this.score = data.score;
        this.scene.resume();
        // Move player slightly off stairs so they don't re-enter
        this.player.y += TILE;
        this.basementCooldown = true;
        this.time.delayedCall(800, () => { this.basementCooldown = false; });
    }

    // ------------------------------------------------------------------
    //  TOUCH CONTROLS
    // ------------------------------------------------------------------

    setupTouchControls() {
        this.touchDir = { x: 0, y: 0 };
        this.touchAnchor = null;
        this.touchMovePtrId = null;  // track which pointer is for movement

        const W = this.scale.width, H = this.scale.height;
        const alpha = 0.45;

        // Action button hit areas (right side) — these pointers should NOT start drag
        this.actionBtnZones = [];

        const makeBtnCircle = (label, bx, by, color, cb) => {
            const bg = this.add.graphics().setScrollFactor(0).setDepth(150).setAlpha(alpha);
            bg.fillStyle(color); bg.fillCircle(bx, by, 24);
            this.add.text(bx, by, label, { fontSize: '10px', fill: '#FFF' }).setOrigin(0.5).setScrollFactor(0).setDepth(151);
            const zone = this.add.zone(bx, by, 48, 48).setInteractive().setScrollFactor(0).setDepth(152);
            zone.on('pointerdown', cb);
            this.actionBtnZones.push({ x: bx, y: by, r: 30 });
        };
        makeBtnCircle('CROW', W - 55, H - 105, 0x882200, () => this.useCrowPower());
        makeBtnCircle('DASH', W - 55, H - 55, 0x884400, () => this.useDash());
        makeBtnCircle('TALK', W - 110, H - 55, 0x224488, () => { if (this.nearestNPC && !this.dialogueActive) this.showDialogue(this.nearestNPC); });

        // Pause button
        const pauseBtn = this.add.text(W / 2 - 55, 24, '|| Pause', {
            fontSize: '11px', fill: '#FFF', backgroundColor: '#222', padding: { x: 3, y: 1 },
        }).setScrollFactor(0).setDepth(101).setInteractive();
        pauseBtn.on('pointerdown', () => this.togglePause());
        this.actionBtnZones.push({ x: W / 2 - 55 + 25, y: 24 + 8, r: 35 });

        // Drag-to-move: finger down anywhere (except action buttons) sets anchor
        this.input.on('pointerdown', (p) => {
            // Ignore if it hit an action button
            for (const z of this.actionBtnZones) {
                const dx = p.x - z.x, dy = p.y - z.y;
                if (Math.sqrt(dx * dx + dy * dy) < z.r) return;
            }
            this.touchAnchor = { x: p.x, y: p.y };
            this.touchMovePtrId = p.id;
            this.touchDir = { x: 0, y: 0 };
        });

        this.input.on('pointermove', (p) => {
            if (this.touchMovePtrId !== p.id || !this.touchAnchor || !p.isDown) return;
            const dx = p.x - this.touchAnchor.x, dy = p.y - this.touchAnchor.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 10) {
                this.touchDir = { x: dx / len, y: dy / len };
            } else {
                this.touchDir = { x: 0, y: 0 };
            }
        });

        this.input.on('pointerup', (p) => {
            if (this.touchMovePtrId === p.id) {
                this.touchAnchor = null;
                this.touchMovePtrId = null;
                this.touchDir = { x: 0, y: 0 };
            }
        });
    }
}


// ===================================================================
//  BASEMENT SCENE
// ===================================================================

class BasementScene extends Phaser.Scene {
    constructor() { super('BasementScene'); }

    init(data) {
        this.parentScene = data.parentScene;
        this.bW = data.basementW || 7;
        this.bH = data.basementH || 7;
        this.returnX = data.returnX;
        this.returnY = data.returnY;
        this.score = data.score || 0;
    }

    preload() { generateAllTextures(this); }

    create() {
        const mapW = this.bW, mapH = this.bH;
        const map = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: mapW, height: mapH });
        const tileset = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0);
        const ground = map.createBlankLayer('bground', tileset);
        const walls = map.createBlankLayer('bwalls', tileset);

        for (let y = 0; y < mapH; y++) {
            for (let x = 0; x < mapW; x++) {
                const isEdge = x === 0 || x === mapW - 1 || y === 0 || y === mapH - 1;
                ground.putTileAt(isEdge ? T_BASEMENT : T_BASEMENT, x, y);
                if (isEdge) walls.putTileAt(W_BASEMENT_WALL, x, y);
            }
        }
        // Stairs back up at bottom center
        const sx = Math.floor(mapW / 2), sy = mapH - 2;
        ground.putTileAt(T_STAIRS, sx, sy);

        walls.setCollisionByExclusion([-1]);

        this.physics.world.setBounds(0, 0, mapW * TILE, mapH * TILE);

        // Center camera
        const camX = (this.scale.width - mapW * TILE) / 2;
        const camY = (this.scale.height - mapH * TILE) / 2;
        this.cameras.main.setScroll(-camX, -camY);

        // Dark background behind the map
        const bg = this.add.graphics();
        bg.fillStyle(0x111118); bg.fillRect(-camX, -camY, this.scale.width, this.scale.height);
        bg.setDepth(-1);

        // Player
        this.player = this.physics.add.sprite(Math.floor(mapW / 2) * TILE + TILE / 2, TILE * 1.5, 'player');
        this.player.body.setSize(16, 16);
        this.player.body.setOffset(10, 14);
        this.player.setCollideWorldBounds(true);
        this.player.setDepth(10);

        this.physics.add.collider(this.player, walls);

        // Scatter a couple of eggs in the basement
        this.eggGroup = this.physics.add.staticGroup();
        const eggCount = Math.max(1, Math.floor((mapW * mapH) / 10));
        for (let i = 0; i < eggCount; i++) {
            const ex = Phaser.Math.Between(1, mapW - 2) * TILE + TILE / 2;
            const ey = Phaser.Math.Between(1, mapH - 2) * TILE + TILE / 2;
            const ci = i % EGG_COLORS.length;
            const isGolden = i === 0;
            const egg = this.eggGroup.create(ex, ey, isGolden ? 'goldenegg' : 'egg' + ci);
            egg.setData('points', isGolden ? GOLDEN_EGG_POINTS : EGG_POINTS);
            egg.setData('eggType', isGolden ? 'golden' : 'normal');
            egg.setDepth(5);
            this.tweens.add({ targets: egg, y: ey - 4, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
        }
        this.physics.add.overlap(this.player, this.eggGroup, this.collectEgg, null, this);

        // Input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D,
        });

        // Touch — simple drag
        this.touchDir = { x: 0, y: 0 };
        this.touchAnchor = null;
        this.input.on('pointerdown', p => { this.touchAnchor = { x: p.x, y: p.y }; });
        this.input.on('pointermove', p => {
            if (!this.touchAnchor || !p.isDown) return;
            const dx = p.x - this.touchAnchor.x, dy = p.y - this.touchAnchor.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 10) { this.touchDir = { x: dx / len, y: dy / len }; } else { this.touchDir = { x: 0, y: 0 }; }
        });
        this.input.on('pointerup', () => { this.touchAnchor = null; this.touchDir = { x: 0, y: 0 }; });

        // Label
        this.add.text(mapW * TILE / 2, 6, '-- Basement --', {
            fontSize: '12px', fill: '#AAAACC',
        }).setOrigin(0.5, 0).setDepth(20);
        this.add.text(sx * TILE + TILE / 2, (sy - 1) * TILE + TILE / 2, 'Exit', {
            fontSize: '11px', fill: '#FFD700',
        }).setOrigin(0.5).setDepth(20);

        this.stairsX = sx; this.stairsY = sy;
    }

    update() {
        const left  = this.cursors.left.isDown  || this.wasd.left.isDown  || this.touchDir.x < -0.3;
        const right = this.cursors.right.isDown || this.wasd.right.isDown || this.touchDir.x > 0.3;
        const up    = this.cursors.up.isDown    || this.wasd.up.isDown    || this.touchDir.y < -0.3;
        const down  = this.cursors.down.isDown  || this.wasd.down.isDown  || this.touchDir.y > 0.3;

        let vx = 0, vy = 0;
        if (left)  vx = -PLAYER_SPEED;
        if (right) vx =  PLAYER_SPEED;
        if (up)    vy = -PLAYER_SPEED;
        if (down)  vy =  PLAYER_SPEED;
        if (vx !== 0 && vy !== 0) { const d = 1 / Math.SQRT2; vx *= d; vy *= d; }
        this.player.setVelocity(vx, vy);
        if (vx < 0) this.player.setFlipX(true);
        if (vx > 0) this.player.setFlipX(false);

        // Check exit stairs
        const ptx = Math.floor(this.player.x / TILE), pty = Math.floor(this.player.y / TILE);
        if (ptx === this.stairsX && pty === this.stairsY) {
            this.exitBasement();
        }
    }

    collectEgg(player, egg) {
        const pts = egg.getData('points');
        this.score += pts;
        const ft = this.add.text(egg.x, egg.y, `+${pts}`, {
            fontSize: '18px', fill: egg.getData('eggType') === 'golden' ? '#FFD700' : '#FFF', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(30);
        this.tweens.add({ targets: ft, y: ft.y - 40, alpha: 0, duration: 700, onComplete: () => ft.destroy() });
        egg.destroy();
    }

    exitBasement() {
        this.parentScene.returnFromBasement({ score: this.score });
        this.scene.stop();
    }
}


// ===================================================================
//  PHASER CONFIG
// ===================================================================

const config = {
    type: Phaser.AUTO,
    backgroundColor: '#111111',
    scene: [BootScene, GameScene, BasementScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: window.innerWidth,
        height: window.innerHeight,
        parent: 'game-container',
    },
    render: { pixelArt: false, antialias: true },
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false },
    },
};

const game = new Phaser.Game(config);
