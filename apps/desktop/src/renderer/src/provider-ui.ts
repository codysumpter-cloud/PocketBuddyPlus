const NVIDIA_PROVIDER_VALUE = "nvidia";

function isAiProviderSelect(select: HTMLSelectElement): boolean {
  const values = new Set(Array.from(select.options, (option) => option.value));
  return values.has("none") && values.has("anthropic") && values.has("openai") && values.has("ollama");
}

function ensureNvidiaProviderOption(): void {
  for (const select of document.querySelectorAll<HTMLSelectElement>("select.settings-select")) {
    if (!isAiProviderSelect(select) || select.querySelector(`option[value="${NVIDIA_PROVIDER_VALUE}"]`)) continue;

    const option = document.createElement("option");
    option.value = NVIDIA_PROVIDER_VALUE;
    option.textContent = "NVIDIA NIM";

    const ollama = select.querySelector<HTMLOptionElement>('option[value="ollama"]');
    if (ollama) select.insertBefore(option, ollama);
    else select.append(option);
  }
}

const observer = new MutationObserver(() => ensureNvidiaProviderOption());
observer.observe(document.documentElement, { childList: true, subtree: true });
ensureNvidiaProviderOption();
