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

// Castle and special location coordinates
const CASTLE_X = 85, CASTLE_Y = 30;
const HERMIT_X = 92, HERMIT_Y = 8;
const SHADOW_CAMP_X = 30, SHADOW_CAMP_Y = 40;
const POMPOM_X = 15, POMPOM_Y = 55;
const FAIRY_SCOUT_X = 45, FAIRY_SCOUT_Y = 35;

// ===================================================================
//  EXTERNAL GAME DATA (LOADED AT BOOT)
// ===================================================================

let STORY_FLAGS_DEFAULT = {};
let QUEST_DEFS = {};
let NPC_DEFS = [];

async function loadJSON(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
    return response.json();
}

function validateLoadedGameData(storyFlags, questDefs, npcDefs) {
    if (!storyFlags || typeof storyFlags !== 'object' || Array.isArray(storyFlags)) {
        throw new Error('Invalid story_flags.json format');
    }
    if (!questDefs || typeof questDefs !== 'object' || Array.isArray(questDefs)) {
        throw new Error('Invalid quests.json format');
    }
    if (!Array.isArray(npcDefs)) {
        throw new Error('Invalid npcs.json format');
    }
    Object.entries(questDefs).forEach(([questId, def]) => {
        if (!def || typeof def !== 'object') throw new Error(`Quest ${questId} is not an object`);
        if (def.id !== questId) throw new Error(`Quest key/id mismatch: key=${questId}, id=${def.id}`);
        if (def.nextQuest && !questDefs[def.nextQuest]) {
            throw new Error(`Quest ${questId} references missing nextQuest ${def.nextQuest}`);
        }
    });
    const seenNpcIds = new Set();
    npcDefs.forEach((npc, idx) => {
        if (!npc || typeof npc !== 'object') throw new Error(`NPC at index ${idx} is not an object`);
        if (!npc.id) throw new Error(`NPC at index ${idx} is missing id`);
        if (seenNpcIds.has(npc.id)) throw new Error(`Duplicate NPC id ${npc.id}`);
        seenNpcIds.add(npc.id);
        if (!Array.isArray(npc.dialogues)) throw new Error(`NPC ${npc.id} is missing dialogues array`);
        npc.dialogues.forEach((entry, didx) => {
            if (!entry || typeof entry !== 'object') throw new Error(`NPC ${npc.id} dialogue ${didx} is invalid`);
            if (entry.giveQuest && !questDefs[entry.giveQuest]) {
                throw new Error(`NPC ${npc.id} dialogue ${didx} references missing giveQuest ${entry.giveQuest}`);
            }
            if (entry.payQuest && !questDefs[entry.payQuest]) {
                throw new Error(`NPC ${npc.id} dialogue ${didx} references missing payQuest ${entry.payQuest}`);
            }
            const cond = entry.cond || {};
            ['flag', 'flag2', 'notFlag'].forEach(flagKey => {
                if (cond[flagKey] && !(cond[flagKey] in storyFlags)) {
                    throw new Error(`NPC ${npc.id} dialogue ${didx} references missing ${flagKey} ${cond[flagKey]}`);
                }
            });
        });
    });
}

async function loadExternalGameData() {
    const [storyFlags, questDefs, npcDefs] = await Promise.all([
        loadJSON('./data/story_flags.json'),
        loadJSON('./data/quests.json'),
        loadJSON('./data/npcs.json'),
    ]);
    validateLoadedGameData(storyFlags, questDefs, npcDefs);
    STORY_FLAGS_DEFAULT = storyFlags;
    QUEST_DEFS = questDefs;
    NPC_DEFS = npcDefs;
}

// ===================================================================
//  ITEM DEFINITIONS
// ===================================================================

const ITEM_DEFS = {
    hermit_key:       { name: "Hermit's Key",      desc: 'Opens the cave on the mountain path',     stackable: false },
    mountain_pass:    { name: 'Mountain Pass',      desc: 'Toll receipt for the mountain gate',      stackable: false },
    cursed_chocolate: { name: 'Cursed Chocolate',   desc: 'Something is very wrong with this...',    stackable: false },
    shadowcoat_badge: { name: 'Shadowcoat Badge',   desc: 'Marks you as a friend of the shadows',   stackable: false },
    pompom_charm:     { name: 'Pom-pom Charm',      desc: 'A tiny bell that tinkles softly',        stackable: false },
    fairy_dust:       { name: 'Fairy Dust',          desc: 'Sparkles with ancient magic',            stackable: true, max: 5 },
    rope:             { name: 'Rope',                desc: 'Useful for climbing',                    stackable: false },
    lantern:          { name: 'Lantern',             desc: 'Lights up dark places',                  stackable: false },
    dispel_potion:    { name: 'Dispel Potion',       desc: 'Breaks enchantments and illusions',      stackable: false },
    jail_key:         { name: 'Jail Key',            desc: 'Opens the dungeon cells',                stackable: false },
    royal_decree:     { name: 'Royal Decree',        desc: 'An official document with the royal seal', stackable: false },
    ice_crystal:      { name: 'Ice Crystal',         desc: 'A shard of ancient frozen magic',        stackable: true, max: 5 },
    cake_ingredient:  { name: 'Moonberry',           desc: 'A rare berry the baker needs',           stackable: true, max: 3 },
    shadow_map:       { name: 'Shadow Map',          desc: 'Shows the location of the shadow vault', stackable: false },
    nomad_map:        { name: 'Desert Map',          desc: 'Marks a safe route through the eastern dunes', stackable: false },
    witch_eye:        { name: "Witch's Eye",         desc: 'An enchanted seeing stone',              stackable: false },
    golden_feather:   { name: 'Golden Feather',      desc: 'Proof of heroism recognized by all',     stackable: false },
};

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

function talkTargetMatches(target, npcId) {
    if (Array.isArray(target)) return target.includes(npcId);
    return target === npcId;
}


// ===================================================================
//  WORLD GENERATION
// ===================================================================
//  MAP DEFINITIONS
// ===================================================================

const MAP_DEFS = {
    map1: {
        id: 'map1', name: 'Cluckshire',
        width: 150, height: 150,
        biomeFunc: 'getBiome_map1',
        transitions: [
            { tx: 149, ty: 73, w: 1, h: 6, toMap: 'map4', toTx: 2, toTy: 40,
              requires: { item: 'nomad_map', flag: 'pyramid_revealed' },
              failMessage: 'The eastern dunes are impossible to navigate without a map.' },
            { tx: 75, ty: 0, w: 4, h: 1, toMap: 'map2', toTx: 100, toTy: 198,
              requires: { item: 'mountain_pass' },
              failMessage: 'The mountain gate is locked. You need a Mountain Pass!' },
        ],
    },
    map2: {
        id: 'map2', name: 'The Wildlands',
        width: 200, height: 200,
        biomeFunc: 'getBiome_map2',
        transitions: [
            { tx: 100, ty: 199, w: 4, h: 1, toMap: 'map1', toTx: 75, toTy: 2 },
            { tx: 0, ty: 100, w: 1, h: 4, toMap: 'map3', toTx: 198, toTy: 100,
              requires: { flag: 'labyrinth_cleared' },
              failMessage: 'The western pass is sealed by dark magic. Clear the labyrinth first.' },
        ],
    },
    map3: {
        id: 'map3', name: 'The Dark Reaches',
        width: 200, height: 200,
        biomeFunc: 'getBiome_map3',
        transitions: [
            { tx: 199, ty: 100, w: 1, h: 4, toMap: 'map2', toTx: 2, toTy: 100 },
        ],
    },
    map4: {
        id: 'map4', name: 'Eastern Dunes',
        width: 90, height: 80,
        biomeFunc: 'getBiome_map4',
        transitions: [
            { tx: 0, ty: 38, w: 1, h: 6, toMap: 'map1', toTx: 147, toTy: 75 },
        ],
    },
};

// ===================================================================
//  BIOME FUNCTIONS
// ===================================================================

function getBiome_map1(tx, ty) {
    return getBiome(tx, ty);
}

function getBiome_map2(tx, ty) {
    // Wildlands: large desert center, forest north, swamp south, hills west
    const warp = fbm(tx * 0.04 + 500, ty * 0.04 + 500) * 18 - 9;
    const warpX = fbm(tx * 0.05 + 600, ty * 0.05 + 600) * 18 - 9;
    const wy = ty + warp, wx = tx + warpX;

    // Oasis village at center
    const cx = 100, cy = 100;
    const dist = Math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2);
    if (dist < 8) return 'village';
    if (dist < 18) return 'farmland';

    // Pyramid area
    if (Math.sqrt((tx - 150) ** 2 + (ty - 80) ** 2) < 10) return 'desert';

    const wn = fbm(tx * 0.07 + 150, ty * 0.07 + 150);
    if (wn < 0.15 && dist > 20 && dist < 60) return 'water';

    if (wy < 40) return 'forest';
    if (wy > 160) return 'swamp';
    if (wx < 40) return 'hills';
    if (wx > 140) return 'desert';

    const bn = fbm(tx * 0.06 + 200, ty * 0.06 + 200);
    if (wy < 60) return bn > 0.45 ? 'forest' : 'farmland';
    if (wy > 140) return bn > 0.45 ? 'swamp' : 'farmland';
    if (wx > 120) return bn > 0.42 ? 'desert' : 'farmland';

    return 'desert';
}

function getBiome_map3(tx, ty) {
    // Dark Reaches: dense forest, fairy glen, witch territory
    const warp = fbm(tx * 0.04 + 800, ty * 0.04 + 800) * 18 - 9;
    const warpX = fbm(tx * 0.05 + 900, ty * 0.05 + 900) * 18 - 9;
    const wy = ty + warp, wx = tx + warpX;

    // Fairy glen at center-west
    const fx = 60, fy = 80;
    if (Math.sqrt((tx - fx) ** 2 + (ty - fy) ** 2) < 12) return 'farmland'; // fairy meadow

    // Hollow tree area
    if (Math.sqrt((tx - 50) ** 2 + (ty - 50) ** 2) < 6) return 'forest';

    // Witch's lair area
    if (Math.sqrt((tx - 40) ** 2 + (ty - 150) ** 2) < 8) return 'swamp';

    const wn = fbm(tx * 0.07 + 250, ty * 0.07 + 250);
    if (wn < 0.12 && tx > 20 && ty > 20) return 'water';

    if (wy < 50) return 'forest';
    if (wy > 150) return 'swamp';
    if (wx > 150) return 'hills';

    const bn = fbm(tx * 0.06 + 300, ty * 0.06 + 300);
    if (wy < 70) return bn > 0.4 ? 'forest' : 'farmland';
    if (wy > 130) return bn > 0.4 ? 'swamp' : 'forest';

    return 'forest';
}

function getBiome_map4(tx, ty) {
    const px = 62, py = 40;
    if (Math.sqrt((tx - px) ** 2 + (ty - py) ** 2) < 12) return 'desert';
    const n = fbm(tx * 0.08 + 1200, ty * 0.08 + 1200);
    if (n < 0.08) return 'hills';
    return 'desert';
}

function getBiome(tx, ty) {
    const dx = tx - V1_X, dy = ty - V1_Y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Villages and castle are hard-set
    if (dist < 10) return 'village';
    if (Math.sqrt((tx - V2_X) ** 2 + (ty - V2_Y) ** 2) < 7) return 'village';
    if (Math.sqrt((tx - CASTLE_X) ** 2 + (ty - CASTLE_Y) ** 2) < 12) return 'village';
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
    { x:  7, y:  2, w: 4, h: 3                   },  // Hospital
];
const V2_BUILDINGS = [
    { x: -4, y: -4, w: 4, h: 3, basement: true  },
    { x:  1, y: -4, w: 4, h: 3                   },
    { x: -3, y:  2, w: 3, h: 3                   },
    { x:  2, y:  2, w: 4, h: 3                   },
];
// Castle — larger stone buildings near CASTLE_X, CASTLE_Y
const CASTLE_BUILDINGS = [
    { x: -5, y: -4, w: 10, h: 8, interior: 'castle_throne' },  // Main hall (throne room)
    { x: -7, y: -2, w: 3, h: 4, interior: 'jail_cells', requires: { item: 'jail_key' }, failMessage: 'The heavy iron door is locked tight. You hear faint scratching from below...' },
    { x:  5, y: -2, w: 3, h: 4                              },  // Right tower
];
// Shadowcoat camp — small structures
const SHADOW_BUILDINGS = [
    { x: -2, y: -2, w: 4, h: 3 },
    { x:  2, y:  1, w: 3, h: 3, interior: 'shadow_vault' },
];
// Pom-pom village — tiny huts
const POMPOM_BUILDINGS = [
    { x: -2, y: -1, w: 3, h: 2 },
    { x:  1, y:  1, w: 2, h: 2 },
];

