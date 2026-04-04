/********************************************************************
 * game.js
 * Mr. Kluck's Egg Hunt — Enhanced Edition
 *
 * Mr. Kluck the rooster has had his precious Easter eggs stolen by
 * the mischievous Easter Bunny! Help him hunt them all down across
 * a series of exciting levels before the Easter Bunny catches him!
 *
 * Controls:
 *   Movement: Arrow keys / WASD / on-screen D-pad
 *   Crow Power: SPACE / on-screen button (stun nearby bunnies)
 *   Dash: SHIFT / on-screen button (quick burst of speed)
 *
 * Features:
 *  - 12 named levels with unique environmental hazards
 *  - Power-up system (speed, shield, magnet, freeze, extra life)
 *  - Combo multiplier for rapid egg collection
 *  - Dash ability with cooldown
 *  - Level timer with time bonus
 *  - Multiple enemy types (normal, fast, patrol, boss)
 *  - Special egg types (golden, chocolate, rotten)
 *  - Environmental hazards (mud, ice patches)
 *  - Boss encounters every 3rd level
 *  - Lives system, score, and leaderboard
 *  - Fully installable Progressive Web App
 ********************************************************************/

const APP_VERSION = window.APP_VERSION || '(Unknown)';

// ---- Player constants ----
const PLAYER_SPEED = 160;
const INVINCIBLE_DURATION = 2000;
const CROW_COOLDOWN = 5000;
const CROW_STUN_RADIUS = 130;
const CROW_STUN_DURATION = 2500;

// ---- Dash constants ----
const DASH_SPEED = 500;
const DASH_DURATION = 180;
const DASH_COOLDOWN = 3000;

// ---- Combo constants ----
const COMBO_WINDOW = 2000;     // ms to collect another egg to keep combo
const COMBO_MAX_MULT = 5;      // max multiplier

// ---- Level timer ----
const BASE_LEVEL_TIME = 45;    // seconds for level 1
const TIME_PER_EGG = 4;        // extra seconds per egg on the level
const TIME_BONUS_MULTIPLIER = 5; // points per second remaining

// ---- Egg point values ----
const EGG_POINTS = 10;
const GOLDEN_EGG_POINTS = 50;
const CHOCOLATE_EGG_POINTS = 15;
const ROTTEN_EGG_PENALTY = -20;

// ---- Power-up constants ----
const POWERUP_SPAWN_INTERVAL = 8000;  // ms between power-up spawns
const POWERUP_LIFETIME = 7000;        // ms before a power-up disappears
const POWERUP_SPEED_DURATION = 6000;
const POWERUP_SHIELD_DURATION = 5000;
const POWERUP_MAGNET_DURATION = 6000;
const POWERUP_MAGNET_RADIUS = 150;
const POWERUP_FREEZE_DURATION = 4000;
const POWERUP_SPEED_MULT = 1.6;

const POWERUP_TYPES = ['speed', 'shield', 'magnet', 'freeze', 'extralife'];

// ---- Egg colors ----
const EGG_COLORS = [
    { hex: 0xff6b9d, name: 'pink'   },
    { hex: 0x7eb8ff, name: 'blue'   },
    { hex: 0x6bff8a, name: 'green'  },
    { hex: 0xff9e6b, name: 'orange' },
    { hex: 0xd36bff, name: 'purple' },
    { hex: 0x6bd4ff, name: 'cyan'   },
];

// ---- Level configurations ----
// Each level can specify: name, eggs, golden, chocolate, rotten, bunnies,
// bunnySpeed, bushes, fastBunnies, patrolBunnies, boss, mud, ice
const LEVEL_CONFIGS = [
    { name: "The Barnyard",       eggs: 5,  golden: 1, chocolate: 0, rotten: 0, bunnies: 1, bunnySpeed: 65,  bushes: 3,  fastBunnies: 0, patrolBunnies: 0, boss: false, mud: 0, ice: 0 },
    { name: "The Garden",         eggs: 7,  golden: 1, chocolate: 1, rotten: 0, bunnies: 1, bunnySpeed: 85,  bushes: 5,  fastBunnies: 0, patrolBunnies: 0, boss: false, mud: 0, ice: 0 },
    { name: "The Mud Pit",        eggs: 8,  golden: 1, chocolate: 1, rotten: 1, bunnies: 1, bunnySpeed: 85,  bushes: 4,  fastBunnies: 1, patrolBunnies: 0, boss: true,  mud: 3, ice: 0 },
    { name: "The Meadow",         eggs: 9,  golden: 2, chocolate: 1, rotten: 1, bunnies: 2, bunnySpeed: 90,  bushes: 6,  fastBunnies: 0, patrolBunnies: 1, boss: false, mud: 2, ice: 0 },
    { name: "The Orchard",        eggs: 10, golden: 2, chocolate: 2, rotten: 1, bunnies: 2, bunnySpeed: 95,  bushes: 7,  fastBunnies: 1, patrolBunnies: 0, boss: false, mud: 1, ice: 0 },
    { name: "The Frozen Pond",    eggs: 11, golden: 2, chocolate: 1, rotten: 2, bunnies: 2, bunnySpeed: 95,  bushes: 4,  fastBunnies: 0, patrolBunnies: 1, boss: true,  mud: 0, ice: 4 },
    { name: "The Forest",         eggs: 12, golden: 2, chocolate: 2, rotten: 2, bunnies: 2, bunnySpeed: 105, bushes: 9,  fastBunnies: 1, patrolBunnies: 1, boss: false, mud: 2, ice: 0 },
    { name: "The Swamp",          eggs: 13, golden: 3, chocolate: 1, rotten: 3, bunnies: 2, bunnySpeed: 105, bushes: 6,  fastBunnies: 1, patrolBunnies: 1, boss: false, mud: 5, ice: 0 },
    { name: "The Ice Cave",       eggs: 14, golden: 3, chocolate: 2, rotten: 2, bunnies: 2, bunnySpeed: 110, bushes: 5,  fastBunnies: 1, patrolBunnies: 1, boss: true,  mud: 0, ice: 6 },
    { name: "The Burrow",         eggs: 15, golden: 3, chocolate: 2, rotten: 3, bunnies: 3, bunnySpeed: 115, bushes: 8,  fastBunnies: 1, patrolBunnies: 2, boss: false, mud: 3, ice: 2 },
    { name: "The Dark Thicket",   eggs: 16, golden: 3, chocolate: 3, rotten: 3, bunnies: 3, bunnySpeed: 120, bushes: 10, fastBunnies: 2, patrolBunnies: 1, boss: false, mud: 3, ice: 3 },
    { name: "Easter HQ",          eggs: 18, golden: 4, chocolate: 3, rotten: 4, bunnies: 3, bunnySpeed: 125, bushes: 10, fastBunnies: 2, patrolBunnies: 2, boss: true,  mud: 3, ice: 3 },
];

function getLevelConfig(level) {
    if (level <= LEVEL_CONFIGS.length) {
        return Object.assign({}, LEVEL_CONFIGS[level - 1]);
    }
    const last = LEVEL_CONFIGS[LEVEL_CONFIGS.length - 1];
    const extra = level - LEVEL_CONFIGS.length;
    return {
        name: `Level ${level}`,
        eggs:          last.eggs          + extra * 2,
        golden:        Math.min(last.golden        + Math.floor(extra / 2), 6),
        chocolate:     Math.min(last.chocolate      + Math.floor(extra / 3), 5),
        rotten:        Math.min(last.rotten         + Math.floor(extra / 2), 6),
        bunnies:       Math.min(last.bunnies        + Math.floor(extra / 3), 5),
        bunnySpeed:    Math.min(last.bunnySpeed     + extra * 10, 200),
        bushes:        Math.min(last.bushes         + extra, 15),
        fastBunnies:   Math.min(last.fastBunnies    + Math.floor(extra / 2), 4),
        patrolBunnies: Math.min(last.patrolBunnies  + Math.floor(extra / 3), 4),
        boss:          extra % 3 === 0,
        mud:           Math.min(last.mud + Math.floor(extra / 2), 6),
        ice:           Math.min(last.ice + Math.floor(extra / 2), 6),
    };
}

// ---- Helper: random position inside the play field ----
function randomFieldPos(scene, margin) {
    const m = margin || 60;
    return {
        x: Phaser.Math.Between(m, scene.scale.width  - m),
        y: Phaser.Math.Between(m + 80, scene.scale.height - m),
    };
}

// ===================================================================
//  TEXTURE GENERATION (procedural pixel-art sprites)
// ===================================================================

function generateAllTextures(scene) {
    createPlayerTexture(scene);
    createPlayerStunnedTexture(scene);
    createPlayerShieldTexture(scene);
    createBunnyTexture(scene);
    createBunnyStunnedTexture(scene);
    createFastBunnyTexture(scene);
    createFastBunnyStunnedTexture(scene);
    createPatrolBunnyTexture(scene);
    createPatrolBunnyStunnedTexture(scene);
    createBossBunnyTexture(scene);
    createBossBunnyStunnedTexture(scene);
    EGG_COLORS.forEach(function(ec, i) {
        createEggTexture(scene, ec.hex, 'egg' + i);
    });
    createGoldenEggTexture(scene);
    createChocolateEggTexture(scene);
    createRottenEggTexture(scene);
    createHeartTexture(scene);
    createCrowBurstTexture(scene);
    createGrassTexture(scene);
    createBushTexture(scene);
    createFlowerTexture(scene);
    createMudTexture(scene);
    createIceTexture(scene);
    createPowerupTextures(scene);
    createDashTrailTexture(scene);
}

