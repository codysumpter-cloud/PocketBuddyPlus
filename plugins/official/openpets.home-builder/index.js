Object.freeze({
	hunger: .15,
	energy: .1,
	comfort: .1,
	safety: .05,
	boredom: .2,
	curiosity: .25,
	affection: .15,
	social: .15,
	accomplishment: .2,
	cleanliness: .05,
	focus: .15
});
Object.freeze({
	hunger: 8e-4,
	energy: 6e-4,
	comfort: 2e-4,
	safety: -1e-4,
	boredom: .001,
	curiosity: 5e-4,
	affection: 3e-4,
	social: 4e-4,
	accomplishment: 3e-4,
	cleanliness: 2e-4,
	focus: 4e-4
});
Object.freeze({
	sociability: .55,
	curiosity: .65,
	playfulness: .6,
	diligence: .55,
	bravery: .45,
	affection: .65,
	independence: .45,
	patience: .55,
	aggression: .2,
	creativity: .6,
	neatness: .5
});
Object.freeze({
	affection: .5,
	trust: .5,
	familiarity: .1,
	respect: .4
});
Object.freeze({
	level: 1,
	experience: 0,
	skill_points: 0,
	rerolls: 1,
	health: 10,
	max_health: 10,
	stamina: 10,
	max_stamina: 10,
	strength: 1,
	defense: 1,
	speed: 1,
	focus: 1
});
//#endregion
//#region packages/buddy-domain/src/home/room-document.ts
var CAMERA_CORNERS = [
	"SE",
	"SW",
	"NW",
	"NE"
];
//#endregion
//#region packages/buddy-domain/src/home/content-catalog.ts
/**
* Public, generated-placeholder catalog used by the open repository.
*
* Private release builds may replace only the presentation metadata through a
* licensed manifest. Canonical ids, footprints, affordances and state keys stay
* here so a room behaves the same with placeholder or purchased art.
*/
var HOME_PUBLIC_ASSETS = Object.freeze([
	{
		assetId: "home.bed.basic",
		label: "Buddy Bed",
		category: "comfort",
		color: 9203634,
		accentColor: 13088232,
		footprint: {
			width: 2,
			height: 1
		},
		actions: ["rest"],
		blocksMovement: true,
		defaultState: { occupied: false }
	},
	{
		assetId: "home.food-bowl.basic",
		label: "Food Bowl",
		category: "food",
		color: 14254667,
		accentColor: 16761462,
		footprint: {
			width: 1,
			height: 1
		},
		actions: ["feed"],
		blocksMovement: true,
		defaultState: { servings: 5 }
	},
	{
		assetId: "home.toy.ball",
		label: "Play Ball",
		category: "fun",
		color: 5217512,
		accentColor: 12180735,
		footprint: {
			width: 1,
			height: 1
		},
		actions: ["play"],
		blocksMovement: false,
		defaultState: { bounces: 0 }
	},
	{
		assetId: "home.tv.basic",
		label: "Television",
		category: "media",
		color: 2700106,
		accentColor: 7397832,
		footprint: {
			width: 1,
			height: 1
		},
		actions: ["toggle", "next-channel"],
		blocksMovement: true,
		defaultState: {
			powered: false,
			channel: "nature"
		}
	},
	{
		assetId: "home.chair.basic",
		label: "Chair",
		category: "comfort",
		color: 10448973,
		accentColor: 14264188,
		footprint: {
			width: 1,
			height: 1
		},
		actions: ["sit"],
		blocksMovement: true,
		defaultState: { occupied: false }
	},
	{
		assetId: "home.table.basic",
		label: "Table",
		category: "surface",
		color: 8345403,
		accentColor: 12683868,
		footprint: {
			width: 2,
			height: 2
		},
		actions: [],
		blocksMovement: true,
		defaultState: {}
	},
	{
		assetId: "home.plant.basic",
		label: "House Plant",
		category: "decor",
		color: 4951893,
		accentColor: 10802799,
		footprint: {
			width: 1,
			height: 1
		},
		actions: ["water"],
		blocksMovement: true,
		defaultState: { watered: false }
	}
]);
new Map(HOME_PUBLIC_ASSETS.map((asset) => [asset.assetId, asset]));
Object.freeze({
	SE: ["east", "south"],
	SW: ["south", "west"],
	NW: ["west", "north"],
	NE: ["north", "east"]
});
//#endregion
//#region packages/buddy-domain/src/home/parity-scenarios.ts
/**
* Canonical Home parity scenarios.
*
* This is the TypeScript half of the golden Godot -> TypeScript harness for
* four-wall room geometry and placement. It emits `prismtek-parity-trace-v1`
* traces from `@open-pets/buddy-domain` so a Godot emitter can produce the same
* scenario ids and step inputs, and `compareParityTraces` can diff them.
*
* Two rules make these traces comparable across runtimes:
*
*  - scenarios are DECLARATIVE. Each step is an input the Godot side can replay
*    verbatim, not a sequence of TypeScript calls, so neither runtime has to
*    reimplement the other's control flow.
*  - snapshots contain only OBSERVABLE canonical state. Nothing renderer-owned
*    (pixel settling, sprite depth, animation) appears here, because those are
*    legitimately allowed to differ.
*/
function cell(x, y) {
	return {
		x,
		y
	};
}
function item(id, anchor, footprint = {
	width: 1,
	height: 1
}, supportItemId = null) {
	return {
		id,
		assetId: `asset.${id}`,
		placement: {
			surface: "floor",
			anchor,
			offset: {
				x: 0,
				y: 0
			},
			rotationQuarter: 0,
			scale: 1,
			footprint,
			supportItemId
		},
		state: {}
	};
}
[...CAMERA_CORNERS.map((cameraCorner) => ({
	op: "setCameraCorner",
	cameraCorner
}))], item("rug", cell(0, 0), {
	width: 2,
	height: 2
}), item("lamp", cell(3, 2)), item("table", cell(0, 0), {
	width: 2,
	height: 2
}), item("chair", cell(1, 1)), item("outside", cell(9, 9)), item("table", cell(2, 2)), item("vase", cell(2, 2), {
	width: 1,
	height: 1
}, "ghost"), item("table", cell(1, 1), {
	width: 2,
	height: 1
}), item("plate", cell(1, 1), {
	width: 1,
	height: 1
}, "table");
//#endregion
//#region packages/buddy-domain/src/home/pack-mapping.ts
/** Floor material id → pack file. */
var PACK_FLOORS = {
	"floor.wood": "Floor_64_WoodHard.png",
	"floor.stone": "Floor_64_Concrete.png",
	"floor.grass": "Floor_64_Green.png",
	"floor.water": "Floor_64_Sea.png"
};
/**
* Home asset id → pack file.
*
* `home.toy.ball` has no counterpart in the pack, so it is deliberately absent
* and keeps its drawn circle. A missing entry is a supported state, not a gap
* to paper over with a wrong-looking sprite.
*/
var PACK_ITEMS = {
	"home.bed.basic": "Bed_A_4.png",
	"home.tv.basic": "BigTV_3_Off_Tile.png",
	"home.chair.basic": "Chair_2_A_Tile.png",
	"home.table.basic": "Table_10.png",
	"home.plant.basic": "Plant_1.png",
	"home.food-bowl.basic": "Dish.png"
};
/** Every file the plugin will read, keyed by the id the scene draws it for. */
var PACK_SPRITES = {
	...PACK_FLOORS,
	...PACK_ITEMS
};
/** Reverse index so the host can filter a large multi-selection cheaply. */
var KEY_BY_FILENAME = new Map(Object.entries(PACK_SPRITES).map(([key, file]) => [file.toLowerCase(), key]));
/**
* The sprite key a picked file provides, or null if Home has no use for it.
* The picker returns bare names, and the user may well select the whole pack,
* so this is what keeps the plugin from reading 1,097 files it does not want.
*/
function packSpriteKeyForFile(fileName) {
	const base = fileName.split(/[\\/]/).pop() ?? fileName;
	return KEY_BY_FILENAME.get(base.trim().toLowerCase()) ?? null;
}
/** How many of Home's sprites a selection covers, for user-facing feedback. */
function packCoverage(fileNames) {
	const keys = /* @__PURE__ */ new Set();
	for (const name of fileNames) {
		const key = packSpriteKeyForFile(name);
		if (key) keys.add(key);
	}
	return {
		found: keys.size,
		total: Object.keys(PACK_SPRITES).length
	};
}
//#endregion
//#region plugins/official/openpets.home-builder/src/index.ts
/** The two keys the scene reads and writes. Anything else is refused. */
var HOME_STATE_KEYS = ["pocket-buddy-plus:phaser-home:v2", "pocket-buddy-plus:phaser-home:v1"];
/** Where the decoded pack sprites are cached so the user picks their pack once. */
var PACK_CACHE_KEY = "pocket-buddy-plus:home:pack-sprites:v1";
/** A save big enough to be a bug rather than a room. */
var MAX_HOME_STATE_CHARS = 512 * 1024;
/** Per sprite. Pack tiles are a few KB; anything near this is not a tile. */
var MAX_SPRITE_BYTES = 512 * 1024;
/**
* Panel messages are capped at 64 KiB by the host, so sprites are streamed in
* pieces. Kept well under the cap to leave room for the envelope.
*/
var CHUNK_CHARS = 32 * 1024;
function isHomeStateKey(value) {
	return typeof value === "string" && HOME_STATE_KEYS.includes(value);
}
function toBase64(bytes) {
	let binary = "";
	for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
	return btoa(binary);
}
/** Split a data URL into message-sized pieces. */
function chunkDataUrl(dataUrl, chunkChars = CHUNK_CHARS) {
	const chunks = [];
	for (let index = 0; index < dataUrl.length; index += chunkChars) chunks.push(dataUrl.slice(index, index + chunkChars));
	return chunks;
}
/**
* Read the pack files Home can use out of whatever the user selected.
*
* The user is expected to select the whole pack - 1,097 files - so this filters
* by name first and only reads the matches. Reading everything would pull
* hundreds of megabytes through the plugin for no reason.
*/
async function collectPackSprites(files) {
	const sprites = {};
	for (const file of files) {
		const key = packSpriteKeyForFile(file.name);
		if (!key || sprites[key] || file.sizeBytes > 524288) continue;
		const bytes = await file.readBytes();
		if (bytes.byteLength > 524288) continue;
		sprites[key] = `data:image/png;base64,${toBase64(bytes)}`;
	}
	return sprites;
}
/** Stream one sprite set to the panel within the message size cap. */
async function sendSprites(panel, sprites) {
	await panel.postMessage({
		type: "home-pack-begin",
		keys: Object.keys(sprites),
		total: Object.keys(PACK_SPRITES).length
	});
	for (const [key, dataUrl] of Object.entries(sprites)) {
		const chunks = chunkDataUrl(dataUrl);
		for (let index = 0; index < chunks.length; index += 1) await panel.postMessage({
			type: "home-pack-chunk",
			key,
			index,
			count: chunks.length,
			data: chunks[index]
		});
	}
	await panel.postMessage({ type: "home-pack-end" });
}
function createHomeStateHandler(storage, panel, files) {
	return async function handle(message) {
		if (typeof message !== "object" || message === null) return;
		const { type, key, value } = message;
		if (type === "home-state-request") {
			const values = {};
			for (const stateKey of HOME_STATE_KEYS) {
				const stored = await storage.get(stateKey);
				if (typeof stored === "string") values[stateKey] = stored;
			}
			await panel.postMessage({
				type: "home-state",
				values
			});
			const cached = await storage.get(PACK_CACHE_KEY);
			if (typeof cached === "string") try {
				await sendSprites(panel, JSON.parse(cached));
			} catch {}
			return;
		}
		if (type === "home-state-write") {
			if (!isHomeStateKey(key) || typeof value !== "string" || value.length > 524288) return;
			await storage.set(key, value);
			return;
		}
		if (type === "home-pack-pick") {
			if (!files) {
				await panel.postMessage({
					type: "home-pack-error",
					error: "File access is unavailable."
				});
				return;
			}
			try {
				const picked = await files.pick({
					accept: [".png"],
					multiple: true
				});
				if (!picked.length) {
					await panel.postMessage({ type: "home-pack-cancelled" });
					return;
				}
				if (packCoverage(picked.map((file) => file.name)).found === 0) {
					await panel.postMessage({
						type: "home-pack-error",
						error: "No TinyHouse sprites Home uses were in that selection. Open the pack folder and select its images."
					});
					return;
				}
				const sprites = await collectPackSprites(picked);
				await storage.set(PACK_CACHE_KEY, JSON.stringify(sprites));
				await sendSprites(panel, sprites);
			} catch (error) {
				await panel.postMessage({
					type: "home-pack-error",
					error: String(error?.message ?? error).slice(0, 200)
				});
			}
		}
	};
}
function register(OpenPetsPlugin) {
	OpenPetsPlugin.register({ async start(ctx) {
		const context = ctx;
		await context.commands.register({
			id: "open-home",
			title: "$t:command.open.title",
			description: "$t:command.open.description",
			icon: "home"
		}, async () => {
			const panel = await context.ui.panel({
				panel: "home",
				title: "Buddy Home",
				width: 1180,
				height: 860
			});
			panel.onMessage(createHomeStateHandler(context.storage, panel, context.files));
			return panel;
		});
	} });
}
//#endregion
export { CHUNK_CHARS, HOME_STATE_KEYS, MAX_HOME_STATE_CHARS, MAX_SPRITE_BYTES, PACK_CACHE_KEY, chunkDataUrl, collectPackSprites, createHomeStateHandler, isHomeStateKey, register };
