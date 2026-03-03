/**
 * PROFILE_HTML_PROMPT
 *
 * Used by /api/publish-profile.
 * Instructs the model to convert the identity document into a self-contained
 * HTML profile page suitable for hosting on S3 / CloudFront.
 */
export const PROFILE_HTML_PROMPT = `You are generating a beautiful, self-contained HTML profile page for a person based on their AI identity document.

OUTPUT REQUIREMENTS:
- Output only valid HTML. Nothing else. No explanation, no preamble, no markdown fences.
- The entire page must be self-contained in one HTML file — all CSS in a <style> block in the <head>.
- No external dependencies. No CDN links. No Google Fonts URLs. Use system fonts only.
- The page must look professional and personal — not like a CV template, not like a generic portfolio.

DESIGN REQUIREMENTS:
- Font stack: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif for body; Georgia, 'Times New Roman', serif for headings
- Color palette: off-white background (#f5f2eb), near-black text (#1a1a1a), one warm accent color (#b45a3c) used sparingly
- Max content width: 720px, centered
- Generous padding and whitespace — this should feel unhurried
- Mobile responsive — single column on small screens
- Add <meta name="robots" content="noindex, nofollow"> to prevent search indexing

PAGE STRUCTURE (in this order):
1. Hero — person's name (large serif), their one-line professional identity drawn from WHO YOU ARE section
2. About — 2-3 sentences from WHO YOU ARE, written in first person (convert from second person)
3. How I Think — bullet points from HOW YOU THINK, converted to first person
4. How I Communicate — key points from HOW YOU COMMUNICATE, converted to first person
5. My Modes — the modes from YOUR MODES section, each as a titled block
6. In My Own Words — the PHRASES TO USE list, styled as pull quotes or a visual list
7. Background — the BACKGROUND FACTS as a clean compact list
8. Footer — "Built with Eigenself" + generated date

TONE CONVERSION:
The identity document is written in second person ("You are...", "You think...").
Convert everything to first person ("I am...", "I think...") for the web profile.
This is the person's page about themselves, not instructions to an AI.

IMPORTANT:
- Do not include the SELF-IMPROVEMENT PROTOCOL section — that is for the AI document only
- Do not include the CHANGELOG section
- Do not include PHRASES TO NEVER USE — that is internal
- The page should feel like a real person's professional home on the web
- Output only the HTML. Start with <!DOCTYPE html>.`;
