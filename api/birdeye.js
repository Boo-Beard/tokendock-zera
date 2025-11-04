// /api/birdeye-explore.js
export default async function handler(req, res) {
  const allowedOrigins = [
    "https://tokendock.io",
    "https://www.tokendock.io",
    "http://localhost:3000",
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Chain, X-API-KEY");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    let { path, ...params } = req.query;
    let chain = req.query.chain || req.headers["x-chain"] || "solana";

    // ✅ Normalize & extract path if embedded in URL
    if (!path && req.url.includes("/api/birdeye/")) {
      const after = req.url.split("/api/birdeye")[1];
      if (after) {
        const [realPath, qs] = after.split("?");
        path = realPath;
        if (qs) {
          const extra = Object.fromEntries(new URLSearchParams(qs));
          params = { ...params, ...extra };
        }
      }
    }

    if (!path) {
      return res.status(400).json({ success: false, message: "Missing 'path' parameter" });
    }

    // ✅ Ensure path is clean and always starts with one slash
    path = path.trim();
    if (!path.startsWith("/")) path = "/" + path;
    path = path.replace(/\/{2,}/g, "/"); // remove accidental double slashes

    const supportedChains = [
      "solana", "ethereum", "bsc", "base", "polygon",
      "avalanche", "optimism", "arbitrum", "sui", "tron",
      "aptos", "ton"
    ];
    if (!supportedChains.includes(chain.toLowerCase())) {
      chain = "solana";
    }

    // ✅ Build full Birdeye URL cleanly
    const u = new URL(`https://public-api.birdeye.so${path}`);
for (const [k, v] of Object.entries(params)) {
  if (v == null || v === "") continue;
  if (k.toLowerCase() === "chain") continue; // ✅ don't append chain to query
  u.searchParams.set(k, v);
}


    const url = u.toString();
    console.log("🔍 Birdeye request:", url, "| Chain:", chain);

    const headers = {
      Accept: "application/json",
      "X-API-KEY": process.env.BIRDEYE_KEY,
    };
    if (chain && chain !== "all") headers["X-Chain"] = chain;

    const birdeyeRes = await fetch(url, { headers });
    const text = await birdeyeRes.text();

    if (!birdeyeRes.ok) {
      console.error("❌ Birdeye Error:", birdeyeRes.status, text.slice(0, 200));
      return res.status(birdeyeRes.status).json({
        success: false,
        message: `Birdeye ${birdeyeRes.status}`,
        error: text.slice(0, 200),
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("⚠️ JSON parse error:", err.message);
      return res.status(502).json({
        success: false,
        message: "Failed to parse Birdeye response",
        raw: text.slice(0, 500),
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("💥 Proxy failed:", err);
    return res.status(500).json({
      success: false,
      message: "Birdeye Explorer Proxy failed",
      error: err.message,
    });
  }
}
