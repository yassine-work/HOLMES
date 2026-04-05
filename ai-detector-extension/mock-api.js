const http = require("http");

const PORT = 8787;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 5 * 1024 * 1024) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function scoreFromPayload(payload) {
  const source = String(payload.url || payload.fileName || "").toLowerCase();
  if (source.includes("midjourney") || source.includes("stable-diffusion") || source.includes("sora")) {
    return 86;
  }
  if (source.includes("camera") || source.includes("raw") || source.includes("dsc_")) {
    return 24;
  }
  return 58;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/detect") {
    try {
      const payload = await readJsonBody(req);
      const confidence = scoreFromPayload(payload);
      const isAI = confidence >= 50;

      const response = {
        is_ai: isAI,
        confidence,
        label: isAI ? "AI Generated" : "Human / Authentic",
        model_used: "mock-detector-v1",
        explainability: [
          {
            factor: "Synthetic texture periodicity",
            impact: isAI ? 0.41 : -0.18,
            description: "Repeating patterns and micro-texture regularity were evaluated.",
          },
          {
            factor: "Edge coherence",
            impact: isAI ? 0.22 : -0.11,
            description: "Object edge transitions were measured for natural camera artifacts.",
          },
        ],
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Mock API running at http://127.0.0.1:${PORT}/api/detect`);
});
