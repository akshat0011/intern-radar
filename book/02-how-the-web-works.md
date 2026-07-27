# Chapter 2 — How the Web Actually Works

> By the end you can trace what happens between typing `internradar.online` and seeing a job on screen, and defend every header this project sets.

**New words:** packet, IP address, DNS, A record, CNAME, TTL, port, TCP, UDP, HTTP, method, header, status code, TLS, certificate, cookie, session, authentication, authorisation, JSON, cache, CDN, load balancer, reverse proxy, domain, deployment, Open Graph.

---

## 2.1 The internet is wires

**The internet** is a very large number of computers joined by copper, fibre-optic glass, and short radio hops at the edges. There is no cloud. Loading this project's site moves signals through your WiFi router, your ISP, undersea cable, and a machine in a data centre.

Data does not travel as one stream. It is chopped into **packets** — chunks of roughly 1,500 bytes, each labelled with where it came from and where it is going. They may take different routes and arrive out of order, and something at the far end reassembles them. Posting a 300-page manuscript as 300 numbered postcards is the same idea: different vans, different days, sorted on arrival. That is why one cut cable does not break the internet.

**An IP address** is a machine's numeric address. IPv4 looks like `76.76.21.21`; there are only 4.3 billion, so IPv6 exists too. Every packet carries a source and a destination IP.

**Trade-off:** packet switching is cheap and resilient but guarantees nothing. Packets get lost and reordered. Reliability is added on top.

---

## 2.2 Names: DNS

**DNS** (Domain Name System) turns a name like `www.internradar.online` into an IP address. It is a distributed database; no machine holds all of it.

For a name your browser has never seen, resolution walks this path:

1. **Browser cache**, then **OS cache** — recent answers, kept briefly.
2. **Your resolver** — your ISP's, or a public one like `1.1.1.1`. **A resolver** does the legwork for you.
3. **A root server** — does not know the answer, but says: for `.online`, ask these.
4. **The TLD server.** **A TLD** (Top-Level Domain) is the last part of a name — `.com`, `.in`, `.online`. It says: for `internradar.online`, ask these nameservers.
5. **The authoritative nameserver** — holds the actual records and answers with the IP.

Every step is cached on the way back, so the first lookup costs 50–200 ms and the next thousand cost nothing. It is like finding a student in a large hostel: the gate guard knows the block, the warden knows the floor, the floor list has the room. Nobody holds the whole map.

**A DNS record** is one entry. The two to know:

- **A record** — a name to an IPv4 address. (`AAAA` is the IPv6 version.)
- **CNAME record** — a name to *another name*, which is then looked up in turn.

A CNAME lets your host change its IPs without you touching DNS. But the **apex** — the bare `internradar.online` with no subdomain — cannot be a CNAME, because the apex must also hold records that a CNAME forbids. So `www.` gets a clean CNAME and the apex needs an A record or a provider extension. That is why the project's canonical address is the `www` one, `web/public/index.html:9`:

```html
<link rel="canonical" href="https://www.internradar.online/">
```

**A canonical link** tells search engines which URL is the real one, so three spellings of the same page are not indexed as three competing copies.

**TTL** (Time To Live) is a number of seconds on every record saying how long caches may reuse it. A TTL of 3600 means some users keep the old answer for an hour after you change it. Before a planned migration you lower the TTL to 60 a day in advance, make the change, then raise it. **Trade-off:** low TTL means fast rollback and more queries; high TTL is cheaper and traps you.

---

## 2.3 Ports, TCP, and UDP

An IP address reaches a machine; a machine runs many programs. **A port** is a number 0–65535 saying which program you want. HTTP uses 80, HTTPS 443. One street address, many room numbers. Browsers assume 443 for `https://`, so you rarely type it. Running this project locally, `web/serve.js` listens on a port on your own machine and you visit `http://localhost:3000` — `localhost` always means "this computer".

**TCP** (Transmission Control Protocol) builds an ordered, reliable stream from unreliable packets: it numbers them, re-sends losses, delivers in order. It costs a **three-way handshake** (SYN, SYN-ACK, ACK) before any data moves. **UDP** (User Datagram Protocol) fires packets and hopes — no handshake, no ordering, no re-sends, lower latency, no guarantees.

