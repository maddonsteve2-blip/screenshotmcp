import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { BuiltInAgent } from "@copilotkit/runtime/v2";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import OpenAI from "openai";
import { NextRequest } from "next/server";

const rawBase = process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1";
const baseURL = rawBase.replace(/\/+$/, "");

const minimax = createOpenAICompatible({
  name: "minimax",
  apiKey: process.env.MINIMAX_API_KEY!,
  baseURL,
});

const minimaxModel = minimax("MiniMax-M2.7");

const openai = new OpenAI({
  apiKey: process.env.MINIMAX_API_KEY || "placeholder",
  baseURL,
});

const serviceAdapter = new OpenAIAdapter({ openai, model: "MiniMax-M2.7" });

export const POST = async (req: NextRequest) => {
  console.log("[copilotkit] baseURL:", baseURL);
  console.log("[copilotkit] apiKey present:", !!process.env.MINIMAX_API_KEY);

  const runtime = new CopilotRuntime({
    agents: {
      default: new BuiltInAgent({ model: minimaxModel }),
    },
  });

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
