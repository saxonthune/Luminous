import { useEffect, useState } from 'react'
import { listDocuments, type DocumentMeta } from './api'

interface DocumentPickerProps {
  onOpen: (path: string) => void
}

export function DocumentPicker({ onOpen }: DocumentPickerProps) {
  const [documents, setDocuments] = useState<DocumentMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    listDocuments()
      .then(setDocuments)
      .finally(() => setLoading(false))
  }, [])

  function handleCreate() {
    const trimmed = newName.trim()
    if (!trimmed) return
    const path = trimmed.endsWith('.canvas.json') ? trimmed : `${trimmed}.canvas.json`
    setNewName('')
    setCreating(false)
    onOpen(path)
  }

  function formatDate(ts: number) {
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-lg rounded-lg bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Canvases</h1>
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              New canvas
            </button>
          )}
        </div>

        {creating && (
          <div className="mb-4 flex gap-2">
            <input
              autoFocus
              type="text"
              placeholder="Canvas name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') {
                  setCreating(false)
                  setNewName('')
                }
              }}
              className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => {
                setCreating(false)
                setNewName('')
              }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-gray-500">
            No canvases yet. Create one to get started.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {documents.map((doc) => (
              <li key={doc.path}>
                <button
                  onClick={() => onOpen(doc.path)}
                  className="flex w-full items-center justify-between py-3 text-left hover:text-blue-600"
                >
                  <span className="text-sm font-medium text-gray-900 hover:text-blue-600">
                    {doc.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatDate(doc.lastModified)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
