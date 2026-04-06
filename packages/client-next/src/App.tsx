import { useEffect, useState } from "react";

export function App() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/hello")
      .then((res) => res.json())
      .then((data: { message: string }) => setMessage(data.message))
      .catch(() => setMessage("error fetching message"));
  }, []);

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-2xl font-mono">
        {message === null ? "loading..." : message}
      </p>
    </div>
  );
}
