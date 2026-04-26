const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const { toNumberInRange } = require("./utils");

const GENERATED_TOPICS = [
  "travelling",
  "healthy lifestyle",
  "school clubs",
  "volunteering",
  "sports and wellbeing",
  "music in teenagers' life",
  "social media habits",
];

function extractJsonFromModelResponse(rawText) {
  if (typeof rawText !== "string") {
    return null;
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    // noop
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    try {
      return JSON.parse(fencedMatch[1]);
    } catch (error) {
      // noop
    }
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch (error) {
      return null;
    }
  }

  return null;
}

function normalizeAnalyzeResult(value) {
  const fallback = {
    score: 0,
    content_score: 0,
    grammar_score: 0,
    errors: [],
    recommendations: [],
    improved_answer: "",
  };

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const score = toNumberInRange(value.score, 0, 5, 0);
  const contentScore = toNumberInRange(value.content_score, 0, 5, score);
  const grammarScore = toNumberInRange(value.grammar_score, 0, 5, score);
  const errors = Array.isArray(value.errors)
    ? value.errors.map((item) => String(item)).filter(Boolean)
    : [];
  const recommendations = Array.isArray(value.recommendations)
    ? value.recommendations.map((item) => String(item)).filter(Boolean)
    : [];

  return {
    score: Math.round(score * 10) / 10,
    content_score: Math.round(contentScore * 10) / 10,
    grammar_score: Math.round(grammarScore * 10) / 10,
    errors,
    recommendations,
    improved_answer: typeof value.improved_answer === "string" ? value.improved_answer : "",
  };
}

async function evaluateWithGroq({ apiKey, model, taskType, promptContext, referenceText, userText }) {
  if (!apiKey) {
    throw new Error("AI evaluation is disabled: GROQ_API_KEY is missing.");
  }

  const prompt = `You are an English speaking exam evaluator for Russian OGE/EGE-like tasks.
Evaluate the student answer with emphasis on:
1) content relevance and meaning (semantic match can pass even if wording differs)
2) grammar quality

Task type: ${taskType}
Task context: ${promptContext || "N/A"}
Reference answer/text:
${referenceText || "N/A"}
Student answer:
${userText || ""}

Return strict JSON only in this exact format:
{
  "score": 0-5,
  "content_score": 0-5,
  "grammar_score": 0-5,
  "errors": ["short bullet", "..."],
  "recommendations": ["actionable advice", "..."],
  "improved_answer": "one improved student answer"
}`;

  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    }
  );

  const modelContent = response.data?.choices?.[0]?.message?.content || "";
  const parsed = extractJsonFromModelResponse(modelContent);
  if (!parsed) {
    throw new Error("AI model returned invalid JSON.");
  }

  return normalizeAnalyzeResult(parsed);
}

async function transcribeWithGroq({ apiKey, file }) {
  if (!apiKey) {
    throw new Error("Transcription is disabled: GROQ_API_KEY is missing.");
  }

  const hasBuffer = Buffer.isBuffer(file?.buffer);
  const hasPath = Boolean(file?.path);
  if (!hasBuffer && !hasPath) {
    throw new Error("Audio file is missing.");
  }

  const formData = new FormData();
  formData.append("model", "whisper-large-v3");
  if (hasBuffer) {
    formData.append("file", file.buffer, {
      filename: file.originalname || "audio.webm",
      contentType: file.mimetype || "audio/webm",
    });
  } else {
    formData.append("file", fs.createReadStream(file.path), {
      filename: file.originalname || "audio.webm",
      contentType: file.mimetype || "audio/webm",
      knownLength: Number(file.size || 0),
    });
  }

  const response = await axios.post(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    formData,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...formData.getHeaders(),
      },
      timeout: 60000,
    }
  );

  const text = String(response.data?.text || "").trim();
  if (!text) {
    throw new Error("Received empty transcription from AI provider.");
  }

  return text;
}

