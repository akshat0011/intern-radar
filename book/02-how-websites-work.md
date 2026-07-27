# Chapter 2 — How Websites Actually Work

> By the end of this chapter you will be able to type `internradar.online` into a browser and explain, out loud and in order, everything that happens between the keypress and the pixels — including the two things that have genuinely broken on this project in production.

**Before this chapter you should have read:** Chapter 1, *What Is Software?*

**New words introduced here:** internet, network, packet, router, ISP, bandwidth, latency, IP address, IPv4, IPv6, NAT, anycast, DNS, resolver, root server, TLD, authoritative nameserver, A record, AAAA record, CNAME, NS record, SOA record, TXT record, TTL, NXDOMAIN, apex, subdomain, port, TCP, UDP, handshake, HTTP, request, response, method, header, body, status code, redirect, HTTPS, TLS, certificate, certificate authority, HSTS, CORS, cookie, session, authentication, authorization, JSON, API, REST, endpoint, WebSocket, polling, cache, ETag, revalidation, CDN, edge, origin, load balancer, reverse proxy, domain, registrar, registry, nameserver, hosting, static site, serverless function, deployment, crawler, meta tag, Open Graph.

---

You have used websites your whole life and have probably never been told what one *is*. This chapter fills that gap. Not how to build one — that starts in Chapter 5. This is the machinery underneath, which is the same for every site in the world.

The worked example is **Intern Radar**, the subject of this book, live at `https://www.internradar.online`. It is small, real, and — usefully — it has broken in public twice, both times at the network layer rather than in the code.

Every command below was run against the real site on 27 July 2026 from a laptop in India. Nothing is invented. Where an output depends on where or when you run it, I say so.

---

## 2.1 The running analogy

Hold this picture for the whole chapter. You want to post a letter to a friend in a hostel in another city, and you do not know the address.

You ask a directory for the street address. The street address gets the letter to the building; the room number gets it to the person. The letter is too fat for one envelope, so you split it into numbered envelopes. The postal system carries each one through sorting offices; no single office knows the whole route. For privacy you use a sealed inner envelope. Your friend replies.

That is the internet. The directory is **DNS**. The street address is the **IP address**. The room number is the **port**. The numbered envelopes are **packets**. The sorting offices are **routers**. The sealed inner envelope is **TLS**. The letter and the reply are **HTTP**.

---

## 2.2 What the internet physically is

The least intuitive fact first: **the internet is a physical object.** It is not "in the cloud". It is mostly glass.

A **network** is two or more computers connected so they can send each other data. The **internet** is a network of networks — millions of separate ones that agreed to pass each other's data using common rules.

From your desk outward: your laptop talks to a **router**, a device whose job is to receive data and forward it onward (the blinking box on the wall). That router talks to your **ISP** — Internet Service Provider — the company you or your college pay. The ISP's routers connect by fibre-optic cable to other ISPs and to internet exchange points in Mumbai, Chennai, Delhi. Those connect to **submarine cables**: armoured glass lying on the sea floor. There are a few hundred; when one is cut by a ship's anchor, whole countries get slow. At the far end is a **data centre**, a building of racked machines.

Two words people confuse. **Bandwidth** is how much data flows per second — the width of the pipe. **Latency** is how long one message takes to get there and back — the length of the pipe. A truck full of hard drives has huge bandwidth and terrible latency.

Latency has a floor set by physics. Light in glass covers about 200,000 km per second, so a round trip from India to California — roughly 14,000 km each way — cannot beat about 140 ms however much you pay. Section 2.13, on putting copies of a site near people, exists entirely because of that number.

**The before:** older long-distance networks used **circuit switching** — the exchange physically connected a wire from your phone to theirs for the whole call, reserved even during silence. Computers send data in bursts, so reserving a wire wastes almost all of it. The internet's founding idea was to reserve nothing and chop everything into shared pieces.

---

## 2.3 Packets

A **packet** is a small chunk of data with an address label attached, typically about 1,500 bytes — a page of text.

The Intern Radar home page is 11,207 bytes (a real number, confirmed in Section 2.9). It travels as roughly eight packets. Each has a **header** — the label: source, destination, sequence number — and a **payload**, the slice of the page. Routers read only the header, decide which cable is the next hop, and forward. No router knows the whole route or remembers your packet afterwards.

Three consequences, and every layer above exists to handle them: packets **arrive out of order**, packets **get lost** (a router with a full queue simply drops them — normal, not a fault), and packets can be **duplicated or corrupted**. The network promises only "best effort", which is an honest name for "we'll try".

**The analogy, used once:** you post a 300-page report as 40 thin envelopes numbered "12 of 40". Some route via Nagpur, some via Bhopal. They arrive over three days, out of order, and number 27 never turns up, so your friend asks you to resend it. Your friend has just implemented TCP.

---

## 2.4 Addresses: IP

Every device needs an address. That is an **IP address** — Internet Protocol address. IP is the rulebook for how packets are addressed and forwarded, and it is the one thing the entire internet agrees on.

**IPv4** addresses are four numbers, 0–255, dotted. Intern Radar's real one is `216.198.79.1`. Four 8-bit numbers is 32 bits — about 4.3 billion addresses. In 1981 that was generous; there are now more phones than that. IPv4 ran out, and two workarounds keep it alive:

- **NAT** (Network Address Translation). Your hostel WiFi has *one* public address. Devices behind the router get private addresses (`192.168.x.x`, `10.x.x.x`) that mean nothing publicly; the router rewrites outgoing packets to say "from me" and rewrites replies back. This is why everyone in your hostel gets the same answer from "what is my IP".
- **Sharing at the server end.** One machine hosts thousands of sites on one address, because HTTP requests name the site inside them (Section 2.9).

**IPv6** is the replacement: 128 bits, written as hexadecimal groups, like `2405:201:4001:d02f::c0a8:1d01` — the real address of the router that answered my DNS queries while writing this. 2¹²⁸ is a 39-digit number. Adoption is now large, India especially, but IPv4 is not going away, so everything runs **dual stack**: both at once.

The site's real addresses:

```bash
$ dig +short www.internradar.online
e0289c48c4e5f1db.vercel-dns-017.com.
64.29.17.1
216.198.79.1
```

Two addresses, which leads to one more idea. **Anycast** means the same IP address is announced from many places at once. `216.198.79.1` is not one machine; Vercel announces it from data centres worldwide, and routing delivers your packets to the nearest one. Same address, different building. Section 2.13 shows the proof in a real header.

---

## 2.5 Names: DNS

Nobody types `216.198.79.1`. Something must turn the name into the address, and that is **DNS** — the Domain Name System, the internet's directory.

**The analogy, used once:** the enquiry counter at a large railway station. No single clerk knows every train. The general counter sends you to the zonal counter, which sends you to the right desk, which has the answer. Each step knows less generally and more precisely.

### The four players

1. **The stub resolver** — the small piece of code in your operating system that knows how to ask a DNS question and nothing else.
2. **The recursive resolver** — a server that does the legwork for you, usually your ISP's, sometimes a public one like `8.8.8.8` or `1.1.1.1`. It **caches** answers, which is why the second lookup is instant.
3. **The root servers** — thirteen logical addresses (`a.` to `m.root-servers.net`, each anycast to hundreds of machines) that know only which servers handle each TLD.
4. **The authoritative nameservers** — the final word for one specific domain.

A **TLD** — top-level domain — is the last part of a name. `.in` is a ccTLD, run for India by NIXI. `.online` is a generic one run by a commercial registry. There are about 1,500.

### The full resolution path

You ask for `www.internradar.online` with nothing cached anywhere:

1. Browser asks the **stub resolver**.
2. Stub resolver asks the **recursive resolver**.
3. Recursive resolver asks a **root server**, which replies: "not mine, but the `.online` servers handle that." (A *referral*.)
4. It asks an **`.online` server**, which replies: "`internradar.online` is delegated to `ns1.vercel-dns.com` and `ns2.vercel-dns.com`."
5. It asks **`ns1.vercel-dns.com`**, which is **authoritative** and gives the real answer.
6. It caches the answer and hands it back down.

Four questions to answer one, in tens of milliseconds, before a single byte of the site is requested. Caching means steps 3 and 4 are usually skipped. Note the shape: nobody has the whole map, each level only knows who to ask next. Same design as packet routing, same reason — it scales.

### Record types

A **record** is one row in the directory: a name, a type, a value, a **TTL**.

| Type | Means |
|---|---|
| `A` | The IPv4 address for this name |
| `AAAA` | The IPv6 address for this name |
| `CNAME` | "This name is an alias for that other name" |
| `NS` | Which nameservers are authoritative for this domain |
| `MX` | Where to deliver email for this domain |
| `TXT` | Arbitrary text; used for ownership proofs and anti-spoofing |
| `SOA` | Start of Authority — administrative metadata for the zone |

An `SOA` marks the top of a **zone**, the chunk of the name tree one set of nameservers is responsible for. Unglamorous, but diagnostic gold: a domain can have a healthy `SOA` and still be completely dead, as Section 2.6 shows.

### The real records

Two names matter: `internradar.online`, the **apex** (also called root, naked or bare — the domain with nothing in front), and `www.internradar.online`, a **subdomain**.

```bash
$ dig internradar.online A +noall +answer
internradar.online.  38399  IN  A  216.198.79.1

$ dig www.internradar.online +noall +answer
www.internradar.online.               26684  IN  CNAME  e0289c48c4e5f1db.vercel-dns-017.com.
e0289c48c4e5f1db.vercel-dns-017.com.    292  IN  A      64.29.17.1
e0289c48c4e5f1db.vercel-dns-017.com.    292  IN  A      216.198.79.1
```

