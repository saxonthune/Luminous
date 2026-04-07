interface CanvasToolbarProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onUntangle: () => void;
}

export function CanvasToolbar(props: CanvasToolbarProps) {
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
      <button
        onClick={props.onUntangle}
        class="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 text-sm"
        title="Untangle"
      >
        ⊙
      </button>
    </div>
  );
}
