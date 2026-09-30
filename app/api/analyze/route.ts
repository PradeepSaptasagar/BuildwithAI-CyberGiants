import { NextResponse } from "next/server";

export const maxDuration = 60;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const SYS = `You are PhytoAtlas, a plant investigation assistant.
Rules: never give a definitive diagnosis from a photo; use "possible", "consistent with", "worth investigating".
Keep OBSERVATION (what is visible) separate from INFERENCE (what might explain it).
Never invent measurements. Never recommend specific pesticides, fertilisers or doses; advise consulting a local agricultural extension expert.
Traditional or medicinal use is not evidence of clinical efficacy; say so. State uncertainty honestly and lower confidence for blurry or partial images.
Return ONLY valid JSON matching the requested shape.`;

const SHAPES: Record<string, string> = {
  scan: `{"common":"","scientific":"","confidence":0.0,"alternatives":[{"name":"","confidence":0.0}],"organ":"","limitations":"",
"taxonomy":{"kingdom":"","order":"","family":"","genus":"","species":""},"related":[{"name":"","why":""}],
"health":{"status":"Healthy|Monitor|Possible Stress|Significant Change","observations":[""],"inferences":[""],"possible_causes":[""],"next_photos":[""]},
"context":"reasoning that combines the photo, location, season, setting and history","knowledge":{"general":"","traditional":"","agricultural":"","safety":""},
"claims":[{"text":"","type":"observation|inference|general|traditional|agricultural","support":"photo|model knowledge|Pl@ntNet"}]}`,
  compare: `{"changed":[""],"stable":[""],"significant":false,"severity":"none|mild|moderate|high","reasoning":"","next_photos":[""]}`,
  ask: `{"answer":"","next_photos":[""]}`,
};

const IMG = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
function img(u: unknown) {
  const m = typeof u === "string" ? IMG.exec(u) : null;
  if (!m || m[2].length > 3_000_000) throw new Error("Invalid or oversized image. Use a JPG, PNG or WebP photo.");
  return { inlineData: { mimeType: m[1], data: m[2] } };
}

async function plantnet(dataUrl: string) {
  const k = process.env.PLANTNET_API_KEY;
  if (!k) return null;
  try {
    const [h, d] = dataUrl.split(",");
    const fd = new FormData();
    fd.append("images", new Blob([Buffer.from(d, "base64")], { type: /:(.*?);/.exec(h)![1] }), "leaf.jpg");
    fd.append("organs", "auto");
    const r = await fetch(`https://my-api.plantnet.org/v2/identify/all?api-key=${k}&nb-results=3`, { method: "POST", body: fd });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.results ?? []).slice(0, 3).map((x: any) => ({ name: x.species?.scientificNameWithoutAuthor, score: x.score }));
  } catch { return null; }
}

async function gemini(key: string, parts: unknown[]) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYS }],
      },
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    }),
  });

  if (!r.ok) {
    const errorText = await r.text();

    console.error("Gemini API error:", {
      status: r.status,
      statusText: r.statusText,
      model: MODEL,
      body: errorText,
    });

    throw new Error(
      `Gemini API ${r.status}: ${errorText.slice(0, 1000)}`
    );
  }

  const j = await r.json();

  const t =
    j.candidates?.[0]?.content?.parts
      ?.map((p: any) => p.text ?? "")
      .join("") ?? "";

  if (!t) {
    throw new Error(
      `Gemini returned no text: ${JSON.stringify(j).slice(0, 1000)}`
    );
  }

  return JSON.parse(
    t.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim()
  );
}

function mock(mode: string) {
  if (mode === "compare")
    return { changed: ["(Sample) Spotting looks more widespread than in the earlier photo."], stable: ["(Sample) Overall leaf shape unchanged."], significant: true, severity: "moderate", reasoning: "Sample data: add GEMINI_API_KEY for a real comparison.", next_photos: ["Underside of the affected leaf"] };
  if (mode === "ask")
    return { answer: "Sample reply: add GEMINI_API_KEY to get real answers grounded in your observations.", next_photos: ["Underside of a leaf", "A healthy neighbouring leaf"] };
  return {
    common: "Neem (sample)", scientific: "Azadirachta indica", confidence: 0.9, alternatives: [{ name: "Melia azedarach", confidence: 0.06 }], organ: "leaf",
    limitations: "Sample data, not a real identification.",
    taxonomy: { kingdom: "Plantae", order: "Sapindales", family: "Meliaceae", genus: "Azadirachta", species: "Azadirachta indica" },
    related: [{ name: "Melia azedarach", why: "Same family, similar compound leaves" }, { name: "Swietenia mahagoni", why: "Same family, timber tree" }],
    health: { status: "Possible Stress", observations: ["Sample: edge browning", "Sample: small spots"], inferences: ["Consistent with water or nutrient stress, or fungal pressure"], possible_causes: ["Water stress", "Nutrient imbalance", "Fungal disease"], next_photos: ["Underside of leaf", "Nearby leaves", "Stem"] },
    context: "Sample data. Add GEMINI_API_KEY to reason over your real photo and context.",
    knowledge: { general: "Sample text.", traditional: "Sample text. Traditional use is not clinical proof.", agricultural: "Sample text.", safety: "Consult an expert before any use." },
    claims: [{ text: "Sample claim", type: "general", support: "model knowledge" }],
  };
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const mode = String(b.mode);
    if (!SHAPES[mode]) throw new Error("Unknown mode.");
    if (mode !== "ask") img(b.image);
    const key = process.env.GEMINI_API_KEY;
    if (!key) return NextResponse.json({ data: mock(mode), mock: true });

    const c = b.context ?? {};
    const ctx = `Today: ${new Date().toISOString().slice(0, 10)}. Location: ${c.location || "unknown"}. Setting: ${c.setting || "unknown"}. Notes: ${String(c.notes || "none").slice(0, 500)}.`;
    const parts: unknown[] = [];
    let ids: unknown = null;

    if (mode === "scan") {
      ids = await plantnet(b.image);
      parts.push(img(b.image), { text: `Identify this plant and assess its visible health.\n${ctx}\n` +
        (ids ? `Pl@ntNet candidates (specialist model, treat as strong evidence): ${JSON.stringify(ids)}\n` : "") +
        (b.history ? `Previous scan of this same plant: ${JSON.stringify(b.history)}\n` : "") + `Return JSON: ${SHAPES.scan}` });
    } else if (mode === "compare") {
      parts.push({ text: "Image A is the EARLIER photo." }, img(b.image), { text: "Image B is the LATER photo." }, img(b.image2),
        { text: `Compare the two. Use qualitative language only.\n${ctx}\nReturn JSON: ${SHAPES.compare}` });
    } else {
      parts.push({ text: `Plant: ${JSON.stringify(b.plant)}\nObservation history: ${JSON.stringify(b.history)}\nUser question: ${String(b.question).slice(0, 600)}\n` +
        `Answer as an investigation assistant: separate what was observed from what is inferred, then say what to photograph next.\nReturn JSON: ${SHAPES.ask}` });
    }
    const data = await gemini(key, parts);
    if (ids) data.plantnet = ids;
    return NextResponse.json({ data, mock: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    console.error("[analyze]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