The second block shows a `CNAME` working: `www` is an alias for a gibberish name Vercel generated for this project, and the resolver followed the alias and returned that name's `A` records too. Why bother? Because it lets the host change addresses without you touching anything. They edit the `A` records on *their* name; your alias still points at it.

**The apex cannot be a CNAME.** The specification says a name with a `CNAME` may have no other records — but an apex must have `NS` and `SOA` records, or it is not a zone. Contradiction. So the apex needs a literal `A` record, which is exactly what the lookup shows. Providers work around this with non-standard ALIAS/ANAME/"CNAME flattening" features: you configure something alias-shaped and they publish the resulting `A` record for you. Vercel does this, which is why the apex address can still change under you.

### TTL, and why DNS changes are slow

The numbers `38399`, `26684` and `292` are **TTL** values in seconds — Time To Live. A TTL is the record's instruction to every cache: *keep this for this many seconds, then ask again.*

Honesty about those numbers: they are the *remaining* countdown on a cached copy, not the value the owner configured. Run it a minute later and they are 60 lower. To see the configured value you must ask an authoritative server directly.

TTL is the whole reason DNS changes are not instant. Change your address at 10:00 with a 24-hour TTL, and a resolver in Chennai that cached the old answer at 09:55 keeps serving it until 09:55 tomorrow. It is not broken; it is obeying you. Meanwhile a resolver in Pune with nothing cached sees the new address immediately. For a day, two groups of users see two different sites and neither can convince the other anything is wrong.

The habit that follows: **lower the TTL a day before a planned change, not after.** Drop it to 300, make the change, watch it settle in five minutes, put it back. The trade-off is plain — low TTL means fast changes and more lookups; high TTL means fewer lookups and slow changes. Notice Vercel keeps the managed name at 292 seconds: they want to be able to move you quickly.

**The analogy, used once:** the reservation chart pasted on a train coach. It was printed four hours before departure and is right for almost everyone. If someone cancelled after printing, the chart is confidently wrong, and staring at it will not update it.

---

## 2.6 When DNS fails: the `interneadar.in` incident

Early in this project the site lived on a different domain: **`interneadar.in`**. (Yes, the spelling is unfortunate; that is genuinely what was registered.) It was bought, pointed at the host, and worked. Then, mid-project, it stopped — with no error, no warning email. It simply stopped resolving.

Here is the domain today:

```bash
$ dig interneadar.in A +noall +answer +comments

;; Got answer:
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 11219
;; flags: qr rd ra ad; QUERY: 1, ANSWER: 0, AUTHORITY: 0, ADDITIONAL: 0
```

Read what is *not* an error. `status: NOERROR` — the query succeeded, the name is known. `ANSWER: 0` — there is no `A` record. Compare a name that truly does not exist:

```bash
$ dig this-domain-does-not-exist-9f3k2.online
;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN
```

**NXDOMAIN** — Non-eXistent Domain — is DNS's honest "no such name". `interneadar.in` did not return that. Its nameservers still answer:

```bash
$ dig interneadar.in NS +short
dns1.bigrock.in.
dns2.bigrock.in.
dns3.bigrock.in.
dns4.bigrock.in.
```

Four nameservers at the registrar, cheerfully serving a zone with an `SOA` and no address rows — most likely reset to the registrar's own parking configuration. Learn the smell of this failure: **a healthy-looking system returning nothing.** A hard error is fixed in ten minutes because it is loud. NOERROR-with-zero-answers takes two hours, because every check says "fine".

### What it broke

The site moved to `internradar.online` and worked. Something else stayed broken, and not obviously.

When you paste a link into WhatsApp, Slack, iMessage or LinkedIn, the app shows a **card** — picture, title, description. That card is built by a **crawler**: a program the platform runs to fetch your page and read special tags out of it (Section 2.18). One tag gives the card's image URL, and it must be an *absolute* URL, including the hostname. That hostname was the old domain. So:

1. You share `https://www.internradar.online/`.
2. The crawler fetches the page — fine, the new domain resolves.
3. It reads the image tag and finds a URL on `interneadar.in`.
4. It tries to resolve that. No address. No connection.
5. It gives up on the image and shows three ugly lines of text.

The page loaded perfectly in every browser. Only the card was broken, and it looked like a formatting bug. It was a dead hostname buried in an attribute, on a domain the project had already left. The repository records both the fix and the cleanup:

```
70ddae2 Point share-card URLs at the domain that actually resolves
41d4975 Redraw the share card now that .in is retired for good
```

The second exists because the card image itself had the old domain *printed on it*. Today `web/og-card.html:125` reads:

```html
<span class="url">internradar.online</span>
```

Four lessons. **A domain not resolving is not a domain not existing** — learn to read NOERROR with zero answers. **Absolute URLs pinned to a hostname are a debt**; sometimes unavoidable (Section 2.18 explains why the image tag genuinely cannot be relative), but always a promise that the hostname will keep resolving. **Things only machines look at rot silently** — a broken home page is noticed in minutes; nobody inspects their share card. And **`dig` before you theorise**: thirty seconds of it would have replaced hours of staring at tags.

---

## 2.7 Ports, TCP and UDP

### Ports

An IP address reaches a *machine*, which runs many programs. A **port** is a number from 0 to 65535 saying which program a packet is for. Building address, then room number.

Conventions everyone follows: 80 for HTTP, 443 for HTTPS, 53 for DNS, 22 for SSH, 25 and 587 for mail. Typing an `https://` URL with no port silently appends `:443`.

This project shows a port openly in its local development server — a program that serves the site's files on your own laptop. `web/serve.js:19`:

```js
const PORT = Number(process.env.PORT || 4321);
```

`process.env` holds **environment variables**, named values the operating system hands a program at startup. If `PORT` exists use it; `||` means "or", so otherwise use 4321; `Number(...)` converts, because environment variables are always text. Then `web/serve.js:95–96`:

```js
server.listen(PORT, () => {
  console.log(`Intern Radar preview → http://localhost:${PORT}`);
```

`listen` is the moment the program claims that port from the operating system; from then on packets for 4321 go to it and nothing else. `localhost` always means "this machine" — it resolves to `127.0.0.1` and never leaves your computer, which is why the preview works with no internet at all. Why not port 80? Because ports below 1024 need administrator rights on macOS and Linux, so development servers pick high memorable numbers: 3000, 8080, 5173, 4321.

### TCP

**TCP** — Transmission Control Protocol — turns the lossy, unordered packet stream of Section 2.3 into a reliable, ordered, two-way stream of bytes. It provides **ordering** (every byte numbered, reassembled by number), **reliability** (the receiver acknowledges; anything unacknowledged is resent), **flow control** (the receiver states how much it can take, so a fast sender cannot drown a slow phone) and **congestion control** (loss means a router is overloaded, so the sender slows down — which is why networks degrade politely instead of collapsing).

The **three-way handshake** opens a connection before any data flows:

1. **SYN** — client: "I want to talk, my numbering starts at 4823."
2. **SYN-ACK** — server: "Heard you, expecting 4824; mine starts at 9910."
3. **ACK** — client: "Heard you too."

**The analogy, used once:** the first three seconds of a phone call, where nobody says anything meaningful until both sides confirm the other can hear them.

The cost is what matters: one full round trip before a useful byte moves. Mumbai to Mumbai, a few milliseconds; Mumbai to California, about 250 ms of pure waiting. Add TLS and you can burn half a second on ceremony. That is the whole economic case for CDNs.

### UDP

**UDP** — User Datagram Protocol — sends the packet and hopes. No handshake, ordering, retransmission or congestion control. That sounds useless, but for some jobs TCP's guarantees are harmful. **DNS** uses UDP: a query and answer each fit one small packet, and setting up a connection to ask a one-line question would double the cost — if it is lost, just ask again. **Video calls and games** use UDP: resending 20 ms of audio from four seconds ago is pointless, and a small glitch beats a growing delay.

Modern twist: **QUIC**, the transport under HTTP/3, is built on UDP and rebuilds ordering, reliability and encryption inside the application — partly because TCP's behaviour is baked into operating systems and network hardware and is therefore nearly impossible to improve.

---

## 2.8 HTTPS, TLS, and what a certificate proves

Everything so far travels in the clear. Anyone on the path — the WiFi, the ISP, any router — can read it. In 1995 that was the whole web, logins included.

**TLS** — Transport Layer Security, formerly SSL — sits between TCP and HTTP. **HTTPS** is just "HTTP inside TLS"; HTTP itself is unchanged, merely posted in a sealed envelope. TLS gives three separate things: **encryption** (an eavesdropper sees noise), **integrity** (data cannot be modified in flight undetected — some ISPs really did inject ads into pages), and **authentication of the server**.

### What a certificate proves

A **certificate** is a file the server presents during the handshake: the hostname it is valid for, a public key, an expiry, and a signature from a **certificate authority** (CA) that your browser was told in advance to trust. Let's Encrypt is the largest and issues them free and automatically.

Before issuing, the CA checks *one* thing: that the requester controls the domain — usually by demanding a specific file at a specific URL, or a specific `TXT` record. This is **domain validation**.

So a certificate proves exactly this: **the machine you are talking to controls this domain name.** Nothing more. Not that the site is honest, the company real, or your money safe. A criminal gets a valid certificate for `secure-bank-login-verify.com` in ninety seconds, free. The padlock means nobody is eavesdropping on your conversation with this site; it does not mean this site deserves the conversation. Read the hostname, not the icon.

**The analogy, used once:** the guard checking an ID card at the college gate. A valid card proves the person is who it says. It proves nothing about whether they intend to steal a laptop.

### The handshake, in outline

After TCP's handshake: the client sends a hello listing supported versions and ciphers, plus the hostname it wants in a field called **SNI** (Server Name Indication) — which is what lets one IP address serve thousands of sites with different certificates. The server replies with its chosen cipher and certificate chain. The client verifies the chain up to a CA it trusts and checks hostname and expiry. Both sides derive a shared secret an eavesdropper cannot compute. Everything after is encrypted. TLS 1.3 does this in one round trip.

What is *not* hidden: the IP address, usually the SNI hostname, and your DNS lookups unless they are encrypted. Your ISP can tell you visited `internradar.online`; it cannot tell which job you clicked.

### HSTS

A real header from the live site:

```
strict-transport-security: max-age=63072000
```

**HSTS** — HTTP Strict Transport Security — tells the browser: for the next two years, never even attempt plain HTTP for this site, and do not let the user click through a certificate warning. Without it, typing the bare name sends one unencrypted request first, and that request is a window for an attacker on the same network to redirect you — an attack called SSL stripping.

This header is **not** in `web/vercel.json`. Vercel adds it. General lesson: your host adds headers you never wrote, so read real responses, not only your config.

---

## 2.9 HTTP: it is just text

**HTTP** — HyperText Transfer Protocol — is the language browsers and servers speak. Its defining property is that it is **plain text a human can read**, with a rigid but simple shape.

A request:

```
GET /data/jobs.json HTTP/1.1
Host: www.internradar.online
Accept: application/json
Accept-Encoding: gzip, br

