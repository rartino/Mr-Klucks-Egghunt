/********************************************************************
 * game.js
 * Mr. Kluck's Egg Hunt
 *
 * Mr. Kluck the rooster has had his precious Easter eggs stolen by
 * the mischievous Easter Bunny! Help him hunt them all down across
 * a series of exciting levels before the Easter Bunny catches him!
 *
 * Controls: Arrow keys / WASD  or  touch swipe / on-screen D-pad
 *
 * Features:
 *  - Multiple progressive levels with increasing difficulty
 *  - Regular eggs + special golden eggs worth bonus points
 *  - Easter Bunny enemies with chase AI
 *  - Lives system, score, and leaderboard
 *  - Fully installable Progressive Web App
 ********************************************************************/

const APP_VERSION = window.APP_VERSION || '(Unknown)';

// ---- Player constants ----
const PLAYER_SPEED = 160;
const INVINCIBLE_DURATION = 2000; // ms of invincibility after being caught
const CROW_COOLDOWN = 5000;       // ms between crow power uses
const CROW_STUN_RADIUS = 120;     // pixels - radius of crow stun effect
const CROW_STUN_DURATION = 2500;  // ms bunnies are stunned after crow

// ---- Egg point values ----
const EGG_POINTS = 10;
const GOLDEN_EGG_POINTS = 50;

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
const LEVEL_CONFIGS = [
    { name: "The Barnyard",   eggs: 5,  golden: 1, bunnies: 1, bunnySpeed: 65,  bushes: 3  },
    { name: "The Garden",     eggs: 7,  golden: 1, bunnies: 1, bunnySpeed: 85,  bushes: 5  },
    { name: "The Meadow",     eggs: 9,  golden: 2, bunnies: 2, bunnySpeed: 85,  bushes: 6  },
    { name: "The Forest",     eggs: 11, golden: 2, bunnies: 2, bunnySpeed: 105, bushes: 8  },
    { name: "The Burrow",     eggs: 13, golden: 3, bunnies: 3, bunnySpeed: 105, bushes: 8  },
    { name: "Easter HQ",      eggs: 15, golden: 3, bunnies: 3, bunnySpeed: 125, bushes: 10 },
];

