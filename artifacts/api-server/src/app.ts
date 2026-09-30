import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./routes";
import { WebhookHandlers } from "./lib/webhookHandlers";

const app: Express = express();

const allowedOrigins = [
  process.env.CORS_ORIGIN,
  process.env.CORS_ORIGIN_2,
  process.env.CORS_ORIGIN_3,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      return void res.status(400).json({ error: "Missing stripe-signature header" });
    }
    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("Stripe webhook error:", error.message);
      res.status(400).json({ error: "Webhook processing error" });
    }
  }
);

// Zeffy signs each delivery with an HMAC over the raw body bytes, so this path must
// be captured as a Buffer before the global express.json() below consumes the stream.
// Re-serializing parsed JSON would reorder keys and break signature verification.
app.use("/api/zeffy/webhook", express.raw({ type: "*/*" }));

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/api", router);

export default app;