```

Four parts: the **request line** (method, path, version); **headers**, one `Name: value` per line; **a blank line**, which is structural and marks the end of the headers; and an optional **body**. `Host` is what makes shared hosting possible — it tells a server answering for a thousand sites which one you meant.

A response:

```
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
content-length: 268161

{"generatedAt":1785133815777,"count":214, ... }
```

Status line, headers, blank line, body. That is the entire protocol; everything else is detail.

**The analogy, used once:** the request slip at a library counter. You fill in a form; the clerk hands back the item with a slip saying what it is and how big. Neither of you remembers the transaction afterwards.

That last point is load-bearing: HTTP is **stateless**. The server does not remember you between requests, so each request must carry everything needed. Sections 2.11 and 2.15 are about living with that.

### Methods

| Method | Meaning | Safe? | Idempotent? |
|---|---|---|---|
| `GET` | Fetch a resource; change nothing | Yes | Yes |
| `POST` | Submit data; may create or trigger | No | No |
| `PUT` | Replace a resource entirely | No | Yes |
| `PATCH` | Modify part of a resource | No | No |
| `DELETE` | Remove a resource | No | Yes |
| `HEAD` | Like GET, headers only | Yes | Yes |
| `OPTIONS` | Ask what is allowed here | Yes | Yes |

**Safe** means "changes nothing on the server". **Idempotent** means "doing it five times equals doing it once". This is not pedantry: browsers, caches and crawlers assume GET is safe. Build a link that deletes something on GET and a crawler will eventually delete everything you own — and it will be your fault.

This project uses two methods: `GET` for every file and the job data, `POST` for the one thing that submits data, at `web/public/app.js:554`:

```js
const res = await fetch('/api/tailor', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ resumeText, job: activeJob }),
});
```

`fetch` is the browser's built-in request function. The path is *relative* — no hostname — so it goes to whichever host served the page, which is precisely the kind of URL that survives a domain change. `content-type` declares the body is JSON; `JSON.stringify` produces it (Section 2.10).

### Status codes

The first digit assigns meaning, and the 4xx/5xx split assigns blame.

| Family | Meaning |
|---|---|
| `1xx` | Informational — "still working" |
| `2xx` | Success |
| `3xx` | Redirection — "it's over there" |
| `4xx` | Client error — "you asked wrongly" |
| `5xx` | Server error — "I broke" |

If you are debugging and see 4xx, inspect what you sent. If you see 5xx, read the server logs.

### The codes this project really returns

**`200 OK`** — the live home page.

**`204 No Content`** — success with deliberately no body, `web/api/tailor.js:175–178`:

```js
if (req.method === 'OPTIONS') {
  res.setHeader('Allow', 'POST');
  return res.status(204).end();
}
```

The question "what may I do here?" is answered by the `Allow` header; there is nothing to put in a body, and 204 says so precisely.

**`308 Permanent Redirect`** — the apex, captured live:

```
$ curl -sSI https://internradar.online/
HTTP/2 308
location: https://www.internradar.online/
cache-control: public, max-age=0, must-revalidate
server: Vercel
```

`location` says where to go instead, and browsers follow it silently. Why 308 rather than the familiar 301? Both mean "permanently moved", but 301 historically let clients turn a POST into a GET while following, quietly losing form data. 308 forbids that.

**`400 Bad Request`** — twice in `web/api/tailor.js:193–198`, both *before* any expensive work:

```js
if (typeof resumeText !== 'string' || resumeText.trim().length < 200) {
  return res.status(400).json({ error: 'That resume looks too short to work with. ...' });
}
if (!job?.title) {
  return res.status(400).json({ error: 'No job was selected.' });
}
```

Note the message is written for a student, not a developer: it guesses the likely cause (a scanned-image PDF) and suggests a fix.

**`403 Forbidden`** — understood, refused. `web/serve.js:78–81`, guarding a path that tries to escape the public folder:

```js
if (!path.startsWith(ROOT)) {
  res.statusCode = 403;
  return res.end('Forbidden');
}
```

**`404 Not Found`** — `web/serve.js:88–92`, and live: `/no-such-page` returns 404.

**`405 Method Not Allowed`** — right URL, wrong verb, `web/api/tailor.js:179–181`. Try it:

```bash
$ curl -sS -w "\nstatus=%{http_code}\n" https://www.internradar.online/api/tailor
{"error":"Use POST."}
status=405
```

**`422 Unprocessable Entity`** — well-formed but unusable content; used at `web/api/tailor.js:236–239` when Google's content filter rejects the input.

**`429 Too Many Requests`** — rate limiting, `web/api/tailor.js:59–64`:

```js
if (times.filter((t) => now - t < 3_600_000).length >= PER_IP_PER_HOUR) {
  return { ok: false, status: 429, message: `You can tailor ${PER_IP_PER_HOUR} resumes per hour. Try again shortly.` };
}
```

**`500 Internal Server Error`** — used when the API key is missing (`web/api/tailor.js:186–189`) and in the catch-all at line 275. **`502 Bad Gateway`** — *this* server is fine but one it depends on misbehaved; used for empty, unparseable or truncated answers from Google (lines 242–261). **`503 Service Unavailable`** — temporarily unable; used for the global daily allowance and the manual off-switch (lines 182–184).

One passage deserves study, `web/api/tailor.js:224–232`:

```js
if (!upstream.ok) {
  const status = upstream.status;
  const message =
    status === 429 ? "The site's free daily allowance for resume tailoring has run out. ..."
    : status === 400 || status === 403 ? "The site's API key was rejected. Contact the site owner."
    : 'The AI service could not be reached. Try again shortly.';
  return res.status(status === 429 ? 503 : status === 400 || status === 403 ? 500 : 502)
    .json({ error: message });
}
```

It deliberately does not forward Google's code. Google saying 429 means *the site owner's* quota ran out, so from the student's side the service is unavailable: 503. Google saying 400 or 403 means the site's key is wrong: that is the site's fault, 500. Anything else is an upstream failure: 502. A status code describes the relationship between *this* client and *this* server; forwarding someone else's lies about who is at fault.

### Versions

`curl` printed `HTTP/2` above. **HTTP/1.1** (1997) handled one request at a time per connection, so browsers opened six connections per host. **HTTP/2** (2015) kept the same meaning but used binary framing, multiplexed many requests over one connection, and compressed headers. **HTTP/3** (2022) does the same over QUIC/UDP, removing a problem where one lost packet stalls every stream. These change performance, not meaning: a 404 is a 404 in all three.

---

## 2.10 JSON

Two programs need to exchange structured data. **JSON** — JavaScript Object Notation — is how, for almost everything now. It is text, so it survives any transport, and it has six kinds of value:

```json
{
  "title": "Software Engineering Intern",
  "stipend": null,
  "easyApply": true,
  "count": 214,
  "skills": ["Python", "SQL"],
  "meta": { "model": "gemini-2.5-flash" }
}
```

**String** in double quotes (single quotes are invalid), **number**, **boolean** (`true`/`false`, lowercase), **null**, **array** in `[ ]`, **object** in `{ }` with quoted keys. No comments, no trailing commas, no dates, no functions. That poverty is the point: almost every language can read it.

**The before:** XML — verbose, tag-based, needing real parsing effort — and before that ad-hoc formats, comma- or pipe-separated, each pair of programs inventing its own and each breaking the first time a field contained a comma.

The site's entire dataset is one JSON file, built at `src/publish.js:114–127`:

```js
const payload = {
  generatedAt: Date.now(),
  count: publicJobs.length,
  techCount,
  otherCount: publicJobs.length - techCount,
  companies: [...new Set(publicJobs.map((j) => j.company))].sort(),
  locations: [...new Set(publicJobs.map((j) => j.location).filter(Boolean))].sort(),
  jobs: publicJobs,
};