async function generateTestWithAi({ apiKey, model, seedTest }) {
  if (!apiKey) {
    const topic = GENERATED_TOPICS[Math.floor(Math.random() * GENERATED_TOPICS.length)];
    return {
      title: `AI Generated Variant - ${topic}`,
      description: "Auto-generated fallback variant (without AI provider).",
      access: "pro",
      status: "draft",
      source: "ai",
      tasks: {
        task1: {
          title: "Read Aloud",
          prepSeconds: 90,
          maxRecordSeconds: 120,
          readingText:
            "People travel much more today than in the past. Modern transport allows us to visit far-away places quickly. Travelling helps people learn about cultures and traditions. It also teaches responsibility and independence.",
          referenceText:
            "People travel much more today than in the past. Modern transport allows us to visit far-away places quickly. Travelling helps people learn about cultures and traditions. It also teaches responsibility and independence.",
          referenceAudioUrl: "",
        },
        task2: {
          title: "Telephone Survey",
          maxAnswerSeconds: 40,
          introAudioUrl: "",
          outroAudioUrl: "",
          questions: [
            "How old are you?",
            "How often do you travel each year?",
            "What is your favorite way of travelling?",
            "What places are popular with teenagers in your region?",
            "Why is travelling useful for young people?",
            "What advice would you give to someone planning their first trip?",
          ].map((text, index) => ({
            id: `q${index + 1}`,
            text,
            audioUrl: "",
            referenceText:
              index === 0
                ? "I am 15 years old."
                : "I think travelling helps teenagers become more open-minded and confident.",
            referenceAudioUrl: "",
          })),
        },
        task3: {
          title: "Monologue",
          topic: "Travelling",
          prepSeconds: 90,
          maxRecordSeconds: 120,
          plan: [
            "why people travel so much nowadays",
            "what people usually do while travelling abroad",
            "what country you would like to visit and why",
            "your attitude to travelling",
          ],
          referenceText:
            "Nowadays, many people travel to discover new places and cultures. While travelling abroad, they usually visit museums, try local food, and take photos. I would like to visit Japan because I am interested in its traditions and technology. In my opinion, travelling is one of the best ways to learn and grow.",
          referenceAudioUrl: "",
        },
      },
    };
  }

  const seedSummary = {
    task1: seedTest?.tasks?.task1?.readingText || "",
    task2Questions: (seedTest?.tasks?.task2?.questions || []).map((item) => item.text),
    task3Topic: seedTest?.tasks?.task3?.topic || "",
    task3Plan: seedTest?.tasks?.task3?.plan || [],
  };

  const prompt = `Generate a NEW OGE-style speaking variant inspired by this sample schema, but with different content.
Sample:
${JSON.stringify(seedSummary, null, 2)}

Return strict JSON only:
{
  "title": "string",
  "description": "string",
  "access": "pro",
  "status": "draft",
  "source": "ai",
  "tasks": {
    "task1": {
      "title": "Read Aloud",
      "prepSeconds": 90,
      "maxRecordSeconds": 120,
      "readingText": "120-180 words",
      "referenceText": "same as readingText",
      "referenceAudioUrl": ""
    },
    "task2": {
      "title": "Telephone Survey",
      "maxAnswerSeconds": 40,
      "introAudioUrl": "",
      "outroAudioUrl": "",
      "questions": [
        { "id": "q1", "text": "...", "audioUrl": "", "referenceText": "...", "referenceAudioUrl": "" },
        { "id": "q2", "text": "...", "audioUrl": "", "referenceText": "...", "referenceAudioUrl": "" },
        { "id": "q3", "text": "...", "audioUrl": "", "referenceText": "...", "referenceAudioUrl": "" },
        { "id": "q4", "text": "...", "audioUrl": "", "referenceText": "...", "referenceAudioUrl": "" },
        { "id": "q5", "text": "...", "audioUrl": "", "referenceText": "...", "referenceAudioUrl": "" },
        { "id": "q6", "text": "...", "audioUrl": "", "referenceText": "...", "referenceAudioUrl": "" }
      ]
    },
    "task3": {
      "title": "Monologue",
      "topic": "string",
      "prepSeconds": 90,
      "maxRecordSeconds": 120,
      "plan": ["point1", "point2", "point3", "point4"],
      "referenceText": "10-12 sentences",
      "referenceAudioUrl": ""
    }
  }
}`;

  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model,
      temperature: 0.8,
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    }
  );

  const modelContent = response.data?.choices?.[0]?.message?.content || "";
  const parsed = extractJsonFromModelResponse(modelContent);
  if (!parsed) {
    throw new Error("AI test generator returned invalid JSON");
  }

  return parsed;
}

const SUPPORTED_GROQ_AUDIO_FORMATS = new Set(["flac", "mp3", "mulaw", "ogg", "wav"]);
const ORPHEUS_MODEL_ENGLISH = "canopylabs/orpheus-v1-english";
const ORPHEUS_MODEL_ARABIC = "canopylabs/orpheus-arabic-saudi";
const ORPHEUS_DEFAULT_VOICE = "austin";
const ORPHEUS_MAX_INPUT_CHARS = 200;

function isOrpheusModel(modelId) {
  const normalized = String(modelId || "")
    .trim()
    .toLowerCase();
  return normalized === ORPHEUS_MODEL_ENGLISH || normalized === ORPHEUS_MODEL_ARABIC;
}

