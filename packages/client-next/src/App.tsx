import { useState } from 'react'
import { DocumentPicker } from './DocumentPicker'
import { CanvasView } from './CanvasView'

type View =
  | { state: 'picker' }
  | { state: 'canvas'; path: string }

export function App() {
  const [view, setView] = useState<View>({ state: 'picker' })

  if (view.state === 'canvas') {
    return (
      <CanvasView
        documentPath={view.path}
        onBack={() => setView({ state: 'picker' })}
      />
    )
  }

  return (
    <DocumentPicker
      onOpen={(path) => setView({ state: 'canvas', path })}
    />
  )
}