mkdirSync(WEB_DATA_DIR, { recursive: true });

const next = `${JSON.stringify(payload, null, 1)}\n`;
writeFileSync(JOBS_FILE, next);
```

A timestamp, three counts, two de-duplicated sorted lists for the filter dropdowns (`new Set` removes duplicates; `[...]` spreads it back to an array), and the jobs. `JSON.stringify(payload, null, 1)` converts it to text indented by one space — a few kilobytes more, in exchange for a readable file and small, reviewable differences when it is committed every run. Then it is written to disk. No database server is involved in publishing at all.

The browser side, `web/public/app.js:119–130`:

```js
async function loadJobs() {
  try {
    const res = await fetch(`/data/jobs.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    state.jobs = data.jobs ?? [];
    state.generatedAt = data.generatedAt ?? null;
  } catch {
    state.jobs = [];
    state.generatedAt = null;
  }
}
```

`res.ok` is true for any 2xx — and importantly *not* for 404, because `fetch` does not throw on error statuses; it only throws when the request could not be made at all. `res.json()` parses the body. `??` supplies a fallback when the left side is null or undefined. The bare `catch` means any failure ends with an empty list and the page saying "Radar clear" rather than a blank screen. The `?t=` and `cache: 'no-store'` are cache controls, covered next.

Live proof:

```
$ curl -sSI https://www.internradar.online/data/jobs.json
HTTP/2 200
content-type: application/json; charset=utf-8
content-length: 268161
```

268 KB of JSON is the entire "database" the public site has.

---

## 2.11 A first look at APIs and REST

An **API** — Application Programming Interface — is a contract for how one program talks to another; a web API is one you talk to over HTTP.

**REST** — Representational State Transfer — is a design style from 2000. Its ideas: everything is a **resource with a URL** (nouns, not verbs); the **HTTP method is the verb**; requests are **stateless**, carrying everything needed; and **status codes carry the outcome**, rather than a `200 OK` containing `{"error": "not found"}`.

A REST-shaped jobs service would be:

```
GET    /api/jobs            → list
GET    /api/jobs/4102993    → one job
POST   /api/jobs            → create
DELETE /api/jobs/4102993    → delete
```

*(A made-up example to show the idea, not from this project.)*

Intern Radar has no REST API. It has **a file** — `/data/jobs.json`, served statically, which is `GET` on a resource and needs no server code — and **one endpoint that is not REST at all**: `POST /api/tailor` is a remote procedure call, a verb. There is no "tailor" resource to GET, and nothing is stored.

Is that wrong? No. REST fits resources you create, read, update and delete. "Take this text and this job, return a rewrite, store nothing" is an action. Forcing it into `POST /api/tailorings` would invent a resource that never exists. The trade-off, named: RPC-style endpoints are hard to cache (every input differs), hard to describe generically, and do not compose into a larger API. For one endpoint doing one job, none of that bites. Chapter 15, *APIs and REST*, goes deeper; Chapter 13, *Serverless and the Tailor Endpoint*, dissects this function.

---

## 2.12 Caching and `Cache-Control`

A **cache** is a stored copy kept nearer whoever needs it. Caching is the biggest performance lever on the web and the biggest source of "but I fixed that — why do I still see the old one?" There are at least four caches between a file and your eyes: the browser's disk cache, any proxy in between, the CDN edge, and the server's own.

The `Cache-Control` response header instructs all of them:

| Directive | Meaning |
|---|---|
| `public` | Any cache may store this, including shared ones |
| `private` | Only the user's own browser may store it |
| `no-store` | Do not store anywhere, ever |
| `no-cache` | Store it, but revalidate before every reuse (badly named) |
| `max-age=N` | Fresh for N seconds |
| `s-maxage=N` | Same, for shared caches only |
| `must-revalidate` | Once stale, check with the server; never serve stale |
| `immutable` | Never changes; do not even revalidate |
| `stale-while-revalidate=N` | Serve the stale copy now, refresh in the background |

### Revalidation, ETag and 304

`max-age=0, must-revalidate` does not mean "never cache". It means "keep a copy, but ask before using it", and the asking is cheap because of two headers. An **`ETag`** is an opaque identifier for this exact version, usually a hash — the live home page returns `etag: "921bceb7551b9562c73cbe03f1208bea"`. **`Last-Modified`** is a timestamp.

Next time the browser sends `If-None-Match: "921bce..."`. If nothing changed, the server replies **`304 Not Modified`**: status line and headers, no body. For a 268 KB file that turns a 268 KB transfer into a few hundred bytes, which is why 304 is one of the most valuable codes on the web.

### What this project sets — and the honest version

`web/vercel.json:14–19`:

```json
{
  "source": "/data/jobs.json",
  "headers": [
    { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
  ]
}
```

`source` is a path pattern. Read the value as a sentence: *anyone may cache this, it is stale the instant it is served, and you must check before reusing it.* Correct for a file that changes several times a day and whose whole promise is freshness.

Now the honesty. Fetch the live site and **every** file returns that same value:

```
$ curl -sSI https://www.internradar.online/og.jpg?v=2
cache-control: public, max-age=0, must-revalidate
```

That is Vercel's default for static files. The rule in `vercel.json` matches what would happen anyway; it pins the intent so a future config or platform change cannot silently make the job list stale, but do not read that block and conclude jobs.json is treated differently. Read real headers, not just config.

The visible cost of this policy is that every visit revalidates everything. A site shipping versioned filenames (`app.a3f9c2.js`) could serve them `max-age=31536000, immutable` and skip the network entirely on repeat visits. This project has **no build step** — as Chapter 4, *The Shape of the Folder*, explains, the files you edit are the files that ship — so there are no content hashes in filenames, so aggressive caching would risk serving stale code. A little speed traded for a lot of simplicity, knowingly.

### Two `?` tricks, for opposite reasons

A query string does not change which file is served, but it does change the cache key: caches treat `x.json` and `x.json?t=5` as different things.

**To defeat caching**, `web/public/app.js:121`:

```js
const res = await fetch(`/data/jobs.json?t=${Date.now()}`, { cache: 'no-store' });
```

`Date.now()` is milliseconds since 1970, so every request has a URL no cache has seen. `cache: 'no-store'` already tells the browser not to cache; the `?t=` also defeats anything in between that ignores headers. For a board promising "listed minutes after they go live", stale data is the one unacceptable failure.

**To force a cache to update**, `web/public/index.html:21`:

```html
<meta property="og:image" content="https://www.internradar.online/og.jpg?v=2">
```

No code reads `?v=2`. It exists because of the file's own comment at `web/public/index.html:11–15`:

```html
<!-- Link previews. WhatsApp/iMessage will not render a card without og:image, and it
     must be an absolute https URL — a relative one is silently dropped. The explicit
     width/height are what make WhatsApp and Slack draw the big card instead of the
     thumbnail-beside-text one. Crawlers cache hard and key on the image URL, so bump
     ?v= when og.jpg is regenerated, otherwise the old card sticks around for weeks. -->
```

You cannot send WhatsApp a purge request. Changing `?v=1` to `?v=2` gives every crawler a URL it has never seen, so it must fetch. Manual cache invalidation, and the number is a record of how many times the card has been redrawn.

**The analogy, used once:** the notice board outside the department office. Everyone reads the copy pinned there rather than walking to the office, and the old timetable stays up until someone physically replaces it.

---

## 2.13 CDNs and edge networks

Latency is bounded by the speed of light, so the only way to shorten a round trip is to shorten the distance. A **CDN** — Content Delivery Network — is a fleet of servers in many cities holding copies of your files. Users are routed (usually by anycast) to the nearest, called an **edge**; the machine holding the original is the **origin**. A fresh copy at the edge is a **cache hit**; otherwise the edge fetches from origin, stores it, and answers — a **cache miss**. The first user in a city pays the long trip; nobody after them does.

**The analogy, used once:** the department library has one copy of the textbook, and there is a photocopy in your hostel reading room. The first person walks over and brings one back; everyone else reads it downstairs.

Real headers from my machine in India:

```
$ curl -sSI https://www.internradar.online/
HTTP/2 200
age: 1362
x-vercel-cache: HIT
x-vercel-id: bom1::hxqhv-1785133792820-3000ff0aaf92
etag: "921bceb7551b9562c73cbe03f1208bea"
last-modified: Mon, 27 Jul 2026 06:07:10 GMT
content-length: 11207
```

`x-vercel-cache: HIT` — the edge served it without contacting origin. `age: 1362` — this copy has been in that cache for 1,362 seconds, about 23 minutes (`Age` is a standard header). `x-vercel-id: bom1::…` — `bom1` is Vercel's Mumbai region; BOM is Mumbai's airport code. I am in India, so I was served from Mumbai, not from wherever the "real" site is. That is anycast and the CDN working as designed; someone in Frankfurt sees a different code. Moments later, a different file:

```
$ curl -sSI https://www.internradar.online/data/jobs.json
age: 0
x-vercel-cache: MISS
```

`MISS` with `age: 0` — the edge fetched it from origin for me, and the next person in Mumbai gets a HIT. This is why a free static site is fast in India, and why static sites are cheap: HTML, CSS, JavaScript, JSON and images are just files, and files cache perfectly.

One more real header:

```
access-control-allow-origin: *
```

That is **CORS** — Cross-Origin Resource Sharing. By default a browser forbids JavaScript on site A from reading responses from site B; this header is site B saying "any site may read this". Vercel sets it on static assets; it is not in this repository. Harmless here, because the files are public anyway — but exactly the header to notice on a site with private data.

---

## 2.14 Load balancers and reverse proxies

A **reverse proxy** sits in front of one or more real servers, receives every request, and forwards it on. ("Reverse" because a forward proxy sits in front of *clients*.) Typical jobs: terminate TLS, serve cached copies, add headers, route `/api/*` to one program and everything else to another, block abuse. Nginx, HAProxy and Caddy are common ones.

A **load balancer** is a reverse proxy whose main job is spreading requests over several identical servers, so no machine is overloaded and one dying machine does not take the site down. It needs a way to choose (round-robin, least-connections, lowest latency) and **health checks** — periodic "are you alive?" requests so dead servers leave the rotation automatically.

Its classic complication is **session affinity**: if a server keeps your login state in its own memory, your next request must land on the same server or you appear logged out. The fixes are to keep no per-user state on servers (statelessness again) or store sessions in a shared database.

This project has none of that visibly, and all of it invisibly. There is no origin server to balance — the site is files plus one function. Vercel's edge network *is* the reverse proxy: it terminates TLS, applies the headers from `web/vercel.json`, serves static files from cache, routes `/api/tailor` to a function it starts on demand, and performs the apex 308 before anything of yours runs. That is why `web/vercel.json` is 26 lines; the traditional equivalent is an Nginx config, a certificate renewal job, a service file and a load balancer definition. The trade-off: you get all of it free, and you get exactly the control your host chooses to give you.

One consequence appears in code. Requests arrive *through* the proxy, so the connection the function sees comes from the proxy, not the student. `web/api/tailor.js:168–172`:

```js
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || 'unknown';
}
```

`X-Forwarded-For` conventionally carries the original client address, possibly as a chain `client, proxy1, proxy2` — hence splitting on commas and taking the first. Security note: a client can *send* that header. Where the edge overwrites it, fine; where it does not, anyone bypasses an IP rate limit with a fake header. The code's own comment at lines 36–39 is honest about the ambition: "a speed bump rather than a vault — it stops runaway loops and casual abuse, which is what it is for."

---

## 2.15 Cookies, sessions, authentication and authorization

HTTP forgets you the instant it replies. So how does any site keep you logged in?

A **cookie** is a small piece of text the server asks the browser to store and send back on every later request to that site. The server sends:

```
Set-Cookie: session=aG9zdGVsMTIz; Max-Age=1209600; Path=/; Secure; HttpOnly; SameSite=Lax
```

and the browser sends `Cookie: session=aG9zdGVsMTIz` from then on. The attributes are where the safety lives: `Expires`/`Max-Age` (when to forget; without either it dies with the browser), `Domain` and `Path` (where it is sent), `Secure` (HTTPS only), `HttpOnly` (JavaScript on the page cannot read it, blocking theft by injected scripts), and `SameSite` (`Strict`/`Lax`/`None` — whether to send it on requests started by other sites, defending against cross-site request forgery).

**The analogy, used once:** the cloakroom token. The plastic disc is meaningless in itself, and worthless to a stranger except that whoever holds it can claim your bag. A session cookie is not your identity; it is a claim on it. Which is exactly why `HttpOnly` and `Secure` exist.

A **session** is server-side memory about one user, identified by that cookie. Two designs. **Server-side sessions**: the cookie holds a meaningless random ID and the data lives in a database, so revoking is a delete — at the cost of a lookup per request and shared storage. **Tokens**: the cookie or an `Authorization` header holds a signed blob containing the user ID and expiry (a JWT, say), so any server can verify it with no lookup — at the cost of being hard to revoke early, because nothing was stored to delete.

Two words that look alike: **authentication** (authn) is *who are you?* — password, one-time code, passkey. **Authorization** (authz) is *what may you do?* Logging into your college portal is authentication; the portal refusing to show another student's marks is authorization. You can have one without the other, and a confirmed identity with no permission checks is the classic serious bug: log in as yourself, change the ID in the URL, read someone else's data.

### What this project does: refuse to play

The public site has **no accounts, no login, no sessions and no cookies of its own.** Nothing in the live responses is a `Set-Cookie`, and there is no cookie code in `web/public/app.js` or `web/api/tailor.js`.

What that buys: nothing to breach. No password store, no session tokens to steal, no consent banner, no deletion requests. The footer promise at `web/public/index.html:141` — "Your resume is processed in memory and never stored here" — is easy to keep when there is nowhere to store it. What it costs: no saved searches, no seen/unseen state, no email alerts. And the rate limiter must key on IP address instead of an account, so fifty students behind one hostel NAT share one allowance.

### Where a cookie is life-or-death

The *other* half of this project — the watcher that runs on the author's Mac — depends completely on one. LinkedIn's session cookie is `li_at`. `src/browser.js:159–166`:

```js
export async function hasLinkedInSession(context) {
  const cookies = await context.cookies('https://www.linkedin.com');
  const liAt = cookies.find((c) => c.name === 'li_at');
  if (!liAt) return false;
  if (liAt.expires && liAt.expires > 0 && liAt.expires * 1000 < Date.now()) return false;
  return true;
}
```

Ask the browser for LinkedIn's cookies; find `li_at`; treat a missing or past-expiry cookie as no session (`* 1000` because the expiry is in seconds and `Date.now()` is milliseconds). The human logs in by hand once, the cookie lands in the browser profile on disk, and every scheduled run reuses it. The README is blunt: that profile "contains a live LinkedIn session. Treat it like a password." Correct — a session cookie is a bearer token, and whoever holds it is you.

The README also explains why the check exists, and it generalises: LinkedIn "will serve a public job page to a signed-out visitor that looks perfectly healthy — without this check the tool would scrape that and store worse data thinking all was well." A 200 OK is not proof of success.

---

## 2.16 WebSockets, and when you would want them

HTTP is one-way in its initiative: the client asks, the server answers. The server cannot start a conversation. Four ways round that, in order of invention:

1. **Polling** — ask every N seconds. Simple, works everywhere, wasteful, and up to N seconds late.
2. **Long polling** — ask, and the server does not answer until there is news or a timeout. Better latency, but a connection is tied up per client.
3. **Server-Sent Events (SSE)** — one long-lived HTTP response the server keeps dribbling text into. One-directional, simple, built into browsers as `EventSource`.
4. **WebSockets** — a real two-way channel. The client sends an HTTP request with `Upgrade: websocket`, the server replies `101 Switching Protocols`, and the same TCP connection then carries messages both ways with almost no per-message overhead. The scheme is `ws://` or `wss://`.

Use WebSockets when messages flow both ways, often, and latency matters: chat, multiplayer games, shared cursors, trading screens. Use SSE when the flow is one-way. Use polling when updates are rare and simplicity is worth more.

Intern Radar has none. Its data changes a few times a day; the page loads the JSON once at startup and stops. But the harder constraint is architectural: **a WebSocket needs a server that stays running** — a connection held open is a process holding it. This project deliberately has no always-on server, only static files on a CDN plus a function that starts when called and stops when done. Adding WebSockets means adding a machine to keep alive, monitor, patch and pay for, which is the exact cost the architecture avoids.

The honest trade-off: if a job is posted two minutes after you open the page, you will not see it until you reload. Acceptable at a few postings a day. If the requirement were "the open page must show it within ten seconds", the answer would be SSE or WebSockets and the architecture would have to change. Naming the requirement in seconds first is the whole skill.

---

## 2.17 The headers this project really sets

`web/vercel.json` is 26 lines, half of them security headers:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), interest-cohort=()" }
      ]
    },
