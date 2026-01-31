# Security Test Payloads

This directory contains test payloads for penetration testing.

## Warning

These payloads are for **authorized security testing only**. Using them against systems without permission is illegal and unethical.

## Files

| File | Purpose | OWASP Category |
|------|---------|----------------|
| `sqli.txt` | SQL Injection testing | A03:2021 - Injection |
| `xss.txt` | Cross-Site Scripting testing | A03:2021 - Injection |
| `path-traversal.txt` | Path/Directory traversal testing | A01:2021 - Broken Access Control |
| `command-injection.txt` | OS Command Injection testing | A03:2021 - Injection |

## Usage

### With curl

```bash
# Test each payload in a file
while read payload; do
  encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$payload'''))")
  curl -s "https://staging.example.com/search?q=$encoded"
done < sqli.txt
```

### With Burp Suite

1. Load payloads into Intruder
2. Set insertion point on target parameter
3. Run attack

### With OWASP ZAP

1. Import payloads into Fuzzer
2. Select target parameter
3. Start fuzzing

## Extending Payloads

Feel free to add new payloads as new attack vectors are discovered. Keep payloads organized by category and document new additions.

## Resources

- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [PayloadsAllTheThings](https://github.com/swisskyrepo/PayloadsAllTheThings)
- [SecLists](https://github.com/danielmiessler/SecLists)