DNS uses UDP: one small question, one small answer, ask again if lost. Web pages use TCP: half an HTML file is useless. Video calls use UDP, because a re-sent frame from 400 ms ago is worse than a dropped one. The rule: TCP when incomplete data is useless, UDP when late data is useless. (HTTP/3 runs over UDP via QUIC, rebuilding reliability itself.)

---

## 2.4 HTTP is just text

**HTTP** (HyperText Transfer Protocol) is the language browsers and servers speak, and its secret is that it is plain text you could type by hand. A request is a **method**, a path, headers, and optionally a body. A response is a status line, headers, a blank line, and a body.

```http
GET /data/jobs.json HTTP/1.1
Host: www.internradar.online

HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Cache-Control: public, max-age=0, must-revalidate
ETag: "a3f9c1"

{"generatedAt":"2026-07-26T04:12:00Z","jobs":[ ... ]}
```

*(Made-up example, not from the project — but this is the exact shape of the request the site's JavaScript makes.)*

**A method** is the verb. `GET` fetches and changes nothing — the page, the CSS, `/data/jobs.json`. `POST` sends data and causes something — résumé text to `/api/tailor`. `PUT` replaces, `PATCH` modifies part, `DELETE` removes; this project uses none of them. `HEAD` is GET with headers only. `OPTIONS` asks what is allowed. `GET` is **safe** (no side effects) and **idempotent** (ten times equals once); `POST` is neither, which is why caches and crawlers repeat a `GET` freely and never a `POST`.

**A header** is a `Name: Value` line of metadata. Most of this chapter's project code is headers.

**A status code** is three digits saying how it went. Learn the families:

- **1xx informational.** Rare — `101 Switching Protocols`.
- **2xx worked.** `200 OK`, `201 Created`, `204 No Content`.
- **3xx go elsewhere.** `301` permanent (caches remember it, sometimes forever), `302`/`307` temporary, `304 Not Modified` — "your copy is still good, no body sent". That one matters in 2.7.
- **4xx your fault.** `400` malformed, `401` unauthenticated (misnamed), `403` known but forbidden, `404` not found, `405` wrong method, `429` rate limited.
- **5xx their fault.** `500` crashed, `502` proxy got nonsense, `503` unavailable, `504` gateway timeout.

That last one is live here, `web/vercel.json:21-25`:

```json
"functions": {
  "api/tailor.js": {
    "maxDuration": 60
  }
}
```

The résumé-tailoring function calls Google's Gemini model, which is slow. The default cap is shorter than that call sometimes needs, so it is raised to 60 seconds. Past that, Vercel kills the function and the browser gets a gateway-timeout-class error rather than a hang. **Trade-off:** a longer cap means fewer failures and a user watching a spinner for a full minute.

---

## 2.5 HTTPS, TLS, and what a certificate proves

Plain HTTP is readable by everyone your packets pass — the café WiFi, the ISP, anyone between. **HTTPS** is HTTP inside an encrypted tunnel built by **TLS** (Transport Layer Security; formerly SSL).

After the TCP handshake, the server presents **a certificate**: a file naming its domain and holding its public key, signed by **a Certificate Authority (CA)** your operating system already trusts. The browser checks the signature chain, that the name matches the address bar, and the dates. Then both sides agree a shared key and everything after is encrypted.

**It proves** you are talking to the real holder of `www.internradar.online`, and that nobody in the middle can read or alter the bytes. **It does not prove** the site is honest, safe, or reputable — a phishing site gets a free certificate in thirty seconds. The padlock means private, not trustworthy. Here it is issued and renewed automatically by Vercel when the domain is attached.

Every new **origin** — scheme plus host plus port, e.g. `https://fonts.gstatic.com:443` — costs a fresh DNS lookup, TCP handshake and TLS handshake before one byte arrives. Hence `web/public/index.html:39-40`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

**`preconnect`** says: start that setup work now, in parallel with parsing the page. It buys about one round trip each. **Trade-off:** every third-party font host is another handshake and a dependency you do not control; self-hosting removes both, at the cost of shipping the files yourself.

---

## 2.6 Cookies, sessions, and who you are

HTTP is **stateless** — each request is independent and the server remembers nothing between them. **A cookie** is a small string the server tells the browser to store with `Set-Cookie:`, which the browser returns on every later request in a `Cookie:` header. That is the entire mechanism.

**A session** is the pattern built on it: you log in once, the server generates a random opaque ID, stores "this ID is user 4471" on its side, and puts the ID in a cookie. Later requests carry the ticket, not your identity. At a college fest you show your ID card once and get a wristband; every stall checks the wristband. Lose it and someone walks in as you — which is why session cookies are marked `HttpOnly` (JavaScript cannot read them), `Secure` (HTTPS only) and `SameSite` (not sent from other sites' pages).

**Authentication** is proving who you are. **Authorisation** is what you may do once known. `401` fails the first, `403` the second.

The public site has **no accounts, no login, no session cookie** — everything it shows is public data the watcher already published. That scope decision deletes a whole category of vulnerability. The only real session lives in the other program: the watcher drives a real Brave browser on a persistent profile holding the author's logged-in LinkedIn cookies. That credential sits on one Mac and never reaches the website or the repository. Chapter 8, *The Scraper: Playwright and Defensive Design*, covers how it is protected.

---

## 2.7 JSON, caching, and `Cache-Control`

**JSON** (JavaScript Object Notation) is plain text for structured data: objects in `{}`, arrays in `[]`, strings double-quoted, plus numbers, `true`, `false`, `null`. No comments, no trailing commas, no date type — dates are strings by convention. Every language reads it and a human can debug it in a text editor, which is why the whole inter-program contract here is one JSON file: the watcher writes it, commits it, pushes; the site `GET`s it and renders it.

**A cache** is a stored copy of a response kept so the next request need not reach the origin. There are layers: the browser's disk cache, any proxy between, and the CDN. **`Cache-Control`** is the response header governing them:

- `max-age=N` — reusable for N seconds without asking.
- `no-cache` — may be stored, must be revalidated before reuse. (Badly named.)
- `no-store` — do not write it down at all.
- `public` / `private` — shared caches may store it / only the user's browser may.
- `must-revalidate` — once stale, never serve without checking.
- `immutable` — this URL never changes; do not even revalidate.

**Revalidation** is the cheap conversation. The first response carried an `ETag` (a version fingerprint); the browser re-asks with `If-None-Match: "a3f9c1"`, and if unchanged the server returns `304 Not Modified` — headers, no body, a few hundred bytes instead of the whole file.

The real rule, `web/vercel.json:14-19`:

```json
{
  "source": "/data/jobs.json",
  "headers": [
    { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
  ]
}
```

`source` is a path pattern, so this applies only to the jobs file. `public` lets Vercel's CDN hold a copy in each city. `max-age=0` makes that copy stale the instant it is stored. `must-revalidate` forbids serving it without checking. Effect: every load checks freshness, but when nothing changed it costs a tiny `304` — and the moment the watcher pushes a new run, the next visitor sees it.

**Trade-off, honestly:** this is the most expensive policy that is still correct. Every load costs at least one round trip to the edge. `max-age=300` would make repeat loads instant but could show a list five minutes old — and the product's whole promise is "listed minutes after they go live".

Note what is absent: no rule for `styles.css` or `app.js`. This project has **no build step** — the file you edit is the file that ships — so there is no content-hashed `styles.a3f9c1.css` name to cache forever, and long caching would risk shipping an update half the users never see.

---

## 2.8 CDNs, load balancers, reverse proxies

**A CDN** (Content Delivery Network) is servers in many cities holding copies of your files, serving each user from the nearest. Delhi to a single server in Virginia is a ~250 ms round trip; Delhi to a Mumbai edge node is ~15 ms. Physics, not software. One photocopy shop for the whole university means a long walk and a long queue; a shop per hostel block is fast — provided every shop has the current edition, which is exactly the caching problem above.

**A load balancer** sits in front of several identical servers, spreading requests and skipping any that fail health checks.

**A reverse proxy** sits in front of your application and handles what the application should not: terminating TLS, compressing, adding headers, blocking abuse, routing `/api/*` one way and everything else another. "Reverse" because a forward proxy sits in front of clients; this sits in front of servers.

Vercel is all three at once plus a function runtime, and this project uses that shape directly. `web/public/*` are static files served from the edge with no code running. `web/api/tailor.js` is **a serverless function** — code with no machine of its own, started on demand and thrown away — which the proxy routes `/api/tailor` to. The headers in `vercel.json` are injected by that proxy, not by any code you wrote.

**Trade-off:** global distribution, TLS and scaling for free; in exchange you keep nothing in memory between requests, cold starts add latency, and you are locked into one vendor's config format.

---

## 2.9 The security headers, line by line

`web/vercel.json:4-13`:

```json
{
  "source": "/(.*)",
  "headers": [
    { "key": "X-Content-Type-Options", "value": "nosniff" },
    { "key": "X-Frame-Options", "value": "DENY" },
    { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
    { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), interest-cohort=()" }
  ]
}
```

`"source": "/(.*)"` matches every path, so all four are added to every response.

**`X-Content-Type-Options: nosniff`** — browsers historically guessed a file's type from its bytes, so a file claiming to be an image but containing script could get executed. This says: believe the declared type, never guess.

**`X-Frame-Options: DENY`** — no other site may put this page in an `<iframe>`. That blocks **clickjacking**: a hostile page loads yours invisibly over its own buttons, so a click on "Play" is really a click on yours.

**`Referrer-Policy: strict-origin-when-cross-origin`** — send the full URL only within this site, only the origin to other sites, and nothing when downgrading to HTTP. Without it, paths and query strings leak to everyone you link to.

**`Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`** — empty parentheses mean nobody, not even this page. A job board never needs the camera, so a compromised script cannot even ask. `interest-cohort=()` opts out of an ad-targeting API.

Note what is **absent**: no `Content-Security-Policy`, the header that whitelists which origins may supply scripts and styles. It is the strongest of the lot and the most likely to break a page — and this page pulls fonts and a stylesheet from Google's domains, which makes a strict policy fiddly. That is a real gap, not a decision to hide.

---

## 2.10 Domains, hosting, deployment

**A domain** is a name you rent yearly from a registrar; you hold a registration, not ownership. The registrar records which **nameservers** are authoritative, and those hold the records from 2.2. **Hosting** is where the files live and who answers requests. **Deployment** is getting a new version there.

The chain here fits in one breath. The watcher finishes a run; `src/publish.js` writes the public JSON, commits it, and pushes to `github.com/akshat0011/intern-radar`. GitHub notifies Vercel. Because `web/vercel.json:3` says `"framework": null` and there is no build step, nothing compiles — Vercel copies `web/public/` to the edge, packages `web/api/tailor.js` as a function, applies the headers, and swaps the new version in atomically. A couple of minutes, no human.

**Trade-off:** git as the deploy trigger is simple and gives a complete, revertible history of every dataset the site ever showed. It also means the repository grows forever, a bad JSON write is a permanent commit, and every data refresh is a code deploy.

---

## 2.11 The incident: a share card that quietly died

**Open Graph** is a set of `<meta>` tags in the page head telling WhatsApp, iMessage, Slack and others what to draw when someone pastes your link. **A meta tag** carries information *about* the page rather than content *for* the page.

From `web/public/index.html:16-27`:

```html
<meta property="og:url" content="https://www.internradar.online/">
<meta property="og:title" content="Intern Radar — be early">
<meta property="og:image" content="https://www.internradar.online/og.jpg?v=2">
<meta property="og:image:secure_url" content="https://www.internradar.online/og.jpg?v=2">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
```

The Twitter/X variant sits at `web/public/index.html:29-33`, where `twitter:card` is `summary_large_image` — the value that makes the card render big instead of a thumbnail with text beside it.

**What went wrong.** The project used to live on `interneadar.in`. That domain silently lost its DNS records — the authoritative nameservers stopped answering. Nothing threw an error, nothing logged. The site was fine, because visitors used the new hostname.

But `og:image` still pointed at the old one. So WhatsApp's crawler fetched the page fine, read `og:image`, tried to resolve the dead hostname, got `NXDOMAIN` (the DNS answer meaning "no such name"), and gave up. The card rendered as a bare line of text. To anyone sharing the link the site looked broken, and nothing said why.

The fix needed two separate changes.

**One: an absolute URL on a hostname that resolves.** A relative `og:image="/og.jpg"` is silently dropped by most crawlers — they will not resolve it against the page, unlike `<img src>` in the body. It must be a full `https://host/path`, and that host must answer DNS.

**Two — the part everyone misses: fixing the file changes nothing.** Crawlers cache for weeks and key that cache on **the image URL**. Having recorded "`.../og.jpg` — failed", they keep serving the broken card no matter what the file now contains. The cache key is the URL, not the bytes. So the URL changed: `og.jpg?v=2`. **A query string** is the part after `?`; the server ignores it and serves the same file, but every cache treats it as a resource it has never seen. That is **cache-busting** — the same trick CSS and JS use, except a build step does it automatically with a content hash and here a human bumps a number.

The reasoning is preserved in the source, `web/public/index.html:11-15`:

```html
<!-- Link previews. WhatsApp/iMessage will not render a card without og:image, and it
     must be an absolute https URL — a relative one is silently dropped. The explicit
     width/height are what make WhatsApp and Slack draw the big card instead of the
     thumbnail-beside-text one. Crawlers cache hard and key on the image URL, so bump
     ?v= when og.jpg is regenerated, otherwise the old card sticks around for weeks. -->
```

**Trade-off:** manual cache-busting is one character and works everywhere, but depends on a human remembering. Forget it once and you ship an image nobody sees for a month. A build step automates it; this project chose no build step, and this is one of the bills that choice sends.

---

## Chapter summary

- The internet is physical wires carrying **packets** — small labelled chunks that arrive out of order and are reassembled at the far end.
- **DNS** resolves names through a cached chain — browser, OS, resolver, root, TLD, authoritative nameserver — where an **A record** points at an IP, a **CNAME** at another name, and **TTL** governs how long every cache may keep the answer.
- **TCP** gives ordered, reliable delivery at the cost of a handshake; **UDP** gives speed with no guarantees, which is why DNS and video calls use it.
- **HTTP** is plain text — method, path, headers, body — answered by a status code learned by family: 2xx fine, 3xx elsewhere, 4xx your fault, 5xx theirs.
- **HTTPS/TLS** proves you are talking to the real holder of a hostname and encrypts the bytes; it proves nothing about whether the site is honest.
- `web/vercel.json` adds four security headers to every path and one `Cache-Control` rule — `public, max-age=0, must-revalidate` — chosen so listings are never stale while repeat loads cost only a `304`.
- Vercel is CDN, load balancer and reverse proxy at once; `git push` is the deploy trigger, and with `"framework": null` and no build step, deployment is a file copy.
- The `interneadar.in` incident proves three rules together: `og:image` must be absolute, its hostname must resolve, and repairing a cached share card needs a new URL (`?v=2`), not a new file.

## Key takeaways

Nearly every web problem is a caching problem or a naming problem in disguise, and both fail invisibly — a stale cache and a dead hostname each look like nothing at all. Debug by reading headers first: `Cache-Control`, `Content-Type`, and the status code say more in three lines than an hour of guessing. When something is cached by a system you do not control, the only reliable fix is changing the URL, because the URL is the cache key. And know precisely what the padlock does and does not promise, because the interviewer who asks is listening for whether you overclaim.

## Interview questions

**1. Walk me through everything between typing `internradar.online` and seeing a listing.**

The browser resolves the name through DNS — its own cache, the OS cache, the resolver, then root, `.online`, and the authoritative nameserver — reaching an IP for a Vercel edge node. It opens TCP to port 443 and does a TLS handshake, checking the certificate's signature chain, hostname and dates. Over that tunnel it sends `GET /`, and the CDN returns HTML carrying the four security headers. The browser parses it, starts the preconnect handshakes for the font hosts, fetches the CSS and JS, and runs the script. That script issues a second `GET` for `/data/jobs.json`, which carries `max-age=0, must-revalidate`, so it revalidates and gets either `200` with data or `304` with nothing, then renders rows with plain DOM calls — no framework, no build step.

**2. A record versus CNAME, and why is the canonical URL the `www` one?**

An A record maps a name straight to an IPv4 address; a CNAME maps a name to another name, resolved in turn. The practical difference is control of the IP: with a CNAME the host renumbers freely and your DNS never changes, while an A record pins you to a number that can go stale. DNS forbids a CNAME at the apex, because the apex must carry other record types a CNAME excludes — so `www.` gets a clean CNAME and the apex needs an A record or a provider extension. `web/public/index.html:9` declares `https://www.internradar.online/` canonical so search engines index one URL instead of several near-duplicates.

**3. What is TTL, and how would you use it before a migration?**

TTL is how many seconds every DNS cache may reuse a record before asking again. It is why DNS changes are never instant: a 24-hour TTL can serve the old answer to some users for a full day, and you cannot force those caches to forget. Before a planned change you drop the TTL to about 60 seconds at least one old-TTL period in advance, so caches pick up the short value; then you make the change, watch traffic move within a minute, and raise it once stable. The trade-off is plain — low TTL buys fast rollback and costs queries, high TTL is cheap and traps you.

**4. TCP or UDP here, and why does DNS use the other?**

The site uses TCP, because HTTP needs a complete, ordered byte stream — half an HTML file or a JSON file missing its middle is worthless, so TCP's re-sends and ordering are non-negotiable. The cost is a three-way handshake before any data moves, plus a TLS handshake on top. DNS normally uses UDP because a lookup is one small question and one small answer that fits a single packet, and re-asking is cheaper than establishing a connection. The rule: TCP when incomplete data is useless, UDP when late data is useless. HTTP/3 blurs it by running over UDP with QUIC, rebuilding reliability itself to dodge TCP head-of-line blocking.

**5. What does an HTTPS certificate actually prove?**

Two things. That the server holds the private key matching a certificate a trusted Certificate Authority signed for that exact hostname, and — with the key exchange — that nobody between you and it can read or alter the traffic. It proves nothing about the site's honesty, quality or legality; a phishing page obtains a valid free certificate in under a minute and the padlock shows anyway. So the padlock means private, not trustworthy. Here the certificate is issued and renewed automatically by Vercel when the domain is attached, so there is no manual renewal to forget.

**6. Explain the `Cache-Control` on `/data/jobs.json`, and defend it against `max-age=300`.**

`public, max-age=0, must-revalidate` means shared caches including the CDN may store it, it is stale immediately, and it may never be served without a freshness check. In practice each load makes a conditional request and usually gets `304 Not Modified` — headers only — so it is cheap on bandwidth but always costs one round trip. `max-age=300` would make repeat loads instant from disk, but a visitor could see listings five minutes old. The product's entire claim is that jobs appear minutes after they go live, so paying a round trip for guaranteed freshness is the right side of that trade. I would revisit it if the file grew large enough that revalidation itself became slow.

**7. Go through the four security headers and say what each stops.**

`X-Content-Type-Options: nosniff` stops the browser guessing a response's type from its bytes, which historically let a file claiming to be an image be executed as script. `X-Frame-Options: DENY` forbids any site embedding the page in an iframe, blocking clickjacking — an invisible overlay turning a click on a hostile page into a click on yours. `Referrer-Policy: strict-origin-when-cross-origin` sends the full URL only within the site, the origin alone to other sites, and nothing when downgrading to HTTP, so paths and query strings do not leak. `Permissions-Policy` with empty allowlists means no code on the page can even request camera, microphone or geolocation. All four apply everywhere because `"source": "/(.*)"` matches every path.

**8. (Hostile.) A static job board with no login and no user data. Four security headers is cargo-cult theatre, isn't it?**

Partly, and I would not pretend otherwise — `nosniff` and `Permissions-Policy` defend surface this site does not have, since there are no uploads and no media features. The honest defence is that they cost four lines of config, zero runtime and zero maintenance, and they stay correct as the site grows, which is exactly the moment nobody remembers to add them. Two of them do earn their place today: framing is a real reputational risk for a page people paste into WhatsApp, and referrer leakage of query strings is a live default problem. The stronger criticism is what is missing — there is no `Content-Security-Policy`, the header that would actually constrain script execution, absent partly because the page pulls fonts and a stylesheet from Google's domains. That is a genuine gap.

**9. Explain the share-card incident and why the fix needed two changes.**

The project previously used `interneadar.in`, and that domain silently lost its DNS records — the authoritative nameservers stopped answering, with no error surfaced anywhere. The site was fine on its new hostname, but `og:image` still pointed at the old one, so WhatsApp's crawler fetched the page, failed to resolve the image host, got NXDOMAIN, and rendered a bare text card. The first change made `og:image` an absolute `https://` URL on the live hostname, because relative Open Graph URLs are dropped outright. The second appended `?v=2`, because crawlers cache for weeks keyed on the image URL and would have kept serving the broken card regardless of the file's contents. Changing bytes does not change the cache key; only changing the URL does. The reasoning is preserved as a comment at `web/public/index.html:11-15`.

**10. (Hostile.) Nobody noticed the card was broken until someone mentioned it. What does that say, and what would you change?**

It says there was no monitoring, which is a fair hit. No uptime check, no DNS check, no synthetic crawl — so a failure producing no error and no log line stayed invisible, and DNS failures are precisely the class that fails silently because the application is not even involved. The cheap fix is a scheduled check that resolves both hostnames and sends a `HEAD` request for the `og:image` URL, failing loudly on either; that is a few lines and could ride along with the twice-daily watcher run, which is already scheduled. A near-free second measure is running the link through the platform link debuggers after any head change, which also forces a re-crawl. The deeper weakness is structural: everything depends on one person's Mac and one person's attention.

**11. There is no login, so how does the site know anything about a user — and where is the only real session?**

It does not, deliberately. Everything shown is public data already published in one JSON file, so there is no authentication — proving who you are — and no authorisation — deciding what you may do — anywhere in the web tier. That removes session management, password storage and account takeover from the threat model entirely, and it is much of why the site can be static. The one real session lives in the other program: the watcher drives a real Brave browser on a persistent profile holding the author's logged-in LinkedIn cookies. That credential never enters the repository or reaches Vercel and exists on one machine — which is both the security property and the scaling limit, since the whole thing serves one person's watchlist.

**12. (Hostile.) Your backend is a JSON file in git. When does that stop working?**

Sooner than a real backend would. Every published run is a commit, so the repository grows forever; a few thousand jobs is fine, a few hundred thousand is not, because the browser downloads the entire file to show ten rows. There is no query capability — filtering and sorting happen client-side, so the site can never show anything the JSON does not already contain, and anything per-user is impossible. Deployment is coupled to data, so a bad write is a deploy and a rollback is a revert. I would move to a database and a real API when the file crosses roughly a megabyte, when more than one watchlist is involved, or when anything needs personalising — and the honest reason it has not happened is that none of those are true yet, and this costs nothing to run.

## Common beginner mistakes

**Using a relative `og:image` URL.** They write `content="/og.jpg"` because that works fine for `<img src>` in the body, and the page looks correct. But crawlers do not resolve relative Open Graph URLs — most drop the tag silently, so the card renders as bare text with no error anywhere. Fix: always the full `https://host/path`, verified by opening that exact URL in a fresh tab.

**Fixing a broken card and testing by re-sending the link.** The image is regenerated and loads fine, but the pasted link still shows the old card, so they conclude the fix failed and start changing random tags. The crawler cached the result keyed on the image URL, and the URL did not change. Fix: change the URL — that is what `?v=2` at `web/public/index.html:21` does — and use the platform's link debugger to force a re-crawl.

**Expecting a DNS change to be instant.** They edit the record, refresh ten seconds later, see nothing, and edit again — and again — leaving the zone a mess. The old answer is still cached for the remainder of its TTL, and re-editing evicts nothing. Fix: check the TTL first, lower it in advance for planned changes, and verify by querying the authoritative nameserver directly.

**Reading the padlock as a safety guarantee.** HTTPS is present, so the site must be legitimate — or, worse, an API key in frontend code must be safe because the connection is encrypted. TLS protects bytes in transit from third parties; it says nothing about who the other party is beyond hostname ownership, and hides nothing from the user themselves. Fix: treat it as proof of hostname and privacy only, and never ship a secret to the browser.

**Setting `no-store` everywhere to avoid stale bugs.** It genuinely kills the symptom, so it feels like a clean win. What it actually does is discard every caching layer: returning visitors re-download the whole site, weak mobile connections suffer most, and the origin takes traffic it never needed. Fix: separate content that must be fresh (`max-age=0, must-revalidate`, as on `/data/jobs.json`) from content that can be cached, and prefer revalidation over refusal.

**Assuming the browser cache is the only cache.** They clear their own, see the fix, and declare it shipped while everyone else gets old bytes. Between browser and origin sit the CDN edge, possibly a corporate proxy, and any crawler with its own store. Fix: test in a private window on another network, and remember only a changed URL defeats every layer.

## Exercises

**1. Read the real headers.** Run `curl -sI https://www.internradar.online/` and find the four security headers from `web/vercel.json`. Then `curl -sI https://www.internradar.online/data/jobs.json` and find the `Cache-Control` line. Write down which headers came from the config file and which Vercel added itself.

**2. Follow the name.** Run `dig www.internradar.online` and `dig internradar.online`. Note which returns a CNAME and which an A record, and write down each TTL. Run the same query twice and watch the TTL count down — that is a cache expiring in real time.

**3. Trigger a 304.** Load the site with developer tools open on the Network tab, reload, and find the request for `jobs.json`. Confirm the status is `304` and the transferred size is a few hundred bytes, then explain in two sentences which two headers made that happen.

**4. Break the card on paper.** For the block at `web/public/index.html:16-27`, write down exactly what a WhatsApp preview would do if you (a) made `og:image` relative, (b) removed `og:image:width` and `og:image:height`, (c) replaced the image file without bumping `?v=`. Say which failures are silent.

**5. 🔴 Design a caching policy the project lacks.** Write the `vercel.json` rule you would add for `/styles.css` and `/app.js`, given there is **no build step** and therefore no content hash in the filenames. Defend your `max-age` against both extremes — why not `max-age=0` (correct but slow), why not `max-age=31536000, immutable` (fast but ships invisible updates) — then say what would have to change about the project for the aggressive answer to become correct.

## Quiz

1. What is the difference between an A record and a CNAME, and why can a domain's apex not be a CNAME?
2. A response arrives with status `304`. What did the browser send to get it, and what is in the body?
3. Which of `max-age=0`, `no-cache`, `no-store` permits storage but forbids reuse without checking?
4. What exactly does a valid TLS certificate prove, and name one thing it does not.
5. Why did `?v=2` fix the share card when regenerating the image file did not?
6. Which header in `web/vercel.json` prevents clickjacking, and what does that attack look like?

---

### Quiz answers

1. An **A record** maps a name directly to an IPv4 address; a **CNAME** maps a name to another name, resolved in turn. The apex — the bare domain with no subdomain — must carry other record types such as NS and SOA, and DNS forbids a CNAME coexisting with other records at the same name. So the apex needs an A record or a provider extension, while `www.` can be a clean CNAME.

2. A **conditional request** carrying `If-None-Match` with the `ETag` from its stored copy (or `If-Modified-Since` with a date). The server compared fingerprints, found no change, and returned `304 Not Modified` with **an empty body** — headers only — so the browser serves its own copy. This is what makes `max-age=0, must-revalidate` on `/data/jobs.json` cheap despite checking every single time.

3. **`no-cache`.** Despite the name it permits storage and forbids reuse without revalidation. `max-age=0` marks the copy stale immediately, which in practice also forces revalidation, especially paired with `must-revalidate` as at `web/vercel.json:17`. `no-store` is the strict one: do not write it down at all.

4. That the server holds the private key for a certificate signed by a trusted Certificate Authority for that exact hostname, and that traffic cannot be read or altered in transit. It does **not** prove the site is honest, safe, competent or reputable — phishing sites get valid certificates free in seconds. Private, not trustworthy.

5. Because crawlers cache the fetched image keyed on **the URL**, not the contents. Having already recorded a failure for `.../og.jpg`, they kept serving the broken card for weeks regardless of what the file held. `og.jpg?v=2` is a resource no cache has an entry for, forcing a fresh fetch; the server ignores the query string and serves the same file.

6. **`X-Frame-Options: DENY`**, at `web/vercel.json:9`. Clickjacking is when a hostile page loads yours in an invisible or disguised iframe positioned over its own controls, so a user who thinks they are clicking the attacker's button actually clicks yours. `DENY` forbids any site from framing the page at all.
