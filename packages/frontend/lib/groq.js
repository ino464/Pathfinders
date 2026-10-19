/* global process */
import "server-only";

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

// Sends one chat completion request in JSON object mode and
// returns the text of the first choice. The server-only import
// keeps GROQ_API_KEY out of any client bundle.
export async function requestCompletion(
  messages,
  { model, timeoutMs }
) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" }
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    throw new Error(`Groq answered ${response.status}`);
  }

  const body = await response.json();
  return body.choices?.[0]?.message?.content ?? "";
}
