// backend/index.js
// Tiny Express proxy -> Ollama (http://localhost:11434)
// Node 18+ (global fetch) gerektirir.

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 8787;
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Basit sağlık kontrolü ve Ollama erişimi
app.get("/health", async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`);
    const ok = r.ok ? "ok" : "fail";
    res.json({ status: "up", ollama: ok });
  } catch (e) {
    res.status(200).json({ status: "up", ollama: "unreachable" });
  }
});

// Girilen kelime/konu için kısa hikâye üretir (JSON döner)
app.post("/api/story", async (req, res) => {
  const {
    level = "A2",
    topic,
    targetWords = [],
    sourceLang = "tr",
    targetLang = "en",
    styleHint = "Neutral short slice of life",
  } = req.body || {};

  if (!topic || typeof topic !== "string" || !topic.trim()) {
    return res
      .status(400)
      .json({ error: "bad_request", detail: "`topic` gerekli (string)." });
  }

  const system = `
You are a concise story generator for vocabulary learning.
Return STRICT JSON with keys:
- story: string (120-180 words)
- words: array of { term, pos, cefr, def_${targetLang}, example }
Language of output story must be ${targetLang}.
Respect CEFR level ${level}.
Never add extra commentary or code fences. JSON only.
`.trim();

  const user = `
LEVEL=${level}
TOPIC=${topic}
TARGET_WORDS=${Array.isArray(targetWords) ? targetWords.join(", ") : ""}
SOURCE_LANG=${sourceLang}
TARGET_LANG=${targetLang}
STYLE_HINT=${styleHint}

Constraints:
- One self-contained mini story.
- Prefer simple grammar for ${level}.
- Include at least 8 useful words (populate words[] with def_${targetLang}).
- Output JSON ONLY.
`.trim();

  const body = {
    model: OLLAMA_MODEL,
    stream: false,
    format: "json",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    options: { temperature: 0.7 },
  };

  try {
    const r = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // 30 sn timeout
      signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return res
        .status(502)
        .json({ error: "ollama_bad_response", detail: text });
    }

    const data = await r.json();
    // Ollama chat cevabı -> { message: { content: "<json string or object>" }, ... }
    let payload = data?.message?.content;

    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        return res
          .status(500)
          .json({
            error: "bad_json_from_model",
            sample: payload?.slice?.(0, 200),
          });
      }
    }

    if (!payload || typeof payload.story !== "string") {
      return res.status(500).json({ error: "missing_story", payload });
    }

    // İsteğe bağlı: başlık türetip ekleyebilirdik; frontend zaten styleHint'i gösteriyor.
    return res.json({
      story: payload.story,
      words: Array.isArray(payload.words) ? payload.words : [],
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "proxy_error", detail: String(err?.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(
    `API ready on http://localhost:${PORT}  -> proxy to ${OLLAMA_HOST}, model=${OLLAMA_MODEL}`
  );
});