```

`$schema` points at a description of the file's valid shape so an editor can autocomplete and catch typos. `"framework": null` tells the host "do not try to build this" — true, since this project has no framework and no build step. `"source": "/(.*)"` matches every path.

**`X-Content-Type-Options: nosniff`.** Every response declares its kind in `Content-Type`. Browsers historically did not trust that: if the type looked wrong they sniffed the bytes and guessed — helpful, and dangerous, because a site accepting "image" uploads could be tricked into hosting a file the browser decides is JavaScript and runs. `nosniff` says believe the declared type, always.

There is an echo of this inside the project. `web/serve.js:21–36` maps extensions to types and records a real bug in a comment:

```js
  // The company logos in public/logos and the og: card are all .jpg. Without these
  // they fell through to application/octet-stream, which the browser will not paint.
  '.jpg': 'image/jpeg',
```

`application/octet-stream` means "unspecified binary". Unspecified binary is not an image, so the browser refuses to render it: two missing lines in a lookup table, and every logo goes blank with no error anywhere.

**`X-Frame-Options: DENY`.** An `<iframe>` embeds one page inside another. **Clickjacking** abuses that: the attacker loads your real site in an invisible frame and positions their own button under yours, so the user clicks what they cannot see. `DENY` refuses framing entirely. The modern replacement is `Content-Security-Policy: frame-ancestors`, but this still works everywhere and costs one line. Cost: nobody can legitimately embed the site either — for a job board, nobody needs to.

**`Referrer-Policy: strict-origin-when-cross-origin`.** When you click a link, your browser tells the destination where you came from, in the `Referer` header (misspelled in the specification since 1996). Full URLs can contain a search query, a document ID, a token. This policy sends the full URL only within the same site; to another HTTPS site it sends just the **origin** (`https://www.internradar.online/`) with no path or query; from HTTPS to HTTP it sends nothing. Concretely: every job card links to LinkedIn, and without this LinkedIn would receive the student's full URL including filter state. With it, LinkedIn learns only that someone came from Intern Radar. It is now the browser default, but stating it means not depending on defaults.

