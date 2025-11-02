# AI Router 🌿

Frugal AI Router is an intelligent proxy layer that routes AI requests to the most resource-efficient model based on task complexity, cost, and sustainability metrics. It aims to reduce AI costs and carbon footprint without sacrificing performance.

## 🚀 Features

- **Smart Routing**: Routes requests based on complexity (Simple vs. Complex).
- **Cost & Energy Tracking**: Estimates cost and carbon footprint for each request.
- **Configurable Strategies**:
  - `cost-first`: Prioritizes the cheapest model.
  - `green-first`: Prioritizes the most energy-efficient model.
  - `performance-first`: Prioritizes capability.
- **Dashboard**: Visualize savings and routing decisions in real-time.

## 🛠️ Architecture

1.  **Backend (Node.js/Express)**:
    - Analyzes prompt complexity.
    - Routes to `gpt-4`, `gpt-3.5-turbo`, `claude-3-opus`, or `claude-3-haiku`.
    - Logs data to SQLite.
2.  **Frontend (React/Vite)**:
    - Displays real-time stats (Cost & CO2 saved).
    - Config panel for routing strategies.
    - Chat playground.

## 📦 Installation

### Prerequisites
- Node.js (v18+)
- (Optional) Docker

### Option 1: Run Locally

1.  **Clone the repository**
2.  **Backend Setup**:
    ```bash
    cd backend
    npm install
    # Create .env with specific keys if needed, defaults are provided in code for demo
    node src/server.js
    ```
    Backend runs on `http://localhost:3000`.

3.  **Frontend Setup**:
    ```bash
    cd frontend
    npm install
    npm run dev
    ```
    Open `http://localhost:5173` in your browser.

### Option 2: Run with Docker

```bash
docker-compose up --build
```
Access the dashboard at `http://localhost:5173`.

## 🧪 Testing

1.  Open the Dashboard.
2.  Select a strategy (e.g., "Cost First").
3.  Enter a prompt in the Playground.
    - Try a simple prompt: "Hello world" -> Routes to cheap model.
    - Try a complex prompt: "Analyze the geopolitical implications of quantum computing" -> Routes to complex model.
4.  Watch the "Est. Cost Saved" and "Est. Energy Saved" metrics update!

## 📜 License

MIT

<!-- Verified for Release v1.0 [Jan 30 2026] -->

<!-- Verified for Release v1.0 [Jan 30 2026] -->

<!-- Verified for Release v1.0 [Jan 30 2026] -->
