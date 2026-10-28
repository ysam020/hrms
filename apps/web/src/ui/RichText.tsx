import DOMPurify from "dompurify";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { IconButton } from "./controls";
import s from "./RichText.module.css";

// Minimal rich-text editor for long-form content (policies). A
// contentEditable surface with a small formatting toolbar; output is
// sanitised with DOMPurify, the same sanitiser Classic uses to render it.

const ALLOWED = [
  "p",
  "br",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "a",
  "blockquote",
];

export const sanitizeRich = (html: string) =>
  DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ALLOWED,
    ALLOWED_ATTR: ["href", "target", "rel"],
  });

export const plainText = (html: string) =>
  DOMPurify.sanitize(html, { ALLOWED_TAGS: [] }).trim();

type Cmd = { label: string; glyph: string; run: () => void; title: string };

export function RichTextEditor({
  value,
  onChange,
  label,
  invalid,
  minHeight = 280,
}: {
  value: string;
  onChange: (html: string) => void;
  label: string;
  invalid?: boolean;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Only push external value into the DOM when it differs, so the caret
  // doesn't jump while typing.
  useEffect(() => {
    const el = ref.current;
    if (el && sanitizeRich(el.innerHTML) !== sanitizeRich(value))
      el.innerHTML = sanitizeRich(value);
  }, [value]);

  const emit = () => onChange(sanitizeRich(ref.current?.innerHTML ?? ""));
  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    // execCommand is deprecated but remains the only cross-browser way to
    // apply inline formatting to a selection without an editor framework.
    document.execCommand(command, false, arg);
    emit();
  };
  const cmds: Cmd[] = [
    { label: "B", glyph: "B", title: "Bold (⌘B)", run: () => exec("bold") },
    { label: "I", glyph: "I", title: "Italic (⌘I)", run: () => exec("italic") },
    {
      label: "H2",
      glyph: "H",
      title: "Heading",
      run: () => exec("formatBlock", "h2"),
    },
    {
      label: "P",
      glyph: "¶",
      title: "Body text",
      run: () => exec("formatBlock", "p"),
    },
    {
      label: "UL",
      glyph: "•",
      title: "Bulleted list",
      run: () => exec("insertUnorderedList"),
    },
    {
      label: "OL",
      glyph: "1.",
      title: "Numbered list",
      run: () => exec("insertOrderedList"),
    },
  ];
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const url = window.prompt("Link address");
      if (url) exec("createLink", url);
    }
  };
  return (
    <div className={s.editor} data-invalid={invalid || undefined}>
      <div
        className={s.toolbar}
        role="toolbar"
        aria-label={`${label} formatting`}
      >
        {cmds.map((c) => (
          <button
            key={c.label}
            type="button"
            className={s.tool}
            title={c.title}
            aria-label={c.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={c.run}
          >
            <span data-glyph={c.label}>{c.glyph}</span>
          </button>
        ))}
        <IconButton
          icon="link"
          label="Add link (⌘K)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = window.prompt("Link address");
            if (url) exec("createLink", url);
          }}
        />
      </div>
      <div
        ref={ref}
        className={s.surface}
        style={{ minHeight }}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        aria-invalid={invalid || undefined}
        onInput={emit}
        onBlur={emit}
        onKeyDown={onKey}
      />
    </div>
  );
}
