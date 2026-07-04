import React, { useMemo, useState } from "react";
import axios from "axios";

const API_URL = "/generate-prompt";

const MODE_OPTIONS = ["stealth", "cinematic", "studio"];
const QUALITY_OPTIONS = ["720p", "1080p", "4k"];
const IMAGE_COUNT_OPTIONS = ["auto", "1", "2", "4", "8"];
const MODEL_OPTIONS = [
  "auto",
  "grok",
  "dalle",
  "midjourney",
  "stable-diffusion",
  "leonardo",
  "flux",
  "gemini",
  "claude",
  "openai",
  "default",
];

export default function PromptGenerator() {
  const [form, setForm] = useState({
    prompt: "",
    ai_model: "grok",
    video_quality: "1080p",
    duration: 10,
    image_count: "auto",
    mode: "stealth",
  });
  const [optimizedPrompt, setOptimizedPrompt] = useState("");
  const [routingInfo, setRoutingInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = useMemo(() => form.prompt.trim().length > 0, [form.prompt]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");

    try {
      const { data } = await axios.post(API_URL, {
        ...form,
        duration: Number(form.duration),
      });
      setOptimizedPrompt(data.optimized_prompt || "");
      setRoutingInfo({
        routedModel: data.routed_model || "",
        contentType: data.content_type || "",
      });
    } catch (err) {
      setError("Unable to generate prompt. Please check backend availability.");
      setRoutingInfo(null);
    } finally {
      setLoading(false);
    }
  };

  const copyPrompt = async () => {
    if (!optimizedPrompt) return;
    try {
      await navigator.clipboard.writeText(optimizedPrompt);
    } catch (_) {
      setError("Clipboard access was denied by the browser.");
    }
  };

  return (
    <section style={styles.card}>
      <h2 style={styles.title}>Prompt Generator</h2>
      <form onSubmit={onSubmit} style={styles.form}>
        <label style={styles.label}>
          Base Prompt
          <textarea
            value={form.prompt}
            onChange={(e) => updateField("prompt", e.target.value)}
            placeholder="Describe your artistic scene"
            rows={4}
            style={styles.textarea}
          />
        </label>

        <div style={styles.grid}>
          <SelectField
            label="AI Model"
            value={form.ai_model}
            onChange={(value) => updateField("ai_model", value)}
            options={MODEL_OPTIONS}
          />
          <SelectField
            label="Video Quality"
            value={form.video_quality}
            onChange={(value) => updateField("video_quality", value)}
            options={QUALITY_OPTIONS}
          />
          <NumberField
            label="Duration (seconds)"
            value={form.duration}
            onChange={(value) => updateField("duration", value)}
            min={1}
            max={120}
          />
          <SelectField
            label="Image Count"
            value={form.image_count}
            onChange={(value) => updateField("image_count", value)}
            options={IMAGE_COUNT_OPTIONS}
          />
          <SelectField
            label="Mode"
            value={form.mode}
            onChange={(value) => updateField("mode", value)}
            options={MODE_OPTIONS}
          />
        </div>

        <button type="submit" style={styles.button} disabled={!canSubmit || loading}>
          {loading ? "Generating..." : "Generate Prompt"}
        </button>
      </form>

      {error ? <p style={styles.error}>{error}</p> : null}

      {optimizedPrompt ? (
        <div style={styles.outputWrap}>
          <h3 style={styles.subtitle}>Optimized Prompt</h3>
          {routingInfo?.routedModel ? (
            <p style={styles.meta}>
              Routed to <strong>{routingInfo.routedModel}</strong>
              {routingInfo.contentType ? ` for ${routingInfo.contentType}` : ""}
            </p>
          ) : null}
          <textarea readOnly value={optimizedPrompt} rows={6} style={styles.output} />
          <button type="button" style={styles.copyButton} onClick={copyPrompt}>
            Copy to Clipboard
          </button>
        </div>
      ) : null}
    </section>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label style={styles.label}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={styles.select}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({ label, value, onChange, min, max }) {
  return (
    <label style={styles.label}>
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        style={styles.input}
      />
    </label>
  );
}

const styles = {
  card: {
    maxWidth: 760,
    margin: "0 auto",
    padding: 16,
    borderRadius: 12,
    background: "#111827",
    color: "#f9fafb",
  },
  title: {
    marginTop: 0,
    marginBottom: 12,
  },
  subtitle: {
    marginBottom: 8,
  },
  meta: {
    margin: "0 0 4px",
    color: "#cbd5e1",
    fontSize: 14,
  },
  form: {
    display: "grid",
    gap: 12,
  },
  grid: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  },
  label: {
    display: "grid",
    gap: 6,
    fontSize: 14,
  },
  input: {
    border: "1px solid #374151",
    borderRadius: 8,
    padding: "8px 10px",
    background: "#1f2937",
    color: "#f9fafb",
  },
  select: {
    border: "1px solid #374151",
    borderRadius: 8,
    padding: "8px 10px",
    background: "#1f2937",
    color: "#f9fafb",
  },
  textarea: {
    border: "1px solid #374151",
    borderRadius: 8,
    padding: "8px 10px",
    background: "#1f2937",
    color: "#f9fafb",
    resize: "vertical",
  },
  button: {
    border: "none",
    borderRadius: 8,
    background: "#2563eb",
    color: "#fff",
    fontWeight: 600,
    padding: "10px 14px",
    cursor: "pointer",
  },
  outputWrap: {
    marginTop: 14,
    display: "grid",
    gap: 8,
  },
  output: {
    border: "1px solid #374151",
    borderRadius: 8,
    padding: "8px 10px",
    background: "#0f172a",
    color: "#e5e7eb",
    resize: "vertical",
  },
  copyButton: {
    justifySelf: "start",
    border: "1px solid #374151",
    borderRadius: 8,
    background: "#1f2937",
    color: "#f9fafb",
    padding: "8px 12px",
    cursor: "pointer",
  },
  error: {
    color: "#fca5a5",
  },
};