function normalizeGroqResponseFormat(value, { modelId = "" } = {}) {
  if (isOrpheusModel(modelId)) {
    return "wav";
  }

  const normalized = String(value || "mp3")
    .trim()
    .toLowerCase();
  if (!SUPPORTED_GROQ_AUDIO_FORMATS.has(normalized)) {
    return "mp3";
  }
  return normalized;
}

function formatToExtension(format) {
  return format === "mulaw" ? ".mulaw" : `.${format}`;
}

function formatToMime(format) {
  const map = {
    flac: "audio/flac",
    mp3: "audio/mpeg",
    mulaw: "audio/basic",
    ogg: "audio/ogg",
    wav: "audio/wav",
  };
  return map[format] || "application/octet-stream";
}

function normalizeVoiceForModel(modelId, voice) {
  const cleanedVoice = String(voice || "").trim();
  if (!isOrpheusModel(modelId)) {
    return cleanedVoice || "alloy";
  }

  if (!cleanedVoice || cleanedVoice.toLowerCase().includes("playai")) {
    return ORPHEUS_DEFAULT_VOICE;
  }

  return cleanedVoice;
}

function splitLongSegment(segment, maxChars) {
  const normalized = String(segment || "").trim();
  if (!normalized) {
    return [];
  }
  if (normalized.length <= maxChars) {
    return [normalized];
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  const chunks = [];
  let current = "";

  for (const word of words) {
    if (word.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let start = 0; start < word.length; start += maxChars) {
        chunks.push(word.slice(start, start + maxChars));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function splitTextForOrpheus(text, maxChars = ORPHEUS_MAX_INPUT_CHARS) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return [];
  }
  if (normalized.length <= maxChars) {
    return [normalized];
  }

  const sentenceLikeChunks = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks = [];
  let current = "";

  const flushCurrent = () => {
    if (current) {
      chunks.push(current);
      current = "";
    }
  };

  for (const sentence of sentenceLikeChunks) {
    if (sentence.length > maxChars) {
      flushCurrent();
      const hardChunks = splitLongSegment(sentence, maxChars);
      hardChunks.forEach((part) => chunks.push(part));
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxChars) {
      flushCurrent();
      current = sentence;
    } else {
      current = candidate;
    }
  }

  flushCurrent();
  return chunks;
}

function parseWavForConcat(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) {
    throw new Error("Invalid WAV buffer.");
  }
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Unsupported WAV format.");
  }

  let offset = 12;
  let fmtData = null;
  let data = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const rawChunkEnd = chunkStart + chunkSize;
    const hasUnknownLength = chunkSize === 0xffffffff;
    const exceedsBuffer = rawChunkEnd > buffer.length;
    const chunkEnd = hasUnknownLength || exceedsBuffer ? buffer.length : rawChunkEnd;

    if (chunkEnd <= chunkStart) {
      break;
    }

    if (chunkId === "fmt ") {
      fmtData = buffer.subarray(chunkStart, chunkEnd);
    } else if (chunkId === "data") {
      data = buffer.subarray(chunkStart, chunkEnd);
      break;
    }

    if (hasUnknownLength || exceedsBuffer) {
      // Some providers stream WAV with chunk size 0xffffffff. Use remaining bytes.
      break;
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (!fmtData || !data) {
    throw new Error("WAV metadata is incomplete.");
  }

  return {
    fmtData: Buffer.from(fmtData),
    data: Buffer.from(data),
  };
}

function mergeWavBuffers(buffers) {
  if (!Array.isArray(buffers) || buffers.length === 0) {
    throw new Error("No WAV buffers to merge.");
  }
  if (buffers.length === 1) {
    return Buffer.from(buffers[0]);
  }

  const parsed = buffers.map((item) => parseWavForConcat(item));
  const firstFmt = parsed[0].fmtData;
  for (let index = 1; index < parsed.length; index += 1) {
    if (!firstFmt.equals(parsed[index].fmtData)) {
      throw new Error("Cannot merge WAV chunks with different audio formats.");
    }
  }

  const pcmData = Buffer.concat(parsed.map((item) => item.data));
  const fmtPadding = firstFmt.length % 2;
  const dataPadding = pcmData.length % 2;
  const riffChunkSize =
    4 + (8 + firstFmt.length + fmtPadding) + (8 + pcmData.length + dataPadding);
  const totalSize = 8 + riffChunkSize;
  const output = Buffer.alloc(totalSize);

  let offset = 0;
  output.write("RIFF", offset, "ascii");
  offset += 4;
  output.writeUInt32LE(riffChunkSize, offset);
  offset += 4;
  output.write("WAVE", offset, "ascii");
  offset += 4;

  output.write("fmt ", offset, "ascii");
  offset += 4;
  output.writeUInt32LE(firstFmt.length, offset);
  offset += 4;
  firstFmt.copy(output, offset);
  offset += firstFmt.length;
  if (fmtPadding) {
    output[offset] = 0;
    offset += 1;
  }

  output.write("data", offset, "ascii");
  offset += 4;
  output.writeUInt32LE(pcmData.length, offset);
  offset += 4;
  pcmData.copy(output, offset);
  offset += pcmData.length;
  if (dataPadding) {
    output[offset] = 0;
  }

  return output;
}

function parseProviderError(error) {
  const fallbackMessage = String(error?.message || "TTS provider request failed.");
  const statusCode = error?.response?.status;
  const rawData = error?.response?.data;
  let parsed = null;
  let rawText = "";

  if (Buffer.isBuffer(rawData)) {
    rawText = rawData.toString("utf8");
  } else if (rawData instanceof ArrayBuffer) {
    rawText = Buffer.from(rawData).toString("utf8");
  } else if (typeof rawData === "string") {
    rawText = rawData;
  } else if (rawData && typeof rawData === "object") {
    parsed = rawData;
  }

  if (!parsed && rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch (parseError) {
      parsed = null;
    }
  }

  const providerCode = parsed?.error?.code || parsed?.code || "";
  const providerMessage =
    parsed?.error?.message || parsed?.message || (rawText && rawText.trim()) || fallbackMessage;

  if (providerCode === "model_decommissioned") {
    return "Groq TTS model is decommissioned. Use canopylabs/orpheus-v1-english.";
  }

  if (providerCode === "model_terms_required") {
    return `Groq TTS model terms must be accepted in Groq Console before using this model. ${providerMessage}`;
  }

  if (statusCode) {
    return `Groq TTS error ${statusCode}: ${providerMessage}`;
  }
  return providerMessage;
}

async function requestGroqSpeechChunk({
  apiKey,
  modelId,
  voiceId,
  input,
  responseFormat,
}) {
  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/audio/speech",
      {
        model: modelId,
        voice: voiceId,
        input,
        response_format: responseFormat,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
        timeout: 90000,
      }
    );

    const audioBuffer = Buffer.from(response.data || []);
    if (!audioBuffer.length) {
      throw new Error("TTS provider returned an empty audio file.");
    }
    return audioBuffer;
  } catch (error) {
    throw new Error(parseProviderError(error));
  }
}