function generateWorld(mapId) {
    mapId = mapId || 'map1';
    const mapDef = MAP_DEFS[mapId];
    const mW = mapDef ? mapDef.width : WORLD_W;
    const mH = mapDef ? mapDef.height : WORLD_H;
    const biomeFuncName = mapDef ? mapDef.biomeFunc : 'getBiome_map1';
    const biomeFunc = { getBiome_map1, getBiome_map2, getBiome_map3, getBiome_map4 }[biomeFuncName] || getBiome;

    const ground = [], walls = [], biomeMap = [];
    for (let y = 0; y < mH; y++) {
        ground[y] = []; walls[y] = []; biomeMap[y] = [];
        for (let x = 0; x < mW; x++) {
            const b = biomeFunc(x, y);
            biomeMap[y][x] = b;
            ground[y][x] = groundTileForBiome(b, x, y);
            walls[y][x] = wallTileForBiome(b, x, y);
        }
    }

    // Place buildings and record basement/interior locations
    const basements = [];
    const interiors = [];
    const placeBuildings = (cx, cy, list) => {
        list.forEach(b => {
            for (let dy = 0; dy < b.h; dy++) {
                for (let dx = 0; dx < b.w; dx++) {
                    const tx = cx + b.x + dx, ty = cy + b.y + dy;
                    if (tx < 0 || ty < 0 || tx >= mW || ty >= mH) continue;
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
            if (b.interior) {
                const sx = cx + b.x + 1, sy = cy + b.y + 1;
                if (sx >= 0 && sy >= 0 && sx < mW && sy < mH) {
                    ground[sy][sx] = T_STAIRS;
                    walls[sy][sx] = -1;
                    const entry = { stairsTx: sx, stairsTy: sy, interiorId: b.interior };
                    if (b.requires) entry.requires = b.requires;
                    if (b.failMessage) entry.failMessage = b.failMessage;
                    interiors.push(entry);
                }
            } else if (b.basement) {
                const sx = cx + b.x + 1, sy = cy + b.y + 1;
                if (sx >= 0 && sy >= 0 && sx < mW && sy < mH) {
                    ground[sy][sx] = T_STAIRS;
                    walls[sy][sx] = -1;
                    basements.push({ stairsTx: sx, stairsTy: sy, w: b.w, h: b.h });
                }
            }
        });
    };

    // Map-specific buildings, plazas, and roads
    if (mapId === 'map1') {
        placeBuildings(V1_X, V1_Y, V1_BUILDINGS);
        placeBuildings(V2_X, V2_Y, V2_BUILDINGS);
        placeBuildings(CASTLE_X, CASTLE_Y, CASTLE_BUILDINGS);
        // Shadowcoat camp in western forest (early story arc)
        placeBuildings(SHADOW_CAMP_X, SHADOW_CAMP_Y, SHADOW_BUILDINGS);
        // Hermit cave
        placeBuildings(HERMIT_X, HERMIT_Y, [
            { x: -2, y: -1, w: 4, h: 3, interior: 'hermit_cave',
              requires: { flag: 'found_hermit_cave' }, failMessage: 'The cave is sealed. You need a key.' },
        ]);

        // Castle plaza
        for (let dy = -6; dy <= 5; dy++) {
            for (let dx = -8; dx <= 8; dx++) {
                const tx = CASTLE_X + dx, ty = CASTLE_Y + dy;
                if (tx >= 0 && ty >= 0 && tx < mW && ty < mH && walls[ty][tx] === -1 && ground[ty][tx] !== T_WOOD) {
                    ground[ty][tx] = T_COBBLE;
                }
            }
        }
        // Village plazas
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
        for (let i = -9; i <= 9; i++) {
            const tx1 = V1_X + i, ty1 = V1_Y;
            const tx2 = V1_X, ty2 = V1_Y + i;
            if (tx1 >= 0 && tx1 < mW && walls[ty1][tx1] < 0) ground[ty1][tx1] = T_COBBLE;
            if (ty2 >= 0 && ty2 < mH && walls[ty2][tx2] < 0) ground[ty2][tx2] = T_COBBLE;
        }
        for (let x = V2_X; x <= V1_X; x++) {
            if (walls[V1_Y][x] < 0) ground[V1_Y][x] = T_STONE;
            if (V1_Y + 1 < mH && walls[V1_Y + 1][x] < 0) ground[V1_Y + 1][x] = T_STONE;
        }
        for (let i = 0; i < 35; i++) {
            const n = V1_Y - 10 - i, s = V1_Y + 10 + i, e = V1_X + 10 + i;
            if (n >= 0) {
                if (walls[n][V1_X] < 0) ground[n][V1_X] = T_STONE;
                if (V1_X + 1 < mW && walls[n][V1_X + 1] < 0) ground[n][V1_X + 1] = T_STONE;
            }
            if (s < mH) {
                if (walls[s][V1_X] < 0) ground[s][V1_X] = T_STONE;
                if (V1_X + 1 < mW && walls[s][V1_X + 1] < 0) ground[s][V1_X + 1] = T_STONE;
            }
            if (e < mW) {
                if (walls[V1_Y][e] < 0) ground[V1_Y][e] = T_STONE;
                if (V1_Y + 1 < mH && walls[V1_Y + 1][e] < 0) ground[V1_Y + 1][e] = T_STONE;
            }
        }
        // East road toward nomad dunes route (to map4 transition)
        const eastRoadY = 75;
        for (let x = 130; x < mW; x++) {
            if (walls[eastRoadY][x] < 0) ground[eastRoadY][x] = T_DIRT;
            if (eastRoadY + 1 < mH && walls[eastRoadY + 1][x] < 0) ground[eastRoadY + 1][x] = T_DIRT;
        }
        // Road to castle
        for (let y = CASTLE_Y + 6; y <= V1_Y - 10; y++) {
            const rx = V1_X + Math.round((CASTLE_X - V1_X) * (V1_Y - 10 - y) / (V1_Y - 10 - CASTLE_Y - 6));
            if (rx >= 0 && rx < mW && y >= 0 && y < mH) {
                if (walls[y][rx] < 0) ground[y][rx] = T_STONE;
                if (rx + 1 < mW && walls[y][rx + 1] < 0) ground[y][rx + 1] = T_STONE;
            }
        }
        // Road from castle north to mountain gate (transition at tx:75..78, ty:0)
        const gateX = 76; // center of the 4-tile-wide gate
        for (let y = 0; y < CASTLE_Y - 5; y++) {
            // Curve road from gate (x=76) toward castle (x=85)
            const t = y / (CASTLE_Y - 5);
            const roadCx = Math.round(gateX + (CASTLE_X - gateX) * t * t);
            for (let dx = -1; dx <= 2; dx++) {
                const rx = roadCx + dx;
                if (rx >= 0 && rx < mW && y >= 0 && y < mH) {
                    walls[y][rx] = -1;  // clear any trees/rocks
                    ground[y][rx] = T_STONE;
                }
            }
        }
        // Gate structure: stone walls flanking the entrance
        for (let dy = 0; dy < 3; dy++) {
            // Left wall pillar
            if (gateX - 2 >= 0 && dy < mH) { walls[dy][gateX - 2] = W_STONE_WALL; }
            // Right wall pillar
            if (gateX + 3 < mW && dy < mH) { walls[dy][gateX + 3] = W_STONE_WALL; }
        }
        // Stone wall extending outward from gate to make it visible
        for (let dx = -6; dx <= 7; dx++) {
            const gx = gateX + dx;
            if (gx >= 0 && gx < mW && (dx < -1 || dx > 2)) {
                walls[0][gx] = W_STONE_WALL;
                if (1 < mH) walls[1][gx] = W_STONE_WALL;
            }
        }
        // Cobblestone pad in front of the gate
        for (let dy = 3; dy <= 5; dy++) {
            for (let dx = -3; dx <= 4; dx++) {
                const gx = gateX + dx, gy = dy;
                if (gx >= 0 && gx < mW && gy < mH && walls[gy][gx] < 0) {
                    ground[gy][gx] = T_COBBLE;
                }
            }
        }
    } else if (mapId === 'map2') {
        // Wildlands: oasis village and Pom-pom region
        placeBuildings(POMPOM_X, POMPOM_Y, POMPOM_BUILDINGS);
        // Oasis village at center
        const oasisX = 100, oasisY = 100;
        placeBuildings(oasisX, oasisY, [
            { x: -4, y: -3, w: 4, h: 3 },
            { x:  1, y: -3, w: 4, h: 3 },
            { x: -3, y:  2, w: 3, h: 3, basement: true },
        ]);
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                const tx = oasisX + dx, ty = oasisY + dy;
                if (tx >= 0 && ty >= 0 && tx < mW && ty < mH && walls[ty][tx] < 0) ground[ty][tx] = T_COBBLE;
            }
        }
        // Mountain gate entrance on south edge (transition at tx:100..103, ty:199)
        const m2GateX = 101; // center of the 4-tile-wide gate
        for (let y = mH - 8; y < mH; y++) {
            for (let dx = -1; dx <= 2; dx++) {
                const rx = m2GateX + dx;
                if (rx >= 0 && rx < mW) {
                    walls[y][rx] = -1;
                    ground[y][rx] = T_STONE;
                }
            }
        }
        // Gate walls flanking the south entrance
        for (let dy = 0; dy < 3; dy++) {
            const gy = mH - 1 - dy;
            if (m2GateX - 2 >= 0) walls[gy][m2GateX - 2] = W_STONE_WALL;
            if (m2GateX + 3 < mW) walls[gy][m2GateX + 3] = W_STONE_WALL;
        }
        for (let dx = -6; dx <= 7; dx++) {
            const gx = m2GateX + dx;
            if (gx >= 0 && gx < mW && (dx < -1 || dx > 2)) {
                walls[mH - 1][gx] = W_STONE_WALL;
                walls[mH - 2][gx] = W_STONE_WALL;
            }
        }
        // Cobblestone pad inside the gate
        for (let dy = 3; dy <= 5; dy++) {
            for (let dx = -3; dx <= 4; dx++) {
                const gx = m2GateX + dx, gy = mH - 1 - dy;
                if (gx >= 0 && gx < mW && gy >= 0 && walls[gy][gx] < 0) {
                    ground[gy][gx] = T_COBBLE;
                }
            }
        }
        // Road from south gate north toward oasis
        for (let y = oasisY + 3; y < mH - 8; y++) {
            const rx = oasisX + Math.round((m2GateX - oasisX) * (y - oasisY - 3) / (mH - 8 - oasisY - 3));
            if (rx >= 0 && rx < mW) {
                if (walls[y][rx] < 0) ground[y][rx] = T_STONE;
                if (rx + 1 < mW && walls[y][rx + 1] < 0) ground[y][rx + 1] = T_STONE;
            }
        }
        // Western pass entrance (transition at tx:0, ty:100..103)
        for (let dy = -1; dy <= 2; dy++) {
            for (let dx = 0; dx < 6; dx++) {
                const gy = 101 + dy;
                if (gy >= 0 && gy < mH && dx < mW) {
                    walls[gy][dx] = -1;
                    ground[gy][dx] = T_STONE;
                }
            }
        }
        // Pyramid now lives in map4 (Eastern Dunes).
    } else if (mapId === 'map3') {
        // Dark Reaches: fairy glen structures, witch lair
        placeBuildings(60, 80, [
            { x: -3, y: -2, w: 6, h: 4, interior: 'fairy_glen' },
        ]);
        // Hollow tree — large circular area
        placeBuildings(50, 50, [
            { x: -4, y: -4, w: 8, h: 8, interior: 'hollow_tree' },
        ]);
        // Witch lair
        placeBuildings(40, 150, [
            { x: -3, y: -3, w: 6, h: 6, interior: 'witch_lair' },
        ]);
    } else if (mapId === 'map4') {
        const pyramidX = 62, pyramidY = 40;
        placeBuildings(pyramidX, pyramidY, [
            { x: -6, y: -6, w: 12, h: 12, interior: 'labyrinth_f1' },
        ]);
        // Entry path from west edge toward pyramid
        for (let x = 0; x <= pyramidX - 8; x++) {
            const y = 40;
            if (y >= 0 && y < mH && walls[y][x] < 0) ground[y][x] = T_DIRT;
            if (y + 1 < mH && walls[y + 1][x] < 0) ground[y + 1][x] = T_DIRT;
        }
    }

    // Clear walls on all road/path tiles
    for (let y = 0; y < mH; y++) {
        for (let x = 0; x < mW; x++) {
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
            const tx = Phaser.Math.Between(5, mW - 5);
            const ty = Phaser.Math.Between(5, mH - 5);
            if (biomeMap[ty][tx] === biome && walls[ty][tx] < 0 && ground[ty][tx] !== T_WATER) {
                eggs.push({ tx, ty, type: types[placed] });
                placed++;
            }
            attempts++;
        }
    });

    // Scale egg/bunny counts for larger maps
    const mapScale = (mW * mH) / (150 * 150);

    // Generate bunny positions
    const bunnies = [];
    const isAdvancedMap = mapId === 'map2' || mapId === 'map3';
    const bunnyBiomeCfg = {
        farmland: { normal: 3, fast: 0, patrol: 0, boss: false, cursed: isAdvancedMap ? 1 : 0, shadow: 0 },
        forest:   { normal: 2, fast: 3, patrol: 1, boss: false, cursed: isAdvancedMap ? 2 : 0, shadow: isAdvancedMap ? 1 : 0 },
        desert:   { normal: 2, fast: 1, patrol: 1, boss: true,  cursed: isAdvancedMap ? 2 : 0, shadow: isAdvancedMap ? 1 : 0 },
        swamp:    { normal: 1, fast: 1, patrol: 3, boss: false, cursed: isAdvancedMap ? 3 : 0, shadow: 0 },
        snow:     { normal: 2, fast: 2, patrol: 1, boss: true,  cursed: 0, shadow: 0 },
        hills:    { normal: 2, fast: 1, patrol: 0, boss: false, cursed: isAdvancedMap ? 1 : 0, shadow: isAdvancedMap ? 1 : 0 },
    };
    Object.entries(bunnyBiomeCfg).forEach(([biome, cfg]) => {
        const types = [];
        const scale = Math.ceil(mapScale);
        for (let i = 0; i < cfg.normal * scale; i++) types.push('normal');
        for (let i = 0; i < cfg.fast * scale; i++) types.push('fast');
        for (let i = 0; i < cfg.patrol * scale; i++) types.push('patrol');
        for (let i = 0; i < (cfg.cursed || 0) * scale; i++) types.push('cursed');
        for (let i = 0; i < (cfg.shadow || 0) * scale; i++) types.push('shadow');
        if (cfg.boss) types.push('boss');
        let placed = 0, attempts = 0;
        while (placed < types.length && attempts < 2000) {
            const tx = Phaser.Math.Between(5, mW - 5);
            const ty = Phaser.Math.Between(5, mH - 5);
            if (biomeMap[ty][tx] === biome && walls[ty][tx] < 0 && ground[ty][tx] !== T_WATER) {
                bunnies.push({ tx, ty, type: types[placed], biome });
                placed++;
            }
            attempts++;
        }
    });

    return { ground, walls, biomeMap, eggs, bunnies, basements, interiors, mapWidth: mW, mapHeight: mH };
}


// ===================================================================
//  NPC DEFINITIONS
// ===================================================================

/* NPC data moved to data/npcs.json */

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
    // Cursed rabbit — dark red/purple with glowing eyes
    createBunnyTexture(scene, 'cursed_rabbit', 0x661133, 0x882244, 0xCC3355, 0xFF0000);
    createBunnyTexture(scene, 'cursed_rabbit_stunned', 0x442233, 0x553344, 0x884466, 0x6666AA);
    // Shadow thief — dark gray/black, sneaky
    createBunnyTexture(scene, 'shadow_thief', 0x222222, 0x333333, 0x555555, 0xFFDD00);
    createBunnyTexture(scene, 'shadow_thief_stunned', 0x1A1A1A, 0x2A2A2A, 0x444444, 0x6666AA);
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
    } else if (hatType === 'crown') {
        g.fillStyle(0xFFD700); g.fillRect(s/2-7, s/2-14, 14, 6);
        g.fillTriangle(s/2-7, s/2-14, s/2-7, s/2-19, s/2-3, s/2-14);
        g.fillTriangle(s/2, s/2-14, s/2, s/2-20, s/2+1, s/2-14);
        g.fillTriangle(s/2+7, s/2-14, s/2+7, s/2-19, s/2+3, s/2-14);
        g.fillStyle(0xFF0000); g.fillCircle(s/2, s/2-12, 1.5);
    } else if (hatType === 'tiara') {
        g.fillStyle(0xFFAAAA); g.fillEllipse(s/2, s/2-11, 16, 5);
        g.fillStyle(0xFFD700); g.fillTriangle(s/2-2, s/2-13, s/2+2, s/2-13, s/2, s/2-18);
        g.fillStyle(0xFF88CC); g.fillCircle(s/2, s/2-15, 1);
    } else if (hatType === 'bandana') {
        g.fillStyle(hatColor); g.fillEllipse(s/2, s/2-9, 18, 6);
        g.fillTriangle(s/2+6, s/2-8, s/2+14, s/2-4, s/2+6, s/2-6);
    } else if (hatType === 'pompom_hat') {
        g.fillStyle(hatColor); g.fillEllipse(s/2, s/2-10, 14, 5);
        g.fillCircle(s/2, s/2-15, 4);
    } else if (hatType === 'fairy_wings') {
        g.fillStyle(hatColor); g.setAlpha(0.6);
        g.fillEllipse(s/2-8, s/2-2, 8, 12);
        g.fillEllipse(s/2+8, s/2-2, 8, 12);
        g.setAlpha(1.0);
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
            'I: Inventory  |  Q: Quest Log  |  ESC: Menu',
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

        this.add.text(W/2, H-90, `v${APP_VERSION}`, { fontSize: '12px', fill: '#888' }).setOrigin(0.5);

        // Check for save data (fall back to old save key for backwards compat)
        const hasAutosave = !!localStorage.getItem('mrkluckAutosave') || !!localStorage.getItem('mrkluckSave');
        const autosaveKey = localStorage.getItem('mrkluckAutosave') ? 'mrkluckAutosave' : 'mrkluckSave';
        const hasManualSave = !!localStorage.getItem('mrkluckSave');

        // Boot menu buttons
        const btnStyle = { fontSize: '16px', fontFamily: 'Arial', fill: '#EEEEEE', backgroundColor: '#00000088', padding: { x: 14, y: 6 } };
        const btnY = H - 42;
        const btnZones = [];

        const startFreshGame = () => {
            this.game.loop.targetFps = 60;
            // New Game should never resume autosave state.
            localStorage.removeItem('mrkluckAutosave');
            this.scene.start('GameScene', {
                score: 0,
                lives: 3,
                totalEggsCollected: 0,
                goldenEggsCollected: 0,
                bossesDefeated: {},
                storyFlags: {},
                inventory: [],
                activeQuests: [],
                completedQuests: {},
                currentMapId: 'map1',
                defeatedEnemies: 0,
                basementVisitTimes: {},
                wieldedItemId: null,
                spawnTx: null,
                spawnTy: null,
            });
        };

        // New Game button
        const newBtn = this.add.text(W/2, btnY, '[ New Game ]', { ...btnStyle, fill: '#FFD700' })
            .setOrigin(0.5).setInteractive({ useHandCursor: true });
        newBtn.on('pointerdown', startFreshGame);
        newBtn.on('pointerover', () => newBtn.setStyle({ fill: '#FFFFFF' }));
        newBtn.on('pointerout', () => newBtn.setStyle({ fill: '#FFD700' }));
        btnZones.push(newBtn);

        if (hasAutosave) {
            // Shift New Game left to make room
            newBtn.setX(W/2 - 100);
            const contBtn = this.add.text(W/2 + 100, btnY, '[ Continue ]', { ...btnStyle, fill: '#88FF88' })
                .setOrigin(0.5).setInteractive({ useHandCursor: true });
            contBtn.on('pointerdown', () => {
                this.game.loop.targetFps = 60;
                this.scene.start('GameScene', JSON.parse(localStorage.getItem(autosaveKey)));
            });
            contBtn.on('pointerover', () => contBtn.setStyle({ fill: '#FFFFFF' }));
            contBtn.on('pointerout', () => contBtn.setStyle({ fill: '#88FF88' }));
            btnZones.push(contBtn);
        }

        if (hasManualSave) {
            const loadBtn = this.add.text(W/2, btnY - 36, '[ Load Save ]', { ...btnStyle, fill: '#AADDFF' })
                .setOrigin(0.5).setInteractive({ useHandCursor: true });
            loadBtn.on('pointerdown', () => {
                this.game.loop.targetFps = 60;
                this.scene.start('GameScene', JSON.parse(localStorage.getItem('mrkluckSave')));
            });
            loadBtn.on('pointerover', () => loadBtn.setStyle({ fill: '#FFFFFF' }));
            loadBtn.on('pointerout', () => loadBtn.setStyle({ fill: '#AADDFF' }));
            btnZones.push(loadBtn);
        }

        // Throttle CPU — boot screen is mostly static
        this.game.loop.targetFps = 15;

        // SPACE starts new game
        this.input.keyboard.once('keydown-SPACE', startFreshGame);
    }
}


