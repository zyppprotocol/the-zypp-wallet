/**
 * Simple Mock Relayer Server
 *
 * This is a lightweight relayer you can run locally for testing
 * For production, use: https://github.com/solana-labs/solana-pay/tree/main/point-of-sale
 *
 * Requirements:
 * - Node.js 18+
 * - npm install express dotenv
 *
 * Run: node relayer.js
 * Then set EXPO_PUBLIC_RELAYER_PRIMARY=http://localhost:3001/api
 */

const express = require("express");
const crypto = require("crypto");
const { Connection, Transaction } = require("@solana/web3.js");
require("dotenv").config();

const app = express();
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 3001;
const RPC_URL = process.env.RPC_URL || "https://api.testnet.solana.com";
const RELAY_KEY = process.env.RELAY_KEY || "test-key-" + Date.now();

const connection = new Connection(RPC_URL, "confirmed");

// In-memory transaction store (use database in production)
const transactions = new Map();

// Middleware: Verify HMAC signature
function verifySignature(req, res, next) {
  const signature = req.headers["x-signature"];
  const timestamp = req.headers["x-timestamp"];

  if (!signature || !timestamp) {
    return res.status(401).json({ error: "Missing signature" });
  }

  // Verify timestamp is recent (within 5 minutes)
  const now = Date.now();
  if (Math.abs(now - parseInt(timestamp)) > 5 * 60 * 1000) {
    return res.status(401).json({ error: "Timestamp expired" });
  }

  // Verify HMAC
  const body = JSON.stringify(req.body);
  const message = `${timestamp}.${body}`;
  const expectedSig = crypto
    .createHmac("sha256", RELAY_KEY)
    .update(message)
    .digest("hex");

  if (signature !== expectedSig) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  next();
}

// Apply signature verification to API routes
app.use("/api", verifySignature);

// Endpoint 1: Submit Transaction
app.post("/api/submit", async (req, res) => {
  try {
    const { transaction, intentId } = req.body;

    if (!transaction || !intentId) {
      return res.status(400).json({ error: "Missing transaction or intentId" });
    }

    // Parse transaction
    const txBuffer = Buffer.from(transaction, "base64");
    const tx = Transaction.from(txBuffer);

    // Store for tracking
    const txId = crypto.randomUUID();
    transactions.set(txId, {
      intentId,
      transaction,
      status: "pending",
      submittedAt: new Date(),
      signature: null,
    });

    // Simulate broadcast (in production, actually broadcast here)
    console.log(`[${new Date().toISOString()}] Submitted txn ${txId}`);

    // Immediately try to broadcast (or queue for later)
    setImmediate(() => broadcastTransaction(txId, transaction));

    res.json({
      status: "accepted",
      transactionId: txId,
      message: "Transaction queued for submission",
    });
  } catch (error) {
    console.error("Submit error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint 2: Check Transaction Status
app.get("/api/status/:txId", (req, res) => {
  const { txId } = req.params;
  const tx = transactions.get(txId);

  if (!tx) {
    return res.status(404).json({ error: "Transaction not found" });
  }

  res.json({
    transactionId: txId,
    intentId: tx.intentId,
    status: tx.status,
    signature: tx.signature,
    submittedAt: tx.submittedAt,
  });
});

// Endpoint 3: Get Fees
app.post("/api/fees", async (req, res) => {
  try {
    const recentBlockhash = await connection.getLatestBlockhash();
    const priorityFee = 5000; // microlamports

    res.json({
      priorityFee,
      baseFee: recentBlockhash.feeCalculator?.lamportsPerSignature || 5000,
      estimate: priorityFee + 5000,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint 4: Health Check
app.get("/api/health", async (req, res) => {
  try {
    const health = await connection.getHealth();
    res.json({
      status: "healthy",
      network: RPC_URL,
      rpcHealth: health,
      timestamp: new Date(),
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
    });
  }
});

// Background: Broadcast queued transactions
async function broadcastTransaction(txId, transaction) {
  try {
    const txBuffer = Buffer.from(transaction, "base64");
    const tx = Transaction.from(txBuffer);

    // In production, sign transaction here with relayer key
    // For now, just simulate success
    const signature = crypto.randomBytes(64).toString("hex");

    transactions.set(txId, {
      ...transactions.get(txId),
      status: "confirmed",
      signature,
    });

    console.log(
      `[${new Date().toISOString()}] Confirmed ${txId} → ${signature.slice(0, 20)}...`,
    );
  } catch (error) {
    console.error("Broadcast error:", error);
    const tx = transactions.get(txId);
    transactions.set(txId, {
      ...tx,
      status: "failed",
      error: error.message,
    });
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║         Zypp Wallet Relayer Server                        ║
╚═══════════════════════════════════════════════════════════╝

Server:    http://localhost:${PORT}
RPC:       ${RPC_URL}
Relay Key: ${RELAY_KEY}

Endpoints:
  POST   /api/submit      → Submit transaction
  GET    /api/status/:id  → Check status
  POST   /api/fees        → Get current fees
  GET    /api/health      → Health check

Configuration:
  Set in your app:
  EXPO_PUBLIC_RELAYER_PRIMARY=http://localhost:${PORT}/api
  EXPO_PUBLIC_RELAYER_API_KEY=${RELAY_KEY}

Example cURL:
  curl -X POST http://localhost:${PORT}/api/health
  `);
});
