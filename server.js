// SYNTH backend — proxies image generation requests server-side.
// This exists because OpenAI and Stability AI both block direct
// calls from a browser (CORS). The browser sends the prompt + the
// user's own API key here, this server makes the real request, and
// sends the image straight back. The key is never stored or logged.

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3001;

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/api/generate-image", async (req, res) => {
  const { provider, apiKey, prompt, size } = req.body || {};

  if (!provider || !apiKey || !prompt) {
    return res.status(400).json({ error: "provider, apiKey, and prompt are required." });
  }

  try {
    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt,
          size: size || "1024x1024",
          n: 1,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        return res.status(r.status).json({ error: data.error?.message || "OpenAI request failed." });
      }
      return res.json({ url: data.data?.[0]?.url });
    }

    if (provider === "stability") {
      const [w, h] = (size || "1024x1024").split("x").map(Number);
      const aspect = w === h ? "1:1" : w > h ? "16:9" : "9:16";

      const form = new FormData();
      form.append("prompt", prompt);
      form.append("aspect_ratio", aspect);
      form.append("output_format", "png");

      const r = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "image/*",
        },
        body: form,
      });

      if (!r.ok) {
        const errText = await r.text();
        return res.status(r.status).json({ error: errText.slice(0, 300) });
      }

      const buffer = Buffer.from(await r.arrayBuffer());
      const base64 = buffer.toString("base64");
      return res.json({ url: `data:image/png;base64,${base64}` });
    }

    return res.status(400).json({ error: "Unknown provider. Use 'openai' or 'stability'." });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unexpected server error." });
  }
});

app.listen(PORT, () => {
  console.log(`SYNTH running on port ${PORT}`);
});
