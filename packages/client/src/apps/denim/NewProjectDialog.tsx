import { createSignal } from 'solid-js';
import { Button, DialogShell } from '../../ui';

interface NewProjectDialogProps {
  root: string;
  existingNames: string[];
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export function NewProjectDialog(props: NewProjectDialogProps) {
  const [name, setName] = createSignal('');
  let input: HTMLInputElement | undefined;
  const value = () => name().trim();
  const duplicate = () => props.existingNames.includes(`${value()}.denim.sqlite`);
  const valid = () => value().length > 0 && !/[\\/]/.test(value()) && !duplicate();

  return <DialogShell label="New Denim project" title="New Denim project" initialFocus={() => input} onDismiss={props.onCancel}>
    <form class="lui-dialog-form" onSubmit={(event) => { event.preventDefault(); if (valid()) props.onSubmit(value()); }}>
      <div class="lui-dialog-field-row">
        <input ref={input} value={name()} onInput={(event) => setName(event.currentTarget.value)}
          placeholder="Project name" aria-label="Project name"
          class="lui-input lui-input--grow" />
        <span class="lui-dialog-suffix">.denim.sqlite</span>
      </div>
      <p class="lui-dialog-context" title={props.root}>{props.root}</p>
      {duplicate() && <p class="lui-field-error">A project with that name already exists.</p>}
      <div class="lui-dialog-actions">
        <Button onClick={props.onCancel}>Cancel</Button>
        <Button type="submit" tone="primary" disabled={!valid()}>Create</Button>
      </div>
    </form>
  </DialogShell>;
}