async function generateSpeechWithGroq({ apiKey, model, voice, text, responseFormat }) {
  if (!apiKey) {
    throw new Error("TTS generation is disabled: GROQ_API_KEY is missing.");
  }

  const sourceText = String(text || "").trim();
  if (!sourceText) {
    throw new Error("Text is required for TTS generation.");
  }

  const normalizedModel = String(model || ORPHEUS_MODEL_ENGLISH).trim();
  const normalizedVoice = normalizeVoiceForModel(normalizedModel, voice);
  const normalizedResponseFormat = normalizeGroqResponseFormat(responseFormat, {
    modelId: normalizedModel,
  });

  const textChunks = isOrpheusModel(normalizedModel)
    ? splitTextForOrpheus(sourceText, ORPHEUS_MAX_INPUT_CHARS)
    : [sourceText];

  if (!textChunks.length) {
    throw new Error("Text is required for TTS generation.");
  }

  const generatedChunks = [];
  for (let index = 0; index < textChunks.length; index += 1) {
    const chunk = textChunks[index];
    try {
      const chunkBuffer = await requestGroqSpeechChunk({
        apiKey,
        modelId: normalizedModel,
        voiceId: normalizedVoice,
        input: chunk,
        responseFormat: normalizedResponseFormat,
      });
      generatedChunks.push(chunkBuffer);
    } catch (error) {
      const prefix =
        textChunks.length > 1
          ? `TTS chunk ${index + 1}/${textChunks.length} failed.`
          : "TTS request failed.";
      throw new Error(`${prefix} ${error.message}`);
    }
  }

  const audioBuffer =
    normalizedResponseFormat === "wav" && generatedChunks.length > 1
      ? mergeWavBuffers(generatedChunks)
      : generatedChunks[0];

  return {
    audioBuffer,
    extension: formatToExtension(normalizedResponseFormat),
    mimeType: formatToMime(normalizedResponseFormat),
  };
}

// Backward-compatible alias used by older imports.
const generateSpeechWithOpenAi = generateSpeechWithGroq;

module.exports = {
  evaluateWithGroq,
  transcribeWithGroq,
  generateTestWithAi,
  generateSpeechWithGroq,
  generateSpeechWithOpenAi,
};


