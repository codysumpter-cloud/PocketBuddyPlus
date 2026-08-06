type I18nSnapshot = {
  locale: string;
  messages: Record<string, string>;
};

type I18nApi = {
  getI18n(): Promise<I18nSnapshot>;
};

declare global {
  interface Window {
    openPetsControlCenter: I18nApi & Record<string, unknown>;
    __buddyBrainI18nInstalled?: boolean;
  }
}

const messages: Record<string, string> = {
  "settings.buddyBrain.eyebrow": "Visual behavior mapping",
  "settings.buddyBrain.title": "Buddy Brain",
  "settings.buddyBrain.description": "Connect reactions to animations for {name}. Every edge compiles back into the existing Reaction Mapping system.",
  "settings.buddyBrain.close": "Close editor",
  "settings.buddyBrain.saving": "Saving",
  "settings.buddyBrain.saved": "Saved",
  "settings.buddyBrain.saveFailed": "Save failed",
  "settings.buddyBrain.resetLayout": "Reset layout",
  "settings.buddyBrain.resetMappings": "Reset mappings",
  "settings.buddyBrain.canvasAria": "Visual reaction-to-animation mapping canvas",
  "settings.buddyBrain.inspector": "Selected trigger",
  "settings.buddyBrain.animation": "Animation",
  "settings.buddyBrain.incomplete": "incomplete",
  "settings.buddyBrain.tip": "Drag from a trigger handle to an animation to create a rule. Existing list controls remain available after you close the editor.",
  "settings.buddyBrain.selectTrigger": "Select a trigger to edit its animation.",
};

function install(): void {
  const api = window.openPetsControlCenter;
  if (!api || window.__buddyBrainI18nInstalled) return;
  const originalGetI18n = api.getI18n.bind(api);
  api.getI18n = async () => {
    const snapshot = await originalGetI18n();
    return {
      ...snapshot,
      messages: { ...messages, ...snapshot.messages },
    };
  };
  window.__buddyBrainI18nInstalled = true;
}

install();
