const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8787";

function normaliseTargetWords(topic, targetWords) {
  if (Array.isArray(targetWords) && targetWords.length > 0) {
    return targetWords;
  }

  if (typeof targetWords === "string" && targetWords.trim()) {
    return [targetWords.trim()];
  }

  if (typeof topic === "string" && topic.trim()) {
    return [topic.trim()];
  }

  return [];
}

export async function generateStory({
  topic,
  level = "A2",
  targetLang = "en",
  sourceLang = "tr",
  styleHint,
  targetWords,
}) {
  const r = await fetch(`${API_BASE}/api/story`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      level,
      topic,
      targetWords: normaliseTargetWords(topic, targetWords),
      sourceLang,
      targetLang,
      styleHint,
    }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`API error: ${text}`);
  }
  return await r.json(); // { story, words }
}
