Personal Cheatsheet over the Broken Authentication module from https://academy.hackthebox.com/app/module/80 (I used AI to sum up some part)

The module main takeaways are: 
- Identifying weaknesses in authentication implementations
- Conducting brute-force attacks on authentication
- Identifying and exploiting authentication bypasses
- Identifying and exploiting improper session handling

Authentication : The process of verifying a claim that a system entity or system resource has a certain attribute value
Authorization : approval that is granted to a system entity to access a system resource

Knowledge-based authentication : something u know
"Easiest" to attack : it can be obtained, guessed or brute-forced. ( can come from social engineering and data breaches)

Ownership-based authentication : something you possess
Inherence-based authentication : something you are

== Attacks on Authentication ==
Each factor breaks differently:

- Knowledge-based (password, PIN, secret questions) -> the weak link, and the module's focus.
  Info is static & guessable: brute-force, social engineering, data breaches. If it can be known or guessed, it's broken. Upside: changeable after a leak.

- Ownership-based (hardware token, smart card, NFC badge) -> resistant to phishing & password-guessing (need the physical object).
  But: costly/hard to deploy at scale, and vulnerable to theft or cloning (e.g. cloning an NFC badge in public transport / a cafe) + crypto attacks on the algorithm.

- Inherence-based (fingerprint, face, biometrics) -> convenient (nothing to remamber/carry).
  But if one day leaked by any chance --> irreversible. You can't change your fingerprint, so a leak possibly compromises you for life.

== User Enumeration ==

If The app reveals which usernames are valid by reacting differently to valid vs invalid input : Targets: login, registration, password reset.

Why it matters: a valid-username list narrows brute-force, enables password spraying, and users reuse the same name on FTP/RDP/SSH. Sometimes accepted as a UX tradeoff (e.g. WordPress: "Unknown username" vs "password incorrect for editor"). Fix = login by email, not username.

Method 1 - Differing error messages:
  "Unknown user" (invalid name) vs "Invalid credentials" (valid name, wrong password) -> the difference leaks valid users.
  Fuzz with a username wordlist (SecLists xato-net-10-million-usernames.txt) and filter out the invalid-user response:
    ffuf -w xato-net-10-million-usernames.txt -u http://TARGET/index.php -X POST \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -d "username=FUZZ&password=invalid" -fr "Unknown user"
  (-fr filters responses matching the regex = drops invalid users, keeps valid ones.)

Method 2 - Side channels:
  Even with identical responses, infer validity from extra signals, mainly response timing (DB lookup only happens for valid users -> slower). 

== Brute-Forcing Passwords ==
Once a valid user is known, the password is the only barrier. Weak passwords / reuse make guessing viable. Password spraying = try leaked/common passwords across many accounts.
Key trick: make the wordlist match to the app's password policy so you don't waste tries and times.
  # rockyou (~14M) -> ~150k matching "upper+lower+digit+10 chars"
  grep '[[:upper:]]' rockyou.txt | grep '[[:lower:]]' | grep '[[:digit:]]' | grep -E '.{10}' > custom.txt
  # or in one awk:
  awk 'length($0) >= 10 && /[a-z]/ && /[A-Z]/ && /[0-9]/' rockyou.txt > custom.txt
Brute-force the password, filtering the failure message:
  ffuf -w custom.txt -u http://TARGET/index.php -X POST \
    -H "Content-Type: application/x-www-form-urlencoded" -d "username=admin&password=FUZZ" -fr "Invalid username"
Hit = Status 302 (redirect to dashboard).

== Brute-Forcing Password Reset Tokens ==
Forgot-password flows issue a one-time token (email/SMS). If the token is weak/predictable -> account takeover without knowing the password.
Recon: register, request a reset, inspect the token (e.g. ?token=7351 = only 4 digits = 10,000 values).
  seq -w 0 9999 > tokens.txt        # -w zero-pads to equal length
  ffuf -w tokens.txt -u "http://TARGET/reset_password.php?token=FUZZ" -fr "The provided token is invalid"
To target someone, trigger their reset first so a live token exists, then brute it.

== Brute-Forcing 2FA / OTP Codes ==
2FA = combine two of the 3 factor types (usually password + TOTP). Short numeric OTP + no submission limit = brute-forceable.
Assume creds already known (e.g. phished admin:admin); you reach a 4-digit OTP prompt. Must reuse your session cookie to tie the OTP to your login.
  seq -w 0 9999 > tokens.txt
  ffuf -w tokens.txt -u http://TARGET/2fa.php -X POST \
    -H "Content-Type: application/x-www-form-urlencoded" -b "PHPSESSID=<your-session>" -d "otp=FUZZ" -fr "Invalid 2FA Code"
