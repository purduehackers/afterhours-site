# The Afterhours Foundation

A minimal, static website for The Afterhours Foundation, Inc., an Indiana nonprofit backing hacker
activity and helping curious people make cool things with software, hardware, and art.

Live at [the.afterhours.foundation](https://the.afterhours.foundation/).

```sh
bun install
bun run dev
```

Open <http://127.0.0.1:3000>. Edit the files in `public`.

The foundation homepage is `public/index.html`. It reuses the original personal site's plain HTML
and inline CSS, with no build step or client-side JavaScript.

The incorporation date, business ID, president, and EIN were checked against the Indiana business
record and IRS EIN notice dated September 21, 2026. Contact information and the educational purpose
come from the INBiz incorporation review. The source PDFs are not published with the site.

The board listing was supplied by the foundation. The page does not assert federal tax-exempt
status or tax deductibility. Add those details and public annual filings when they are confirmed
and available.

Describe the foundation's own mission and activities. Claims about operating or funding another
organization's programs, formal affiliations, or university endorsement must reflect documented
arrangements. The current copy does not establish such arrangements or determine which university
rules apply to an activity.

Deploy to the `afterhours-foundation` project on the `purdue-hackers` Vercel team:

```sh
vercel link --project afterhours-foundation --scope purdue-hackers
vercel --prod --scope purdue-hackers
```

Vercel serves `public` directly. The primary domain is `the.afterhours.foundation`;
`afterhours.foundation` and `www.afterhours.foundation` permanently redirect to it through the
project's domain settings.
