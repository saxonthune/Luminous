import { useEffect, useState } from 'react'
import { Canvas } from '@luminous/cactus'
import { getDocument, type Document } from './api'

interface CanvasViewProps {
  documentPath: string
  onBack: () => void
}

export function CanvasView({ documentPath, onBack }: CanvasViewProps) {
  const [document, setDocument] = useState<Document | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getDocument(documentPath)
      .then(setDocument)
      .catch(() => setError('Failed to load document'))
      .finally(() => setLoading(false))
  }, [documentPath])

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <button
          onClick={onBack}
          className="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ← Back
        </button>
        <span className="text-sm text-gray-600">{documentPath}</span>
      </div>

      <div className="flex-1">
        {loading && (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            Loading...
          </div>
        )}
        {error && (
          <div className="flex h-full items-center justify-center text-sm text-red-500">
            {error}
          </div>
        )}
        {!loading && !error && document !== null && (
          <Canvas>{null}</Canvas>
        )}
      </div>
    </div>
  )
}
