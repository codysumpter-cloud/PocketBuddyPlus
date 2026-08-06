import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createActor } from "xstate";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./buddy-brain.css";
import {
  animationNodeId,
  compileOverrides,
  createBuddyBrainMachine,
  createDefaultLayout,
  layoutStorageKey,
  normalizeLayout,
  parseAnimationNodeId,
  parseReactionNodeId,
  parseStoredLayout,
  reactionNodeId,
  resolveMappings,
  serializeLayout,
  updateMapping,
  type BuddyBrainAnimation,
  type BuddyBrainLayout,
  type BuddyBrainMapping,
  type BuddyBrainReaction,
} from "./buddy-brain-core";

type ReactionAnimationSettings = {
  selectedPetId: string;
  selectedPetDisplayName: string;
  pets: { id: string; displayName: string; builtIn: boolean }[];
  reactions: { id: string; label: string; description: string; canonicalDefault: string; defaultAnimation: string }[];
  animations: { id: string; label: string; complete: boolean }[];
  overrides: Record<string, string>;
};

type I18nSnapshot = {
  locale: string;
  messages: Record<string, string>;
};

type ControlCenterApi = {
  getReactionAnimationSettings(petId?: string): Promise<ReactionAnimationSettings>;
  setReactionAnimationOverrides(petId: string, overrides: Record<string, string>): Promise<ReactionAnimationSettings>;
  getI18n(): Promise<I18nSnapshot>;
};

declare global {
  interface Window {
    openPetsControlCenter: ControlCenterApi;
  }
}

type BrainNodeData = {
  label: string;
  description?: string;
  kind: "reaction" | "animation";
  active?: boolean;
  incomplete?: boolean;
};

type BrainNode = Node<BrainNodeData>;

type OpenDetail = { petId?: string };

const OPEN_EVENT = "openpets:buddy-brain-open";
const ROOT_ID = "buddy-brain-root";
const LAUNCHER_ID = "buddy-brain-launcher";

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : whole,
  );
}

function translator(snapshot: I18nSnapshot | null) {
  return (key: string, values?: Record<string, string | number>) => interpolate(snapshot?.messages[key] ?? key, values);
}

function ReactionNode({ data, selected }: NodeProps<BrainNode>) {
  return (
    <div className={`buddy-brain-node reaction-node ${selected || data.active ? "selected" : ""}`}>
      <span className="buddy-brain-node-kicker">Trigger</span>
      <strong>{data.label}</strong>
      {data.description ? <small>{data.description}</small> : null}
      <Handle type="source" position={Position.Right} aria-label={`Connect ${data.label} to an animation`} />
    </div>
  );
}

function AnimationNode({ data, selected }: NodeProps<BrainNode>) {
  return (
    <div className={`buddy-brain-node animation-node ${selected || data.active ? "selected" : ""} ${data.incomplete ? "incomplete" : ""}`}>
      <Handle type="target" position={Position.Left} aria-label={`Map a trigger to ${data.label}`} />
      <span className="buddy-brain-node-kicker">Animation</span>
      <strong>{data.label}</strong>
      <small>{data.incomplete ? "Missing required frames" : "Available for this Buddy"}</small>
    </div>
  );
}

const nodeTypes = {
  reaction: ReactionNode,
  animation: AnimationNode,
};

function buildNodes(
  reactions: readonly BuddyBrainReaction[],
  animations: readonly BuddyBrainAnimation[],
  layout: BuddyBrainLayout,
  selectedReactionId: string | null,
  mappings: Readonly<BuddyBrainMapping>,
): BrainNode[] {
  const reactionNodes: BrainNode[] = reactions.map((reaction) => ({
    id: reactionNodeId(reaction.id),
    type: "reaction",
    position: layout.positions[reactionNodeId(reaction.id)] ?? { x: 48, y: 48 },
    data: {
      kind: "reaction",
      label: reaction.label,
      description: reaction.description,
      active: selectedReactionId === reaction.id,
    },
  }));

  const usedAnimations = new Set(Object.values(mappings));
  const animationNodes: BrainNode[] = animations.map((animation) => ({
    id: animationNodeId(animation.id),
    type: "animation",
    position: layout.positions[animationNodeId(animation.id)] ?? { x: 540, y: 48 },
    connectable: animation.complete,
    data: {
      kind: "animation",
      label: animation.label,
      active: usedAnimations.has(animation.id),
      incomplete: !animation.complete,
    },
  }));

  return [...reactionNodes, ...animationNodes];
}

