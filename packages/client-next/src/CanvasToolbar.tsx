import { createSignal } from 'solid-js';

interface CanvasToolbarProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onTreeLayout: () => void;
  onForceLayout: () => void;
  onTidyLayout: () => void;
}

export function CanvasToolbar(props: CanvasToolbarProps) {
  const [dropdownOpen, setDropdownOpen] = createSignal(false);

  return (
    <div
      data-no-pan
      class="absolute top-3 left-3 flex flex-col gap-1 bg-white rounded-lg shadow-md border border-gray-200 p-1 z-10"
    >
      <button
        onClick={props.onZoomIn}
        class="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 text-sm font-medium"
        title="Zoom In"
      >
        +
      </button>
      <button
        onClick={props.onZoomOut}
        class="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 text-sm font-medium"
        title="Zoom Out"
      >
        −
      </button>
      <button
        onClick={props.onFitView}
        class="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 text-sm"
        title="Fit View"
      >
        ⊞
      </button>
      <div
        class="relative"
        onMouseEnter={() => setDropdownOpen(true)}
        onMouseLeave={() => setDropdownOpen(false)}
      >
        <button
          onClick={props.onTreeLayout}
          class="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 text-sm"
          title="Arrange"
        >
          ⊙
        </button>
        {dropdownOpen() && (
          <div class="absolute left-full top-0 pl-1 bg-white rounded-lg shadow-md border border-gray-200 py-1 min-w-max">
            <button
              onClick={() => { props.onTreeLayout(); setDropdownOpen(false); }}
              class="w-full px-3 py-1 text-left text-sm text-gray-600 hover:bg-gray-100"
            >
              Tree Layout
            </button>
            <button
              onClick={() => { props.onForceLayout(); setDropdownOpen(false); }}
              class="w-full px-3 py-1 text-left text-sm text-gray-600 hover:bg-gray-100"
            >
              Force Layout
            </button>
            <button
              onClick={() => { props.onTidyLayout(); setDropdownOpen(false); }}
              class="w-full px-3 py-1 text-left text-sm text-gray-600 hover:bg-gray-100"
            >
              Tidy Layout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