function getLevelConfig(level) {
    if (level <= LEVEL_CONFIGS.length) {
        return Object.assign({}, LEVEL_CONFIGS[level - 1]);
    }
    const last = LEVEL_CONFIGS[LEVEL_CONFIGS.length - 1];
    const extra = level - LEVEL_CONFIGS.length;
    return {
        name: `Level ${level}`,
        eggs:        last.eggs        + extra * 2,
        golden:      Math.min(last.golden      + Math.floor(extra / 2), 6),
        bunnies:     Math.min(last.bunnies     + Math.floor(extra / 2), 7),
        bunnySpeed:  Math.min(last.bunnySpeed  + extra * 15,            200),
        bushes:      Math.min(last.bushes      + extra,                 15),
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
    createBunnyTexture(scene);
    createBunnyStunnedTexture(scene);
    EGG_COLORS.forEach(function(ec, i) {
        createEggTexture(scene, ec.hex, 'egg' + i);
    });
    createGoldenEggTexture(scene);
    createHeartTexture(scene);
    createCrowBurstTexture(scene);
    createGrassTexture(scene);
    createBushTexture(scene);
    createFlowerTexture(scene);
}

function createPlayerTexture(scene) {
    if (scene.textures.exists('player')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 36;
    // Body (rich orange-red)
    g.fillStyle(0xCC4400);
    g.fillEllipse(s / 2, s / 2 + 4, 22, 18);
    // Head
    g.fillStyle(0xDD5500);
    g.fillCircle(s / 2, s / 2 - 5, 9);
    // Tail feathers
    g.fillStyle(0xFF6600);
    g.fillTriangle(s / 2 - 14, s / 2,     s / 2 - 8, s / 2 + 5,  s / 2 - 17, s / 2 + 8);
    g.fillStyle(0xFFAA00);
    g.fillTriangle(s / 2 - 15, s / 2 + 3, s / 2 - 9, s / 2 + 8,  s / 2 - 18, s / 2 + 11);
    g.fillStyle(0xFF3300);
    g.fillTriangle(s / 2 - 12, s / 2 - 2, s / 2 - 7, s / 2 + 4,  s / 2 - 16, s / 2 + 4);
    // Comb (red)
    g.fillStyle(0xFF2200);
    g.fillTriangle(s / 2 - 2, s / 2 - 13, s / 2,     s / 2 - 13, s / 2 - 1, s / 2 - 17);
    g.fillTriangle(s / 2 + 1, s / 2 - 13, s / 2 + 3, s / 2 - 13, s / 2 + 2, s / 2 - 16);
    g.fillTriangle(s / 2 + 3, s / 2 - 13, s / 2 + 5, s / 2 - 13, s / 2 + 4, s / 2 - 15);
    // Wattle (red dewlap)
    g.fillStyle(0xFF3300);
    g.fillEllipse(s / 2 + 7, s / 2 - 2, 5, 8);
    // Beak (yellow)
    g.fillStyle(0xFFAA00);
    g.fillTriangle(s / 2 + 8, s / 2 - 7, s / 2 + 8, s / 2 - 4, s / 2 + 14, s / 2 - 5);
    // Eye white
    g.fillStyle(0xFFFFFF);
    g.fillCircle(s / 2 + 3, s / 2 - 7, 3);
    // Eye pupil
    g.fillStyle(0x000000);
    g.fillCircle(s / 2 + 4, s / 2 - 7, 1.5);
    // Wing highlight
    g.fillStyle(0xBB3300);
    g.fillEllipse(s / 2 - 2, s / 2 + 4, 16, 10);
    // Feet
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
    // Same as player but muted colors for stunned look
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
    // Small sparkle stars above head (as simple diamond shapes)
    g.fillStyle(0xFFFF00);
    g.fillTriangle(s / 2 - 5, s / 2 - 22, s / 2 - 8, s / 2 - 18, s / 2 - 2, s / 2 - 18);
    g.fillTriangle(s / 2 - 5, s / 2 - 14, s / 2 - 8, s / 2 - 18, s / 2 - 2, s / 2 - 18);
    g.fillTriangle(s / 2 + 5, s / 2 - 24, s / 2 + 2, s / 2 - 20, s / 2 + 8, s / 2 - 20);
    g.fillTriangle(s / 2 + 5, s / 2 - 16, s / 2 + 2, s / 2 - 20, s / 2 + 8, s / 2 - 20);
    g.generateTexture('player_stunned', s, s);
    g.destroy();
}

function createBunnyTexture(scene) {
    if (scene.textures.exists('bunny')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 34;
    // Body (white/cream)
    g.fillStyle(0xF0F0FF);
    g.fillEllipse(s / 2, s / 2 + 5, 20, 16);
    // Head
    g.fillStyle(0xFFFFFF);
    g.fillCircle(s / 2, s / 2 - 3, 9);
    // Ears (outer white, inner pink)
    g.fillStyle(0xFFFFFF);
    g.fillEllipse(s / 2 - 5, s / 2 - 16, 6, 16);
    g.fillEllipse(s / 2 + 5, s / 2 - 16, 6, 16);
    g.fillStyle(0xFFAABB);
    g.fillEllipse(s / 2 - 5, s / 2 - 16, 3, 12);
    g.fillEllipse(s / 2 + 5, s / 2 - 16, 3, 12);
    // Nose
    g.fillStyle(0xFF88AA);
    g.fillCircle(s / 2, s / 2 - 1, 2);
    // Eyes (red - traditional easter bunny)
    g.fillStyle(0xFF0044);
    g.fillCircle(s / 2 - 3, s / 2 - 5, 2);
    g.fillCircle(s / 2 + 3, s / 2 - 5, 2);
    // Tail
    g.fillStyle(0xF8F8FF);
    g.fillCircle(s / 2, s / 2 + 14, 4);
    // Easter basket (bunny is carrying stolen eggs!)
    g.fillStyle(0x885500);
    g.fillRect(s / 2 + 9, s / 2 + 2, 9, 7);
    g.fillStyle(0xFF6B9D);
    g.fillEllipse(s / 2 + 11, s / 2 + 1, 6, 5);
    g.fillStyle(0x7EB8FF);
    g.fillEllipse(s / 2 + 16, s / 2 + 1, 5, 4);
    g.generateTexture('bunny', s, s);
    g.destroy();
}

function createBunnyStunnedTexture(scene) {
    if (scene.textures.exists('bunny_stunned')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 34;
    // Muted bunny (stunned/dazed)
    g.fillStyle(0xCCCCDD);
    g.fillEllipse(s / 2, s / 2 + 5, 20, 14);
    g.fillStyle(0xDDDDEE);
    g.fillCircle(s / 2, s / 2 - 2, 9);
    g.fillStyle(0xCCCCDD);
    g.fillEllipse(s / 2 - 5, s / 2 - 15, 6, 16);
    g.fillEllipse(s / 2 + 5, s / 2 - 15, 6, 16);
    g.fillStyle(0xFFAABB);
    g.fillEllipse(s / 2 - 5, s / 2 - 15, 3, 12);
    g.fillEllipse(s / 2 + 5, s / 2 - 15, 3, 12);
    // X eyes for stunned (using rectangles)
    g.fillStyle(0x555555);
    g.fillRect(s / 2 - 6, s / 2 - 8, 4, 2);
    g.fillRect(s / 2 - 4, s / 2 - 6, 2, 4);
    g.fillRect(s / 2 + 2, s / 2 - 8, 4, 2);
    g.fillRect(s / 2 + 4, s / 2 - 6, 2, 4);
    // Sparkle diamonds above
    g.fillStyle(0xFFFF00);
    g.fillTriangle(s / 2, s / 2 - 22, s / 2 - 3, s / 2 - 18, s / 2 + 3, s / 2 - 18);
    g.fillTriangle(s / 2, s / 2 - 14, s / 2 - 3, s / 2 - 18, s / 2 + 3, s / 2 - 18);
    g.generateTexture('bunny_stunned', s, s);
    g.destroy();
}

function createEggTexture(scene, colorHex, key) {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const w = 22, h = 28;
    // Egg body
    g.fillStyle(colorHex);
    g.fillEllipse(w / 2, h / 2, w, h);
    // Lighter stripe
    const c = Phaser.Display.Color.IntegerToColor(colorHex);
    c.lighten(35);
    g.fillStyle(c.color, 0.7);
    g.fillRect(0, h / 2 - 4, w, 8);
    // Shine
    g.fillStyle(0xFFFFFF, 0.6);
    g.fillEllipse(w / 2 - 3, h / 2 - 5, 7, 5);
    g.generateTexture(key, w, h);
    g.destroy();
}

function createGoldenEggTexture(scene) {
    if (scene.textures.exists('goldenegg')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const w = 26, h = 32;
    // Egg body (gold)
    g.fillStyle(0xFFD700);
    g.fillEllipse(w / 2, h / 2, w, h);
    // Inner glow (amber)
    g.fillStyle(0xFFA500, 0.5);
    g.fillEllipse(w / 2, h / 2, w * 0.7, h * 0.7);
    // Zigzag band
    g.fillStyle(0xFF8C00, 0.8);
    for (let i = 0; i < 5; i++) {
        const zig = (i % 2 === 0) ? 0 : 4;
        g.fillRect(i * (w / 5), h / 2 - 3 + zig, w / 5, 5);
    }
    // Shine
    g.fillStyle(0xFFFFFF, 0.8);
    g.fillEllipse(w / 2 - 4, h / 2 - 7, 9, 6);
    g.generateTexture('goldenegg', w, h);
    g.destroy();
}

function createHeartTexture(scene) {
    if (scene.textures.exists('heart')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 22;
    g.fillStyle(0xFF3333);
    g.fillCircle(s / 2 - 4, s / 2 - 2, 5);
    g.fillCircle(s / 2 + 4, s / 2 - 2, 5);
    g.fillTriangle(s / 2 - 9, s / 2, s / 2 + 9, s / 2, s / 2, s / 2 + 10);
    g.generateTexture('heart', s, s);
    g.destroy();
}

function createCrowBurstTexture(scene) {
    if (scene.textures.exists('crowburst')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 80;
    // Burst circle
    g.fillStyle(0xFFFF88, 0.7);
    g.fillCircle(s / 2, s / 2, 36);
    g.fillStyle(0xFFDD00, 0.5);
    g.fillCircle(s / 2, s / 2, 28);
    g.fillStyle(0xFFAA00, 0.6);
    g.fillCircle(s / 2, s / 2, 18);
    // Musical notes
    g.fillStyle(0xFF6600, 1.0);
    g.fillRect(s / 2 - 16, s / 2 - 8, 3, 10);
    g.fillCircle(s / 2 - 16, s / 2 + 2, 4);
    g.fillRect(s / 2 + 10, s / 2 - 12, 3, 10);
    g.fillCircle(s / 2 + 10, s / 2 - 2, 4);
    g.generateTexture('crowburst', s, s);
    g.destroy();
}

function createGrassTexture(scene) {
    if (scene.textures.exists('grass')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 64;
    g.fillStyle(0x4CAF50);
    g.fillRect(0, 0, s, s);
    // Subtle variations
    g.fillStyle(0x45A049, 0.5);
    g.fillRect(0, 0, 32, 32);
    g.fillRect(32, 32, 32, 32);
    g.fillStyle(0x55BC55, 0.5);
    g.fillRect(32, 0, 32, 32);
    g.fillRect(0, 32, 32, 32);
    g.generateTexture('grass', s, s);
    g.destroy();
}

function createBushTexture(scene) {
    if (scene.textures.exists('bush')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 40;
    g.fillStyle(0x1B5E20);
    g.fillCircle(s / 2, s / 2, 17);
    g.fillStyle(0x2D7A27);
    g.fillCircle(s / 2 - 8, s / 2 + 4, 12);
    g.fillCircle(s / 2 + 8, s / 2 + 4, 12);
    g.fillStyle(0x388E3C);
    g.fillCircle(s / 2, s / 2 - 6, 10);
    // Berry dots
    g.fillStyle(0xFF2200);
    g.fillCircle(s / 2 - 4, s / 2 - 2, 2);
    g.fillCircle(s / 2 + 4, s / 2 + 3, 2);
    g.fillCircle(s / 2,     s / 2 + 5, 2);
    g.generateTexture('bush', s, s);
    g.destroy();
}

function createFlowerTexture(scene) {
    if (scene.textures.exists('flower')) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const s = 24;
    // Petals
    g.fillStyle(0xFFCCEE);
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.fillCircle(s / 2 + Math.cos(a) * 6, s / 2 + Math.sin(a) * 6, 4);
    }
    // Center
    g.fillStyle(0xFFFF00);
    g.fillCircle(s / 2, s / 2, 4);
    g.generateTexture('flower', s, s);
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
        // generate all textures needed for the title screen
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
        const title1 = this.add.text(W / 2, 80, "Mr. Kluck's", {
            fontSize: '34px',
            fontFamily: 'Georgia, serif',
            fill: '#FFD700',
            stroke: '#8B4513',
            strokeThickness: 5,
        }).setOrigin(0.5);

        const title2 = this.add.text(W / 2, 122, 'Egg Hunt!', {
            fontSize: '44px',
            fontFamily: 'Georgia, serif',
            fill: '#FFD700',
            stroke: '#8B4513',
            strokeThickness: 6,
        }).setOrigin(0.5);

        // Bouncing Mr Kluck sprite
        const kluck = this.add.image(W / 2, 185, 'player').setScale(2.5);
        this.tweens.add({
            targets: kluck,
            y: 195,
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

        this.add.text(W / 2, 270, story, {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFFFCC',
            align: 'center',
            lineSpacing: 6,
        }).setOrigin(0.5);

        // Leaderboard
        const stored = localStorage.getItem('mrkluckLeaderboard');
        const leaderboard = stored ? JSON.parse(stored) : [];

        let lbStr = '🏆 High Scores 🏆\n';
        if (leaderboard.length === 0) {
            lbStr += '(no scores yet)';
        } else {
            leaderboard.forEach(function(entry, i) {
                lbStr += `${i + 1}. ${entry.name}  ${entry.score} pts  (Lv ${entry.level})\n`;
            });
        }

        this.add.text(W / 2, 380, lbStr, {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFFFCC',
            align: 'center',
            lineSpacing: 4,
        }).setOrigin(0.5);

        // Version
        this.add.text(W / 2, H - 80, `v${APP_VERSION}`, {
            fontSize: '12px',
            fill: '#aaaaaa',
        }).setOrigin(0.5);

        // "Tap to play" - pulsing
        const tapText = this.add.text(W / 2, H - 50, '🥚  Tap or Press SPACE to Play  🥚', {
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
        this.currentLevel = data.level  || 1;
        this.score        = data.score  || 0;
        this.lives        = data.lives  !== undefined ? data.lives : 3;
        this.eggsLeft     = 0;
        this.isInvincible = false;
        this.invincibleTimer = null;
        this.crowReady    = true;
        this.crowCooldownTimer = null;
        this.paused       = false;
        this.levelComplete = false;
        this.playerDead   = false;
    }

    preload() {
        // Textures already generated in BootScene, but generate here too in case
        // of direct scene start (e.g. hot reload in dev)
        generateAllTextures(this);
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        const cfg = getLevelConfig(this.currentLevel);

        // ---- Background ----
        this.add.tileSprite(0, 0, W, H, 'grass').setOrigin(0, 0);

        // ---- Physics groups ----
        this.eggGroup    = this.physics.add.staticGroup();
        this.bunnyGroup  = this.physics.add.group();
        this.bushGroup   = this.physics.add.staticGroup();

        // ---- Spawn decorations / bushes ----
        for (let i = 0; i < cfg.bushes + 4; i++) {
            const pos = randomFieldPos(this, 50);
            const isBush = i < cfg.bushes;
            const key = isBush ? 'bush' : 'flower';
            if (isBush) {
                this.bushGroup.create(pos.x, pos.y, 'bush');
            } else {
                this.add.image(pos.x, pos.y, 'flower').setAlpha(0.7);
            }
        }

        // ---- Spawn player ----
        this.player = this.physics.add.sprite(W / 2, H / 2, 'player');
        this.player.setCollideWorldBounds(true);
        this.player.setDepth(10);

        // ---- Spawn eggs ----
        const totalEggs = cfg.eggs + cfg.golden;
        this.eggsLeft = cfg.eggs + cfg.golden;

        for (let i = 0; i < cfg.eggs; i++) {
            const colorIdx = i % EGG_COLORS.length;
            const pos = this.findSafeSpawnPos(80);
            const egg = this.eggGroup.create(pos.x, pos.y, 'egg' + colorIdx);
            egg.setData('points', EGG_POINTS);
            egg.setData('golden', false);
            // Gentle bobbing
            this.tweens.add({
                targets: egg,
                y: pos.y - 5,
                yoyo: true,
                repeat: -1,
                duration: 600 + i * 80,
                ease: 'Sine.easeInOut',
            });
        }
        for (let i = 0; i < cfg.golden; i++) {
            const pos = this.findSafeSpawnPos(80);
            const egg = this.eggGroup.create(pos.x, pos.y, 'goldenegg');
            egg.setData('points', GOLDEN_EGG_POINTS);
            egg.setData('golden', true);
            // Spinning glow effect
            this.tweens.add({
                targets: egg,
                angle: 360,
                repeat: -1,
                duration: 3000,
                ease: 'Linear',
            });
            this.tweens.add({
                targets: egg,
                scaleX: 1.15,
                scaleY: 1.15,
                yoyo: true,
                repeat: -1,
                duration: 800,
            });
        }

        // ---- Spawn bunnies ----
        for (let i = 0; i < cfg.bunnies; i++) {
            // Spawn far from player
            const pos = this.findSafeSpawnPos(150);
            const bunny = this.bunnyGroup.create(pos.x, pos.y, 'bunny');
            bunny.setCollideWorldBounds(true);
            bunny.setData('speed', cfg.bunnySpeed + i * 10);
            bunny.setData('stunned', false);
            bunny.setData('stunnedTimer', null);
            bunny.setDepth(9);
        }

        // ---- Player-bunny overlap (catch!) ----
        this.physics.add.overlap(
            this.player, this.bunnyGroup,
            this.onCaughtByBunny, null, this
        );

        // ---- Player-egg overlap (collect!) ----
        this.physics.add.overlap(
            this.player, this.eggGroup,
            this.onCollectEgg, null, this
        );

        // ---- Player-bush collision ----
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
        this.setupTouchControls();

        // ---- Level intro overlay ----
        this.showLevelIntro(cfg);
    }

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
        this.levelText = this.add.text(W / 2, 6, `Level ${this.currentLevel}: ${cfg.name}`, {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFFFCC',
        }).setOrigin(0.5, 0).setDepth(21);

        // Score
        this.scoreText = this.add.text(W / 2, 28, `Score: ${this.score}`, {
            fontSize: '14px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFD700',
        }).setOrigin(0.5, 0).setDepth(21);

        // Eggs remaining
        this.eggsText = this.add.text(8, 28, `🥚 ${this.eggsLeft}`, {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFFFFF',
        }).setOrigin(0, 0).setDepth(21);

        // Lives (hearts)
        this.createHeartDisplay();

        // Crow power button / indicator
        this.crowLabel = this.add.text(W - 8, 6, '🐓 CROW', {
            fontSize: '13px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFD700',
            backgroundColor: '#440000',
            padding: { x: 4, y: 2 },
        }).setOrigin(1, 0).setDepth(21).setInteractive();
        this.crowLabel.on('pointerdown', () => { this.useCrowPower(); });

        // Pause button
        this.pauseBtn = this.add.text(8, 6, '⏸ Pause', {
            fontSize: '13px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFFFFF',
            backgroundColor: '#222222',
            padding: { x: 4, y: 2 },
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
            const h = this.add.image(W - 14 - i * 26, 40, 'heart')
                .setDepth(21)
                .setScale(0.9);
            this.heartImages.push(h);
        }
    }

    showLevelIntro(cfg) {
        const W = this.scale.width;
        const H = this.scale.height;

        const overlay = this.add.graphics().setDepth(50);
        overlay.fillStyle(0x000000, 0.6);
        overlay.fillRect(0, 0, W, H);

        const t1 = this.add.text(W / 2, H / 2 - 60, `Level ${this.currentLevel}`, {
            fontSize: '48px',
            fontFamily: 'Georgia, serif',
            fill: '#FFD700',
            stroke: '#8B4513',
            strokeThickness: 5,
        }).setOrigin(0.5).setDepth(51);

        const t2 = this.add.text(W / 2, H / 2, cfg.name, {
            fontSize: '28px',
            fontFamily: 'Georgia, serif',
            fill: '#FFFFFF',
        }).setOrigin(0.5).setDepth(51);

        const eggCount = cfg.eggs + cfg.golden;
        const t3 = this.add.text(W / 2, H / 2 + 50, `Find ${eggCount} eggs!`, {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFFFCC',
        }).setOrigin(0.5).setDepth(51);

        const t4 = this.add.text(W / 2, H / 2 + 100, 'Tap or press any key', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            fill: '#AAAAAA',
        }).setOrigin(0.5).setDepth(51);

        // Fade out on input
        const dismiss = () => {
            [overlay, t1, t2, t3, t4].forEach(obj => obj.destroy());
            this.paused = false;
        };

        this.paused = true;
        this.time.delayedCall(1000, () => {
            this.input.keyboard.once('keydown', dismiss);
            this.input.once('pointerdown', dismiss);
        });
    }

    // ------------------------------------------------------------------

    update(time, delta) {
        if (this.paused || this.levelComplete || this.playerDead) return;

        this.handleInput();
        this.updateBunnies();
        this.updateCrowLabel();
    }

    handleInput() {
        const left  = this.cursors.left.isDown  || this.wasd.left.isDown  || this.swipeDir === 'left';
        const right = this.cursors.right.isDown || this.wasd.right.isDown || this.swipeDir === 'right';
        const up    = this.cursors.up.isDown    || this.wasd.up.isDown    || this.swipeDir === 'up';
        const down  = this.cursors.down.isDown  || this.wasd.down.isDown  || this.swipeDir === 'down';

        // Reset swipe after reading
        this.swipeDir = null;

        // D-pad state is set by touch buttons
        const dLeft  = this.dpadState && this.dpadState.left;
        const dRight = this.dpadState && this.dpadState.right;
        const dUp    = this.dpadState && this.dpadState.up;
        const dDown  = this.dpadState && this.dpadState.down;

        let vx = 0, vy = 0;
        if (left  || dLeft)  vx = -PLAYER_SPEED;
        if (right || dRight) vx =  PLAYER_SPEED;
        if (up    || dUp)    vy = -PLAYER_SPEED;
        if (down  || dDown)  vy =  PLAYER_SPEED;

        // Diagonal speed normalization
        if (vx !== 0 && vy !== 0) {
            const norm = 1 / Math.SQRT2;
            vx *= norm;
            vy *= norm;
        }

        this.player.setVelocity(vx, vy);

        // Flip sprite based on direction
        if (vx < 0) this.player.setFlipX(true);
        if (vx > 0) this.player.setFlipX(false);

        // Crow power
        if (Phaser.Input.Keyboard.JustDown(this.crowKey)) {
            this.useCrowPower();
        }
    }

    updateBunnies() {
        const px = this.player.x;
        const py = this.player.y;

        this.bunnyGroup.getChildren().forEach(bunny => {
            if (bunny.getData('stunned')) return;

            const speed = bunny.getData('speed');
            // Move toward player with a little wobble
            const angle = Phaser.Math.Angle.Between(bunny.x, bunny.y, px, py);
            const wobble = (Math.sin(this.time.now / 600 + bunny.x) * 0.4);
            const finalAngle = angle + wobble;

            this.physics.velocityFromRotation(finalAngle, speed, bunny.body.velocity);

            // Flip sprite
            if (bunny.body.velocity.x < 0) {
                bunny.setFlipX(true);
            } else {
                bunny.setFlipX(false);
            }
        });
    }

    updateCrowLabel() {
        if (this.crowReady) {
            this.crowLabel.setStyle({ fill: '#FFD700', backgroundColor: '#440000' });
            this.crowLabel.setText('🐓 CROW!');
        } else {
            this.crowLabel.setStyle({ fill: '#888888', backgroundColor: '#222222' });
            this.crowLabel.setText('🐓 cooldown');
        }
    }

    // ------------------------------------------------------------------

    onCaughtByBunny(player, bunny) {
        if (this.isInvincible) return;
        if (bunny.getData('stunned')) return;

        this.lives--;
        this.createHeartDisplay();

        if (this.lives <= 0) {
            this.gameOver();
            return;
        }

        // Invincibility period
        this.isInvincible = true;
        this.player.setTexture('player_stunned');

        // Flash the player
        this.tweens.add({
            targets: this.player,
            alpha: 0,
            yoyo: true,
            repeat: 7,
            duration: 200,
            onComplete: () => {
                this.player.setAlpha(1);
                this.player.setTexture('player');
            },
        });

        // Screen flash red
        this.cameras.main.flash(300, 255, 0, 0);

        // End invincibility after INVINCIBLE_DURATION
        if (this.invincibleTimer) this.invincibleTimer.remove();
        this.invincibleTimer = this.time.delayedCall(INVINCIBLE_DURATION, () => {
            this.isInvincible = false;
            this.player.setTexture('player');
        });
    }

    onCollectEgg(player, egg) {
        const points = egg.getData('points');
        const isGolden = egg.getData('golden');
        this.score += points;
        this.eggsLeft--;

        // Floating score text
        const floatText = this.add.text(egg.x, egg.y, `+${points}`, {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            fill: isGolden ? '#FFD700' : '#FFFFFF',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5).setDepth(30);

        this.tweens.add({
            targets: floatText,
            y: floatText.y - 50,
            alpha: 0,
            duration: 800,
            onComplete: () => { floatText.destroy(); },
        });

        // Camera flash (green or gold)
        if (isGolden) {
            this.cameras.main.flash(200, 255, 215, 0, false);
        } else {
            this.cameras.main.flash(100, 0, 200, 0, false);
        }

        // Update HUD
        this.scoreText.setText(`Score: ${this.score}`);
        this.eggsText.setText(`🥚 ${this.eggsLeft}`);

        egg.destroy();

        if (this.eggsLeft <= 0) {
            this.levelComplete = true;
            this.time.delayedCall(300, () => {
                this.completeLevelTransition();
            });
        }
    }

    completeLevelTransition() {
        const W = this.scale.width;
        const H = this.scale.height;

        // Stop bunnies
        this.bunnyGroup.getChildren().forEach(b => b.setVelocity(0, 0));
        this.player.setVelocity(0, 0);

        const overlay = this.add.graphics().setDepth(60);
        overlay.fillStyle(0x000000, 0.7);
        overlay.fillRect(0, 0, W, H);

        this.add.text(W / 2, H / 2 - 70, '🥚 Level Complete! 🥚', {
            fontSize: '30px',
            fontFamily: 'Georgia, serif',
            fill: '#FFD700',
            stroke: '#8B4513',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(61);

        this.add.text(W / 2, H / 2 - 10, `Score: ${this.score}`, {
            fontSize: '22px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFFFFF',
        }).setOrigin(0.5).setDepth(61);

        const nextLevel = this.currentLevel + 1;
        this.add.text(W / 2, H / 2 + 40, `Next: Level ${nextLevel}`, {
            fontSize: '20px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFFFCC',
        }).setOrigin(0.5).setDepth(61);

        const cont = this.add.text(W / 2, H / 2 + 90, 'Tap or press any key', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            fill: '#AAAAAA',
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

        // Save score to leaderboard
        const stored = localStorage.getItem('mrkluckLeaderboard');
        let lb = stored ? JSON.parse(stored) : [];

        const initials = 'MRK'; // default initials
        lb.push({ name: initials, score: this.score, level: this.currentLevel });
        lb.sort((a, b) => b.score - a.score);
        lb = lb.slice(0, 5);
        localStorage.setItem('mrkluckLeaderboard', JSON.stringify(lb));

        // Show game-over screen
        const W = this.scale.width;
        const H = this.scale.height;

        const overlay = this.add.graphics().setDepth(60);
        overlay.fillStyle(0x000000, 0.75);
        overlay.fillRect(0, 0, W, H);

        this.add.text(W / 2, H / 2 - 90, 'GAME OVER', {
            fontSize: '44px',
            fontFamily: 'Georgia, serif',
            fill: '#FF3333',
            stroke: '#000000',
            strokeThickness: 6,
        }).setOrigin(0.5).setDepth(61);

        this.add.text(W / 2, H / 2 - 30, 'The Easter Bunny caught you!', {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFFFCC',
        }).setOrigin(0.5).setDepth(61);

        this.add.text(W / 2, H / 2 + 10, `Final Score: ${this.score}`, {
            fontSize: '24px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFD700',
        }).setOrigin(0.5).setDepth(61);

        this.add.text(W / 2, H / 2 + 50, `Reached Level: ${this.currentLevel}`, {
            fontSize: '18px',
            fontFamily: 'Arial, sans-serif',
            fill: '#FFFFFF',
        }).setOrigin(0.5).setDepth(61);

        const tap = this.add.text(W / 2, H / 2 + 110, 'Tap to return to menu', {
            fontSize: '16px',
            fontFamily: 'Arial, sans-serif',
            fill: '#AAAAAA',
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
            this.pauseBtn.setText('▶ Resume');
            this.player.setVelocity(0, 0);
            this.bunnyGroup.getChildren().forEach(b => b.setVelocity(0, 0));

            const W = this.scale.width;
            const H = this.scale.height;
            this.pauseOverlay = this.add.graphics().setDepth(55);
            this.pauseOverlay.fillStyle(0x000000, 0.6);
            this.pauseOverlay.fillRect(0, 0, W, H);
            this.pausedText = this.add.text(W / 2, H / 2, 'PAUSED', {
                fontSize: '48px',
                fontFamily: 'Georgia, serif',
                fill: '#FFD700',
                stroke: '#000000',
                strokeThickness: 5,
            }).setOrigin(0.5).setDepth(56);
        } else {
            this.pauseBtn.setText('⏸ Pause');
            if (this.pauseOverlay) { this.pauseOverlay.destroy(); this.pauseOverlay = null; }
            if (this.pausedText)   { this.pausedText.destroy();   this.pausedText   = null; }
        }
    }

    useCrowPower() {
        if (!this.crowReady) return;
        this.crowReady = false;

        // Show burst animation at player position
        const burst = this.add.image(this.player.x, this.player.y, 'crowburst')
            .setDepth(15)
            .setAlpha(0.9);
        this.tweens.add({
            targets: burst,
            scaleX: 3,
            scaleY: 3,
            alpha: 0,
            duration: 600,
            onComplete: () => { burst.destroy(); },
        });

        // Stun all bunnies within radius
        this.bunnyGroup.getChildren().forEach(bunny => {
            const dist = Phaser.Math.Distance.Between(
                this.player.x, this.player.y, bunny.x, bunny.y
            );
            if (dist < CROW_STUN_RADIUS) {
                this.stunBunny(bunny);
            }
        });

        // Cooldown timer
        if (this.crowCooldownTimer) this.crowCooldownTimer.remove();
        this.crowCooldownTimer = this.time.delayedCall(CROW_COOLDOWN, () => {
            this.crowReady = true;
        });
    }

    stunBunny(bunny) {
        bunny.setData('stunned', true);
        bunny.setVelocity(0, 0);
        bunny.setTexture('bunny_stunned');

        // Show stars
        const starText = this.add.text(bunny.x, bunny.y - 20, '💫', {
            fontSize: '20px',
        }).setDepth(15);
        this.tweens.add({
            targets: starText,
            y: bunny.y - 50,
            alpha: 0,
            duration: CROW_STUN_DURATION,
            onComplete: () => { starText.destroy(); },
        });

        const existingTimer = bunny.getData('stunnedTimer');
        if (existingTimer) existingTimer.remove();

        const t = this.time.delayedCall(CROW_STUN_DURATION, () => {
            if (bunny && bunny.active) {
                bunny.setData('stunned', false);
                bunny.setTexture('bunny');
            }
        });
        bunny.setData('stunnedTimer', t);
    }

    // ------------------------------------------------------------------
    //  Touch controls
    // ------------------------------------------------------------------

    setupTouchControls() {
        this.swipeDir  = null;
        this.dpadState = { left: false, right: false, up: false, down: false };

        // --- Swipe detection ---
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

        // --- On-screen D-pad (bottom-left corner) ---
        this.createDPad();
    }

    createDPad() {
        const W = this.scale.width;
        const H = this.scale.height;

        // D-pad background
        const dpSize = 44;
        const dpX = 60;
        const dpY = H - 80;
        const alpha = 0.5;

        const makeBtn = (label, bx, by, dir) => {
            const bg = this.add.graphics().setDepth(25).setAlpha(alpha);
            bg.fillStyle(0x444444);
            bg.fillRoundedRect(bx - dpSize / 2, by - dpSize / 2, dpSize, dpSize, 8);

            const txt = this.add.text(bx, by, label, {
                fontSize: '20px',
                fill: '#FFFFFF',
            }).setOrigin(0.5).setDepth(26);

            // Make interactive zone
            const zone = this.add.zone(bx, by, dpSize, dpSize)
                .setInteractive()
                .setDepth(27);

            zone.on('pointerdown', () => { this.dpadState[dir] = true;  });
            zone.on('pointerup',   () => { this.dpadState[dir] = false; });
            zone.on('pointerout',  () => { this.dpadState[dir] = false; });
        };

        makeBtn('◀', dpX - dpSize,     dpY,             'left');
        makeBtn('▶', dpX + dpSize,     dpY,             'right');
        makeBtn('▲', dpX,              dpY - dpSize,    'up');
        makeBtn('▼', dpX,              dpY + dpSize,    'down');

        // Crow button (bottom-right)
        const crowBtnX = W - 60;
        const crowBtnY = H - 80;
        const crowBg = this.add.graphics().setDepth(25).setAlpha(alpha);
        crowBg.fillStyle(0x882200);
        crowBg.fillCircle(crowBtnX, crowBtnY, 30);

        const crowTxt = this.add.text(crowBtnX, crowBtnY, '🐓', {
            fontSize: '24px',
        }).setOrigin(0.5).setDepth(26);

        const crowZone = this.add.zone(crowBtnX, crowBtnY, 60, 60)
            .setInteractive()
            .setDepth(27);
        crowZone.on('pointerdown', () => { this.useCrowPower(); });
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
            const dist = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
            if (dist >= pd) {
                return { x, y };
            }
        }
        // Fallback
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