First 302 = correct OTP; session becomes fully authed, then browse to /admin.php.

== Weak Brute-Force Protection (bypasses) ==
Rate limits: cap requests per time window, usually keyed on source IP. Behind proxies/LB the real IP is unknown, so some apps trust X-Forwarded-For -> attacker can spoof/randomize that header per request to evade the limit entirely (e.g. CVE-2020-35590).
CAPTCHAs: force a human, killing automation. Flaw to look for: the solution leaked in the response (or other client-side validation) -> bot can read and submit it, defeating the CAPTCHA.

== Default Credentials ==
Apps ship with install-time creds (e.g. admin:password) that often never get changed -> instant access. OWASP test item.
Find them: CIRT.net password DB, SecLists Default Credentials, SCADA repo, or just Google "<product> default credentials" (e.g. BookStack = admin@admin.com:password).

== Vulnerable Password Reset (logic bugs) ==
Even with rate limits + CAPTCHA, broken reset logic = account takeover.

Guessable security questions:
  Predefined questions are the same for all users ("mother's maiden name", "city you were born in") and answers are OSINTable / brute-forceable.
  Build a targeted wordlist (e.g. city list) and fuzz the answer, reusing the session cookie that bound the target username:
    cat world-cities.csv | cut -d ',' -f1 > city_wordlist.txt
    ffuf -w city_wordlist.txt -u http://TARGET/security_question.php -X POST \
      -H "Content-Type: application/x-www-form-urlencoded" -b "PHPSESSID=<session>" \
      -d "security_response=FUZZ" -fr "Incorrect response."
  Narrow with OSINT (e.g. grep Germany -> ~1k cities) to shrink the search.

Manipulating the reset request (username in a hidden param):
  If the username travels as a hidden/POST param at each step AND the app doesn't verify it stays consistent, swap it on the final request:
    password=P@$$w0rd&username=admin
  -> answer the security question for your own account, then reset someone else's password. Root cause = no consistent state across the reset flow.

== Auth Bypass via Direct Access ==
If the app only gates access at the login page, request the protected endpoint directly (e.g. /admin.php) from an unauthenticated context.
Classic variant: the check redirects but doesn't stop execution:
  if(!$_SESSION['active']) { header("Location: index.php"); }   // BUG: no exit -> body still rendered
The 302 response still contains the full protected page in its body. Browser obeys the redirect, but you intercept the response in Burp and change "302 Found" -> "200 OK" -> the admin page renders.
Fix = call exit; right after the redirect header.

== Auth Bypass via Parameter Modification ==
Auth/authorization wrongly depends on an HTTP parameter's presence or value (cousin of IDOR).
Example: after login you land on /admin.php?user_id=183.
  - Remove user_id -> kicked to login (even with a valid session) => the param drives auth, not just the cookie.
  - Access /admin.php?user_id=183 directly -> 200, bypasses the login flow.
  - Guess/brute-force an admin's user_id -> view the page with admin privileges (privesc).

Other bypass routes (other modules): PHP type juggling, SQL/other injection, parameter logic bugs.

== Attacking Session Tokens ==
A session token IDs a user's session. Steal/forge a valid one = impersonate that user (session hijacking). Always capture several tokens and analyze them.

Brute-force (weak entropy):
  - Too short (e.g. 4 chars "a5fd") -> brute all values.
  - Long but mostly static: only a few chars change between logins (e.g. 28/32 fixed, 4 random) -> brute just the dynamic part.
  - Incrementing IDs (141233, 141234...) -> just +/- to walk past/future sessions.

Predictable / tamperable (encoded data, no integrity):
  Decode the token; if it's just encoded state, rewrite it.
    echo -n dXNlcj1odGItc3RkbnQ7cm9sZT11c2Vy | base64 -d   ->  user=htb-stdnt;role=user
    echo -n 'user=htb-stdnt;role=admin' | base64           ->  forge admin cookie
  Watch for base64 / hex (xxd -p) / URL encoding. No signature/MAC = forgeable.
  Encrypted tokens: weak crypto can also be forged, but hard blackbox without source.

Session Fixation:
  App doesn't issue a NEW token after login + lets attacker preset it (e.g. ?sid=...).
  Attacker gets a valid token, feeds it to victim (link sets their cookie), victim logs in keeping that token -> attacker already knows it -> hijack.
  Fix = regenerate the session token on successful login.

Improper Session Timeout:
  No/long timeout -> hijacked token stays valid forever. Set timeouts to match sensitivity (minutes for sensitive data).

