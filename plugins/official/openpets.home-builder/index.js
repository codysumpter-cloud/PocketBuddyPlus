//#region plugins/official/openpets.home-builder/src/index.ts
/** The two keys the scene reads and writes. Anything else is refused. */
var HOME_STATE_KEYS = ["pocket-buddy-plus:phaser-home:v2", "pocket-buddy-plus:phaser-home:v1"];
/** A save big enough to be a bug rather than a room. */
var MAX_HOME_STATE_CHARS = 512 * 1024;
function isHomeStateKey(value) {
	return typeof value === "string" && HOME_STATE_KEYS.includes(value);
}
/**
* Wire one panel to plugin storage. Exported so the tests can drive it without
* an Electron window.
*/
function createHomeStateHandler(storage, panel) {
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
			return;
		}
		if (type === "home-state-write") {
			if (!isHomeStateKey(key) || typeof value !== "string" || value.length > 524288) return;
			await storage.set(key, value);
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
			panel.onMessage(createHomeStateHandler(context.storage, panel));
			return panel;
		});
	} });
}
//#endregion
export { HOME_STATE_KEYS, MAX_HOME_STATE_CHARS, createHomeStateHandler, isHomeStateKey, register };