function buildEdges(reactions: readonly BuddyBrainReaction[], mappings: Readonly<BuddyBrainMapping>): Edge[] {
  return reactions.flatMap((reaction) => {
    const animationId = mappings[reaction.id];
    if (!animationId) return [];
    return [{
      id: `mapping:${reaction.id}:${animationId}`,
      source: reactionNodeId(reaction.id),
      target: animationNodeId(animationId),
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
      animated: false,
      className: "buddy-brain-edge",
    } satisfies Edge];
  });
}

function loadLayout(petId: string, reactions: readonly BuddyBrainReaction[], animations: readonly BuddyBrainAnimation[]): BuddyBrainLayout {
  const fallback = createDefaultLayout(reactions, animations);
  const validNodeIds = new Set(Object.keys(fallback.positions));
  return parseStoredLayout(window.localStorage.getItem(layoutStorageKey(petId)), fallback, validNodeIds);
}

function saveLayout(petId: string, layout: BuddyBrainLayout): void {
  try {
    window.localStorage.setItem(layoutStorageKey(petId), serializeLayout(layout));
  } catch {
    // A read-only browser profile should not block reaction mapping edits.
  }
}

function BuddyBrainEditor({ initialSettings, t, onClose }: {
  initialSettings: ReactionAnimationSettings;
  t: ReturnType<typeof translator>;
  onClose: () => void;
}) {
  const api = window.openPetsControlCenter;
  const [settings, setSettings] = useState(initialSettings);
  const reactions = settings.reactions as BuddyBrainReaction[];
  const animations = settings.animations as BuddyBrainAnimation[];
  const [mappings, setMappings] = useState<BuddyBrainMapping>(() => resolveMappings(reactions, settings.overrides));
  const [layout, setLayout] = useState<BuddyBrainLayout>(() => loadLayout(settings.selectedPetId, reactions, animations));
  const saveQueue = useRef(Promise.resolve());
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const actor = useMemo(() => createActor(createBuddyBrainMachine(reactions[0]?.id ?? null)), [settings.selectedPetId]);
  const [machineSnapshot, setMachineSnapshot] = useState(actor.getSnapshot());

  useEffect(() => {
    const subscription = actor.subscribe(setMachineSnapshot);
    actor.start();
    return () => {
      subscription.unsubscribe();
      actor.stop();
    };
  }, [actor]);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const selectedReactionId = machineSnapshot.context.selectedReactionId ?? reactions[0]?.id ?? null;
  const selectedReaction = reactions.find((reaction) => reaction.id === selectedReactionId) ?? null;
  const validNodeIds = useMemo(() => new Set([
    ...reactions.map((reaction) => reactionNodeId(reaction.id)),
    ...animations.map((animation) => animationNodeId(animation.id)),
  ]), [reactions, animations]);

  const initialNodes = useMemo(
    () => buildNodes(reactions, animations, layout, selectedReactionId, mappings),
    [settings.selectedPetId],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<BrainNode>(initialNodes);

  useEffect(() => {
    setNodes((current) => current.map((node) => {
      if (node.data.kind === "reaction") {
        const reactionId = parseReactionNodeId(node.id);
        return { ...node, data: { ...node.data, active: reactionId === selectedReactionId } };
      }
      const animationId = parseAnimationNodeId(node.id);
      return { ...node, data: { ...node.data, active: Boolean(animationId && Object.values(mappings).includes(animationId)) } };
    }));
  }, [selectedReactionId, mappings, setNodes]);

  const edges = useMemo(() => buildEdges(reactions, mappings), [reactions, mappings]);

  const persistMappings = useCallback((nextMappings: BuddyBrainMapping) => {
    actor.send({ type: "SAVE" });
    const task = saveQueue.current.catch(() => undefined).then(async () => {
      try {
        const nextSettings = await api.setReactionAnimationOverrides(
          settings.selectedPetId,
          compileOverrides(reactions, nextMappings),
        );
        setSettings(nextSettings);
        actor.send({ type: "SAVED" });
      } catch (error) {
        actor.send({ type: "FAILED", message: String((error as Error)?.message ?? error) });
      }
    });
    saveQueue.current = task;
  }, [actor, api, reactions, settings.selectedPetId]);

  const mapReaction = useCallback((reactionId: string, animationId: string) => {
    const animation = animations.find((candidate) => candidate.id === animationId);
    if (!animation?.complete || !reactions.some((reaction) => reaction.id === reactionId)) return;
    const nextMappings = updateMapping(mappings, reactionId, animationId);
    setMappings(nextMappings);
    actor.send({ type: "SELECT", reactionId });
    persistMappings(nextMappings);
  }, [actor, animations, mappings, persistMappings, reactions]);

  const onConnect = useCallback((connection: Connection) => {
    const reactionId = parseReactionNodeId(connection.source);
    const animationId = parseAnimationNodeId(connection.target);
    if (reactionId && animationId) mapReaction(reactionId, animationId);
  }, [mapReaction]);

  const resetLayout = useCallback(() => {
    const nextLayout = normalizeLayout(null, createDefaultLayout(reactions, animations), validNodeIds);
    setLayout(nextLayout);
    setNodes(buildNodes(reactions, animations, nextLayout, selectedReactionId, mappings));
    saveLayout(settings.selectedPetId, nextLayout);
  }, [animations, mappings, reactions, selectedReactionId, setNodes, settings.selectedPetId, validNodeIds]);

  const resetMappings = useCallback(() => {
    const defaults = resolveMappings(reactions, {});
    setMappings(defaults);
    actor.send({ type: "SAVE" });
    const task = saveQueue.current.catch(() => undefined).then(async () => {
      try {
        const nextSettings = await api.setReactionAnimationOverrides(settings.selectedPetId, {});
        setSettings(nextSettings);
        actor.send({ type: "SAVED" });
      } catch (error) {
        actor.send({ type: "FAILED", message: String((error as Error)?.message ?? error) });
      }
    });
    saveQueue.current = task;
  }, [actor, api, reactions, settings.selectedPetId]);

  const saveState = String(machineSnapshot.value);

  return (
    <div className="buddy-brain-overlay" role="dialog" aria-modal="true" aria-labelledby="buddy-brain-title">
      <button className="buddy-brain-backdrop" type="button" aria-label={t("settings.buddyBrain.close")} onClick={onClose} />
      <section className="buddy-brain-dialog">
        <header className="buddy-brain-header">
          <div>
            <p className="eyebrow">{t("settings.buddyBrain.eyebrow")}</p>
            <h2 id="buddy-brain-title">{t("settings.buddyBrain.title")}</h2>
            <p>{t("settings.buddyBrain.description", { name: settings.selectedPetDisplayName })}</p>
          </div>
          <div className="buddy-brain-header-actions">
            <span className={`buddy-brain-save-state ${saveState}`} role="status" aria-live="polite">
              {saveState === "saving" ? t("settings.buddyBrain.saving") : saveState === "error" ? t("settings.buddyBrain.saveFailed") : t("settings.buddyBrain.saved")}
            </span>
            <button className="btn btn-secondary btn-compact" type="button" onClick={resetLayout}>{t("settings.buddyBrain.resetLayout")}</button>
            <button className="btn btn-secondary btn-compact" type="button" onClick={resetMappings}>{t("settings.buddyBrain.resetMappings")}</button>
            <button ref={closeButtonRef} className="btn btn-primary btn-compact" type="button" onClick={onClose}>{t("settings.buddyBrain.close")}</button>
          </div>
        </header>

        {machineSnapshot.context.error ? (
          <div className="buddy-brain-error">
            <span>{machineSnapshot.context.error}</span>
            <button type="button" onClick={() => actor.send({ type: "DISMISS_ERROR" })}>{t("common.close")}</button>
          </div>
        ) : null}

        <div className="buddy-brain-workspace">
          <div className="buddy-brain-canvas" aria-label={t("settings.buddyBrain.canvasAria") }>
            <ReactFlow<BrainNode, Edge>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onNodeClick={(_, node) => {
                const reactionId = parseReactionNodeId(node.id);
                if (reactionId) actor.send({ type: "SELECT", reactionId });
              }}
              onNodeDragStop={(_, node) => {
                const nextLayout = normalizeLayout({
                  version: 1,
                  positions: { ...layout.positions, [node.id]: node.position },
                }, createDefaultLayout(reactions, animations), validNodeIds);
                setLayout(nextLayout);
                saveLayout(settings.selectedPetId, nextLayout);
              }}
              onConnect={onConnect}
              isValidConnection={(connection) => Boolean(
                parseReactionNodeId(connection.source)
                && parseAnimationNodeId(connection.target)
                && animations.find((animation) => animation.id === parseAnimationNodeId(connection.target))?.complete,
              )}
              fitView
              fitViewOptions={{ padding: 0.18 }}
              minZoom={0.25}
              maxZoom={1.6}
              deleteKeyCode={null}
              nodesConnectable
              nodesDraggable
              elementsSelectable
            >
              <Background gap={22} size={1} />
              <MiniMap pannable zoomable nodeStrokeWidth={3} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>

          <aside className="buddy-brain-inspector">
            <span className="buddy-brain-node-kicker">{t("settings.buddyBrain.inspector")}</span>
            {selectedReaction ? (
              <>
                <h3>{selectedReaction.label}</h3>
                <p>{selectedReaction.description}</p>
                <label>
                  <span>{t("settings.buddyBrain.animation")}</span>
                  <select
                    className="settings-select"
                    value={mappings[selectedReaction.id] ?? selectedReaction.defaultAnimation}
                    onChange={(event) => mapReaction(selectedReaction.id, event.target.value)}
                  >
                    {animations.map((animation) => (
                      <option key={animation.id} value={animation.id} disabled={!animation.complete}>
                        {animation.label}{animation.complete ? "" : ` — ${t("settings.buddyBrain.incomplete")}`}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="buddy-brain-rule-preview">
                  <span>{selectedReaction.label}</span>
                  <b>→</b>
                  <span>{animations.find((animation) => animation.id === mappings[selectedReaction.id])?.label ?? mappings[selectedReaction.id]}</span>
                </div>
                <p className="buddy-brain-tip">{t("settings.buddyBrain.tip")}</p>
              </>
            ) : <p>{t("settings.buddyBrain.selectTrigger")}</p>}
          </aside>
        </div>
      </section>
    </div>
  );
}

function BuddyBrainHost() {
  const [openSettings, setOpenSettings] = useState<ReactionAnimationSettings | null>(null);
  const [i18n, setI18n] = useState<I18nSnapshot | null>(null);
  const [loadError, setLoadError] = useState("");
  const t = useMemo(() => translator(i18n), [i18n]);

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<OpenDetail>).detail;
      setLoadError("");
      void Promise.all([
        window.openPetsControlCenter.getReactionAnimationSettings(detail?.petId),
        window.openPetsControlCenter.getI18n().catch(() => null),
      ]).then(([settings, snapshot]) => {
        setI18n(snapshot);
        setOpenSettings(settings);
      }).catch((error) => setLoadError(String((error as Error)?.message ?? error)));
    };
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  if (loadError) {
    return (
      <div className="buddy-brain-load-error" role="alert">
        <span>{loadError}</span>
        <button type="button" onClick={() => setLoadError("")}>×</button>
      </div>
    );
  }
  if (!openSettings) return null;
  return <BuddyBrainEditor key={openSettings.selectedPetId} initialSettings={openSettings} t={t} onClose={() => setOpenSettings(null)} />;
}

function selectedReactionPetId(grid: Element): string | undefined {
  const section = grid.closest(".settings-section") ?? grid.parentElement;
  const select = section?.querySelector<HTMLSelectElement>(".reaction-pet-selector select");
  return select?.value || undefined;
}

function installLauncher(): void {
  const grid = document.querySelector(".reaction-grid");
  if (!grid || document.getElementById(LAUNCHER_ID)) return;

  const launcher = document.createElement("div");
  launcher.id = LAUNCHER_ID;
  launcher.className = "buddy-brain-launcher";
  launcher.innerHTML = `
    <div>
      <strong>Buddy Brain</strong>
      <small>Build reaction-to-animation rules on a visual canvas. The list below stays available as a fallback.</small>
    </div>
  `;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-primary btn-compact";
  button.textContent = "Open visual editor";
  button.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent<OpenDetail>(OPEN_EVENT, {
      detail: { petId: selectedReactionPetId(grid) },
    }));
  });
  launcher.append(button);
  grid.parentElement?.insertBefore(launcher, grid);
}

function bootstrap(): void {
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    document.body.append(root);
    createRoot(root).render(<BuddyBrainHost />);
  }

  installLauncher();
  const observer = new MutationObserver(installLauncher);
  observer.observe(document.getElementById("root") ?? document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
