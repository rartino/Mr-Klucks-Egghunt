#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const gamePath = path.join(root, 'game.js');
const questsPath = path.join(root, 'data', 'quests.json');
const flagsPath = path.join(root, 'data', 'story_flags.json');
const npcsPath = path.join(root, 'data', 'npcs.json');

function readJSON(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function collectRegexMatches(text, regex) {
    const values = new Set();
    let match = regex.exec(text);
    while (match) {
        values.add(match[1]);
        match = regex.exec(text);
    }
    return values;
}

function sorted(values) {
    return Array.from(values).sort();
}

function printList(title, values) {
    if (!values.length) return;
    console.error(title);
    values.forEach(v => console.error(`  - ${v}`));
}

function collectByKeyDeep(node, key, out) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        node.forEach(n => collectByKeyDeep(n, key, out));
        return;
    }
    if (Object.prototype.hasOwnProperty.call(node, key)) {
        const v = node[key];
        if (typeof v === 'string') out.add(v);
    }
    Object.values(node).forEach(v => collectByKeyDeep(v, key, out));
}

function main() {
    const gameText = fs.readFileSync(gamePath, 'utf8');
    const quests = readJSON(questsPath);
    const flags = readJSON(flagsPath);
    const npcs = readJSON(npcsPath);

    const questIds = new Set(Object.keys(quests));
    const flagIds = new Set(Object.keys(flags));

    const errors = [];
    const warnings = [];

    Object.entries(quests).forEach(([key, quest]) => {
        if (!quest || typeof quest !== 'object' || Array.isArray(quest)) {
            errors.push(`Quest "${key}" is not an object.`);
            return;
        }
        if (quest.id !== key) {
            errors.push(`Quest key/id mismatch: key="${key}", id="${quest.id}".`);
        }
        if (!quest.type) {
            errors.push(`Quest "${key}" is missing "type".`);
        }
        if (!quest.desc) {
            errors.push(`Quest "${key}" is missing "desc".`);
        }
        if (quest.nextQuest && !questIds.has(quest.nextQuest)) {
            errors.push(`Quest "${key}" has missing nextQuest "${quest.nextQuest}".`);
        }
    });

    if (!Array.isArray(npcs)) {
        errors.push('data/npcs.json must be an array.');
    }
    const npcIds = new Set();
    (Array.isArray(npcs) ? npcs : []).forEach((npc, idx) => {
        if (!npc || typeof npc !== 'object') {
            errors.push(`NPC at index ${idx} is not an object.`);
            return;
        }
        if (!npc.id) {
            errors.push(`NPC at index ${idx} is missing id.`);
        } else if (npcIds.has(npc.id)) {
            errors.push(`Duplicate NPC id "${npc.id}".`);
        } else {
            npcIds.add(npc.id);
        }
        if (!Array.isArray(npc.dialogues)) {
            errors.push(`NPC "${npc.id || idx}" is missing dialogues array.`);
        }
    });

    const npcGiveQuest = new Set();
    const npcPayQuest = new Set();
    const npcQuestActive = new Set();
    const npcQuestComplete = new Set();
    const npcFlags = new Set();
    const npcNotFlags = new Set();
    const npcFlag2 = new Set();

    collectByKeyDeep(npcs, 'giveQuest', npcGiveQuest);
    collectByKeyDeep(npcs, 'payQuest', npcPayQuest);
    collectByKeyDeep(npcs, 'questActive', npcQuestActive);
    collectByKeyDeep(npcs, 'questComplete', npcQuestComplete);
    collectByKeyDeep(npcs, 'flag', npcFlags);
    collectByKeyDeep(npcs, 'notFlag', npcNotFlags);
    collectByKeyDeep(npcs, 'flag2', npcFlag2);

    const refGiveQuest = new Set([...npcGiveQuest]);
    const refPayQuest = new Set([...npcPayQuest]);
    const refQuestActive = new Set([...npcQuestActive]);
    const refQuestComplete = new Set([...npcQuestComplete]);
    const refNextQuest = collectRegexMatches(gameText, /nextQuest:\s*'([^']+)'/g);

    const referencedQuestIds = new Set([
        ...refGiveQuest,
        ...refPayQuest,
        ...refQuestActive,
        ...refQuestComplete,
        ...refNextQuest,
    ]);

    sorted(referencedQuestIds).forEach(id => {
        if (!questIds.has(id)) {
            errors.push(`Quest reference "${id}" does not exist in data/quests.json.`);
        }
    });

    const jsonNextQuestTargets = new Set(
        Object.values(quests)
            .map(q => q && q.nextQuest)
            .filter(Boolean)
    );
    const activatedQuestIds = new Set([...refGiveQuest, ...refPayQuest, ...refNextQuest, ...jsonNextQuestTargets]);
    const deadQuestIds = sorted(new Set([...questIds].filter(id => !activatedQuestIds.has(id))));
    deadQuestIds.forEach(id => warnings.push(`Quest "${id}" is defined but not activated by giveQuest/payQuest/nextQuest.`));

    const refFlag = new Set([...collectRegexMatches(gameText, /flag:\s*'([^']+)'/g), ...npcFlags]);
    const refNotFlag = new Set([...collectRegexMatches(gameText, /notFlag:\s*'([^']+)'/g), ...npcNotFlags]);
    const refFlag2 = new Set([...collectRegexMatches(gameText, /flag2:\s*'([^']+)'/g), ...npcFlag2]);
    const referencedFlags = new Set([...refFlag, ...refNotFlag, ...refFlag2]);
    sorted(referencedFlags).forEach(id => {
        if (!flagIds.has(id)) {
            errors.push(`Flag reference "${id}" does not exist in data/story_flags.json.`);
        }
    });

    if (errors.length) {
        printList('Validation errors:', errors);
    }
    if (warnings.length) {
        printList('Validation warnings:', warnings);
    }

    if (errors.length) {
        process.exitCode = 1;
        return;
    }

    console.log('Quest validation passed.');
    if (warnings.length) {
        console.log(`Warnings: ${warnings.length}`);
    }
}

main();
