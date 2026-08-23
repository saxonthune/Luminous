import type { Component } from 'solid-js';
import { KIND_DESCRIPTORS } from '@luminous/core/linen';

export interface GlyphProps {
  size?: number;
}

function frame(props: GlyphProps, children: Component<Record<string, never>>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={props.size ?? 20}
      height={props.size ?? 20}
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {children({})}
    </svg>
  );
}

const EntryGlyph: Component<GlyphProps> = (props) =>
  frame(props, () => <circle cx="10" cy="10" r="4" fill="currentColor" stroke="none" />);

const FilterGlyph: Component<GlyphProps> = (props) =>
  frame(props, () => (
    <>
      <path d="M10 2 L17 5 V10 C17 14.5 13.5 17.3 10 18 C6.5 17.3 3 14.5 3 10 V5 Z" />
      <path d="M5 7 L12 14 M8 5 L15 12" stroke-width="1" />
    </>
  ));

const SwitchGlyph: Component<GlyphProps> = (props) =>
  frame(props, () => (
    <>
      <path d="M10 3 V9" />
      <path d="M10 9 L4 16 M10 9 V16 M10 9 L16 16" />
    </>
  ));

const TransformationGlyph: Component<GlyphProps> = (props) =>
  frame(props, () => (
    <>
      <path d="M3 4 L10 10 L3 16 Z M17 4 L10 10 L17 16 Z" />
      <path d="M4 7 L7 10 L4 13 M16 7 L13 10 L16 13" stroke-width="1" />
    </>
  ));

const TypeGlyph: Component<GlyphProps> = (props) =>
  frame(props, () => (
    <>
      <rect x="5" y="5" width="10" height="10" />
      <path d="M5 9 L9 5 M5 13 L13 5 M7 15 L15 7 M11 15 L15 11" stroke-width="1" />
    </>
  ));

const PassGlyph: Component<GlyphProps> = (props) =>
  frame(props, () => (
    <>
      <path d="M3 12 H12 M12 12 V6 M12 9 H15 M12 12 H16 M12 15 H15 M3 12 V16 H12" />
      <path d="M12 6 C12 5 13.5 5 13.5 6 V9" />
    </>
  ));

const ReturnGlyph: Component<GlyphProps> = (props) =>
  frame(props, () => <path d="M10 3 L17 10 L10 17 L3 10 Z" />);

const ReleaseControlGlyph: Component<GlyphProps> = (props) =>
  frame(props, () => (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M6.5 10.5 L9 13 L13.5 7.5" />
    </>
  ));

/** The one place Glyph shapes live, keyed by the descriptor table's `glyph`
 * ids (epic decision 3). */
export const GLYPHS: Record<string, Component<GlyphProps>> = {
  entry: EntryGlyph,
  filter: FilterGlyph,
  switch: SwitchGlyph,
  transformation: TransformationGlyph,
  type: TypeGlyph,
  pass: PassGlyph,
  return: ReturnGlyph,
  'release-control': ReleaseControlGlyph,
};

export function glyphFor(glyph: string): Component<GlyphProps> {
  return GLYPHS[glyph] ?? EntryGlyph;
}

/** Checked by tests: every descriptor's glyph id must resolve. */
export function missingGlyphIds(): string[] {
  return KIND_DESCRIPTORS.map(d => d.glyph).filter(id => GLYPHS[id] === undefined);
}