function createPlayerTexture(scene) {
    if (scene.textures.exists('player')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 36;
    g.fillStyle(0xCC4400);
    g.fillEllipse(s / 2, s / 2 + 4, 22, 18);
    g.fillStyle(0xDD5500);
    g.fillCircle(s / 2, s / 2 - 5, 9);
    g.fillStyle(0xFF6600);
    g.fillTriangle(s / 2 - 14, s / 2, s / 2 - 8, s / 2 + 5, s / 2 - 17, s / 2 + 8);
    g.fillStyle(0xFFAA00);
    g.fillTriangle(s / 2 - 15, s / 2 + 3, s / 2 - 9, s / 2 + 8, s / 2 - 18, s / 2 + 11);
    g.fillStyle(0xFF3300);
    g.fillTriangle(s / 2 - 12, s / 2 - 2, s / 2 - 7, s / 2 + 4, s / 2 - 16, s / 2 + 4);
    g.fillStyle(0xFF2200);
    g.fillTriangle(s / 2 - 2, s / 2 - 13, s / 2, s / 2 - 13, s / 2 - 1, s / 2 - 17);
    g.fillTriangle(s / 2 + 1, s / 2 - 13, s / 2 + 3, s / 2 - 13, s / 2 + 2, s / 2 - 16);
    g.fillTriangle(s / 2 + 3, s / 2 - 13, s / 2 + 5, s / 2 - 13, s / 2 + 4, s / 2 - 15);
    g.fillStyle(0xFF3300);
    g.fillEllipse(s / 2 + 7, s / 2 - 2, 5, 8);
    g.fillStyle(0xFFAA00);
    g.fillTriangle(s / 2 + 8, s / 2 - 7, s / 2 + 8, s / 2 - 4, s / 2 + 14, s / 2 - 5);
    g.fillStyle(0xFFFFFF);
    g.fillCircle(s / 2 + 3, s / 2 - 7, 3);
    g.fillStyle(0x000000);
    g.fillCircle(s / 2 + 4, s / 2 - 7, 1.5);
    g.fillStyle(0xBB3300);
    g.fillEllipse(s / 2 - 2, s / 2 + 4, 16, 10);
    g.fillStyle(0xFFBB00);
    g.fillRect(s / 2 - 3, s / 2 + 13, 2, 6);
    g.fillRect(s / 2 + 2, s / 2 + 13, 2, 6);
    g.fillRect(s / 2 - 6, s / 2 + 18, 4, 2);
    g.fillRect(s / 2 - 1, s / 2 + 18, 2, 2);
    g.fillRect(s / 2 + 2, s / 2 + 18, 4, 2);
    g.fillRect(s / 2 + 5, s / 2 + 18, 3, 2);
    g.generateTexture('player', s, s);
    g.destroy();
}

function createPlayerStunnedTexture(scene) {
    if (scene.textures.exists('player_stunned')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 36;
    g.fillStyle(0x886644);
    g.fillEllipse(s / 2, s / 2 + 4, 22, 18);
    g.fillStyle(0x997755);
    g.fillCircle(s / 2, s / 2 - 5, 9);
    g.fillStyle(0xAA8866);
    g.fillEllipse(s / 2 - 2, s / 2 + 4, 16, 10);
    g.fillStyle(0xBB3300);
    g.fillTriangle(s / 2 - 2, s / 2 - 13, s / 2, s / 2 - 13, s / 2 - 1, s / 2 - 17);
    g.fillStyle(0xFFAA00);
    g.fillTriangle(s / 2 + 8, s / 2 - 7, s / 2 + 8, s / 2 - 4, s / 2 + 14, s / 2 - 5);
    g.fillStyle(0xFFFFFF);
    g.fillCircle(s / 2 + 3, s / 2 - 7, 3);
    g.fillStyle(0x0000FF);
    g.fillCircle(s / 2 + 4, s / 2 - 7, 1.5);
    g.fillStyle(0xFFFF00);
    g.fillTriangle(s / 2 - 5, s / 2 - 22, s / 2 - 8, s / 2 - 18, s / 2 - 2, s / 2 - 18);
    g.fillTriangle(s / 2 - 5, s / 2 - 14, s / 2 - 8, s / 2 - 18, s / 2 - 2, s / 2 - 18);
    g.fillTriangle(s / 2 + 5, s / 2 - 24, s / 2 + 2, s / 2 - 20, s / 2 + 8, s / 2 - 20);
    g.fillTriangle(s / 2 + 5, s / 2 - 16, s / 2 + 2, s / 2 - 20, s / 2 + 8, s / 2 - 20);
    g.generateTexture('player_stunned', s, s);
    g.destroy();
}

function createPlayerShieldTexture(scene) {
    if (scene.textures.exists('player_shield')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 44;
    // Shield bubble
    g.lineStyle(2, 0x44CCFF, 0.8);
    g.strokeCircle(s / 2, s / 2, 20);
    g.lineStyle(1, 0x88EEFF, 0.5);
    g.strokeCircle(s / 2, s / 2, 18);
    g.generateTexture('player_shield', s, s);
    g.destroy();
}

function createBunnyTexture(scene) {
    if (scene.textures.exists('bunny')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 34;
    g.fillStyle(0xF0F0FF);
    g.fillEllipse(s / 2, s / 2 + 5, 20, 16);
    g.fillStyle(0xFFFFFF);
    g.fillCircle(s / 2, s / 2 - 3, 9);
    g.fillStyle(0xFFFFFF);
    g.fillEllipse(s / 2 - 5, s / 2 - 16, 6, 16);
    g.fillEllipse(s / 2 + 5, s / 2 - 16, 6, 16);
    g.fillStyle(0xFFAABB);
    g.fillEllipse(s / 2 - 5, s / 2 - 16, 3, 12);
    g.fillEllipse(s / 2 + 5, s / 2 - 16, 3, 12);
    g.fillStyle(0xFF88AA);
    g.fillCircle(s / 2, s / 2 - 1, 2);
    g.fillStyle(0xFF0044);
    g.fillCircle(s / 2 - 3, s / 2 - 5, 2);
    g.fillCircle(s / 2 + 3, s / 2 - 5, 2);
    g.fillStyle(0xFFFFFF);
    g.fillCircle(s / 2 - 8, s / 2 + 8, 5);
    g.fillStyle(0xFFBB00);
    g.fillRect(s / 2 - 3, s / 2 + 12, 2, 4);
    g.fillRect(s / 2 + 2, s / 2 + 12, 2, 4);
    g.generateTexture('bunny', s, s);
    g.destroy();
}

function createBunnyStunnedTexture(scene) {
    if (scene.textures.exists('bunny_stunned')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 34;
    g.fillStyle(0xCCCCDD);
    g.fillEllipse(s / 2, s / 2 + 5, 20, 16);
    g.fillStyle(0xDDDDEE);
    g.fillCircle(s / 2, s / 2 - 3, 9);
    g.fillStyle(0xDDDDEE);
    g.fillEllipse(s / 2 - 5, s / 2 - 16, 6, 16);
    g.fillEllipse(s / 2 + 5, s / 2 - 16, 6, 16);
    g.fillStyle(0xCCAABB);
    g.fillEllipse(s / 2 - 5, s / 2 - 16, 3, 12);
    g.fillEllipse(s / 2 + 5, s / 2 - 16, 3, 12);
    g.fillStyle(0x6666AA);
    g.fillCircle(s / 2 - 3, s / 2 - 5, 2);
    g.fillCircle(s / 2 + 3, s / 2 - 5, 2);
    g.generateTexture('bunny_stunned', s, s);
    g.destroy();
}

// Fast bunny — sleek, darker, with speed lines
function createFastBunnyTexture(scene) {
    if (scene.textures.exists('fast_bunny')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 34;
    g.fillStyle(0x8888CC);
    g.fillEllipse(s / 2, s / 2 + 5, 18, 14);
    g.fillStyle(0x9999DD);
    g.fillCircle(s / 2, s / 2 - 3, 8);
    g.fillStyle(0x9999DD);
    g.fillEllipse(s / 2 - 5, s / 2 - 17, 5, 18);
    g.fillEllipse(s / 2 + 5, s / 2 - 17, 5, 18);
    g.fillStyle(0xBB88CC);
    g.fillEllipse(s / 2 - 5, s / 2 - 17, 2, 14);
    g.fillEllipse(s / 2 + 5, s / 2 - 17, 2, 14);
    g.fillStyle(0xFF0066);
    g.fillCircle(s / 2 - 3, s / 2 - 5, 2);
    g.fillCircle(s / 2 + 3, s / 2 - 5, 2);
    // Speed lines
    g.lineStyle(1, 0xCCCCFF, 0.6);
    g.lineBetween(s / 2 - 16, s / 2 + 2, s / 2 - 10, s / 2 + 2);
    g.lineBetween(s / 2 - 17, s / 2 + 6, s / 2 - 11, s / 2 + 6);
    g.lineBetween(s / 2 - 15, s / 2 + 10, s / 2 - 9, s / 2 + 10);
    g.generateTexture('fast_bunny', s, s);
    g.destroy();
}

function createFastBunnyStunnedTexture(scene) {
    if (scene.textures.exists('fast_bunny_stunned')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 34;
    g.fillStyle(0x666699);
    g.fillEllipse(s / 2, s / 2 + 5, 18, 14);
    g.fillStyle(0x7777AA);
    g.fillCircle(s / 2, s / 2 - 3, 8);
    g.fillStyle(0x7777AA);
    g.fillEllipse(s / 2 - 5, s / 2 - 17, 5, 18);
    g.fillEllipse(s / 2 + 5, s / 2 - 17, 5, 18);
    g.fillStyle(0x6666AA);
    g.fillCircle(s / 2 - 3, s / 2 - 5, 2);
    g.fillCircle(s / 2 + 3, s / 2 - 5, 2);
    g.generateTexture('fast_bunny_stunned', s, s);
    g.destroy();
}

// Patrol bunny — armored look with helmet
function createPatrolBunnyTexture(scene) {
    if (scene.textures.exists('patrol_bunny')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 36;
    g.fillStyle(0xDDCCAA);
    g.fillEllipse(s / 2, s / 2 + 5, 22, 18);
    g.fillStyle(0xEEDDBB);
    g.fillCircle(s / 2, s / 2 - 3, 10);
    // Helmet
    g.fillStyle(0x887744);
    g.fillEllipse(s / 2, s / 2 - 6, 18, 10);
    // Ears
    g.fillStyle(0xEEDDBB);
    g.fillEllipse(s / 2 - 6, s / 2 - 16, 6, 14);
    g.fillEllipse(s / 2 + 6, s / 2 - 16, 6, 14);
    g.fillStyle(0xFFAABB);
    g.fillEllipse(s / 2 - 6, s / 2 - 16, 3, 10);
    g.fillEllipse(s / 2 + 6, s / 2 - 16, 3, 10);
    // Stern eyes
    g.fillStyle(0xFF2200);
    g.fillCircle(s / 2 - 3, s / 2 - 4, 2);
    g.fillCircle(s / 2 + 3, s / 2 - 4, 2);
    // Shield emblem on body
    g.fillStyle(0x665533);
    g.fillTriangle(s / 2, s / 2 + 1, s / 2 - 4, s / 2 + 8, s / 2 + 4, s / 2 + 8);
    g.generateTexture('patrol_bunny', s, s);
    g.destroy();
}

function createPatrolBunnyStunnedTexture(scene) {
    if (scene.textures.exists('patrol_bunny_stunned')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 36;
    g.fillStyle(0xAA9977);
    g.fillEllipse(s / 2, s / 2 + 5, 22, 18);
    g.fillStyle(0xBBAA88);
    g.fillCircle(s / 2, s / 2 - 3, 10);
    g.fillStyle(0x665533);
    g.fillEllipse(s / 2, s / 2 - 6, 18, 10);
    g.fillStyle(0xBBAA88);
    g.fillEllipse(s / 2 - 6, s / 2 - 16, 6, 14);
    g.fillEllipse(s / 2 + 6, s / 2 - 16, 6, 14);
    g.fillStyle(0x6666AA);
    g.fillCircle(s / 2 - 3, s / 2 - 4, 2);
    g.fillCircle(s / 2 + 3, s / 2 - 4, 2);
    g.generateTexture('patrol_bunny_stunned', s, s);
    g.destroy();
}

// Boss bunny — large with crown
function createBossBunnyTexture(scene) {
    if (scene.textures.exists('boss_bunny')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 50;
    // Large body
    g.fillStyle(0x333333);
    g.fillEllipse(s / 2, s / 2 + 6, 30, 24);
    g.fillStyle(0x444444);
    g.fillCircle(s / 2, s / 2 - 4, 14);
    // Ears
    g.fillStyle(0x444444);
    g.fillEllipse(s / 2 - 8, s / 2 - 22, 7, 18);
    g.fillEllipse(s / 2 + 8, s / 2 - 22, 7, 18);
    g.fillStyle(0xCC4444);
    g.fillEllipse(s / 2 - 8, s / 2 - 22, 3, 14);
    g.fillEllipse(s / 2 + 8, s / 2 - 22, 3, 14);
    // Crown
    g.fillStyle(0xFFD700);
    g.fillRect(s / 2 - 10, s / 2 - 16, 20, 5);
    g.fillTriangle(s / 2 - 10, s / 2 - 16, s / 2 - 6, s / 2 - 16, s / 2 - 8, s / 2 - 22);
    g.fillTriangle(s / 2 - 2, s / 2 - 16, s / 2 + 2, s / 2 - 16, s / 2, s / 2 - 24);
    g.fillTriangle(s / 2 + 6, s / 2 - 16, s / 2 + 10, s / 2 - 16, s / 2 + 8, s / 2 - 22);
    // Gems on crown
    g.fillStyle(0xFF0000);
    g.fillCircle(s / 2, s / 2 - 14, 2);
    // Evil eyes
    g.fillStyle(0xFF0000);
    g.fillCircle(s / 2 - 5, s / 2 - 6, 3);
    g.fillCircle(s / 2 + 5, s / 2 - 6, 3);
    g.fillStyle(0x000000);
    g.fillCircle(s / 2 - 5, s / 2 - 6, 1.5);
    g.fillCircle(s / 2 + 5, s / 2 - 6, 1.5);
    g.generateTexture('boss_bunny', s, s);
    g.destroy();
}

function createBossBunnyStunnedTexture(scene) {
    if (scene.textures.exists('boss_bunny_stunned')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 50;
    g.fillStyle(0x222222);
    g.fillEllipse(s / 2, s / 2 + 6, 30, 24);
    g.fillStyle(0x333333);
    g.fillCircle(s / 2, s / 2 - 4, 14);
    g.fillStyle(0x333333);
    g.fillEllipse(s / 2 - 8, s / 2 - 22, 7, 18);
    g.fillEllipse(s / 2 + 8, s / 2 - 22, 7, 18);
    g.fillStyle(0xCCCC00);
    g.fillRect(s / 2 - 10, s / 2 - 16, 20, 5);
    g.fillStyle(0x6666AA);
    g.fillCircle(s / 2 - 5, s / 2 - 6, 3);
    g.fillCircle(s / 2 + 5, s / 2 - 6, 3);
    g.generateTexture('boss_bunny_stunned', s, s);
    g.destroy();
}

function createEggTexture(scene, colorHex, key) {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 20;
    g.fillStyle(colorHex);
    g.fillEllipse(s / 2, s / 2 + 1, 14, 18);
    // Highlight
    g.fillStyle(0xFFFFFF, 0.4);
    g.fillEllipse(s / 2 - 2, s / 2 - 3, 5, 7);
    // Stripe
    g.lineStyle(2, 0xFFFFFF, 0.3);
    g.lineBetween(s / 2 - 5, s / 2 + 2, s / 2 + 5, s / 2 + 2);
    g.generateTexture(key, s, s);
    g.destroy();
}

function createGoldenEggTexture(scene) {
    if (scene.textures.exists('goldenegg')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 24;
    g.fillStyle(0xFFD700);
    g.fillEllipse(s / 2, s / 2 + 1, 16, 20);
    g.fillStyle(0xFFF8CC, 0.5);
    g.fillEllipse(s / 2 - 2, s / 2 - 4, 6, 8);
    g.lineStyle(2, 0xFFA500, 0.6);
    g.lineBetween(s / 2 - 6, s / 2, s / 2 + 6, s / 2);
    g.lineBetween(s / 2 - 5, s / 2 + 4, s / 2 + 5, s / 2 + 4);
    // Sparkle
    g.fillStyle(0xFFFFFF);
    g.fillCircle(s / 2 + 4, s / 2 - 5, 2);
    g.generateTexture('goldenegg', s, s);
    g.destroy();
}

function createChocolateEggTexture(scene) {
    if (scene.textures.exists('chocolateegg')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 22;
    g.fillStyle(0x5C3317);
    g.fillEllipse(s / 2, s / 2 + 1, 14, 18);
    g.fillStyle(0x7B4B2A, 0.5);
    g.fillEllipse(s / 2 - 2, s / 2 - 3, 5, 7);
    // Chocolate drizzle
    g.lineStyle(2, 0x3B1F0B, 0.7);
    g.lineBetween(s / 2 - 4, s / 2 - 2, s / 2 + 2, s / 2 + 1);
    g.lineBetween(s / 2 + 2, s / 2 + 1, s / 2 - 2, s / 2 + 4);
    g.generateTexture('chocolateegg', s, s);
    g.destroy();
}

function createRottenEggTexture(scene) {
    if (scene.textures.exists('rottenegg')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 20;
    g.fillStyle(0x6B8E23);
    g.fillEllipse(s / 2, s / 2 + 1, 14, 18);
    g.fillStyle(0x556B2F, 0.5);
    g.fillEllipse(s / 2 - 2, s / 2 - 3, 5, 7);
    // Stink lines
    g.lineStyle(1, 0x9ACD32, 0.6);
    g.lineBetween(s / 2 - 3, s / 2 - 8, s / 2 - 5, s / 2 - 12);
    g.lineBetween(s / 2, s / 2 - 9, s / 2, s / 2 - 13);
    g.lineBetween(s / 2 + 3, s / 2 - 8, s / 2 + 5, s / 2 - 12);
    g.generateTexture('rottenegg', s, s);
    g.destroy();
}

function createHeartTexture(scene) {
    if (scene.textures.exists('heart')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xFF2244);
    g.fillCircle(8, 8, 6);
    g.fillCircle(18, 8, 6);
    g.fillTriangle(2, 10, 24, 10, 13, 22);
    g.generateTexture('heart', 26, 24);
    g.destroy();
}

function createCrowBurstTexture(scene) {
    if (scene.textures.exists('crowburst')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 40;
    g.fillStyle(0xFFDD00, 0.6);
    g.fillCircle(s / 2, s / 2, 16);
    g.fillStyle(0xFFAA00, 0.4);
    g.fillCircle(s / 2, s / 2, 20);
    for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 / 8) * i;
        const x1 = s / 2 + Math.cos(a) * 12;
        const y1 = s / 2 + Math.sin(a) * 12;
        const x2 = s / 2 + Math.cos(a) * 20;
        const y2 = s / 2 + Math.sin(a) * 20;
        g.lineStyle(2, 0xFFFF00, 0.7);
        g.lineBetween(x1, y1, x2, y2);
    }
    g.generateTexture('crowburst', s, s);
    g.destroy();
}

function createGrassTexture(scene) {
    if (scene.textures.exists('grass')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 64;
    g.fillStyle(0x2D8C27);
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 30; i++) {
        const gx = Math.random() * s;
        const gy = Math.random() * s;
        g.fillStyle(Phaser.Math.Between(0, 1) ? 0x3A9D33 : 0x247A1F);
        g.fillRect(gx, gy, 2, 4);
    }
    g.generateTexture('grass', s, s);
    g.destroy();
}

function createBushTexture(scene) {
    if (scene.textures.exists('bush')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 36;
    g.fillStyle(0x1A6B14);
    g.fillCircle(s / 2 - 6, s / 2 + 2, 12);
    g.fillCircle(s / 2 + 6, s / 2 + 2, 12);
    g.fillCircle(s / 2, s / 2 - 6, 11);
    g.fillStyle(0x228B1B);
    g.fillCircle(s / 2 - 3, s / 2 - 3, 6);
    g.fillCircle(s / 2 + 4, s / 2 + 1, 5);
    g.generateTexture('bush', s, s);
    g.destroy();
}

function createFlowerTexture(scene) {
    if (scene.textures.exists('flower')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 16;
    const colors = [0xFF6699, 0xFFCC33, 0xFFFFFF, 0xCC66FF];
    const c = colors[Math.floor(Math.random() * colors.length)];
    for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 / 5) * i;
        g.fillStyle(c);
        g.fillCircle(s / 2 + Math.cos(a) * 4, s / 2 + Math.sin(a) * 4, 3);
    }
    g.fillStyle(0xFFFF00);
    g.fillCircle(s / 2, s / 2, 2);
    g.generateTexture('flower', s, s);
    g.destroy();
}

function createMudTexture(scene) {
    if (scene.textures.exists('mud')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 48;
    g.fillStyle(0x5C4033, 0.7);
    g.fillEllipse(s / 2, s / 2, s - 4, s - 8);
    g.fillStyle(0x4A3225, 0.5);
    g.fillEllipse(s / 2 - 6, s / 2 + 2, 10, 8);
    g.fillEllipse(s / 2 + 8, s / 2 - 2, 8, 6);
    // Mud bubbles
    g.fillStyle(0x6B5040, 0.6);
    g.fillCircle(s / 2 - 4, s / 2 - 4, 3);
    g.fillCircle(s / 2 + 6, s / 2 + 3, 2);
    g.generateTexture('mud', s, s);
    g.destroy();
}

function createIceTexture(scene) {
    if (scene.textures.exists('ice')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 48;
    g.fillStyle(0xAADDFF, 0.5);
    g.fillEllipse(s / 2, s / 2, s - 4, s - 8);
    g.fillStyle(0xCCEEFF, 0.3);
    g.fillEllipse(s / 2 - 5, s / 2 - 3, 12, 8);
    // Shine lines
    g.lineStyle(1, 0xFFFFFF, 0.4);
    g.lineBetween(s / 2 - 8, s / 2 - 4, s / 2 + 4, s / 2 - 6);
    g.lineBetween(s / 2 - 4, s / 2 + 2, s / 2 + 8, s / 2);
    g.generateTexture('ice', s, s);
    g.destroy();
}

function createPowerupTextures(scene) {
    const s = 24;

    // Speed power-up (lightning bolt - yellow)
    if (!scene.textures.exists('powerup_speed')) {
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0x00AA00, 0.4);
        g.fillCircle(s / 2, s / 2, 11);
        g.fillStyle(0xFFDD00);
        g.fillTriangle(s / 2 + 2, s / 2 - 8, s / 2 - 4, s / 2 + 1, s / 2 + 1, s / 2 + 1);
        g.fillTriangle(s / 2 - 1, s / 2, s / 2 + 5, s / 2, s / 2 - 1, s / 2 + 9);
        g.generateTexture('powerup_speed', s, s);
        g.destroy();
    }

    // Shield power-up (blue circle)
    if (!scene.textures.exists('powerup_shield')) {
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0x0044AA, 0.4);
        g.fillCircle(s / 2, s / 2, 11);
        g.fillStyle(0x44AAFF);
        g.fillEllipse(s / 2, s / 2, 14, 16);
        g.fillStyle(0x88CCFF);
        g.fillEllipse(s / 2, s / 2 - 2, 8, 10);
        g.generateTexture('powerup_shield', s, s);
        g.destroy();
    }

    // Magnet power-up (red horseshoe shape)
    if (!scene.textures.exists('powerup_magnet')) {
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xAA0000, 0.4);
        g.fillCircle(s / 2, s / 2, 11);
        g.lineStyle(4, 0xFF4444, 1.0);
        g.beginPath();
        g.arc(s / 2, s / 2 - 1, 7, Math.PI, 0, false);
        g.strokePath();
        g.fillStyle(0xFF4444);
        g.fillRect(s / 2 - 8, s / 2 - 1, 4, 8);
        g.fillRect(s / 2 + 4, s / 2 - 1, 4, 8);
        g.fillStyle(0xCCCCCC);
        g.fillRect(s / 2 - 8, s / 2 + 4, 4, 3);
        g.fillRect(s / 2 + 4, s / 2 + 4, 4, 3);
        g.generateTexture('powerup_magnet', s, s);
        g.destroy();
    }

    // Freeze power-up (snowflake - cyan)
    if (!scene.textures.exists('powerup_freeze')) {
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0x004488, 0.4);
        g.fillCircle(s / 2, s / 2, 11);
        g.lineStyle(2, 0xCCEEFF, 1.0);
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i;
            g.lineBetween(
                s / 2 + Math.cos(a) * 3, s / 2 + Math.sin(a) * 3,
                s / 2 + Math.cos(a) * 9, s / 2 + Math.sin(a) * 9
            );
        }
        g.fillStyle(0xFFFFFF);
        g.fillCircle(s / 2, s / 2, 2);
        g.generateTexture('powerup_freeze', s, s);
        g.destroy();
    }

    // Extra life power-up (heart)
    if (!scene.textures.exists('powerup_extralife')) {
        const g = scene.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0x880044, 0.4);
        g.fillCircle(s / 2, s / 2, 11);
        g.fillStyle(0xFF4488);
        g.fillCircle(s / 2 - 3, s / 2 - 2, 4);
        g.fillCircle(s / 2 + 3, s / 2 - 2, 4);
        g.fillTriangle(s / 2 - 7, s / 2, s / 2 + 7, s / 2, s / 2, s / 2 + 7);
        g.generateTexture('powerup_extralife', s, s);
        g.destroy();
    }
}

function createDashTrailTexture(scene) {
    if (scene.textures.exists('dashtrail')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xFFAA00, 0.5);
    g.fillCircle(8, 8, 6);
    g.fillStyle(0xFFDD44, 0.3);
    g.fillCircle(8, 8, 8);
    g.generateTexture('dashtrail', 16, 16);
    g.destroy();
}


// ===================================================================
//  BOOT SCENE  (title + story + leaderboard)
// ===================================================================

class BootScene extends Phaser.Scene {
    constructor() {
        super('BootScene');
    }

    preload() {
        generateAllTextures(this);
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;

        // Grass background
        this.add.tileSprite(0, 0, W, H, 'grass').setOrigin(0, 0);

        // Decorative bushes and flowers
        const decorPositions = [
            { x: 40,  y: 40  }, { x: W - 40, y: 40  },
            { x: 40,  y: H - 40 }, { x: W - 40, y: H - 40 },
            { x: W / 2, y: 40 }, { x: W / 2, y: H - 40 },
        ];
        decorPositions.forEach(pos => {
            this.add.image(pos.x, pos.y, 'bush').setScale(0.9).setAlpha(0.8);
        });
        for (let i = 0; i < 12; i++) {
            this.add.image(
                Phaser.Math.Between(30, W - 30),
                Phaser.Math.Between(30, H - 30),
                'flower'
            ).setAlpha(0.6);
        }

        // Semi-transparent panel
        const panel = this.add.graphics();
        panel.fillStyle(0x000000, 0.65);
        panel.fillRoundedRect(W / 2 - 200, 30, 400, H - 60, 20);

        // Title
        this.add.text(W / 2, 70, "Mr. Kluck's", {
            fontSize: '34px',
            fontFamily: 'Georgia, serif',
            fill: '#FFD700',
            stroke: '#8B4513',
            strokeThickness: 5,
        }).setOrigin(0.5);

        this.add.text(W / 2, 112, 'Egg Hunt!', {
            fontSize: '44px',
            fontFamily: 'Georgia, serif',
            fill: '#FFD700',
            stroke: '#8B4513',
            strokeThickness: 6,
        }).setOrigin(0.5);

        // Bouncing Mr Kluck sprite
        const kluck = this.add.image(W / 2, 170, 'player').setScale(2.5);
        this.tweens.add({
            targets: kluck,
            y: 180,
            yoyo: true,
            repeat: -1,
            duration: 500,
            ease: 'Sine.easeInOut',
        });

        // Story text
        const story = [
            'Oh no! The Easter Bunny has',
            'stolen all of Mr. Kluck\'s eggs!',
            'Help Mr. Kluck hunt them down',
            'before Easter arrives!',
        ].join('\n');

        this.add.text(W / 2, 240, story, {
            fontSize: '15px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFFFCC',
            align: 'center',
            lineSpacing: 5,
        }).setOrigin(0.5);

        // Controls hint
        const controls = [
            'WASD/Arrows: Move  |  SPACE: Crow Stun',
            'SHIFT: Dash  |  Collect power-ups!',
        ].join('\n');

        this.add.text(W / 2, 315, controls, {
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
            fill: '#AADDAA',
            align: 'center',
            lineSpacing: 3,
        }).setOrigin(0.5);

        // Leaderboard
        const stored = localStorage.getItem('mrkluckLeaderboard');
        const leaderboard = stored ? JSON.parse(stored) : [];

        let lbY = 355;
        this.add.text(W / 2, lbY, '--- High Scores ---', {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFD700',
            align: 'center',
        }).setOrigin(0.5);

        if (leaderboard.length === 0) {
            this.add.text(W / 2, lbY + 20, '(no scores yet)', {
                fontSize: '13px', fill: '#FFFFCC',
            }).setOrigin(0.5);
        } else {
            leaderboard.forEach((entry, i) => {
                this.add.text(W / 2, lbY + 18 + i * 18,
                    `${i + 1}. ${entry.name}  ${entry.score} pts  (Lv ${entry.level})`, {
                    fontSize: '13px',
                    fontFamily: 'Arial, sans-serif',
                    fill: '#FFFFCC',
                    align: 'center',
                }).setOrigin(0.5);
            });
        }

        // Version
        this.add.text(W / 2, H - 70, `v${APP_VERSION}`, {
            fontSize: '12px',
            fill: '#aaaaaa',
        }).setOrigin(0.5);

        // "Tap to play"
        const tapText = this.add.text(W / 2, H - 45, 'Tap or Press SPACE to Play', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFD700',
        }).setOrigin(0.5);

        this.tweens.add({
            targets: tapText,
            alpha: 0,
            yoyo: true,
            repeat: -1,
            duration: 700,
        });

        // Start game
        const startGame = () => {
            this.scene.start('GameScene', { level: 1, score: 0, lives: 3 });
        };
        this.input.keyboard.once('keydown-SPACE', startGame);
        this.input.once('pointerdown', startGame);
    }
}


// ===================================================================
//  GAME SCENE
// ===================================================================

class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    init(data) {
        this.currentLevel   = data.level  || 1;
        this.score          = data.score  || 0;
        this.lives          = data.lives  !== undefined ? data.lives : 3;
        this.eggsLeft       = 0;
        this.isInvincible   = false;
        this.invincibleTimer = null;
        this.crowReady      = true;
        this.crowCooldownTimer = null;
        this.paused         = false;
        this.levelComplete  = false;
        this.playerDead     = false;

        // Dash state
        this.dashReady      = true;
        this.isDashing      = false;
        this.dashCooldownTimer = null;
        this.dashDir        = { x: 0, y: 0 };

        // Combo state
        this.comboCount     = 0;
        this.comboMultiplier = 1;
        this.comboTimer     = null;

        // Power-up state
        this.activePowerups = {};  // { type: { timer, endTime } }
        this.powerupSpawnTimer = null;

        // Level timer
        this.levelTimeLeft  = 0;
        this.levelTimerEvent = null;

        // Boss state
        this.bossDefeated   = false;
        this.bossStunCount  = 0;
    }

    preload() {
        generateAllTextures(this);
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        const cfg = getLevelConfig(this.currentLevel);

        // ---- Background ----
        this.add.tileSprite(0, 0, W, H, 'grass').setOrigin(0, 0);

        // ---- Physics groups ----
        this.eggGroup     = this.physics.add.staticGroup();
        this.bunnyGroup   = this.physics.add.group();
        this.bushGroup    = this.physics.add.staticGroup();
        this.powerupGroup = this.physics.add.staticGroup();
        this.mudGroup     = this.physics.add.staticGroup();
        this.iceGroup     = this.physics.add.staticGroup();

        // ---- Spawn decorations / bushes ----
        for (let i = 0; i < cfg.bushes + 4; i++) {
            const pos = randomFieldPos(this, 50);
            const isBush = i < cfg.bushes;
            if (isBush) {
                this.bushGroup.create(pos.x, pos.y, 'bush');
            } else {
                this.add.image(pos.x, pos.y, 'flower').setAlpha(0.7);
            }
        }

        // ---- Spawn environmental hazards ----
        for (let i = 0; i < (cfg.mud || 0); i++) {
            const pos = randomFieldPos(this, 80);
            const mud = this.mudGroup.create(pos.x, pos.y, 'mud');
            mud.setAlpha(0.8).setDepth(1);
            // Make hitbox smaller than visual
            mud.body.setCircle(18, 6, 6);
        }
        for (let i = 0; i < (cfg.ice || 0); i++) {
            const pos = randomFieldPos(this, 80);
            const ice = this.iceGroup.create(pos.x, pos.y, 'ice');
            ice.setAlpha(0.7).setDepth(1);
            ice.body.setCircle(18, 6, 6);
        }

        // ---- Spawn player ----
        this.player = this.physics.add.sprite(W / 2, H / 2, 'player');
        this.player.setCollideWorldBounds(true);
        this.player.setDepth(10);
        this.shieldSprite = null;
        this.playerOnMud = false;
        this.playerOnIce = false;
        this.lastVelocity = { x: 0, y: 0 };

        // ---- Spawn eggs ----
        this.spawnEggs(cfg);

        // ---- Spawn bunnies ----
        this.spawnBunnies(cfg);

        // ---- Collisions ----
        this.physics.add.overlap(this.player, this.bunnyGroup, this.onCaughtByBunny, null, this);
        this.physics.add.overlap(this.player, this.eggGroup, this.onCollectEgg, null, this);
        this.physics.add.overlap(this.player, this.powerupGroup, this.onCollectPowerup, null, this);
        this.physics.add.collider(this.player, this.bushGroup);
        this.physics.add.collider(this.bunnyGroup, this.bushGroup);

        // ---- HUD ----
        this.createHUD();

        // ---- Input ----
        this.cursors   = this.input.keyboard.createCursorKeys();
        this.wasd      = this.input.keyboard.addKeys({
            up:    Phaser.Input.Keyboard.KeyCodes.W,
            down:  Phaser.Input.Keyboard.KeyCodes.S,
            left:  Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D,
        });
        this.crowKey   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.dashKey   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.setupTouchControls();

        // ---- Level timer ----
        const totalEggsForTime = (cfg.eggs || 0) + (cfg.golden || 0) + (cfg.chocolate || 0) + (cfg.rotten || 0);
        this.levelTimeLeft = BASE_LEVEL_TIME + totalEggsForTime * TIME_PER_EGG;
        this.levelTimerEvent = this.time.addEvent({
            delay: 1000,
            callback: this.tickLevelTimer,
            callbackScope: this,
            loop: true,
        });
        // Pause the timer during intro
        this.levelTimerEvent.paused = true;

        // ---- Power-up spawn timer ----
        this.powerupSpawnTimer = this.time.addEvent({
            delay: POWERUP_SPAWN_INTERVAL,
            callback: this.spawnPowerup,
            callbackScope: this,
            loop: true,
        });
        this.powerupSpawnTimer.paused = true;

        // ---- Level intro overlay ----
        this.showLevelIntro(cfg);
    }

    // ------------------------------------------------------------------
    //  Egg spawning
    // ------------------------------------------------------------------

    spawnEggs(cfg) {
        const totalCollectable = cfg.eggs + cfg.golden + (cfg.chocolate || 0);
        this.eggsLeft = totalCollectable;

        // Regular eggs
        for (let i = 0; i < cfg.eggs; i++) {
            const colorIdx = i % EGG_COLORS.length;
            const pos = this.findSafeSpawnPos(80);
            const egg = this.eggGroup.create(pos.x, pos.y, 'egg' + colorIdx);
            egg.setData('points', EGG_POINTS);
            egg.setData('eggType', 'normal');
            this.tweens.add({
                targets: egg,
                y: pos.y - 5,
                yoyo: true,
                repeat: -1,
                duration: 600 + i * 80,
                ease: 'Sine.easeInOut',
            });
        }

        // Golden eggs
        for (let i = 0; i < cfg.golden; i++) {
            const pos = this.findSafeSpawnPos(80);
            const egg = this.eggGroup.create(pos.x, pos.y, 'goldenegg');
            egg.setData('points', GOLDEN_EGG_POINTS);
            egg.setData('eggType', 'golden');
            this.tweens.add({
                targets: egg, angle: 360, repeat: -1, duration: 3000, ease: 'Linear',
            });
            this.tweens.add({
                targets: egg, scaleX: 1.15, scaleY: 1.15, yoyo: true, repeat: -1, duration: 800,
            });
        }

        // Chocolate eggs
        for (let i = 0; i < (cfg.chocolate || 0); i++) {
            const pos = this.findSafeSpawnPos(80);
            const egg = this.eggGroup.create(pos.x, pos.y, 'chocolateegg');
            egg.setData('points', CHOCOLATE_EGG_POINTS);
            egg.setData('eggType', 'chocolate');
            this.tweens.add({
                targets: egg, y: pos.y - 4, yoyo: true, repeat: -1,
                duration: 700 + i * 60, ease: 'Sine.easeInOut',
            });
        }

        // Rotten eggs (don't count toward eggsLeft — they're penalties)
        for (let i = 0; i < (cfg.rotten || 0); i++) {
            const pos = this.findSafeSpawnPos(80);
            const egg = this.eggGroup.create(pos.x, pos.y, 'rottenegg');
            egg.setData('points', ROTTEN_EGG_PENALTY);
            egg.setData('eggType', 'rotten');
            // Slight wobble
            this.tweens.add({
                targets: egg, angle: -10, yoyo: true, repeat: -1, duration: 400,
            });
        }
    }

    // ------------------------------------------------------------------
    //  Bunny spawning
    // ------------------------------------------------------------------

    spawnBunnies(cfg) {
        // Normal bunnies
        for (let i = 0; i < cfg.bunnies; i++) {
            const pos = this.findSafeSpawnPos(150);
            const bunny = this.bunnyGroup.create(pos.x, pos.y, 'bunny');
            bunny.setCollideWorldBounds(true);
            bunny.setData('speed', cfg.bunnySpeed + i * 10);
            bunny.setData('stunned', false);
            bunny.setData('stunnedTimer', null);
            bunny.setData('bunnyType', 'normal');
            bunny.setData('textureKey', 'bunny');
            bunny.setData('stunnedTextureKey', 'bunny_stunned');
            bunny.setDepth(9);
        }

        // Fast bunnies
        for (let i = 0; i < (cfg.fastBunnies || 0); i++) {
            const pos = this.findSafeSpawnPos(150);
            const bunny = this.bunnyGroup.create(pos.x, pos.y, 'fast_bunny');
            bunny.setCollideWorldBounds(true);
            bunny.setData('speed', cfg.bunnySpeed * 1.5 + i * 10);
            bunny.setData('stunned', false);
            bunny.setData('stunnedTimer', null);
            bunny.setData('bunnyType', 'fast');
            bunny.setData('textureKey', 'fast_bunny');
            bunny.setData('stunnedTextureKey', 'fast_bunny_stunned');
            bunny.setDepth(9);
        }

        // Patrol bunnies
        for (let i = 0; i < (cfg.patrolBunnies || 0); i++) {
            const pos = this.findSafeSpawnPos(120);
            const bunny = this.bunnyGroup.create(pos.x, pos.y, 'patrol_bunny');
            bunny.setCollideWorldBounds(true);
            bunny.setData('speed', cfg.bunnySpeed * 0.8);
            bunny.setData('stunned', false);
            bunny.setData('stunnedTimer', null);
            bunny.setData('bunnyType', 'patrol');
            bunny.setData('textureKey', 'patrol_bunny');
            bunny.setData('stunnedTextureKey', 'patrol_bunny_stunned');
            bunny.setData('patrolCenter', { x: pos.x, y: pos.y });
            bunny.setData('patrolRadius', 100 + i * 30);
            bunny.setData('patrolAngle', Math.random() * Math.PI * 2);
            bunny.setData('chaseRange', 120);
            bunny.setDepth(9);
        }

        // Boss bunny (on boss levels)
        if (cfg.boss) {
            const pos = this.findSafeSpawnPos(200);
            const bunny = this.bunnyGroup.create(pos.x, pos.y, 'boss_bunny');
            bunny.setCollideWorldBounds(true);
            bunny.setData('speed', cfg.bunnySpeed * 0.7);
            bunny.setData('stunned', false);
            bunny.setData('stunnedTimer', null);
            bunny.setData('bunnyType', 'boss');
            bunny.setData('textureKey', 'boss_bunny');
            bunny.setData('stunnedTextureKey', 'boss_bunny_stunned');
            bunny.setData('bossHP', 3);       // needs 3 stuns to defeat
            bunny.setData('bossMaxHP', 3);
            bunny.setScale(1.2);
            bunny.setDepth(9);
            this.bossDefeated = false;
        }
    }

    // ------------------------------------------------------------------
    //  HUD
    // ------------------------------------------------------------------

    createHUD() {
        const W = this.scale.width;

        // Black bar at top
        const hudBg = this.add.graphics();
        hudBg.fillStyle(0x000000, 0.7);
        hudBg.fillRect(0, 0, W, 54);
        hudBg.setDepth(20);

        // Level name
        const cfg = getLevelConfig(this.currentLevel);
        this.levelText = this.add.text(W / 2, 4, `Level ${this.currentLevel}: ${cfg.name}`, {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFFFCC',
        }).setOrigin(0.5, 0).setDepth(21);

        // Score
        this.scoreText = this.add.text(W / 2, 22, `Score: ${this.score}`, {
            fontSize: '13px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFD700',
        }).setOrigin(0.5, 0).setDepth(21);

        // Timer
        this.timerText = this.add.text(W / 2, 38, `Time: ${this.levelTimeLeft}s`, {
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFFFFF',
        }).setOrigin(0.5, 0).setDepth(21);

        // Eggs remaining
        this.eggsText = this.add.text(8, 36, `Eggs: ${this.eggsLeft}`, {
            fontSize: '13px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFFFFF',
        }).setOrigin(0, 0).setDepth(21);

        // Combo display
        this.comboText = this.add.text(8, 20, '', {
            fontSize: '13px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FF8800',
        }).setOrigin(0, 0).setDepth(21);

        // Lives (hearts)
        this.createHeartDisplay();

        // Active power-up indicators (below HUD bar)
        this.powerupIndicators = {};
        this.powerupIndicatorY = 58;

        // Crow power button
        this.crowLabel = this.add.text(W - 8, 4, 'CROW', {
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFD700',
            backgroundColor: '#440000',
            padding: { x: 3, y: 1 },
        }).setOrigin(1, 0).setDepth(21).setInteractive();
        this.crowLabel.on('pointerdown', () => { this.useCrowPower(); });

        // Dash indicator
        this.dashLabel = this.add.text(W - 8, 22, 'DASH', {
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FF8800',
            backgroundColor: '#442200',
            padding: { x: 3, y: 1 },
        }).setOrigin(1, 0).setDepth(21);

        // Pause button
        this.pauseBtn = this.add.text(8, 4, '|| Pause', {
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFFFFF',
            backgroundColor: '#222222',
            padding: { x: 3, y: 1 },
        }).setOrigin(0, 0).setDepth(21).setInteractive();
        this.pauseBtn.on('pointerdown', () => { this.togglePause(); });
    }

    createHeartDisplay() {
        if (this.heartImages) {
            this.heartImages.forEach(h => h.destroy());
        }
        this.heartImages = [];
        const W = this.scale.width;
        for (let i = 0; i < this.lives; i++) {
            const h = this.add.image(W - 14 - i * 26, 44, 'heart')
                .setDepth(21)
                .setScale(0.7);
            this.heartImages.push(h);
        }
    }

    updatePowerupIndicators() {
        const W = this.scale.width;
        let idx = 0;
        const activeTypes = Object.keys(this.activePowerups);

        // Remove old indicators
        Object.keys(this.powerupIndicators).forEach(key => {
            if (!this.activePowerups[key]) {
                if (this.powerupIndicators[key]) {
                    this.powerupIndicators[key].destroy();
                    delete this.powerupIndicators[key];
                }
            }
        });

        activeTypes.forEach(type => {
            const remaining = Math.max(0, Math.ceil((this.activePowerups[type].endTime - this.time.now) / 1000));
            const labels = {
                speed: 'SPD', shield: 'SHD', magnet: 'MAG', freeze: 'FRZ',
            };
            const colors = {
                speed: '#FFDD00', shield: '#44AAFF', magnet: '#FF4444', freeze: '#CCEEFF',
            };
            const label = labels[type] || type.toUpperCase().slice(0, 3);
            const color = colors[type] || '#FFFFFF';

            if (this.powerupIndicators[type]) {
                this.powerupIndicators[type].setText(`${label} ${remaining}s`);
            } else {
                this.powerupIndicators[type] = this.add.text(
                    W / 2 - 80 + idx * 60, this.powerupIndicatorY,
                    `${label} ${remaining}s`, {
                    fontSize: '11px',
                    fontFamily: 'Arial, sans-serif',
                    fill: color,
                    backgroundColor: '#000000',
                    padding: { x: 2, y: 1 },
                }).setOrigin(0.5, 0).setDepth(21);
            }
            idx++;
        });
    }

    showLevelIntro(cfg) {
        const W = this.scale.width;
        const H = this.scale.height;

        const overlay = this.add.graphics().setDepth(50);
        overlay.fillStyle(0x000000, 0.7);
        overlay.fillRect(0, 0, W, H);

        const t1 = this.add.text(W / 2, H / 2 - 90, `Level ${this.currentLevel}`, {
            fontSize: '48px',
            fontFamily: 'Georgia, serif',
            fill: '#FFD700',
            stroke: '#8B4513',
            strokeThickness: 5,
        }).setOrigin(0.5).setDepth(51);

        const t2 = this.add.text(W / 2, H / 2 - 30, cfg.name, {
            fontSize: '28px',
            fontFamily: 'Georgia, serif',
            fill: '#FFFFFF',
        }).setOrigin(0.5).setDepth(51);

        const eggCount = cfg.eggs + cfg.golden + (cfg.chocolate || 0);
        const t3 = this.add.text(W / 2, H / 2 + 20, `Find ${eggCount} eggs!  (Watch for rotten ones!)`, {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFFFCC',
        }).setOrigin(0.5).setDepth(51);

        // Environment hints
        const hints = [];
        if (cfg.mud > 0) hints.push('Mud patches slow you down');
        if (cfg.ice > 0) hints.push('Ice patches make you slide');
        if (cfg.boss) hints.push('BOSS BUNNY awaits! Stun it 3 times!');
        if (cfg.fastBunnies > 0) hints.push('Fast bunnies spotted!');
        if (cfg.patrolBunnies > 0) hints.push('Patrol bunnies guard the area');

        const hintText = hints.length > 0 ? hints.join('\n') : '';
        const t4 = this.add.text(W / 2, H / 2 + 55, hintText, {
            fontSize: '13px',
            fontFamily: 'Arial, sans-serif',
            fill: cfg.boss ? '#FF6644' : '#AADDAA',
            align: 'center',
            lineSpacing: 4,
        }).setOrigin(0.5).setDepth(51);

        const t5 = this.add.text(W / 2, H / 2 + 120, 'Tap or press any key', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            fill: '#AAAAAA',
        }).setOrigin(0.5).setDepth(51);

        const dismiss = () => {
            [overlay, t1, t2, t3, t4, t5].forEach(obj => obj.destroy());
            this.paused = false;
            if (this.levelTimerEvent) this.levelTimerEvent.paused = false;
            if (this.powerupSpawnTimer) this.powerupSpawnTimer.paused = false;
        };

        this.paused = true;
        this.time.delayedCall(800, () => {
            this.input.keyboard.once('keydown', dismiss);
            this.input.once('pointerdown', dismiss);
        });
    }

    // ------------------------------------------------------------------
    //  UPDATE LOOP
    // ------------------------------------------------------------------

    update(time, delta) {
        if (this.paused || this.levelComplete || this.playerDead) return;

        this.handleInput();
        this.updateBunnies();
        this.updateCrowLabel();
        this.updateDashLabel();
        this.updateMagnet();
        this.updateEnvironment();
        this.updatePowerupIndicators();
        this.updateComboDisplay();
        this.updateShieldSprite();
    }

    handleInput() {
        if (this.isDashing) return;  // can't change direction while dashing

        const left  = this.cursors.left.isDown  || this.wasd.left.isDown  || this.swipeDir === 'left';
        const right = this.cursors.right.isDown || this.wasd.right.isDown || this.swipeDir === 'right';
        const up    = this.cursors.up.isDown    || this.wasd.up.isDown    || this.swipeDir === 'up';
        const down  = this.cursors.down.isDown  || this.wasd.down.isDown  || this.swipeDir === 'down';

        this.swipeDir = null;

        const dLeft  = this.dpadState && this.dpadState.left;
        const dRight = this.dpadState && this.dpadState.right;
        const dUp    = this.dpadState && this.dpadState.up;
        const dDown  = this.dpadState && this.dpadState.down;

        let speed = PLAYER_SPEED;
        // Speed power-up
        if (this.activePowerups.speed) speed *= POWERUP_SPEED_MULT;
        // Mud slow
        if (this.playerOnMud && !this.activePowerups.speed) speed *= 0.5;

        let vx = 0, vy = 0;
        if (left  || dLeft)  vx = -speed;
        if (right || dRight) vx =  speed;
        if (up    || dUp)    vy = -speed;
        if (down  || dDown)  vy =  speed;

        // Diagonal speed normalization
        if (vx !== 0 && vy !== 0) {
            const diagonalSpeedFactor = 1 / Math.SQRT2;
            vx *= diagonalSpeedFactor;
            vy *= diagonalSpeedFactor;
        }

        // Ice: blend with last velocity for sliding effect
        if (this.playerOnIce && !this.isDashing) {
            const iceBlend = 0.08;
            vx = this.lastVelocity.x * (1 - iceBlend) + vx * iceBlend;
            vy = this.lastVelocity.y * (1 - iceBlend) + vy * iceBlend;
        }

        this.player.setVelocity(vx, vy);
        this.lastVelocity = { x: vx, y: vy };

        // Flip sprite based on direction
        if (vx < 0) this.player.setFlipX(true);
        if (vx > 0) this.player.setFlipX(false);

        // Crow power
        if (Phaser.Input.Keyboard.JustDown(this.crowKey)) {
            this.useCrowPower();
        }

        // Dash
        if (Phaser.Input.Keyboard.JustDown(this.dashKey)) {
            this.useDash();
        }
    }

    updateBunnies() {
        const px = this.player.x;
        const py = this.player.y;
        const allFrozen = !!this.activePowerups.freeze;

        this.bunnyGroup.getChildren().forEach(bunny => {
            if (bunny.getData('stunned')) return;

            // Freeze power-up stops all bunnies
            if (allFrozen) {
                bunny.setVelocity(0, 0);
                bunny.setTint(0x88BBFF);
                return;
            } else {
                bunny.clearTint();
            }

            const speed = bunny.getData('speed');
            const bunnyType = bunny.getData('bunnyType');

            if (bunnyType === 'patrol') {
                this.updatePatrolBunny(bunny, px, py, speed);
            } else if (bunnyType === 'boss') {
                this.updateBossBunny(bunny, px, py, speed);
            } else {
                // Normal and fast: chase player with wobble
                const angle = Phaser.Math.Angle.Between(bunny.x, bunny.y, px, py);
                const wobbleAmount = bunnyType === 'fast' ? 0.2 : 0.4;
                const wobble = Math.sin(this.time.now / 600 + bunny.x) * wobbleAmount;
                this.physics.velocityFromRotation(angle + wobble, speed, bunny.body.velocity);
            }

            // Flip sprite
            if (bunny.body.velocity.x < 0) bunny.setFlipX(true);
            else bunny.setFlipX(false);
        });
    }

    updatePatrolBunny(bunny, px, py, speed) {
        const center = bunny.getData('patrolCenter');
        const radius = bunny.getData('patrolRadius');
        const chaseRange = bunny.getData('chaseRange');

        const distToPlayer = Phaser.Math.Distance.Between(bunny.x, bunny.y, px, py);

        if (distToPlayer < chaseRange) {
            // Chase player when close
            const angle = Phaser.Math.Angle.Between(bunny.x, bunny.y, px, py);
            this.physics.velocityFromRotation(angle, speed * 1.1, bunny.body.velocity);
        } else {
            // Patrol in circle around center point
            let pa = bunny.getData('patrolAngle');
            pa += 0.015;
            bunny.setData('patrolAngle', pa);
            const targetX = center.x + Math.cos(pa) * radius;
            const targetY = center.y + Math.sin(pa) * radius;
            const angle = Phaser.Math.Angle.Between(bunny.x, bunny.y, targetX, targetY);
            this.physics.velocityFromRotation(angle, speed * 0.6, bunny.body.velocity);
        }
    }

    updateBossBunny(bunny, px, py, speed) {
        const dist = Phaser.Math.Distance.Between(bunny.x, bunny.y, px, py);
        const angle = Phaser.Math.Angle.Between(bunny.x, bunny.y, px, py);

        // Boss alternates between charging and circling
        const phase = Math.floor(this.time.now / 3000) % 2;
        if (phase === 0 || dist < 100) {
            // Charge at player
            this.physics.velocityFromRotation(angle, speed * 1.3, bunny.body.velocity);
        } else {
            // Circle around player
            const circleAngle = angle + Math.PI / 2;
            this.physics.velocityFromRotation(circleAngle, speed, bunny.body.velocity);
        }
    }

    updateCrowLabel() {
        if (this.crowReady) {
            this.crowLabel.setStyle({ fill: '#FFD700', backgroundColor: '#440000' });
            this.crowLabel.setText('CROW!');
        } else {
            this.crowLabel.setStyle({ fill: '#888888', backgroundColor: '#222222' });
            this.crowLabel.setText('crow...');
        }
    }

    updateDashLabel() {
        if (this.dashReady) {
            this.dashLabel.setStyle({ fill: '#FF8800', backgroundColor: '#442200' });
            this.dashLabel.setText('DASH!');
        } else {
            this.dashLabel.setStyle({ fill: '#888888', backgroundColor: '#222222' });
            this.dashLabel.setText('dash...');
        }
    }

    updateMagnet() {
        if (!this.activePowerups.magnet) return;

        this.eggGroup.getChildren().forEach(egg => {
            if (egg.getData('eggType') === 'rotten') return;  // don't attract rotten eggs
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, egg.x, egg.y);
            if (dist < POWERUP_MAGNET_RADIUS) {
                const angle = Phaser.Math.Angle.Between(egg.x, egg.y, this.player.x, this.player.y);
                const pullSpeed = 3;
                egg.x += Math.cos(angle) * pullSpeed;
                egg.y += Math.sin(angle) * pullSpeed;
                egg.body.reset(egg.x, egg.y);
            }
        });
    }

    updateEnvironment() {
        // Check mud overlap
        this.playerOnMud = false;
        this.mudGroup.getChildren().forEach(mud => {
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, mud.x, mud.y);
            if (dist < 24) this.playerOnMud = true;
        });

        // Check ice overlap
        this.playerOnIce = false;
        this.iceGroup.getChildren().forEach(ice => {
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, ice.x, ice.y);
            if (dist < 24) this.playerOnIce = true;
        });
    }

    updateShieldSprite() {
        if (this.shieldSprite && this.shieldSprite.active) {
            this.shieldSprite.setPosition(this.player.x, this.player.y);
        }
    }

    updateComboDisplay() {
        if (this.comboMultiplier > 1) {
            this.comboText.setText(`x${this.comboMultiplier} COMBO!`);
            this.comboText.setStyle({ fill: this.comboMultiplier >= 4 ? '#FF4400' : '#FF8800' });
        } else {
            this.comboText.setText('');
        }
    }

    // ------------------------------------------------------------------
    //  Level timer
    // ------------------------------------------------------------------

    tickLevelTimer() {
        if (this.paused || this.levelComplete || this.playerDead) return;
        this.levelTimeLeft--;
        this.timerText.setText(`Time: ${this.levelTimeLeft}s`);

        if (this.levelTimeLeft <= 10) {
            this.timerText.setStyle({ fill: '#FF4444', fontSize: '13px' });
        }

        if (this.levelTimeLeft <= 0) {
            // Time's up — lose a life
            this.lives--;
            this.createHeartDisplay();
            this.cameras.main.flash(400, 255, 100, 0);

            if (this.lives <= 0) {
                this.gameOver();
            } else {
                // Show warning and restart level with remaining lives
                this.showTimeUpWarning();
            }
        }
    }

    showTimeUpWarning() {
        const W = this.scale.width;
        const H = this.scale.height;

        this.paused = true;
        this.player.setVelocity(0, 0);
        this.bunnyGroup.getChildren().forEach(b => b.setVelocity(0, 0));

        const overlay = this.add.graphics().setDepth(60);
        overlay.fillStyle(0x000000, 0.7);
        overlay.fillRect(0, 0, W, H);

        const t1 = this.add.text(W / 2, H / 2 - 30, "Time's Up!", {
            fontSize: '36px', fontFamily: 'Georgia, serif',
            fill: '#FF6644', stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(61);

        const t2 = this.add.text(W / 2, H / 2 + 20, 'You lost a life! Retrying level...', {
            fontSize: '16px', fontFamily: 'Arial, sans-serif', fill: '#FFFFCC',
        }).setOrigin(0.5).setDepth(61);

        this.time.delayedCall(2000, () => {
            this.scene.start('GameScene', {
                level: this.currentLevel,
                score: this.score,
                lives: this.lives,
            });
        });
    }

    // ------------------------------------------------------------------
    //  DASH
    // ------------------------------------------------------------------

    useDash() {
        if (!this.dashReady || this.isDashing) return;

        const vx = this.player.body.velocity.x;
        const vy = this.player.body.velocity.y;
        if (vx === 0 && vy === 0) return;  // need to be moving

        this.isDashing = true;
        this.dashReady = false;

        // Normalize direction
        const mag = Math.sqrt(vx * vx + vy * vy);
        this.dashDir = { x: vx / mag, y: vy / mag };

        this.player.setVelocity(this.dashDir.x * DASH_SPEED, this.dashDir.y * DASH_SPEED);

        // Temporary invincibility during dash
        this.isInvincible = true;

        // Trail effect
        const trailInterval = this.time.addEvent({
            delay: 30,
            callback: () => {
                const trail = this.add.image(this.player.x, this.player.y, 'dashtrail')
                    .setDepth(8).setAlpha(0.6);
                this.tweens.add({
                    targets: trail, alpha: 0, scaleX: 0.3, scaleY: 0.3,
                    duration: 300, onComplete: () => trail.destroy(),
                });
            },
            repeat: Math.floor(DASH_DURATION / 30),
        });

        // End dash
        this.time.delayedCall(DASH_DURATION, () => {
            this.isDashing = false;
            if (!this.invincibleTimer) {
                this.isInvincible = false;
            }
            trailInterval.remove();
        });

        // Cooldown
        this.dashCooldownTimer = this.time.delayedCall(DASH_COOLDOWN, () => {
            this.dashReady = true;
        });
    }

    // ------------------------------------------------------------------
    //  CROW POWER
    // ------------------------------------------------------------------

    useCrowPower() {
        if (!this.crowReady) return;
        this.crowReady = false;

        const burst = this.add.image(this.player.x, this.player.y, 'crowburst')
            .setDepth(15).setAlpha(0.9);
        this.tweens.add({
            targets: burst, scaleX: 3.5, scaleY: 3.5, alpha: 0,
            duration: 600, onComplete: () => burst.destroy(),
        });

        this.bunnyGroup.getChildren().forEach(bunny => {
            const dist = Phaser.Math.Distance.Between(
                this.player.x, this.player.y, bunny.x, bunny.y
            );
            if (dist < CROW_STUN_RADIUS) {
                this.stunBunny(bunny);
            }
        });

        if (this.crowCooldownTimer) this.crowCooldownTimer.remove();
        this.crowCooldownTimer = this.time.delayedCall(CROW_COOLDOWN, () => {
            this.crowReady = true;
        });
    }

    stunBunny(bunny) {
        const bunnyType = bunny.getData('bunnyType');

        // Boss requires multiple stuns
        if (bunnyType === 'boss') {
            let hp = bunny.getData('bossHP');
            hp--;
            bunny.setData('bossHP', hp);

            // Show HP
            const hpText = this.add.text(bunny.x, bunny.y - 30,
                `HP: ${hp}/${bunny.getData('bossMaxHP')}`, {
                fontSize: '14px', fill: '#FF4444', stroke: '#000', strokeThickness: 2,
            }).setOrigin(0.5).setDepth(15);
            this.tweens.add({
                targets: hpText, y: hpText.y - 30, alpha: 0,
                duration: 1200, onComplete: () => hpText.destroy(),
            });

            if (hp <= 0) {
                // Boss defeated!
                this.bossDefeated = true;
                const defeatText = this.add.text(bunny.x, bunny.y - 20, 'BOSS DEFEATED!', {
                    fontSize: '20px', fill: '#FFD700', stroke: '#000', strokeThickness: 3,
                }).setOrigin(0.5).setDepth(30);
                this.tweens.add({
                    targets: defeatText, y: defeatText.y - 60, alpha: 0,
                    duration: 2000, onComplete: () => defeatText.destroy(),
                });
                // Big score bonus
                this.score += 200;
                this.scoreText.setText(`Score: ${this.score}`);
                bunny.destroy();
                this.cameras.main.flash(500, 255, 215, 0);
                return;
            }
        }

        bunny.setData('stunned', true);
        bunny.setVelocity(0, 0);
        bunny.setTexture(bunny.getData('stunnedTextureKey'));

        const starText = this.add.text(bunny.x, bunny.y - 20, '***', {
            fontSize: '16px', fill: '#FFFF00',
        }).setDepth(15);
        this.tweens.add({
            targets: starText, y: bunny.y - 50, alpha: 0,
            duration: CROW_STUN_DURATION, onComplete: () => starText.destroy(),
        });

        const existingTimer = bunny.getData('stunnedTimer');
        if (existingTimer) existingTimer.remove();

        const stunDur = bunnyType === 'boss' ? CROW_STUN_DURATION * 0.6 : CROW_STUN_DURATION;
        const t = this.time.delayedCall(stunDur, () => {
            if (bunny && bunny.active) {
                bunny.setData('stunned', false);
                bunny.setTexture(bunny.getData('textureKey'));
                bunny.clearTint();
            }
        });
        bunny.setData('stunnedTimer', t);
    }

    // ------------------------------------------------------------------
    //  POWER-UPS
    // ------------------------------------------------------------------

    spawnPowerup() {
        if (this.paused || this.levelComplete || this.playerDead) return;

        // Limit active power-ups on field
        if (this.powerupGroup.getChildren().length >= 2) return;

        const type = POWERUP_TYPES[Phaser.Math.Between(0, POWERUP_TYPES.length - 1)];
        // Don't spawn extra life if already at 5
        if (type === 'extralife' && this.lives >= 5) return;

        const pos = this.findSafeSpawnPos(60);
        const pu = this.powerupGroup.create(pos.x, pos.y, 'powerup_' + type);
        pu.setData('powerupType', type);
        pu.setDepth(8);

        // Pulsing glow
        this.tweens.add({
            targets: pu, scaleX: 1.3, scaleY: 1.3,
            yoyo: true, repeat: -1, duration: 500,
        });

        // Auto-destroy after lifetime
        this.time.delayedCall(POWERUP_LIFETIME, () => {
            if (pu && pu.active) {
                this.tweens.add({
                    targets: pu, alpha: 0, duration: 500,
                    onComplete: () => { if (pu.active) pu.destroy(); },
                });
            }
        });
    }

    onCollectPowerup(player, pu) {
        const type = pu.getData('powerupType');
        pu.destroy();

        // Floating label
        const labels = {
            speed: 'SPEED!', shield: 'SHIELD!', magnet: 'MAGNET!',
            freeze: 'FREEZE!', extralife: '+1 LIFE!',
        };
        const colors = {
            speed: '#FFDD00', shield: '#44AAFF', magnet: '#FF4444',
            freeze: '#CCEEFF', extralife: '#FF88CC',
        };

        const floatText = this.add.text(player.x, player.y - 20, labels[type], {
            fontSize: '18px', fontFamily: 'Arial, sans-serif',
            fill: colors[type], stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(30);
        this.tweens.add({
            targets: floatText, y: floatText.y - 50, alpha: 0,
            duration: 1000, onComplete: () => floatText.destroy(),
        });

        this.cameras.main.flash(150, 100, 200, 255, false);

        if (type === 'extralife') {
            this.lives = Math.min(this.lives + 1, 5);
            this.createHeartDisplay();
            return;
        }

        // Duration-based power-ups
        const durations = {
            speed: POWERUP_SPEED_DURATION,
            shield: POWERUP_SHIELD_DURATION,
            magnet: POWERUP_MAGNET_DURATION,
            freeze: POWERUP_FREEZE_DURATION,
        };

        // Cancel existing timer if refreshing
        if (this.activePowerups[type] && this.activePowerups[type].timer) {
            this.activePowerups[type].timer.remove();
        }

        const duration = durations[type];
        const timer = this.time.delayedCall(duration, () => {
            this.deactivatePowerup(type);
        });

        this.activePowerups[type] = {
            timer: timer,
            endTime: this.time.now + duration,
        };

        // Apply immediate effects
        if (type === 'shield') {
            this.isInvincible = true;
            if (!this.shieldSprite) {
                this.shieldSprite = this.add.image(this.player.x, this.player.y, 'player_shield')
                    .setDepth(11).setAlpha(0.6);
            }
        }

        if (type === 'freeze') {
            // Visual feedback — screen flash blue
            this.cameras.main.flash(300, 100, 150, 255, false);
        }
    }

    deactivatePowerup(type) {
        delete this.activePowerups[type];

        if (type === 'shield') {
            if (!this.invincibleTimer) {
                this.isInvincible = false;
            }
            if (this.shieldSprite) {
                this.shieldSprite.destroy();
                this.shieldSprite = null;
            }
        }

        if (type === 'freeze') {
            // Unfreeze all bunnies visually
            this.bunnyGroup.getChildren().forEach(b => b.clearTint());
        }

        // Clean up indicator
        if (this.powerupIndicators[type]) {
            this.powerupIndicators[type].destroy();
            delete this.powerupIndicators[type];
        }
    }

    // ------------------------------------------------------------------
    //  COLLISION HANDLERS
    // ------------------------------------------------------------------

    onCaughtByBunny(player, bunny) {
        if (this.isInvincible) return;
        if (bunny.getData('stunned')) return;

        this.lives--;
        this.createHeartDisplay();

        // Reset combo
        this.comboCount = 0;
        this.comboMultiplier = 1;

        if (this.lives <= 0) {
            this.gameOver();
            return;
        }

        this.isInvincible = true;
        this.player.setTexture('player_stunned');

        this.tweens.add({
            targets: this.player, alpha: 0, yoyo: true, repeat: 7, duration: 200,
            onComplete: () => {
                if (this.player.active) {
                    this.player.setAlpha(1);
                    this.player.setTexture('player');
                }
            },
        });

        this.cameras.main.flash(300, 255, 0, 0);

        if (this.invincibleTimer) this.invincibleTimer.remove();
        this.invincibleTimer = this.time.delayedCall(INVINCIBLE_DURATION, () => {
            if (!this.activePowerups.shield) {
                this.isInvincible = false;
            }
            this.invincibleTimer = null;
            if (this.player.active) this.player.setTexture('player');
        });
    }

    onCollectEgg(player, egg) {
        const basePoints = egg.getData('points');
        const eggType = egg.getData('eggType');

        if (eggType === 'rotten') {
            // Rotten egg penalty
            this.score = Math.max(0, this.score + basePoints);
            this.scoreText.setText(`Score: ${this.score}`);

            // Stun player briefly
            const floatText = this.add.text(egg.x, egg.y, `${basePoints}`, {
                fontSize: '20px', fontFamily: 'Arial, sans-serif',
                fill: '#88AA22', stroke: '#000000', strokeThickness: 3,
            }).setOrigin(0.5).setDepth(30);
            this.tweens.add({
                targets: floatText, y: floatText.y - 50, alpha: 0,
                duration: 800, onComplete: () => floatText.destroy(),
            });

            this.cameras.main.flash(200, 100, 150, 0, false);

            // Brief slowdown
            this.player.setVelocity(0, 0);
            const wasPaused = this.paused;
            this.paused = true;
            this.time.delayedCall(500, () => {
                this.paused = wasPaused;
            });

            // Reset combo
            this.comboCount = 0;
            this.comboMultiplier = 1;

            egg.destroy();
            return;
        }

        // Good egg collected
        // Combo system
        this.comboCount++;
        if (this.comboCount >= 2) {
            this.comboMultiplier = Math.min(this.comboCount, COMBO_MAX_MULT);
        } else {
            this.comboMultiplier = 1;
        }

        // Reset combo timer
        if (this.comboTimer) this.comboTimer.remove();
        this.comboTimer = this.time.delayedCall(COMBO_WINDOW, () => {
            this.comboCount = 0;
            this.comboMultiplier = 1;
        });

        const points = basePoints * this.comboMultiplier;
        this.score += points;
        this.eggsLeft--;

        // Floating score text
        const comboStr = this.comboMultiplier > 1 ? ` x${this.comboMultiplier}` : '';
        const floatText = this.add.text(egg.x, egg.y, `+${points}${comboStr}`, {
            fontSize: this.comboMultiplier > 1 ? '24px' : '20px',
            fontFamily: 'Arial, sans-serif',
            fill: eggType === 'golden' ? '#FFD700' : eggType === 'chocolate' ? '#D2691E' : '#FFFFFF',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(30);

        this.tweens.add({
            targets: floatText, y: floatText.y - 50, alpha: 0,
            duration: 800, onComplete: () => floatText.destroy(),
        });

        // Camera flash
        if (eggType === 'golden') {
            this.cameras.main.flash(200, 255, 215, 0, false);
        } else if (eggType === 'chocolate') {
            this.cameras.main.flash(100, 100, 50, 0, false);
            // Chocolate gives brief speed boost
            if (!this.activePowerups.speed) {
                const timer = this.time.delayedCall(2000, () => {
                    this.deactivatePowerup('speed');
                });
                this.activePowerups.speed = { timer, endTime: this.time.now + 2000 };
            }
        } else {
            this.cameras.main.flash(100, 0, 200, 0, false);
        }

        // Update HUD
        this.scoreText.setText(`Score: ${this.score}`);
        this.eggsText.setText(`Eggs: ${this.eggsLeft}`);

        egg.destroy();

        if (this.eggsLeft <= 0) {
            this.levelComplete = true;
            this.time.delayedCall(300, () => {
                this.completeLevelTransition();
            });
        }
    }

    // ------------------------------------------------------------------
    //  LEVEL TRANSITIONS
    // ------------------------------------------------------------------

    completeLevelTransition() {
        const W = this.scale.width;
        const H = this.scale.height;

        this.bunnyGroup.getChildren().forEach(b => b.setVelocity(0, 0));
        this.player.setVelocity(0, 0);
        if (this.levelTimerEvent) this.levelTimerEvent.paused = true;
        if (this.powerupSpawnTimer) this.powerupSpawnTimer.paused = true;

        // Time bonus
        const timeBonus = this.levelTimeLeft * TIME_BONUS_MULTIPLIER;
        this.score += timeBonus;

        const overlay = this.add.graphics().setDepth(60);
        overlay.fillStyle(0x000000, 0.7);
        overlay.fillRect(0, 0, W, H);

        this.add.text(W / 2, H / 2 - 90, 'Level Complete!', {
            fontSize: '30px', fontFamily: 'Georgia, serif',
            fill: '#FFD700', stroke: '#8B4513', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(61);

        this.add.text(W / 2, H / 2 - 40, `Score: ${this.score}`, {
            fontSize: '22px', fontFamily: 'Arial, sans-serif', fill: '#FFFFFF',
        }).setOrigin(0.5).setDepth(61);

        this.add.text(W / 2, H / 2, `Time Bonus: +${timeBonus}`, {
            fontSize: '18px', fontFamily: 'Arial, sans-serif',
            fill: '#88FF88',
        }).setOrigin(0.5).setDepth(61);

        if (this.comboMultiplier > 1) {
            this.add.text(W / 2, H / 2 + 30, `Best Combo: x${this.comboMultiplier}`, {
                fontSize: '16px', fontFamily: 'Arial, sans-serif', fill: '#FF8800',
            }).setOrigin(0.5).setDepth(61);
        }

        const nextLevel = this.currentLevel + 1;
        this.add.text(W / 2, H / 2 + 60, `Next: Level ${nextLevel}`, {
            fontSize: '20px', fontFamily: 'Arial, sans-serif', fill: '#FFFFCC',
        }).setOrigin(0.5).setDepth(61);

        const cont = this.add.text(W / 2, H / 2 + 100, 'Tap or press any key', {
            fontSize: '16px', fontFamily: 'Arial, sans-serif', fill: '#AAAAAA',
        }).setOrigin(0.5).setDepth(61);
        this.tweens.add({ targets: cont, alpha: 0, yoyo: true, repeat: -1, duration: 600 });

        const goNext = () => {
            this.scene.start('GameScene', {
                level: nextLevel,
                score: this.score,
                lives: this.lives,
            });
        };

        this.time.delayedCall(800, () => {
            this.input.keyboard.once('keydown', goNext);
            this.input.once('pointerdown', goNext);
        });
    }

    gameOver() {
        this.playerDead = true;
        this.player.setVelocity(0, 0);
        this.bunnyGroup.getChildren().forEach(b => b.setVelocity(0, 0));
        if (this.levelTimerEvent) this.levelTimerEvent.paused = true;
        if (this.powerupSpawnTimer) this.powerupSpawnTimer.paused = true;

        // Save score to leaderboard
        const stored = localStorage.getItem('mrkluckLeaderboard');
        let lb = stored ? JSON.parse(stored) : [];
        const initials = 'MRK';
        lb.push({ name: initials, score: this.score, level: this.currentLevel });
        lb.sort((a, b) => b.score - a.score);
        lb = lb.slice(0, 5);
        localStorage.setItem('mrkluckLeaderboard', JSON.stringify(lb));

        const W = this.scale.width;
        const H = this.scale.height;

        const overlay = this.add.graphics().setDepth(60);
        overlay.fillStyle(0x000000, 0.75);
        overlay.fillRect(0, 0, W, H);

        this.add.text(W / 2, H / 2 - 90, 'GAME OVER', {
            fontSize: '44px', fontFamily: 'Georgia, serif',
            fill: '#FF3333', stroke: '#000000', strokeThickness: 6,
        }).setOrigin(0.5).setDepth(61);

        this.add.text(W / 2, H / 2 - 30, 'The Easter Bunny caught you!', {
            fontSize: '18px', fontFamily: 'Arial, sans-serif', fill: '#FFFFCC',
        }).setOrigin(0.5).setDepth(61);

        this.add.text(W / 2, H / 2 + 10, `Final Score: ${this.score}`, {
            fontSize: '24px', fontFamily: 'Arial, sans-serif', fill: '#FFD700',
        }).setOrigin(0.5).setDepth(61);

        this.add.text(W / 2, H / 2 + 50, `Reached Level: ${this.currentLevel}`, {
            fontSize: '18px', fontFamily: 'Arial, sans-serif', fill: '#FFFFFF',
        }).setOrigin(0.5).setDepth(61);

        const tap = this.add.text(W / 2, H / 2 + 110, 'Tap to return to menu', {
            fontSize: '16px', fontFamily: 'Arial, sans-serif', fill: '#AAAAAA',
        }).setOrigin(0.5).setDepth(61);
        this.tweens.add({ targets: tap, alpha: 0, yoyo: true, repeat: -1, duration: 700 });

        this.time.delayedCall(1000, () => {
            const goMenu = () => { this.scene.start('BootScene'); };
            this.input.keyboard.once('keydown', goMenu);
            this.input.once('pointerdown', goMenu);
        });
    }

    togglePause() {
        this.paused = !this.paused;
        if (this.paused) {
            this.pauseBtn.setText('> Resume');
            this.player.setVelocity(0, 0);
            this.bunnyGroup.getChildren().forEach(b => b.setVelocity(0, 0));
            if (this.levelTimerEvent) this.levelTimerEvent.paused = true;
            if (this.powerupSpawnTimer) this.powerupSpawnTimer.paused = true;

            const W = this.scale.width;
            const H = this.scale.height;
            this.pauseOverlay = this.add.graphics().setDepth(55);
            this.pauseOverlay.fillStyle(0x000000, 0.6);
            this.pauseOverlay.fillRect(0, 0, W, H);
            this.pausedText = this.add.text(W / 2, H / 2, 'PAUSED', {
                fontSize: '48px', fontFamily: 'Georgia, serif',
                fill: '#FFD700', stroke: '#000000', strokeThickness: 5,
            }).setOrigin(0.5).setDepth(56);
        } else {
            this.pauseBtn.setText('|| Pause');
            if (this.levelTimerEvent) this.levelTimerEvent.paused = false;
            if (this.powerupSpawnTimer) this.powerupSpawnTimer.paused = false;
            if (this.pauseOverlay) { this.pauseOverlay.destroy(); this.pauseOverlay = null; }
            if (this.pausedText)   { this.pausedText.destroy();   this.pausedText   = null; }
        }
    }

    // ------------------------------------------------------------------
    //  Touch controls
    // ------------------------------------------------------------------

    setupTouchControls() {
        this.swipeDir  = null;
        this.dpadState = { left: false, right: false, up: false, down: false };

        let sx, sy;
        this.input.on('pointerdown', p => { sx = p.downX; sy = p.downY; });
        this.input.on('pointerup', p => {
            const dx = p.upX - sx;
            const dy = p.upY - sy;
            const SWIPE_MIN = 30;
            if (Math.abs(dx) > Math.abs(dy)) {
                if (Math.abs(dx) > SWIPE_MIN) this.swipeDir = dx > 0 ? 'right' : 'left';
            } else {
                if (Math.abs(dy) > SWIPE_MIN) this.swipeDir = dy > 0 ? 'down' : 'up';
            }
        });

        this.createDPad();
    }

    createDPad() {
        const W = this.scale.width;
        const H = this.scale.height;

        const dpSize = 44;
        const dpX = 60;
        const dpY = H - 80;
        const alpha = 0.5;

        const makeBtn = (label, bx, by, dir) => {
            const bg = this.add.graphics().setDepth(25).setAlpha(alpha);
            bg.fillStyle(0x444444);
            bg.fillRoundedRect(bx - dpSize / 2, by - dpSize / 2, dpSize, dpSize, 8);

            this.add.text(bx, by, label, {
                fontSize: '20px', fill: '#FFFFFF',
            }).setOrigin(0.5).setDepth(26);

            const zone = this.add.zone(bx, by, dpSize, dpSize)
                .setInteractive().setDepth(27);
            zone.on('pointerdown', () => { this.dpadState[dir] = true;  });
            zone.on('pointerup',   () => { this.dpadState[dir] = false; });
            zone.on('pointerout',  () => { this.dpadState[dir] = false; });
        };

        makeBtn('<', dpX - dpSize,  dpY,          'left');
        makeBtn('>', dpX + dpSize,  dpY,          'right');
        makeBtn('^', dpX,           dpY - dpSize, 'up');
        makeBtn('v', dpX,           dpY + dpSize, 'down');

        // Crow button (bottom-right)
        const crowBtnX = W - 60;
        const crowBtnY = H - 100;
        const crowBg = this.add.graphics().setDepth(25).setAlpha(alpha);
        crowBg.fillStyle(0x882200);
        crowBg.fillCircle(crowBtnX, crowBtnY, 28);

        this.add.text(crowBtnX, crowBtnY, 'CROW', {
            fontSize: '12px', fill: '#FFDD00',
        }).setOrigin(0.5).setDepth(26);

        const crowZone = this.add.zone(crowBtnX, crowBtnY, 56, 56)
            .setInteractive().setDepth(27);
        crowZone.on('pointerdown', () => { this.useCrowPower(); });

        // Dash button (bottom-right, below crow)
        const dashBtnX = W - 60;
        const dashBtnY = H - 45;
        const dashBg = this.add.graphics().setDepth(25).setAlpha(alpha);
        dashBg.fillStyle(0x884400);
        dashBg.fillCircle(dashBtnX, dashBtnY, 24);

        this.add.text(dashBtnX, dashBtnY, 'DASH', {
            fontSize: '11px', fill: '#FFAA00',
        }).setOrigin(0.5).setDepth(26);

        const dashZone = this.add.zone(dashBtnX, dashBtnY, 48, 48)
            .setInteractive().setDepth(27);
        dashZone.on('pointerdown', () => { this.useDash(); });
    }

    // ------------------------------------------------------------------
    //  Utility
    // ------------------------------------------------------------------

    findSafeSpawnPos(minDistFromPlayer) {
        const W = this.scale.width;
        const H = this.scale.height;
        const MARGIN = 70;
        const MAX_TRIES = 50;
        const pd = minDistFromPlayer || 80;

        for (let i = 0; i < MAX_TRIES; i++) {
            const x = Phaser.Math.Between(MARGIN, W - MARGIN);
            const y = Phaser.Math.Between(MARGIN + 70, H - MARGIN);
            if (this.player) {
                const dist = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
                if (dist >= pd) return { x, y };
            } else {
                return { x, y };
            }
        }
        return {
            x: Phaser.Math.Between(MARGIN, W - MARGIN),
            y: Phaser.Math.Between(MARGIN + 70, H - MARGIN),
        };
    }
}


// ===================================================================
//  PHASER GAME CONFIGURATION
// ===================================================================

const config = {
    type: Phaser.AUTO,
    backgroundColor: '#2D8C27',
    scene: [BootScene, GameScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: window.innerWidth,
        height: window.innerHeight,
        parent: 'game-container',
    },
    render: {
        pixelArt: false,
        antialias: true,
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false,
        },
    },
};

const game = new Phaser.Game(config);
