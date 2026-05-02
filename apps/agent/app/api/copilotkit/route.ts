import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import OpenAI from "openai";
import { NextRequest } from "next/server";

const rawBase = process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1";
const baseURL = rawBase.replace(/\/+$/, ""); // strip trailing slashes

const openai = new OpenAI({
  apiKey: process.env.MINIMAX_API_KEY!,
  baseURL,
});

const serviceAdapter = new OpenAIAdapter({
  openai,
  model: "MiniMax-M2.7",
});

export const POST = async (req: NextRequest) => {
  console.log("[copilotkit] baseURL:", baseURL);
  console.log("[copilotkit] apiKey present:", !!process.env.MINIMAX_API_KEY);

  const runtime = new CopilotRuntime();

  try {
    const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
      runtime,
      serviceAdapter,
      endpoint: "/api/copilotkit",
    });

    return handleRequest(req);
  } catch (err) {
    console.error("[copilotkit] error:", err);
    throw err;
  }
};
