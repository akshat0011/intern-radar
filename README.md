# Intern Radar

**Be early.**

### 🔗 [www.internradar.info](https://www.internradar.info)

A free job board for engineering internships in India, built for students who keep finding the
good postings two days late.

---

## The problem

A popular internship collects hundreds of applicants within a day of going up. By the time a
posting reaches you through a WhatsApp group or a weekly newsletter, you're applicant number four
hundred — and at that point your resume matters less than your timing.

Checking LinkedIn ten times a day works. Nobody actually does it.

## What Intern Radar does

It checks for you, every 30 minutes, and puts what it finds on one page — newest first, with the
details you actually decide on already pulled out of the posting.

No account. No signup. No email. Open it and read it.

## What's on the site

**Fresh listings, clearly labelled.** Every card shows how old the posting is. Under an hour is
marked *just posted*; under a day is *new*. That label is the whole point — it tells you whether
applying is still worth it.

**Only the roles worth your time.** Around 900 companies are watched, from global tech and
semiconductors through Indian fintech, SaaS, banking and deeptech. Listings are split into two
tabs — **Engineering** and **Everything else** — so a software internship never gets buried under
sales and telecalling roles.

**The facts up front, not buried in a wall of text.** Each listing shows the stipend, how long the
internship runs, the location and whether it's remote, hybrid or on-site, which degree it's open
to, and the key skills asked for — read out of the description, so you don't have to open five
tabs to compare two roles.

**Filter it down.** Narrow by company, location or workplace type. Show only paid roles, or only
Easy Apply ones. Sort by newest, by stipend, or by company.

**Apply at the source.** Every listing links straight to the original posting. Intern Radar finds
and summarises — you apply on the real thing.

**A page per listing.** Every internship has its own shareable page, so you can send someone one
job instead of "go look at the site".

Works on a phone, has a dark mode, and remembers which one you picked.

## Tailor your resume to a listing

Pick any internship, upload your resume as a PDF, and get a version rewritten to target that
specific role — then download it as a PDF or copy the text.

Two rules it won't break:

- **It never invents anything.** It reorders, rephrases and re-emphasises what's already in your
  resume. Every skill in the output is checked against your original, and anything you didn't
  claim is stripped out. A tool that quietly adds Kubernetes because the job mentions Kubernetes
  is handing you a false document to send to a real employer.
- **It never stores your resume.** Your PDF is read inside your own browser — the file itself
  never leaves your device. The text is held for the length of one request, then discarded.
  Nothing is written down, nothing is logged.

The rewriting runs on Google's Gemini free tier, which permits Google to use submitted data to
improve their models. You're told that on the upload screen before you choose a file, because you
should get to decide it with the facts in front of you.

## Right now

| | |
|---|---|
| Live internships | ~340 |
| Engineering roles | ~70 |
| Companies represented | ~135 |
| Locations | ~76 |
| Refreshed | every 30 minutes |
| Listings expire after | 14 days |

Postings drop off after two weeks. An internship older than that is usually closed or already has
hundreds of applicants, and showing it would work against the one thing this site is for.

## Built with

Node.js, SQLite, Playwright and the Gemini API, on a static site hosted by Vercel — with a single
production dependency.

## A note on the data

Listings are collected from public LinkedIn job postings, which is against LinkedIn's terms of
service. The collector runs on a fixed schedule at low volume and stops immediately if it's asked
to, and Intern Radar shows only its own summary of each role and links back to the original — it
deliberately does not republish the employer's job description, which is their copyrighted text.

## Licence

MIT — see [LICENSE](LICENSE).

Built by [Akshat Saroha](https://github.com/akshat0011).
