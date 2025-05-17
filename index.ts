import express, { Request, Response, NextFunction } from "express";
import { chromium } from "playwright";
import { URL } from "url";

interface ScreenshotRequest {
  url: string;
  sectionHeight?: number;
}

// API key configuration
// In production, this should be stored in environment variables
const API_KEY = process.env.API_KEY || "your-secret-api-key";

// Middleware to check for valid API key
const authenticateApiKey = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Get API key from request headers
  const apiKey = req.headers["x-api-key"] as string;

  // Check if API key is valid
  if (!apiKey || apiKey !== API_KEY) {
    res.status(401).json({ error: "Unauthorized: Invalid or missing API key" });
    return;
  }

  // If API key is valid, proceed to the next middleware
  next();
};

const app = express();

// Parse JSON bodies
app.use(express.json());

// Home route
app.get("/", (_req: Request, res: Response) => {
  res.send("Express on Vercel - Screenshot Service");
});

// Screenshot endpoint with API key authentication
app.post(
  "/screenshot",
  authenticateApiKey, // Apply authentication middleware
  async (req: Request<{}, {}, ScreenshotRequest>, res: Response) => {
    try {
      // Get URL from request body
      const { url } = req.body;

      if (!url) {
        res.status(400).json({ error: "URL is required" });
        return;
      }

      // Validate URL
      try {
        new URL(url);
      } catch (error) {
        res.status(400).json({ error: "Invalid URL format" });
        return;
      }

      console.log(`Taking screenshot of: ${url}`);

      // Get section height from request or use default
      const sectionHeight = req.body.sectionHeight || 800; // Default height of 800px

      // Launch browser
      const browser = await chromium.launch();
      const context = await browser.newContext({
        viewport: { width: 1280, height: sectionHeight }, // Set viewport with fixed height
      });
      const page = await context.newPage();

      // Navigate to the URL
      await page.goto(url, { waitUntil: "networkidle" });

      // Get page height
      const pageHeight = await page.evaluate(() => document.body.scrollHeight);

      // Calculate number of screenshots needed
      const screenshotsNeeded = Math.ceil(pageHeight / sectionHeight);
      console.log(
        `Page height: ${pageHeight}px, taking ${screenshotsNeeded} screenshots`
      );

      // Take multiple screenshots
      const screenshots = [];

      for (let i = 0; i < screenshotsNeeded; i++) {
        // Scroll to position
        await page.evaluate((scrollTo) => {
          window.scrollTo(0, scrollTo);
        }, i * sectionHeight);

        // Wait for any lazy-loaded content to appear
        await page.waitForTimeout(300);

        // Take screenshot
        const screenshot = await page.screenshot({ type: "png" });
        screenshots.push(screenshot);

        console.log(`Took screenshot ${i + 1} of ${screenshotsNeeded}`);
      }

      // Close browser
      await browser.close();

      // Send screenshots as response
      res.setHeader("Content-Type", "application/json");
      res.json({
        url,
        timestamp: Date.now(),
        count: screenshots.length,
        screenshots: screenshots.map((screenshot) =>
          screenshot.toString("base64")
        ),
      });
    } catch (error) {
      console.error("Screenshot error:", error);
      res.status(500).json({ error: "Failed to capture screenshot" });
      return;
    }
  }
);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server ready on port ${PORT}.`));

export default app;
