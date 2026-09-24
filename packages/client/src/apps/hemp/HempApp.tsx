import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import {
  parseHempDocument,
  parseHempMap,
  type HempMap,
  type HempDocument,
} from "@luminous/core/hemp";
import { DocumentPicker } from "../../DocumentPicker";
import {
  fetchServerSources,
  fetchStaticSources,
  writeDocument,
  type CanvasSource,
} from "../../sources";
import { readParam, writeParam } from "../../urlState";
import { watchDocuments } from "../../ws/watchClient";
import { HempCanvas } from "./HempCanvas";
import { FunctionBoard } from "./FunctionBoard";
import { HempMapView } from "./HempMap";

export function HempApp() {
  const [sources, setSources] = createSignal<CanvasSource[]>([]);
  const [source, setSource] = createSignal<CanvasSource | null>(null);
  const [doc, setDoc] = createSignal<HempDocument | null>(null);
  const [map, setMap] = createSignal<HempMap | null>(null);
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  let generation = 0;
  let disposed = false;
  async function load(item: CanvasSource) {
    const ticket = ++generation;
    setSource(item);
    setLoading(true);
    setError("");
    writeParam("src", item.id);
    try {
      const text = await item.load();
      const isMap = item.id.endsWith(".hemp2.json");
      const next = isMap ? parseHempMap(text) : parseHempDocument(text);
      if (!disposed && ticket === generation) {
        setDoc(isMap ? null : (next as HempDocument));
        setMap(isMap ? (next as HempMap) : null);
      }
    } catch (e) {
      if (!disposed && ticket === generation) setError(String(e));
    } finally {
      if (!disposed && ticket === generation) setLoading(false);
    }
  }
  async function boot() {
    setError("");
    setLoading(true);
    try {
      const items = (
        await Promise.all(
          [".hemp.json", ".hemp2.json"].map((suffix) =>
            __STATIC__ ? fetchStaticSources(suffix) : fetchServerSources(suffix),
          ),
        )
      ).flat();
      if (disposed) return;
      setSources(items);
      const initial = items.find((s) => s.id === readParam("src"));
      if (initial) await load(initial);
    } catch (e) {
      if (!disposed) setError(String(e));
    } finally {
      if (!disposed) setLoading(false);
    }
  }
  async function save(next: HempDocument) {
    const item = source();
    if (!item || busy()) return;
    setDoc(next);
    setBusy(true);
    setError("");
    try {
      const result = await writeDocument(item.id, next);
      if (!result.ok) throw new Error(result.error);
    } catch (e) {
      setError(`Save failed. Your changes remain on screen. ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }
  onMount(() => {
    void boot();
    const stop = watchDocuments((path) => {
      const item = source();
      if (item?.id === path && !busy()) void load(item);
    });
    onCleanup(() => {
      disposed = true;
      generation++;
      stop();
    });
  });
  return (
    <>
      <Portal mount={document.getElementById("app-header-left")!}>
        <Show when={source()}>
          <button
            disabled={busy()}
            class="text-sm"
            onClick={() => {
              generation++;
              setDoc(null);
              setMap(null);
              setSource(null);
              setError("");
              setLoading(false);
              writeParam("src", null);
              void boot();
            }}
          >
            ← Documents
          </button>
        </Show>
        <span class="text-sm text-fg-muted">{source()?.label}</span>
        <Show when={busy()}>
          <span role="status" class="text-xs">
            Saving…
          </span>
        </Show>
      </Portal>
      <Show when={error()}>
        <div role="alert" class="flex items-center gap-3 bg-surface-alt p-3 text-sm">
          {error()}
          <button onClick={() => (doc() ? void save(doc()!) : void boot())}>Retry</button>
        </div>
      </Show>
      <Show
        when={doc() || map()}
        fallback={
          <div class="flex min-h-0 flex-1 flex-col">
            <Show when={loading()}>
              <p class="p-4 text-fg-muted">Loading Hemp documents…</p>
            </Show>
            <DocumentPicker
              heading="Hemp documents"
              sources={sources()}
              onSelect={(item) => void load(item)}
              loadingId={loading() ? source()?.id : null}
            />
            <p class="px-6 text-sm text-fg-muted">
              Generate a Rust inventory with <code>just generate-hemp</code>.
            </p>
          </div>
        }
      >
        <Show
          when={map()}
          keyed
          fallback={
            <Show
              when={doc()?.functionInfo}
              keyed
              fallback={
                <HempCanvas
                  doc={doc()!}
                  disabled={busy() || loading()}
                  onChange={(next) => void save(next)}
                />
              }
            >
              {(info) => <FunctionBoard doc={doc()!} info={info} />}
            </Show>
          }
        >
          {(value) => <HempMapView doc={value} sourceId={source()!.id} />}
        </Show>
      </Show>
    </>
  );
}
