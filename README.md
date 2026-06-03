# Wazuh + MCP — base SOC réutilisable

Stack Docker **prête à l'emploi** : un Wazuh **vierge** (4.14.5) + un **assistant IA**
branché au SIEM via **MCP** (Model Context Protocol), intégré **directement dans le
dashboard Wazuh** (un seul point d'entrée, un seul login).

Base générique : déployable sur n'importe quelle infra. Le contenu de détection
spécifique à un projet (règles/décodeurs) se livre à part (voir « Ajouter des règles »).

## Architecture

| Service | Rôle | Image |
|---|---|---|
| `wazuh.indexer` | stockage/recherche (OpenSearch) | `wazuh/wazuh-indexer:4.14.5` |
| `wazuh.manager` | SIEM/analyse + API | `wazuh/wazuh-manager:4.14.5` (stock) |
| `wazuh.dashboard` | UI Wazuh | custom (bake `opensearch_dashboards.yml`, requis en 4.14.5) |
| `mcp-server` | expose Wazuh en 14 outils MCP (read-only) | build depuis `gbrigandi/mcp-server-wazuh` |
| `mcp-chat` | backend chat (boucle outils MCP + LLM, historique SQLite) | custom (FastAPI) |
| `proxy` | nginx : 1 origine https + injecte le bouton MCP dans le dashboard | `nginx:alpine` |

Tout communique par **nom de service** sur le réseau Docker (l'indexeur n'est jamais
exposé). Le MCP est **lecture seule** (aucune action d'écriture sur Wazuh).

```
                    Navigateur → https://localhost:8445
                                   │
                          ┌────────▼─────────┐
                          │   proxy (nginx)  │  injecte le bouton 🤖 MCP
                          └───┬──────────┬───┘
                       /      │          │   /mcp-chat
              ┌───────────────▼──┐    ┌──▼─────────────┐
              │ wazuh.dashboard  │    │    mcp-chat    │  FastAPI + SQLite
              └────────┬─────────┘    └───────┬────────┘  (historique, agents, skills)
                       │ API 55000            │ MCP (HTTP/SSE)
              ┌────────▼─────────┐    ┌───────▼────────┐
              │  wazuh.manager   │◄───┤   mcp-server   │  14 outils read-only
              └────────┬─────────┘    └────────────────┘
                       │ 9200 (TLS)
              ┌────────▼─────────┐
              │  wazuh.indexer   │
              └──────────────────┘
```

## Prérequis
- Docker + Docker Compose (Docker Desktop OK).
- ~4 Go de RAM libres. L'indexeur OpenSearch peut exiger `vm.max_map_count=262144`
  (Docker Desktop/WSL2 : en général déjà bon ; sinon `wsl -d docker-desktop sysctl -w vm.max_map_count=262144`).
- **Auto-suffisant** : tout est buildé par Compose (le serveur MCP est compilé depuis
  les sources `gbrigandi/mcp-server-wazuh`). Rien à préparer à la main.

## Démarrage
```bash
git clone <ce-repo> && cd soc-stack
docker compose up -d --build
```
Le **premier build** prend quelques minutes (compilation Rust du serveur MCP). Les
suivants sont en cache. Premier boot ~1–2 min (l'indexeur initialise son index de
sécurité automatiquement).

## Accès
- **Point d'entrée unique : https://localhost:8445**
- Cert auto-signé → **accepter une fois** (l'accepter aussi sur le dashboard interne n'est plus nécessaire, tout passe par 8445).
- Login Wazuh (lab) : **`admin` / `admin`**.
- Bouton **🤖 MCP** en bas à droite → ouvre l'assistant.
- **Clé LLM en BYOK** : Options (roue crantée) → colle ta clé Anthropic ou OpenAI-compatible.
  La clé reste dans ton navigateur (jamais stockée côté serveur).

## L'assistant (features)
- **Historique persistant** (SQLite, volume `mcp-chat-data`), multi-conversations.
- **Multi-providers** par conversation : Anthropic (Claude) ou OpenAI-compatible
  (OpenAI, **Ollama local**, OpenRouter, Mistral… via URL de base).
- **Agents** (personas : prompt + sous-ensemble d'outils + modèle) → appel `@agent`.
- **Skills** (templates de prompt) → insertion `/skill`.
- **Prompt master** global, rendu markdown, responsive.

## Ajouter des règles de détection custom
Le manager est vierge. Pour injecter des règles/décodeurs, monte-les dans le manager
via le mécanisme officiel `/wazuh-config-mount` (copié dans `/var/ossec/` au boot) :
```yaml
  wazuh.manager:
    volumes:
      - ./mes-regles:/wazuh-config-mount/etc/rules        # *.xml
      - ./mes-decodeurs:/wazuh-config-mount/etc/decoders  # *.xml
```
Pour lire un fichier de logs applicatif, ajouter un `<localfile>` à l'ossec.conf
(via un `opensearch`/cont-init ou un ossec.conf monté). Après modif :
`docker volume rm soc-stack_wazuh-manager-etc && docker compose up -d`.

## Sécurité (⚠ lab)
Identifiants de démonstration à **changer pour un usage réel** : indexeur `admin/admin`,
API `wazuh-wui/wazuh-wui`, dashboard `admin/admin`, certs auto-signés. MCP volontairement
**read-only** (adapté aux contextes sensibles type données de santé / RGPD).

## Arborescence
```
soc-stack/
├─ docker-compose.yml
├─ dashboard/         # image dashboard custom (opensearch_dashboards.yml)
├─ mcp-chat/          # backend chat FastAPI (MCP + LLM + SQLite)
└─ proxy/             # nginx : portail + injection du bouton MCP (fab.js)
```
