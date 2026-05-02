import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import OpenAI from "openai";
import { NextRequest } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.MINIMAX_API_KEY!,
  baseURL: process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1",
});

const serviceAdapter = new OpenAIAdapter({
  openai,
  model: "MiniMax-M2.7",
});

export const POST = async (req: NextRequest) => {
  const runtime = new CopilotRuntime();

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};