**`Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`.** This switches browser features off for the page and anything it embeds; empty parentheses mean "no origin at all". The site never needs camera, microphone or location, so nothing on the page can even *ask* — if a script were ever injected, it cannot raise a permission prompt. `interest-cohort=()` is a period piece: FLoC was Google's proposed replacement for tracking cookies, in which your browser computed an interest label from your browsing and shared it with sites. This was the opt-out. FLoC was abandoned in 2022; the line is harmless and states a position.

**What is missing: CSP.** The most important header of all is **Content-Security-Policy**, which lists exactly which sources of scripts, styles, images and connections a page may use — the difference between an injected script running and being blocked dead. This site does not set one, and the reason is honest: the page loads fonts from `fonts.googleapis.com` and `fonts.gstatic.com` (`web/public/index.html:39–41`), and `web/public/app.js:479` imports a PDF-reading library from a CDN at runtime:

```js
const pdfjs = await import(`${PDFJS_BASE}/pdf.min.mjs`);
```

where `PDFJS_BASE` is `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82`. A policy would have to allow those hosts plus the inline `data:` favicon, and get every directive right or the site breaks in ways that only show on some pages. The correct description is "not done yet", not "not needed".

### The redirect trap

The 308 from Section 2.9 interacts with meta tags, and it has bitten this project:

```
$ curl -sSI https://internradar.online/
HTTP/2 308
location: https://www.internradar.online/
```

Browsers follow that silently. Most crawlers do too — but not all, and not always before reading your tags. Some historically stopped after one redirect, or treated a different hostname as a different site, or cached under the original URL. So the tags in `web/public/index.html` are all pinned to one canonical hostname and rely on no redirect:

```html
<link rel="canonical" href="https://www.internradar.online/">
<meta property="og:url" content="https://www.internradar.online/">
<meta property="og:image" content="https://www.internradar.online/og.jpg?v=2">
```

The **canonical** tag names the one true URL for this page, so a search engine arriving by any other path knows which to index. `og:url` does the same for share cards. `og:image` is absolute and on that same hostname, so fetching it never involves a redirect.

Two rules. **Pick one hostname and mean it** — apex or `www` barely matters (`www` is slightly easier to move, since it can be a CNAME), but having both work independently is worse than picking one and redirecting the other. **Never make a crawler follow a redirect to find your metadata**; browsers are forgiving, crawlers are not, and they do not report errors to you.

---

## 2.18 Meta tags and the share card

The `<head>` of an HTML page is the part that is not displayed: instructions and metadata. A **meta tag** is one line of it. Chapter 5, *HTML: The Skeleton*, covers HTML properly; this is only the tags that exist for machines on the network.

**Open Graph** is a small vocabulary invented by Facebook in 2010 and now used by WhatsApp, Slack, iMessage, LinkedIn, Discord and Telegram. Its tags use `property="og:..."`, not `name="..."` — not a stylistic difference: a crawler looking for `property` will not see a tag that used `name`. Here is the real block, `web/public/index.html:16–27`:

```html
<meta property="og:type" content="website">
<meta property="og:site_name" content="Intern Radar">
<meta property="og:url" content="https://www.internradar.online/">
<meta property="og:title" content="Intern Radar — be early">
<meta property="og:description" content="Software internships in India, listed minutes after they go live. Apply while the queue is still short.">
<meta property="og:image" content="https://www.internradar.online/og.jpg?v=2">
<meta property="og:image:secure_url" content="https://www.internradar.online/og.jpg?v=2">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Intern Radar — be early. Software internships in India, listed minutes after they go live.">
<meta property="og:locale" content="en_IN">
```

`og:type` is what kind of thing this is (`website`, `article`, …). `og:site_name` is the small label on the card. `og:url` is the canonical URL. `og:title` and `og:description` are the card's headline and body — note they differ slightly from the page's own `<title>` and description at lines 6–7, deliberately: a browser tab is narrow and wants brevity, a share card has room and is read cold by someone with no idea what this is. `og:image` is the picture, absolute as the file's comment insists. `og:image:secure_url` is for old crawlers that expected `og:image` to be HTTP. `og:image:type` saves a crawler from fetching the file to learn its kind. `og:image:width` and `og:image:height` are 1200 × 630 — roughly 1.91:1, the size the industry standardised on — and they are stated explicitly because, as the comment says, without them WhatsApp and Slack draw the small thumbnail layout rather than the big card. `og:image:alt` is read aloud by screen readers. `og:locale` is `en_IN`: English, India.

Then the Twitter/X block, `web/public/index.html:29–33`:

```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Intern Radar — be early">
<meta name="twitter:description" content="Software internships in India, listed minutes after they go live. Apply while the queue is still short.">
<meta name="twitter:image" content="https://www.internradar.online/og.jpg?v=2">
<meta name="twitter:image:alt" content="Intern Radar — be early. Software internships in India, listed minutes after they go live.">
```

`name=`, not `property=` — Twitter's vocabulary uses the other attribute, and everyone gets this wrong once. `twitter:card` set to `summary_large_image` is the single line that selects the big-picture layout instead of a postage stamp. The duplication is not vanity: most crawlers fall back to `og:` when a `twitter:` tag is missing, but not all, and five extra lines cost nothing next to a broken card nobody notices for a month.

### Where the image comes from

`web/og-card.html` is a 128-line HTML file never served to anyone. It draws the card — black background, radar mark, "Be early." in enormous type, three chips, the domain — at exactly 1200 × 630, set at `web/og-card.html:16`:

```css
#card {
  position:absolute; top:0; left:0; width:1200px; height:630px; overflow:hidden;
```

A browser opens it, screenshots that box, and the result is saved as `og.jpg` (124,247 bytes on the live site). That is why the card is redrawn by editing CSS rather than opening a design tool — and why commit `41d4975 Redraw the share card now that .in is retired for good` exists: the old domain was printed *on the image*, so fixing the tags was not enough.

### The other head tags worth knowing

`<meta charset="utf-8">` (line 4) sets the character encoding and must appear within the first 1024 bytes, which is why it is first; get it wrong and the em dash in "Intern Radar — be early" becomes garbage. `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` (line 5) tells a phone to treat the page as phone-width instead of pretending to be a 980-pixel desktop and zooming out; `viewport-fit=cover` lets it paint around a notch. `<meta name="color-scheme" content="dark light">` (line 8) tells the browser the page handles both, so scrollbars and controls are themed and there is no white flash. The two `theme-color` tags (lines 35–36) each carry a `media` attribute so the phone browser's own chrome matches the site's palette. And the favicon at line 37 is an inline SVG in a `data:` URL — the whole icon drawn in the attribute, costing no extra request.

---

## 2.19 Domains, registrars, hosting, deployment

### Who owns a name

Three parties. The **registry** runs a TLD — one organisation per TLD; NIXI runs `.in`, a company called Radix runs `.online`. The **registrar** sells names to the public and talks to the registry for you: GoDaddy, Namecheap, BigRock, Cloudflare. The **registrant** is you — and you do not own the name, you hold a renewable lease, usually annual. ICANN coordinates the whole system.

Domains expire, then pass through a grace period, then a redemption period (expensive), then anyone can buy them. Turn auto-renew on. A lapsed domain is the one mistake in this chapter you may not be able to undo.

Buying a name gives you the right to say who answers questions about it — the `NS` record. Intern Radar's points at `ns1.vercel-dns.com` and `ns2.vercel-dns.com`: the registrar sold the name and got out of the way, so the host can change addresses and certificates without anyone touching the registrar. The retired domain's `NS` records still point at `dns1.bigrock.in` and friends — the registrar's own DNS, with an empty zone. Nameserver delegation is precisely where the two stories diverge.

### Kinds of hosting

Roughly by how much you must manage: **shared hosting** (your files in a folder on a shared machine — cheap, limited, mostly historical); **VPS or cloud VM** (you rent a virtual machine and run the operating system, web server, TLS and backups yourself — maximum control, maximum work); **managed platform** (you give it code, it runs it: Heroku, Render, Railway); **static hosting plus serverless** (you give it files, a CDN serves them, functions run only when called: Vercel, Netlify, Cloudflare Pages).

A **static site** is one whose files are identical for every visitor, prepared in advance. That does not mean uninteractive — Intern Radar filters, searches, sorts and renders in the browser. It means the *server* does no per-visitor work.

A **serverless function** is code that runs on demand: no request, no process, no cost. The name is a lie — there is obviously a server — but you never see, patch or pay for it while idle. `web/api/tailor.js` is the only one, and `web/vercel.json:21–25` caps it:

```json
  "functions": {
    "api/tailor.js": {
      "maxDuration": 60
    }
  }
```

Sixty seconds, then the platform kills it. A real constraint: an AI call that hangs is a bill, or a queue of stuck requests. Chapter 13, *Serverless and the Tailor Endpoint*, covers what happens inside those sixty seconds.

### Deployment

**Deployment** is getting a new version in front of users. Here it is unusually direct, as the README describes:

```
you run npm start  →  scraper finds jobs  →  writes web/public/data/jobs.json
                   →  commits + pushes    →  Vercel redeploys  →  live in ~1 min
```

