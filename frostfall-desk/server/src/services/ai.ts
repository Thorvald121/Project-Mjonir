export async function aiSuggest(input: { title: string; description: string }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    // Offline/dev fallback
    return {
      triage: "Categorize: Workstation • Impact: Single user • Priority: MEDIUM",
      steps: [
        "Confirm repro and collect basic facts (OS, device, recent changes).",
        "Check recent incidents for similar symptoms.",
        "Run quick health checks (disk, memory, network).",
        "Apply known fix or escalate with logs."
      ],
      notes: "Set due date based on client SLA; notify requester."
    };
  }
  // Minimal fetch-based call; model string left generic to avoid lock-in
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an IT helpdesk triage assistant. Output concise triage, step-by-step resolution, and notes." },
        { role: "user", content: `Title: ${input.title}\nDescription: ${input.description}` }
      ],
      temperature: 0.2
    })
  });
  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content ?? "No suggestion.";
  return { raw: text };
}
