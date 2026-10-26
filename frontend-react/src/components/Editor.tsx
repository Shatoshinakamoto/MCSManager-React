/**
 * CodeMirror 6 text editor (port of components/Editor.vue): language picked
 * from the file extension, JSON linting, Tokyo Night theme, pinch-to-zoom.
 * Uncontrolled: `text` seeds the document and `onChange` reports edits.
 */
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { xml } from "@codemirror/lang-xml";
import { LanguageSupport, StreamLanguage } from "@codemirror/language";
import * as propertiesMode from "@codemirror/legacy-modes/mode/properties";
import * as shellMode from "@codemirror/legacy-modes/mode/shell";
import * as yamlMode from "@codemirror/legacy-modes/mode/yaml";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorState, StateEffect, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tokyoNight } from "@uiw/codemirror-theme-tokyo-night";
import { basicSetup } from "codemirror";
import { useEffect, useRef } from "react";
import { useScreen } from "@/hooks/useScreen";
import { getFileExtName } from "@/tools/fileManager";
import "./Editor.scss";

const MAX_SCALE = 1.25;
const MIN_SCALE = 0.4;

function languageExtension(filename: string): Extension[] {
  const ext = getFileExtName(filename);
  const stream = (mode: Parameters<typeof StreamLanguage.define>[0]) => [new LanguageSupport(StreamLanguage.define(mode))];
  const map: { name: string[]; plugin: () => Extension[] }[] = [
    { name: ["json", "json5"], plugin: () => [json(), lintGutter(), linter(jsonParseLinter())] },
    { name: ["js", "jsx", "ts", "tsx", "mjs", "djs"], plugin: () => [javascript({ jsx: true, typescript: ext === "ts" })] },
    { name: ["xml"], plugin: () => [xml()] },
    { name: ["css", "less", "scss"], plugin: () => [css()] },
    { name: ["html", "vue"], plugin: () => [html()] },
    { name: ["yaml", "yml", "toml"], plugin: () => stream(yamlMode.yaml) },
    { name: ["properties", "ini"], plugin: () => stream(propertiesMode.properties) },
    { name: ["shell", "sh", "bat", "cmd"], plugin: () => stream(shellMode.shell) },
    { name: ["py", "pyi", "pyw"], plugin: () => [python()] }
  ];
  return map.find((item) => item.name.includes(ext))?.plugin() ?? [javascript()];
}

function themeExtension(fontSize: number, lineHeight: number): Extension {
  return EditorView.theme({
    "&": { fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px`, "--cm-lint-marker-error-color": "#dc3545" },
    ".cm-content": { fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px`, "border-left": "1px solid #fbfbfb" },
    ".cm-gutters": { backgroundColor: "#1a1a1c", color: "#666672", fontSize: `${fontSize}px`, minWidth: `${fontSize * 3}px` }
  });
}

interface Props {
  text: string;
  filename: string;
  height: string;
  onChange: (text: string) => void;
}

export default function Editor({ text, filename, height, onChange }: Props) {
  const { isPhone } = useScreen();
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    const container = containerRef.current;
    if (!host || !container) return;
    const baseFontSize = isPhone ? 12 : 15;
    const baseLineHeight = isPhone ? 16 : 22;
    const lang = languageExtension(filename);
    const base: Extension[] = [
      basicSetup,
      tokyoNight,
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        if (!u.changes.empty) onChangeRef.current(u.state.doc.toString());
      })
    ];
    const view = new EditorView({
      state: EditorState.create({ doc: text, extensions: [...base, ...lang, themeExtension(baseFontSize, baseLineHeight)] }),
      parent: host
    });

    // Two-finger pinch zoom (upstream behaviour).
    let startDistance = 0;
    let startScale = 1;
    let scale = 1;
    let frame = 0;
    const dist = (e: TouchEvent) => Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      startDistance = dist(e);
      startScale = scale;
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      cancelAnimationFrame(frame);
      const d = dist(e);
      frame = requestAnimationFrame(() => {
        if (startDistance <= 0) return;
        scale = Math.min(Math.max(startScale * (d / startDistance), MIN_SCALE), MAX_SCALE);
        view.dispatch({
          effects: StateEffect.reconfigure.of([...base, ...lang, themeExtension(Math.round(baseFontSize * scale), Math.round(baseLineHeight * scale))])
        });
      });
    };
    const onEnd = () => {
      startDistance = 0;
      cancelAnimationFrame(frame);
    };
    container.addEventListener("touchstart", onStart);
    container.addEventListener("touchmove", onMove, { passive: false });
    container.addEventListener("touchend", onEnd);
    container.addEventListener("touchcancel", onEnd);
    return () => {
      container.removeEventListener("touchstart", onStart);
      container.removeEventListener("touchmove", onMove);
      container.removeEventListener("touchend", onEnd);
      container.removeEventListener("touchcancel", onEnd);
      cancelAnimationFrame(frame);
      view.destroy();
    };
    // The document is seeded once per file; later `text` changes come from this editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename, isPhone]);

  return (
    <div className="editor-wrapper" style={{ height, ["--editor-height" as string]: height }}>
      <div ref={containerRef} className="editor-container">
        <div ref={hostRef} className="file-editor" />
      </div>
    </div>
  );
}