The push *is* the deploy. `src/publish.js:164–173`:

```js
    git(['add', 'web/public/data', 'web/public/logos']);
    const message = newJobCount > 0
      ? `Add ${newJobCount} new internship${newJobCount === 1 ? '' : 's'}`
      : 'Refresh job listings';
    git(['commit', '-m', message]);

    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    git(['push', 'origin', branch]);
    log.ok(`Published to the site — Vercel will redeploy within a minute.`);
```

Stage only the two folders that may ever change automatically, so nothing else is swept into an automated commit. Write a message that says what happened, with correct singular and plural. Read the branch name rather than assuming `main`. Push; Vercel is watching the repository and redeploys.

Two guards around it are worth copying. At line 152:

```js
  const status = git(['status', '--porcelain', 'web/public/data', 'web/public/logos'], { allowFail: true });
  if (!status) {
    log.info('Job list is unchanged — nothing to publish.');
    return false;
  }
```

If nothing changed, do not commit — otherwise a program that runs several times a day produces an endless stream of empty commits and pointless redeployments. And at line 175:

```js
  } catch (err) {
    // A publish failure must never fail the scrape; the data is safe locally.
    log.warn(`Could not publish: ${err.message}`);
```

If GitHub is down, the scrape still succeeded and the data is on disk. Publishing is the last and least important step.

Two more platform features worth knowing exist: **preview deployments** — push a branch and get a private URL running that version before it touches production — and **rollback**, because every deploy is kept, so pointing the domain back at the previous build takes seconds and beats fixing forward under pressure.

---

## Chapter summary

- The internet is physical — routers, fibre and submarine cables — and its speed has a floor set by the speed of light in glass.
- Data travels as packets that can arrive out of order, be duplicated or be lost, because IP promises only best-effort delivery.
- An IP address identifies a machine; IPv4 has run out and is stretched with NAT, IPv6 is the 128-bit replacement, and both run side by side.
- DNS resolves names through a chain — stub resolver, recursive resolver, root, TLD, authoritative nameserver — in which nobody holds the whole map.
- `internradar.online` has a real `A` record at `216.198.79.1` and `www` is a `CNAME` to a Vercel-managed name, because a domain apex cannot legally be a CNAME.
- TTL is why DNS changes are slow, so the professional habit is to lower it a day *before* a planned change, never after.
- The `interneadar.in` incident is the worst failure shape — `NOERROR` with zero answers, a domain that exists and answers but has no address — and it broke the share card because `og:image` pointed at a hostname that no longer resolved.
- A port selects which program on a machine receives a packet; TCP builds an ordered, reliable stream on top of IP using a three-way handshake, and UDP deliberately does not.
- HTTPS is HTTP inside TLS, and a certificate proves only that the server controls the domain name — never that the site is trustworthy.
- HTTP is plain text — request line, headers, blank line, body — and its status codes assign blame between client (4xx) and server (5xx).
- This project really returns 200, 204, 308, 400, 403, 404, 405, 422, 429, 500, 502 and 503, and `web/api/tailor.js` deliberately translates Google's codes instead of forwarding them.
- `Cache-Control: public, max-age=0, must-revalidate` means "cache it but check every time", and cheap ETag revalidation turns a 268 KB download into a `304`.
- A CDN serves from a nearby edge: the live headers show `x-vercel-cache: HIT` and `bom1`, Vercel's Mumbai region, which is how a free static site is fast in India.
- The site has no accounts, sessions or cookies of its own — removing a whole class of risk and also every personalised feature — while the watcher depends completely on LinkedIn's `li_at` session cookie.
- The four headers in `web/vercel.json` each stop one specific attack, and the most important header of all, Content-Security-Policy, is honestly missing because the page loads fonts and a PDF library from other hosts.
- The apex 308-redirects to `www`, so every share tag is pinned to the canonical hostname, because not every crawler follows a redirect before reading meta tags.

## Key takeaways

The web is a chain of small, readable steps — name to address, address to connection, connection to text request, text request to text reply — and you can inspect every one from a terminal with `dig` and `curl`. When something breaks, the winning move is almost never to theorise; it is to walk that chain from the outside in until one step returns something you did not expect.

The most expensive failures are the quiet ones. A domain returning `NOERROR` with no records, a share card nobody has looked at in a month, a crawler that silently declines a redirect — none of these produce an error message, and all cost more time than a crash would.

Every architectural choice here is a trade. No cookies means nothing to breach and no saved searches. No build step means no cache-busting filenames and therefore weak caching. No always-on server means no WebSockets and no live updates. None are mistakes; they are prices, paid knowingly, for a site one student can run for free and understand completely.

## Real-life analogy revisited

The letter to the hostel room, with real values in every slot.

You want Intern Radar and do not know its address, so the enquiry chain runs: your resolver asks a root server, which points at the `.online` servers, which point at `ns1.vercel-dns.com`, which finally says `216.198.79.1`. That is the building — and thanks to anycast it is the nearest one, which for me is Mumbai, stamped `bom1` in the reply.

The room number is 443. You knock three times for TCP, again for TLS, and the guard shows an ID card proving it holds this name. Your letter goes inside the sealed envelope: `GET / HTTP/2`, with a `Host` header naming which of the thousands of sites in that building you meant. The reply comes back cut into packets and reassembled — `HTTP/2 200`, 11,207 bytes, `x-vercel-cache: HIT`, meaning the branch office had a photocopy and never walked to the main library at all.

And at the old address, `interneadar.in`, the building still stands and the caretaker still answers the phone. There is simply no room number left to give you. The letters do not bounce. They never arrive.

## Frequently asked questions

**Why can't I just use the IP address and skip DNS?**
You can for a machine with its own dedicated address, but `216.198.79.1` serves thousands of sites, and without a name your request has no `Host` header saying which you want. Addresses change; names do not, and that indirection is DNS's whole purpose. You also cannot get a useful HTTPS certificate for a shared IP address.

**I changed my DNS an hour ago and my friend still sees the old site. Is it broken?**
Almost certainly not. Some resolver cached the old answer and its TTL has not expired. Run `dig yourdomain.com` and read the countdown — that is roughly how much longer that resolver will keep lying. Nothing speeds it up, which is why you lower the TTL a day before a planned change.

**Why redirect the short name to `www`? Isn't that worse?**
It is one extra round trip on the first visit and then never again, because the browser remembers. In exchange you get exactly one canonical address: one URL to index, one for share cards, one in analytics. Having both serve identical content independently splits caches and search ranking and doubles the places a bug can hide.

**Why doesn't the site let me log in and save jobs?**
Because a login means storing passwords or tokens, which means a database of personal data, real breach risk and real legal duties — for a project run free by one student. The site chose to have nothing worth stealing, and the visible cost is exactly the feature you are asking for.

**Is the padlock a sign the site is safe?**
No. It means your connection is encrypted and the server controls the name in the address bar. Phishing sites have valid certificates routinely, because they are free and issued in seconds. Read the hostname, not the icon.

**If `404` means "not found", why did I get a `200` with an error message inside it?**
Because somebody wrote that API badly. It is a common mistake: the code succeeded at *replying*, so it says 200 and hides the failure in the body. That breaks every tool reasoning about status codes — caches, monitoring, retries, and the `res.ok` check at `web/public/app.js:122`.

**Why bolt the current time onto the JSON URL?**
To make the URL unique so nothing anywhere can serve a cached copy. `cache: 'no-store'` handles the browser; the `?t=` also defeats intermediaries that ignore headers. For a board whose promise is freshness, showing yesterday's list is the one unacceptable failure.

**Everyone in my hostel shares one IP. Does that break the rate limit?**
Yes, partly, and knowingly. The limiter counts per IP and NAT puts fifty students behind one, so you share an allowance. The alternative is accounts, which the site deliberately does not have; the code calls its limiter "a speed bump rather than a vault".

## Common beginner mistakes

**1. Assuming a DNS change is instant.** They update a record, refresh, see the old site, and edit it twice more. It seems right because every other change on a computer is immediate. In fact the first change was correct and a cached copy is being served, and the extra edits add confusion or a typo. Fix: change once, verify with `dig @ns1.yourprovider.com yourdomain.com` to ask the authoritative server directly, then wait out the TTL.

**2. Reading "the site is down" as "the server is down".** They restart and redeploy and read application logs, because the application is the part they wrote. On `interneadar.in` the server was perfectly healthy and nothing ever arrived, because no DNS record pointed at it. Fix: walk the chain outward-in — does the name resolve, does the address accept a connection, does HTTP answer — and only then read logs.

**3. Using relative URLs in `og:` tags.** They write `content="/og.jpg"`, which works perfectly in the browser, because relative URLs work everywhere else in HTML. Crawlers silently drop it: no error, no warning, no picture. Fix: absolute `https://` URLs in share tags always — and keep that hostname resolving.

**4. Expecting `fetch` to throw on a 404.** They wrap it in try/catch and assume the catch covers everything, as it would in most languages. `fetch` only rejects when the request could not be *made*; a 404 or 500 is a successful transaction returning an error page, which the code then tries to parse as JSON. Fix: check `res.ok`, exactly as `web/public/app.js:122` does.

**5. Believing the config file describes reality.** They read `vercel.json` and conclude `/data/jobs.json` is cached differently from everything else, because it is the only cache rule in the repository. The platform applies the same value to every static file by default and adds headers — HSTS, CORS — that appear nowhere in the repository. Fix: `curl -I` the live URL; real responses are truth, config is a request.