// ===================================================================
//  GAME SCENE
// ===================================================================

class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }

    _migrateQuestStateForCurrentData() {
        // Keep saves compatible when quest definitions shift across releases.
        if (this.storyFlags.found_cursed_chocolate && !this.storyFlags.hermit_quest_done) {
            this.storyFlags.hermit_quest_done = true;
        }
    }

    init(data) {
        // Persistent state (preserved across map transitions)
        this.score = (data && data.score) || 0;
        this.lives = (data && data.lives) || 3;
        this.totalEggsCollected = (data && data.totalEggsCollected) || 0;
        this.goldenEggsCollected = (data && data.goldenEggsCollected) || 0;
        this.bossesDefeated = (data && data.bossesDefeated) || {};
        const defaultFlags = JSON.parse(JSON.stringify(STORY_FLAGS_DEFAULT));
        this.storyFlags = { ...defaultFlags, ...((data && data.storyFlags) || {}) };
        this.inventory = (data && data.inventory) || [];
        this.completedQuests = (data && data.completedQuests) || {};
        const savedActiveQuests = (data && data.activeQuests) || [];
        this.activeQuests = savedActiveQuests
            .map(q => (q && q.id && QUEST_DEFS[q.id]) ? { ...QUEST_DEFS[q.id] } : q)
            .filter(q => q && !this.completedQuests[q.id]);
        this.currentMapId = (data && data.currentMapId) || 'map1';
        this.defeatedEnemies = (data && data.defeatedEnemies) || 0;

        // Spawn position (for map transitions)
        this.spawnTx = (data && data.spawnTx) || null;
        this.spawnTy = (data && data.spawnTy) || null;

        // Transient state (reset each scene start)
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

        this.activePowerups = {};
        this.shieldSprite = null;

        // Dialogue state
        this.dialogueActive = false;
        this.dialogueNPC = null;
        this.dialogueQueue = [];
        this.dialogueLineIdx = 0;
        this.dialogueEntry = null;
        this.typewriterTimer = null;
        this.typewriterDone = false;
        this.currentFullText = '';

        // Inventory UI state
        this.inventoryOpen = false;
        this.selectedItem = null;
        this.wieldedItemId = (data && data.wieldedItemId) || null;
        // Quest log UI state
        this.questLogOpen = false;
        this.questLogPanel = null;
        this.questLogTitle = null;
        this.questLogTexts = [];

        this.lastVelocity = { x: 0, y: 0 };
        this.playerOnIce = false;

        this.basementCooldown = false;
        this.basementVisitTimes = (data && data.basementVisitTimes) || {};

        this._migrateQuestStateForCurrentData();
        this.activeQuests.forEach(q => this._ensureQuestRuntimeStart(q));
    }

    _ensureQuestRuntimeStart(q) {
        if (!q) return;
        if (q.type === 'eggs' && q.startEggs === undefined) q.startEggs = this.totalEggsCollected;
        if (q.type === 'golden' && q.startGoldenEggs === undefined) q.startGoldenEggs = this.goldenEggsCollected;
        if (q.type === 'defeat_n' && q.startDefeatedEnemies === undefined) q.startDefeatedEnemies = this.defeatedEnemies;
    }

    _getQuestProgress(q) {
        if (!q) return 0;
        this._ensureQuestRuntimeStart(q);
        if (q.type === 'eggs') return Math.max(0, this.totalEggsCollected - (q.startEggs || 0));
        if (q.type === 'golden') return Math.max(0, this.goldenEggsCollected - (q.startGoldenEggs || 0));
        if (q.type === 'defeat_n') return Math.max(0, this.defeatedEnemies - (q.startDefeatedEnemies || 0));
        return 0;
    }

    preload() { generateAllTextures(this); }

    create() {
        // Generate world data for current map
        this.worldData = generateWorld(this.currentMapId);
        const curW = this.worldData.mapWidth;
        const curH = this.worldData.mapHeight;
        this.mapWidth = curW;
        this.mapHeight = curH;

        // Build tilemap
        const map = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: curW, height: curH });
        const tileset = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0);

        this.groundLayer = map.createBlankLayer('ground', tileset);
        this.wallLayer = map.createBlankLayer('walls', tileset);

        for (let y = 0; y < curH; y++) {
            for (let x = 0; x < curW; x++) {
                this.groundLayer.putTileAt(this.worldData.ground[y][x], x, y);
                if (this.worldData.walls[y][x] >= 0) {
                    this.wallLayer.putTileAt(this.worldData.walls[y][x], x, y);
                }
            }
        }

        this.groundLayer.setCollision([T_WATER]);
        this.wallLayer.setCollisionByExclusion([-1]);

        // Physics world bounds
        this.physics.world.setBounds(0, 0, curW * TILE, curH * TILE);

        // Player — spawn at transition target or default location
        let spawnX, spawnY;
        if (this.spawnTx !== null && this.spawnTy !== null) {
            spawnX = this.spawnTx * TILE + TILE / 2;
            spawnY = this.spawnTy * TILE + TILE / 2;
        } else if (this.currentMapId === 'map1') {
            spawnX = V1_X * TILE + TILE / 2;
            spawnY = V1_Y * TILE + TILE / 2;
        } else {
            spawnX = Math.floor(curW / 2) * TILE + TILE / 2;
            spawnY = Math.floor(curH / 2) * TILE + TILE / 2;
        }
        this.player = this.physics.add.sprite(spawnX, spawnY, 'player');
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
            if (b.type === 'fast')          { key = 'fast_bunny'; speed = 130; texKey = 'fast_bunny'; stunKey = 'fast_bunny_stunned'; }
            else if (b.type === 'patrol')  { key = 'patrol_bunny'; speed = 80; texKey = 'patrol_bunny'; stunKey = 'patrol_bunny_stunned'; }
            else if (b.type === 'boss')    { key = 'boss_bunny'; speed = 70; texKey = 'boss_bunny'; stunKey = 'boss_bunny_stunned'; }
            else if (b.type === 'cursed')  { key = 'cursed_rabbit'; speed = 150; texKey = 'cursed_rabbit'; stunKey = 'cursed_rabbit_stunned'; }
            else if (b.type === 'shadow')  { key = 'shadow_thief'; speed = 110; texKey = 'shadow_thief'; stunKey = 'shadow_thief_stunned'; }
            else                           { key = 'bunny'; speed = 90; texKey = 'bunny'; stunKey = 'bunny_stunned'; }
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
            if (b.type === 'cursed') {
                bunny.setTint(0xFF4444);
                bunny.setScale(1.1);
            }
        });

        // Overlaps
        this.physics.add.overlap(this.player, this.eggGroup, this.onCollectEgg, null, this);
        this.physics.add.overlap(this.player, this.bunnyGroup, this.onCaughtByBunny, null, this);
        this.physics.add.overlap(this.player, this.powerupGroup, this.onCollectPowerup, null, this);

        // Spawn NPCs
        this.npcs = [];
        NPC_DEFS.filter(d => !d.mapId || d.mapId === this.currentMapId).forEach(d => {
            if (d.spawnCond && !this.checkCondition(d.spawnCond)) return;
            if (d.tx < 0 || d.ty < 0 || d.tx >= this.mapWidth || d.ty >= this.mapHeight) return;
            const npc = this.add.image(d.tx * TILE + TILE/2, d.ty * TILE + TILE/2, 'npc_' + d.id);
            npc.setDepth(8);
            npc.setData('npcDef', d);
            npc.setData('dialogueIdx', 0);
            this.npcs.push(npc);
            this.tweens.add({ targets: npc, y: npc.y - 3, yoyo: true, repeat: -1, duration: 800 + Math.random() * 400, ease: 'Sine.easeInOut' });
        });

        // Camera
        this.cameras.main.setBounds(0, 0, this.mapWidth * TILE, this.mapHeight * TILE);
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
        this.inventoryKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
        this.useItemKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.U);
        this.saveKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F5);
        this.questLogKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
        this.escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

        this.setupTouchControls();

        // HUD
        this.createHUD();
        this.createMinimap();
        this.createDialogueUI();
        this.createInventoryUI();

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
        const W = this.scale.width, H = this.scale.height;
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
        this.questText = this.add.text(8, 44, '', { fontSize: '11px', fill: '#000000', lineSpacing: 2 }).setScrollFactor(0).setDepth(101);

        // Mobile-friendly wielded item indicator near action buttons
        this.wieldedText = this.add.text(W - 165, H - 20, '', {
            fontSize: '11px', fill: '#FFD700', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0, 1).setScrollFactor(0).setDepth(153);

        // Menu button (top-right)
        this.menuOpen = false;
        this.menuBtn = this.add.text(W - 36, 8, '\u2630', {
            fontSize: '22px', fill: '#FFFFFF', backgroundColor: '#00000066', padding: { x: 6, y: 2 },
        }).setScrollFactor(0).setDepth(102).setInteractive({ useHandCursor: true });
        this.menuBtn.on('pointerdown', () => { if (!this.menuOpen) this.toggleMenu(); });
        this.menuOverlay = null;
        this.menuItems = [];
        this.menuCloseBtn = null;
    }

    toggleMenu() {
        if (this.menuOpen) {
            this.closeMenu();
            return;
        }
        this.menuOpen = true;
        this.paused = true;
        this.player.setVelocity(0, 0);

        const W = this.scale.width, H = this.scale.height;
        const panelW = 200, panelH = 210;
        const px = W - panelW - 8, py = 38;

        this.menuOverlay = this.add.graphics().setScrollFactor(0).setDepth(160);
        this.menuOverlay.fillStyle(0x111122, 0.94);
        this.menuOverlay.fillRoundedRect(px, py, panelW, panelH, 10);
        this.menuOverlay.lineStyle(2, 0x4466AA, 0.8);
        this.menuOverlay.strokeRoundedRect(px, py, panelW, panelH, 10);

        const items = [
            { label: 'Save Game', action: () => { this.saveGame(); this.closeMenu(); } },
            { label: 'Load Game', action: () => {
                const save = localStorage.getItem('mrkluckSave');
                if (save) { this.scene.start('GameScene', JSON.parse(save)); }
                else { this.showFloatingText(this.player.x, this.player.y - 20, 'No save found!', '#FF6666'); this.closeMenu(); }
            }},
            { label: 'Quest Log (Q)', action: () => { this.closeMenu(); this.toggleQuestLog(); } },
            { label: 'Inventory (I)', action: () => { this.closeMenu(); this.toggleInventory(); } },
            { label: 'Quit to Title', action: () => { this.scene.start('BootScene'); } },
        ];

        this.menuItems = items.map((item, i) => {
            const btn = this.add.text(px + panelW / 2, py + 25 + i * 36, item.label, {
                fontSize: '16px', fill: '#EEEEEE', fontFamily: 'Arial',
                backgroundColor: '#334466', padding: { x: 14, y: 6 },
            }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(161).setInteractive({ useHandCursor: true });
            btn.on('pointerover', () => btn.setStyle({ fill: '#FFD700' }));
            btn.on('pointerout', () => btn.setStyle({ fill: '#EEEEEE' }));
            btn.on('pointerdown', item.action);
            return btn;
        });

        this.menuCloseBtn = this.add.text(px + panelW - 14, py + 10, 'X', {
            fontSize: '16px', fontFamily: 'Arial', fill: '#FFAAAA',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(162).setInteractive({ useHandCursor: true });
        this.menuCloseBtn.on('pointerover', () => this.menuCloseBtn.setStyle({ fill: '#FFFFFF' }));
        this.menuCloseBtn.on('pointerout', () => this.menuCloseBtn.setStyle({ fill: '#FFAAAA' }));
        this.menuCloseBtn.on('pointerdown', () => this.closeMenu());
    }

    closeMenu() {
        this.menuOpen = false;
        this.paused = false;
        if (this.menuOverlay) { this.menuOverlay.destroy(); this.menuOverlay = null; }
        this.menuItems.forEach(t => t.destroy());
        this.menuItems = [];
        if (this.menuCloseBtn) { this.menuCloseBtn.destroy(); this.menuCloseBtn = null; }
    }

    createHeartDisplay() {
        if (this.heartImages) this.heartImages.forEach(h => h.destroy());
        this.heartImages = [];
        const W = this.scale.width;
        for (let i = 0; i < this.lives; i++) {
            const h = this.add.image(W - 50 - i * 22, 20, 'heart').setScrollFactor(0).setDepth(101).setScale(0.6);
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
        const scaleX = mmW / this.mapWidth, scaleY = mmH / this.mapHeight;
        for (let y = 0; y < this.mapHeight; y++) {
            for (let x = 0; x < this.mapWidth; x++) {
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

        // ESC toggles menu (works even when paused)
        if (Phaser.Input.Keyboard.JustDown(this.escKey) && !this.questLogOpen && !this.inventoryOpen && !this.menuOpen) this.toggleMenu();

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
        this.checkMapTransitions();
        // Periodically check explore_area and other passive quests
        if (!this._lastQuestCheck || time - this._lastQuestCheck > 500) {
            this._lastQuestCheck = time;
            this.checkQuests();
        }
        // Auto-save every 30 seconds
        if (!this._lastAutoSave || time - this._lastAutoSave > 30000) {
            this._lastAutoSave = time;
            this.autoSave();
        }
    }

    handleInput() {
        if (this.isDashing) return;
        if (this.inventoryOpen || this.questLogOpen) {
            this.player.setVelocity(0, 0);
            return;
        }

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
        const groundTile = (ptx >= 0 && pty >= 0 && ptx < this.mapWidth && pty < this.mapHeight) ? this.worldData.ground[pty][ptx] : T_GRASS;
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
        if (Phaser.Input.Keyboard.JustDown(this.inventoryKey) && !this.inventoryOpen) this.toggleInventory();
        if (Phaser.Input.Keyboard.JustDown(this.useItemKey)) this.useSelectedItem();
        if (Phaser.Input.Keyboard.JustDown(this.saveKey)) this.saveGame();
        if (Phaser.Input.Keyboard.JustDown(this.questLogKey) && !this.questLogOpen) this.toggleQuestLog();
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
        const px = (this.player.x / (this.mapWidth * TILE)) * this.mmW + this.mmX;
        const py = (this.player.y / (this.mapHeight * TILE)) * this.mmH + this.mmY;
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
        if (ptx >= 0 && pty >= 0 && ptx < this.mapWidth && pty < this.mapHeight) {
            const b = this.worldData.biomeMap[pty][ptx];
            const names = { village: 'Village', farmland: 'Farmland', forest: 'Forest', desert: 'Desert', swamp: 'Swamp', snow: 'Snowy Mountains', hills: 'Hills', water: 'Water' };
            const mapName = MAP_DEFS[this.currentMapId] ? MAP_DEFS[this.currentMapId].name : '';
            this.biomeText.setText(`${mapName} - ${names[b] || b}`);
        }

        // Crow/Dash labels
        this.crowLabel.setText(this.crowReady ? 'CROW!' : 'crow...');
        this.crowLabel.setStyle({ fill: this.crowReady ? '#FFD700' : '#666', backgroundColor: this.crowReady ? '#440000' : '#222' });
        this.dashLabel.setText(this.dashReady ? 'DASH!' : 'dash...');
        this.dashLabel.setStyle({ fill: this.dashReady ? '#FF8800' : '#666', backgroundColor: this.dashReady ? '#442200' : '#222' });

        // Quest tracker (show up to 4 active quests)
        if (this.activeQuests.length > 0) {
            const lines = this.activeQuests.slice(0, 4).map(q => {
                let prog = '';
                if (q.type === 'eggs') prog = ` (${Math.min(this._getQuestProgress(q), q.target)}/${q.target})`;
                if (q.type === 'golden') prog = ` (${Math.min(this._getQuestProgress(q), q.target)}/${q.target})`;
                if (q.type === 'boss') prog = this.bossesDefeated[q.target] ? ' (Done!)' : '';
                if (q.type === 'defeat_n' && q.target) prog = ` (${Math.min(this._getQuestProgress(q), q.target.count)}/${q.target.count})`;
                if (q.type === 'pay_eggs') prog = ` (${this.totalEggsCollected}/${q.target} eggs)`;
                if (q.type === 'collect_items' && q.target) prog = ` (${this.getItemCount(q.target.item)}/${q.target.count})`;
                if (q.type === 'deliver_item' && q.target) prog = ` (${Math.min(this.getItemCount(q.target.item), q.target.count || 1)}/${q.target.count || 1})`;
                return `> ${q.desc}${prog}`;
            });
            if (this.activeQuests.length > 4) lines.push(`  ...and ${this.activeQuests.length - 4} more`);
            this.questText.setText(lines.join('\n'));
        } else {
            this.questText.setText('');
        }

        if (this.wieldedText) {
            const item = this.wieldedItemId ? this.inventory.find(i => i.itemId === this.wieldedItemId) : null;
            if (item) {
                const def = ITEM_DEFS[item.itemId];
                this.wieldedText.setText(`Wielding: ${def ? def.name : item.itemId}`);
            } else {
                this.wieldedItemId = null;
                this.wieldedText.setText('Wielding: (none)');
            }
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
        if (this.inventoryOpen) this.toggleInventory();
        const def = npc.getData('npcDef');
        this.dialogueActive = true;
        this.dialogueTapped = false;
        this.dialogueNPC = npc;
        this.player.setVelocity(0, 0);

        // Tap anywhere to advance dialogue on mobile
        this._dialogueTapHandler = () => { if (this.dialogueActive) this.dialogueTapped = true; };
        this.input.on('pointerdown', this._dialogueTapHandler);

        // Find first matching dialogue entry
        const entry = this.findMatchingDialogue(def);
        if (!entry) { this.closeDialogue(); return; }

        // Store multi-line dialogue queue
        this.dialogueQueue = [...entry.lines];
        this.dialogueEntry = entry;
        this.dialogueLineIdx = 0;

        this.dlgBox.setVisible(true);
        this.dlgName.setText(def.name).setVisible(true);
        this.dlgText.setText('').setVisible(true);
        this.dlgPrompt.setVisible(true);

        this.showNextDialogueLine();
    }

    findMatchingDialogue(def) {
        for (const entry of def.dialogues) {
            if (!entry.cond) return entry;
            if (this.checkCondition(entry.cond)) return entry;
        }
        return def.dialogues[def.dialogues.length - 1];
    }

    checkCondition(cond) {
        if (cond.flag && !this.storyFlags[cond.flag]) return false;
        if (cond.flag2 && !this.storyFlags[cond.flag2]) return false;
        if (cond.notFlag && this.storyFlags[cond.notFlag]) return false;
        if (cond.hasItem && !this.hasItem(cond.hasItem)) return false;
        if (cond.questComplete && !this.completedQuests[cond.questComplete]) return false;
        if (cond.questActive && !this.activeQuests.find(q => q.id === cond.questActive)) return false;
        if (cond.flagGte && this.storyFlags[cond.flagGte.flag] < cond.flagGte.value) return false;
        if (cond.minEggs && this.totalEggsCollected < cond.minEggs) return false;
        if (cond.and) return cond.and.every(c => this.checkCondition(c));
        if (cond.or) return cond.or.some(c => this.checkCondition(c));
        return true;
    }

    showNextDialogueLine() {
        const text = this.dialogueQueue[this.dialogueLineIdx];
        this.currentFullText = text;
        this.typewriterDone = false;
        this.dlgText.setText('');
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
            if (this.typewriterTimer) this.typewriterTimer.remove();
            this.dlgText.setText(this.currentFullText);
            this.typewriterDone = true;
            return;
        }
        this.dialogueLineIdx++;
        if (this.dialogueLineIdx < this.dialogueQueue.length) {
            this.showNextDialogueLine();
        } else {
            this.executeDialogueActions(this.dialogueEntry);
            this.closeDialogue();
        }
    }

    executeDialogueActions(entry) {
        if (!entry) return;
        if (entry.action) this.executeAction(entry.action);
        if (entry.giveQuest) this.activateQuest(entry.giveQuest);
        if (entry.giveItem) this.addItem(entry.giveItem);
        if (entry.removeItem) this.removeItem(entry.removeItem);
        if (entry.payQuest) this.payEggs(entry.payQuest);

        // Check talk_to and deliver_item quests
        const def = this.dialogueNPC ? this.dialogueNPC.getData('npcDef') : null;
        if (def) {
            this.activeQuests = this.activeQuests.filter(q => {
                if (q.type === 'talk_to' && talkTargetMatches(q.target, def.id)) {
                    this.completeQuest(q);
                    return false;
                }
                if (q.type === 'deliver_item' && q.target && q.target.npc === def.id) {
                    const need = q.target.count || 1;
                    if (this.getItemCount(q.target.item) < need) return true;
                    this.removeItem(q.target.item, need);
                    this.completeQuest(q);
                    return false;
                }
                return true;
            });
        }

        if (def && def.id === 'hermit_outside' && this.storyFlags.hermit_locked_in_cave && this.dialogueNPC) {
            this.npcs = this.npcs.filter(n => n !== this.dialogueNPC);
            this.dialogueNPC.destroy();
        }
    }

    executeAction(action) {
        if (!action) return;
        if (action.type === 'setFlag') {
            this.storyFlags[action.flag] = true;
            if (action.flag === 'ceremony_complete') this.showCeremony();
        } else if (action.type === 'multi') {
            (action.effects || []).forEach(e => this.executeAction(e));
        } else if (action.type === 'giveItem') {
            this.addItem(action.item);
        } else if (action.type === 'removeItem') {
            this.removeItem(action.item);
        } else if (action.type === 'addEggs') {
            this.totalEggsCollected += action.amount || 0;
            this.score += (action.amount || 0) * EGG_POINTS;
        }
    }

    activateQuest(questId) {
        const qd = QUEST_DEFS[questId];
        if (!qd) return;
        if (this.completedQuests[qd.id]) return;
        if (this.activeQuests.find(q => q.id === qd.id)) return;
        const q = { ...qd };
        this._ensureQuestRuntimeStart(q);
        this.activeQuests.push(q);
        this.showFloatingText(this.player.x, this.player.y - 30, `New Quest: ${qd.desc}`, '#88DDFF');
    }

    showFloatingText(x, y, text, color) {
        color = color || '#FFD700';
        const ft = this.add.text(x, y, text, {
            fontSize: '14px', fill: color, stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(200);
        this.tweens.add({ targets: ft, y: y - 40, alpha: 0, duration: 2000, onComplete: () => ft.destroy() });
    }

    closeDialogue() {
        this.dialogueActive = false;
        this.dialogueTapped = false;
        this.dialogueNPC = null;
        this.dialogueQueue = [];
        this.dialogueEntry = null;
        if (this._dialogueTapHandler) {
            this.input.off('pointerdown', this._dialogueTapHandler);
            this._dialogueTapHandler = null;
        }
        this.dlgBox.setVisible(false);
        this.dlgName.setVisible(false);
        this.dlgText.setVisible(false);
        this.dlgPrompt.setVisible(false);
        if (this.typewriterTimer) this.typewriterTimer.remove();

        this.checkQuests();
    }

    // ------------------------------------------------------------------
    //  INVENTORY
    // ------------------------------------------------------------------

    hasItem(itemId) { return this.inventory.some(i => i.itemId === itemId); }

    getItemCount(itemId) {
        const item = this.inventory.find(i => i.itemId === itemId);
        return item ? item.count : 0;
    }

    addItem(itemId, count) {
        count = count || 1;
        const def = ITEM_DEFS[itemId];
        if (!def) return;
        const existing = this.inventory.find(i => i.itemId === itemId);
        if (existing && def.stackable) {
            existing.count = Math.min(existing.count + count, def.max || 99);
        } else if (!existing) {
            this.inventory.push({ itemId, count });
        }
        this.showFloatingText(this.player.x, this.player.y - 20, `Got: ${def.name}`, '#88FF88');
    }

    removeItem(itemId, count) {
        count = count || 1;
        const idx = this.inventory.findIndex(i => i.itemId === itemId);
        if (idx < 0) return;
        this.inventory[idx].count -= count;
        if (this.inventory[idx].count <= 0) {
            this.inventory.splice(idx, 1);
            if (this.wieldedItemId === itemId) this.wieldedItemId = null;
        }
    }

    createInventoryUI() {
        const W = this.scale.width, H = this.scale.height;
        const panelW = 220, panelH = 280;
        const px = W / 2 - panelW / 2, py = H / 2 - panelH / 2;

        // Shared modal backdrop — blocks world input behind open panels
        this.modalBackdrop = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.01)
            .setScrollFactor(0).setDepth(140).setVisible(false).setInteractive();
        this.modalBackdrop.on('pointerdown', () => {});

        this.invPanel = this.add.graphics().setScrollFactor(0).setDepth(210).setVisible(false);
        this.invPanel.fillStyle(0x111122, 0.95);
        this.invPanel.fillRoundedRect(px, py, panelW, panelH, 12);
        this.invPanel.lineStyle(2, 0x4466AA, 0.8);
        this.invPanel.strokeRoundedRect(px, py, panelW, panelH, 12);

        this.invTitle = this.add.text(W / 2, py + 14, 'Inventory [I]', {
            fontSize: '16px', fontFamily: 'Georgia, serif', fill: '#FFD700',
        }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(211).setVisible(false);

        this.invCloseBtn = this.add.text(px + panelW - 14, py + 12, 'X', {
            fontSize: '16px', fontFamily: 'Arial', fill: '#FFAAAA',
        }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(212).setVisible(false).setInteractive({ useHandCursor: true });
        this.invCloseBtn.on('pointerover', () => this.invCloseBtn.setStyle({ fill: '#FFFFFF' }));
        this.invCloseBtn.on('pointerout', () => this.invCloseBtn.setStyle({ fill: '#FFAAAA' }));
        this.invCloseBtn.on('pointerdown', () => { if (this.inventoryOpen) this.toggleInventory(); });

        this.invSlots = [];
        for (let i = 0; i < 10; i++) {
            const slot = this.add.text(px + 14, py + 40 + i * 22, '', {
                fontSize: '13px', fontFamily: 'Arial', fill: '#EEEEEE',
            }).setScrollFactor(0).setDepth(211).setVisible(false).setInteractive();
            slot.on('pointerdown', () => {
                if (i < this.inventory.length) {
                    const item = this.inventory[i];
                    this.selectedItem = i;
                    this.wieldedItemId = item.itemId;
                    this.refreshInventoryDisplay();
                }
            });
            this.invSlots.push(slot);
        }

        this.invHint = this.add.text(W / 2, py + panelH - 18, 'Select an item to weild it', {
            fontSize: '11px', fill: '#AAAAAA',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(211).setVisible(false);
    }

    toggleInventory() {
        this.inventoryOpen = !this.inventoryOpen;
        this.invPanel.setVisible(this.inventoryOpen);
        this.invTitle.setVisible(this.inventoryOpen);
        this.invCloseBtn.setVisible(this.inventoryOpen);
        this.invHint.setVisible(this.inventoryOpen);
        if (this.inventoryOpen) {
            this.refreshInventoryDisplay();
            this.modalBackdrop.setVisible(true);
        } else {
            this.invSlots.forEach(s => s.setVisible(false));
            if (!this.questLogOpen) this.modalBackdrop.setVisible(false);
        }
    }

    toggleQuestLog() {
        if (this.questLogOpen) {
            this.questLogOpen = false;
            if (this.questLogPanel) this.questLogPanel.setVisible(false);
            if (this.questLogTitle) this.questLogTitle.setVisible(false);
            if (this.questLogCloseBtn) this.questLogCloseBtn.setVisible(false);
            this.questLogTexts.forEach(t => t.setVisible(false));
            if (!this.inventoryOpen) this.modalBackdrop.setVisible(false);
            return;
        }
        this.questLogOpen = true;
        this.modalBackdrop.setVisible(true);
        const W = this.scale.width, H = this.scale.height;
        const panelW = 300, panelH = 250;
        const px = W / 2 - panelW / 2, py = H / 2 - panelH / 2;
        if (!this.questLogPanel) {
            this.questLogPanel = this.add.graphics().setScrollFactor(0).setDepth(150);
            this.questLogTitle = this.add.text(W / 2, py + 12, 'Quest Log (Q)', {
                fontSize: '16px', fill: '#FFD700', fontFamily: 'Georgia, serif',
            }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(151);
            this.questLogCloseBtn = this.add.text(px + panelW - 14, py + 12, 'X', {
                fontSize: '16px', fontFamily: 'Arial', fill: '#FFAAAA',
            }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(152).setVisible(false).setInteractive({ useHandCursor: true });
            this.questLogCloseBtn.on('pointerover', () => this.questLogCloseBtn.setStyle({ fill: '#FFFFFF' }));
            this.questLogCloseBtn.on('pointerout', () => this.questLogCloseBtn.setStyle({ fill: '#FFAAAA' }));
            this.questLogCloseBtn.on('pointerdown', () => { if (this.questLogOpen) this.toggleQuestLog(); });
            this.questLogTexts = [];
            for (let i = 0; i < 10; i++) {
                const t = this.add.text(px + 14, py + 40 + i * 20, '', {
                    fontSize: '12px', fill: '#EEEEEE', wordWrap: { width: panelW - 28 },
                }).setScrollFactor(0).setDepth(151).setVisible(false);
                this.questLogTexts.push(t);
            }
        }
        this.questLogPanel.clear();
        this.questLogPanel.fillStyle(0x111122, 0.92);
        this.questLogPanel.fillRoundedRect(px, py, panelW, panelH, 12);
        this.questLogPanel.lineStyle(2, 0x4466AA, 0.8);
        this.questLogPanel.strokeRoundedRect(px, py, panelW, panelH, 12);
        this.questLogPanel.setVisible(true);
        this.questLogTitle.setVisible(true);
        this.questLogCloseBtn.setVisible(true);
        this.questLogTexts.forEach((t, i) => {
            if (i < this.activeQuests.length) {
                const q = this.activeQuests[i];
                let progress = '';
                if (q.type === 'eggs' && q.target) progress = ` (${Math.min(this._getQuestProgress(q), q.target)}/${q.target})`;
                if (q.type === 'defeat_n' && q.target) progress = ` (${Math.min(this._getQuestProgress(q), q.target.count)}/${q.target.count})`;
                if (q.type === 'deliver_item' && q.target) progress = ` (${Math.min(this.getItemCount(q.target.item), q.target.count || 1)}/${q.target.count || 1})`;
                if (q.type === 'collect_items' && q.target) progress = ` (${Math.min(this.getItemCount(q.target.item), q.target.count)}/${q.target.count})`;
                t.setText(`- ${q.desc}${progress}`).setStyle({ fill: '#FFFFCC' }).setVisible(true);
            } else if (i === this.activeQuests.length && this.activeQuests.length === 0) {
                t.setText('No active quests.').setStyle({ fill: '#888888' }).setVisible(true);
            } else {
                t.setVisible(false);
            }
        });
    }

    refreshInventoryDisplay() {
        this.invSlots.forEach((slot, i) => {
            if (i < this.inventory.length) {
                const item = this.inventory[i];
                const def = ITEM_DEFS[item.itemId];
                const sel = this.wieldedItemId === item.itemId ? '> ' : '  ';
                const cnt = item.count > 1 ? ` x${item.count}` : '';
                slot.setText(`${sel}${def ? def.name : item.itemId}${cnt}`);
                slot.setStyle({ fill: this.wieldedItemId === item.itemId ? '#FFD700' : '#EEEEEE' });
                slot.setVisible(true);
            } else {
                slot.setVisible(false);
            }
        });
        if (this.inventory.length === 0) {
            this.invSlots[0].setText('  (empty)').setStyle({ fill: '#888888' }).setVisible(true);
        }
    }

    useSelectedItem() {
        if (!this.wieldedItemId) {
            this.showFloatingText(this.player.x, this.player.y, 'No item wielded', '#FF6666');
            return;
        }
        const item = this.inventory.find(i => i.itemId === this.wieldedItemId);
        if (!item) {
            this.wieldedItemId = null;
            this.showFloatingText(this.player.x, this.player.y, 'Wielded item not in bag', '#FF6666');
            return;
        }
        const ptx = Math.floor(this.player.x / TILE);
        const pty = Math.floor(this.player.y / TILE);

        // Check use_item quests
        let used = false;
        this.activeQuests = this.activeQuests.filter(q => {
            if (q.type === 'use_item' && q.target && q.target.item === item.itemId) {
                const loc = q.target.location;
                if (loc) {
                    const dx = ptx - loc.tx, dy = pty - loc.ty;
                    if (Math.sqrt(dx * dx + dy * dy) <= (loc.radius || 3)) {
                        this.completeQuest(q);
                        used = true;
                        return false;
                    }
                }
            }
            return true;
        });

        // Fallback for legacy saves: allow Hermit's Key to unlock cave even if quest state is stale.
        if (!used && item.itemId === 'hermit_key' && !this.storyFlags.found_hermit_cave) {
            const hermitDoorTx = HERMIT_X - 1;
            const hermitDoorTy = HERMIT_Y;
            const dx = ptx - hermitDoorTx;
            const dy = pty - hermitDoorTy;
            if (Math.sqrt(dx * dx + dy * dy) <= 2) {
                this.storyFlags.found_hermit_cave = true;
                this.removeItem('hermit_key', 1);
                this.completedQuests.ch3_find_hermit = true;
                this.activeQuests = this.activeQuests.filter(q => q.id !== 'ch3_find_hermit');
                used = true;
            }
        }

        if (used) {
            this.showFloatingText(this.player.x, this.player.y - 20, `Used: ${ITEM_DEFS[item.itemId].name}`, '#88FF88');
            if (this.inventoryOpen) this.refreshInventoryDisplay();
        } else {
            this.showFloatingText(this.player.x, this.player.y, "Can't use that here", '#FF6666');
        }
    }

    // ------------------------------------------------------------------
    //  QUESTS
    // ------------------------------------------------------------------

    checkQuests() {
        this.activeQuests = this.activeQuests.filter(q => {
            if (this.completedQuests[q.id]) return false;
            let done = false;
            if (q.type === 'eggs' && this._getQuestProgress(q) >= q.target) done = true;
            if (q.type === 'golden' && this._getQuestProgress(q) >= q.target) done = true;
            if (q.type === 'boss' && this.bossesDefeated[q.target]) done = true;
            if (q.type === 'defeat_n' && q.target && this._getQuestProgress(q) >= q.target.count) done = true;
            if (q.type === 'explore_area' && q.target) {
                if (!q.target.mapId || q.target.mapId === this.currentMapId) {
                    const ptx = Math.floor(this.player.x / TILE), pty = Math.floor(this.player.y / TILE);
                    const dx = ptx - q.target.tx, dy = pty - q.target.ty;
                    if (Math.sqrt(dx * dx + dy * dy) <= (q.target.radius || 3)) {
                        if (!q.requireItem || this.hasItem(q.requireItem)) done = true;
                    }
                }
            }
            if (q.type === 'fetch_item' && q.target) {
                if (this.hasItem(q.target)) done = true;
            }
            if (q.type === 'flag_check' && q.target) {
                if (this.storyFlags[q.target]) done = true;
            }
            if (q.type === 'collect_items' && q.target) {
                if (this.getItemCount(q.target.item) >= q.target.count) done = true;
            }
            if (q.type === 'use_item' && q.target) {
                // Checked in useSelectedItem
            }
            // talk_to and deliver_item are checked in executeDialogueActions
            // pay_eggs is triggered manually via NPC interaction
            if (done) {
                this.completeQuest(q);
                return false;
            }
            return true;
        });
    }

    completeQuest(quest) {
        this.completedQuests[quest.id] = true;

        // Process reward
        if (quest.reward) {
            this.processReward(quest.reward);
        }
        // Legacy support
        if (quest.rewardType === 'life') {
            this.lives = Math.min(this.lives + 1, 5);
            this.createHeartDisplay();
        } else if (quest.rewardType === 'score500') {
            this.score += 500;
        }

        // Notification
        const W = this.scale.width;
        const notify = this.add.text(W / 2, 70, `Quest Complete: ${quest.desc}!`, {
            fontSize: '18px', fill: '#FFD700', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(150);
        this.tweens.add({ targets: notify, y: 50, alpha: 0, duration: 3000, onComplete: () => notify.destroy() });
        this.cameras.main.flash(400, 255, 215, 0);

        // Chain to next quest if specified
        if (quest.nextQuest) {
            this.time.delayedCall(500, () => this.activateQuest(quest.nextQuest));
        }
    }

    processReward(reward) {
        if (!reward) return;
        if (reward.type === 'flag') {
            this.storyFlags[reward.flag] = true;
        } else if (reward.type === 'life') {
            this.lives = Math.min(this.lives + 1, 5);
            this.createHeartDisplay();
        } else if (reward.type === 'score') {
            this.score += reward.amount || 0;
        } else if (reward.type === 'speed') {
            // Permanent speed handled in input
        } else if (reward.type === 'eggs') {
            this.totalEggsCollected += reward.amount || 0;
            this.score += (reward.amount || 0) * EGG_POINTS;
        } else if (reward.type === 'giveItem') {
            this.addItem(reward.item);
        } else if (reward.type === 'removeItem') {
            this.removeItem(reward.item);
        } else if (reward.type === 'multi') {
            (reward.effects || []).forEach(e => this.processReward(e));
        }
    }

    payEggs(questId) {
        const q = this.activeQuests.find(q => q.id === questId && q.type === 'pay_eggs');
        if (!q) return false;
        if (this.totalEggsCollected >= q.target) {
            this.totalEggsCollected -= q.target;
            this.completeQuest(q);
            this.activeQuests = this.activeQuests.filter(aq => aq.id !== questId);
            return true;
        } else {
            this.showFloatingText(this.player.x, this.player.y,
                `Need ${q.target} eggs (have ${this.totalEggsCollected})`, '#FF6666');
            return false;
        }
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
                this.defeatedEnemies++;
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

        this.defeatedEnemies++;
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
        if (px < TILE || py < TILE || px > (this.mapWidth - 1) * TILE || py > (this.mapHeight - 1) * TILE) return;

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

        const bType = bunny.getData('bunnyType');

        // Shadow thief steals eggs instead of doing damage
        if (bType === 'shadow') {
            const stolen = Math.min(this.score, 5);
            if (stolen > 0) {
                this.score -= stolen;
                this.showFloatingText(player.x, player.y - 20, `-${stolen} eggs stolen!`, '#FFDD00');
                this.cameras.main.flash(200, 200, 200, 0);
            }
            this.isInvincible = true;
            this.time.delayedCall(1000, () => { if (!this.activePowerups.shield) this.isInvincible = false; });
            return;
        }

        // Cursed rabbits deal 2 damage
        const damage = bType === 'cursed' ? 2 : 1;
        this.lives = Math.max(0, this.lives - damage);
        this.comboCount = 0; this.comboMult = 1;
        this.createHeartDisplay();

        if (damage > 1) {
            this.showFloatingText(player.x, player.y - 30, `${damage} damage!`, '#FF3333');
        }

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

    _buildSaveData() {
        return {
            score: this.score,
            lives: this.lives,
            totalEggsCollected: this.totalEggsCollected,
            goldenEggsCollected: this.goldenEggsCollected,
            bossesDefeated: this.bossesDefeated,
            storyFlags: this.storyFlags,
            inventory: this.inventory,
            activeQuests: this.activeQuests.map(q => ({ ...q })),
            completedQuests: this.completedQuests,
            currentMapId: this.currentMapId,
            defeatedEnemies: this.defeatedEnemies,
            basementVisitTimes: this.basementVisitTimes,
            wieldedItemId: this.wieldedItemId,
            spawnTx: Math.floor(this.player.x / TILE),
            spawnTy: Math.floor(this.player.y / TILE),
        };
    }

    saveGame() {
        localStorage.setItem('mrkluckSave', JSON.stringify(this._buildSaveData()));
        this.showFloatingText(this.player.x, this.player.y - 30, 'Game Saved!', '#88FF88');
    }

    autoSave() {
        localStorage.setItem('mrkluckAutosave', JSON.stringify(this._buildSaveData()));
    }

    gameOver() {
        this.playerDead = true;
        this.player.setVelocity(0, 0);
        this.bunnyGroup.getChildren().forEach(b => b.setVelocity(0, 0));

        // Record high score
        const stored = localStorage.getItem('mrkluckLeaderboard');
        let lb = stored ? JSON.parse(stored) : [];
        lb.push({ name: 'MRK', score: this.score, level: this.totalEggsCollected + ' eggs' });
        lb.sort((a, b) => b.score - a.score);
        lb = lb.slice(0, 5);
        localStorage.setItem('mrkluckLeaderboard', JSON.stringify(lb));

        const lostEggs = this.totalEggsCollected;

        const W = this.scale.width, H = this.scale.height;
        const ov = this.add.graphics().setScrollFactor(0).setDepth(200);
        ov.fillStyle(0x000000, 0.75); ov.fillRect(0, 0, W, H);

        this.add.text(W/2, H/2-90, 'YOU ARE UNCONSCIOUS', {
            fontSize: '32px', fontFamily: 'Georgia, serif', fill: '#FF6644', stroke: '#000', strokeThickness: 5,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
        this.add.text(W/2, H/2-40, 'The bunnies got you...', { fontSize: '18px', fill: '#FFFFCC' }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
        this.add.text(W/2, H/2, 'A kind villager carries you to the hospital.', { fontSize: '14px', fill: '#AADDAA' }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
        if (lostEggs > 0) {
            this.add.text(W/2, H/2+30, `All ${lostEggs} of your eggs were scattered and lost!`, { fontSize: '14px', fill: '#FF8888' }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
        }

        const tap = this.add.text(W/2, H/2+80, 'Recovering... (3)', { fontSize: '16px', fill: '#AAA' }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
        this.tweens.add({ targets: tap, alpha: 0, yoyo: true, repeat: -1, duration: 700 });

        this.time.delayedCall(1000, () => tap.setText('Recovering... (2)'));
        this.time.delayedCall(2000, () => tap.setText('Recovering... (1)'));

        this.time.delayedCall(3000, () => {
            tap.setText('Tap to wake up');
            let respawnTriggered = false;
            const respawn = () => {
                if (respawnTriggered) return;
                respawnTriggered = true;
                // Reset egg progress on quests
                const resetQuests = this.activeQuests.map(q => {
                    const out = { ...q };
                    if (q.type === 'eggs') out.startEggs = 0;
                    if (q.type === 'golden') out.startGoldenEggs = 0;
                    return out;
                });
                this.scene.start('GameScene', {
                    score: this.score,
                    lives: 3,
                    totalEggsCollected: 0,
                    goldenEggsCollected: 0,
                    bossesDefeated: this.bossesDefeated,
                    storyFlags: this.storyFlags,
                    inventory: this.inventory,
                    activeQuests: resetQuests,
                    completedQuests: this.completedQuests,
                    currentMapId: 'map1',
                    defeatedEnemies: this.defeatedEnemies,
                    basementVisitTimes: this.basementVisitTimes,
                    wieldedItemId: this.wieldedItemId,
                    spawnTx: V1_X + 9,
                    spawnTy: V1_Y + 5,
                });
            };
            this.input.keyboard.once('keydown', respawn);
            this.input.once('pointerup', respawn);
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
    //  CEREMONY / CREDITS
    // ------------------------------------------------------------------

    showCeremony() {
        this.paused = true;
        this.player.setVelocity(0, 0);
        this.cameras.main.flash(1000, 255, 215, 0);

        const W = this.scale.width, H = this.scale.height;
        const overlay = this.add.graphics().setScrollFactor(0).setDepth(300);
        overlay.fillStyle(0x000000, 0);
        this.tweens.add({
            targets: { alpha: 0 }, alpha: 0.85, duration: 2000,
            onUpdate: (tw, target) => {
                overlay.clear(); overlay.fillStyle(0x000000, target.alpha);
                overlay.fillRect(0, 0, W, H);
            },
        });

        this.time.delayedCall(2500, () => {
            const lines = [
                { text: 'THE KINGDOM IS SAVED!', y: H * 0.12, size: '28px', color: '#FFD700', delay: 0 },
                { text: 'Mr. Kluck, Hero of Cluckshire', y: H * 0.22, size: '20px', color: '#FFFFFF', delay: 500 },
                { text: '---', y: H * 0.30, size: '14px', color: '#666666', delay: 800 },
                { text: 'King Blueberry has been unmasked and banished.', y: H * 0.36, size: '14px', color: '#CCCCCC', delay: 1200 },
                { text: 'The real King Reginald has been freed.', y: H * 0.42, size: '14px', color: '#CCCCCC', delay: 1600 },
                { text: 'The cursed chocolate supply has been destroyed.', y: H * 0.48, size: '14px', color: '#CCCCCC', delay: 2000 },
                { text: 'The bunnies are returning to their peaceful ways.', y: H * 0.54, size: '14px', color: '#CCCCCC', delay: 2400 },
                { text: '---', y: H * 0.62, size: '14px', color: '#666666', delay: 3000 },
                { text: `Final Score: ${this.score}`, y: H * 0.68, size: '18px', color: '#88FF88', delay: 3500 },
                { text: `Eggs Collected: ${this.totalEggsCollected}`, y: H * 0.74, size: '14px', color: '#88DDFF', delay: 3800 },
                { text: `Bosses Defeated: ${Object.keys(this.bossesDefeated).length}`, y: H * 0.79, size: '14px', color: '#FF8888', delay: 4100 },
                { text: 'Thank you for playing!', y: H * 0.88, size: '20px', color: '#FFD700', delay: 5000 },
                { text: 'Press E to continue exploring...', y: H * 0.94, size: '12px', color: '#888888', delay: 6000 },
            ];
            const ceremonyTexts = [];
            lines.forEach(l => {
                this.time.delayedCall(l.delay, () => {
                    const t = this.add.text(W / 2, l.y, l.text, {
                        fontSize: l.size, fill: l.color, fontFamily: 'Georgia, serif',
                        stroke: '#000000', strokeThickness: 2,
                    }).setOrigin(0.5).setScrollFactor(0).setDepth(301).setAlpha(0);
                    this.tweens.add({ targets: t, alpha: 1, duration: 800 });
                    ceremonyTexts.push(t);
                });
            });

            // Allow dismissing after 6 seconds
            this.time.delayedCall(6500, () => {
                const dismiss = () => {
                    overlay.destroy();
                    ceremonyTexts.forEach(t => t.destroy());
                    this.paused = false;
                    this.interactKey.off('down', dismiss);
                };
                this.interactKey.on('down', dismiss);
            });
        });
    }

    // ------------------------------------------------------------------
    //  BASEMENTS
    // ------------------------------------------------------------------

    checkStairs() {
        if (this.basementCooldown) return;
        const ptx = Math.floor(this.player.x / TILE), pty = Math.floor(this.player.y / TILE);
        if (ptx < 0 || pty < 0 || ptx >= this.mapWidth || pty >= this.mapHeight) return;
        if (this.worldData.ground[pty][ptx] === T_STAIRS) {
            // Check interiors first, then basements
            const inter = this.worldData.interiors.find(i => i.stairsTx === ptx && i.stairsTy === pty);
            if (inter) {
                if (inter.requires) {
                    if (inter.requires.item && !this.hasItem(inter.requires.item)) {
                        this.showFloatingText(this.player.x, this.player.y - 20,
                            inter.failMessage || 'Locked!', '#FFAA66');
                        this.player.y += TILE;
                        this.basementCooldown = true;
                        this.time.delayedCall(1500, () => { this.basementCooldown = false; });
                        return;
                    }
                    if (inter.requires.flag && !this.storyFlags[inter.requires.flag]) {
                        const isHermitCaveLocked = inter.interiorId === 'hermit_cave' && inter.requires.flag === 'found_hermit_cave';
                        const msg = isHermitCaveLocked && this.hasItem('hermit_key')
                            ? "The cave is sealed. Use Hermit's Key (U) by the door."
                            : (inter.failMessage || 'Blocked!');
                        this.showFloatingText(this.player.x, this.player.y - 20,
                            msg, '#FFAA66');
                        this.player.y += TILE;
                        this.basementCooldown = true;
                        this.time.delayedCall(1500, () => { this.basementCooldown = false; });
                        return;
                    }
                }
                this.enterInterior(inter);
                return;
            }
            const bsmt = this.worldData.basements.find(b => b.stairsTx === ptx && b.stairsTy === pty);
            if (bsmt) {
                const bKey = `${this.currentMapId}_${bsmt.stairsTx}_${bsmt.stairsTy}`;
                const lastVisit = this.basementVisitTimes[bKey] || 0;
                const now = Date.now();
                const BASEMENT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
                if (now - lastVisit < BASEMENT_COOLDOWN_MS) {
                    const secsLeft = Math.ceil((BASEMENT_COOLDOWN_MS - (now - lastVisit)) / 1000);
                    const minsLeft = Math.floor(secsLeft / 60);
                    const msg = minsLeft > 0 ? `Empty... come back in ${minsLeft}m ${secsLeft % 60}s` : `Empty... come back in ${secsLeft}s`;
                    this.showFloatingText(this.player.x, this.player.y - 20, msg, '#AAAAAA');
                    this.player.y += TILE;
                    this.basementCooldown = true;
                    this.time.delayedCall(1000, () => { this.basementCooldown = false; });
                    return;
                }
                this.enterBasement(bsmt);
            }
        }
    }

    enterBasement(bsmt) {
        this.autoSave();
        const bKey = `${this.currentMapId}_${bsmt.stairsTx}_${bsmt.stairsTy}`;
        this.scene.pause();
        this.scene.launch('BasementScene', {
            parentScene: this,
            basementW: Math.max(bsmt.w + 2, 7),
            basementH: Math.max(bsmt.h + 2, 7),
            returnX: this.player.x,
            returnY: this.player.y,
            score: this.score,
            totalEggsCollected: this.totalEggsCollected,
            goldenEggsCollected: this.goldenEggsCollected,
            basementKey: bKey,
        });
    }

    enterInterior(inter) {
        if (inter && inter.interiorId === 'hermit_cave') {
            this.storyFlags.entered_hermit_cave = true;
        }
        this.autoSave();
        this.scene.pause();
        this.scene.launch('InteriorScene', {
            parentScene: this,
            interiorId: inter.interiorId,
            returnX: this.player.x,
            returnY: this.player.y,
            score: this.score,
            totalEggsCollected: this.totalEggsCollected,
            goldenEggsCollected: this.goldenEggsCollected,
            storyFlags: this.storyFlags,
            inventory: this.inventory,
        });
    }

    returnFromBasement(data) {
        if (data && data.score !== undefined) this.score = data.score;
        if (data && data.totalEggsCollected !== undefined) this.totalEggsCollected = data.totalEggsCollected;
        if (data && data.goldenEggsCollected !== undefined) this.goldenEggsCollected = data.goldenEggsCollected;
        if (data && data.storyFlags) this.storyFlags = data.storyFlags;
        if (data && data.inventory) this.inventory = data.inventory;
        if (data && data.basementKey) this.basementVisitTimes[data.basementKey] = Date.now();
        this.scene.resume();
        this.player.y += TILE;
        this.basementCooldown = true;
        this.time.delayedCall(800, () => { this.basementCooldown = false; });
        this.checkQuests();
    }

    checkMapTransitions() {
        const mapDef = MAP_DEFS[this.currentMapId];
        if (!mapDef || !mapDef.transitions) return;
        const ptx = Math.floor(this.player.x / TILE);
        const pty = Math.floor(this.player.y / TILE);
        for (const t of mapDef.transitions) {
            const inX = ptx >= t.tx && ptx < t.tx + (t.w || 1);
            const inY = pty >= t.ty && pty < t.ty + (t.h || 1);
            if (inX && inY) {
                // Check requirements
                if (t.requires) {
                    if (t.requires.item && !this.hasItem(t.requires.item)) {
                        this.showFloatingText(this.player.x, this.player.y - 20, t.failMessage || 'Locked!', '#FF6666');
                        this.player.y += (t.h === 1 ? TILE : 0);
                        this.player.x += (t.w === 1 ? TILE : 0);
                        return;
                    }
                    if (t.requires.flag && !this.storyFlags[t.requires.flag]) {
                        this.showFloatingText(this.player.x, this.player.y - 20, t.failMessage || 'Blocked!', '#FF6666');
                        this.player.y += (t.h === 1 ? TILE : 0);
                        this.player.x += (t.w === 1 ? TILE : 0);
                        return;
                    }
                }
                // Auto-save before transition
                this.autoSave();
                // Transition!
                this.scene.start('GameScene', {
                    score: this.score,
                    lives: this.lives,
                    totalEggsCollected: this.totalEggsCollected,
                    goldenEggsCollected: this.goldenEggsCollected,
                    bossesDefeated: this.bossesDefeated,
                    storyFlags: this.storyFlags,
                    inventory: this.inventory,
                    activeQuests: this.activeQuests,
                    completedQuests: this.completedQuests,
                    currentMapId: t.toMap,
                    defeatedEnemies: this.defeatedEnemies,
                    basementVisitTimes: this.basementVisitTimes,
                    wieldedItemId: this.wieldedItemId,
                    spawnTx: t.toTx,
                    spawnTy: t.toTy,
                });
                return;
            }
        }
    }

    // ------------------------------------------------------------------
    //  TOUCH CONTROLS
    // ------------------------------------------------------------------

    setupTouchControls() {
        this.touchDir = { x: 0, y: 0 };
        this.touchAnchor = null;
        this.touchMovePtrId = null;  // track which pointer is for movement
        this.touchLastMovePos = null;
        this.touchLastMoveTs = 0;
        this.touchLastDashTs = 0;

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
        const btnLeftX = W - 120, btnRightX = W - 65;
        const btnTopY = H - 110, btnBottomY = H - 55;
        const modalBlocked = () => this.dialogueActive || this.inventoryOpen || this.questLogOpen || this.menuOpen || this.paused || this.playerDead;
        makeBtnCircle('BAG', btnLeftX, btnTopY, 0x446622, () => { if (!modalBlocked()) this.toggleInventory(); });
        makeBtnCircle('CROW', btnRightX, btnTopY, 0x882200, () => { if (!modalBlocked()) this.useCrowPower(); });
        makeBtnCircle('TALK', btnLeftX, btnBottomY, 0x224488, () => { if (!modalBlocked() && this.nearestNPC) this.showDialogue(this.nearestNPC); });
        makeBtnCircle('USE', btnRightX, btnBottomY, 0x664422, () => { if (!modalBlocked()) this.useSelectedItem(); });

        // Pause button
        const pauseBtn = this.add.text(W / 2 - 55, 24, '|| Pause', {
            fontSize: '11px', fill: '#FFF', backgroundColor: '#222', padding: { x: 3, y: 1 },
        }).setScrollFactor(0).setDepth(101).setInteractive();
        pauseBtn.on('pointerdown', () => this.toggleMenu());
        this.actionBtnZones.push({ x: W / 2 - 55 + 25, y: 24 + 8, r: 35 });

        // Drag-to-move: finger down anywhere (except action buttons) sets anchor
        this.input.on('pointerdown', (p) => {
            // Ignore if it hit an action button
            for (const z of this.actionBtnZones) {
                const dx = p.x - z.x, dy = p.y - z.y;
                if (Math.sqrt(dx * dx + dy * dy) < z.r) return;
            }
            if (this.touchMovePtrId !== null && this.touchMovePtrId !== p.id) return;
            this.touchAnchor = { x: p.x, y: p.y };
            this.touchMovePtrId = p.id;
            this.touchLastMovePos = { x: p.x, y: p.y };
            this.touchLastMoveTs = this.time.now;
            this.touchDir = { x: 0, y: 0 };
        });

        this.input.on('pointermove', (p) => {
            if (this.touchMovePtrId !== p.id || !this.touchAnchor || !p.isDown) return;
            const dx = p.x - this.touchAnchor.x, dy = p.y - this.touchAnchor.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const now = this.time.now;
            if (len > 10) {
                this.touchDir = { x: dx / len, y: dy / len };
            } else {
                this.touchDir = { x: 0, y: 0 };
            }

            // Touch dash gesture: while dragging, quickly flick farther in the same direction.
            if (!modalBlocked() && this.touchLastMovePos && !this.isDashing) {
                const sdx = p.x - this.touchLastMovePos.x;
                const sdy = p.y - this.touchLastMovePos.y;
                const sLen = Math.sqrt(sdx * sdx + sdy * sdy);
                const dt = Math.max(1, now - this.touchLastMoveTs);
                const speed = sLen / dt; // px per ms
                if (sLen > 0 && len > 16) {
                    const sDirX = sdx / sLen;
                    const sDirY = sdy / sLen;
                    const dot = this.touchDir.x * sDirX + this.touchDir.y * sDirY;
                    const rapidForwardFlick = speed > 0.9 && dot > 0.88;
                    if (rapidForwardFlick && now - this.touchLastDashTs > 250) {
                        this.touchLastDashTs = now;
                        this.useDash();
                    }
                }
            }
            this.touchLastMovePos = { x: p.x, y: p.y };
            this.touchLastMoveTs = now;
        });

        this.input.on('pointerup', (p) => {
            if (this.touchMovePtrId === p.id) {
                this.touchAnchor = null;
                this.touchMovePtrId = null;
                this.touchLastMovePos = null;
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
        this.totalEggsCollected = data.totalEggsCollected || 0;
        this.goldenEggsCollected = data.goldenEggsCollected || 0;
        this.basementKey = data.basementKey;
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

        // Touch controls (movement + action button)
        this.touchDir = { x: 0, y: 0 };
        this.touchAnchor = null;
        this.actionBtnZones = [];
        const W = this.scale.width, H = this.scale.height;
        const alpha = 0.45;
        const makeBtnCircle = (label, bx, by, color, cb) => {
            const bgBtn = this.add.graphics().setScrollFactor(0).setDepth(150).setAlpha(alpha);
            bgBtn.fillStyle(color); bgBtn.fillCircle(bx, by, 24);
            this.add.text(bx, by, label, { fontSize: '10px', fill: '#FFF' }).setOrigin(0.5).setScrollFactor(0).setDepth(151);
            const zone = this.add.zone(bx, by, 48, 48).setInteractive().setScrollFactor(0).setDepth(152);
            zone.on('pointerdown', cb);
            this.actionBtnZones.push({ x: bx, y: by, r: 30 });
        };
        const btnLeftX = W - 120, btnRightX = W - 65;
        const btnTopY = H - 110, btnBottomY = H - 55;
        makeBtnCircle('BAG', btnLeftX, btnTopY, 0x446622, () => {});
        makeBtnCircle('CROW', btnRightX, btnTopY, 0x882200, () => {});
        makeBtnCircle('TALK', btnLeftX, btnBottomY, 0x224488, () => {});
        makeBtnCircle('USE', btnRightX, btnBottomY, 0x664422, () => {});

        this.input.on('pointerdown', p => {
            for (const z of this.actionBtnZones) {
                if (Phaser.Math.Distance.Between(p.x, p.y, z.x, z.y) <= z.r) return;
            }
            this.touchAnchor = { x: p.x, y: p.y };
        });
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
        this.totalEggsCollected++;
        if (egg.getData('eggType') === 'golden') this.goldenEggsCollected++;
        const ft = this.add.text(egg.x, egg.y, `+${pts}`, {
            fontSize: '18px', fill: egg.getData('eggType') === 'golden' ? '#FFD700' : '#FFF', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(30);
        this.tweens.add({ targets: ft, y: ft.y - 40, alpha: 0, duration: 700, onComplete: () => ft.destroy() });
        egg.destroy();
    }

    exitBasement() {
        this.parentScene.returnFromBasement({
            score: this.score,
            totalEggsCollected: this.totalEggsCollected,
            goldenEggsCollected: this.goldenEggsCollected,
            basementKey: this.basementKey,
        });
        this.scene.stop();
    }
}


// ===================================================================
//  INTERIOR SCENE — Generalized dungeon/room scene
// ===================================================================

// Interior definitions: hand-crafted or generated rooms
const INTERIOR_DEFS = {
    castle_throne: {
        width: 16, height: 12,
        groundTile: T_COBBLE, wallTile: W_STONE_WALL,
        title: 'Castle Throne Room',
        npcs: ['king', 'princess', 'royal_guard'],
        eggs: 3,
    },
    hermit_cave: {
        width: 10, height: 8,
        groundTile: T_BASEMENT, wallTile: W_BASEMENT_WALL,
        title: "Hermit's Cave",
        npcs: ['hermit'],
        eggs: 2,
    },
    labyrinth_f1: {
        width: 25, height: 25,
        groundTile: T_BASEMENT, wallTile: W_BASEMENT_WALL,
        title: 'Labyrinth - Floor 1',
        generated: true,
        eggs: 10,
        nextFloor: 'labyrinth_f2',
    },
    labyrinth_f2: {
        width: 30, height: 30,
        groundTile: T_BASEMENT, wallTile: W_BASEMENT_WALL,
        title: 'Labyrinth - Floor 2',
        generated: true,
        eggs: 15,
        nextFloor: 'labyrinth_f3',
        findItem: 'cursed_chocolate',
    },
    labyrinth_f3: {
        width: 35, height: 35,
        groundTile: T_BASEMENT, wallTile: W_BASEMENT_WALL,
        title: 'Labyrinth - Floor 3',
        generated: true,
        eggs: 20,
        hasBoss: true,
    },
    hollow_tree: {
        width: 14, height: 20,
        groundTile: T_WOOD, wallTile: W_WOOD_WALL,
        title: 'Inside the Hollow Tree',
        eggs: 8,
        findItem: 'fairy_dust',
    },
    fairy_glen: {
        width: 16, height: 16,
        groundTile: T_GRASS, wallTile: W_TREE,
        title: 'Fairy Glen',
        npcs: ['fairy_queen'],
        eggs: 5,
        findItem: 'fairy_dust',
    },
    jail_cells: {
        width: 12, height: 10,
        groundTile: T_BASEMENT, wallTile: W_STONE_WALL,
        title: 'Castle Dungeon',
        npcs: ['real_king'],
        eggs: 0,
    },
    witch_lair: {
        width: 12, height: 12,
        groundTile: T_SWAMP, wallTile: W_BASEMENT_WALL,
        title: "Witch Hexana's Lair",
        npcs: ['witch_hexana'],
        eggs: 5,
    },
    shadow_vault: {
        width: 14, height: 10,
        groundTile: T_BASEMENT, wallTile: W_STONE_WALL,
        title: 'Shadow Vault',
        eggs: 25,
    },
};

class InteriorScene extends Phaser.Scene {
    constructor() { super('InteriorScene'); }

    init(data) {
        this.parentScene = data.parentScene;
        this.interiorId = data.interiorId;
        this.config = INTERIOR_DEFS[data.interiorId];
        this.returnX = data.returnX;
        this.returnY = data.returnY;
        this.score = data.score || 0;
        this.totalEggsCollected = data.totalEggsCollected || 0;
        this.goldenEggsCollected = data.goldenEggsCollected || 0;
        this.storyFlags = data.storyFlags || {};
        this.inventory = data.inventory || [];
    }

    preload() { generateAllTextures(this); }

    create() {
        const cfg = this.config;
        if (!cfg) { this.exitInterior(); return; }
        const mapW = cfg.width, mapH = cfg.height;

        const map = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: mapW, height: mapH });
        const tileset = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0);
        const ground = map.createBlankLayer('iground', tileset);
        const walls = map.createBlankLayer('iwalls', tileset);

        const toOdd = (n) => (n % 2 === 0 ? Math.max(1, n - 1) : n);
        let sx = Math.floor(mapW / 2);
        let sy = mapH - 2;
        if (cfg.generated) {
            sx = toOdd(sx);
            sy = toOdd(sy);
        }
        let nx = null, ny = null;
        if (cfg.nextFloor) {
            nx = toOdd(Math.floor(mapW / 2));
            ny = 1;
        }

        if (cfg.generated) {
            this.generateMaze(ground, walls, mapW, mapH, cfg, sx, sy, nx, ny);
        } else {
            for (let y = 0; y < mapH; y++) {
                for (let x = 0; x < mapW; x++) {
                    ground.putTileAt(cfg.groundTile, x, y);
                    if (x === 0 || x === mapW - 1 || y === 0 || y === mapH - 1) {
                        walls.putTileAt(cfg.wallTile, x, y);
                    }
                }
            }
        }

        // Exit stairs
        ground.putTileAt(T_STAIRS, sx, sy);
        walls.putTileAt(-1, sx, sy); // ensure no wall on stairs
        if (sy - 1 > 0) walls.putTileAt(-1, sx, sy - 1);
        if (sy - 2 > 0) walls.putTileAt(-1, sx, sy - 2);

        // Next floor stairs (for labyrinth)
        if (cfg.nextFloor) {
            ground.putTileAt(T_STAIRS, nx, ny);
            walls.putTileAt(-1, nx, ny);
            if (ny + 1 < mapH - 1) walls.putTileAt(-1, nx, ny + 1);
            this.nextFloorX = nx;
            this.nextFloorY = ny;
        }

        walls.setCollisionByExclusion([-1]);
        this.physics.world.setBounds(0, 0, mapW * TILE, mapH * TILE);

        // Camera
        if (mapW * TILE < this.scale.width && mapH * TILE < this.scale.height) {
            const camX = (this.scale.width - mapW * TILE) / 2;
            const camY = (this.scale.height - mapH * TILE) / 2;
            this.cameras.main.setScroll(-camX, -camY);
        } else {
            this.cameras.main.setBounds(0, 0, mapW * TILE, mapH * TILE);
        }

        // Dark background
        const bg = this.add.graphics();
        bg.fillStyle(0x111118);
        bg.fillRect(-this.scale.width, -this.scale.height, this.scale.width * 3, this.scale.height * 3);
        bg.setDepth(-1);

        // Player
        const spawnTy = Math.max(1, sy - 1);
        this.player = this.physics.add.sprite(sx * TILE + TILE / 2, spawnTy * TILE + TILE / 2, 'player');
        this.player.body.setSize(16, 16);
        this.player.body.setOffset(10, 14);
        this.player.setCollideWorldBounds(true);
        this.player.setDepth(10);
        this.physics.add.collider(this.player, walls);

        // Follow player if map is large
        if (mapW * TILE > this.scale.width || mapH * TILE > this.scale.height) {
            this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
        }

        // Eggs
        this.eggGroup = this.physics.add.staticGroup();
        const occupiedTiles = new Set();
        const tileKey = (tx, ty) => `${tx},${ty}`;
        const isOpenTile = (tx, ty) => tx > 0 && ty > 0 && tx < mapW - 1 && ty < mapH - 1 && !walls.getTileAt(tx, ty);
        const findOpenTile = () => {
            for (let tries = 0; tries < 600; tries++) {
                const tx = Phaser.Math.Between(2, mapW - 3);
                const ty = Phaser.Math.Between(2, mapH - 3);
                const k = tileKey(tx, ty);
                if (isOpenTile(tx, ty) && !occupiedTiles.has(k)) return { tx, ty };
            }
            for (let ty = 1; ty < mapH - 1; ty++) {
                for (let tx = 1; tx < mapW - 1; tx++) {
                    const k = tileKey(tx, ty);
                    if (isOpenTile(tx, ty) && !occupiedTiles.has(k)) return { tx, ty };
                }
            }
            return null;
        };
        occupiedTiles.add(tileKey(sx, sy));
        occupiedTiles.add(tileKey(sx, spawnTy));
        if (cfg.nextFloor) occupiedTiles.add(tileKey(nx, ny));

        const eggCount = cfg.eggs || 0;
        for (let i = 0; i < eggCount; i++) {
            const tile = findOpenTile();
            if (!tile) continue;
            occupiedTiles.add(tileKey(tile.tx, tile.ty));
            const ex = tile.tx * TILE + TILE / 2;
            const ey = tile.ty * TILE + TILE / 2;
            const ci = i % EGG_COLORS.length;
            const isGolden = i === 0 && eggCount > 3;
            const egg = this.eggGroup.create(ex, ey, isGolden ? 'goldenegg' : 'egg' + ci);
            egg.setData('points', isGolden ? GOLDEN_EGG_POINTS : EGG_POINTS);
            egg.setData('eggType', isGolden ? 'golden' : 'normal');
            egg.setDepth(5);
            this.tweens.add({ targets: egg, y: ey - 4, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
        }
        this.physics.add.overlap(this.player, this.eggGroup, this.collectEgg, null, this);

        // Special item pickup
        if (cfg.findItem) {
            const itemDef = ITEM_DEFS[cfg.findItem];
            if (itemDef) {
                const tile = findOpenTile();
                const ix = tile ? (tile.tx * TILE + TILE / 2) : (sx * TILE + TILE / 2);
                const iy = tile ? (tile.ty * TILE + TILE / 2) : ((sy - 2) * TILE + TILE / 2);
                if (tile) occupiedTiles.add(tileKey(tile.tx, tile.ty));
                this.specialItem = this.physics.add.staticImage(ix, iy, 'goldenegg');
                this.specialItem.setTint(0xFF00FF);
                this.specialItem.setDepth(6);
                this.specialItem.setData('itemId', cfg.findItem);
                this.tweens.add({ targets: this.specialItem, y: iy - 6, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut' });
                this.add.text(ix, iy + 18, itemDef.name, {
                    fontSize: '9px', fill: '#FF88FF',
                }).setOrigin(0.5).setDepth(6);
                this.physics.add.overlap(this.player, this.specialItem, () => {
                    const existing = this.inventory.find(i => i.itemId === cfg.findItem);
                    if (!existing) {
                        this.inventory.push({ itemId: cfg.findItem, count: 1 });
                        const ft = this.add.text(this.specialItem.x, this.specialItem.y - 20, `Found: ${itemDef.name}!`, {
                            fontSize: '14px', fill: '#FF88FF', stroke: '#000', strokeThickness: 3,
                        }).setOrigin(0.5).setDepth(30);
                        this.tweens.add({ targets: ft, y: ft.y - 40, alpha: 0, duration: 1500, onComplete: () => ft.destroy() });
                        if (cfg.findItem === 'cursed_chocolate') this.storyFlags.found_cursed_chocolate = true;
                    }
                    this.specialItem.destroy();
                }, null, this);
            }
        }

        // Interior enemies (labyrinth floors)
        this.enemyGroup = this.physics.add.group();
        if (cfg.generated) {
            const enemyCount = cfg.hasBoss ? 6 : Math.floor(mapW * mapH / 80);
            for (let i = 0; i < enemyCount; i++) {
                let ex, ey, attempts = 0;
                do {
                    ex = Phaser.Math.Between(2, mapW - 3);
                    ey = Phaser.Math.Between(2, mapH - 3);
                    attempts++;
                } while (attempts < 200 && walls.getTileAt(ex, ey));
                if (walls.getTileAt(ex, ey)) continue;
                const bx = ex * TILE + TILE / 2, by = ey * TILE + TILE / 2;
                const enemy = this.enemyGroup.create(bx, by, 'cursed_rabbit');
                enemy.setCollideWorldBounds(true);
                enemy.setData('speed', 100);
                enemy.setData('stunned', false);
                enemy.setData('type', 'cursed');
                enemy.setTint(0xFF4444);
                enemy.setDepth(9);
            }
            // Boss on final labyrinth floor
            if (cfg.hasBoss) {
                const bossTile = findOpenTile() || { tx: sx, ty: 3 };
                const bossX = bossTile.tx * TILE + TILE / 2;
                const bossY = bossTile.ty * TILE + TILE / 2;
                const boss = this.enemyGroup.create(bossX, bossY, 'boss_bunny');
                boss.setCollideWorldBounds(true);
                boss.setData('speed', 90);
                boss.setData('stunned', false);
                boss.setData('type', 'boss');
                boss.setData('bossHP', 5);
                boss.setScale(1.4);
                boss.setDepth(9);
            }
            this.physics.add.collider(this.enemyGroup, walls);
            this.physics.add.overlap(this.player, this.enemyGroup, this.onInteriorEnemyHit, null, this);
        }

        // Stun key
        this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.crowReady = true;

        // Interior NPCs
        this.interiorNPCs = [];
        if (cfg.npcs) {
            cfg.npcs.forEach((npcId, idx) => {
                const def = NPC_DEFS.find(d => d.id === npcId);
                if (!def) return;
                const nx = (3 + idx * 3) * TILE + TILE / 2;
                const ny = 3 * TILE + TILE / 2;
                const npc = this.add.image(nx, ny, 'npc_' + def.id);
                npc.setDepth(8);
                npc.setData('npcDef', def);
                npc.setData('dialogueIdx', 0);
                this.interiorNPCs.push(npc);
                this.tweens.add({ targets: npc, y: ny - 3, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.easeInOut' });
            });
        }

        // Input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D,
        });
        this.interactKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

        // Touch controls (movement + action buttons)
        this.touchDir = { x: 0, y: 0 };
        this.touchAnchor = null;
        this.actionBtnZones = [];
        const W = this.scale.width, H = this.scale.height;
        const alpha = 0.45;
        const makeBtnCircle = (label, bx, by, color, cb) => {
            const bgBtn = this.add.graphics().setScrollFactor(0).setDepth(150).setAlpha(alpha);
            bgBtn.fillStyle(color); bgBtn.fillCircle(bx, by, 24);
            this.add.text(bx, by, label, { fontSize: '10px', fill: '#FFF' }).setOrigin(0.5).setScrollFactor(0).setDepth(151);
            const zone = this.add.zone(bx, by, 48, 48).setInteractive().setScrollFactor(0).setDepth(152);
            zone.on('pointerdown', cb);
            this.actionBtnZones.push({ x: bx, y: by, r: 30 });
        };
        const modalBlocked = () => this.dialogueActive;
        const btnLeftX = W - 120, btnRightX = W - 65;
        const btnTopY = H - 110, btnBottomY = H - 55;
        makeBtnCircle('BAG', btnLeftX, btnTopY, 0x446622, () => {});
        makeBtnCircle('CROW', btnRightX, btnTopY, 0x882200, () => {
            if (!modalBlocked() && this.crowReady) this.interiorCrowStun();
        });
        makeBtnCircle('TALK', btnLeftX, btnBottomY, 0x224488, () => {
            if (!modalBlocked() && this.nearestNPC) this.showInteriorDialogue(this.nearestNPC);
        });
        makeBtnCircle('USE', btnRightX, btnBottomY, 0x664422, () => {});

        this.input.on('pointerdown', p => {
            for (const z of this.actionBtnZones) {
                if (Phaser.Math.Distance.Between(p.x, p.y, z.x, z.y) <= z.r) return;
            }
            this.touchAnchor = { x: p.x, y: p.y };
        });
        this.input.on('pointermove', p => {
            if (!this.touchAnchor || !p.isDown) return;
            const dx = p.x - this.touchAnchor.x, dy = p.y - this.touchAnchor.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 10) { this.touchDir = { x: dx / len, y: dy / len }; } else { this.touchDir = { x: 0, y: 0 }; }
        });
        this.input.on('pointerup', () => { this.touchAnchor = null; this.touchDir = { x: 0, y: 0 }; });

        // Title label
        this.add.text(mapW * TILE / 2, 6, `-- ${cfg.title || 'Interior'} --`, {
            fontSize: '12px', fill: '#AAAACC',
        }).setOrigin(0.5, 0).setDepth(20);

        // Exit label
        this.add.text(sx * TILE + TILE / 2, (sy + 1) * TILE, 'Exit', {
            fontSize: '11px', fill: '#FFD700',
        }).setOrigin(0.5).setDepth(20);

        if (cfg.nextFloor) {
            this.add.text(this.nextFloorX * TILE + TILE / 2, (this.nextFloorY - 1) * TILE, 'Deeper', {
                fontSize: '11px', fill: '#FF8888',
            }).setOrigin(0.5).setDepth(20);
        }

        // NPC interact prompt
        this.interactPrompt = this.add.text(0, 0, '[E] Talk', {
            fontSize: '11px', fill: '#FFD700', backgroundColor: '#00000088', padding: { x: 2, y: 1 },
        }).setOrigin(0.5).setDepth(20).setVisible(false);

        this.stairsX = sx;
        this.stairsY = sy;
        this.nearestNPC = null;
        this.interiorInvincible = false;

        // Dialogue UI (simplified)
        this.dialogueActive = false;
        this.dialogueTapArmed = false;
        this.dialogueNPCDef = null;
        this.createSimpleDialogueUI();
    }

    createSimpleDialogueUI() {
        const W = this.scale.width, H = this.scale.height;
        const boxH = 110, boxW = W - 40, boxX = 20, boxY = H - boxH - 10;
        this.dlgBox = this.add.graphics().setScrollFactor(0).setDepth(200).setVisible(false);
        this.dlgBox.fillStyle(0x111122, 0.92);
        this.dlgBox.fillRoundedRect(boxX, boxY, boxW, boxH, 12);
        this.dlgBox.lineStyle(2, 0x4466AA, 0.8);
        this.dlgBox.strokeRoundedRect(boxX, boxY, boxW, boxH, 12);
        this.dlgName = this.add.text(boxX + 14, boxY + 8, '', {
            fontSize: '16px', fontFamily: 'Georgia, serif', fill: '#FFD700',
        }).setScrollFactor(0).setDepth(201).setVisible(false);
        this.dlgText = this.add.text(boxX + 14, boxY + 32, '', {
            fontSize: '13px', fontFamily: 'Arial', fill: '#EEEEEE', wordWrap: { width: boxW - 28 }, lineSpacing: 4,
        }).setScrollFactor(0).setDepth(201).setVisible(false);

        this.input.on('pointerup', () => {
            if (this.dialogueActive && this.dialogueTapArmed) this.advanceInteriorDialogue();
        });
    }

    generateMaze(ground, walls, w, h, cfg, exitX, exitY, nextX, nextY) {
        // Fill everything with walls first
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                ground.putTileAt(cfg.groundTile, x, y);
                walls.putTileAt(cfg.wallTile, x, y);
            }
        }
        // Recursive backtracking maze
        const grid = Array.from({ length: h }, () => Array(w).fill(true));
        const carve = (cx, cy) => {
            grid[cy][cx] = false;
            walls.putTileAt(-1, cx, cy);
            const dirs = [[0,-2],[0,2],[-2,0],[2,0]].sort(() => Math.random() - 0.5);
            for (const [dx, dy] of dirs) {
                const nx = cx + dx, ny = cy + dy;
                if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 1 && grid[ny][nx]) {
                    grid[cy + dy / 2][cx + dx / 2] = false;
                    walls.putTileAt(-1, cx + dx / 2, cy + dy / 2);
                    carve(nx, ny);
                }
            }
        };
        carve(1, 1);
        const carvePath = (x0, y0, x1, y1) => {
            let x = x0, y = y0;
            while (x !== x1) {
                x += x < x1 ? 1 : -1;
                walls.putTileAt(-1, x, y);
            }
            while (y !== y1) {
                y += y < y1 ? 1 : -1;
                walls.putTileAt(-1, x, y);
            }
        };
        // Ensure stairs and routes are always reachable.
        if (typeof exitX === 'number' && typeof exitY === 'number') {
            walls.putTileAt(-1, exitX, exitY);
            carvePath(1, 1, exitX, exitY);
        }
        if (typeof nextX === 'number' && typeof nextY === 'number') {
            walls.putTileAt(-1, nextX, nextY);
            carvePath(1, 1, nextX, nextY);
        }
    }

    update() {
        if (this.dialogueActive) {
            if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
                this.advanceInteriorDialogue();
            }
            return;
        }

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

        // NPC proximity
        this.nearestNPC = null;
        let nearDist = Infinity;
        this.interiorNPCs.forEach(npc => {
            const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.x, npc.y);
            if (d < NPC_INTERACT_DIST && d < nearDist) { this.nearestNPC = npc; nearDist = d; }
        });
        if (this.nearestNPC) {
            this.interactPrompt.setPosition(this.nearestNPC.x, this.nearestNPC.y - 24).setVisible(true);
            if (Phaser.Input.Keyboard.JustDown(this.interactKey)) this.showInteriorDialogue(this.nearestNPC);
        } else {
            this.interactPrompt.setVisible(false);
        }

        // Crow stun (SPACE)
        if (Phaser.Input.Keyboard.JustDown(this.spaceKey) && this.crowReady) {
            this.interiorCrowStun();
        }

        // Enemy AI
        this.enemyGroup.getChildren().forEach(enemy => {
            if (enemy.getData('stunned')) return;
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            const speed = enemy.getData('speed');
            if (dist < 200) {
                const a = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
                const wobble = Math.sin(this.time.now / 500 + enemy.x) * 0.3;
                this.physics.velocityFromRotation(a + wobble, speed, enemy.body.velocity);
            } else {
                const wa = Math.sin(this.time.now / 2000 + enemy.x * 0.1) * Math.PI;
                this.physics.velocityFromRotation(wa, speed * 0.3, enemy.body.velocity);
            }
            if (enemy.body.velocity.x < 0) enemy.setFlipX(true);
            else enemy.setFlipX(false);
        });

        // Check stairs
        const ptx = Math.floor(this.player.x / TILE), pty = Math.floor(this.player.y / TILE);
        if (ptx === this.stairsX && pty === this.stairsY) {
            this.exitInterior();
        }
        if (this.config.nextFloor && ptx === this.nextFloorX && pty === this.nextFloorY) {
            this.goDeeper();
        }
    }

    showInteriorDialogue(npc) {
        const def = npc.getData('npcDef');
        this.dialogueActive = true;
        this.player.setVelocity(0, 0);
        this.dialogueNPCDef = def;

        // Use same conditional dialogue system — check parent scene's flags
        let entry = null;
        for (const e of def.dialogues) {
            if (!e.cond) { entry = e; break; }
            if (this.checkSimpleCondition(e.cond)) { entry = e; break; }
        }
        if (!entry) entry = def.dialogues[def.dialogues.length - 1];

        this.dialogueQueue = [...entry.lines];
        this.dialogueEntry = entry;
        this.dialogueLineIdx = 0;
        this.dialogueTapArmed = false;
        this.time.delayedCall(120, () => {
            if (this.dialogueActive) this.dialogueTapArmed = true;
        });

        this.dlgBox.setVisible(true);
        this.dlgName.setText(def.name).setVisible(true);
        this.dlgText.setText(this.dialogueQueue[0]).setVisible(true);
    }

    checkSimpleCondition(cond) {
        if (cond.flag && !this.storyFlags[cond.flag]) return false;
        if (cond.flag2 && !this.storyFlags[cond.flag2]) return false;
        if (cond.notFlag && this.storyFlags[cond.notFlag]) return false;
        if (cond.hasItem && !this.inventory.some(i => i.itemId === cond.hasItem)) return false;
        if (cond.questComplete && !(this.parentScene && this.parentScene.completedQuests && this.parentScene.completedQuests[cond.questComplete])) return false;
        if (cond.questActive && !(this.parentScene && this.parentScene.activeQuests && this.parentScene.activeQuests.find(q => q.id === cond.questActive))) return false;
        return true;
    }

    advanceInteriorDialogue() {
        this.dialogueLineIdx++;
        if (this.dialogueLineIdx < this.dialogueQueue.length) {
            this.dlgText.setText(this.dialogueQueue[this.dialogueLineIdx]);
        } else {
            this.dialogueActive = false;
            this.dialogueTapArmed = false;
            this.dlgBox.setVisible(false);
            this.dlgName.setVisible(false);
            this.dlgText.setVisible(false);

            // Execute actions
            const entry = this.dialogueEntry;
            if (entry && entry.action) {
                if (entry.action.type === 'setFlag') this.storyFlags[entry.action.flag] = true;
                if (entry.action.type === 'multi') {
                    (entry.action.effects || []).forEach(e => {
                        if (e.type === 'setFlag') this.storyFlags[e.flag] = true;
                    });
                }
            }
            if (entry && entry.giveItem) {
                const def = ITEM_DEFS[entry.giveItem];
                if (def) {
                    const existing = this.inventory.find(i => i.itemId === entry.giveItem);
                    if (existing && def.stackable) {
                        existing.count = Math.min(existing.count + 1, def.max || 99);
                    } else if (!existing) {
                        this.inventory.push({ itemId: entry.giveItem, count: 1 });
                    }
                }
            }
            if (entry && entry.giveQuest && this.parentScene && this.parentScene.activateQuest) {
                this.parentScene.activateQuest(entry.giveQuest);
            }
            if (entry && entry.payQuest && this.parentScene && this.parentScene.payEggs) {
                this.parentScene.payEggs(entry.payQuest);
            }

            const p = this.parentScene;
            const npcDef = this.dialogueNPCDef;
            if (p && npcDef && Array.isArray(p.activeQuests)) {
                p.activeQuests = p.activeQuests.filter(q => {
                    if (q.type === 'talk_to' && talkTargetMatches(q.target, npcDef.id)) {
                        p.completeQuest(q);
                        return false;
                    }
                    if (q.type === 'deliver_item' && q.target && q.target.npc === npcDef.id) {
                        const need = q.target.count || 1;
                        if ((p.getItemCount && p.getItemCount(q.target.item) >= need)) {
                            if (p.removeItem) p.removeItem(q.target.item, need);
                            p.completeQuest(q);
                            return false;
                        }
                    }
                    return true;
                });
            }
            this.dialogueNPCDef = null;
        }
    }

    interiorCrowStun() {
        this.crowReady = false;
        // Visual burst
        const burst = this.add.circle(this.player.x, this.player.y, CROW_STUN_RADIUS, 0xFFDD00, 0.3).setDepth(15);
        this.tweens.add({ targets: burst, alpha: 0, scaleX: 1.5, scaleY: 1.5, duration: 400, onComplete: () => burst.destroy() });

        this.enemyGroup.getChildren().forEach(enemy => {
            if (Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y) < CROW_STUN_RADIUS) {
                this.stunInteriorEnemy(enemy);
            }
        });
        this.time.delayedCall(CROW_COOLDOWN, () => { this.crowReady = true; });
    }

    stunInteriorEnemy(enemy) {
        const type = enemy.getData('type');
        if (type === 'boss') {
            let hp = enemy.getData('bossHP') - 1;
            enemy.setData('bossHP', hp);
            const hpText = this.add.text(enemy.x, enemy.y - 30, `HP: ${hp}/5`, {
                fontSize: '14px', fill: '#FF4444', stroke: '#000', strokeThickness: 2,
            }).setOrigin(0.5).setDepth(15);
            this.tweens.add({ targets: hpText, y: hpText.y - 30, alpha: 0, duration: 1200, onComplete: () => hpText.destroy() });
            if (hp <= 0) {
                this.score += 500;
                this.storyFlags.labyrinth_cleared = true;
                const dt = this.add.text(enemy.x, enemy.y - 20, 'LABYRINTH BOSS DEFEATED! +500', {
                    fontSize: '16px', fill: '#FFD700', stroke: '#000', strokeThickness: 3,
                }).setOrigin(0.5).setDepth(30);
                this.tweens.add({ targets: dt, y: dt.y - 60, alpha: 0, duration: 2000, onComplete: () => dt.destroy() });
                enemy.destroy();
                this.cameras.main.flash(800, 255, 215, 0);
                return;
            }
        }
        enemy.setData('stunned', true);
        enemy.setVelocity(0, 0);
        enemy.setAlpha(0.5);
        const stars = this.add.text(enemy.x, enemy.y - 20, '***', { fontSize: '14px', fill: '#FFFF00' }).setDepth(15);
        this.tweens.add({ targets: stars, y: enemy.y - 50, alpha: 0, duration: CROW_STUN_DURATION, onComplete: () => stars.destroy() });
        this.time.delayedCall(type === 'boss' ? 1500 : CROW_STUN_DURATION, () => {
            if (enemy.active) { enemy.setData('stunned', false); enemy.setAlpha(1); }
        });
    }

    onInteriorEnemyHit(player, enemy) {
        if (this.interiorInvincible || enemy.getData('stunned')) return;
        this.interiorInvincible = true;
        this.score = Math.max(0, this.score - 3);
        this.cameras.main.flash(300, 255, 0, 0);
        this.player.setAlpha(0.5);
        const ft = this.add.text(player.x, player.y - 20, '-3 eggs!', {
            fontSize: '14px', fill: '#FF4444', stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(30);
        this.tweens.add({ targets: ft, y: ft.y - 40, alpha: 0, duration: 800, onComplete: () => ft.destroy() });
        this.time.delayedCall(1500, () => {
            this.interiorInvincible = false;
            if (this.player.active) this.player.setAlpha(1);
        });
    }

    collectEgg(player, egg) {
        const pts = egg.getData('points');
        this.score += pts;
        this.totalEggsCollected++;
        if (egg.getData('eggType') === 'golden') this.goldenEggsCollected++;
        const ft = this.add.text(egg.x, egg.y, `+${pts}`, {
            fontSize: '18px', fill: egg.getData('eggType') === 'golden' ? '#FFD700' : '#FFF', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(30);
        this.tweens.add({ targets: ft, y: ft.y - 40, alpha: 0, duration: 700, onComplete: () => ft.destroy() });
        egg.destroy();
    }

    goDeeper() {
        const nextId = this.config.nextFloor;
        if (!nextId) return;
        this.scene.start('InteriorScene', {
            parentScene: this.parentScene,
            interiorId: nextId,
            returnX: this.returnX,
            returnY: this.returnY,
            score: this.score,
            totalEggsCollected: this.totalEggsCollected,
            goldenEggsCollected: this.goldenEggsCollected,
            storyFlags: this.storyFlags,
            inventory: this.inventory,
        });
    }

    exitInterior() {
        this.parentScene.returnFromBasement({
            score: this.score,
            totalEggsCollected: this.totalEggsCollected,
            goldenEggsCollected: this.goldenEggsCollected,
            storyFlags: this.storyFlags,
            inventory: this.inventory,
        });
        this.scene.stop();
    }
}


// ===================================================================
//  PHASER CONFIG
// ===================================================================

const config = {
    type: Phaser.AUTO,
    backgroundColor: '#111111',
    scene: [BootScene, GameScene, BasementScene, InteriorScene],
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

function showBootError(error) {
    console.error('Game bootstrap failed:', error);
    const box = document.createElement('div');
    box.style.position = 'fixed';
    box.style.inset = '0';
    box.style.display = 'flex';
    box.style.alignItems = 'center';
    box.style.justifyContent = 'center';
    box.style.background = '#111';
    box.style.color = '#f2f2f2';
    box.style.fontFamily = 'Arial, sans-serif';
    box.style.textAlign = 'center';
    box.style.padding = '16px';
    box.innerHTML = '<div><h2>Failed to load game data</h2><p>Check console for details.</p></div>';
    document.body.appendChild(box);
}

async function bootstrapGame() {
    try {
        await loadExternalGameData();
        new Phaser.Game(config);
    } catch (error) {
        showBootError(error);
    }
}

bootstrapGame();
