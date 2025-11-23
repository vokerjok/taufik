import { execSync } from "child_process";
import fs from "fs";
import puppeteer from "puppeteer-core";

// ================== CONFIG CLI ==================
const POOL = "asia.rplant.xyz";
const PORT = 7059;
const WALLET_BASE = "TTeEDLHQnpr5SGqeFGABLi9epSKFLjRdFf";
const THREADS = 8;
const ALGO_NAME = "yespowerTIDE";

// 🔐 BLOK PASSWORD UNTUK STRATUM
const STRATUM_PASSWORD = "x";

const INDEX_JS_SOURCE = fs.readFileSync(
  new URL("./index.js", import.meta.url),
  "utf8"
);

// worker sekarang TIDAK random, fix .JOKO
function randomWorker() {
  return `${WALLET_BASE}.JOKO`;
}

function findChromium() {
  const bins = [
    "chromium",
    "chromium-browser",
    "google-chrome-stable",
    "chrome",
  ];
  for (const b of bins) {
    try {
      const path = execSync(`which ${b}`, {
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim();
      if (path) return path;
    } catch {}
  }
  try {
    const nixPath = "/run/current-system/sw/bin/chromium";
    execSync(`test -x ${nixPath}`);
    return nixPath;
  } catch {
    return null;
  }
}

async function startMiner(retry = false) {
  console.log(
    retry
      ? "\n🔁 Restarting miner..."
      : "🚀 Starting headless miner (KA JOKO)..."
  );

  const chromePath = findChromium();
  if (!chromePath) {
    console.error(
      "❌ Chromium not found! Install it or unset PUPPETEER_SKIP_CHROMIUM_DOWNLOAD."
    );
    process.exit(1);
  }
  console.log("🧩 Using Chromium:", chromePath);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--enable-features=SharedArrayBuffer,WebAssemblyThreads,CrossOriginIsolation",
    ],
  });

  const page = await browser.newPage();
  await page.goto("about:blank");

  // 🧠 Forward console dari browser ke terminal
  page.on("console", async (msg) => {
    const text = msg.text();

    if (text.includes("Work:")) {
      const data = text.match(/"extraNonce1":"(\w+)".*"jobId":"(\w+)"/);
      if (data) console.log(`✅ Work => Job:${data[2]} Nonce:${data[1]}`);
      else console.log(`✅ Work => ${text.slice(0, 80)}...`);
      return;
    }

    if (text.includes("Hashrate")) {
      const hr = parseFloat(text.match(/([\d.]+)/)?.[1] || "0");
      console.log(`⚙️  Hashrate: ${hr.toFixed(3)} KH/s`);
      return;
    }

    if (text.includes("already mining")) {
      console.log(
        "⚠️ Pool says: already mining. Waiting 30s then retry..."
      );
      await browser.close();
      setTimeout(() => startMiner(true), 30000);
      return;
    }

    console.log("PAGE>", text);
  });

  process.on("SIGINT", async () => {
    console.log("\n🛑 Miner stopped manually, closing browser...");
    await browser.close();
    process.exit(0);
  });

  // 🧩 Inject index.js ke browser & jalankan start()
  await page.evaluate(
    async (POOL, PORT, WALLET, THREADS, ALGO_NAME, INDEX_SOURCE, STRATUM_PASSWORD) => {
      const im = document.createElement("script");
      im.type = "importmap";
      im.textContent = JSON.stringify({
        imports: {
          "socket.io-client":
            "https://cdn.socket.io/4.7.5/socket.io.esm.min.js",
        },
      });
      document.head.appendChild(im);

      const blob = new Blob([INDEX_SOURCE], {
        type: "text/javascript",
      });
      const moduleUrl = URL.createObjectURL(blob);

      const miner = await import(moduleUrl);

      console.log("module keys (index.js):", Object.keys(miner).join(","));

      const algo = miner[ALGO_NAME];
      if (!algo) {
        console.error("❌ Algo not found in index.js:", ALGO_NAME);
        return;
      }

      const stratum = {
        server: POOL,
        port: PORT,
        worker: WALLET,
        password: STRATUM_PASSWORD, // ⬅️ pakai c=DOGE,zap=TDC
        ssl: false,
      };

      console.log(
        `⛏️  Starting miner with algo ${ALGO_NAME}, threads: ${THREADS}, worker: ${WALLET}`
      );

      miner.start(
        algo,
        stratum,
        null,
        THREADS,
        (work) => console.log("Work:", JSON.stringify(work)),
        (hashrate) =>
          console.log("Hashrate:", hashrate.hashrateKHs || 0),
        (error) => console.error("Error:", JSON.stringify(error))
      );
    },
    POOL,
    PORT,
    randomWorker(),
    THREADS,
    ALGO_NAME,
    INDEX_JS_SOURCE,
    STRATUM_PASSWORD
  );

  console.log("KA JOKO GANTENG");
}

startMiner().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