**6. Serving files with the wrong `Content-Type`.** They add a file type and forget the type table, and the file downloads fine when clicked. It is served as `application/octet-stream`, and with `nosniff` the browser will not render it: images vanish silently. This exact bug is recorded at `web/serve.js:29–30`. Fix: keep the extension map complete and check `content-type` in the network panel when something fails to render.

**7. Putting sensitive values in a URL.** They send a token or email as a query parameter because it is easy to test and visible while debugging. It then lands in browser history, access logs, CDN logs, and — without a strict `Referrer-Policy` — in the `Referer` sent to every site the user clicks through to. Fix: sensitive data goes in a POST body or a header, and set `Referrer-Policy` anyway.

**8. Reaching for WebSockets because "the data should be live".** They add a WebSocket server to a site whose data changes twice a day, because live updates feel more modern than a reload. Now they need an always-on process, reconnection logic, heartbeats and a hosting bill, to deliver two messages a day. Fix: state the freshness requirement in seconds first; if the answer is "within a few hours", a fetch on page load is the correct engineering.

## Interview questions

**1. Walk me through what happens when I type `internradar.online` into a browser.**
The browser resolves the name through DNS: stub resolver, recursive resolver, then root, the `.online` TLD servers, and the authoritative nameservers at Vercel, which return `216.198.79.1`. It opens a TCP connection to port 443 with a three-way handshake, then runs a TLS handshake in which the server presents a certificate proving it controls that name. It sends `GET / HTTP/2` with a `Host` header. The apex answers `308` with `location: https://www.internradar.online/`, so the whole thing repeats for `www`, returns `200` with the HTML, and the browser then fetches the CSS, JavaScript and `/data/jobs.json` and paints.

**2. What does an HTTPS certificate actually prove?**
Only that the server presenting it controls the domain name it was issued for, verified by a certificate authority that checked control — typically by demanding a specific file or DNS record. It proves nothing about the honesty, legality or safety of the site. Certificates are free and issued in seconds, so phishing sites have them too. The padlock means the conversation is private, not that the other party deserves it.

**3. Explain TTL and why a DNS change can take a day.**
Every record carries a TTL telling caching resolvers how long they may reuse the answer. A resolver that cached the old record ten minutes before your change keeps serving it until the TTL expires, and you cannot reach in and purge it. Different users therefore see different answers for a while, which looks like an intermittent bug and is not. The habit is to lower the TTL a day before a planned change and raise it afterwards.

**4. A domain returns `NOERROR` with zero answers. What is wrong, and how does that differ from `NXDOMAIN`?**
`NXDOMAIN` means the name does not exist at all. `NOERROR` with zero answers means the name and zone exist and the nameservers are answering, but there is no record of the type you asked for. That is what happened to `interneadar.in`: the registrar's nameservers still served the zone and the `A` record was gone. It is more dangerous than `NXDOMAIN` because every superficial check looks healthy, and the only symptom is that nothing connects.

**5. Why pin `og:image` to an absolute URL on `www` when the apex redirects there anyway?**
Two reasons, both learned the hard way. Crawlers silently drop relative image URLs, so it must be absolute. And not every crawler follows a redirect before reading meta tags, or keys its cache on the final URL, so pinning everything to one canonical hostname means the card never depends on a redirect. The cost is a hard-coded hostname in the HTML — which is exactly what broke when the old domain lost its records.

**6. What separates 4xx from 5xx, and give an example of translating one into the other.**
4xx means the client sent something wrong; 5xx means the request was valid and the server failed. `web/api/tailor.js` translates deliberately: when Google returns `429`, meaning the site owner's quota is exhausted, it returns `503`, because from the student's side the service is temporarily unavailable and they did nothing wrong. Forwarding the `429` would blame the student for the owner's quota.

**7. Why does a CDN make a site faster, and how would you prove one is working?**
Latency is bounded by the speed of light, so the only way to cut round-trip time is to shorten the distance, and a CDN keeps copies at edges near users. To prove it, read the response headers: on this site `x-vercel-cache: HIT` shows the edge answered without touching origin, `age` shows how long that copy has been cached, and `x-vercel-id: bom1::…` names the Mumbai region that served the request.

**8. This site has no cookies and no login. What does that buy and cost?**
It removes a whole category of risk: no password store, no session tokens to steal, no consent banner, and a footer promise about not storing resumes that is trivially true because there is nowhere to store them. It costs every personalised feature — saved jobs, alerts, seen/unseen state — and it forces the rate limiter to key on IP address, so everyone behind one NAT shares an allowance.

## Exercises

**1. Read the wire.** Run `curl -sSI https://www.internradar.online/` and identify, without looking back: the status code, the protocol version, which headers came from `web/vercel.json`, and which the host added on its own.

**2. Trace a name.** Run `dig internradar.online NS`, then `dig @ns1.vercel-dns.com internradar.online A`. Explain the difference between what your normal resolver said and what the authoritative server said, and why the TTLs differ.

**3. Break it on paper.** In `web/public/index.html`, change `og:image` to the relative path `/og.jpg`. Do not deploy. Write three sentences on why the page would look identical in a browser and why the WhatsApp card would break, then change it back.

**4. Run the site locally.** Start `node web/serve.js`, open `http://localhost:4321`, and use the browser's network panel to find the request for `/data/jobs.json`. Note the query string, status, `content-type` and `cache-control`, then find the exact line in `web/serve.js` that set each.

**5. Provoke real status codes.** Against the live site, obtain a `404` (any nonexistent path), a `405` (`GET /api/tailor`) and a `308` (the apex). For each, say which side was at fault and how the number alone tells you.

**6. Add a header, honestly.** Add an entry to the `headers` block in `web/vercel.json` setting `X-Robots-Tag: noindex` on `/data/(.*)`. Explain what it would do, what it would *not* do, and why the pattern must not be `/(.*)`.

**7. 🔴 Design live updates.** Suppose the requirement becomes: a job posted while a student has the page open must appear within ten seconds. Write a one-page design covering which of polling, SSE and WebSockets you would pick and why; what infrastructure each needs; how it interacts with data arriving via a git push and a CDN redeploy; and the monthly cost and operational burden. Then argue the opposite side.

## Quiz

1. What does an `A` record contain?
2. Your domain returns `status: NOERROR` with `ANSWER: 0` for an `A` query. Does the domain exist? Does the site work?
3. Which port does a browser use by default for an `https://` URL, and how does the server know which of its thousand sites you wanted?
4. Put these in the order they happen on a first visit: TLS handshake, DNS resolution, HTTP request, TCP handshake.
5. What does `Cache-Control: public, max-age=0, must-revalidate` tell a cache to do, and which status code makes revalidation cheap?
6. `web/api/tailor.js` receives a `429` from Google. What does it return to the browser, and why not `429`?
7. Why can `www.internradar.online` be a `CNAME` when `internradar.online` cannot?
8. Name the four headers set in `web/vercel.json` and, in one clause each, what they prevent.
9. In a live response, what do `x-vercel-cache: HIT` and `age: 1362` tell you?
10. What exactly does `?v=2` on the end of the `og:image` URL accomplish?

## Where this leads

You now know how any website reaches any browser, and you have seen this project's real DNS records, headers and status codes. Chapter 3, *Meet Intern Radar*, turns from the network to the thing itself: what the program does, why a student built it, and how two halves — a browser-driving watcher on a Mac and a static site on a CDN — add up to one system with no server in the middle. Chapter 4, *The Shape of the Folder*, then opens the directory file by file, and Chapter 21, *Deployment, Scheduling, and Operations*, returns to the domain and the deploy with everything in between filled in.

---

**Answers to the quiz**

1. An IPv4 address for a name — for example `internradar.online` → `216.198.79.1`.
2. Yes, the domain exists and its nameservers are answering; no, the site does not work, because there is no address record to connect to. This is exactly the `interneadar.in` failure.
3. Port 443. The hostname is sent twice: in TLS's SNI field during the handshake, and in the HTTP `Host` header inside the request.
4. DNS resolution → TCP handshake → TLS handshake → HTTP request.
5. Any cache may store it, but it is stale immediately and must be checked with the server before reuse. A `304 Not Modified`, validated by the `ETag`, makes that check cheap because it sends headers and no body.
6. It returns `503`. Google's `429` means the *site owner's* quota is exhausted; the student did nothing wrong, so a 4xx would blame the wrong party, and the site is temporarily unavailable, which is 503.
7. Because an apex must carry `NS` and `SOA` records, and DNS forbids a name with a `CNAME` from having any other records. Providers work around this with ALIAS or CNAME-flattening, which is why the apex has a real `A` record the host can change.
8. `X-Content-Type-Options: nosniff` — stops MIME sniffing turning a mistyped or uploaded file into executable script. `X-Frame-Options: DENY` — stops clickjacking via an invisible iframe. `Referrer-Policy: strict-origin-when-cross-origin` — stops the full URL leaking to sites the user clicks through to. `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()` — stops the page or anything it embeds using those devices or joining behavioural cohorts.
9. That the CDN edge served the file from its own cache without contacting the origin, and that its copy had been sitting there for 1,362 seconds, about 23 minutes.
10. Nothing, to the server — the same `og.jpg` is served either way. It changes the *cache key*, forcing share-card crawlers that cached the old image under the old URL to fetch it again, which is the only way to invalidate their caches.
