# Dateien

- [Domänen-Ports (@chrysalyst/core)](domain-ports.md) - Die typ-only Domänengrenze von chrysalyst — CoreDependencies und die vier Ports LlmPort, SessionStorePort, SearchPort und ClockPort, ihre Entwurfsentscheidungen und die Vertragstests, die sie absichern.
- [HTTP-Server (@chrysalyst/server)](http-server.md) - Die HTTP-Oberfläche von chrysalyst — die Hono-App mit der /health-Route, der startServer-Vertrag mit Loopback-Bindung und Port-Freigabe, und der aus AppType abgeleitete typsichere hc-Client.
- [LLM-Adapter (OpenAI-kompatibel / Ollama)](llm-adapter.md) - Die erste echte LlmPort-Implementierung — createOpenAiCompatibleLlm und llmConfigFromEnv über das Vercel AI SDK, mit Modell-Probe per fetch, Fehlerübersetzung an der Grenze, Abbruch-Semantik und den hermetischen und Live-Test-Stufen.
- [Architekturüberblick](overview.md) - Die hexagonale Struktur von chrysalyst — die drei Pakete core/server/web, die Abhängigkeitsrichtung, die Auflösung über TypeScript-Quellcode und die meilensteingetriebene Walking-Skeleton-Baureihenfolge.
