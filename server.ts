import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { JSDOM } from "jsdom"; // Need to install this

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API route for link preview
  app.get("/api/preview", async (req, res) => {
    const url = req.query.url as string;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      const response = await fetch(url);
      const html = await response.text();
      const dom = new JSDOM(html);
      const doc = dom.window.document;

      const title = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || doc.title;
      const description = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
      const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
      const siteName = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || '';
      const domain = new URL(url).hostname;

      res.json({ title, description, image, siteName, domain });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch preview" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
