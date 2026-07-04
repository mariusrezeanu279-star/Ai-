import React, { useMemo, useState, useEffect } from "react";
import axios from "axios";

const API_URL = "/generate-prompt";
const MODELS_URL = "/supported-models";
const MODEL_CONFIG_URL = "/model-config";

const MODE_OPTIONS = ["stealth", "bold"];
const VIDEO_QUALITY_OPTIONS = ["420p", "720p"];
const DURATION_OPTIONS = [5, 10, 15];
const IMAGE_COUNT_OPTIONS = ["auto", "4", "8", "12"];
const DEFAULT_MODEL_OPTIONS = [
  { value: "grok", label: "Grok (Video + Image)" },
  { value: "midjourney", label: "MidJourney" },
  { value: "stable_diffusion", label: "Stable Diffusion" },
  { value: "dalle", label: "DALL-E" },
  { value: "leonardo", label: "Leonardo AI" },
  { value: "playground", label: "Playground AI" },
];

export default function PromptGenerator() {
  const [form, setForm] = useState({
    prompt: "",
    ai_model: "grok",
    video_quality: "720p",
    duration: 10,
    image_count: "auto",
    mode: "stealth",
  });
  const [optimizedPrompt, setOptimizedPrompt] = useState("");
  const [successTips, setSuccessTips] = useState([]);
  const [isVideoPrompt, setIsVideoPrompt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [modelConfig, setModelConfig] = useState(null);
  const [savedPrompts, setSavedPrompts] = useState([]);

  const canSubmit = useMemo(() => form.prompt.trim().length > 0, [form.prompt]);

  const isGrokVideo = useMemo(() => {
    const videoKeywords = ["video", "clip", "animation", "movement", "motion", "cinematic"];
    return (
      form.ai_model === "grok" &&
      videoKeywords.some((keyword) => form.prompt.toLowerCase().includes(keyword))
    );
  }, [form.prompt, form.ai_model]);

  useEffect(() => {
    const fetchModelConfig = async () => {
      try {
        const { data } = await axios.get(`${MODEL_CONFIG_URL}/${form.ai_model}`);
        setModelConfig(data);
      } catch (err) {
        console.error("Failed to fetch model config:", err);
      }
    };
    fetchModelConfig();
  }, [form.ai_model]);

  useEffect(() => {
    const saved = localStorage.getItem("saved_prompts_alchemist");
    if (saved) {
      try {
        setSavedPrompts(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved prompts:", e);
      }
    }
  }, []);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setCopied(false);
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
      setSuccessTips(data.success_tips || []);
      setIsVideoPrompt(data.is_video_prompt || false);
    } catch (err) {
      const message = err.response?.data?.detail || "Unable to generate prompt. Please check backend availability.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const copyPrompt = async () => {
    if (!optimizedPrompt) return;
    try {
      await navigator.clipboard.writeText(optimizedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      setError("Clipboard access was denied by the browser.");
    }
  };

  const savePrompt = () => {
    if (!optimizedPrompt) return;
    const newSaved = {
      id: Date.now(),
      original: form.prompt,
      optimized: optimizedPrompt,
      model: form.ai_model,
      mode: form.mode,
      video_quality: form.video_quality,
      duration: form.duration,
      image_count: form.image_count,
      timestamp: new Date().toISOString(),
    };
    const updated = [newSaved, ...savedPrompts].slice(0, 20);
    setSavedPrompts(updated);
    localStorage.setItem("saved_prompts_alchemist", JSON.stringify(updated));
  };

  const loadPrompt = (saved) => {
    setForm({
      prompt: saved.original,
      ai_model: saved.model,
      video_quality: saved.video_quality || "720p",
      duration: saved.duration || 10,
      image_count: saved.image_count || "auto",
      mode: saved.mode || "stealth",
    });
    setOptimizedPrompt(saved.optimized);
  };

  const deleteSavedPrompt = (id) => {
    const updated = savedPrompts.filter((p) => p.id !== id);
    setSavedPrompts(updated);
    localStorage.setItem("saved_prompts_alchemist", JSON.stringify(updated));
  };

  const exportPrompts = () => {
    if (savedPrompts.length === 0) return;
    const data = JSON.stringify(savedPrompts, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prompts-alchemist-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section style={styles.card}>
      <h2 style={styles.title}>Prompt Alchemist</h2>
      <p style={styles.subtitle}>
        Transform prompts with auto-bypass logic for multiple AI models
      </p>
      <form onSubmit={onSubmit} style={styles.form}>
        <label style={styles.label}>
          Base Prompt
          <textarea
            value={form.prompt}
            onChange={(e) => updateField("prompt", e.target.value)}
            placeholder="Describe your artistic scene..."
            rows={4}
            style={styles.textarea}
          />
        </label>

        <div style={styles.grid}>
          <SelectField
            label="AI Model"
            value={form.ai_model}
            onChange={(value) => updateField("ai_model", value)}
            options={DEFAULT_MODEL_OPTIONS.map((m) => ({ value: m.value, label: m.label }))}
          />
          <SelectField
            label="Mode"
            value={form.mode}
            onChange={(value) => updateField("mode", value)}
            options={MODE_OPTIONS.map((o) => ({ value: o, label: o.charAt(0).toUpperCase() + o.slice(1) }))}
          />
          <SelectField
            label="Image Count"
            value={form.image_count}
            onChange={(value) => updateField("image_count", value)}
            options={IMAGE_COUNT_OPTIONS.map((o) => ({ value: o, label: o === "auto" ? "Auto" : o }))}
          />
        </div>

        {form.ai_model === "grok" && isGrokVideo && (
          <div style={styles.videoSection}>
            <div style={styles.sectionLabel}>Video Options (Grok)</div>
            <div style={styles.grid}>
              <SelectField
                label="Video Quality"
                value={form.video_quality}
                onChange={(value) => updateField("video_quality", value)}
                options={VIDEO_QUALITY_OPTIONS.map((o) => ({ value: o, label: o }))}
              />
              <SelectField
                label="Duration (seconds)"
                value={String(form.duration)}
                onChange={(value) => updateField("duration", Number(value))}
                options={DURATION_OPTIONS.map((o) => ({ value: String(o), label: `${o}s` }))}
              />
            </div>
          </div>
        )}

        {form.mode === "bold" && (
          <div style={styles.warningBox}>
            Bold mode may have lower success rate with stricter content filters.
          </div>
        )}

        <button type="submit" style={styles.button} disabled={!canSubmit || loading}>
          {loading ? "Generating..." : "Generate Prompt"}
        </button>
      </form>

      {error ? <p style={styles.error}>{error}</p> : null}

      {optimizedPrompt ? (
        <div style={styles.outputWrap}>
          <div style={styles.outputHeader}>
            <h3 style={styles.outputTitle}>Optimized Prompt</h3>
            {isVideoPrompt && <span style={styles.videoBadge}>Video</span>}
          </div>
          <textarea readOnly value={optimizedPrompt} rows={6} style={styles.output} />
          <div style={styles.actionsRow}>
            <button type="button" style={styles.copyButton} onClick={copyPrompt}>
              {copied ? "Copied!" : "Copy to Clipboard"}
            </button>
            <button type="button" style={styles.saveButton} onClick={savePrompt}>
              Save Prompt
            </button>
          </div>

          {successTips.length > 0 && (
            <div style={styles.tipsBox}>
              <h4 style={styles.tipsTitle}>Success Tips</h4>
              <ul style={styles.tipsList}>
                {successTips.map((tip, i) => (
                  <li key={i} style={styles.tipItem}>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}

      {savedPrompts.length > 0 && (
        <div style={styles.savedSection}>
          <div style={styles.savedHeader}>
            <h4 style={styles.savedTitle}>Saved Prompts ({savedPrompts.length})</h4>
            <button type="button" style={styles.exportButton} onClick={exportPrompts}>
              Export JSON
            </button>
          </div>
          <div style={styles.savedList}>
            {savedPrompts.map((saved) => (
              <div key={saved.id} style={styles.savedItem}>
                <div style={styles.savedContent}>
                  <div style={styles.savedOriginal}>{saved.original.slice(0, 50)}...</div>
                  <div style={styles.savedMeta}>
                    {saved.model} | {saved.mode} | {saved.timestamp ? new Date(saved.timestamp).toLocaleDateString() : ""}
                  </div>
                </div>
                <div style={styles.savedActions}>
                  <button
                    type="button"
                    style={styles.savedButton}
                    onClick={() => loadPrompt(saved)}
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    style={styles.savedButtonDelete}
                    onClick={() => deleteSavedPrompt(saved.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={styles.modelInfo}>
        <h4 style={styles.infoTitle}>Supported Models</h4>
        <div style={styles.modelList}>
          {DEFAULT_MODEL_OPTIONS.map((m) => (
            <span key={m.value} style={styles.modelChip}>
              {m.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label style={styles.label}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={styles.select}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const styles = {
  card: {
    maxWidth: 800,
    margin: "0 auto",
    padding: 24,
    borderRadius: 16,
    background: "#111827",
    color: "#f9fafb",
    boxShadow: "0 4px 24px rgba(0, 0, 0, 0.3)",
  },
  title: {
    marginTop: 0,
    marginBottom: 4,
    fontSize: 24,
    fontWeight: 700,
  },
  subtitle: {
    marginTop: 0,
    marginBottom: 16,
    fontSize: 14,
    color: "#9ca3af",
  },
  form: {
    display: "grid",
    gap: 16,
  },
  grid: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  },
  label: {
    display: "grid",
    gap: 6,
    fontSize: 13,
    fontWeight: 500,
    color: "#d1d5db",
  },
  input: {
    border: "1px solid #374151",
    borderRadius: 8,
    padding: "10px 12px",
    background: "#1f2937",
    color: "#f9fafb",
    fontSize: 14,
  },
  select: {
    border: "1px solid #374151",
    borderRadius: 8,
    padding: "10px 12px",
    background: "#1f2937",
    color: "#f9fafb",
    fontSize: 14,
    cursor: "pointer",
  },
  textarea: {
    border: "1px solid #374151",
    borderRadius: 8,
    padding: "12px 14px",
    background: "#1f2937",
    color: "#f9fafb",
    resize: "vertical",
    fontSize: 14,
    lineHeight: 1.5,
  },
  button: {
    border: "none",
    borderRadius: 8,
    background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
    color: "#fff",
    fontWeight: 600,
    padding: "12px 20px",
    cursor: "pointer",
    fontSize: 15,
    transition: "transform 0.15s, box-shadow 0.15s",
  },
  videoSection: {
    background: "#1a1a2e",
    border: "1px solid #374151",
    borderRadius: 12,
    padding: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "#9ca3af",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  warningBox: {
    background: "#2d1f1f",
    border: "1px solid #7f1d1d",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    color: "#fca5a5",
  },
  outputWrap: {
    marginTop: 20,
    display: "grid",
    gap: 12,
  },
  outputHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  outputTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
  },
  videoBadge: {
    background: "#7c3aed",
    color: "#fff",
    fontSize: 11,
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: 20,
  },
  output: {
    border: "1px solid #374151",
    borderRadius: 8,
    padding: "14px 16px",
    background: "#0f172a",
    color: "#e5e7eb",
    resize: "vertical",
    fontSize: 13,
    lineHeight: 1.6,
  },
  actionsRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  copyButton: {
    justifySelf: "start",
    border: "1px solid #374151",
    borderRadius: 8,
    background: "#1f2937",
    color: "#f9fafb",
    padding: "10px 16px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
  },
  saveButton: {
    justifySelf: "start",
    border: "1px solid #7c3aed",
    borderRadius: 8,
    background: "transparent",
    color: "#c4b5fd",
    padding: "10px 16px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
  },
  tipsBox: {
    background: "#1a1a2e",
    border: "1px solid #374151",
    borderRadius: 12,
    padding: 16,
  },
  tipsTitle: {
    marginTop: 0,
    marginBottom: 12,
    fontSize: 14,
    fontWeight: 600,
    color: "#c4b5fd",
  },
  tipsList: {
    margin: 0,
    paddingLeft: 20,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  tipItem: {
    fontSize: 13,
    color: "#d1d5db",
    lineHeight: 1.5,
  },
  error: {
    color: "#fca5a5",
    background: "#2d1f1f",
    border: "1px solid #7f1d1d",
    borderRadius: 8,
    padding: "10px 14px",
    marginTop: 8,
  },
  savedSection: {
    marginTop: 24,
    borderTop: "1px solid #374151",
    paddingTop: 20,
  },
  savedHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  savedTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: "#c4b5fd",
  },
  exportButton: {
    background: "transparent",
    border: "1px solid #374151",
    color: "#9ca3af",
    padding: "6px 12px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
  },
  savedList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxHeight: 200,
    overflowY: "auto",
  },
  savedItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#1f2937",
    border: "1px solid #374151",
    borderRadius: 8,
    padding: "10px 12px",
  },
  savedContent: {
    flex: 1,
    minWidth: 0,
  },
  savedOriginal: {
    fontSize: 13,
    color: "#f9fafb",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  savedMeta: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 4,
  },
  savedActions: {
    display: "flex",
    gap: 6,
  },
  savedButton: {
    background: "transparent",
    border: "1px solid #374151",
    color: "#9ca3af",
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
  },
  savedButtonDelete: {
    background: "transparent",
    border: "1px solid #7f1d1d",
    color: "#fca5a5",
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    cursor: "pointer",
  },
  modelInfo: {
    marginTop: 24,
    padding: 16,
    background: "#1a1a2e",
    borderRadius: 12,
    border: "1px solid #374151",
  },
  infoTitle: {
    margin: "0 0 12px 0",
    fontSize: 13,
    fontWeight: 600,
    color: "#9ca3af",
  },
  modelList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  modelChip: {
    background: "#374151",
    color: "#d1d5db",
    fontSize: 12,
    padding: "4px 12px",
    borderRadius: 20,
  },
};
